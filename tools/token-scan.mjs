#!/usr/bin/env node
// Đo token thật đã tiêu từ transcript Claude Code (~/.claude/projects/**/*.jsonl).
// Dùng: node tools/token-scan.mjs [--days 30] [--top 10] [--project <chuỗi khớp>] [--json]
import { readdirSync, statSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

// Hệ số giá API Anthropic: cache đọc rẻ 10 lần, cache ghi đắt 1,25 lần, output đắt 5 lần.
const WEIGHT = { cacheRead: 0.1, cacheCreate: 1.25, input: 1, output: 5 };
const ROOT = join(homedir(), '.claude', 'projects');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const days = Number(arg('days', 30));
const top = Number(arg('top', 10));
const projectFilter = arg('project', '');
const asJson = process.argv.includes('--json');

function transcripts() {
  const cutoff = Date.now() - days * 86400_000;
  const out = [];
  for (const project of readdirSync(ROOT)) {
    if (projectFilter && !project.includes(projectFilter)) continue;
    walk(join(ROOT, project), project, cutoff, out);
  }
  return out;
}

// Transcript của subagent nằm sâu trong <phiên>/subagents/** — cũng tiêu token thật, phải đệ quy.
function walk(dir, project, cutoff, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { walk(path, project, cutoff, out); continue; }
    if (!entry.name.endsWith('.jsonl')) continue;
    if (statSync(path).mtimeMs < cutoff) continue;
    out.push({ project, name: entry.name, path, isSubagent: path.includes('/subagents/') });
  }
}

async function scan(file) {
  const acc = { turns: 0, cacheRead: 0, cacheCreate: 0, input: 0, output: 0, first: 0, peak: 0 };
  const rl = createInterface({ input: createReadStream(file.path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"usage"')) continue;
    let usage;
    try { usage = JSON.parse(line)?.message?.usage; } catch { continue; }
    if (!usage) continue;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreate = usage.cache_creation_input_tokens ?? 0;
    const context = cacheRead + cacheCreate + (usage.input_tokens ?? 0);
    if (acc.turns === 0) acc.first = context;
    if (context > acc.peak) acc.peak = context;
    acc.turns++;
    acc.cacheRead += cacheRead;
    acc.cacheCreate += cacheCreate;
    acc.input += usage.input_tokens ?? 0;
    acc.output += usage.output_tokens ?? 0;
  }
  return { ...file, ...acc };
}

const weighted = (s) =>
  s.cacheRead * WEIGHT.cacheRead + s.cacheCreate * WEIGHT.cacheCreate +
  s.input * WEIGHT.input + s.output * WEIGHT.output;

const M = (n) => (n / 1e6).toFixed(1).padStart(8);
const K = (n) => Math.round(n / 1000).toLocaleString('vi-VN').padStart(7);

const files = transcripts();
if (!files.length) {
  console.error(`Không thấy transcript nào trong ${days} ngày qua.`);
  process.exit(1);
}
const sessions = (await Promise.all(files.map(scan))).filter((s) => s.turns > 0);

const total = sessions.reduce((a, s) => ({
  turns: a.turns + s.turns, cacheRead: a.cacheRead + s.cacheRead,
  cacheCreate: a.cacheCreate + s.cacheCreate, input: a.input + s.input, output: a.output + s.output,
}), { turns: 0, cacheRead: 0, cacheCreate: 0, input: 0, output: 0 });

const totalWeighted = weighted(total);
// Subagent có system prompt riêng, baseline khác — tính baseline trên phiên chính thôi.
const main = sessions.filter((s) => !s.isSubagent);
const subagents = sessions.filter((s) => s.isSubagent);
const baseline = main.reduce((a, s) => a + s.first, 0) / main.length;
const mainTurns = main.reduce((a, s) => a + s.turns, 0);
const baselineCost = baseline * mainTurns;
const subCost = subagents.reduce((a, s) => a + weighted(s), 0);

if (asJson) {
  console.log(JSON.stringify({ days, sessions: sessions.length, total, totalWeighted, baseline }, null, 2));
  process.exit(0);
}

console.log(`\n📊 ${days} ngày qua · ${sessions.length} phiên · ${total.turns.toLocaleString('vi-VN')} lượt model\n`);
console.log('  khoản           token thô      quy đổi     %');
console.log('  ─────────────────────────────────────────────');
for (const [label, key, w] of [
  ['cache_read  ', 'cacheRead', WEIGHT.cacheRead],
  ['cache_create', 'cacheCreate', WEIGHT.cacheCreate],
  ['input mới   ', 'input', WEIGHT.input],
  ['output      ', 'output', WEIGHT.output],
]) {
  const cost = total[key] * w;
  console.log(`  ${label}  ${M(total[key])}M  ${M(cost)}M  ${String(Math.round(cost / totalWeighted * 100)).padStart(4)}%`);
}
console.log('  ─────────────────────────────────────────────');
console.log(`  TỔNG          ${M(total.cacheRead + total.cacheCreate + total.input + total.output)}M  ${M(totalWeighted)}M\n`);

console.log(`  Context trung bình mỗi lượt  : ${K(total.cacheRead / total.turns)}k token`);
console.log(`  Baseline trung bình mỗi phiên: ${K(baseline)}k token (trước khi user gõ chữ nào)`);
console.log(`  → baseline gửi lại ${mainTurns.toLocaleString('vi-VN')} lượt = ${M(baselineCost)}M token thô`);
console.log(`    = ${Math.round(baselineCost / (total.cacheRead + total.cacheCreate + total.input) * 100)}% khối lượng input. Cắt 10k baseline ⇒ tiết kiệm ${M(10000 * mainTurns)}M token.`);
console.log(`  Subagent: ${subagents.length} lượt chạy, ${M(subCost)}M quy đổi (${Math.round(subCost / totalWeighted * 100)}% chi phí)\n`);

console.log(`  ${top} phiên tốn nhất (quy đổi):\n`);
console.log('   quy đổi   lượt   đỉnh ctx  phiên');
for (const s of sessions.sort((a, b) => weighted(b) - weighted(a)).slice(0, top)) {
  const proj = s.project.replace(/^-Users-lap17727-/, '').slice(-34);
  console.log(`  ${M(weighted(s))}M  ${String(s.turns).padStart(5)}  ${K(s.peak)}k  ${proj}`);
}
console.log('\n  Phiên càng dài càng đắt theo bình phương — đặt autoCompactWindow cho phiên tự compact.\n');
