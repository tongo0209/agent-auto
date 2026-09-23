#!/usr/bin/env node
/**
 * fe-gate — lưới chặn "lỗi thiếu-vắng" trên output build FE.
 *
 * Bắt loại lỗi mà build, console browser và design-checker đều TRƯỢT: thứ được khai báo
 * nhưng KHÔNG TỒN TẠI (font trỏ vào hư không, ảnh 404, font design bị bỏ quên).
 * Ca đã trả giá: GW-654 clone khung cũ → thiếu 8 font của design mới; build 0 error,
 * console sạch, 2 checker PASS, browser fallback im lặng.
 *
 * Chạy:
 *   node tools/fe-gate.mjs <dist-dir> [--design <dir>] [--json <file>] [--lessons <file>] [--strict] [--quiet]
 *
 * Exit code: 0 = sạch · 1 = có ERROR (hoặc có WARN khi --strict) · 2 = sai tham số.
 * Không dependency ngoài (cdn-source cấm thêm dep; script phải chạy được ở mọi repo).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/* ─────────────────────────── tham số ─────────────────────────── */

const argv = process.argv.slice(2);
const opts = { dist: '', design: '', json: '', lessons: '', strict: false, quiet: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--design') opts.design = argv[++i];
  else if (a === '--json') opts.json = argv[++i];
  else if (a === '--lessons') opts.lessons = argv[++i];
  else if (a === '--strict') opts.strict = true;
  else if (a === '--quiet') opts.quiet = true;
  else if (a.startsWith('-')) die(`Tham số lạ: ${a}`);
  else if (!opts.dist) opts.dist = a;
  else die(`Chỉ nhận 1 dist-dir (đã có "${opts.dist}", lại thấy "${a}")`);
}
if (!opts.dist) die('Thiếu <dist-dir>. Ví dụ: node tools/fe-gate.mjs products/cfl/landing/2026-x/dist');

const DIST = path.resolve(opts.dist);
if (!isDir(DIST)) die(`Không phải folder: ${DIST}`);
const DESIGN = opts.design ? path.resolve(opts.design) : '';
if (DESIGN && !isDir(DESIGN)) die(`--design không phải folder: ${DESIGN}`);

function die(msg) {
  process.stderr.write('fe-gate: ' + msg + '\n');
  process.exit(2);
}

/* ─────────────────────────── tiện ích fs ─────────────────────────── */

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache']);

/** Liệt kê file đệ quy (theo đuôi nếu truyền) */
function walk(root, exts = null, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, exts, out);
    } else if (!exts || exts.includes(path.extname(e.name).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(DIST, p) || path.basename(p);
const size = (p) => {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
};
function maxMtime(root, exts = null) {
  let max = 0;
  for (const f of walk(root, exts)) {
    const m = fs.statSync(f).mtimeMs;
    if (m > max) max = m;
  }
  return max;
}

/* ─────────────────────────── phát hiện ref ─────────────────────────── */

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, https:, data:, blob:, //cdn…
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;

/**
 * Ref bỏ qua: ngoài mạng, data URI, anchor SVG, biến CSS, template placeholder.
 * Phải BỎ DẤU NHÁY trước khi test — `url("data:image/svg+xml,…")` vào đây còn nguyên `"`
 * thì regex `^data:` trượt và inline SVG bị báo 404 oan (đã dính 2 ca ở GW-654).
 */
function skippable(url) {
  const u = url.trim().replace(/^['"]|['"]$/g, '').trim();
  if (!u || u.startsWith('#')) return true;
  if (EXTERNAL.test(u)) return true;
  if (u.includes('var(') || u.includes('${') || u.includes('{{') || u.includes('<%')) return true;
  return false;
}

/** Bỏ query/hash, giải %20 */
function cleanUrl(url) {
  const u = url.trim().replace(/^['"]|['"]$/g, '').split('#')[0].split('?')[0];
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
}

/**
 * Ref → đường dẫn thật trên đĩa.
 * `/x.png` = gốc site: thử DIST rồi các folder cha của file (dist có thể là subfolder site).
 */
function resolveRef(url, fromFile) {
  const u = cleanUrl(url);
  if (u.startsWith('/')) {
    const candidates = [path.join(DIST, u), path.join(path.dirname(fromFile), u)];
    return { candidates, url: u };
  }
  return { candidates: [path.resolve(path.dirname(fromFile), u)], url: u };
}

/* ─────────────────────────── bóc CSS ─────────────────────────── */

const FONT_KEYWORDS = new Set([
  'inherit', 'initial', 'unset', 'revert', 'revert-layer', 'normal', 'none', 'auto',
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif',
  'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica', 'helvetica neue',
  'arial', 'arial black', 'tahoma', 'verdana', 'georgia', 'times', 'times new roman',
  'courier', 'courier new', 'menlo', 'monaco', 'consolas', 'sf mono', 'sf pro text',
  'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji',
  'microsoft yahei', 'pingfang sc', 'hiragino sans gb', 'wenquanyi micro hei',
  'liberation sans', 'dejavu sans', 'inter', 'sans', 'small-caption', 'icon', 'menu',
  'message-box', 'status-bar', 'caption',
]);

/** Bóc @font-face: family + danh sách src url */
function parseFontFaces(css, file) {
  const faces = [];
  const re = /@font-face\s*\{([^}]*)\}/gi;
  let m;
  while ((m = re.exec(css))) {
    const body = m[1];
    const fam = /font-family\s*:\s*([^;]+)/i.exec(body);
    const family = fam ? cleanFamily(fam[1]) : '';
    const srcs = [];
    const srcDecl = /src\s*:\s*([^;]+)/i.exec(body);
    if (srcDecl) {
      let u;
      const ure = /url\(\s*([^)]+?)\s*\)/gi;
      while ((u = ure.exec(srcDecl[1]))) srcs.push(cleanUrl(u[1]));
    }
    faces.push({ family, srcs, file });
  }
  return faces;
}
const cleanFamily = (s) => s.trim().replace(/^['"]|['"]$/g, '').trim();

/** Bóc mọi font-family ĐANG DÙNG (bỏ phần trong @font-face) */
function parseFontUsage(css) {
  const withoutFaces = css.replace(/@font-face\s*\{[^}]*\}/gi, '');
  const names = new Map(); // family → số lần
  const collect = (list) => {
    for (const raw of list.split(',')) {
      const name = cleanFamily(raw);
      if (!name || name.includes('var(') || name.includes('$') || name.includes('{')) continue;
      if (FONT_KEYWORDS.has(name.toLowerCase())) continue;
      if (/^\d/.test(name)) continue; // sót từ shorthand `font: 14px/1.2 X`
      names.set(name, (names.get(name) || 0) + 1);
    }
  };
  let m;
  const reFamily = /font-family\s*:\s*([^;}]+)/gi;
  while ((m = reFamily.exec(withoutFaces))) collect(m[1]);
  // shorthand `font:` — phần sau size/line-height mới là family
  const reShort = /(?:^|[;{\s])font\s*:\s*([^;}]+)/gi;
  while ((m = reShort.exec(withoutFaces))) {
    const val = m[1];
    const slash = val.match(/[\d.]+(?:px|rem|em|%|pt)[^\s]*\s+(.+)$/);
    if (slash) collect(slash[1]);
  }
  return names;
}

/** Mọi url() trong CSS (kể cả trong @font-face — check 1 và 3 dùng chung) */
function parseCssUrls(css) {
  const urls = [];
  let m;
  const re = /url\(\s*([^)]+?)\s*\)/gi;
  while ((m = re.exec(css))) urls.push(m[1]);
  return urls;
}

/* ─────────────────────────── bóc HTML ─────────────────────────── */

function parseHtmlRefs(html) {
  const refs = [];
  const push = (u) => refs.push(u);
  let m;

  // src / href / poster / data-src / data-background
  const reAttr = /\b(?:src|href|poster|data-src|data-bg|data-background|data-image)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
  while ((m = reAttr.exec(html))) push(m[1].replace(/^['"]|['"]$/g, ''));

  // srcset: "a.png 1x, b.png 2x"
  const reSet = /\bsrcset\s*=\s*("[^"]*"|'[^']*')/gi;
  while ((m = reSet.exec(html))) {
    for (const part of m[1].replace(/^['"]|['"]$/g, '').split(','))
      push(part.trim().split(/\s+/)[0]);
  }

  // style="background:url(...)"
  const reInline = /style\s*=\s*("[^"]*"|'[^']*')/gi;
  while ((m = reInline.exec(html))) for (const u of parseCssUrls(m[1])) push(u);

  return refs;
}

/** <style>…</style> — coi như CSS, base = folder của chính file html */
function parseHtmlStyles(html) {
  const blocks = [];
  let m;
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = re.exec(html))) blocks.push(m[1]);
  return blocks.join('\n');
}

/* ─────────────────────────── thu thập ─────────────────────────── */

const findings = [];
const add = (level, check, message, where = '') => findings.push({ level, check, message, where });

const cssFiles = walk(DIST, ['.css']);
const htmlFiles = walk(DIST, ['.html', '.htm']);
const SRC_CANDIDATES = ['assets', 'src', 'source'];
const campaignDir = path.dirname(DIST);
const srcDirs = SRC_CANDIDATES.map((d) => path.join(campaignDir, d)).filter(isDir);
const CODE_EXT = ['.js', '.ts', '.scss', '.css', '.twig', '.html', '.json'];
const allFontFaces = [];
const fontUsage = new Map();
/** ref → { url, from, candidates } */
const refs = [];

for (const f of cssFiles) {
  const css = read(f).replace(CSS_COMMENT, '');
  allFontFaces.push(...parseFontFaces(css, f));
  for (const [name, n] of parseFontUsage(css)) fontUsage.set(name, (fontUsage.get(name) || 0) + n);
  for (const u of parseCssUrls(css)) {
    if (skippable(u)) continue;
    refs.push({ ...resolveRef(u, f), from: f });
  }
}
for (const f of htmlFiles) {
  const html = read(f);
  const inlineCss = parseHtmlStyles(html).replace(CSS_COMMENT, '');
  if (inlineCss.trim()) {
    allFontFaces.push(...parseFontFaces(inlineCss, f));
    for (const [name, n] of parseFontUsage(inlineCss)) fontUsage.set(name, (fontUsage.get(name) || 0) + n);
    for (const u of parseCssUrls(inlineCss)) {
      if (skippable(u)) continue;
      refs.push({ ...resolveRef(u, f), from: f });
    }
  }
  for (const u of parseHtmlRefs(html)) {
    if (skippable(u)) continue;
    refs.push({ ...resolveRef(u, f), from: f });
  }
}

const FONT_EXT = ['.ttf', '.otf', '.woff', '.woff2', '.eot'];
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const exists = (candidates) => candidates.some((c) => isFile(c));

/* ── check 1: @font-face trỏ file không tồn tại ── */
const missingFaceSrc = [];
for (const face of allFontFaces) {
  for (const src of face.srcs) {
    if (skippable(src)) continue;
    const { candidates } = resolveRef(src, face.file);
    if (!exists(candidates)) missingFaceSrc.push({ face, src });
  }
  if (!face.srcs.length) add('WARN', 'font-face-no-src', `@font-face "${face.family}" không có url() nào`, rel(face.file));
}
for (const { face, src } of missingFaceSrc)
  add('ERROR', 'font-file-missing', `@font-face "${face.family}" trỏ file không tồn tại: ${src}`, rel(face.file));

/* ── check 2: font-family dùng mà không khai @font-face ── */
const declared = new Set(allFontFaces.map((f) => f.family.toLowerCase()).filter(Boolean));
const undeclared = [...fontUsage.entries()]
  .filter(([name]) => !declared.has(name.toLowerCase()))
  .sort((a, b) => b[1] - a[1]);
for (const [name, n] of undeclared)
  add('ERROR', 'font-undeclared', `font-family "${name}" dùng ${n} chỗ nhưng KHÔNG có @font-face nào khai (browser sẽ fallback im lặng)`);

/* ── check 3: asset ref 404 ── */
const seenMissing = new Set();
for (const r of refs) {
  if (exists(r.candidates)) continue;
  const k = r.url + '←' + rel(r.from);
  if (seenMissing.has(k)) continue;
  seenMissing.add(k);
  const isFont = FONT_EXT.includes(path.extname(r.url).toLowerCase());
  if (isFont && missingFaceSrc.some((m) => cleanUrl(m.src) === r.url)) continue; // đã báo ở check 1
  add('ERROR', 'asset-missing', `ref không tồn tại: ${r.url}`, rel(r.from));
}

/* ── check 4: font designer giao mà không dùng ── */
if (DESIGN) {
  const designFonts = walk(DESIGN, FONT_EXT);
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const usedBlob = norm(
    allFontFaces.map((f) => f.family + ' ' + f.srcs.map((s) => path.basename(s)).join(' ')).join(' ')
  );
  const unused = designFonts.filter((f) => !usedBlob.includes(norm(path.basename(f, path.extname(f)))));
  for (const f of unused)
    add('WARN', 'design-font-unused', `font designer giao nhưng không @font-face nào dùng: ${path.basename(f)}`, path.relative(DESIGN, f));
  if (!designFonts.length) add('WARN', 'design-no-font', `--design không có file font nào: ${DESIGN}`);
}

/* ── check 5: ảnh nặng ── */
const HEAVY = 500 * 1024;
for (const img of walk(DIST, IMG_EXT)) {
  const s = size(img);
  if (s > HEAVY) add('WARN', 'image-heavy', `${(s / 1024 / 1024).toFixed(2)}MB — ${rel(img)}`);
}

/* ── check 7: ảnh bản đối chiếu lọt vào production ──
   psd-cut để bản CÓ CHỮ trong `_ref-co-chu/` chỉ để mắt so — font trong đó thường chưa cài,
   chữ raster sai nét. Bê nhầm sang dist là chữ hỏng mà build vẫn xanh. */
for (const r of refs) {
  if (!/(^|[-/_])(_ref|ref-co-chu)|-CO-CHU/i.test(r.url)) continue;
  add('ERROR', 'ref-image-used', `ảnh chỉ-để-đối-chiếu đang dùng thật: ${r.url}`, rel(r.from));
}

function pngSize(p) {
  const head = Buffer.alloc(24);
  const fd = fs.openSync(p, 'r');
  fs.readSync(fd, head, 0, 24, 0);
  fs.closeSync(fd);
  return head.toString('latin1', 12, 16) === 'IHDR' ? { w: head.readUInt32BE(16), h: head.readUInt32BE(20) } : null;
}

/** coords.json 3 đời: {runId, gateStatus, assets[]} · mảng row · map "file" → {left, top, width, height} */
function readCut(file) {
  const doc = JSON.parse(read(file));
  const list = Array.isArray(doc) ? doc : Array.isArray(doc.assets) ? doc.assets : Object.values(doc).filter((r) => r?.file);
  const cut = { file, gateStatus: doc.gateStatus, runId: doc.runId };
  cut.rows = list.map((r) => {
    const p = path.join(path.dirname(file), r.file);
    return { cut, name: r.name ?? r.file, path: p, real: isFile(p) ? pngSize(p) : null,
             w: r.w ?? r.width, h: r.h ?? r.height, flags: r.flags ?? [] };
  });
  return cut;
}

const cuts = [];
const SIDECAR = /(^|\/)(.*backup.*|.*-base)(\/|$)/i;
if (DESIGN) {
  for (const f of walk(DESIGN)) {
    if (path.basename(f) !== 'coords.json' || SIDECAR.test(path.relative(DESIGN, path.dirname(f)))) continue;
    try {
      cuts.push(readCut(f));
    } catch (e) {
      add('ERROR', 'coords-unreadable', `coords.json đọc không được: ${e.message}`, path.relative(DESIGN, f));
    }
  }
}
const cutRows = cuts.flatMap((c) => c.rows);

/* ── check 8: asset design bóc ra mà dist không dùng ──
   Anh em với check 4 nhưng cho ẢNH: hoặc quên code một mảng, hoặc là rác cần dọn.
   Chỉ soi thư mục CÓ `coords.json` — đó là bản psd-cut đã trim và giao; ảnh thô ngoài đó,
   `bg-sections/`, `_control` là vật liệu trung gian, kể vào chỉ tổ đẻ nhiễu (đo GW-814: 467 → 4).
   WARN chứ không ERROR — asset thay bằng module popup dùng chung là chuyện bình thường. */
if (DESIGN) {
  const nm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const usedImgs = nm([...refs.map((r) => path.basename(cleanUrl(r.url))), ...walk(DIST, IMG_EXT).map((f) => path.basename(f))].join(' '));
  const shipped = new Set(cuts.map((c) => path.dirname(c.file)));
  const perDir = new Map();
  for (const f of walk(DESIGN, IMG_EXT)) {
    const dir = path.dirname(f);
    if (!shipped.has(dir)) continue;
    const base = path.basename(f, path.extname(f));
    if (base.startsWith('_')) continue; // _control/_scope là ảnh tham chiếu của psd-cut
    const key = path.relative(DESIGN, dir);
    const g = perDir.get(key) || { total: 0, unused: [] };
    g.total++;
    if (!usedImgs.includes(nm(base))) g.unused.push(base);
    perDir.set(key, g);
  }
  for (const [dir, g] of perDir) {
    if (!g.unused.length) continue;
    const head = g.unused.slice(0, 5).join(', ');
    add('WARN', 'design-asset-unused',
        `${g.unused.length}/${g.total} asset bóc ra nhưng dist không dùng: ${head}${g.unused.length > 5 ? ` … +${g.unused.length - 5}` : ''}`, dir);
  }
}

/* ── check 9–11: ảnh dist/source là bản sao asset coords.json khi cùng md5 HOẶC cùng tên + cùng cỡ ── */
// Tên trần không đủ: title.png/bg.png của popup library trùng tên row bản cắt (GW-727)
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const groupBy = (list, key) => list.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) || []), x]), new Map());
const sameDims = (a, b) => Boolean(a && b && a.w === b.w && a.h === b.h);
const cutRowsByName = groupBy(cutRows, (r) => path.basename(r.path));
const cutRowsBySize = groupBy(cutRows.filter((r) => r.real), (r) => size(r.path));
const shippedImgs = [...walk(DIST, IMG_EXT), ...srcDirs.flatMap((d) => walk(d, IMG_EXT))];
const copies = [];
for (const img of shippedImgs) {
  const real = pngSize(img);
  const byName = (cutRowsByName.get(path.basename(img)) || []).filter((r) => sameDims(r.real, real));
  const byContent = (cutRowsBySize.get(size(img)) || []).filter((r) => md5(r.path) === md5(img));
  const rows = [...new Set([...byName, ...byContent])];
  if (rows.length) copies.push({ img, rows });
}

/* ── check 9: asset mang cờ plan mà vẫn dùng làm ảnh (img src / background / sprite) ── */
const FLAG_RULES = {
  'DATA-ZONE': ['ERROR', 'vùng dữ liệu động tên/điểm/số — phải render bằng HTML'],
  'FONT-SUBST': ['ERROR', 'chữ nướng bằng font thay thế vì font PSD chưa cài — sai nét'],
  BAKE: ['WARN', 'đã nướng kèm nền bên dưới vì blend lạ — chỉ đúng khi đặt đúng toạ độ trên đúng nền'],
  'CỤC': ['WARN', 'gộp nhiều vật rời trong 1 ảnh — nên tách'],
};
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const flaggedCopies = copies.filter((c) => c.rows.some((r) => r.flags.some((fl) => FLAG_RULES[fl])));
const codeFiles = flaggedCopies.length
  ? [...walk(DIST, CODE_EXT), ...srcDirs.flatMap((d) => walk(d, CODE_EXT))].map((f) => ({ f, lines: read(f).split('\n') }))
  : [];
const seenFlagged = new Set();
for (const { img, rows } of flaggedCopies) {
  const base = path.basename(img);
  const stem = path.basename(img, path.extname(img));
  const usedAt = new RegExp(`(?<![\\w-])${escRe(base)}|sprite\\(\\s*\\$${escRe(stem)}\\s*\\)|MS__sprite-${escRe(stem)}(?![\\w-])`);
  const wheres = codeFiles.flatMap(({ f, lines }) => lines.flatMap((l, i) => (usedAt.test(l) ? [`${rel(f)}:${i + 1}`] : [])));
  for (const row of rows) {
    for (const flag of row.flags.filter((fl) => FLAG_RULES[fl])) {
      const [level, meaning] = FLAG_RULES[flag];
      // Không thấy dòng tham chiếu vẫn báo: sprite gộp nguyên thư mục, dist chép là đã ship
      for (const where of wheres.length ? wheres : [rel(img)]) {
        const key = `${flag}|${row.name}|${where}`;
        if (seenFlagged.has(key)) continue;
        seenFlagged.add(key);
        add(level, 'flagged-asset-used', `ảnh cờ ${flag} (${meaning}) đang dùng làm ảnh: ${base} ← bản cắt "${row.name}"`, where);
      }
    }
  }
}

/* ── check 10: ảnh dist cùng tên + cùng tỉ lệ khung với slot coords mà không phải 1×/2× (bitmap gốc Figma) ── */
const SCALE_TOLERANCE = 0.03;
const nearScale = (ratio, k) => Math.abs(ratio / k - 1) <= SCALE_TOLERANCE;
for (const img of walk(DIST, ['.png'])) {
  const real = pngSize(img);
  if (!real) continue;
  const slots = (cutRowsByName.get(path.basename(img)) || [])
    .filter((r) => r.w && r.h && nearScale(real.w / real.h / (r.w / r.h), 1));
  if (!slots.length) continue;
  if (slots.some((r) => [1, 2].some((k) => nearScale(real.w / r.w, k) && nearScale(real.h / r.h, k)))) continue;
  const slot = slots[0];
  add('WARN', 'scale-odd',
      `${path.basename(img)} cỡ thật ${real.w}×${real.h} = ${(real.w / slot.w).toFixed(2)}× slot ${slot.w}×${slot.h} của ${path.relative(DESIGN, slot.cut.file)}` +
      ' — không phải 1×/2×: cùng ảnh thì browser co giãn lẻ (mờ), ảnh của viewport khác thì bỏ qua', rel(img));
}

/* ── check 11: asset từ lượt cắt ĐỎ (gateStatus=FAIL) — chỉ overrides.json có lý do + số đo gạt được ── */
const OVERRIDE_GATES = ['C2', 'C5'];
const OVERRIDE_REASON_MIN = 10;
/** override C5 chỉ gạt đúng asset nó nêu tên; C2 gạt theo region (vùng ghép, không map được về asset) */
function readOverrides(file) {
  if (!isFile(file)) return { valid: [], problems: ['không có overrides.json'] };
  let list;
  try {
    list = JSON.parse(read(file));
  } catch (e) {
    return { valid: [], problems: [`overrides.json hỏng: ${e.message}`] };
  }
  if (!Array.isArray(list) || !list.length) return { valid: [], problems: ['overrides.json rỗng hoặc không phải mảng'] };
  const valid = [];
  const problems = list.flatMap((o) => {
    const why = [
      !OVERRIDE_GATES.includes(o.gate) && 'gate chỉ C2/C5',
      !(o.asset || o.region) && 'thiếu asset/region',
      String(o.reason ?? '').trim().length < OVERRIDE_REASON_MIN && `reason <${OVERRIDE_REASON_MIN} ký tự`,
      typeof o.measured !== 'number' && 'thiếu measured (số đo)',
    ].filter(Boolean);
    if (!why.length) valid.push(o);
    return why.length ? [`${o.gate} ${o.asset || o.region}: ${why.join(', ')}`] : [];
  });
  return { valid, problems };
}
for (const cut of cuts.filter((c) => c.gateStatus === 'FAIL')) {
  const { valid, problems } = readOverrides(path.join(path.dirname(cut.file), 'overrides.json'));
  const waived = (name) => valid.some((o) => o.asset === name || (o.gate === 'C2' && o.region));
  const used = [...new Set(copies.flatMap((c) => c.rows).filter((r) => r.cut === cut).map((r) => r.name))]
    .filter((name) => !waived(name));
  if (!used.length) continue;
  if (valid.length) problems.push(`override hợp lệ không nêu asset đang dùng (${used.slice(0, 5).join(', ')})`);
  add('ERROR', 'cut-gate-red',
      `asset từ lượt cắt đỏ (gateStatus=FAIL, runId ${cut.runId}): ${used.length} asset đang dùng — ${used.slice(0, 5).join(', ')}. ` +
      `Cắt lại cho xanh, hoặc ghi overrides.json [{gate C2|C5, asset|region, reason ≥${OVERRIDE_REASON_MIN} ký tự, measured}] · ${problems.join('; ')}`,
      path.relative(DESIGN, cut.file));
}

/* ── check 6: dist cũ hơn source ── */
if (srcDirs.length) {
  const srcM = Math.max(...srcDirs.map((d) => maxMtime(d, CODE_EXT)));
  const distM = maxMtime(DIST);
  if (srcM && distM && srcM > distM) {
    const hrs = ((srcM - distM) / 3600000).toFixed(1);
    add('ERROR', 'dist-stale', `dist/ cũ hơn source ${hrs}h — build lại trước khi kiểm/giao`);
  }
} else if (!opts.quiet) {
  add('WARN', 'src-not-found', `không thấy folder source cạnh dist (${SRC_CANDIDATES.join('/')}) → bỏ check dist-stale`);
}

/* ─────────────────────────── báo cáo ─────────────────────────── */

const errors = findings.filter((f) => f.level === 'ERROR');
const warns = findings.filter((f) => f.level === 'WARN');
const failed = errors.length > 0 || (opts.strict && warns.length > 0);

const report = {
  at: new Date().toISOString(),
  dist: DIST,
  design: DESIGN || null,
  scanned: {
    css: cssFiles.length, html: htmlFiles.length, fontFaces: allFontFaces.length, refs: refs.length,
    coords: cuts.length, cutAssets: cutRows.length, cutCopies: copies.length,
  },
  counts: { error: errors.length, warn: warns.length },
  pass: !failed,
  findings,
};

if (opts.json) {
  fs.mkdirSync(path.dirname(path.resolve(opts.json)), { recursive: true });
  fs.writeFileSync(path.resolve(opts.json), JSON.stringify(report, null, 2));
}

/**
 * Gate fail → append block bài học NHÁP (3 field đầu điền sẵn, "Nguyên nhân" để người viết).
 * Vòng học chỉ sống nếu dữ liệu sinh ra như tác dụng phụ; bắt người nhớ ghi là mất.
 * Cùng tổ hợp check trong cùng ngày chỉ ghi 1 lần (chạy gate 10 lần không thành 10 block).
 */
if (opts.lessons && errors.length) {
  const p = path.resolve(opts.lessons);
  const codes = [...new Set(errors.map((e) => e.check))].sort();
  const day = report.at.slice(0, 10);
  const slug = `gate-${codes.join('-')}-${day}`;
  const old = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  if (!old.includes('## ' + slug)) {
    const block = [
      `## ${slug}`,
      `- Bắt được: ${errors.length} ERROR (${codes.join(', ')}) trên ${path.basename(DIST)} — ${errors[0].message}`,
      '- Nguyên nhân: (điền — vì sao lọt tới đây)',
      `- Lưới chặn: fe-gate check ${codes.join(', ')} (đã bắt được, giữ nguyên trong luồng code-developer)`,
      `- Nguồn: ${path.basename(path.dirname(DIST))} · ${day}`,
      '',
    ].join('\n');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, (old && !old.endsWith('\n\n') ? '\n' : '') + block);
    if (!opts.quiet) process.stdout.write(`\n  → đã ghi bài học nháp vào ${opts.lessons} (## ${slug})\n`);
  }
}

if (!opts.quiet) {
  const L = (s) => process.stdout.write(s + '\n');
  L('');
  L(`fe-gate · ${DIST}`);
  L(`  quét: ${cssFiles.length} css · ${htmlFiles.length} html · ${allFontFaces.length} @font-face · ${refs.length} ref`);
  if (DESIGN) L(`        ${cuts.length} coords.json · ${cutRows.length} asset cắt · ${copies.length} ảnh dist/source là bản sao của chúng`);
  if (!findings.length) {
    L('  ✓ PASS — 0 ERROR, 0 WARN');
  } else {
    for (const level of ['ERROR', 'WARN']) {
      const list = findings.filter((f) => f.level === level);
      if (!list.length) continue;
      L('');
      L(`  ${level === 'ERROR' ? '✗' : '!'} ${level} (${list.length})`);
      for (const f of list) L(`    · [${f.check}] ${f.message}${f.where ? '   ← ' + f.where : ''}`);
    }
    L('');
    L(`  ${failed ? '✗ FAIL' : '✓ PASS (chỉ có WARN)'} — ${errors.length} ERROR · ${warns.length} WARN`);
  }
  L('');
}

process.exit(failed ? 1 : 0);
