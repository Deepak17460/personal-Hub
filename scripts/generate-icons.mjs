// Generates PWA PNG icons and the SVG favicon without external dependencies.
// Usage: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed distance to a rounded rectangle centred at (cx, cy).
function roundRect(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}
const cov = (d) => Math.max(0, Math.min(1, 0.5 - d));
const mix = (a, b, t) => Math.round(a + (b - a) * t);
const FROM = [79, 70, 229]; // indigo-600
const TO = [124, 58, 237]; // violet-600

function icon({ maskable }) {
  return (x, y, s) => {
    const t = (x + y) / (2 * s);
    const bg = [mix(FROM[0], TO[0], t), mix(FROM[1], TO[1], t), mix(FROM[2], TO[2], t)];
    const bgA = maskable ? 1 : cov(roundRect(x, y, s / 2, s / 2, s * 0.47, s * 0.47, s * 0.22));
    const scale = maskable ? 0.62 : 0.8;
    const tile = (s * scale) / 2;
    const gap = s * 0.035 * scale;
    let fg = 0;
    for (const [ix, iy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = s / 2 + ix * (tile / 2 + gap) * 0.78;
      const cy = s / 2 + iy * (tile / 2 + gap) * 0.78;
      const half = tile * 0.34;
      const alpha = ix === 1 && iy === -1 ? 0.65 : 1;
      fg = Math.max(fg, cov(roundRect(x, y, cx, cy, half, half, half * 0.35)) * alpha);
    }
    return [mix(bg[0], 255, fg), mix(bg[1], 255, fg), mix(bg[2], 255, fg), Math.round(255 * Math.max(bgA, 0))];
  };
}

writeFileSync(`${OUT}pwa-192.png`, png(192, icon({ maskable: false })));
writeFileSync(`${OUT}pwa-512.png`, png(512, icon({ maskable: false })));
writeFileSync(`${OUT}pwa-maskable-512.png`, png(512, icon({ maskable: true })));
writeFileSync(`${OUT}apple-touch-icon.png`, png(180, icon({ maskable: true })));

writeFileSync(
  `${OUT}favicon.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
  <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#g)"/>
  <rect x="15" y="15" width="15" height="15" rx="5" fill="#fff"/>
  <rect x="34" y="15" width="15" height="15" rx="5" fill="#fff" fill-opacity=".65"/>
  <rect x="15" y="34" width="15" height="15" rx="5" fill="#fff"/>
  <rect x="34" y="34" width="15" height="15" rx="5" fill="#fff"/>
</svg>
`,
);
console.log('Icons written to public/');
