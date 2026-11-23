const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const binaryProtocol = require('./binary_protocol');
const worldPacket = require('./build_world_packet');
const UnoRoomManager = require('./server/uno/uno-room');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// Authentication Secrets & Reserved Names
const MAGIC_SECRET = process.env.MAGIC_SECRET || 'pt_magic_secret_2026_9f82d1c6';
const DEV_SECRET = process.env.DEV_SECRET || 'pt_dev_master_akira_8832';
const RESERVED_NAMES_STR = process.env.RESERVED_NAMES || 'Akira,Hoàng<3,Admin,Developer,Mod,PonyTown';
const RESERVED_NAMES = RESERVED_NAMES_STR.split(',').map(s => s.trim().toLowerCase());

// Request logger
app.use((req, res, next) => {
  if (!req.url.startsWith('/assets/')) {
    console.log(`[HTTP] ${req.method} ${req.url}`);
  }
  next();
});

// Data files
const CHARACTERS_FILE = path.join(__dirname, 'data/characters.json');
const WORLD_FILE = path.join(__dirname, 'data/world.json');
const SETTINGS_FILE = path.join(__dirname, 'data/settings.json');
const SESSIONS_FILE = path.join(__dirname, 'data/sessions.json');
const PLAYERS_FILE = path.join(__dirname, 'data/players.json');

// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-token');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

// Helper to read/write JSON safely
function readJson(file, defaultVal) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`Error reading ${file}:`, e.message);
  }
  return defaultVal;
}

function writeJson(file, data) {
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`Error writing ${file}:`, e.message);
  }
  return false;
}

function getSessions() {
  return readJson(SESSIONS_FILE, {});
}

function saveSessions(sessions) {
  writeJson(SESSIONS_FILE, sessions);
}

function getPlayers() {
  return readJson(PLAYERS_FILE, {});
}

function savePlayers(players) {
  writeJson(PLAYERS_FILE, players);
}

/**
 * Calculate SHA-256 Signature: first 10 hex characters of SHA-256("${name}|${t}|${MAGIC_SECRET}")
 */
function calculateSignature(name, t, secret = MAGIC_SECRET) {
  const hash = crypto.createHash('sha256').update(`${name}|${t}|${secret}`).digest('hex');
  return hash.substring(0, 10);
}

/**
 * Extract session object from Express or WebSocket request
 */
function getSessionFromReq(req) {
  let token = req.headers['x-session-token'];
  if (!token && req.query && (req.query.token || req.query.session_token)) {
    token = req.query.token || req.query.session_token;
  }
  if (!token && req.headers && req.headers.cookie) {
    const match = req.headers.cookie.match(/pt_session=([^;]+)/);
    if (match) token = match[1].trim();
  }
  if (!token && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      token = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('session_token');
    } catch (e) {}
  }
  if (!token) return null;
  const sessions = getSessions();
  return sessions[token] || null;
}

// Map Ingestion APIs for Ground-Truth Sync from live web
app.post('/api/ingest_map', (req, res) => {
  try {
    const data = req.body;
    const file = path.join(__dirname, 'data/extracted_map.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    const entCount = data.entities ? data.entities.length : 0;
    console.log(`[INGEST] Saved ${entCount} entities from official game! PlayerPos:`, data.playerPos);
    res.json({ ok: true, count: entCount });
  } catch (err) {
    console.error('[INGEST] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/extracted_entities', (req, res) => {
  try {
    const file = path.join(__dirname, 'data/extracted_map.json');
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return res.json(data);
    }
  } catch (e) {}
  res.json({ entities: [], playerPos: null });
});

// ==========================================
// Authentication APIs (Magic Link & Dev Auth)
// ==========================================

// Verify Magic Link or Developer Auth
app.post('/api/auth/verify', (req, res) => {
  const { dev_auth, u, t, s } = req.body;
  const sessions = getSessions();
  const players = getPlayers();

  // 1. Developer Authentication via Secret
  if (dev_auth) {
    if (dev_auth !== DEV_SECRET) {
      console.warn(`[AUTH] Failed dev auth attempt with key: "${dev_auth}"`);
      return res.status(403).json({ success: false, error: 'Mã xác thực Developer không chính xác!' });
    }

    const devName = (u && u.trim()) || 'Akira';
    const sessionToken = crypto.randomBytes(16).toString('hex');
    sessions[sessionToken] = {
      token: sessionToken,
      name: devName,
      isDev: true,
      createdAt: Date.now()
    };
    saveSessions(sessions);

    if (!players[devName]) {
      players[devName] = { name: devName, isDev: true, characters: [], createdAt: Date.now() };
    } else {
      players[devName].isDev = true;
    }
    savePlayers(players);

    console.log(`[AUTH] Developer "${devName}" authenticated successfully! Session: ${sessionToken}`);
    return res.json({
      success: true,
      session_token: sessionToken,
      name: devName,
      isDev: true
    });
  }

  // 2. Normal Magic Link Verification
  if (!u || !t || !s) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin xác thực Magic Link (u, t, s)!' });
  }

  const playerName = u.trim();
  const timestamp = Number(t);
  const signature = s.trim();

  // Check 24-hour expiration
  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(timestamp) || Math.abs(nowSec - timestamp) > 86400) {
    return res.status(403).json({ success: false, error: 'Magic Link đã hết hạn (chỉ có hiệu lực trong 24 giờ). Vui lòng nhận link mới!' });
  }

  // Verify SHA-256 signature
  const expectedSig = calculateSignature(playerName, timestamp);
  if (signature.toLowerCase() !== expectedSig.toLowerCase()) {
    console.warn(`[AUTH] Tampered link detected for "${playerName}": received "${signature}", expected "${expectedSig}"`);
    return res.status(403).json({ success: false, error: 'Link không hợp lệ hoặc đã bị chỉnh sửa!' });
  }

  // Check Reserved Names (protect developer and official admin names)
  if (RESERVED_NAMES.includes(playerName.toLowerCase())) {
    console.warn(`[AUTH] Unauthorized attempt to use reserved name "${playerName}" via standard Magic Link`);
    return res.status(403).json({
      success: false,
      error: `Tên nhân vật "${playerName}" đã được bảo vệ độc quyền cho Developer/Admin! Vui lòng dùng tên khác.`
    });
  }

  // Generate 32-char session token and persist
  const sessionToken = crypto.randomBytes(16).toString('hex');
  sessions[sessionToken] = {
    token: sessionToken,
    name: playerName,
    isDev: false,
    createdAt: Date.now()
  };
  saveSessions(sessions);

  // Load or create player profile
  if (!players[playerName]) {
    players[playerName] = {
      name: playerName,
      isDev: false,
      characters: [],
      createdAt: Date.now()
    };
    savePlayers(players);
  }

  console.log(`[AUTH] Player "${playerName}" authenticated via Magic Link! Session: ${sessionToken}`);
  return res.json({
    success: true,
    session_token: sessionToken,
    name: playerName,
    isDev: false
  });
});

// Restore session from localStorage token
app.post('/api/auth/session', (req, res) => {
  const { session_token, name } = req.body;
  if (!session_token) {
    return res.status(400).json({ success: false, error: 'Thiếu session_token' });
  }

  const sessions = getSessions();
  const session = sessions[session_token];
  if (!session) {
    return res.status(401).json({ success: false, error: 'Phiên đăng nhập đã hết hạn hoặc không tồn tại' });
  }

  // If client provided an updated character name, update session
  if (name && name.trim() && !RESERVED_NAMES.includes(name.trim().toLowerCase())) {
    session.name = name.trim();
    sessions[session_token] = session;
    saveSessions(sessions);
  }

  res.json({
    success: true,
    session_token: session.token,
    name: session.name,
    isDev: !!session.isDev
  });
});

// Static Asset Aliases & Serving
app.use('/assets/styles', express.static(path.join(__dirname, 'public/assets/style')));
app.use('/assets/style', express.static(path.join(__dirname, 'public/assets/style')));
app.use('/assets/scripts', express.static(path.join(__dirname, 'public/assets/scripts'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use('/assets/binary', express.static(path.join(__dirname, 'public/assets/binary')));
app.use('/assets/images', express.static(path.join(__dirname, 'public/assets/images')));
app.use('/images', express.static(path.join(__dirname, 'public/assets/images')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/assets/music', express.static(path.join(__dirname, 'public/assets/music')));
app.use('/assets/locales', express.static(path.join(__dirname, 'public/assets/locales')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/archive', express.static(path.join(__dirname, 'archive')));
app.use(['/%F0%9F%8E%AE%20Pony%20Town_files', '/🎮 Pony Town_files'], express.static(path.join(__dirname, 'archive/🎮 Pony Town_files')));

// Direct Icon and Logo routes
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public/favicon.ico')));
app.get('/apple-touch-icon.png', (req, res) => res.sendFile(path.join(__dirname, 'public/apple-touch-icon.png')));
app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, 'public/logo.png')));

// Global active player sessions map
let nextEntityId = 10;
const activeSessions = new Map(); // ws -> session
const unoRooms = new UnoRoomManager();

const UNO_TABLES = [
  {
    id: 'plaza-north',
    name: 'North Plaza UNO Table',
    x: 3064,
    y: 2240,
    seats: [
      { x: 3024, y: 2240 },
      { x: 3104, y: 2240 },
      { x: 3064, y: 2200 },
      { x: 3064, y: 2280 }
    ]
  }
];

function allocateEntityId() {
  let attempts = 0;
  while (attempts++ < 1000) {
    nextEntityId = (nextEntityId % 60000) + 1;
    if (nextEntityId < 10) nextEntityId = 10;
    let inUse = false;
    for (const session of activeSessions.values()) {
      if (session.entityId === nextEntityId) {
        inUse = true;
        break;
      }
    }
    if (!inUse) return nextEntityId;
  }
  return ++nextEntityId;
}

// Scenic spawn meadow center (Market Square Town Plaza with trees, buildings, houses)
const SPAWN_CENTER = { x: 3100, y: 2240 };

// ==========================================
// REST & Binary APIs (Pony Town compatibility)
// ==========================================

// Telemetry & Reporting endpoints
app.post(['/api-raw/apply', '/api-raw/apply-text', '/api/apply-acc', '/api2/game/changelog'], (req, res) => {
  res.status(200).send('OK');
});

// Server status
app.get(['/api/status', '/api2/game/status'], (req, res) => {
  const onlineCount = (wss && wss.clients) ? Math.max(1, wss.clients.size) : 1;
  const accepts = req.headers['accept'] || '';
  if (accepts.includes('application/octet-stream') || !accepts.includes('application/json')) {
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(binaryProtocol.writeServerStatus(onlineCount));
  }
  res.json({
    status: 'online',
    version: 'v0.129.9-alpha',
    playersOnline: onlineCount,
    servers: [
      { id: 'safe-vi', name: 'Safe Vietnamese', count: onlineCount, flags: 'safe,pg' }
    ]
  });
});

// Server list
app.get(['/api/servers', '/api/refetch-servers'], (req, res) => {
  const count = (wss && wss.clients) ? Math.max(1, wss.clients.size) : 1;
  res.json([
    { id: 'safe-vi', name: 'Safe Vietnamese', host: '', count, flags: 'safe,pg' }
  ]);
});

// Account info (Session-aware)
app.all(['/api1/account', '/api/account'], (req, res) => {
  const session = getSessionFromReq(req);
  const characters = readJson(CHARACTERS_FILE, []);
  const activeChar = characters[0] || null;
  const onlineCount = (wss && wss.clients) ? Math.max(1, wss.clients.size) : 1;
  const accepts = req.headers['accept'] || '';

  const isDev = session ? !!session.isDev : false;
  const playerName = session ? session.name : 'Hoàng<3';
  const displayName = isDev ? `[DEV] ${playerName}` : playerName;

  if (req.method === 'POST' || accepts.includes('application/octet-stream')) {
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(binaryProtocol.writeAccountResponse(displayName, activeChar, onlineCount));
  }

  res.json({
    id: isDev ? 'dev-00000000000000000001' : (session ? 'usr-' + session.token.slice(0, 16) : 'aaaa1111bbbb2222cccc3333'),
    name: displayName,
    role: isDev ? 'developer' : 'player',
    supporter: isDev ? 4 : 0,
    characterLimit: 100,
    character: activeChar
  });
});

// Game Join endpoint
app.post(['/api/game/join'], (req, res) => {
  const characters = readJson(CHARACTERS_FILE, []);
  const activeChar = characters[0] || null;
  const token = 'local-token-' + Date.now();
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(binaryProtocol.writeJoinResponse(token, activeChar));
});

// Character list
app.get('/api/account-characters', (req, res) => {
  const characters = readJson(CHARACTERS_FILE, []);
  res.json(characters);
});

// Save character
app.post(['/api/pony/save', '/api/account/character'], (req, res) => {
  const characters = readJson(CHARACTERS_FILE, []);
  let newChar = req.body;
  const isBinaryReq = Buffer.isBuffer(req.body);
  const accepts = req.headers['accept'] || '';

  if (isBinaryReq) {
    const parsed = binaryProtocol.parseSavePonyRequest(req.body);
    if (parsed) {
      newChar = {
        id: parsed.id,
        name: parsed.name,
        tag: parsed.tag,
        look: parsed.rawLookB64,
        lookBuf: parsed.lookBuf
      };
      console.log(`[PONY-SAVE] Successfully parsed binary save for "${newChar.name}"`);
    }
  }

  if (newChar && !newChar.id) {
    newChar.id = 'pony-' + Date.now();
  }

  if (newChar) {
    const existingIdx = characters.findIndex(c => c.id === newChar.id || (c.name && c.name === newChar.name));
    if (existingIdx !== -1) {
      characters[existingIdx] = { ...characters[existingIdx], ...newChar };
    } else {
      characters.unshift(newChar);
    }
    writeJson(CHARACTERS_FILE, characters);

    // Sync updated character name to player's active session
    const session = getSessionFromReq(req);
    if (session && newChar.name) {
      session.name = newChar.name;
      const sessions = getSessions();
      if (sessions[session.token]) {
        sessions[session.token].name = newChar.name;
        sessions[session.token].characterId = newChar.id;
        saveSessions(sessions);
      }
    }
  }

  const activeChar = characters[0] || newChar || null;

  if (isBinaryReq || accepts.includes('application/octet-stream')) {
    res.setHeader('Content-Type', 'application/octet-stream');
    const id = (activeChar && activeChar.id) || '111122223333444455556666';
    const name = (activeChar && activeChar.name) || 'Pony';
    const tag = (activeChar && activeChar.tag) !== undefined ? activeChar.tag : '';
    const lookBuf = (activeChar && activeChar.lookBuf) || (activeChar && activeChar.look && Buffer.from(activeChar.look, 'base64')) || Buffer.from('aAB/9EXB0wwgAA', 'base64');
    return res.send(binaryProtocol.writePonyCharacter(id, name, tag, lookBuf));
  }

  res.json({ success: true, character: activeChar, characters });
});

// Remove character
app.post(['/api/pony/remove', '/api/account/character/remove'], (req, res) => {
  const { id } = req.body;
  let characters = readJson(CHARACTERS_FILE, []);
  characters = characters.filter(c => c.id !== id);
  writeJson(CHARACTERS_FILE, characters);
  res.json({ success: true, characters });
});

// World state
app.get('/api/world', (req, res) => {
  const world = readJson(WORLD_FILE, {});
  res.json(world);
});

// Settings
app.get('/api/settings', (req, res) => {
  res.json(readJson(SETTINGS_FILE, {}));
});

app.post(['/api/settings', '/api/update-settings'], (req, res) => {
  const current = readJson(SETTINGS_FILE, {});
  const updated = { ...current, ...req.body };
  writeJson(SETTINGS_FILE, updated);
  res.json({ success: true, settings: updated });
});

// ==========================================
// WebSocket Real-time Multiplayer Server (/ws)
// ==========================================
const wss = new WebSocketServer({ server, path: '/ws' });

setInterval(() => {
  for (const room of unoRooms.rooms.values()) {
    if (!room.engine || room.engine.status !== 'playing') continue;
    const timeoutResult = room.engine.timeout();
    if (timeoutResult) unoRooms.sync(room);

    if (room.engine.status !== 'playing') continue;
    const current = room.engine.players[room.engine.current];
    if (!current?.bot) continue;
    const top = room.engine.getTop();
    const card = current.hand.find(c => {
      if (c.type === 'wild') return true;
      if (c.type === 'wild4') return room.engine.wildDrawFourIsLegal(current, room.engine.currentColor);
      return c.color === room.engine.currentColor ||
        (c.type === 'number' && top.type === 'number' && c.value === top.value) ||
        (c.type !== 'number' && c.type === top.type);
    });
    try {
      if (card) {
        const color = card.type === 'wild' || card.type === 'wild4'
          ? (['red', 'yellow', 'green', 'blue'].findIndex(x => x === card.color) >= 0 ? card.color : 'red')
          : card.color;
        room.engine.play(current.id, card.id, color);
      } else {
        room.engine.draw(current.id);
      }
      unoRooms.sync(room);
    } catch (_) {}
  }
}, 1000);

let packetUpdateCounter = 20;
function nextUpdateId() {
  return (++packetUpdateCounter) & 0xffffff;
}

// 16 directional vectors matching client oON table
const MOVE_DIRECTIONS = [
  { x: 0, y: -24 },   // 0: Up
  { x: 16, y: -24 },  // 1: Up-Right
  { x: 32, y: -24 },  // 2: Up-Right
  { x: 32, y: -12 },  // 3: Right-Up
  { x: 32, y: 0 },    // 4: Right
  { x: 32, y: 12 },   // 5: Right-Down
  { x: 32, y: 24 },   // 6: Down-Right
  { x: 16, y: 24 },   // 7: Down-Right
  { x: 0, y: 24 },    // 8: Down
  { x: -16, y: 24 },  // 9: Down-Left
  { x: -32, y: 24 },  // 10: Down-Left
  { x: -32, y: 12 },  // 11: Left-Down
  { x: -32, y: 0 },   // 12: Left
  { x: -32, y: -12 }, // 13: Left-Up
  { x: -32, y: -24 }, // 14: Up-Left
  { x: -16, y: -24 }  // 15: Up-Left
];

wss.on('connection', (ws, req) => {
  // Retrieve player session
  let authSession = getSessionFromReq(req);
  const isDev = authSession ? !!authSession.isDev : false;

  // Stale connection cleanup (prevent duplicate sessions / ghost entities on reconnect)
  if (authSession && authSession.token) {
    for (const [existingWs, existingSession] of activeSessions.entries()) {
      if (existingSession.token === authSession.token && existingWs !== ws) {
        console.log(`[WS] Closing stale connection for session token ${authSession.token}`);
        try { existingWs.close(); } catch (e) {}
        activeSessions.delete(existingWs);
      }
    }
  }

  const assignedEntityId = allocateEntityId();
  const sessionIndex = activeSessions.size;

  // Pick unique authentic pony look & name preset
  const preset = worldPacket.PONY_LOOK_PRESETS[sessionIndex % worldPacket.PONY_LOOK_PRESETS.length];
  const characters = readJson(CHARACTERS_FILE, []);
  const activeChar = characters[0] || null;

  let charLookBuf = Buffer.from(preset.look, 'base64');
  if (sessionIndex === 0 && activeChar) {
    charLookBuf = (activeChar.lookBuf && Buffer.isBuffer(activeChar.lookBuf)) ? activeChar.lookBuf :
      (activeChar.look ? Buffer.from(activeChar.look, 'base64') : Buffer.from(preset.look, 'base64'));
  }
  
  let charName = (authSession && authSession.name) || ((sessionIndex === 0 && activeChar && activeChar.name) ? activeChar.name : `${preset.name}`);
  if (isDev) {
    charName = charName.startsWith('[DEV]') ? charName : `[DEV] ${charName}`;
  } else {
    charName = charName.replace(/^\[DEV\]\s*/i, '');
  }

  // Slight jitter around Market Square spawn
  const spawnX = SPAWN_CENTER.x + (sessionIndex % 4) * 24 - 36;
  const spawnY = SPAWN_CENTER.y + Math.floor(sessionIndex / 4) * 20;

  const session = {
    ws,
    token: authSession ? authSession.token : null,
    entityId: assignedEntityId,
    name: charName,
    lookBuf: charLookBuf,
    x: spawnX,
    y: spawnY,
    z: 0,
    state: 0,
    isDev: isDev
  };

  activeSessions.set(ws, session);
  console.log(`[WS] Client connected: entityId=${assignedEntityId}, name="${charName}", isDev=${isDev}, pos=(${spawnX}, ${spawnY}) (total active: ${activeSessions.size})`);

  // Heartbeat ping interval
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(Buffer.alloc(0));
    } else {
      clearInterval(pingInterval);
    }
  }, 2500);

  // 1. Send world init packet to new client (initializes WebGL map and assigns self entityId)
  try {
    const initChar = { name: charName, lookBuf: charLookBuf };
    const initPkt = worldPacket.buildWorldInitPacket(initChar, assignedEntityId, spawnX, spawnY, isDev);
    ws.send(initPkt);
    console.log(`[WS] Sent initial binary world packet (${initPkt.length} bytes, isDev=${isDev}) to entity ${assignedEntityId}`);
  } catch (err) {
    console.error('[WS] Error sending world init packet:', err.message);
  }

  // 2. Synchronize existing players and static map entities to this new client (Opcode 88)
  // Give new client 200ms to complete initial packet processing before spawning entities
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      // Send authentic town map entities (houses, trees, stalls, lanterns, benches)
      const staticBatches = worldPacket.getStaticEntitiesBatches();
      for (const batch of staticBatches) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(batch);
        }
      }
      console.log(`[WS] Synced ${worldPacket.STATIC_ENTITIES_COUNT} authentic map entities to entity ${assignedEntityId}`);

      for (const [otherWs, otherSession] of activeSessions.entries()) {
        if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
          const spawnOther = worldPacket.createPonySpawnPacket(
            otherSession.entityId,
            otherSession.name,
            otherSession.lookBuf,
            otherSession.x,
            otherSession.y,
            otherSession.z,
            otherSession.state || 0,
            nextUpdateId(),
            otherSession.isDev
          );
          ws.send(spawnOther);
          console.log(`[WS] Synced existing entity ${otherSession.entityId} ("${otherSession.name}") to new entity ${session.entityId}`);
        }
      }
    }
  }, 200);

  // 3. Broadcast new player spawn (Opcode 88) to all existing clients
  const spawnNewPkt = worldPacket.createPonySpawnPacket(
    session.entityId,
    session.name,
    session.lookBuf,
    session.x,
    session.y,
    session.z,
    0,
    nextUpdateId(),
    session.isDev
  );
  for (const [otherWs, otherSession] of activeSessions.entries()) {
    if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
      otherWs.send(spawnNewPkt);
      console.log(`[WS] Broadcasted new entity ${session.entityId} ("${session.name}") to entity ${otherSession.entityId}`);
    }
  }

  // Message handler
  ws.on('message', (raw, isBinary) => {
    try {
      if (!isBinary) {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
        if (!msg || typeof msg.type !== 'string') return;

        const player = { id: String(session.entityId), name: session.name, ws };
        const send = (payload) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(payload));

        if (msg.type === 'uno_tables') {
          const nearbyTables = UNO_TABLES.map(table => {
            let seatIndex = -1;
            let seatDistance = Infinity;
            table.seats.forEach((seat, index) => {
              const distance = Math.hypot(seat.x - session.x, seat.y - session.y);
              if (distance < seatDistance) {
                seatDistance = distance;
                seatIndex = index;
              }
            });
            return {
              ...table,
              nearbySeatIndex: seatDistance <= 120 ? seatIndex : null,
              rooms: unoRooms.list(table.id)
            };
          });
          send({
            type: 'uno_tables',
            tables: nearbyTables
          });
          return;
        }

        if (msg.type === 'uno_create') {
          const table = UNO_TABLES.find(t => t.id === msg.tableId);
          if (!table) return send({ type: 'uno_error', error: 'Unknown UNO table' });
          const room = unoRooms.create(table.id, { ...player, seatIndex: Number.isInteger(msg.seatIndex) ? msg.seatIndex : 0 }, msg.settings || {});
          unoRooms.sync(room);
          send({ type: 'uno_created', roomId: room.id, tableId: table.id });
          unoRooms.broadcast(room, 'uno_rooms', { rooms: unoRooms.list(table.id) });
          return;
        }

        if (msg.type === 'uno_join') {
          try {
            const room = unoRooms.join(msg.roomId, { ...player, seatIndex: Number.isInteger(msg.seatIndex) ? msg.seatIndex : undefined });
            unoRooms.sync(room);
            unoRooms.broadcast(room, 'uno_rooms', { rooms: unoRooms.list(room.tableId) });
          } catch (err) {
            send({ type: 'uno_error', error: err.message });
          }
          return;
        }

        if (msg.type === 'uno_leave') {
          const room = unoRooms.byPlayer(player.id);
          if (room) {
            unoRooms.leave(room.id, player.id);
            unoRooms.sync(room);
          }
          return;
        }

        if (msg.type === 'uno_start') {
          const room = unoRooms.byPlayer(player.id);
          console.log(`[UNO] Start request player=${player.id} room=${room?.id || 'none'}`);
          try {
            if (!room) throw new Error('Join a room first');
            unoRooms.start(room.id, player.id);
            console.log(`[UNO] Started room=${room.id} players=${room.players.length}`);
            unoRooms.sync(room);
          } catch (err) {
            console.log(`[UNO] Start error: ${err.message}`);
            send({ type: 'uno_error', error: err.message });
          }
          return;
        }

        if (msg.type === 'uno_play') {
          const room = unoRooms.byPlayer(player.id);
          try {
            if (!room?.engine) throw new Error('Game is not running');
            room.engine.play(player.id, msg.cardId, msg.color);
            unoRooms.sync(room);
          } catch (err) {
            send({ type: 'uno_error', error: err.message });
          }
          return;
        }

        if (msg.type === 'uno_draw') {
          const room = unoRooms.byPlayer(player.id);
          try {
            if (!room?.engine) throw new Error('Game is not running');
            room.engine.draw(player.id);
            unoRooms.sync(room);
          } catch (err) {
            send({ type: 'uno_error', error: err.message });
          }
          return;
        }

        if (msg.type === 'uno_pass') {
          const room = unoRooms.byPlayer(player.id);
          try {
            if (!room?.engine) throw new Error('Game is not running');
            room.engine.pass(player.id);
            unoRooms.sync(room);
          } catch (err) {
            send({ type: 'uno_error', error: err.message });
          }
          return;
        }

        if (msg.type === 'uno_call') {
          const room = unoRooms.byPlayer(player.id);
          try {
            if (!room?.engine) throw new Error('Game is not running');
            room.engine.callUno(player.id);
            unoRooms.sync(room);
          } catch (err) {
            send({ type: 'uno_error', error: err.message });
          }
          return;
        }

        if (msg.type === 'uno_catch') {
          const room = unoRooms.byPlayer(player.id);
          try {
            if (!room?.engine) throw new Error('Game is not running');
            room.engine.catchUno(player.id, msg.targetId);
            unoRooms.sync(room);
          } catch (err) {
            send({ type: 'uno_error', error: err.message });
          }
          return;
        }

        if (msg.type === 'uno_invite') {
          const target = [...activeSessions.entries()].find(([, s]) => s.entityId === Number(msg.targetId));
          if (target) {
            const room = unoRooms.byPlayer(player.id);
            target[0].send(JSON.stringify({
              type: 'uno_invite',
              from: session.name,
              roomId: room?.id,
              tableId: room?.tableId
            }));
          }
          return;
        }

        return;
      }

      if (isBinary || Buffer.isBuffer(raw)) {
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);

        // Ping
        if (buf.length === 0) {
          ws.send(Buffer.alloc(0));
          return;
        }

        // Method 2: move(t) -> 13 bytes total: [2, o_u32, r_u32, a_u32]
        if (buf.length === 13 && buf[0] === 2) {
          const o = buf.readUInt32LE(1);
          const r = buf.readUInt32LE(5);
          const a = buf.readUInt32LE(9);

          // Decode position
          const origX_Y = (o ^ 0xb8f2782c) >>> 0;
          const x = (origX_Y & 0xffff);
          const y = (origX_Y >>> 16);

          // Decode direction and animation state
          const decodedR = (r ^ 0x816c41fa) >>> 0;
          const dir = decodedR & 0xf;
          const animState = (decodedR >>> 4) & 0xff;

          // Calculate velocity from direction and animationState
          let vx = 0, vy = 0;
          if (animState > 0) {
            const speed = (animState === 2 ? 256 : 128);
            const vec = MOVE_DIRECTIONS[dir % 16];
            vx = (vec.x * speed) | 0;
            vy = (vec.y * speed) | 0;
          }

          // Facing direction: bit 1 (value 2): in Pony Town engine, 2 = facing right (default), 0 = facing left
          // (Client logic: b = oiB(vx) which is true for vx > 0 (right) -> state |= 2; false for vx < 0 (left) -> state &= ~2)
          let state = session.state || 0;
          if (vx > 0 || x > session.x || (dir >= 1 && dir <= 7)) {
            state |= 2;
          } else if (vx < 0 || x < session.x || (dir >= 9 && dir <= 15)) {
            state &= ~2;
          }

          // Moving flag: bit 2 (value 4) is required by client oEu(e) to keep legs/movement animating
          if (animState > 0 || vx !== 0 || vy !== 0) {
            state |= 4;
          } else {
            state &= ~4;
          }

          session.x = x;
          session.y = y;
          session.vx = vx;
          session.vy = vy;
          session.state = state;
          session.animState = animState;

          // Broadcast movement with velocity, state, and animationState via Opcode 89
          const movePkt = worldPacket.createPonyMovePacket(
            session.entityId,
            x,
            y,
            vx,
            vy,
            state,
            animState,
            nextUpdateId()
          );
          for (const [otherWs] of activeSessions.entries()) {
            if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
              otherWs.send(movePkt);
            }
          }
          return;
        }

        // Method 1: actionWithReturn -> resolve packet: 255 (resolve), 1 (method 1), messageId, 0 (undefined)
        if (buf.length >= 2 && buf[0] === 1) {
          ws.send(Buffer.from([255, 1, 1, 0]));
          return;
        }

        // Method 0: action -> e.g. chat say (194), typing indicator (195), expressions (199)
        if (buf.length >= 2 && buf[0] === 0) {
          const actionType = buf[1];

          // Action 195: Typing indicator
          // Format: [0, 195, chatType(u8), targetEntityId(u16 LE)]
          if (actionType === 195) {
            const chatType = buf.length > 2 ? buf.readUInt8(2) : 0;
            const typingPkt = worldPacket.createTypingPacket(session.entityId, true, chatType, nextUpdateId());
            for (const [otherWs] of activeSessions.entries()) {
              if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
                otherWs.send(typingPkt);
              }
            }

            // Auto-clear typing indicator after 6s if inactive
            if (session.typingTimeout) clearTimeout(session.typingTimeout);
            session.typingTimeout = setTimeout(() => {
              const stopPkt = worldPacket.createTypingPacket(session.entityId, false, 0, nextUpdateId());
              for (const [otherWs] of activeSessions.entries()) {
                if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
                  otherWs.send(stopPkt);
                }
              }
              session.typingTimeout = null;
            }, 6000);
            return;
          }

          // Action 194: Say message
          // Format: [0, 194, chatType(u8), messageId(varint), targetEntityId(u16 LE), strLen+1(varint), text(utf8), options(u8)]
          if (actionType === 194) {
            if (session.typingTimeout) {
              clearTimeout(session.typingTimeout);
              session.typingTimeout = null;
            }
            // Dismiss typing bubble on other clients
            const stopPkt = worldPacket.createTypingPacket(session.entityId, false, 0, nextUpdateId());
            for (const [otherWs] of activeSessions.entries()) {
              if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
                otherWs.send(stopPkt);
              }
            }
            try {
              let offset = 2;
              const chatType = buf.readUInt8(offset); offset += 1;
              
              // messageId varint
              while (offset < buf.length && (buf[offset] & 0x80)) offset++;
              offset++; // last byte of messageId
              
              // targetEntityId (u16 LE)
              offset += 2;
              
              // text string (varint length + utf8)
              let strLen = 0, shift = 0;
              while (offset < buf.length) {
                const b = buf[offset++];
                strLen |= (b & 0x7f) << shift;
                if (!(b & 0x80)) break;
                shift += 7;
              }
              strLen -= 1; // actual string byte length
              
              if (strLen > 0 && offset + strLen <= buf.length) {
                const text = buf.toString('utf8', offset, offset + strLen);
                console.log(`[CHAT] ${session.name} (${session.entityId}): "${text}"`);

                // In-world Speech Bubble & Chat Log entry (Opcode 85)
                const bubblePkt = worldPacket.createOpcode85ChatPacket(
                  session.entityId, session.name, text, chatType, nextUpdateId(), session.isDev
                );

                for (const [otherWs] of activeSessions.entries()) {
                  if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
                    otherWs.send(bubblePkt);
                  }
                }
              }
            } catch (e) {
              console.error('[WS] Error parsing chat action:', e.message);
            }
            return;
          }

          // Action 199: Expressions / Emotes
          // Format: [0, 199, expr1(u32 LE), expr2(u32 LE), options(u8)]
          if (actionType === 199 && buf.length >= 10) {
            try {
              const expr1 = buf.readUInt32LE(2);
              const expr2 = buf.readUInt32LE(6);
              console.log(`[EXPR] ${session.name} (${session.entityId}): expr1=${expr1}, expr2=${expr2}`);

              const exprPkt = worldPacket.createExpressionPacket(session.entityId, expr1, expr2, nextUpdateId());
              for (const [otherWs] of activeSessions.entries()) {
                if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
                  otherWs.send(exprPkt);
                }
              }
            } catch (e) {
              console.error('[WS] Error parsing expression action:', e.message);
            }
            return;
          }
          return;
        }
      }
    } catch (err) {
      console.error('[WS] Error in message handler:', err.message);
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    if (session.typingTimeout) {
      clearTimeout(session.typingTimeout);
    }
    const unoRoom = unoRooms.byPlayer(String(session.entityId));
    if (unoRoom) {
      unoRooms.markDisconnect(unoRoom.id, String(session.entityId));
      unoRooms.sync(unoRoom);
    }
    activeSessions.delete(ws);
    console.log(`[WS] Client disconnected: entityId=${session.entityId}, name="${session.name}" (remaining: ${activeSessions.size})`);

    // Broadcast typing removal and entity removal to all remaining clients
    const stopTypingPkt = worldPacket.createTypingPacket(session.entityId, false, 0, nextUpdateId());
    const removePkt = worldPacket.createEntityRemovePacket(session.entityId, nextUpdateId());
    for (const [otherWs] of activeSessions.entries()) {
      if (otherWs.readyState === WebSocket.OPEN) {
        otherWs.send(stopTypingPkt);
        otherWs.send(removePkt);
      }
    }
  });
});

// Start listening
server.listen(PORT, () => {
  console.log(`
======================================================
  🎮 PONY TOWN - Multiplayer Game Server Running!
  ----------------------------------------------------
  Local URL:    http://localhost:${PORT}
  WebSocket:    ws://localhost:${PORT}/ws
  Short Domain: https://pt.akira-dev.me
======================================================
  `);
});
