#!/usr/bin/env node
// handoff-drift --dist <dist/index.html> <file bàn giao>… [--json] [--strict] — bắt bản bàn giao lệch bản build (R-HO-5, R-HO-11).
//
// Đo 13/10/2026 trên 374 bug QC: lỗi SYNC (local đúng, bản bàn giao lệch) ra tới production mà không cổng nào bắt —
// HTML giao BE thiếu 1 commit markup (LAN trung-thu #22), BE push đè mất fix FE (CFL R1#6), số ngày copy nhầm (mwly R26).
// mainsite/  = bản FE giao, phải khớp dist từng class/id/data/chữ/asset → lệch là ERROR.
// Promotion/ = bản BE đã gắn dữ liệu, nhân item, thêm hook riêng → chỉ WARN hook dist có mà bản này thiếu.
// Exit: 0 sạch (hoặc chỉ warn) · 1 có error (hoặc warn khi --strict) · 2 sai tham số.
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opts = { dist: '', files: [], json: false, strict: false };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dist') opts.dist = argv[++i];
  else if (argv[i] === '--json') opts.json = true;
  else if (argv[i] === '--strict') opts.strict = true;
  else if (argv[i].startsWith('-')) die(`Tham số lạ: ${argv[i]}`);
  else opts.files.push(argv[i]);
}
if (!opts.dist || !opts.files.length) die('Cần --dist <dist/index.html> và ít nhất 1 file bàn giao');

const HOOK_CLASS = /^(pm__|MS__|MJ__|popup_)/;
const LIST_LIMIT = 8;

// Bản bàn giao đổi đường dẫn tương đối thành URL CDN tuyệt đối — so 2 đoạn cuối (thư mục/tên file) là đủ phân biệt.
const pathTail = url => url.split(/[?#]/)[0].replace(/^.*\/dist\//, '').split('/').filter(Boolean).slice(-2).join('/');
const looksLikePath = value => /\/|\.(png|jpe?g|webp|gif|svg|mp3|mp4|css|js)$/i.test(value);

function die(msg) {
  console.error(msg);
  process.exit(2);
}

// Mỗi đặc trưng là "loại␟giá trị"; đếm số lần xuất hiện để bắt cả item list bị thiếu.
function featuresOf(html) {
  const body = html
    .replace(/<%[\s\S]*?%>/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const features = new Map();
  const add = (kind, value) => {
    const key = kind + '␟' + value;
    features.set(key, (features.get(key) || 0) + 1);
  };
  for (const [, list] of body.matchAll(/\bclass="([^"]*)"/g)) list.split(/\s+/).filter(Boolean).forEach(c => add('class', c));
  for (const [, id] of body.matchAll(/\bid="([^"]+)"/g)) add('id', id);
  for (const [, name, value] of body.matchAll(/\b(data-[\w-]+)="([^"]*)"/g)) add('data', `${name}=${looksLikePath(value) ? pathTail(value) : value}`);
  for (const [, url] of body.matchAll(/\b(?:src|href|poster)="([^"]+)"/g)) add('asset', pathTail(url));
  for (const [, text] of body.matchAll(/>([^<>]+)</g)) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean) add('text', clean);
  }
  return features;
}

const kindOf = key => key.slice(0, key.indexOf('␟'));
const valueOf = key => key.slice(key.indexOf('␟') + 1);

function compareMainsite(dist, handoff) {
  const errors = [];
  for (const key of new Set([...dist.keys(), ...handoff.keys()])) {
    const missing = (dist.get(key) || 0) - (handoff.get(key) || 0);
    if (missing > 0) errors.push({ kind: kindOf(key), value: valueOf(key), side: 'dist-only', count: missing });
    if (missing < 0) errors.push({ kind: kindOf(key), value: valueOf(key), side: 'handoff-only', count: -missing });
  }
  return { errors, warns: [] };
}

function compareFromBE(dist, handoff) {
  const isHook = key => {
    const kind = kindOf(key);
    if (kind === 'class') return HOOK_CLASS.test(valueOf(key));
    return kind === 'id' || kind === 'data';
  };
  const hookName = key => {
    if (kindOf(key) === 'data') return 'data␟' + valueOf(key).split('=')[0];
    if (valueOf(key).startsWith('popup_')) return 'popup␟' + valueOf(key);
    return key;
  };
  const handoffHooks = new Set([...handoff.keys()].filter(isHook).map(hookName));
  const warns = [...new Set([...dist.keys()].filter(isHook).map(hookName))]
    .filter(key => !handoffHooks.has(key))
    .map(key => ({ kind: kindOf(key), value: valueOf(key), side: 'dist-only' }));
  return { errors: [], warns };
}

const distFeatures = featuresOf(fs.readFileSync(opts.dist, 'utf8'));
const files = opts.files.map(file => {
  const mode = /\/promotion\//i.test(file) ? 'promotion' : 'mainsite';
  const handoff = featuresOf(fs.readFileSync(file, 'utf8'));
  const result = mode === 'promotion' ? compareFromBE(distFeatures, handoff) : compareMainsite(distFeatures, handoff);
  return { file, mode, ...result };
});

const failed = files.some(f => f.errors.length || (opts.strict && f.warns.length));

if (opts.json) {
  console.log(JSON.stringify({ dist: opts.dist, files }, null, 2));
} else {
  for (const f of files) {
    const mark = f.errors.length ? '✗' : f.warns.length ? '⚠' : '✓';
    console.log(`${mark} ${f.file} [${f.mode}] — ${f.errors.length} error · ${f.warns.length} warn`);
    for (const issue of [...f.errors, ...f.warns].slice(0, LIST_LIMIT)) {
      const where = issue.side === 'dist-only' ? 'dist có, bàn giao thiếu' : 'bàn giao có, dist không có';
      console.log(`   ${issue.kind.padEnd(5)} ${where}${issue.count > 1 ? ` ×${issue.count}` : ''}: ${issue.value.slice(0, 80)}`);
    }
    const hidden = f.errors.length + f.warns.length - LIST_LIMIT;
    if (hidden > 0) console.log(`   … còn ${hidden} mục (xem --json)`);
  }
}
process.exit(failed ? 1 : 0);
