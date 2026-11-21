const fs = require('fs');

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

function buildWorldInitPacket(activeChar = null) {
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
  fcBuf.writeUInt32LE(0, 0);
  parts.push(fcBuf);           // Fc: HQ(e)
  const bqBuf = Buffer.alloc(8);
  bqBuf.writeDoubleLE(Date.now(), 0);
  parts.push(bqBuf);           // bq: HW(e)

  // 2. gq: oBu(i) -> Town map type 0: regionsX=26, regionsY=25, dynamic unpaused day/night cycle!
  parts.push(writeVarInt(32));   // n = 32 (bit 32: distinct Ij/Jj, bit 8 = 0: DYNAMIC UNPAUSED DAY CYCLE!)
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
  entityIdBuf.writeUInt16LE(1, 0);
  parts.push(entityIdBuf);     // K: entity ID = 1
  
  const charName = (activeChar && activeChar.name) || 'Scaramouche';
  parts.push(writeString(charName)); // B: character name
  
  const fallbackLook = Buffer.from('aDJIkRmFak3sSWdqyCZnReTohqVF5eX5thDpKAc41TARGZ/kUzusvD/kIk4n5SK////qx7wmo7aGpBw4LCAhhsAAIoAFeD0Fd///NN3Bv3XFbrlW6oA', 'base64');
  const lookBuf = (activeChar && activeChar.lookBuf) || 
    (activeChar && activeChar.look && Buffer.from(activeChar.look, 'base64')) || 
    fallbackLook;
  parts.push(writeLen(lookBuf.length));
  parts.push(lookBuf);         // S: look data
  parts.push(writeObjectId('111122223333444455556666')); // Nd: ObjectId
  parts.push(Buffer.from([0])); // wf: HU(i) -> false (no active tag)
  parts.push(Buffer.from([0])); // dq: HJ(i) -> false
  parts.push(Buffer.from([0])); // lc: HT(i) -> 0
  parts.push(Buffer.from([0])); // fq: HJ(i) -> false

  // 6. jq: HJ(i) -> boolean
  parts.push(Buffer.from([0]));

  // 7. sa: HT(i) -> 0 (normal player)
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
  // Rect: minX=0, minY=0, maxX=25, maxY=24 -> creates all 650 regions in e.Mc!
  hrBuf.writeInt32LE(404291584, 0);
  parts.push(hrBuf);

  const regions = [];
  for (let ry = 0; ry < 25; ry++) {
    for (let rx = 0; rx < 26; rx++) {
      regions.push({ rx, ry });
    }
  }

  parts.push(writeLen(regions.length)); // writeLen (encoded as len + 1 so H$ returns len)
  for (const { rx, ry } of regions) {
    const regBuf = Buffer.alloc(2);
    // ojC: r = (rx << 6) | (ry << 11) | extra(0) -> loads cachedMap tiles!
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

  parts.push(writeLen(0)); // 0 dynamic entity batches (static entities from cachedMap)

  // ==========================================
  // CASE 149: LOAD REGION WALLS & BUILDINGS (ALL 650 REGIONS)
  // ==========================================
  const h149 = Buffer.alloc(4);
  h149.writeUInt32LE(149 | (4 << 8), 0); // opcode 149, updateId 4
  parts.push(h149);

  const hr149 = Buffer.alloc(4);
  hr149.writeInt32LE(404291584, 0); // rect (0, 0, 25, 24) -> sets 0x40000000
  parts.push(hr149);

  parts.push(writeLen(regions.length));
  for (const { rx, ry } of regions) {
    const regBuf = Buffer.alloc(2);
    // extra = 0 -> loads walls from cachedMaps
    const rVal = ((rx & 31) << 6) | ((ry & 31) << 11);
    regBuf.writeUInt16LE(rVal, 0);
    parts.push(regBuf);
  }

  // ==========================================
  // CASE 110: SPAWN PLAYER AT TOWN CENTER
  // ==========================================
  const h110 = Buffer.alloc(4);
  h110.writeUInt32LE(110 | (5 << 8), 0); // opcode 110, updateId 5
  parts.push(h110);

  // Market square central plaza coords: world (3250, 2260) (open cobblestone walkway beside kiosk)
  const spawnX = Buffer.alloc(2);
  spawnX.writeUInt16LE(3250, 0);
  parts.push(spawnX);

  const spawnY = Buffer.alloc(2);
  spawnY.writeUInt16LE(2260, 0);
  parts.push(spawnY);

  const spawnZ = Buffer.alloc(2);
  spawnZ.writeInt16LE(0, 0);
  parts.push(spawnZ);

  return Buffer.concat(parts);
}

module.exports = {
  buildWorldInitPacket
};
