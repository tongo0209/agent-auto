#!/usr/bin/env node
// landing-parity <campaign> [--ref <dir>]… [--json <out>] [--strict] [--base-structure <md>] — REF có mà MỚI thiếu (kèm file:line để copy) · MỚI có mà REF không (class MS__/MJ__ lạ = 🔴)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SIBLING_REFS = 2;
const DEFAULT_BASE_STRUCTURE = path.join(os.homedir(), '.claude/knowledge/code-developer/base-structure.md');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'html-pro', 'optimized', '.git', '.claude']);
const MIN_REFS_WHEN_MANY = 2;

const FEATURES = {
  config: { files: ['config.js'], re: /(?:^|[{,])\s*["']?([A-Za-z_]\w*)["']?\s*:/gm },
  twigInclude: { ext: ['.twig'], re: /{%-?\s*(?:include|extends|import|embed)\s+["']([^"']+)["']/g, map: (v) => path.basename(v) },
  msClass: { ext: ['.twig', '.html'], re: /\b(MS__(?!sprite-)[\w-]+)/g },
  mjClass: { ext: ['.twig', '.html'], re: /\b(MJ__[\w-]+)/g },
  pmClass: { ext: ['.twig', '.html'], re: /\b(pm__[\w-]+)/g },
  dataAttr: { ext: ['.twig', '.html'], re: /\s(data-[\w-]+)=/g },
  jsPlatform: { ext: ['.js'], re: /\b((?:window\.)?libraryMainsite\.[\w.]+|varMS\.\w+)/g, map: (v) => v.replace(/^window\./, '') },
  jsEvent: { ext: ['.js'], re: /\.(?:on|trigger)\(\s*["']([\w:.-]+)["']/g },
  scssInclude: { ext: ['.scss'], re: /@include\s+(?!sprite\b)([\w-]+)/g },
  scssImport: { ext: ['.scss'], re: /@(?:import|use)\s+["']([^"']+)["']/g, map: (v) => path.basename(v) },
  npmScript: { files: ['package.json'], re: /"([\w:-]+)"\s*:\s*"[^"]*"/g, section: /"scripts"\s*:\s*{([^}]*)}/ },
};

const argv = process.argv.slice(2);
const opts = { refs: [], strict: false, all: false, minRefs: null, baseStructure: DEFAULT_BASE_STRUCTURE };
let campaign = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--ref') opts.refs.push(path.resolve(argv[++i]));
  else if (argv[i] === '--json') opts.json = argv[++i];
  else if (argv[i] === '--strict') opts.strict = true;
  else if (argv[i] === '--all') opts.all = true;
  else if (argv[i] === '--min-refs') opts.minRefs = Number(argv[++i]);
  else if (argv[i] === '--base-structure') opts.baseStructure = argv[++i];
  else campaign = path.resolve(argv[i]);
}
if (!campaign) {
  console.error('landing-parity <campaign> [--ref <dir>]… [--json <out>] [--strict]');
  process.exit(2);
}

const refs = opts.refs.length ? opts.refs : defaultRefs(campaign, opts.baseStructure);
const mine = features(campaign);
const theirs = refs.map((r) => ({ ref: r, feats: features(r) }));

const missing = [];
const extra = [];
for (const key of [...Object.keys(FEATURES), 'assetDir']) {
  const refHas = new Map();
  for (const { ref, feats } of theirs) for (const [v, loc] of feats[key]) refHas.has(v) ? refHas.get(v).count++ : refHas.set(v, { ref, loc, count: 1 });
  for (const [v, { ref, loc, count }] of refHas) if (!mine[key].has(v)) missing.push({ feature: key, value: v, ref, loc, count });
  for (const [v, loc] of mine[key]) if (!refHas.has(v)) extra.push({ feature: key, value: v, loc, severity: key === 'msClass' || key === 'mjClass' ? 'red' : 'grey' });
}

// ≥3 ref thì thứ chỉ 1 ref có phần lớn là đặc thù campaign đó, không phải quy ước
const minRefs = opts.minRefs ?? (refs.length >= 3 ? MIN_REFS_WHEN_MANY : 1);
const short = (p) => path.relative(path.dirname(path.dirname(path.dirname(campaign))), p);
missing.sort((a, b) => b.count - a.count);
const shown = missing.filter((m) => m.count >= minRefs);
const reds = extra.filter((e) => e.severity === 'red');
const greys = extra.filter((e) => e.severity !== 'red');
console.log(`landing-parity ${short(campaign)}  vs  refs: ${refs.map(short).join(', ') || '(không có)'}`);
console.log(`\nREF có · MỚI thiếu${shown.length ? ` (${shown.length} mục ≥${minRefs}/${refs.length} ref` : '  — không thiếu gì'}${missing.length > shown.length ? `${shown.length ? '; ' : ' ('}ẩn ${missing.length - shown.length} mục ít ref hơn, --min-refs 1 để xem)` : shown.length ? ')' : ''}`);
for (const m of shown) console.log(`  ${m.feature.padEnd(12)} ${m.value.padEnd(36)} ← ${short(m.ref)}/${m.loc}  (${m.count}/${refs.length} ref)`);
console.log(`\nMỚI có · REF không: ${reds.length ? `🔴 ${reds.length} class MS__/MJ__ lạ` : 'không có class lạ'}${greys.length ? ` (⚪ ${greys.length} mục khác${opts.all ? '' : ', --all để xem'})` : ''}`);
for (const e of [...reds, ...(opts.all ? greys : [])]) console.log(`  ${e.severity === 'red' ? '🔴' : '⚪'} ${e.feature.padEnd(12)} ${e.value.padEnd(36)} ${e.loc}`);
if (reds.length) console.log(`\n🔴 hook MS__/MJ__ của libraryMainsite không tự có — kiểm lại documentsClass.txt trước khi giữ.`);
if (opts.json) fs.writeFileSync(opts.json, JSON.stringify({ campaign, refs, missing, extra }, null, 2));
process.exit(opts.strict && reds.length ? 1 : 0);

function features(dir) {
  const out = {};
  const all = listFiles(dir);
  for (const [key, f] of Object.entries(FEATURES)) {
    const found = new Map();
    const files = f.files ? f.files.map((n) => path.join(dir, n)).filter(fs.existsSync) : all.filter((p) => f.ext.includes(path.extname(p)));
    for (const file of files) {
      const full = fs.readFileSync(file, 'utf8');
      const text = f.section ? full.match(f.section)?.[1] ?? '' : full;
      for (const m of text.matchAll(f.re)) {
        const v = f.map ? f.map(m[1]) : m[1];
        if (!found.has(v)) found.set(v, `${path.relative(dir, file)}:${lineAt(full, (f.section ? full.indexOf(text) : 0) + m.index + m[0].indexOf(m[1]))}`);
      }
    }
    out[key] = found;
  }
  const assetsDir = path.join(dir, 'assets');
  out.assetDir = new Map(fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => [e.name, `assets/${e.name}/`]) : []);
  return out;
}
function lineAt(text, idx) {
  return idx < 0 ? 1 : text.slice(0, idx).split('\n').length;
}

function listFiles(dir) {
  const found = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(ent.name)) continue;
      const p = path.join(d, ent.name);
      ent.isDirectory() ? walk(p) : found.push(p);
    }
  };
  walk(dir);
  return found;
}

function defaultRefs(dir, baseStructure) {
  const parent = path.dirname(dir);
  const siblings = fs.readdirSync(parent, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== path.basename(dir) && fs.existsSync(path.join(parent, e.name, 'config.js')))
    .map((e) => path.join(parent, e.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, SIBLING_REFS);
  const productsRoot = findUp(dir, 'products');
  const fromBase = fs.existsSync(baseStructure) && productsRoot
    ? [...fs.readFileSync(baseStructure, 'utf8').matchAll(/`(?:\.\.\.\/)?([\w-]+\/(?:landing|skin[\w-]*)(?:\/[\w-]+)?)`/g)]
      .map((m) => path.join(productsRoot, m[1]))
      .filter((p) => fs.existsSync(path.join(p, 'config.js')) && p !== dir && p.includes('/landing/') === dir.includes('/landing/'))
    : [];
  return [...new Set([...siblings, ...fromBase])];
}

function findUp(from, name) {
  let d = from;
  while (path.basename(d) !== name && d !== path.dirname(d)) d = path.dirname(d);
  return path.basename(d) === name ? d : null;
}
