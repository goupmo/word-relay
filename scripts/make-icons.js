// Draws the app icon (two letter blocks, ㄱ and A) and writes the SVGs plus PNG sizes into public/.
// Needs sharp only for the PNGs:  npm i --no-save sharp && node scripts/make-icons.js
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INK = '#232a5c';
const stroke = (w) => `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

// Letter blocks and sparkles, drawn on a 512 grid.
const art = `
  <g transform="rotate(-9 176 208)">
    <rect x="64" y="116" width="224" height="224" rx="46" fill="${INK}"/>
    <rect x="64" y="92" width="224" height="224" rx="46" fill="#ffffff" stroke="${INK}" stroke-width="14"/>
    <path d="M120 150 H232 V262" ${stroke(32)}/>
  </g>
  <g transform="rotate(8 340 344)">
    <rect x="232" y="260" width="216" height="216" rx="46" fill="${INK}"/>
    <rect x="232" y="236" width="216" height="216" rx="46" fill="#ffc83d" stroke="${INK}" stroke-width="14"/>
    <path d="M282 400 L340 282 L398 400" ${stroke(30)}/>
    <path d="M304 362 H376" ${stroke(26)}/>
  </g>
  <circle cx="402" cy="112" r="38" fill="#ff5d73" stroke="${INK}" stroke-width="12"/>
  <circle cx="92" cy="430" r="26" fill="#2fd6a0" stroke="${INK}" stroke-width="12"/>`;

const bg = (rx) => `<rect width="512" height="512" rx="${rx}" fill="#7c5cff"/>
  <circle cx="440" cy="60" r="170" fill="#9a82ff"/><circle cx="40" cy="520" r="150" fill="#6a49f0"/>`;

const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${inner}</svg>\n`;
// Rounded icon for tabs and "any" purpose; the maskable one is full-bleed with art kept inside the 80% safe zone.
const icon = svg(`<clipPath id="r"><rect width="512" height="512" rx="112"/></clipPath><g clip-path="url(#r)">${bg(0)}${art}</g>`);
const maskable = svg(`${bg(0)}<g transform="translate(256 256) scale(.74) translate(-256 -256)">${art}</g>`);

writeFileSync(new URL('../public/icon.svg', import.meta.url), icon);
writeFileSync(new URL('../public/icon-maskable.svg', import.meta.url), maskable);
console.log('wrote icon.svg, icon-maskable.svg');

let sharp;
try { sharp = (await import('sharp')).default; } catch { console.log('sharp not installed: PNGs skipped'); process.exit(0); }
const png = (src, size, name) => sharp(Buffer.from(src), { density: 384 }).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
await png(icon, 192, 'icon-192.png');
await png(icon, 512, 'icon-512.png');
await png(maskable, 512, 'icon-maskable-512.png');
await png(maskable, 180, 'apple-touch-icon.png');
console.log('wrote PNGs');
