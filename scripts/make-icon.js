// Génère assets/icon.png (256x256) : carré arrondi incliné en dégradé violet -> cyan.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256;
const px = Buffer.alloc(S * S * 4);
const a = (12 * Math.PI) / 180;
const c1 = [124, 92, 255], c2 = [34, 211, 238];

// Distance signée à un carré arrondi centré (demi-côté h, rayon r).
const sdBox = (x, y, h, r) => {
  const qx = Math.abs(x) - h + r, qy = Math.abs(y) - h + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const cx = x - S / 2 + 0.5, cy = y - S / 2 + 0.5;
    const rx = cx * Math.cos(a) + cy * Math.sin(a), ry = -cx * Math.sin(a) + cy * Math.cos(a);
    const outer = sdBox(rx, ry, 96, 34);
    const inner = sdBox(rx, ry, 34, 8);
    const d = Math.max(outer, -inner);
    const alpha = Math.min(Math.max(0.5 - d, 0), 1);
    const t = Math.min(Math.max((x + y) / (2 * S), 0), 1);
    const i = (y * S + x) * 4;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(c1[k] + (c2[k] - c1[k]) * t);
    px[i + 3] = Math.round(alpha * 255);
  }
}

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.png'), png);
console.log('assets/icon.png écrit');
