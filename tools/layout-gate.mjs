#!/usr/bin/env node
// Cổng kiểm R-LAY-* và R-ST-*: bắt list gắn cứng toạ độ và ô nhận thưởng thiếu trạng thái.
// Dùng: node tools/layout-gate.mjs <file|thư mục> [--json]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const target = process.argv[2];
const asJson = process.argv.includes('--json');
if (!target) {
  console.error('Thiếu đường dẫn. Dùng: node tools/layout-gate.mjs <file|thư mục> [--json]');
  process.exit(2);
}

const STATES = ['off', 'active', 'received'];
const GAMEPLAY = /diemdanh|checkin|milestone|moc-?qua|doiqua|nhiemvu|mission|reward|mocnap/i;

function* walk(path) {
  const st = statSync(path);
  if (st.isFile()) { yield path; return; }
  for (const e of readdirSync(path, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    yield* walk(join(path, e.name));
  }
}

// ≥4 selector cùng gốc khác số thứ tự, mỗi cái tự đặt left/top → list gắn cứng (R-LAY-1).
function findHardcodedList(lines) {
  const numbered = /^\s*([.&][\w-]*?)(\d+)\s*(,|\{)/;
  const nth = /nth-child\(\s*(\d+)\s*\)/;
  const coord = /(left|top|right|bottom)\s*:\s*-?[\d.]/;
  const groups = new Map();

  for (let i = 0; i < lines.length; i++) {
    let stem = null;
    const m = lines[i].match(numbered);
    if (m) stem = m[1];
    else if (nth.test(lines[i])) {
      for (let j = i - 1; j >= 0 && j > i - 40; j--) {
        const up = lines[j].match(/^\s*([.&][\w-]+)/);
        if (up) { stem = `${up[1]}:nth-child`; break; }
      }
    }
    if (!stem) continue;

    let hasCoord = false;
    let nonZero = false;
    for (let k = i; k < Math.min(i + 9, lines.length); k++) {
      const c = lines[k].match(/(left|top|right|bottom)\s*:\s*(-?[\d.]+)/);
      if (!c) continue;
      hasCoord = true;
      if (parseFloat(c[2]) !== 0) nonZero = true;
    }
    const g = groups.get(stem) || { count: 0, coord: 0, spread: 0, line: i + 1 };
    g.count++;
    if (hasCoord) g.coord++;
    if (nonZero) g.spread++;
    groups.set(stem, g);
  }

  // Sprite phủ khối cha ở 0,0 không phải list — chỉ tính khi item thật sự rải ra các toạ độ khác nhau.
  const isSprite = (stem) => /^[.&]?(MS|MJ)__sprite/.test(stem);
  return [...groups].filter(([stem, g]) => g.count >= 4 && g.coord >= 4 && g.spread >= 4 && !isSprite(stem))
    .map(([stem, g]) => ({ rule: 'R-LAY-1', line: g.line, stem, n: g.coord }));
}

// Module gameplay phải có đủ .off / .active / .received (R-ST-1).
function findMissingStates(text, file) {
  if (!GAMEPLAY.test(file)) return [];
  const found = STATES.filter((s) => new RegExp(`[.&][\\w-]*\\b${s}\\b`).test(text));
  if (found.length === 0 || found.length === STATES.length) return [];
  return [{ rule: 'R-ST-1', line: 1, missing: STATES.filter((s) => !found.includes(s)), found }];
}

// .off/.received phải chặn tương tác, không chỉ đổi màu (R-ST-4).
function findClickableDeadState(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*[.&][\w-]*\b(off|received)\b[\w-]*\s*\{/);
    if (!m) continue;
    let blocked = false;
    for (let k = i; k < Math.min(i + 25, lines.length); k++) {
      if (/pointer-events\s*:\s*none/.test(lines[k])) { blocked = true; break; }
      if (/^\s*\}/.test(lines[k]) && k > i) break;
    }
    if (!blocked) out.push({ rule: 'R-ST-4', line: i + 1, state: m[1] });
  }
  return out;
}

const findings = [];
for (const file of walk(target)) {
  if (extname(file) !== '.scss') continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split('\n');
  const rel = relative(process.cwd(), file);
  for (const f of findHardcodedList(lines)) findings.push({ file: rel, ...f });
  for (const f of findMissingStates(text, file)) findings.push({ file: rel, ...f });
  for (const f of findClickableDeadState(lines)) findings.push({ file: rel, ...f });
}

if (asJson) {
  console.log(JSON.stringify({ findings, count: findings.length }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

if (!findings.length) {
  console.log('✓ layout-gate: không thấy vi phạm R-LAY-* / R-ST-*');
  process.exit(0);
}

const byRule = { 'R-LAY-1': [], 'R-ST-1': [], 'R-ST-4': [] };
for (const f of findings) byRule[f.rule]?.push(f);

if (byRule['R-LAY-1'].length) {
  console.log(`\n🔴 R-LAY-1 MUST · list gắn cứng toạ độ — ${byRule['R-LAY-1'].length} chỗ`);
  console.log('   Sửa: container giữ absolute, các con xếp bằng grid/flex + gap (rút gap từ bước nhảy toạ độ).');
  for (const f of byRule['R-LAY-1']) console.log(`   ${f.file}:${f.line}  ${f.stem} × ${f.n} item`);
}
if (byRule['R-ST-1'].length) {
  console.log(`\n🔴 R-ST-1 MUST · gameplay thiếu trạng thái — ${byRule['R-ST-1'].length} module`);
  console.log('   Sửa: dựng đủ .off/.active/.received; design thiếu thì suy ra và báo user (R-ST-2).');
  for (const f of byRule['R-ST-1']) console.log(`   ${f.file}  thiếu: ${f.missing.join(', ')}  (đang có: ${f.found.join(', ') || 'không có'})`);
}
if (byRule['R-ST-4'].length) {
  console.log(`\n🟡 R-ST-4 MUST · trạng thái chết vẫn bấm được — ${byRule['R-ST-4'].length} chỗ`);
  console.log('   Sửa: thêm pointer-events: none, đổi màu suông vẫn bắn API.');
  for (const f of byRule['R-ST-4'].slice(0, 15)) console.log(`   ${f.file}:${f.line}  .${f.state}`);
  if (byRule['R-ST-4'].length > 15) console.log(`   … và ${byRule['R-ST-4'].length - 15} chỗ nữa`);
}
console.log();
process.exit(1);
