#!/usr/bin/env node
/**
 * scan-assets.mjs — Quét asset (ảnh, font, JS/CSS) tìm file quá nặng / sai format /
 * thiếu tối ưu, kèm lệnh fix cụ thể (sharp-cli, avifenc, pyftsubset...).
 *
 * Usage:
 *   node scan-assets.mjs <site-dir> [--json]
 *
 * Exit code: 1 nếu có CRITICAL, 0 nếu không. Thuần Node >= 18, không dependency.
 * Đọc kích thước ảnh bằng parser header (PNG/JPEG/GIF); WebP/AVIF fallback qua `sips` (macOS).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const root = path.resolve(args.filter((a) => !a.startsWith('--'))[0] || '.');

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Không tìm thấy thư mục: ${root}`);
  process.exit(2);
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', '.cache', 'coverage']);
const issues = [];
const add = (severity, domain, file, message, fix) =>
  issues.push({ severity, domain, file: path.relative(root, file) || '(site)', message, fix });

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out);
    } else out.push(p);
  }
  return out;
}
const allFiles = walk(root);
const kb = (f) => fs.statSync(f).size / 1024;
const fmt = (n) => (n >= 1024 ? `${(n / 1024).toFixed(1)}MB` : `${Math.round(n)}KB`);

// ---------- image dimensions (header parsers, no deps) ----------
function imageDims(file) {
  const buf = fs.readFileSync(file);
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) // PNG
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG: tìm SOFn
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (buf.slice(0, 3).toString() === 'GIF')
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    // WebP/AVIF/khác: thử sips (macOS)
    const out = execSync(`sips -g pixelWidth -g pixelHeight "${file}" 2>/dev/null`, { encoding: 'utf8' });
    const w = +out.match(/pixelWidth: (\d+)/)?.[1];
    const h = +out.match(/pixelHeight: (\d+)/)?.[1];
    if (w && h) return { w, h };
  } catch { /* bỏ qua — không đọc được dims */ }
  return null;
}

// ---------- images ----------
const IMG_RE = /\.(png|jpe?g|gif|webp|avif)$/i;
const images = allFiles.filter((f) => IMG_RE.test(f));
let totalImg = 0;
for (const f of images) {
  const size = kb(f);
  totalImg += size;
  const ext = path.extname(f).slice(1).toLowerCase();
  const dims = imageDims(f);
  const dimStr = dims ? `${dims.w}×${dims.h}` : '?×?';
  const rel = path.relative(root, f);
  const base = `${dimStr}, ${fmt(size)}`;

  const fixResize = dims && dims.w > 2560
    ? `npx sharp-cli resize 1920 -i "${rel}" -o optimized/ && ` : '';
  const fixAvif = `npx sharp-cli -i "${rel}" -o "${rel.replace(/\.\w+$/, '.avif')}" -f avif` +
    ` (hoặc WebP: -f webp; giữ <picture> fallback nếu cần)`;

  if (size > 1024)
    add('CRITICAL', 'images', f, `Ảnh ${base} — quá nặng cho web (>1MB)`, fixResize + fixAvif);
  else if (size > 500)
    add('HIGH', 'images', f, `Ảnh ${base} — nên < 200-300KB`, fixAvif);
  else if (size > 200)
    add('MEDIUM', 'images', f, `Ảnh ${base} — cân nhắc nén thêm`, fixAvif);

  if (dims && dims.w > 2560 && size <= 1024)
    add('MEDIUM', 'images', f, `Ảnh rộng ${dims.w}px — hiếm màn hình nào cần >1920-2560px; resize + srcset`, fixResize.replace(/ && $/, ''));

  if ((ext === 'png') && size > 300 && dims && dims.w > 800)
    add('HIGH', 'images', f, `PNG ${base} khả năng là ảnh photo/screenshot — PNG chỉ hợp icon/đồ họa phẳng; AVIF/WebP giảm ~85-95%`, fixAvif);
}

// ---------- fonts ----------
const fonts = allFiles.filter((f) => /\.(ttf|otf|eot|woff2?)$/i.test(f));
for (const f of fonts) {
  const size = kb(f);
  const ext = path.extname(f).slice(1).toLowerCase();
  const rel = path.relative(root, f);
  const woff2Fix = `pyftsubset "${rel}" --unicodes="U+0000-00FF,U+0102-0103,U+0110-0111,U+1EA0-1EF9,U+20AB" --flavor=woff2 --output-file="${rel.replace(/\.\w+$/, '.woff2')}"  # subset Latin + tiếng Việt (cần: pip install fonttools brotli)`;
  if (ext === 'ttf' || ext === 'otf' || ext === 'eot')
    add(size > 500 ? 'CRITICAL' : 'HIGH', 'fonts', f,
      `Font ${ext.toUpperCase()} ${fmt(size)} — web chỉ nên ship WOFF2 (nén Brotli, nhỏ hơn ~30-50%${size > 500 ? '; file này còn cần SUBSET vì quá nặng' : ''})`,
      woff2Fix);
  else if (ext === 'woff')
    add('MEDIUM', 'fonts', f, `WOFF ${fmt(size)} — nâng lên WOFF2`, woff2Fix);
  else if (size > 200)
    add('MEDIUM', 'fonts', f, `WOFF2 ${fmt(size)} vẫn nặng — chưa subset? (font đủ glyph CJK/icon thường 1-20MB; subset Latin+Việt còn ~20-50KB)`, woff2Fix);
}

// ---------- @font-face trong CSS ----------
for (const f of allFiles.filter((x) => /\.css$/i.test(x))) {
  const css = fs.readFileSync(f, 'utf8');
  const faces = css.match(/@font-face\s*{[^}]*}/gi) ?? [];
  for (const face of faces) {
    const fam = face.match(/font-family\s*:\s*([^;]+);/i)?.[1]?.trim() ?? '?';
    if (!/font-display\s*:/i.test(face))
      add('HIGH', 'fonts', f, `@font-face "${fam}" thiếu font-display → FOIT (chữ vô hình khi chờ font)`, `Thêm "font-display: swap;" (hoặc optional) vào block @font-face`);
    if (/\.(ttf|otf)['")]/i.test(face) && !/woff2/i.test(face))
      add('HIGH', 'fonts', f, `@font-face "${fam}" chỉ có nguồn TTF/OTF, không có WOFF2`, `Convert sang WOFF2 rồi src: url(...woff2) format('woff2')`);
  }
}

// ---------- font preload (absence check hay bị sót) ----------
const htmlFiles = allFiles.filter((f) => /\.html?$/i.test(f));
const localFontUsed = fonts.length > 0;
if (localFontUsed && htmlFiles.length && !htmlFiles.some((f) => /<link[^>]+rel\s*=\s*["']preload["'][^>]+as\s*=\s*["']font["']/i.test(fs.readFileSync(f, 'utf8'))))
  add('LOW', 'fonts', htmlFiles[0], 'Có self-host font nhưng không trang nào preload font critical', '<link rel="preload" href="/fonts/x.woff2" as="font" type="font/woff2" crossorigin> cho 1-2 font above-the-fold');

// ---------- JS/CSS weight ----------
for (const f of allFiles.filter((x) => /\.(js|mjs|css)$/i.test(x))) {
  const size = kb(f);
  if (size < 150) continue;
  const content = fs.readFileSync(f, 'utf8');
  const minified = size * 1024 / content.split('\n').length > 400;
  add(size > 400 ? 'HIGH' : 'MEDIUM', 'performance', f,
    `${path.extname(f).slice(1).toUpperCase()} ${fmt(size)}${minified ? '' : ' CHƯA minify'} — kiểm tra có thực sự được dùng không (grep usage / DevTools Coverage / npx knip với source repo)`,
    minified ? 'Xác nhận usage; cân nhắc code-split/xóa' : 'Minify (esbuild/terser/cssnano) + purge unused');
}

// ---------- tổng trọng lượng ----------
const totalAll = allFiles.reduce((s, f) => s + kb(f), 0);
const fontTotal = fonts.reduce((s, f) => s + kb(f), 0);
const summary = `Tổng site: ${fmt(totalAll)} | Ảnh: ${fmt(totalImg)} (${images.length} file) | Font: ${fmt(fontTotal)} (${fonts.length} file)`;
if (totalImg + fontTotal > 3 * 1024)
  add('CRITICAL', 'performance', root, `${summary} — trang production nên < 2-3MB tổng tài nguyên tải lần đầu`, 'Xử lý các mục images/fonts bên trên trước');

// ---------- output ----------
const ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
issues.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || String(a.file).localeCompare(String(b.file)));

if (asJson) {
  console.log(JSON.stringify({ root, summary, issues }, null, 2));
} else {
  console.log(`\n=== scan-assets: ${summary} — ${issues.length} vấn đề ===\n`);
  for (const i of issues) {
    console.log(`[${i.severity}] (${i.domain}) ${i.file}\n    ${i.message}`);
    if (i.fix) console.log(`    FIX: ${i.fix}`);
  }
  const counts = issues.reduce((m, i) => ((m[i.severity] = (m[i.severity] ?? 0) + 1), m), {});
  console.log(`\nTổng: ${['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => `${s}: ${counts[s] ?? 0}`).join(' | ')}`);
}
process.exit(issues.some((i) => i.severity === 'CRITICAL') ? 1 : 0);
