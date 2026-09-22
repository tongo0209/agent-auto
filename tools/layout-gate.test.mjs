#!/usr/bin/env node
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = join(dirname(fileURLToPath(import.meta.url)), 'layout-gate.mjs');
const root = mkdtempSync(join(tmpdir(), 'layout-gate-'));
let pass = 0, fail = 0;

function run(dir) {
  try {
    const out = execFileSync('node', [GATE, dir, '--json'], { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    return JSON.parse(e.stdout);
  }
}

function fixture(name, file, content) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), content);
  return dir;
}

function check(name, actual, expected) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — mong ${expected}, nhận ${actual}`); }
}

const rules = (r, code) => r.findings.filter((f) => f.rule === code).length;

console.log('layout-gate.mjs\n');

const hardcoded = fixture('hardcoded', 'diemdanh.scss', `
.list-day {
  position: absolute;
  left: 446px;
  top: 279px;
  .day-1 { position: absolute; left: 1px;   top: 0px; width: 108px; }
  .day-2 { position: absolute; left: 111px; top: 0px; width: 108px; }
  .day-3 { position: absolute; left: 222px; top: 0px; width: 108px; }
  .day-4 { position: absolute; left: 334px; top: 0px; width: 108px; }
  .day-5 { position: absolute; left: 445px; top: 0px; width: 108px; }
}
.off { pointer-events: none; }
.active { cursor: pointer; }
.received { pointer-events: none; }
`);
check('bắt list 5 item gắn cứng', rules(run(hardcoded), 'R-LAY-1'), 1);

// Grid đúng chuẩn không được báo
const gridOk = fixture('grid-ok', 'diemdanh.scss', `
.list-day {
  position: absolute;
  left: 446px;
  top: 279px;
  display: grid;
  grid-template-columns: repeat(10, 108px);
  gap: 8px 3px;
}
.day { width: 108px; height: 142px; }
.off { pointer-events: none; }
.active { cursor: pointer; }
.received { pointer-events: none; }
`);
check('grid + gap ⇒ sạch', run(gridOk).count, 0);

const onlyThree = fixture('three', 'milestone.scss', `
.a-1 { position: absolute; left: 0px; }
.a-2 { position: absolute; left: 10px; }
.a-3 { position: absolute; left: 20px; }
.off { pointer-events: none; }
.active { cursor: pointer; }
.received { pointer-events: none; }
`);
check('3 item ⇒ chưa báo', rules(run(onlyThree), 'R-LAY-1'), 0);

// Vòng quay: nhánh absolute là ĐÚNG, nhưng gate vẫn bắt theo hình dạng —
// xác nhận hành vi hiện tại để người đọc biết đây là ca cần tự loại trừ.
const wheel = fixture('wheel', 'vongquay.scss', `
.nhanh-1 { position: absolute; left: 100px; top: 20px; transform: rotate(0deg); }
.nhanh-2 { position: absolute; left: 140px; top: 60px; transform: rotate(45deg); }
.nhanh-3 { position: absolute; left: 100px; top: 100px; transform: rotate(90deg); }
.nhanh-4 { position: absolute; left: 60px;  top: 60px;  transform: rotate(135deg); }
`);
check('vòng quay vẫn bị bắt (cần người loại trừ)', rules(run(wheel), 'R-LAY-1'), 1);

const missing = fixture('missing', 'diemdanh.scss', `
.day { width: 108px; }
.active { cursor: pointer; }
`);
const mres = run(missing);
check('bắt gameplay thiếu trạng thái', rules(mres, 'R-ST-1'), 1);
check('  liệt kê đúng 2 cái thiếu', mres.findings.find((f) => f.rule === 'R-ST-1')?.missing.length, 2);

// Đủ 3 trạng thái ⇒ không báo R-ST-1
const complete = fixture('complete', 'milestone.scss', `
.moc.off { pointer-events: none; opacity: .5; }
.moc.active { cursor: pointer; }
.moc.received { pointer-events: none; }
`);
check('đủ 3 trạng thái ⇒ sạch', rules(run(complete), 'R-ST-1'), 0);

// File không phải gameplay thì không đòi trạng thái
const notGameplay = fixture('header', 'header.scss', `
.logo { width: 100px; }
.active { color: red; }
`);
check('file không phải gameplay ⇒ không đòi trạng thái', rules(run(notGameplay), 'R-ST-1'), 0);

const clickable = fixture('clickable', 'nhiemvu.scss', `
.off { opacity: 0.5; }
.active { cursor: pointer; }
.received { opacity: 0.6; }
`);
check('bắt .off/.received thiếu pointer-events', rules(run(clickable), 'R-ST-4'), 2);

// Exit code phải khác 0 khi có vi phạm
const sprite = fixture('sprite', 'diemdanh.scss', `
.khoi-1 { .MS__sprite-btn-nhan-1 { position: absolute; left: 0px; top: 0px; } }
.khoi-2 { .MS__sprite-btn-nhan-2 { position: absolute; left: 0px; top: 0px; } }
.khoi-3 { .MS__sprite-btn-nhan-3 { position: absolute; left: 0px; top: 0px; } }
.khoi-4 { .MS__sprite-btn-nhan-4 { position: absolute; left: 0px; top: 0px; } }
.off { pointer-events: none; }
.active { cursor: pointer; }
.received { pointer-events: none; }
`);
check('sprite phủ khối cha ở 0,0 ⇒ không phải list', rules(run(sprite), 'R-LAY-1'), 0);

const zeroCoord = fixture('zero', 'milestone.scss', `
.moc-1 { position: absolute; left: 0; top: 0; }
.moc-2 { position: absolute; left: 0; top: 0; }
.moc-3 { position: absolute; left: 0; top: 0; }
.moc-4 { position: absolute; left: 0; top: 0; }
.off { pointer-events: none; }
.active { cursor: pointer; }
.received { pointer-events: none; }
`);
check('toạ độ toàn 0 ⇒ không phải list rải', rules(run(zeroCoord), 'R-LAY-1'), 0);

let exitCode = 0;
try { execFileSync('node', [GATE, hardcoded], { encoding: 'utf8' }); }
catch (e) { exitCode = e.status; }
check('exit code khi có vi phạm', exitCode, 1);

let cleanExit = 1;
try { execFileSync('node', [GATE, gridOk], { encoding: 'utf8' }); cleanExit = 0; } catch { /* giữ 1 */ }
check('exit code khi sạch', cleanExit, 0);

rmSync(root, { recursive: true, force: true });
console.log(`\npass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
