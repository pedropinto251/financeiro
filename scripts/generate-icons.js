// Generate the Financeiro app icons + favicons from the master SVG.
//   node scripts/generate-icons.js
// Outputs into frontend/app/public/ so Vite copies them to the SPA root.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'frontend', 'app', 'public', 'icon.svg');
const OUT = path.join(__dirname, '..', 'frontend', 'app', 'public');

const PNGS = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

// Build a multi-image .ico that embeds PNG payloads (16 + 32).
function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // type: icon
  header.writeUInt16LE(count, 4); // image count

  const entries = [];
  const datas = [];
  let offset = 6 + count * 16;
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // width
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // height
    entry.writeUInt8(0, 2);  // palette
    entry.writeUInt8(0, 3);  // reserved
    entry.writeUInt16LE(1, 4);   // color planes
    entry.writeUInt16LE(32, 6);  // bits per pixel
    entry.writeUInt32LE(img.buf.length, 8); // size of data
    entry.writeUInt32LE(offset, 12);        // offset
    offset += img.buf.length;
    entries.push(entry);
    datas.push(img.buf);
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

(async () => {
  if (!fs.existsSync(SRC)) throw new Error('Missing ' + SRC);
  const svg = fs.readFileSync(SRC);

  for (const { name, size } of PNGS) {
    await sharp(svg, { density: 384 }).resize(size, size).png().toFile(path.join(OUT, name));
    console.log('✓', name);
  }

  const ico16 = await sharp(svg, { density: 384 }).resize(16, 16).png().toBuffer();
  const ico32 = await sharp(svg, { density: 384 }).resize(32, 32).png().toBuffer();
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), buildIco([
    { size: 16, buf: ico16 },
    { size: 32, buf: ico32 },
  ]));
  console.log('✓ favicon.ico');
})().catch((e) => { console.error(e); process.exit(1); });
