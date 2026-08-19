#!/usr/bin/env node
'use strict';

/**
 * code-audit — lớp 1: scanner deterministic.
 *
 * Nhiệm vụ: nêu SỰ KIỆN đếm được, mỗi sự kiện có file:line. KHÔNG phán xét.
 * Việc phán xét (issue, mức độ, kịch bản hỏng) do lớp AI làm, xem SKILL.md.
 *
 * Dùng:
 *   node scan.js --dir <path> [--json] [--out <file>]
 *   node scan.js --files a.html,b.scss [--base auto|<git-ref>] [--json]
 *   node scan.js --dir . --base auto --json      # so thêm với bản base (mode diff)
 *
 * Không có dependency ngoài Node core.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------- ngưỡng

const LIMITS = {
  fileLines: { css: 400, scss: 400, less: 400, js: 300, ts: 300, jsx: 300, tsx: 300, html: 600, twig: 600, vue: 400 },
  nestDepth: 5,          // scss: từ mức này trở lên là sâu
  dupWindow: 6,          // css/js: số dòng liên tiếp giống nhau mới tính là block lặp
  dupWindowMarkup: 14,   // markup lặp là chuyện thường (item quà, dòng bảng) — ngưỡng phải cao hơn
  urlListCap: 12,        // mỗi host liệt kê tối đa bao nhiêu dòng
  zIndexHigh: 1000,
  containerPx: 768,      // width cố định >= mức này = container, đáng nêu
  timeoutWait: 100,      // setTimeout delay >= mức này, đáng nêu (có thể đang chờ DOM)
  maxDeadClasses: 50,
  maxDupGroups: 25,
};

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'bower_components', 'vendor',
  '.next', '.nuxt', '.cache', '.parcel-cache', 'coverage', '.idea', '.vscode',
  '__pycache__', '.browserpilot',
  '.claude',   // chứa .claude/worktrees = bản sao cả repo, soi vào là nhân đôi mọi phát hiện
]);

// 'prod' là output build theo quy ước cdn-source; mở lại bằng --include-dist khi cần.
const OUTPUT_DIRS = new Set(['dist', 'build', 'out', 'prod', 'public/build', '.output']);

const EXT_FAMILY = {
  '.html': 'html', '.htm': 'html', '.twig': 'twig', '.vue': 'vue',
  '.css': 'css', '.scss': 'scss', '.sass': 'scss', '.less': 'less',
  '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx',
};

const MARKUP = new Set(['html', 'twig', 'vue']);
const STYLE = new Set(['css', 'scss', 'less']);
const SCRIPT = new Set(['js', 'jsx', 'ts', 'tsx']);

// ---------------------------------------------------------------- tiện ích

function parseArgs(argv) {
  const out = { dir: null, files: null, base: null, json: false, outFile: null, includeDist: false, repo: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') out.dir = argv[++i];
    else if (a === '--files') out.files = argv[++i];
    else if (a === '--base') out.base = argv[++i];
    else if (a === '--out') out.outFile = argv[++i];
    else if (a === '--repo') out.repo = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--include-dist') out.includeDist = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!out.dir && !out.files) out.dir = a;
  }
  return out;
}

function usage() {
  console.log(`code-audit scanner (lớp 1)

  node scan.js --dir <path> [--base auto|<ref>] [--json] [--out <file>]
  node scan.js --files a.html,b.scss[,...] [--base auto|<ref>] [--json]

  --base auto     so với merge-base của branch gốc (bật check so-hook-với-base)
  --include-dist  soi luôn dist/build/out (mặc định bỏ qua)
  --json          xuất JSON đầy đủ (mặc định in bản gọn cho người đọc)`);
}

function walk(dir, includeDist, acc = [], root = dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (!includeDist && OUTPUT_DIRS.has(e.name)) continue;
      walk(full, includeDist, acc, root);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (!EXT_FAMILY[ext]) continue;
      if (/\.min\.(js|css)$/i.test(e.name)) continue;
      acc.push(full);
    }
  }
  return acc;
}

/** Duyệt mọi match của regex, trả về {match, line}. */
function eachMatch(content, regex, cb) {
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  const lineStarts = [0];
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') lineStarts.push(i + 1);
  let m;
  while ((m = re.exec(content)) !== null) {
    // binary search dòng
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= m.index) lo = mid; else hi = mid - 1; }
    cb(m, lo + 1);
    if (m[0] === '') re.lastIndex++;
  }
}

function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12); }

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m + n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// ---------------------------------------------------------------- git

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function findRepoRoot(start) {
  try { return git(start, ['rev-parse', '--show-toplevel']); } catch { return null; }
}

function resolveBase(repo, spec) {
  if (!spec) return null;
  if (spec !== 'auto') { try { return git(repo, ['rev-parse', spec]) && spec; } catch { return null; } }
  const candidates = ['origin/HEAD', 'origin/main', 'origin/master', 'origin/develop', 'main', 'master', 'develop'];
  for (const c of candidates) {
    try {
      const ref = git(repo, ['rev-parse', '--verify', '--quiet', c]);
      if (!ref) continue;
      const mb = git(repo, ['merge-base', 'HEAD', c]);
      if (mb) return mb;
    } catch { /* thử cái tiếp */ }
  }
  try { return git(repo, ['rev-parse', 'HEAD']); } catch { return null; }
}

function baseVersion(repo, base, absFile) {
  if (!base) return null;
  const rel = path.relative(repo, absFile);
  try { return execFileSync('git', ['show', `${base}:${rel}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return null; }
}

// ---------------------------------------------------------------- kiểm kê hợp đồng markup

const RE_PM = /pm__[A-Za-z0-9_-]+/g;
// Lookbehind (?<![\w-]) để "id=" không khớp phần đuôi của data-promotion-id=, aria-labelledby= ...
const RE_ID_ATTR = /(?<![\w-])id\s*=\s*["']([^"']+)["']/g;
const RE_DATA_ATTR = /\s(data-[A-Za-z0-9_-]+)\s*=/g;
const RE_FOR_ATTR = /(?<![\w-])for\s*=\s*["']([^"']+)["']/g;
const RE_FIELD = /<(input|select|textarea)\b([^>]*)>/gi;

function attr(tagText, name) {
  const m = new RegExp(`(?<![\\w-])${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tagText);
  return m ? m[1] : null;
}

/** Kiểm kê "hợp đồng" của một file markup: hook pm__, id, data-*, field form. */
function contractInventory(content) {
  const inv = { pm: new Map(), ids: new Map(), data: new Map(), fields: [], fors: new Map() };
  eachMatch(content, RE_PM, (m, line) => {
    if (!inv.pm.has(m[0])) inv.pm.set(m[0], []);
    inv.pm.get(m[0]).push(line);
  });
  eachMatch(content, RE_ID_ATTR, (m, line) => {
    if (!inv.ids.has(m[1])) inv.ids.set(m[1], []);
    inv.ids.get(m[1]).push(line);
  });
  eachMatch(content, RE_DATA_ATTR, (m, line) => {
    if (!inv.data.has(m[1])) inv.data.set(m[1], []);
    inv.data.get(m[1]).push(line);
  });
  eachMatch(content, RE_FOR_ATTR, (m, line) => {
    if (!inv.fors.has(m[1])) inv.fors.set(m[1], []);
    inv.fors.get(m[1]).push(line);
  });
  // Vùng <form>…</form> để biết field nào thực sự nằm trong form: ngoài form thì `name` không
  // phải hợp đồng (JS đọc bằng selector), báo thiếu name ở đó chỉ là nhiễu.
  const formRanges = [];
  for (const fm of content.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    const open = /<form\b[^>]*>/i.exec(fm[0]);
    const openTag = open ? open[0] : '<form>';
    formRanges.push({
      start: fm.index, end: fm.index + fm[0].length,
      id: attr(openTag, 'id'), cls: attr(openTag, 'class'), role: attr(openTag, 'role'),
    });
  }
  inv.hasForm = formRanges.length > 0;

  eachMatch(content, RE_FIELD, (m, line) => {
    const tag = m[0];
    const form = formRanges.find(r => m.index >= r.start && m.index < r.end) || null;
    inv.fields.push({
      tag: m[1].toLowerCase(), name: attr(tag, 'name'), id: attr(tag, 'id'),
      type: attr(tag, 'type'), line, order: inv.fields.length,
      inForm: !!form,
      // Form tìm kiếm không phải form hợp đồng: thiếu `name` ở đó là bình thường.
      formLabel: form ? (form.id || form.cls || form.role || 'form') : null,
      formIsSearch: !!form && (form.role === 'search' || /search|tìm/i.test(form.cls || '')),
    });
  });
  return inv;
}

// ---------------------------------------------------------------- scanner

class Scanner {
  constructor(opts) {
    this.opts = opts;
    this.facts = [];
    this.metrics = { files: 0, byFamily: {}, totalLines: 0 };
    this.signals = { pmHooks: 0, twig: false, framework: [], typescript: false, jquery: false };
    this.dupIndex = new Map();       // hash -> [{file,line,family}]
    this.selectorIndex = new Map();  // selector -> [{file,line}]
    this.classDefs = new Map();      // .class -> [{file,line}]
    this.tokenUse = new Set();       // token xuất hiện trong markup/script
    this.mediaQueries = new Map();   // query -> [{file,line}]
  }

  fact(check, file, line, detail, extra) {
    this.facts.push({ check, file: this.rel(file), line, detail, ...(extra || {}) });
  }

  rel(file) {
    const root = this.opts.repoRoot || this.opts.dir || process.cwd();
    const r = path.relative(root, file);
    return r.startsWith('..') ? file : r;
  }

  scan(files) {
    for (const f of files) {
      let content;
      try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
      if (content.includes('\\u0000')) continue;   // file binary
      const family = EXT_FAMILY[path.extname(f).toLowerCase()];
      const lines = content.split('\n');
      this.metrics.files++;
      this.metrics.byFamily[family] = (this.metrics.byFamily[family] || 0) + 1;
      this.metrics.totalLines += lines.length;

      this.checkSize(f, family, lines);
      this.collectDuplicates(f, family, lines);
      this.checkCommon(f, family, content);
      // Thu token từ markup VÀ script: class hay được ghép trong chuỗi JS, không thấy thì kết luận
      // "class chết" sẽ sai.
      if (MARKUP.has(family) || SCRIPT.has(family)) {
        for (const m of content.matchAll(/[A-Za-z0-9_-]{3,}/g)) this.tokenUse.add(m[0]);
      }
      if (MARKUP.has(family)) this.checkMarkup(f, family, content);
      if (STYLE.has(family) || family === 'vue') this.checkStyle(f, family, content, lines);
      if (SCRIPT.has(family) || MARKUP.has(family)) this.checkScript(f, family, content);
      if (this.opts.base && MARKUP.has(family)) this.checkAgainstBase(f, content);
    }
    this.reportDuplicates();
    this.reportSelectors();
    this.reportMediaQueries();
    if (this.opts.mode === 'dir') this.reportUnusedClasses();
    return this.result();
  }

  // -- kích thước ------------------------------------------------

  checkSize(file, family, lines) {
    const limit = LIMITS.fileLines[family];
    if (limit && lines.length > limit) {
      this.fact('FILE_LARGE', file, lines.length,
        `${lines.length} dòng (ngưỡng ${family} = ${limit})`, { value: lines.length, limit });
    }
  }

  // -- block lặp -------------------------------------------------

  normalizeLine(family, raw) {
    let s = raw.trim();
    if (!s) return null;
    if (/^(\/\/|\/\*|\*|<!--|#(?!\{))/.test(s)) return null;
    if (s === '}' || s === '{' || s === ');' || s === '},' || s === '];') return null;
    s = s.replace(/\s+/g, ' ');
    if (s.length < 8) return null;
    return `${family in { css: 1, scss: 1, less: 1 } ? 'style' : family}|${s}`;
  }

  collectDuplicates(file, family, lines) {
    const norm = [];
    lines.forEach((raw, i) => {
      const n = this.normalizeLine(family, raw);
      if (n) norm.push({ text: n, line: i + 1 });
    });
    const win = MARKUP.has(family) ? LIMITS.dupWindowMarkup : LIMITS.dupWindow;
    for (let i = 0; i + win <= norm.length; i++) {
      const w = norm.slice(i, i + win);
      const h = sha1(w.map(x => x.text).join('\n'));
      if (!this.dupIndex.has(h)) this.dupIndex.set(h, []);
      this.dupIndex.get(h).push({ file, line: w[0].line, endLine: w[w.length - 1].line, family, win });
    }
  }

  reportDuplicates() {
    const groups = [];
    for (const [h, hits] of this.dupIndex) {
      if (hits.length < 2) continue;
      // bỏ các cửa sổ chồng lấn trong cùng file (cùng 1 khối bị đếm nhiều lần)
      const spread = [];
      for (const hit of hits) {
        const near = spread.find(s => s.file === hit.file && Math.abs(s.line - hit.line) < hit.win);
        if (!near) spread.push(hit);
      }
      if (spread.length < 2) continue;
      groups.push({ hash: h, hits: spread });
    }
    groups.sort((a, b) => b.hits.length - a.hits.length);
    const seenPairs = new Set();
    let emitted = 0;
    for (const g of groups) {
      if (emitted >= LIMITS.maxDupGroups) {
        this.fact('DUP_BLOCK_TRUNCATED', g.hits[0].file, g.hits[0].line,
          `còn ${groups.length - emitted} nhóm block lặp nữa chưa liệt kê (cắt ở ${LIMITS.maxDupGroups})`);
        break;
      }
      const key = g.hits.map(h => `${h.file}:${h.line}`).sort().join('|');
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const first = g.hits[0];
      this.fact('DUP_BLOCK', first.file, first.line,
        `${first.win}+ dòng giống nhau ở ${g.hits.length} chỗ: ` +
        g.hits.map(h => `${this.rel(h.file)}:${h.line}-${h.endLine}`).join(', '),
        { occurrences: g.hits.map(h => ({ file: this.rel(h.file), line: h.line, endLine: h.endLine })) });
      emitted++;
    }
  }

  // -- chung -----------------------------------------------------

  checkCommon(file, family, content) {
    eachMatch(content, /\b(TODO|FIXME|XXX|HACK)\b[:\s]?(.{0,80})/g, (m, line) => {
      this.fact('TODO_MARKER', file, line, `${m[1]}: ${(m[2] || '').trim()}`);
    });
    // Gom theo host: một landing có 50 URL cùng CDN là MỘT sự kiện, không phải 50.
    const byHost = new Map();
    eachMatch(content, /https?:\/\/[^\s"'`)<>]+/g, (m, line) => {
      let host = '';
      try { host = new URL(m[0]).host; } catch { return; }
      if (/^(www\.)?(w3\.org|schema\.org|localhost)/.test(host)) return;
      if (!byHost.has(host)) byHost.set(host, []);
      byHost.get(host).push({ line, url: m[0].slice(0, 120) });
    });
    for (const [host, hits] of byHost) {
      this.fact('HARDCODED_URL', file, hits[0].line,
        `${host} — ${hits.length} chỗ, dòng ${hits.slice(0, LIMITS.urlListCap).map(h => h.line).join(', ')}` +
        (hits.length > LIMITS.urlListCap ? ` … (+${hits.length - LIMITS.urlListCap})` : '') +
        ` — ví dụ: ${hits[0].url}`,
        { host, count: hits.length, lines: hits.slice(0, LIMITS.urlListCap).map(h => h.line) });
    }
  }

  // -- markup ----------------------------------------------------

  checkMarkup(file, family, content) {
    if (family === 'twig') this.signals.twig = true;

    const inv = contractInventory(content);
    this.signals.pmHooks += inv.pm.size;

    // hook pm__ — kiểm kê + bẫy phân cách
    const pmNames = [...inv.pm.keys()];
    if (pmNames.length) {
      this.fact('PM_INVENTORY', file, inv.pm.get(pmNames[0])[0],
        `${pmNames.length} hook pm__: ${pmNames.slice(0, 40).join(', ')}${pmNames.length > 40 ? ' …' : ''}`,
        { hooks: pmNames });
    }
    const byShape = new Map();
    for (const n of pmNames) {
      const shape = n.replace(/[-_]/g, '').toLowerCase();
      if (!byShape.has(shape)) byShape.set(shape, []);
      byShape.get(shape).push(n);
    }
    for (const [, names] of byShape) {
      if (names.length > 1) {
        this.fact('PM_SEPARATOR_TRAP', file, inv.pm.get(names[0])[0],
          `cùng file có ${names.join(' và ')} — chỉ khác gạch ngang/gạch dưới`, { names });
      }
    }

    // <any> placeholder còn sót
    eachMatch(content, /<any\b[^>]*>/gi, (m, line) => {
      this.fact('ANY_PLACEHOLDER', file, line, `còn placeholder ${m[0].slice(0, 60)}`);
    });

    // id trùng trong cùng file
    for (const [id, lines] of inv.ids) {
      if (lines.length > 1) this.fact('DUPLICATE_ID', file, lines[0], `id="${id}" xuất hiện ${lines.length} lần (dòng ${lines.join(', ')})`);
    }

    // label for không có id khớp
    for (const [target, lines] of inv.fors) {
      if (!inv.ids.has(target)) this.fact('LABEL_FOR_ORPHAN', file, lines[0], `for="${target}" nhưng file không có id nào khớp`);
    }

    // field form thiếu name
    // Chỉ báo field mang dữ liệu. Ngoài form (hoặc file là partial không có <form>) thì hạ tin cậy:
    // đó có thể là ô tìm kiếm/toggle mà JS đọc bằng selector, không cần name.
    const NO_DATA = new Set(['button', 'submit', 'reset', 'image']);
    for (const f of inv.fields) {
      if (f.name) continue;
      if (f.type && NO_DATA.has(f.type.toLowerCase())) continue;
      const empty = f.name === '';
      const where = f.inForm
        ? `trong <form ${f.formLabel}>${f.formIsSearch ? ' — form tìm kiếm, thường không cần name' : ''}`
        : (inv.hasForm ? 'ngoài <form>' : 'file không có <form> (có thể là partial)');
      this.fact('FIELD_NO_NAME', file, f.line,
        `<${f.tag}${f.type ? ` type="${f.type}"` : ''}${f.id ? ` id="${f.id}"` : ''}> ` +
        `${empty ? 'có name=""' : 'không có thuộc tính name'} — ${where}`,
        {
          inForm: f.inForm, hasForm: inv.hasForm, nameEmpty: empty, form: f.formLabel,
          confidence: f.inForm && !f.formIsSearch ? 'high' : 'low',
        });
    }

    // handler inline + style inline
    const handlers = [];
    eachMatch(content, /\son(click|change|submit|input|load|error|focus|blur)\s*=/gi, (m, line) => handlers.push({ line, ev: m[1] }));
    if (handlers.length) {
      this.fact('INLINE_HANDLER', file, handlers[0].line,
        `${handlers.length} handler inline: ` + handlers.slice(0, 20).map(h => `on${h.ev}@${h.line}`).join(', ') +
        (handlers.length > 20 ? ` … (+${handlers.length - 20})` : ''),
        { count: handlers.length, lines: handlers.slice(0, 20).map(h => h.line) });
    }
    let inlineStyle = 0; let firstInline = 0;
    eachMatch(content, /\sstyle\s*=\s*["'][^"']+["']/g, (m, line) => { inlineStyle++; if (!firstInline) firstInline = line; });
    if (inlineStyle) this.fact('INLINE_STYLE', file, firstInline, `${inlineStyle} thuộc tính style="" viết thẳng trong markup`, { count: inlineStyle });

  }

  // -- so với base -----------------------------------------------

  checkAgainstBase(file, content) {
    const old = baseVersion(this.opts.repoRoot, this.opts.base, file);
    if (old == null) return;                       // file mới, không có gì để so
    const a = contractInventory(old);
    const b = contractInventory(content);

    const removed = [...a.pm.keys()].filter(k => !b.pm.has(k));
    const added = [...b.pm.keys()].filter(k => !a.pm.has(k));

    for (const r of removed) {
      const near = added.find(x =>
        x.replace(/[-_]/g, '').toLowerCase() === r.replace(/[-_]/g, '').toLowerCase() ||
        levenshtein(x, r) <= 2);
      if (near) {
        this.fact('PM_HOOK_RENAMED', file, (b.pm.get(near) || [0])[0],
          `hook "${r}" ở bản base bị đổi thành "${near}"`, { from: r, to: near });
      } else {
        this.fact('PM_HOOK_REMOVED', file, 0, `hook "${r}" có ở bản base, không còn ở bản mới`, { hook: r });
      }
    }
    for (const x of added) {
      const paired = removed.some(r =>
        x.replace(/[-_]/g, '').toLowerCase() === r.replace(/[-_]/g, '').toLowerCase() ||
        levenshtein(x, r) <= 2);
      if (!paired) this.fact('PM_HOOK_ADDED', file, (b.pm.get(x) || [0])[0], `hook mới "${x}" (không có ở base)`, { hook: x });
    }

    for (const id of [...a.ids.keys()].filter(k => !b.ids.has(k))) {
      this.fact('ID_REMOVED', file, 0, `id="${id}" có ở base, không còn ở bản mới`, { id });
    }
    for (const d of [...a.data.keys()].filter(k => !b.data.has(k))) {
      this.fact('DATA_ATTR_REMOVED', file, 0, `thuộc tính ${d} có ở base, không còn ở bản mới`, { attr: d });
    }

    // Ghép field base ↔ field mới theo 3 vòng: id khớp → name khớp → cùng tag+type theo thứ tự.
    // Ghép theo thứ tự này để việc ĐỔI name vẫn hiện ra là "đổi hợp đồng", không phải "xóa rồi thêm".
    const label = (f) => `<${f.tag}${f.name ? ` name="${f.name}"` : ''}${f.id ? ` id="${f.id}"` : ''}>`;
    const pairs = [];
    const pairedOld = new Set(), pairedNew = new Set();
    const matchRound = (fn) => {
      for (const o of a.fields) {
        if (pairedOld.has(o.order)) continue;
        const n = b.fields.find(x => !pairedNew.has(x.order) && fn(o, x));
        if (n) { pairedOld.add(o.order); pairedNew.add(n.order); pairs.push([o, n]); }
      }
    };
    matchRound((o, n) => o.id && n.id && o.id === n.id);
    matchRound((o, n) => o.name && n.name && o.name === n.name);
    matchRound((o, n) => o.tag === n.tag && (o.type || '') === (n.type || ''));

    for (const [oldF, newF] of pairs) {
      for (const at of ['name', 'type', 'id']) {
        if ((oldF[at] || null) !== (newF[at] || null)) {
          this.fact('FIELD_CONTRACT_CHANGED', file, newF.line,
            `${label(oldF)}: ${at} "${oldF[at]}" → "${newF[at]}"`,
            { field: oldF.name || oldF.id || `${oldF.tag}#${oldF.order}`, attr: at, from: oldF[at], to: newF[at] });
        }
      }
    }
    for (const o of a.fields) {
      if (!pairedOld.has(o.order)) {
        this.fact('FIELD_REMOVED', file, 0, `${label(o)} có ở bản base, không còn ở bản mới`,
          { field: o.name || o.id || `${o.tag}#${o.order}` });
      }
    }
  }

  // -- style -----------------------------------------------------

  checkStyle(file, family, content, lines) {
    const imp = [];
    eachMatch(content, /!important/g, (m, line) => imp.push({ line, text: (lines[line - 1] || '').trim().slice(0, 80) }));
    if (imp.length) {
      this.fact('IMPORTANT', file, imp[0].line,
        `${imp.length} chỗ !important — dòng ${imp.slice(0, 20).map(i => i.line).join(', ')}` +
        (imp.length > 20 ? ` … (+${imp.length - 20})` : ''),
        { count: imp.length, lines: imp.slice(0, 20).map(i => i.line), samples: imp.slice(0, 5).map(i => i.text) });
    }

    const zs = [];
    eachMatch(content, /z-index\s*:\s*(-?\d+)/g, (m, line) => zs.push({ line, value: parseInt(m[1], 10) }));
    if (zs.length) {
      const high = zs.filter(z => z.value >= LIMITS.zIndexHigh);
      this.fact('Z_INDEX', file, (high[0] || zs[0]).line,
        `${zs.length} khai báo z-index: ` + zs.slice(0, 20).map(z => `${z.value}@${z.line}`).join(', ') +
        (zs.length > 20 ? ` … (+${zs.length - 20})` : '') +
        (high.length ? ` — ${high.length} chỗ >= ${LIMITS.zIndexHigh}` : ''),
        { count: zs.length, max: Math.max(...zs.map(z => z.value)), high: high.length > 0, values: zs.slice(0, 20) });
    }

    eachMatch(content, /(?:min-|max-)?width\s*:\s*(\d{3,})px/g, (m, line) => {
      const v = parseInt(m[1], 10);
      if (v < LIMITS.containerPx) return;
      if (/@media|@container/.test(lines[line - 1] || '')) return;   // breakpoint, không phải kích thước cứng
      this.fact('FIXED_WIDTH', file, line, `${m[0]} — kích thước cứng cỡ container`, { value: v });
    });

    eachMatch(content, /@media([^{]{3,120})\{/g, (m, line) => {
      const q = m[1].replace(/\s+/g, ' ').trim();
      if (!this.mediaQueries.has(q)) this.mediaQueries.set(q, []);
      this.mediaQueries.get(q).push({ file, line });
    });

    // selector + class định nghĩa (dùng cho check trùng & class chết)
    let depth = 0, deepReported = false;
    lines.forEach((raw, i) => {
      const line = i + 1;
      const text = raw.replace(/\/\*.*?\*\//g, '').trim();
      const opens = (text.match(/\{/g) || []).length;
      const closes = (text.match(/\}/g) || []).length;
      if (opens && !/^@(media|supports|keyframes|font-face|include|if|else|each|for|mixin)/.test(text)) {
        const sel = text.slice(0, text.indexOf('{')).trim();
        if (sel && !sel.startsWith('@') && sel.length < 200) {
          const key = sel.replace(/\s+/g, ' ');
          if (depth === 0) {
            if (!this.selectorIndex.has(key)) this.selectorIndex.set(key, []);
            this.selectorIndex.get(key).push({ file, line });
          }
          for (const cm of key.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) {
            if (!this.classDefs.has(cm[1])) this.classDefs.set(cm[1], []);
            this.classDefs.get(cm[1]).push({ file, line });
          }
        }
      }
      depth += opens - closes;
      if (depth >= LIMITS.nestDepth && !deepReported && (family === 'scss' || family === 'less')) {
        this.fact('DEEP_NESTING', file, line, `lồng ${depth} cấp (ngưỡng ${LIMITS.nestDepth})`, { depth });
        deepReported = true;
      }
      if (depth < 0) depth = 0;
    });
  }

  reportSelectors() {
    for (const [sel, hits] of this.selectorIndex) {
      if (hits.length < 2) continue;
      const files = new Set(hits.map(h => h.file));
      this.fact('SELECTOR_REDEFINED', hits[0].file, hits[0].line,
        `"${sel}" định nghĩa ${hits.length} lần ở ${files.size} file: ` + hits.map(h => `${this.rel(h.file)}:${h.line}`).join(', '),
        { selector: sel, occurrences: hits.map(h => ({ file: this.rel(h.file), line: h.line })) });
    }
  }

  reportMediaQueries() {
    const list = [...this.mediaQueries.entries()].map(([q, hits]) => ({ query: q, count: hits.length, first: `${this.rel(hits[0].file)}:${hits[0].line}` }));
    if (list.length) {
      this.facts.push({
        check: 'MEDIA_QUERIES', file: list[0].first.split(':')[0], line: 0,
        detail: `${list.length} breakpoint khác nhau: ` + list.map(l => `${l.query} (${l.count})`).join(' | '),
        queries: list,
      });
    }
  }

  reportUnusedClasses() {
    const unused = [];
    for (const [cls, hits] of this.classDefs) {
      if (cls.startsWith('pm__')) continue;              // platform có thể dùng, không kết luận
      if (this.tokenUse.has(cls)) continue;
      unused.push({ cls, file: this.rel(hits[0].file), line: hits[0].line });
    }
    if (!unused.length) return;
    const shown = unused.slice(0, LIMITS.maxDeadClasses);
    this.fact('CLASS_MAYBE_UNUSED', path.join(this.opts.repoRoot || '', shown[0].file), shown[0].line,
      `${unused.length} class định nghĩa trong CSS nhưng không thấy trong markup/script đã quét` +
      (unused.length > shown.length ? ` (liệt kê ${shown.length} đầu)` : '') + ': ' + shown.map(u => `.${u.cls} (${u.file}:${u.line})`).join(', '),
      { candidates: shown, total: unused.length });
  }

  // -- script ----------------------------------------------------

  checkScript(file, family, content) {
    const js = MARKUP.has(family)
      ? [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n')
      : content;
    if (!js.trim()) return;
    const dbg = [];
    eachMatch(content, /\b(console\.(log|warn|info|debug|table)|debugger)\b/g, (m, line) => dbg.push({ line, what: m[0] }));
    if (dbg.length) {
      this.fact('DEBUG_LEFTOVER', file, dbg[0].line,
        `${dbg.length} chỗ: ` + dbg.slice(0, 20).map(d => `${d.what}@${d.line}`).join(', ') +
        (dbg.length > 20 ? ` … (+${dbg.length - 20})` : ''),
        { count: dbg.length, lines: dbg.slice(0, 20).map(d => d.line) });
    }

    eachMatch(content, /\.innerHTML\s*=\s*([^;\n]{1,120})/g, (m, line) => {
      const rhs = m[1].trim();
      const pureLiteral = /^(['"`])[^`'"$]*\1\s*$/.test(rhs);
      if (!pureLiteral) this.fact('INNERHTML_DYNAMIC', file, line, `innerHTML = ${rhs.slice(0, 80)}`);
    });

    eachMatch(content, /document\.(querySelector|getElementById)\s*\([^)]*\)\s*\.\s*(addEventListener|style|classList|value|innerHTML|src|href|textContent|checked)/g,
      (m, line) => this.fact('UNGUARDED_DOM', file, line, `${m[0].slice(0, 90)} — không kiểm tra null trước khi dùng`));

    let add = 0, remove = 0;
    eachMatch(content, /\.addEventListener\s*\(/g, () => add++);
    eachMatch(content, /\.removeEventListener\s*\(/g, () => remove++);
    if (add) this.fact('LISTENER_BALANCE', file, 0, `addEventListener ${add} lần / removeEventListener ${remove} lần`, { add, remove });

    eachMatch(content, /setTimeout\s*\(\s*(?:function|\(|[A-Za-z_$])[^,]{0,200},\s*(\d{2,6})\s*\)/g, (m, line) => {
      const d = parseInt(m[1], 10);
      if (d >= LIMITS.timeoutWait) this.fact('TIMEOUT_DELAY', file, line, `setTimeout ... ${d}ms`, { value: d });
    });

    if (/\$\s*\(/.test(js)) this.signals.jquery = true;
    if (/\$\s*\(/.test(js) && /document\.(querySelector|getElementById)/.test(js)) {
      this.fact('MIXED_DOM_API', file, 0, 'file dùng lẫn jQuery $() và DOM API thuần');
    }

    const keys = new Map();
    eachMatch(content, /\b(localStorage|sessionStorage)\.(get|set)Item\s*\(\s*['"]([^'"]+)/g, (m, line) => {
      const k = `${m[1]}:${m[3]}`;
      if (!keys.has(k)) keys.set(k, { store: m[1], key: m[3], lines: [] });
      keys.get(k).lines.push(line);
    });
    if (keys.size) {
      const list = [...keys.values()];
      this.fact('STORAGE_KEY', file, list[0].lines[0],
        list.map(k => `${k.store}["${k.key}"]@${k.lines.join('/')}`).join(', '),
        { keys: list });
    }

    // khối code bị comment (>=3 dòng liên tiếp)
    const lines = content.split('\n');
    let run = 0, start = 0;
    lines.forEach((raw, i) => {
      const t = raw.trim();
      const isCommentedCode = /^(\/\/|\*|<!--)/.test(t) && /[;{}()=<]/.test(t) && t.length > 12;
      if (isCommentedCode) { if (!run) start = i + 1; run++; }
      else { if (run >= 3) this.fact('COMMENTED_CODE', file, start, `${run} dòng code bị comment (dòng ${start}-${i})`, { lines: run }); run = 0; }
    });
    if (run >= 3) this.fact('COMMENTED_CODE', file, start, `${run} dòng code bị comment tới hết file`, { lines: run });
  }

  // -- kết quả ---------------------------------------------------

  result() {
    const byCheck = {};
    for (const f of this.facts) byCheck[f.check] = (byCheck[f.check] || 0) + 1;
    const packs = [];
    if (this.signals.pmHooks > 0) packs.push('landing-promotion');
    if (this.signals.twig) packs.push('mainsite-twig');
    packs.push('frontend');
    return {
      meta: {
        tool: 'code-audit/scan.js', version: 1,
        mode: this.opts.mode, base: this.opts.base || null,
        repoRoot: this.opts.repoRoot || null, scannedAt: new Date().toISOString(),
      },
      profile: { packs, signals: this.signals },
      metrics: this.metrics,
      summary: { factCount: this.facts.length, byCheck },
      facts: this.facts.sort((a, b) => a.check.localeCompare(b.check) || a.file.localeCompare(b.file) || a.line - b.line),
    };
  }
}

// ---------------------------------------------------------------- bản in gọn

const CHECK_LABEL = {
  PM_HOOK_REMOVED: 'Hook pm__ mất so với base',
  PM_HOOK_RENAMED: 'Hook pm__ bị đổi tên',
  PM_HOOK_ADDED: 'Hook pm__ thêm mới',
  PM_SEPARATOR_TRAP: 'Bẫy gạch ngang / gạch dưới',
  PM_INVENTORY: 'Kiểm kê hook pm__',
  FIELD_CONTRACT_CHANGED: 'Thuộc tính field form đổi',
  FIELD_REMOVED: 'Field form mất so với base',
  FIELD_NO_NAME: 'Field form không có name',
  ID_REMOVED: 'id mất so với base',
  DATA_ATTR_REMOVED: 'data-* mất so với base',
  ANY_PLACEHOLDER: 'Còn placeholder <any>',
  DUPLICATE_ID: 'id trùng trong 1 file',
  LABEL_FOR_ORPHAN: 'label for không có id khớp',
  DUP_BLOCK: 'Block lặp',
  DUP_BLOCK_TRUNCATED: 'Block lặp (còn nữa)',
  SELECTOR_REDEFINED: 'Selector định nghĩa nhiều lần',
  CLASS_MAYBE_UNUSED: 'Class có thể đã chết',
  FILE_LARGE: 'File phình',
  DEEP_NESTING: 'Lồng sâu',
  IMPORTANT: '!important',
  Z_INDEX: 'z-index',
  FIXED_WIDTH: 'Kích thước cứng',
  MEDIA_QUERIES: 'Breakpoint đang dùng',
  INLINE_HANDLER: 'Handler inline',
  INLINE_STYLE: 'style inline',
  INNERHTML_DYNAMIC: 'innerHTML nhận biến',
  UNGUARDED_DOM: 'DOM query không guard',
  LISTENER_BALANCE: 'Cân bằng listener',
  TIMEOUT_DELAY: 'setTimeout chờ',
  MIXED_DOM_API: 'Lẫn jQuery và DOM thuần',
  DEBUG_LEFTOVER: 'console/debugger còn sót',
  COMMENTED_CODE: 'Code bị comment',
  TODO_MARKER: 'TODO/FIXME',
  HARDCODED_URL: 'URL hard-code',
  STORAGE_KEY: 'Key localStorage',
};

const CONTRACT_CHECKS = new Set([
  'PM_HOOK_REMOVED', 'PM_HOOK_RENAMED', 'PM_SEPARATOR_TRAP', 'FIELD_CONTRACT_CHANGED',
  'FIELD_REMOVED', 'ID_REMOVED', 'DATA_ATTR_REMOVED', 'ANY_PLACEHOLDER', 'DUPLICATE_ID',
  'LABEL_FOR_ORPHAN', 'FIELD_NO_NAME',
]);

function printHuman(res) {
  const L = [];
  L.push(`code-audit scan — ${res.metrics.files} file, ${res.metrics.totalLines} dòng` +
    (res.meta.base ? `, so với base ${String(res.meta.base).slice(0, 12)}` : ', không so base'));
  L.push(`rule pack: ${res.profile.packs.join(' + ')}`);
  L.push('');
  const contract = res.facts.filter(f => CONTRACT_CHECKS.has(f.check));
  if (contract.length) {
    L.push('== HỢP ĐỒNG PLATFORM (soi trước tiên) ==');
    for (const f of contract) L.push(`  [${CHECK_LABEL[f.check] || f.check}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.detail}`);
    L.push('');
  } else {
    L.push('== HỢP ĐỒNG PLATFORM: không thấy vi phạm đếm được ==');
    L.push('');
  }
  L.push('== ĐẾM THEO CHECK ==');
  for (const [k, v] of Object.entries(res.summary.byCheck).sort((a, b) => b[1] - a[1])) {
    if (CONTRACT_CHECKS.has(k)) continue;
    L.push(`  ${String(v).padStart(4)}  ${CHECK_LABEL[k] || k}`);
  }
  L.push('');
  L.push('(Đây là SỰ KIỆN, chưa phải issue. Lớp AI đọc facts + code rồi mới phán mức độ.)');
  return L.join('\n');
}

// ---------------------------------------------------------------- main

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || (!opts.dir && !opts.files)) { usage(); process.exit(opts.help ? 0 : 1); }

  let files = [];
  let mode = 'dir';
  if (opts.files) {
    mode = 'files';
    const list = opts.files.startsWith('@')
      ? fs.readFileSync(opts.files.slice(1), 'utf8').split(/\r?\n/)
      : opts.files.split(',');
    files = list.map(s => s.trim()).filter(Boolean).map(p => path.resolve(p))
      .filter(p => { try { return fs.statSync(p).isFile() && EXT_FAMILY[path.extname(p).toLowerCase()]; } catch { return false; } })
      // Danh sách từ git diff có thể chứa output đã build (repo cdn-source commit cả dist/prod).
      // Soi cả source lẫn output = mọi phát hiện bị đếm 2 lần.
      .filter(p => {
        const segs = p.split(path.sep);
        if (segs.some(s => SKIP_DIRS.has(s))) return false;
        if (!opts.includeDist && segs.some(s => OUTPUT_DIRS.has(s))) return false;
        if (/\.min\.(js|css)$/i.test(p)) return false;
        return true;
      });
  } else {
    const dir = path.resolve(opts.dir);
    files = walk(dir, opts.includeDist);
  }

  // Neo theo --dir/--repo, KHÔNG theo file đầu tiên: file đầu có thể nằm trong một git worktree
  // lồng bên trong (vd .claude/worktrees/…), khi đó repoRoot lệch và mọi path in ra thành tuyệt đối.
  const anchor = opts.repo ? path.resolve(opts.repo)
    : (opts.dir ? path.resolve(opts.dir) : (files[0] ? path.dirname(files[0]) : process.cwd()));
  const repoRoot = findRepoRoot(anchor) || (opts.dir ? path.resolve(opts.dir) : anchor);
  const base = opts.base ? resolveBase(repoRoot, opts.base) : null;
  if (opts.base && !base) console.error(`[code-audit] cảnh báo: không giải được base "${opts.base}" — bỏ qua phần so với base`);

  if (files.length > 3000) {
    console.error(`[code-audit] cảnh báo: ${files.length} file — đang soi cả monorepo. ` +
      'Báo cáo sẽ loãng; nên chỉ định đúng folder dự án (--dir products/<game>/landing/<campaign>).');
  }
  if (!files.length) { console.error('[code-audit] không có file frontend nào trong vùng soi.'); }

  const scanner = new Scanner({ ...opts, mode, repoRoot, base, dir: opts.dir ? path.resolve(opts.dir) : null });
  const res = scanner.scan(files);

  const json = JSON.stringify(res, null, 2);
  if (opts.outFile) { fs.writeFileSync(opts.outFile, json); console.error(`[code-audit] facts JSON → ${opts.outFile}`); }
  if (opts.json) process.stdout.write(json + '\n');
  else process.stdout.write(printHuman(res) + '\n');
}

main();
