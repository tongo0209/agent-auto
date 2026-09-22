#!/usr/bin/env node
// Cổng hợp đồng pm__ (R-PM-7/8) theo ai-template-kit — luật từng mã PG-* ở tools/pm-gate/checks.mjs.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { scanHtml } from './pm-gate/scan.mjs';
import { loadContract, kitFileFor, GAMEPLAYS } from './pm-gate/contract.mjs';
import { runChecks, WARN_CODES } from './pm-gate/checks.mjs';
import { baselineText, splitNew } from './pm-gate/baseline.mjs';
import { noteForAnyFile, readLock } from './lib/project-lock.mjs';

const USAGE = 'Dùng: node tools/pm-gate.mjs <file> [--page <campaignDir>] [--gameplay luckydraw-gift-exchange|payment|none] [--type <STT-slug>] [--ref <campaignDir>] [--baseline <git-ref>|none] [--json]';
const KIT_DIR = process.env.PM_KIT_DIR || join(homedir(), 'VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit');
const OVERRIDES = fileURLToPath(new URL('../rules/pm-kit-overrides.tsv', import.meta.url));
const VALUE_FLAGS = ['--page', '--gameplay', '--type', '--ref', '--baseline'];

function usageError(msg) {
  console.error(`pm-gate lỗi dùng: ${msg}\n${USAGE}`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { json: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (VALUE_FLAGS.includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) usageError(`${arg} thiếu giá trị`);
      opts[arg.slice(2)] = argv[++i];
    } else if (arg.startsWith('--')) usageError(`cờ lạ ${arg}`);
    else opts.files.push(arg);
  }
  return opts;
}

function targetsOf(opts) {
  if (!opts.page) {
    if (opts.files.length !== 1) usageError('cần đúng 1 file (hoặc --page <campaignDir>)');
    if (!existsSync(opts.files[0])) usageError(`không thấy file ${opts.files[0]}`);
    return opts.files;
  }
  const dist = join(opts.page, 'dist');
  if (!existsSync(dist)) usageError(`${dist} chưa có — build trước`);
  const pages = readdirSync(dist).filter((n) => n.endsWith('.html')).map((n) => join(dist, n))
    .filter((f) => readFileSync(f, 'utf8').includes('pm__'));
  if (!pages.length) usageError(`${dist} không có trang .html nào chứa pm__ — build trước`);
  return pages;
}

function gateFile(file, contract, lock, opts) {
  const text = readFileSync(file, 'utf8');
  const mode = opts.page ? 'page' : 'file';
  const fullDocument = mode === 'page' || /<body[\s>]/i.test(text);
  const findings = runChecks(scanHtml(text), contract, { fullDocument });
  const base = opts.baseline === 'none' ? null : baselineText(file, opts.baseline || 'HEAD');
  const blocking = findings.filter((f) => !WARN_CODES.has(f.code));
  const { fresh, preexisting } = base === null
    ? { fresh: blocking, preexisting: [] }
    : splitNew(blocking, runChecks(scanHtml(base), contract, { fullDocument }));
  return { file, ...lock, mode, fails: fresh, warns: findings.filter((f) => WARN_CODES.has(f.code)), preexisting };
}

function unlockedResult(file, lock, opts) {
  const fail = { code: 'PG-GAME', msg: 'chưa khoá gameplay — làm bước khoá (R-PM-11) hoặc chạy lại với --gameplay', token: '', lines: [] };
  return { file, ...lock, mode: opts.page ? 'page' : 'file', fails: [fail], warns: [], preexisting: [] };
}

function printText(result) {
  const where = (f) => (f.lines.length ? `  (dòng ${f.lines.slice(0, 8).join(', ')}${f.lines.length > 8 ? '…' : ''})` : '');
  console.log(`pm-gate · ${result.file} · gameplay: ${result.gameplay || 'CHƯA KHOÁ'}`);
  for (const f of result.fails) console.log(`  🔴 ${f.code}  ${f.msg}${where(f)}`);
  for (const f of result.warns) console.log(`  🟡 ${f.code}  ${f.msg}${where(f)}`);
  if (result.preexisting.length) console.log('  ── lỗi có sẵn (nợ):');
  for (const f of result.preexisting) console.log(`  🟡 ${f.code}  ${f.msg}${where(f)}`);
  console.log(result.fails.length ? `  ✗ ${result.fails.length} lỗi chặn — chưa được báo xong` : '  ✓ không có lỗi chặn');
}

const opts = parseArgs(process.argv.slice(2));
const targets = targetsOf(opts);
if (opts.ref && !existsSync(opts.ref)) usageError(`không thấy --ref ${opts.ref}`);
const locked = readLock(noteForAnyFile(opts.page || targets[0]));
const lock = {
  gameplay: opts.gameplay || locked?.gameplay || null,
  type: opts.type || locked?.type || '',
  ref: opts.ref || (locked?.ref && existsSync(locked.ref) ? locked.ref : ''),
};
if (lock.gameplay && !GAMEPLAYS.includes(lock.gameplay)) usageError(`gameplay "${lock.gameplay}" không hợp lệ — chọn ${GAMEPLAYS.join(' | ')}`);
if (lock.gameplay && !existsSync(kitFileFor(KIT_DIR, lock.gameplay))) usageError(`không thấy ${kitFileFor(KIT_DIR, lock.gameplay)} — kiểm PM_KIT_DIR hoặc pull gt-promotion-template`);

const contract = lock.gameplay && loadContract(lock.gameplay, { kitDir: KIT_DIR, overridesPath: OVERRIDES, refDir: lock.ref });
const results = targets.map((file) => (contract ? gateFile(file, contract, lock, opts) : unlockedResult(file, lock, opts)));

if (opts.json) console.log(JSON.stringify(opts.page ? results : results[0], null, 2));
else results.forEach(printText);

const blocked = results.reduce((n, r) => n + r.fails.length, 0);
if (blocked) {
  console.error(`pm-gate: ${blocked} lỗi chặn — sửa rồi chạy lại`);
  process.exit(1);
}
