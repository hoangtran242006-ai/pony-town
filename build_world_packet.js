const fs = require('fs');
const path = require('path');

function writeVarInt(val) {
  const bytes = [];
  let v = val >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return Buffer.from(bytes);
}

function writeLen(len) {
  if (len === -1 || len === null || len === undefined) {
    return writeVarInt(0);
  }
  return writeVarInt(len + 1);
}

function writeString(str) {
  if (str === null || str === undefined) {
    return writeLen(-1);
  }
  const buf = Buffer.from(str, 'utf8');
  return Buffer.concat([writeLen(buf.length), buf]);
}

function writeHG(val) {
  if (val < 255) {
    return Buffer.from([val]);
  } else if (val < 65535) {
    const b = Buffer.alloc(3);
    b.writeUInt8(255, 0);
    b.writeUInt16LE(val, 1);
    return b;
  } else {
    const b = Buffer.alloc(7);
    b.writeUInt8(255, 0);
    b.writeUInt16LE(65535, 1);
    b.writeUInt32LE(val, 3);
    return b;
  }
}

function writeObjectId(hexStr = '111122223333444455556666') {
  const buf = Buffer.alloc(12);
  for (let t = 0; t < 3; t++) {
    const chunk = hexStr.substr(t * 8, 8);
    const val = parseInt(chunk, 16) || 0;
    buf.writeUInt32LE(val, t * 4);
  }
  return buf;
}

// Map bits between ojw's c varint and { flags, extra }
function encodeC(flags, extra) {
  let c = 0;
  if (flags & 1) c |= 1;
  if (flags & 128) c |= 32768;
  if (flags & 32768) c |= 512;
  if (flags & 8388608) c |= 1024;
  if (flags & 65536) c |= 4096;
  if (flags & 4) c |= 256;
  if (flags & 2) c |= 2048;
  if (flags & 8) c |= 64;
  if (flags & 64) c |= 8192;
  if (flags & 16) c |= 128;
  if (flags & 2048) c |= 16384;
  if (flags & 8192) c |= 262144;
  if (flags & 0x2000000) c |= 131072;

  if (extra & 2) c |= 8;
  if (extra & 4) c |= 16;
  if (extra & 16) c |= 2;
  if (extra & 8) c |= 4;
  if (extra & 64) c |= 32;
  if (extra & 128) c |= 524288;
  if (extra & 32) c |= 65536;
  if (extra & 1) c |= 1048576;

  return c >>> 0;
}

const OIN_LOOK_KEY = 0x693c688f;

function obfuscateLook(lookBuf) {
  if (!lookBuf) return Buffer.alloc(0);
  const out = Buffer.from(lookBuf);
  let i = 0;
  for (let n = 0; n < out.length; n++) {
    out[n] ^= (OIN_LOOK_KEY >>> i) & 0xff;
    i += 8;
    if (i === 32) i = 0;
  }
  return out;
}

/**
 * Build Opcode 88 packet to spawn a pony entity in the world
 */
function createPonySpawnPacket(entityId, name, lookBuf, x, y, z = 0, state = 0, updateId = 10, isDev = false) {
  const parts = [];

  // Packet Header: Opcode 88 (Create Entity)
  const header = Buffer.alloc(4);
  header.writeUInt32LE(88 | (updateId << 8), 0);
  parts.push(header);

  // ojw entity payload:
  // flags: 1 (position) | 2 (L / state) | 4 (D / type) | 16 (S / look) | 64 (B / name)
  // extra: 16 (uint16 entity id) | 64 (D=1 pony flag, f=0)
  const flags = 1 | 2 | 4 | 16 | 64;
  const extra = 16 | 64;
  const c = encodeC(flags, extra);
  parts.push(writeVarInt(c));

  // Entity ID (uint16 LE)
  const idBuf = Buffer.alloc(2);
  idBuf.writeUInt16LE(entityId, 0);
  parts.push(idBuf);

  // Position: x (uint16 LE), y (uint16 LE)
  const posBuf = Buffer.alloc(4);
  posBuf.writeUInt16LE(Math.round(x), 0);
  posBuf.writeUInt16LE(Math.round(y), 2);
  parts.push(posBuf);

  // 2&flags: L (state / animation) = uint8
  parts.push(Buffer.from([state & 0xff]));

  // 16&flags: S (look data) = length-prefixed bytes (obfuscated with oin so client owi() decodes correctly)
  const obfLook = obfuscateLook(lookBuf);
  parts.push(writeLen(obfLook.length));
  parts.push(obfLook);

  // 64&flags: B (name) = length-prefixed string (with Server-Authoritative [DEV] prefix if isDev)
  let cleanName = name || 'Pony';
  if (isDev) {
    cleanName = cleanName.startsWith('[DEV]') ? cleanName : `[DEV] ${cleanName}`;
  } else {
    cleanName = cleanName.replace(/^\[DEV\]\s*/i, '');
  }
  parts.push(writeString(cleanName));

  // 64&extra: When 64 & extra is set in ojw, it reads 1 byte for lc:
  // let t = HT(e); p.lc = t; void 0 !== p.Cf && (p.Cf ^= t);
  parts.push(Buffer.from([0])); // lc = 0 (no position xor shift)

  return Buffer.concat(parts);
}

/**
 * Build Opcode 89 packet to update an entity's movement, position, velocity, facing direction, and animation state
 */
function createPonyMovePacket(entityId, x, y, vx = 0, vy = 0, state = 0, animState = 0, updateId = 11) {
  const parts = [];

  // Packet Header: Opcode 89 (Update Entity)
  const header = Buffer.alloc(4);
  header.writeUInt32LE(89 | (updateId << 8), 0);
  parts.push(header);

  const hasVelocity = (vx !== 0 || vy !== 0);

  // flags: 1 (position) | 2 (state/facing) | 65536 (animationState)
  const flags = 1 | 2 | 65536;

  // extra: 16 (uint16 entity id) | 64 (f=0 so entity ID resolves correctly in ojw)
  let extra = 16 | 64;
  if (hasVelocity) {
    extra |= (2 | 4);
  }

  const c = encodeC(flags, extra);
  parts.push(writeVarInt(c));

  // Entity ID (uint16 LE)
  const idBuf = Buffer.alloc(2);
  idBuf.writeUInt16LE(entityId, 0);
  parts.push(idBuf);

  // Position: x (uint16 LE), y (uint16 LE)
  const posBuf = Buffer.alloc(4);
  posBuf.writeUInt16LE(Math.round(x) & 0xffff, 0);
  posBuf.writeUInt16LE(Math.round(y) & 0xffff, 2);
  parts.push(posBuf);

  // Velocity (if 6 & extra)
  if (hasVelocity) {
    const vBuf = Buffer.alloc(5);
    vBuf.writeUInt8(255, 0);
    vBuf.writeInt16LE(Math.round(vx), 1);
    vBuf.writeInt16LE(Math.round(vy), 3);
    parts.push(vBuf);
  }

  // State byte (uint8): Flag 2 (bit 1: 0=right, 2=left; bit 2: 4=moving)
  parts.push(Buffer.from([state & 0xff]));

  // Animation State byte (uint8): Flag 65536 (0=stand, 1=walk, 2=trot/run)
  parts.push(Buffer.from([animState & 0xff]));

  return Buffer.concat(parts);
}

/**
 * Build Opcode 136 packet to notify players that an entity started/stopped typing
 */
function createTypingPacket(entityId, isTyping = true, chatType = 0, updateId = 11) {
  const parts = [];

  // Packet Header: Opcode 136
  const header = Buffer.alloc(4);
  header.writeUInt32LE(136 | (updateId << 8), 0);
  parts.push(header);

  // Entity ID (uint16 LE)
  const idBuf = Buffer.alloc(2);
  idBuf.writeUInt16LE(entityId, 0);
  parts.push(idBuf);

  if (isTyping) {
    // 0 = start typing, followed by chatType (uint8)
    parts.push(Buffer.from([0, chatType & 0xff]));
  } else {
    // 1 = stop typing
    parts.push(Buffer.from([1]));
  }

  return Buffer.concat(parts);
}

/**
 * Build Opcode 107 packet to remove an entity from all client maps
 */
function createEntityRemovePacket(entityId, updateId = 12) {
  const parts = [];

  // Packet Header: Opcode 107 (Native Remove Entity in case 107: ojB(game, entityId, 0, false, true))
  const header = Buffer.alloc(4);
  header.writeUInt32LE(107 | (updateId << 8), 0);
  parts.push(header);

  // Entity ID (uint16 LE)
  const idBuf = Buffer.alloc(2);
  idBuf.writeUInt16LE(entityId, 0);
  parts.push(idBuf);

  // Varint (0)
  parts.push(writeVarInt(0));

  // Bool (0 = false)
  parts.push(Buffer.from([0]));

  return Buffer.concat(parts);
}

/**
 * Build Opcode 85 packet to render a chat speech bubble over the pony in the world
 * and display the message in the client's chat log.
 */
function createOpcode85ChatPacket(entityId, name, text, chatType = 0, updateId = 13, isDev = false) {
  const parts = [];

  // Packet Header: Opcode 85
  const header = Buffer.alloc(4);
  header.writeUInt32LE(85 | (updateId << 8), 0);
  parts.push(header);

  // Flags byte: 1 (timestamp) | 2 (name) | (chatType ? 8 : 0)
  const flags = 1 | 2 | (chatType ? 8 : 0);
  parts.push(Buffer.from([flags]));

  // Message string (length-prefixed)
  parts.push(writeString(text));

  // Optional type
  if (chatType) {
    parts.push(Buffer.from([chatType & 0xff]));
  }

  // Entity ID (uint16 LE since bit 4 is not set in flags)
  const idBuf = Buffer.alloc(2);
  idBuf.writeUInt16LE(entityId, 0);
  parts.push(idBuf);

  // Timestamp: uint32 LE in seconds
  const timeBuf = Buffer.alloc(4);
  timeBuf.writeUInt32LE(Math.floor(Date.now() / 1000), 0);
  parts.push(timeBuf);

  // Sender Name
  let cleanName = name || 'Pony';
  if (isDev) {
    cleanName = cleanName.startsWith('[DEV]') ? cleanName : `[DEV] ${cleanName}`;
  }
  parts.push(writeString(cleanName));

  return Buffer.concat(parts);
}

/**
 * Build Opcode 89 packet to update entity expressions (Action 199)
 */
function createExpressionPacket(entityId, expr1, expr2, updateId = 14) {
  const parts = [];

  // Packet Header: Opcode 89
  const header = Buffer.alloc(4);
  header.writeUInt32LE(89 | (updateId << 8), 0);
  parts.push(header);

  // flags: 32768 (expression flags in ojw)
  // extra: 16 | 64
  const flags = 32768;
  const extra = 16 | 64;
  const c = encodeC(flags, extra);
  parts.push(writeVarInt(c));

  // Entity ID (uint16 LE)
  const idBuf = Buffer.alloc(2);
  idBuf.writeUInt16LE(entityId, 0);
  parts.push(idBuf);

  // Expressions: expr1 (uint32 LE), expr2 (uint32 LE)
  const exprBuf = Buffer.alloc(8);
  exprBuf.writeUInt32LE(expr1 >>> 0, 0);
  exprBuf.writeUInt32LE(expr2 >>> 0, 4);
  parts.push(exprBuf);

  return Buffer.concat(parts);
}

/**
 * Build Opcode 87 chat broadcast packet
 */
function createChatPacket(entityId, name, text, chatType = 0, updateId = 13, isDev = false) {
  const parts = [];

  // Packet Header: Opcode 87
  const header = Buffer.alloc(4);
  header.writeUInt32LE(87 | (updateId << 8), 0);
  parts.push(header);

  // Om: sender entity ID (Hj / varint)
  parts.push(writeVarInt(entityId));

  // Yp: target entity ID (Hj / varint)
  parts.push(writeVarInt(0));

  // Zp: sender name (Hq / string)
  let cleanName = name || 'Pony';
  if (isDev) {
    cleanName = cleanName.startsWith('[DEV]') ? cleanName : `[DEV] ${cleanName}`;
  }
  parts.push(writeString(cleanName));

  // _p: is whisper / boolean (HJ: 1 = true, 0 = false)
  parts.push(Buffer.from([0]));

  // message: chat text (Hq / string)
  parts.push(writeString(text));

  // type: chat type (HT: uint8) 0 = say, 1 = party, etc.
  parts.push(Buffer.from([chatType & 0xff]));

  // options: (HT: uint8) 0 = normal
  parts.push(Buffer.from([0]));

  // timestamp: (HQ: uint32 LE in seconds)
  const timeBuf = Buffer.alloc(4);
  timeBuf.writeUInt32LE(Math.floor(Date.now() / 1000), 0);
  parts.push(timeBuf);

  return Buffer.concat(parts);
}

// Standard Authentic Pony Look Palettes for different players
const PONY_LOOK_PRESETS = [
  {
    name: 'Pony',
    look: 'aAB/9EXB0wwgAA' // Authentic Red default pony (as requested)
  },
  {
    name: 'Sunny Gold',
    look: 'aDJIkRmF445AAg' // Golden mane / cheerful yellow
  },
  {
    name: 'Ocean Breeze',
    look: 'acAAhx2b7cQA' // Sky blue pegasus with cyan mane
  },
  {
    name: 'Lavender Mist',
    look: 'aADLy8vg8/EA' // Purple unicorn
  },
  {
    name: 'Forest Meadow',
    look: 'aAA4478s8eDA' // Earth pony with forest green tones
  },
  {
    name: 'Snowdrop',
    look: 'aAP8/f/9/v7+' // Pure white with soft pastel mane
  },
  {
    name: 'Midnight Glow',
    look: 'aAA43t9vbm4+' // Dark charcoal coat with blue accents
  }
];

const SERVER_STARTUP_HASH = 0x5054574e; // 'PTWN' (Non-zero uint32 required to enable native chatlog <chat-log>)

function buildWorldInitPacket(activeChar = null, playerEntityId = 1, spawnX = 3100, spawnY = 2240, isDev = false, serverStartupHash = SERVER_STARTUP_HASH) {
  const parts = [];

  // ==========================================
  // CASE 69: INITIAL WORLD & PLAYER DEFINITION
  // ==========================================
  const h69 = Buffer.alloc(4);
  h69.writeUInt32LE(69 | (1 << 8), 0); // opcode 69, updateId 1
  parts.push(h69);

  // 1. O: oBl(i)
  parts.push(writeVarInt(0)); // t = 0
  const nowSec = Math.floor(Date.now() / 1000);
  const aiBuf = Buffer.alloc(4);
  aiBuf.writeUInt32LE(nowSec, 0);
  parts.push(aiBuf);          // Ai: timestamp
  parts.push(writeVarInt(0)); // A: flags = 0
  
  // Unconditional tail of oBl: rr (string), Fc (uint32), bq (float64)
  parts.push(writeString('')); // rr: Hq(e)
  const fcBuf = Buffer.alloc(4);
  fcBuf.writeUInt32LE(serverStartupHash || SERVER_STARTUP_HASH, 0);
  parts.push(fcBuf);           // Fc: HQ(e) non-zero server startup hash
  const bqBuf = Buffer.alloc(8);
  bqBuf.writeDoubleLE(Date.now(), 0);
  parts.push(bqBuf);           // bq: HW(e)

  // 2. gq: oBu(i) -> Town map type 0: regionsX=26, regionsY=25, dynamic unpaused day/night cycle!
  parts.push(writeVarInt(32));   // n = 32 (dynamic unpaused day cycle!)
  const mapABuf = Buffer.alloc(2);
  mapABuf.writeUInt16LE(0, 0);
  parts.push(mapABuf);         // A: uint16 map flags = 0
  parts.push(Buffer.from([26])); // Ij: regionsX = 26
  parts.push(Buffer.from([25])); // Jj: regionsY = 25
  parts.push(Buffer.from([0]));  // Em: default tile = 0
  parts.push(Buffer.from([1]));  // Cb: season = 1 (Autumn, matches live official game!)
  // Im: oS6(i) -> { x: Hz(0), y: Hz(0), w: HG(6656), h: HG(4800) }
  parts.push(Buffer.from([0]));  // x = 0 (Hz(0) = 0)
  parts.push(Buffer.from([0]));  // y = 0 (Hz(0) = 0)
  parts.push(writeHG(6656));     // w = 6656 pixels (26 regions * 256)
  parts.push(writeHG(4800));     // h = 4800 pixels (25 regions * 192)
  const timeBuf = Buffer.alloc(4);
  const currentDaySec = Math.floor(Date.now() / 1000) % 2880;
  timeBuf.writeUInt32LE(currentDaySec, 0); // Real world unpaused dynamic day/night clock!
  parts.push(timeBuf);           // Ai: time of day (unpaused dynamic)

  // 3. hq: { seenTutorials: HT(i), unlocks: HT(i) }
  parts.push(Buffer.from([255, 255]));

  // 4. iq: HT(i)
  parts.push(Buffer.from([0]));

  // 5. aa: oBh(i) -> player pony data
  const entityIdBuf = Buffer.alloc(2);
  entityIdBuf.writeUInt16LE(playerEntityId, 0);
  parts.push(entityIdBuf);     // K: entity ID
  
  let charName = (activeChar && activeChar.name) || 'Pony';
  if (isDev) {
    charName = charName.startsWith('[DEV]') ? charName : `[DEV] ${charName}`;
  } else {
    charName = charName.replace(/^\[DEV\]\s*/i, '');
  }
  parts.push(writeString(charName)); // B: character name
  
  const fallbackLook = Buffer.from('aAB/9EXB0wwgAA', 'base64');
  const lookBuf = (activeChar && activeChar.lookBuf) || 
    (activeChar && activeChar.look && Buffer.from(activeChar.look, 'base64')) || 
    fallbackLook;
  parts.push(writeLen(lookBuf.length));
  parts.push(lookBuf);         // S: look data
  parts.push(writeObjectId('111122223333444455556666')); // Nd: ObjectId
  parts.push(Buffer.from([0])); // wf: HU(i) -> false (selectedPlushId: 0 = none; non-zero requires 12-byte ObjectId)
  parts.push(Buffer.from([0])); // dq: HJ(i) -> false
  parts.push(Buffer.from([0])); // lc: HT(i) -> 0
  parts.push(Buffer.from([0])); // fq: HJ(i) -> false

  // 6. jq: HJ(i) -> boolean
  parts.push(Buffer.from([0]));

  // 7. sa: HT(i) -> 0 (supporter tier)
  parts.push(Buffer.from([0]));

  // 8. kq: H6(i) -> account settings (empty object: 0 keys)
  parts.push(writeLen(0));

  // 9. lq: HJ(i) -> boolean
  parts.push(Buffer.from([0]));

  // 10. mq: H1(i) -> undefined buffer
  parts.push(writeLen(-1));

  // 11. pi: HF(i) -> uint16 = 0
  const piBuf = Buffer.alloc(2);
  piBuf.writeUInt16LE(0, 0);
  parts.push(piBuf);

  // ==========================================
  // CASE 148: LOAD REGION TILES (ALL 650 REGIONS)
  // ==========================================
  const h148 = Buffer.alloc(4);
  h148.writeUInt32LE(148 | (2 << 8), 0); // opcode 148, updateId 2
  parts.push(h148);

  const hrBuf = Buffer.alloc(4);
  hrBuf.writeInt32LE(404291584, 0); // Rect (0, 0, 25, 24)
  parts.push(hrBuf);

  const regions = [];
  for (let ry = 0; ry < 25; ry++) {
    for (let rx = 0; rx < 26; rx++) {
      regions.push({ rx, ry });
    }
  }

  parts.push(writeLen(regions.length));
  for (const { rx, ry } of regions) {
    const regBuf = Buffer.alloc(2);
    const rVal = ((rx & 31) << 6) | ((ry & 31) << 11);
    regBuf.writeUInt16LE(rVal, 0);
    parts.push(regBuf);
  }

  // ==========================================
  // CASE 147: SUBSCRIBE REGION ENTITIES
  // ==========================================
  const h147 = Buffer.alloc(4);
  h147.writeUInt32LE(147 | (3 << 8), 0); // opcode 147, updateId 3
  parts.push(h147);

  const hr147 = Buffer.alloc(4);
  hr147.writeInt32LE(404291584, 0); // rect (0, 0, 25, 24)
  parts.push(hr147);
  parts.push(writeLen(0));

  // ==========================================
  // CASE 149: LOAD REGION WALLS & BUILDINGS
  // ==========================================
  const h149 = Buffer.alloc(4);
  h149.writeUInt32LE(149 | (4 << 8), 0); // opcode 149, updateId 4
  parts.push(h149);

  const hr149 = Buffer.alloc(4);
  hr149.writeInt32LE(404291584, 0);
  parts.push(hr149);

  parts.push(writeLen(regions.length));
  for (const { rx, ry } of regions) {
    const regBuf = Buffer.alloc(2);
    const rVal = ((rx & 31) << 6) | ((ry & 31) << 11);
    regBuf.writeUInt16LE(rVal, 0);
    parts.push(regBuf);
  }

  // ==========================================
  // CASE 110: SPAWN PLAYER AT SCENIC OPEN PARK PATH
  // ==========================================
  const h110 = Buffer.alloc(4);
  h110.writeUInt32LE(110 | (5 << 8), 0); // opcode 110, updateId 5
  parts.push(h110);

  const spawnXBuf = Buffer.alloc(2);
  spawnXBuf.writeUInt16LE(spawnX, 0);
  parts.push(spawnXBuf);

  const spawnYBuf = Buffer.alloc(2);
  spawnYBuf.writeUInt16LE(spawnY, 0);
  parts.push(spawnYBuf);

  const spawnZBuf = Buffer.alloc(2);
  spawnZBuf.writeInt16LE(0, 0);
  parts.push(spawnZBuf);

  return Buffer.concat(parts);
}

function createStaticEntityPacket(entityId, type, x, y, flipped = false, updateId = 1) {
  const parts = [];
  const header = Buffer.alloc(4);
  header.writeUInt32LE(88 | (updateId << 8), 0);
  parts.push(header);

  const flags = 1 | 2 | 4; // pos | state | type
  const extra = 0; // uint32 ID, not a pony (extra & 64 is 0)
  const c = encodeC(flags, extra);
  parts.push(writeVarInt(c));

  // Entity ID (uint32 LE)
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(entityId, 0);
  parts.push(idBuf);

  // Position: x (uint16 LE), y (uint16 LE)
  const posBuf = Buffer.alloc(4);
  posBuf.writeUInt16LE(Math.round(x), 0);
  posBuf.writeUInt16LE(Math.round(y), 2);
  parts.push(posBuf);

  // State (uint8): bit 2 is flipped
  parts.push(Buffer.from([flipped ? 2 : 0]));

  // Type (uint16 LE)
  const typeBuf = Buffer.alloc(2);
  typeBuf.writeUInt16LE(type, 0);
  parts.push(typeBuf);

  return Buffer.concat(parts);
}

let cachedStaticBatches = null;
let staticEntitiesCount = 0;

function getStaticEntitiesBatches() {
  if (cachedStaticBatches) return cachedStaticBatches;
  const entsPath = path.join(__dirname, 'data/town_map_entities.json');
  if (!fs.existsSync(entsPath)) return [];
  const ents = JSON.parse(fs.readFileSync(entsPath, 'utf8'));
  staticEntitiesCount = ents.length;

  const batches = [];
  let currentBatch = [];
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    const pkt = createStaticEntityPacket(10000 + i, e.type, e.x, e.y, !!e.flipped, (i % 200) + 1);
    currentBatch.push(pkt);
    if (currentBatch.length >= 200 || i === ents.length - 1) {
      batches.push(Buffer.concat(currentBatch));
      currentBatch = [];
    }
  }
  cachedStaticBatches = batches;
  return cachedStaticBatches;
}

module.exports = {
  SERVER_STARTUP_HASH,
  buildWorldInitPacket,
  createPonySpawnPacket,
  createStaticEntityPacket,
  getStaticEntitiesBatches,
  get STATIC_ENTITIES_COUNT() { return staticEntitiesCount || 1737; },
  createPonyMovePacket,
  createTypingPacket,
  createEntityRemovePacket,
  createChatPacket,
  createOpcode85ChatPacket,
  createExpressionPacket,
  PONY_LOOK_PRESETS
};
