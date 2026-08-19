#!/usr/bin/env node
/**
 * check-html.mjs — Quét HTML/SEO/validation cho website tĩnh (built output).
 * Bắt cả những thứ VẮNG MẶT (canonical, OG, JSON-LD, robots.txt, sitemap...) —
 * nhóm lỗi agent hay bỏ sót nhất.
 *
 * Usage:
 *   node check-html.mjs <site-dir> [--json]
 *
 * Exit code: 1 nếu có CRITICAL (production blocker), 0 nếu không.
 * Không cần dependency ngoài — chạy thuần Node >= 18.
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const root = path.resolve(args.filter((a) => !a.startsWith('--'))[0] || '.');

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Không tìm thấy thư mục: ${root}`);
  process.exit(2);
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', '.cache', 'coverage']);
const issues = []; // {severity, domain, file, message}
const add = (severity, domain, file, message) =>
  issues.push({ severity, domain, file: file ? path.relative(root, file) : '(site)', message });

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
const htmlFiles = allFiles.filter((f) => /\.html?$/i.test(f));
const cssFiles = allFiles.filter((f) => /\.css$/i.test(f));

if (htmlFiles.length === 0) {
  console.error(`Không có file .html nào trong ${root} — nếu đây là source repo, hãy build rồi audit thư mục output (dist/out/build).`);
  process.exit(2);
}

// ---------- helpers ----------
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
};
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

const isExternalRef = (url) =>
  /^(https?:)?\/\//i.test(url) || /^(mailto:|tel:|data:|javascript:|#)/i.test(url);

function resolveLocalRef(url, fromFile) {
  const clean = url.split('#')[0].split('?')[0];
  if (!clean) return null;
  let p = clean.startsWith('/') ? path.join(root, clean) : path.resolve(path.dirname(fromFile), clean);
  if (fs.existsSync(p)) {
    if (fs.statSync(p).isDirectory()) {
      return fs.existsSync(path.join(p, 'index.html')) ? path.join(p, 'index.html') : null;
    }
    return p;
  }
  // các dạng route tĩnh phổ biến: /about -> /about.html hoặc /about/index.html
  if (fs.existsSync(p + '.html')) return p + '.html';
  return null;
}

// ---------- per-page checks ----------
for (const file of htmlFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const html = stripComments(raw);
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? html.slice(0, 4000);

  // Doctype & <html lang>
  if (!/^\s*<!doctype\s+html/i.test(raw))
    add('HIGH', 'validation', file, 'Thiếu <!DOCTYPE html> → browser render ở quirks mode');
  const htmlTag = html.match(/<html[^>]*>/i)?.[0] ?? '<html>';
  if (!attr(htmlTag, 'lang'))
    add('MEDIUM', 'validation', file, 'Thẻ <html> thiếu thuộc tính lang (vd lang="vi") — ảnh hưởng a11y + SEO ngôn ngữ');

  // Title
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (title === undefined) add('HIGH', 'seo', file, 'Thiếu thẻ <title>');
  else if (title.length === 0) add('HIGH', 'seo', file, '<title> rỗng');
  else if (title.length < 15) add('MEDIUM', 'seo', file, `<title> quá ngắn/chung chung ("${title}") — nên ~50-60 ký tự, có brand + từ khóa`);
  else if (title.length > 65) add('LOW', 'seo', file, `<title> dài ${title.length} ký tự — có thể bị cắt trên SERP (~50-60 ký tự an toàn)`);

  // Meta cơ bản
  if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(head))
    add('HIGH', 'validation', file, 'Thiếu <meta name="viewport"> → layout mobile hỏng');
  if (!/<meta[^>]+charset/i.test(head))
    add('MEDIUM', 'validation', file, 'Thiếu <meta charset>');

  const descTag = head.match(/<meta[^>]+name\s*=\s*["']description["'][^>]*>/i)?.[0];
  if (!descTag) add('HIGH', 'seo', file, 'Thiếu meta description (~150-160 ký tự)');
  else {
    const c = attr(descTag, 'content') ?? '';
    if (c.length < 50) add('MEDIUM', 'seo', file, `Meta description quá ngắn (${c.length} ký tự) — nên 120-160`);
    else if (c.length > 170) add('LOW', 'seo', file, `Meta description dài ${c.length} ký tự — có thể bị cắt (~150-160 an toàn)`);
  }

  // Robots meta — blocker kinh điển trước khi lên production
  const robotsTag = head.match(/<meta[^>]+name\s*=\s*["']robots["'][^>]*>/i)?.[0];
  if (robotsTag && /noindex|nofollow/i.test(attr(robotsTag, 'content') ?? ''))
    add('CRITICAL', 'seo', file, `Meta robots "${attr(robotsTag, 'content')}" — trang sẽ KHÔNG được index. Leftover từ staging? PHẢI gỡ trước khi lên production (trừ khi cố ý)`);

  // Canonical / OG / Twitter / favicon / JSON-LD — nhóm "absence checks"
  if (!/<link[^>]+rel\s*=\s*["']canonical["']/i.test(head))
    add('MEDIUM', 'seo', file, 'Thiếu <link rel="canonical"> — dễ duplicate content khi có query params/nhiều domain');
  const hasOg = /property\s*=\s*["']og:title["']/i.test(head) && /property\s*=\s*["']og:image["']/i.test(head);
  if (!hasOg)
    add('MEDIUM', 'seo', file, 'Thiếu Open Graph (og:title/og:description/og:image ~1200×630) — share lên Zalo/Facebook sẽ xấu');
  if (!/name\s*=\s*["']twitter:card["']/i.test(head))
    add('LOW', 'seo', file, 'Thiếu Twitter/X card (twitter:card=summary_large_image)');
  if (!/<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(head) && !fs.existsSync(path.join(root, 'favicon.ico')))
    add('LOW', 'seo', file, 'Thiếu favicon (không có <link rel="icon"> lẫn /favicon.ico)');
  if (!/<script[^>]+type\s*=\s*["']application\/ld\+json["']/i.test(html))
    add('MEDIUM', 'seo', file, 'Thiếu structured data JSON-LD (tối thiểu Organization/WebSite; game/product page nên có VideoGame/Product)');

  // Headings
  const headings = [...html.matchAll(/<h([1-6])[^>]*>/gi)].map((m) => +m[1]);
  const h1Count = headings.filter((h) => h === 1).length;
  if (h1Count === 0) add('MEDIUM', 'seo', file, 'Không có thẻ <h1>');
  if (h1Count > 1) add('MEDIUM', 'seo', file, `Có ${h1Count} thẻ <h1> — mỗi trang chỉ nên có 1`);
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] > headings[i - 1] + 1) {
      add('LOW', 'seo', file, `Heading nhảy cấp h${headings[i - 1]}→h${headings[i]} — phá cấu trúc outline`);
      break;
    }
  }

  // <img>
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const noAlt = imgs.filter((t) => attr(t, 'alt') === undefined);
  const noDims = imgs.filter((t) => !attr(t, 'width') && !attr(t, 'height'));
  const noLazy = imgs.slice(1).filter((t) => !attr(t, 'loading')); // ảnh đầu coi như above-fold
  const noSrcset = imgs.filter((t) => !attr(t, 'srcset'));
  if (noAlt.length) add('HIGH', 'seo', file, `${noAlt.length}/${imgs.length} ảnh thiếu alt (a11y + SEO ảnh): ${noAlt.map((t) => attr(t, 'src')).slice(0, 5).join(', ')}`);
  if (noDims.length) add('HIGH', 'performance', file, `${noDims.length}/${imgs.length} ảnh thiếu width/height → CLS (layout shift) khi ảnh tải xong`);
  if (noLazy.length) add('MEDIUM', 'performance', file, `${noLazy.length} ảnh (ngoài ảnh đầu) chưa có loading="lazy"`);
  if (imgs.length && noSrcset.length === imgs.length)
    add('LOW', 'images', file, 'Không ảnh nào có srcset/sizes — mobile phải tải ảnh cỡ desktop');
  if (imgs[0] && !/fetchpriority\s*=\s*["']high["']/i.test(imgs[0]))
    add('LOW', 'performance', file, 'Ảnh đầu trang (khả năng là LCP) chưa có fetchpriority="high"');

  // Script chặn render trong <head>
  const headScripts = [...head.matchAll(/<script\b[^>]*src\s*=[^>]*>/gi)].map((m) => m[0])
    .filter((t) => !/\b(defer|async)\b/i.test(t) && !/type\s*=\s*["']module["']/i.test(t));
  if (headScripts.length)
    add('HIGH', 'performance', file, `${headScripts.length} script đồng bộ chặn render trong <head> (thiếu defer/async): ${headScripts.map((t) => attr(t, 'src')).join(', ')}`);

  // Google Fonts trên trang này
  const gf = head.match(/<link[^>]+fonts\.googleapis\.com[^>]*>/gi) ?? [];
  for (const tag of gf) {
    const href = attr(tag, 'href') ?? '';
    const weights = href.match(/wght@([\d;.,]+)/)?.[1]?.split(/[;,]/).length ?? 0;
    if (weights > 3) add('MEDIUM', 'fonts', file, `Google Fonts tải ${weights} weights — thường chỉ cần 2-3 (regular/bold)`);
    const disp = href.match(/display=(\w+)/)?.[1];
    if (disp && !/^(swap|optional)$/.test(disp))
      add('MEDIUM', 'fonts', file, `Google Fonts display=${disp} → FOIT; nên display=swap (hoặc optional)`);
    if (!/<link[^>]+rel\s*=\s*["']preconnect["'][^>]+fonts\.gstatic\.com/i.test(head))
      add('LOW', 'fonts', file, 'Dùng Google Fonts nhưng thiếu <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  }

  // Duplicate id
  const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  if (dup.length) add('MEDIUM', 'validation', file, `id trùng lặp trong trang: ${dup.join(', ')}`);

  // Thẻ div/section mở-đóng lệch nhau (dấu hiệu HTML invalid)
  for (const tag of ['div', 'section', 'main', 'header', 'footer']) {
    const open = (html.match(new RegExp(`<${tag}\\b`, 'gi')) ?? []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'gi')) ?? []).length;
    if (open !== close)
      add('MEDIUM', 'validation', file, `Số thẻ <${tag}> mở (${open}) ≠ đóng (${close}) — khả năng thẻ chưa đóng; chạy \`npx html-validate\` để xác nhận vị trí`);
  }

  // Anchor text kém + href="#"
  const anchors = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const m of anchors) {
    const text = m[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (/^(click here|here|xem tại đây|tại đây|bấm vào đây|link|read more)$/.test(text))
      add('LOW', 'seo', file, `Anchor text không mô tả: "${text}" — nên mô tả đích đến`);
  }
  const hashOnclick = anchors.filter((m) => attr(m[0], 'href') === '#' && /onclick/i.test(m[0]));
  if (hashOnclick.length)
    add('MEDIUM', 'validation', file, `${hashOnclick.length} thẻ <a href="#" onclick=...> — hỏng khi không có JS, không crawl được; dùng <button> hoặc href thật`);

  // Broken local refs (link, ảnh, script, css)
  const refs = [
    ...[...html.matchAll(/<(?:img|script|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
    ...[...html.matchAll(/<(?:a|link)\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
  ];
  for (const url of refs) {
    if (isExternalRef(url)) continue;
    if (!resolveLocalRef(url, file))
      add('HIGH', 'validation', file, `Tham chiếu gãy (404 khi deploy): ${url}`);
  }
}

// ---------- JS checks (static) ----------
for (const f of allFiles.filter((x) => /\.(js|mjs)$/i.test(x))) {
  const js = fs.readFileSync(f, 'utf8');
  if (/document\.write\s*\(/.test(js))
    add('MEDIUM', 'performance', f, 'Dùng document.write() — API deprecated, chặn parser; chèn DOM bằng insertAdjacentHTML/appendChild');
}

// ---------- CSS checks ----------
for (const file of cssFiles) {
  const css = fs.readFileSync(file, 'utf8');
  const kb = Math.round(fs.statSync(file).size / 1024);
  if (/@import\s/i.test(css))
    add('MEDIUM', 'performance', file, '@import trong CSS tạo chuỗi request nối tiếp chặn render — gộp file hoặc chuyển thành <link>');
  const lines = css.split('\n').length;
  if (kb > 100 && kb * 1024 / lines < 200)
    add('HIGH', 'performance', file, `CSS ${kb}KB chưa minify — minify + purge unused (kiểm tra bằng Chrome DevTools Coverage)`);
  else if (kb > 150)
    add('MEDIUM', 'performance', file, `CSS ${kb}KB — kiểm tra unused rules bằng DevTools Coverage`);
}

// ---------- site-level checks ----------
const robotsPath = path.join(root, 'robots.txt');
if (!fs.existsSync(robotsPath)) {
  add('MEDIUM', 'seo', null, 'Thiếu robots.txt (nên có, kèm dòng "Sitemap: <url>")');
} else {
  const robots = fs.readFileSync(robotsPath, 'utf8');
  if (/^\s*Disallow:\s*\/\s*$/mi.test(robots))
    add('CRITICAL', 'seo', robotsPath, 'robots.txt có "Disallow: /" — CHẶN TOÀN BỘ crawler. Leftover từ staging? PHẢI gỡ trước khi lên production');
  if (!/^\s*Sitemap:/mi.test(robots))
    add('LOW', 'seo', robotsPath, 'robots.txt chưa khai báo dòng Sitemap:');
}
if (!fs.existsSync(path.join(root, 'sitemap.xml')) && !allFiles.some((f) => /sitemap[^/]*\.xml$/i.test(f)))
  add('MEDIUM', 'seo', null, 'Thiếu sitemap.xml');
if (!allFiles.some((f) => /404\.html?$/i.test(f)))
  add('LOW', 'validation', null, 'Không thấy trang 404 tùy chỉnh (404.html) — tùy hosting, nên có');

// ---------- output ----------
const ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
issues.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.file.localeCompare(b.file));

if (asJson) {
  console.log(JSON.stringify({ root, pages: htmlFiles.length, issues }, null, 2));
} else {
  console.log(`\n=== check-html: ${htmlFiles.length} trang HTML, ${cssFiles.length} file CSS — ${issues.length} vấn đề ===\n`);
  for (const i of issues) console.log(`[${i.severity}] (${i.domain}) ${i.file}\n    ${i.message}`);
  const counts = issues.reduce((m, i) => ((m[i.severity] = (m[i.severity] ?? 0) + 1), m), {});
  console.log(`\nTổng: ${['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => `${s}: ${counts[s] ?? 0}`).join(' | ')}`);
  if (counts.CRITICAL) console.log('⛔ Có CRITICAL — KHÔNG đưa lên production trước khi xử lý.');
}
process.exit(issues.some((i) => i.severity === 'CRITICAL') ? 1 : 0);
