/**
 * Pony Town Binary Protocol Serializer
 * Encodes binary responses for /api1/account, /api2/game/status, /api/game/join
 */

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

function writeObjectId(hexStr = '654321654321654321654321') {
  const buf = Buffer.alloc(12);
  for (let t = 0; t < 3; t++) {
    const chunk = hexStr.substr(t * 8, 8);
    const val = parseInt(chunk, 16) || 0;
    buf.writeUInt32LE(val, t * 4);
  }
  return buf;
}

const DEFAULT_LOOK = Buffer.from('aAB/9EXB0wwgAA', 'base64');

function writePonyCharacter(idHex = '111122223333444455556666', name = 'Pony', tag = '', lookBuf = null) {
  const parts = [];
  // flags: 16 provides tag Pa
  const flags = tag ? 16 : 0;
  const fBuf = Buffer.alloc(2);
  fBuf.writeUInt16LE(flags, 0);
  parts.push(fBuf);

  parts.push(writeObjectId(idHex));
  parts.push(writeString(name));
  if (tag) {
    parts.push(writeString(tag));
  }
  
  const actualLook = lookBuf || DEFAULT_LOOK;
  parts.push(writeLen(actualLook.length));
  parts.push(actualLook);

  return Buffer.concat(parts);
}

function writeServerStatus(onlineCount = 125) {
  const r = 16; // Use oSW server decoder
  const headerR = 27352 ^ r;
  const hash = 12345;
  const headerA = 0x6fe37175 ^ hash;

  const parts = [];
  const b16 = Buffer.alloc(2);
  b16.writeUInt16LE(headerR, 0);
  parts.push(b16);

  const b32 = Buffer.alloc(4);
  b32.writeUInt32LE(headerA, 0);
  parts.push(b32);

  parts.push(writeLen(1)); // 1 server

  // Server 1 (oSW):
  // id, name, webSocketPath, desc, flags, onlinePlayers
  parts.push(writeString('safe-vi'));
  parts.push(writeString('Safe Vietnamese'));
  parts.push(writeString('/ws'));
  parts.push(writeString('Máy chủ an toàn cho người Việt [Safe Vietnamese]'));
  
  const flags = 0;
  parts.push(Buffer.from([158 ^ flags]));

  const pBuf = Buffer.alloc(2);
  pBuf.writeUInt16LE(46812 ^ onlineCount, 0);
  parts.push(pBuf);

  return Buffer.concat(parts);
}

function writeAccountResponse(accountName = 'Hoàng<3', character = null, onlineCount = 125) {
  const parts = [];
  
  // flags: 512 (af: active pony), 1 (fg: birthdate), 4 (sa: supporter)
  const flags = 512 | 1 | 4;
  const fBuf = Buffer.alloc(2);
  fBuf.writeUInt16LE(flags, 0);
  parts.push(fBuf);

  parts.push(writeObjectId('aaaa1111bbbb2222cccc3333'));
  parts.push(writeString(accountName));
  parts.push(writeHG(1));   // zd: 1 character
  parts.push(writeHG(100)); // Qm: 100 character limit
  parts.push(writeHG(0));   // Rm: 0
  parts.push(writeVarInt(0)); // A: roles
  parts.push(writeLen(0));    // Jc: auth providers
  
  const tBuf = Buffer.alloc(4);
  tBuf.writeUInt32LE(150000000, 0);
  parts.push(tBuf); // Mj: created timestamp

  parts.push(writeServerStatus(onlineCount)); // Nj: embedded server status

  parts.push(Buffer.from([240])); // Lh: country index 240 = 'VN'

  // If 1 & flags: fg = HQ(i) (birthdate: year 2000)
  const bdayBuf = Buffer.alloc(4);
  bdayBuf.writeUInt32LE(94668480, 0);
  parts.push(bdayBuf);

  // If 4 & flags: sa = HT(i) (supporter tier 4)
  parts.push(Buffer.from([4]));

  // af: active pony character
  const charId = (character && character.id) || '111122223333444455556666';
  const charName = (character && character.name) || 'Pony';
  const charTag = (character && character.tag) !== undefined ? character.tag : '';
  const charLook = (character && character.lookBuf) || (character && character.look && Buffer.from(character.look, 'base64')) || DEFAULT_LOOK;
  parts.push(writePonyCharacter(charId, charName, charTag, charLook));

  const f64 = Buffer.alloc(8);
  f64.writeDoubleLE(0.0, 0);
  parts.push(f64);

  return Buffer.concat(parts);
}

function writeJoinResponse(token = 'token-live', character = null) {
  const parts = [];
  parts.push(Buffer.from([2])); // type = 2 (Success)
  parts.push(writeString(token));
  
  const charId = (character && character.id) || '111122223333444455556666';
  const charName = (character && character.name) || 'Pony';
  const charTag = (character && character.tag) !== undefined ? character.tag : '';
  const charLook = (character && character.lookBuf) || (character && character.look && Buffer.from(character.look, 'base64')) || DEFAULT_LOOK;
  parts.push(writePonyCharacter(charId, charName, charTag, charLook));

  parts.push(Buffer.from([0])); // plush: false
  parts.push(writeLen(-1));     // friendsData: undefined
  parts.push(Buffer.from([0])); // verboseFriendsData: false

  return Buffer.concat(parts);
}

function parseSavePonyRequest(buf, accountId = 'aaaa1111bbbb2222cccc3333') {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 5) return null;
  try {
    let offset = 0;
    if (buf.length >= 4 && buf[0] === 255 && buf[1] === 58 && buf[2] === 188 && buf[3] === 102) {
      offset = 4;
    }
    
    let idHex = '111122223333444455556666';
    const hasId = buf.readUInt8(offset++);
    if (hasId !== 0 && offset + 12 <= buf.length) {
      let p0 = buf.readUInt32LE(offset).toString(16).padStart(8, '0');
      let p1 = buf.readUInt32LE(offset + 4).toString(16).padStart(8, '0');
      let p2 = buf.readUInt32LE(offset + 8).toString(16).padStart(8, '0');
      idHex = p0 + p1 + p2;
      offset += 12;
    }
    
    function readVarInt() {
      let res = 0, shift = 0;
      while (offset < buf.length) {
        let b = buf.readUInt8(offset++);
        res |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      return res;
    }
    
    let nameLenCode = readVarInt();
    let name = 'Pony';
    if (nameLenCode > 0) {
      let strLen = nameLenCode - 1;
      name = buf.toString('utf8', offset, offset + strLen);
      offset += strLen;
    }
    
    let lookLenCode = readVarInt();
    let encryptedLook = null;
    if (lookLenCode > 0) {
      let lookLen = lookLenCode - 1;
      encryptedLook = buf.subarray(offset, offset + lookLen);
      offset += lookLen;
    }
    
    if (offset < buf.length) offset += 1; // fe
    if (offset < buf.length) {
      let hasAe = buf.readUInt8(offset++);
      if (hasAe !== 0) offset += 12;
    }
    
    let tag = '';
    if (offset < buf.length) {
      let tagLenCode = readVarInt();
      if (tagLenCode > 0) {
        let tagLen = tagLenCode - 1;
        tag = buf.toString('utf8', offset, offset + tagLen);
        offset += tagLen;
      }
    }
    
    if (offset < buf.length) offset += 1; // fd
    if (offset < buf.length) offset += 1; // ge
    if (offset < buf.length) offset += 1; // Be
    
    let lookHash = 0;
    if (offset + 4 <= buf.length) {
      lookHash = buf.readUInt32LE(offset);
      offset += 4;
    }
    
    let rawLook = encryptedLook;
    if (encryptedLook && encryptedLook.length > 0) {
      function Oj(e, t = 0, i = e.length, n = 0) {
        let o = t + i, r = 0xdeadbeef ^ n, a = 0x41c6ce57 ^ n;
        for (let i = t; i < o; i++) {
          let t = e.charCodeAt(i);
          r = Math.imul(r ^ t, 0x9e3779b1);
          a = Math.imul(a ^ t, 0x5f356495);
        }
        return (
          r = Math.imul(r ^ r >>> 16, 0x85ebca6b) ^ Math.imul(a ^ a >>> 13, 0xc2b2ae35),
          0x100000000 * (2097151 & (a = Math.imul(a ^ a >>> 16, 0x85ebca6b) ^ Math.imul(r ^ r >>> 13, 0xc2b2ae35))) + (r >>> 0)
        );
      }
      const accHash = Oj(accountId) >>> 0;
      const key = (0x3b795bbc ^ lookHash ^ accHash) >>> 0;
      let decrypted = Buffer.alloc(encryptedLook.length);
      let kShift = 0;
      for (let o = 0; o < encryptedLook.length; o++) {
        decrypted[o] = encryptedLook[o] ^ ((key >>> kShift) & 0xff);
        kShift += 8;
        if (kShift === 32) kShift = 0;
      }
      rawLook = decrypted;
    }
    
    return {
      id: idHex,
      name,
      tag,
      lookBuf: rawLook,
      rawLookB64: rawLook ? rawLook.toString('base64') : null
    };
  } catch (e) {
    console.error('[PARSE-SAVE-PONY] Error parsing:', e);
    return null;
  }
}

module.exports = {
  writeVarInt,
  writeLen,
  writeString,
  writeHG,
  writeObjectId,
  writePonyCharacter,
  writeServerStatus,
  writeAccountResponse,
  writeJoinResponse,
  parseSavePonyRequest
};
