const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const binaryProtocol = require('./binary_protocol');
const worldPacket = require('./build_world_packet');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// Request logger
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// Data files
const CHARACTERS_FILE = path.join(__dirname, 'data/characters.json');
const WORLD_FILE = path.join(__dirname, 'data/world.json');
const SETTINGS_FILE = path.join(__dirname, 'data/settings.json');

// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

// Map Ingestion APIs for 100% Ground-Truth Sync from live web
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
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`Error writing ${file}:`, e.message);
    return false;
  }
}

// ==========================================
// REST & Binary APIs (Pony Town compatibility)
// ==========================================

// Telemetry & Reporting endpoints (prevents net::ERR_ABORTED)
app.post(['/api-raw/apply', '/api-raw/apply-text', '/api/apply-acc', '/api2/game/changelog'], (req, res) => {
  res.status(200).send('OK');
});

// Server status (Binary for official client, JSON fallback)
app.get(['/api/status', '/api2/game/status'], (req, res) => {
  const onlineCount = (wss && wss.clients) ? wss.clients.size : 1;
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
  const count = (wss && wss.clients) ? wss.clients.size : 1;
  res.json([
    { id: 'safe-vi', name: 'Safe Vietnamese', host: '', count, flags: 'safe,pg' }
  ]);
});

// Account info (POST for official client with binary, GET for JSON)
app.all(['/api1/account', '/api/account'], (req, res) => {
  const characters = readJson(CHARACTERS_FILE, []);
  const activeChar = characters[0] || null;
  const onlineCount = (wss && wss.clients) ? wss.clients.size : 1;
  const accepts = req.headers['accept'] || '';

  if (req.method === 'POST' || accepts.includes('application/octet-stream')) {
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(binaryProtocol.writeAccountResponse('Hoàng<3', activeChar, onlineCount));
  }

  res.json({
    id: 'aaaa1111bbbb2222cccc3333',
    name: 'Hoàng<3',
    role: 'player',
    supporter: 4,
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
      console.log(`[PONY-SAVE] Successfully parsed binary save for "${newChar.name}", lookLen=${parsed.lookBuf ? parsed.lookBuf.length : 0}`);
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

// Legacy client route (serves original saved html)
app.get('/legacy', (req, res) => {
  const legacyPath = path.join(__dirname, 'archive/🎮 Pony Town.html');
  if (fs.existsSync(legacyPath)) {
    res.sendFile(legacyPath);
  } else {
    res.redirect('/');
  }
});

// ==========================================
// WebSocket Real-time Game Server (/ws)
// ==========================================
const wss = new WebSocketServer({ server, path: '/ws' });

// In-memory game state
const players = new Map();
const worldData = readJson(WORLD_FILE, {
  width: 120,
  height: 90,
  spawn: { x: 60, y: 45 },
  items: []
});

// World item tracking
let worldItems = [...(worldData.items || [])];

// Friendly NPC ponies to keep the town lively
const npcs = [
  {
    id: 'npc-derpy',
    name: 'Derpy Muffin',
    isNpc: true,
    type: 'pegasus',
    x: 58,
    y: 43,
    vx: 0,
    vy: 0,
    dir: 'down',
    state: 'stand',
    action: 'idle',
    itemInMouth: 'muffin',
    colors: {
      coat: '#a8b2cc',
      mane: '#fde989',
      maneAccent: '#f5dc6f',
      tail: '#fde989',
      tailAccent: '#f5dc6f',
      eyes: '#e5b842',
      hooves: '#959fb8',
      wings: '#a8b2cc',
      horn: '#a8b2cc'
    },
    style: { mane: 'messy', tail: 'fluffy', expression: 'silly', accessory: 'none' }
  },
  {
    id: 'npc-apple',
    name: 'Apple Cobbler',
    isNpc: true,
    type: 'earth',
    x: 53,
    y: 39,
    vx: 0,
    vy: 0,
    dir: 'right',
    state: 'stand',
    action: 'idle',
    itemInMouth: 'apple',
    colors: {
      coat: '#eb9b42',
      mane: '#df3c3c',
      maneAccent: '#c02626',
      tail: '#df3c3c',
      tailAccent: '#c02626',
      eyes: '#5da446',
      hooves: '#c97724',
      wings: '#eb9b42',
      horn: '#eb9b42'
    },
    style: { mane: 'short', tail: 'normal', expression: 'happy', accessory: 'hat' }
  }
];

// Broadcast message to all connected clients
function broadcast(msg, excludeWs = null) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN && !client.isBinaryClient) {
      client.send(data);
    }
  }
}

// Send message to a specific player by name
function sendWhisper(targetName, whisperMsg, senderWs) {
  let found = false;
  const targetLower = targetName.toLowerCase().trim();

  // Search players
  for (const [ws, player] of players.entries()) {
    if (player.name && player.name.toLowerCase().trim() === targetLower) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(whisperMsg));
      }
      found = true;
    }
  }

  // Check NPCs for automated cute responses
  if (!found) {
    const npc = npcs.find(n => n.name.toLowerCase().includes(targetLower));
    if (npc) {
      found = true;
      setTimeout(() => {
        const replies = [
          "Mmm, muffins!",
          "Hello there! Nice weather in Pony Town today!",
          "Did you bring any apples? *boop*",
          "Hehe, let's explore the fountain!",
          "*waves hoof happily*"
        ];
        const reply = replies[Math.floor(Math.random() * replies.length)];
        const npcWhisper = {
          type: 'chat',
          chatType: 'whisper',
          senderId: npc.id,
          senderName: npc.name,
          recipientName: whisperMsg.senderName,
          text: reply,
          time: Date.now()
        };
        if (senderWs.readyState === WebSocket.OPEN) {
          senderWs.send(JSON.stringify(npcWhisper));
        }
      }, 700);
    }
  }

  return found;
}

// NPC random movement loop
setInterval(() => {
  for (const npc of npcs) {
    // 30% chance to move or change action
    if (Math.random() < 0.35) {
      const dirs = ['left', 'right', 'up', 'down', 'idle'];
      const pick = dirs[Math.floor(Math.random() * dirs.length)];
      if (pick === 'idle') {
        npc.vx = 0;
        npc.vy = 0;
        npc.state = 'stand';
        if (Math.random() < 0.15) {
          npc.action = Math.random() < 0.5 ? 'sit' : 'idle';
        }
      } else {
        npc.dir = pick;
        npc.state = 'walk';
        npc.action = 'idle';
        const spd = 0.8;
        npc.vx = pick === 'left' ? -spd : pick === 'right' ? spd : 0;
        npc.vy = pick === 'up' ? -spd : pick === 'down' ? spd : 0;
      }
    }

    // Apply NPC movement within bounds
    if (npc.vx !== 0 || npc.vy !== 0) {
      npc.x = Math.max(45, Math.min(75, npc.x + npc.vx * 0.1));
      npc.y = Math.max(35, Math.min(55, npc.y + npc.vy * 0.1));

      broadcast({
        type: 'move',
        id: npc.id,
        x: npc.x,
        y: npc.y,
        vx: npc.vx,
        vy: npc.vy,
        dir: npc.dir,
        state: npc.state,
        action: npc.action
      });
    }
  }
}, 500);

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  ws.isBinaryClient = true;
  const playerId = 'player-' + Math.random().toString(36).substring(2, 9);
  let playerData = null;

  console.log(`[WS] Client connected: ${playerId} url: ${req ? req.url : ''}`);

  // Send binary world init packet to official Pony Town client!
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) { // 1 = OPEN
      ws.send(Buffer.alloc(0));
    } else {
      clearInterval(pingInterval);
    }
  }, 2000);

  try {
    const characters = readJson(CHARACTERS_FILE, []);
    const activeChar = characters[0] || null;
    const initPkt = worldPacket.buildWorldInitPacket(activeChar);
    ws.send(initPkt);
    console.log(`[WS] Sent initial binary world packet (${initPkt.length} bytes) to ${playerId} with char "${activeChar ? activeChar.name : 'default'}"`);
  } catch (err) {
    console.error('[WS] Error sending init packet:', err.message);
  }

  ws.on('message', (raw, isBinary) => {
    if (isBinary || Buffer.isBuffer(raw)) {
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      console.log(`[WS] Received binary message from ${playerId}: len=${buf.length} hex=${buf.toString('hex')}`);
      // Echo ping back immediately
      if (buf.length === 0) {
        ws.send(Buffer.alloc(0));
      } else if (buf.length >= 2 && buf[0] === 1) {
        console.log(`[WS] Resolving actionWithReturn from ${playerId}, action=${buf[1]}`);
        // Send resolve packet: 255 (resolve), 1 (method 1), 1 (messageId 1), 0 (undefined)
        ws.send(Buffer.from([255, 1, 1, 0]));
      }
      return;
    }
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        // Player joins the town
        case 'join': {
          playerData = {
            id: playerId,
            name: msg.name || 'Wanderer',
            type: msg.ponyType || 'earth',
            x: msg.x || worldData.spawn.x + (Math.random() * 4 - 2),
            y: msg.y || worldData.spawn.y + (Math.random() * 4 - 2),
            vx: 0,
            vy: 0,
            dir: 'down',
            state: 'stand',
            action: 'idle',
            itemInMouth: null,
            colors: msg.colors || {},
            style: msg.style || {}
          };

          players.set(ws, playerData);

          // 1. Send welcoming init packet to joining player
          ws.send(JSON.stringify({
            type: 'init',
            selfId: playerId,
            world: worldData,
            items: worldItems,
            players: [
              ...Array.from(players.values()),
              ...npcs
            ]
          }));

          // 2. Announce to other players
          broadcast({
            type: 'player_joined',
            player: playerData
          }, ws);

          console.log(`[Game] Player "${playerData.name}" joined (${playerId})`);
          break;
        }

        // Movement sync
        case 'move': {
          if (!playerData) return;
          playerData.x = msg.x;
          playerData.y = msg.y;
          playerData.vx = msg.vx || 0;
          playerData.vy = msg.vy || 0;
          playerData.dir = msg.dir || playerData.dir;
          playerData.state = msg.state || playerData.state;

          broadcast({
            type: 'move',
            id: playerId,
            x: playerData.x,
            y: playerData.y,
            vx: playerData.vx,
            vy: playerData.vy,
            dir: playerData.dir,
            state: playerData.state,
            action: playerData.action
          }, ws);
          break;
        }

        // Action/Emote sync (sit, lie, sleep, fly, boop, laugh, cry, etc.)
        case 'action': {
          if (!playerData) return;
          playerData.action = msg.action;
          if (msg.state) playerData.state = msg.state;

          broadcast({
            type: 'action',
            id: playerId,
            action: msg.action,
            state: playerData.state,
            extra: msg.extra
          });
          break;
        }

        // Chat message
        case 'chat': {
          if (!playerData) return;
          const text = (msg.text || '').trim();
          if (!text) return;

          // Check if whisper: /w <name> <msg> or /whisper <name> <msg>
          const whisperMatch = text.match(/^\/(?:w|whisper)\s+([^\s]+)\s+(.+)$/i);
          if (whisperMatch) {
            const targetName = whisperMatch[1];
            const whisperContent = whisperMatch[2];

            const whisperPacket = {
              type: 'chat',
              chatType: 'whisper',
              senderId: playerId,
              senderName: playerData.name,
              recipientName: targetName,
              text: whisperContent,
              time: Date.now()
            };

            const delivered = sendWhisper(targetName, whisperPacket, ws);

            // Send echo back to sender
            ws.send(JSON.stringify({
              ...whisperPacket,
              isEcho: true,
              delivered
            }));
            return;
          }

          // Check for in-chat command emotes
          if (text.startsWith('/')) {
            const cmd = text.toLowerCase().substring(1);
            if (['sit', 'lie', 'sleep', 'fly', 'boop', 'kiss', 'laugh', 'cry', 'yawn'].includes(cmd)) {
              playerData.action = cmd;
              broadcast({
                type: 'action',
                id: playerId,
                action: cmd,
                state: cmd === 'fly' ? 'fly' : playerData.state
              });
              return;
            }
          }

          // Public chat broadcast
          broadcast({
            type: 'chat',
            chatType: 'public',
            senderId: playerId,
            senderName: playerData.name,
            x: playerData.x,
            y: playerData.y,
            text: text,
            time: Date.now()
          });
          break;
        }

        // World Item pickup / drop
        case 'interact': {
          if (!playerData) return;
          const { itemId, action } = msg;

          if (action === 'pickup') {
            const itemIdx = worldItems.findIndex(i => i.id === itemId);
            if (itemIdx !== -1) {
              const item = worldItems[itemIdx];
              worldItems.splice(itemIdx, 1);
              playerData.itemInMouth = item.type;

              broadcast({
                type: 'item_picked',
                itemId,
                playerId,
                itemType: item.type
              });
            }
          } else if (action === 'drop' || action === 'eat') {
            const oldType = playerData.itemInMouth;
            playerData.itemInMouth = null;

            if (action === 'drop' && oldType) {
              const droppedItem = {
                id: 'item-' + Date.now(),
                x: Math.round(playerData.x),
                y: Math.round(playerData.y),
                type: oldType
              };
              worldItems.push(droppedItem);
              broadcast({
                type: 'item_spawned',
                item: droppedItem
              });
            } else if (action === 'eat') {
              broadcast({
                type: 'action',
                id: playerId,
                action: 'eat',
                extra: oldType
              });
            }
          }
          break;
        }
      }
    } catch (e) {
      console.error('[WS] Packet processing error:', e.message);
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    if (playerData) {
      console.log(`[Game] Player "${playerData.name}" left (${playerId})`);
      players.delete(ws);
      broadcast({
        type: 'player_left',
        id: playerId
      });
    }
  });
});

// Start listening
server.listen(PORT, () => {
  console.log(`
======================================================
  🎮 PONY TOWN - Full Project Server is Running!
  ----------------------------------------------------
  Local URL:    http://localhost:${PORT}
  Legacy URL:   http://localhost:${PORT}/legacy
  WebSocket:    ws://localhost:${PORT}/ws
======================================================
  `);
});
