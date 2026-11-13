// Generates extension/icons/icon{16,32,48,128}.png with no dependencies.
// Usage: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../extension/icons/', import.meta.url));
const BLUE = [47, 111, 222];
const WHITE = [255, 255, 255];
const FOLD = [190, 212, 250];

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Colour of the design at normalised point (x, y) in [0,1]; null = transparent.
function shade(x, y) {
  if (!inRoundRect(x, y, 0.04, 0.04, 0.96, 0.96, 0.2)) return null;
  const [px0, py0, px1, py1, fold] = [0.27, 0.17, 0.73, 0.83, 0.14];
  const inPage = x >= px0 && x <= px1 && y >= py0 && y <= py1;
  if (inPage) {
    const dx = x - (px1 - fold);
    const dy = y - py0;
    if (dx > 0 && dy < dx) return BLUE; // cut corner
    if (dx > 0 && dy < fold) return FOLD; // folded flap
    const lines = [[0.42, 0.65], [0.53, 0.65], [0.64, 0.56]];
    for (const [ly, lx1] of lines) {
      if (y >= ly && y <= ly + 0.045 && x >= 0.35 && x <= lx1) return BLUE;
    }
    return WHITE;
  }
  return BLUE;
}

function render(size) {
  const SS = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (a) { raw[o] = r / a; raw[o + 1] = g / a; raw[o + 2] = b / a; }
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(size, size, raw);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) writeFileSync(`${OUT}icon${size}.png`, render(size));
console.log('icons written to', OUT);
