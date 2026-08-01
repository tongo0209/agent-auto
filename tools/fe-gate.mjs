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
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const HEAVY = 500 * 1024;
for (const img of walk(DIST, IMG_EXT)) {
  const s = size(img);
  if (s > HEAVY) add('WARN', 'image-heavy', `${(s / 1024 / 1024).toFixed(2)}MB — ${rel(img)}`);
}

/* ── check 6: dist cũ hơn source ── */
const SRC_CANDIDATES = ['assets', 'src', 'source'];
const campaignDir = path.dirname(DIST);
const srcDirs = SRC_CANDIDATES.map((d) => path.join(campaignDir, d)).filter(isDir);
if (srcDirs.length) {
  const CODE_EXT = ['.js', '.ts', '.scss', '.css', '.twig', '.html', '.json'];
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
  scanned: { css: cssFiles.length, html: htmlFiles.length, fontFaces: allFontFaces.length, refs: refs.length },
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
