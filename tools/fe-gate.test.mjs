#!/usr/bin/env node
/**
 * Self-test cho fe-gate — chứng minh gate BẮT ĐƯỢC lỗi, không phải bù nhìn.
 *
 * Mỗi ca: dựng 1 fixture nhỏ trong folder tạm → chạy gate → khẳng định đúng check nào nổ.
 * Chạy: node tools/fe-gate.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GATE = path.resolve(import.meta.dirname, 'fe-gate.mjs');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-gate-test-'));
let pass = 0;
let fail = 0;

/* ── helpers ── */
const w = (p, s = 'x') => (fs.mkdirSync(path.dirname(p), { recursive: true }), fs.writeFileSync(p, s), p);

function runGate(dist, extra = []) {
  const out = path.join(ROOT, 'r-' + Math.abs(hash(dist + extra.join())) + '.json');
  try {
    execFileSync('node', [GATE, dist, '--json', out, '--quiet', ...extra], { encoding: 'utf8' });
  } catch {
    /* exit 1 khi FAIL — bình thường, đọc json */
  }
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const checks = (r) => r.findings.map((f) => f.check);

function expect(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`);
  }
}

/** Fixture "sạch": 1 html + 1 css + font + ảnh, mọi ref tồn tại */
function cleanFixture(name) {
  const dist = path.join(ROOT, name, 'dist');
  w(path.join(dist, 'fonts/MyFont.ttf'));
  w(path.join(dist, 'images/hero.png'));
  w(
    path.join(dist, 'app.css'),
    `@font-face{font-family:"MyFont";src:url(fonts/MyFont.ttf) format("truetype")}
     .hero{background:url("images/hero.png");font-family:"MyFont",sans-serif}
     .ico{background:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><path d='M1 1'/></svg>")}
     .ext{background:url(https://cdn.example.com/a.png)}`
  );
  w(
    path.join(dist, 'index.html'),
    `<link rel="stylesheet" href="app.css"><img src="images/hero.png" srcset="images/hero.png 1x">
     <div style="background:url(images/hero.png)"></div><a href="#top">t</a>`
  );
  return dist;
}

console.log('\nfe-gate self-test\n');

/* ── ca 1: fixture sạch phải PASS tuyệt đối (0 finding) ── */
{
  const r = runGate(cleanFixture('clean'), ['--quiet']);
  // src-not-found bị --quiet chặn; không được có finding nào khác
  expect('fixture sạch → 0 finding', r.findings.length === 0, JSON.stringify(checks(r)));
  expect('fixture sạch → pass=true', r.pass === true);
  expect('bỏ qua data: URI và http(s)', !checks(r).includes('asset-missing'));
}

/* ── ca 2: xoá file font mà @font-face đang trỏ ── */
{
  const dist = cleanFixture('missing-font');
  fs.unlinkSync(path.join(dist, 'fonts/MyFont.ttf'));
  const r = runGate(dist, ['--quiet']);
  expect('xoá .ttf → ERROR font-file-missing', checks(r).includes('font-file-missing'), JSON.stringify(checks(r)));
  expect('  và exit FAIL', r.pass === false);
}

/* ── ca 3: dùng font-family không khai @font-face (ca GW-654) ── */
{
  const dist = cleanFixture('undeclared-font');
  fs.appendFileSync(path.join(dist, 'app.css'), `\n.t{font-family:"PlusJakartaSans-SemiBold",sans-serif}`);
  const r = runGate(dist, ['--quiet']);
  const f = r.findings.find((x) => x.check === 'font-undeclared');
  expect('font lạ → ERROR font-undeclared', Boolean(f), JSON.stringify(checks(r)));
  expect('  nêu tên font trong thông báo', Boolean(f && f.message.includes('PlusJakartaSans-SemiBold')));
  expect('  KHÔNG báo oan font hệ thống (sans-serif/Arial)', !r.findings.some((x) => /sans-serif|Arial/i.test(x.message)));
}

/* ── ca 4: đổi tên ảnh → ref 404 ở cả CSS và HTML ── */
{
  const dist = cleanFixture('missing-img');
  fs.renameSync(path.join(dist, 'images/hero.png'), path.join(dist, 'images/hero-2.png'));
  const r = runGate(dist, ['--quiet']);
  const missing = r.findings.filter((x) => x.check === 'asset-missing');
  expect('đổi tên ảnh → ERROR asset-missing', missing.length > 0, JSON.stringify(checks(r)));
  expect('  bắt cả trong CSS và HTML', new Set(missing.map((m) => path.extname(m.where))).size >= 2, JSON.stringify(missing.map((m) => m.where)));
}

/* ── ca 5: font shorthand `font:` cũng phải soi ── */
{
  const dist = cleanFixture('shorthand');
  fs.appendFileSync(path.join(dist, 'app.css'), `\n.s{font:700 16px/1.2 "FontShorthandLa",sans-serif}`);
  const r = runGate(dist, ['--quiet']);
  expect('shorthand font: → bắt được', r.findings.some((x) => x.message.includes('FontShorthandLa')), JSON.stringify(checks(r)));
}

/* ── ca 6: dist cũ hơn source ── */
{
  const camp = path.join(ROOT, 'stale');
  const dist = cleanFixture('stale');
  const src = w(path.join(camp, 'assets/main.scss'), '.a{}');
  const future = new Date(Date.now() + 3 * 3600 * 1000);
  fs.utimesSync(src, future, future);
  const r = runGate(dist);
  expect('source mới hơn dist → ERROR dist-stale', checks(r).includes('dist-stale'), JSON.stringify(checks(r)));

  // và ngược lại: dist mới hơn thì im
  const past = new Date(Date.now() - 3 * 3600 * 1000);
  fs.utimesSync(src, past, past);
  const r2 = runGate(dist);
  expect('  dist mới hơn source → không báo', !checks(r2).includes('dist-stale'), JSON.stringify(checks(r2)));
}

/* ── ca 7: font design giao mà không dùng ── */
{
  const dist = cleanFixture('design-unused');
  const design = path.join(ROOT, 'design-unused-src');
  w(path.join(design, 'Fonts/MyFont.ttf'));
  w(path.join(design, 'Fonts/BoQuenFont.ttf'));
  const r = runGate(dist, ['--quiet', '--design', design]);
  const unused = r.findings.filter((x) => x.check === 'design-font-unused');
  expect('font design không dùng → WARN', unused.some((x) => x.message.includes('BoQuenFont')), JSON.stringify(checks(r)));
  expect('  font ĐANG dùng không bị báo oan', !unused.some((x) => x.message.includes('MyFont.ttf')));
  expect('  chỉ WARN nên vẫn pass', r.pass === true);
  const rs = runGate(dist, ['--quiet', '--design', design, '--strict']);
  expect('  --strict → WARN cũng FAIL', rs.pass === false);
}

/* ── ca 8: ảnh nặng ── */
{
  const dist = cleanFixture('heavy');
  w(path.join(dist, 'images/big.png'), 'x'.repeat(600 * 1024));
  const r = runGate(dist, ['--quiet']);
  expect('ảnh > 500KB → WARN image-heavy', checks(r).includes('image-heavy'), JSON.stringify(checks(r)));
}

/* ── dọn ── */
fs.rmSync(ROOT, { recursive: true, force: true });

console.log(`\n${fail ? '✗' : '✓'} ${pass} pass · ${fail} fail\n`);
process.exit(fail ? 1 : 0);
