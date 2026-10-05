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

/* ── ca 9: ảnh _ref-co-chu (bản đối chiếu, font chưa cài) lọt vào production ── */
{
  const dist = cleanFixture('ref-co-chu');
  w(path.join(dist, 'images/btn-rut-01-CO-CHU.png'));
  w(path.join(dist, 'extra.css'), `.btn{background:url("images/btn-rut-01-CO-CHU.png")}`);
  fs.appendFileSync(path.join(dist, 'index.html'), `<link rel="stylesheet" href="extra.css">`);
  const r = runGate(dist, ['--quiet']);
  expect('ảnh -CO-CHU dùng thật → ERROR ref-image-used', checks(r).includes('ref-image-used'), JSON.stringify(checks(r)));
}

/* ── ca 10: asset design bóc ra mà dist không dùng ── */
{
  const dist = cleanFixture('asset-unused');
  const design = path.join(ROOT, 'asset-unused-src');
  w(path.join(design, 'assets/hero.png'));
  for (const n of ['qua-f1-14-ngay', 'qua-f1-10-ngay', 'scroll-bar', 'tieude'])
    w(path.join(design, `assets/${n}.png`));
  w(path.join(design, 'assets-backup-1757/rac-cu.png'));
  w(path.join(design, 'assets-base/nen-goc.png'));
  w(path.join(design, 'assets/coords.json'), '{"canvas":[10,10],"assets":[]}');
  w(path.join(design, 'tho-truoc-trim.png'));            // bản thô ngoài assets/
  w(path.join(design, 'assets/_control.png'));           // ảnh render tham chiếu
  w(path.join(design, 'bg-sections/nen-goc-designer.png'));
  const r = runGate(dist, ['--quiet', '--design', design]);
  const un = r.findings.filter((x) => x.check === 'design-asset-unused');
  expect('asset design không dùng → WARN', un.some((x) => x.message.includes('qua-f1-14-ngay')), JSON.stringify(checks(r)));
  expect('asset design ĐÃ dùng không bị kết oan', !un.some((x) => x.message.includes('hero')), JSON.stringify(un.map((x) => x.message)));
  expect('GOM 1 dòng/thư mục, không đẻ 1 WARN mỗi asset', un.length === 1, `${un.length} finding: ${JSON.stringify(un.map((x) => x.message))}`);
  expect('nêu SỐ LƯỢNG để đọc là biết quy mô', /4\/5/.test(un[0]?.message || ''), un[0]?.message);
  expect('bỏ qua thư mục backup', !un.some((x) => x.message.includes('rac-cu')), JSON.stringify(un.map((x) => x.message)));
  expect('bỏ qua thư mục -base (bản nền, không phải asset giao)', !un.some((x) => x.message.includes('nen-goc')), JSON.stringify(un.map((x) => x.message)));
  expect('chỉ xét thư mục có coords.json — bản thô ngoài assets/ không tính', !un.some((x) => x.message.includes('tho-truoc-trim')), JSON.stringify(un.map((x) => x.message)));
  expect('_control là ảnh tham chiếu, không phải asset giao', !un.some((x) => x.message.includes('_control')), JSON.stringify(un.map((x) => x.message)));
}

/* ── fixture bản cắt psd-cut/figma-cut: PNG thật (IHDR đọc được cỡ) + coords.json ── */
const png = (wd, ht, salt = '') => {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(wd, 8);
  ihdr.writeUInt32BE(ht, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.from(salt)]);
};
const row = (name, wd, ht, flags = [], extra = {}) =>
  ({ name, file: name + '.png', x: 0, y: 0, w: wd, h: ht, flags, textInside: [], z: 0, runId: 'r1', ...extra });
const writeCut = (dir, doc) => w(path.join(dir, 'coords.json'), JSON.stringify(doc));
const hourAgo = new Date(Date.now() - 3600 * 1000);
const writeSrc = (p, s) => (w(p, s), fs.utimesSync(p, hourAgo, hourAgo), p);
const flagged = (r) => r.findings.filter((x) => x.check === 'flagged-asset-used');

/* ── ca 11: asset cờ DATA-ZONE/FONT-SUBST bị bê làm ảnh (ca GW-723: 1-misc → point-1.png) ── */
{
  const dist = cleanFixture('flag-data-zone');
  const camp = path.dirname(dist);
  const cut = path.join(ROOT, 'flag-data-zone-src/_auto-export/gnm-mb/assets');
  w(path.join(cut, '1-misc.png'), png(120, 40, 'misc'));
  w(path.join(cut, 'score.png'), png(60, 20, 'score'));
  w(path.join(cut, 'frame-3.png'), png(100, 100, 'frame'));
  writeCut(cut, { runId: 'r1', gateStatus: 'PASS', assets: [
    row('1-misc', 120, 40, ['TEXT', 'DATA-ZONE']), row('score', 60, 20, ['FONT-SUBST']), row('frame-3', 100, 100)] });
  writeSrc(path.join(camp, 'assets/sec/images/sprite/point-1.png'), png(120, 40, 'misc'));
  writeSrc(path.join(camp, 'assets/sec/scss/sec.scss'), '.a{}\n.b{}\n.point{ @include sprite($point-1); }\n');
  w(path.join(dist, 'images/score.png'), png(60, 20, 'score'));
  w(path.join(dist, 'images/frame-3.png'), png(100, 100, 'frame'));
  fs.appendFileSync(path.join(dist, 'index.html'), '\n<img src="images/score.png"><img src="images/frame-3.png">');
  const r = runGate(dist, ['--quiet', '--design', path.join(ROOT, 'flag-data-zone-src')]);
  const f = flagged(r);
  const dz = f.find((x) => x.message.includes('DATA-ZONE'));
  expect('DATA-ZONE copy đổi tên vào sprite → ERROR', dz?.level === 'ERROR', JSON.stringify(f));
  expect('  chỉ đúng file:line dòng @include sprite', dz?.where === '../assets/sec/scss/sec.scss:3', dz?.where);
  const fs2 = f.find((x) => x.message.includes('FONT-SUBST'));
  expect('FONT-SUBST dùng qua <img src> → ERROR', fs2?.level === 'ERROR', JSON.stringify(f));
  expect('  chỉ đúng index.html:3', fs2?.where === 'index.html:3', fs2?.where);
  expect('asset không cờ không bị kết oan', !f.some((x) => x.message.includes('frame-3')), JSON.stringify(f));
  expect('  và gate FAIL', r.pass === false);
}

/* ── ca 11c: cùng md5 với một bản cắt KHÔNG cờ FONT-SUBST ⇒ pixel đã được chứng minh sạch (GW-901 title-vn) ── */
{
  const dist = cleanFixture('flag-clean-twin');
  const cut = path.join(ROOT, 'flag-clean-twin-src/assets');
  w(path.join(cut, 'group-2.png'), png(80, 30, 'tieu-de'));
  w(path.join(cut, 'f3-title-text.png'), png(80, 30, 'tieu-de'));
  w(path.join(cut, 'bxh.png'), png(50, 50, 'bxh'));
  w(path.join(cut, 'bxh-khung.png'), png(50, 50, 'bxh'));
  writeCut(cut, { runId: 'r1', gateStatus: 'PASS', assets: [
    row('group-2', 80, 30, ['BAKE', 'FONT-SUBST']), row('f3-title-text', 80, 30, ['BAKE']),
    row('bxh', 50, 50, ['DATA-ZONE']), row('bxh-khung', 50, 50)] });
  w(path.join(dist, 'images/title-vn.png'), png(80, 30, 'tieu-de'));
  w(path.join(dist, 'images/bxh-copy.png'), png(50, 50, 'bxh'));
  fs.appendFileSync(path.join(dist, 'index.html'), '\n<img src="images/title-vn.png"><img src="images/bxh-copy.png">');
  const r = runGate(dist, ['--quiet', '--design', path.join(ROOT, 'flag-clean-twin-src')]);
  const f = flagged(r);
  expect('FONT-SUBST có bản sinh đôi sạch cùng md5 → không ERROR', !f.some((x) => x.message.includes('FONT-SUBST')), JSON.stringify(f));
  expect('  DATA-ZONE vẫn ERROR dù có bản không cờ (vùng dữ liệu là nghĩa, không phải pixel)',
    f.some((x) => x.message.includes('DATA-ZONE') && x.level === 'ERROR'), JSON.stringify(f));
}

/* ── ca 11b: trùng TÊN mà khác cỡ + khác nội dung là ảnh khác (đo GW-727: title.png popup library) ── */
{
  const dist = cleanFixture('flag-same-name');
  const cut = path.join(ROOT, 'flag-same-name-src/assets');
  w(path.join(cut, 'title.png'), png(102, 26, 'nick'));
  writeCut(cut, { runId: 'r1', gateStatus: 'FAIL', assets: [row('title', 102, 26, ['DATA-ZONE'])] });
  w(path.join(dist, 'popup/images/title.png'), png(557, 90, 'lib'));
  fs.appendFileSync(path.join(dist, 'app.css'), '\n.pop{background:url(popup/images/title.png)}');
  const r = runGate(dist, ['--quiet', '--design', path.join(ROOT, 'flag-same-name-src')]);
  expect('trùng tên, khác cỡ → không ERROR flagged/cut-gate-red', r.counts.error === 0, JSON.stringify(r.findings));
}

/* ── ca 12: cờ CỤC / BAKE chỉ WARN — không chặn ── */
{
  const dist = cleanFixture('flag-cluster');
  const cut = path.join(ROOT, 'flag-cluster-src/assets');
  w(path.join(cut, 'qua-1.png'), png(80, 120, 'q'));
  w(path.join(cut, 'glow.png'), png(50, 50, 'g'));
  writeCut(cut, { runId: 'r1', gateStatus: 'PASS', assets: [row('qua-1', 80, 120, ['CỤC']), row('glow', 50, 50, ['BAKE'])] });
  w(path.join(dist, 'images/qua-1.png'), png(80, 120, 'q'));
  w(path.join(dist, 'images/glow.png'), png(50, 50, 'g'));
  fs.appendFileSync(path.join(dist, 'app.css'), '\n.qua{background:url(images/qua-1.png)}\n.glow{background:url(images/glow.png)}');
  const r = runGate(dist, ['--quiet', '--design', path.join(ROOT, 'flag-cluster-src')]);
  const f = flagged(r);
  expect('CỤC dùng làm ảnh → WARN', f.some((x) => x.level === 'WARN' && x.message.includes('CỤC')), JSON.stringify(f));
  expect('BAKE dùng làm ảnh → WARN', f.some((x) => x.level === 'WARN' && x.message.includes('BAKE')), JSON.stringify(f));
  expect('  chỉ WARN nên vẫn pass', r.pass === true, JSON.stringify(r.findings));
}

/* ── ca 13: coords đời cũ (mảng / map left-top) vẫn đọc được, không nổ ── */
{
  const dist = cleanFixture('coords-old');
  const design = path.join(ROOT, 'coords-old-src');
  w(path.join(design, 'a/assets/hero.png'), png(10, 10));
  w(path.join(design, 'a/assets/coords.json'), JSON.stringify([{ name: 'hero', x: 0, y: 0, w: 10, h: 10, file: 'hero.png' }]));
  w(path.join(design, '_cut/assets/bg.png'), png(20, 20));
  w(path.join(design, '_cut/coords.json'), JSON.stringify({ 'assets/bg.png': { file: 'assets/bg.png', left: 0, top: 0, width: 20, height: 20 } }));
  const r = runGate(dist, ['--quiet', '--design', design]);
  expect('coords cũ → không ERROR nào', r.counts?.error === 0, JSON.stringify(r.findings));
  expect('  và đếm được asset cắt (không im lặng như 0)', r.scanned?.cutAssets === 2, JSON.stringify(r.scanned));
}

/* ── ca 14: bitmap gốc khác cỡ slot (figma lessons 28-32: 396×101 cho slot 243×62) ── */
{
  const dist = cleanFixture('scale-odd');
  const cut = path.join(ROOT, 'scale-odd-src/assets');
  for (const n of ['btn', 'btn2x', 'btn1x']) w(path.join(cut, `${n}.png`), png(396, 101, n));
  w(path.join(cut, 'bg.png'), png(71, 47, 'nut'));
  w(path.join(dist, 'images/btn.png'), png(396, 101, 'btn'));
  w(path.join(dist, 'images/btn2x.png'), png(486, 124, 'opt'));
  w(path.join(dist, 'images/btn1x.png'), png(243, 62, 'opt'));
  writeCut(cut, { runId: 'r1', gateStatus: 'PASS', assets: [
    row('btn', 243, 62, [], { srcSize: [396, 101] }), row('btn2x', 243, 62), row('btn1x', 243, 62), row('bg', 71, 47)] });
  w(path.join(dist, 'popup/images/bg.png'), png(1532, 913, 'lib'));
  const r = runGate(dist, ['--quiet', '--design', path.join(ROOT, 'scale-odd-src')]);
  const odd = r.findings.filter((x) => x.check === 'scale-odd');
  expect('396×101 cho slot 243×62 → WARN scale-odd', odd.some((x) => x.message.includes('396×101') && x.message.includes('243×62')), JSON.stringify(odd));
  expect('  2× (486×124) không bị báo', !odd.some((x) => x.message.includes('btn2x')), JSON.stringify(odd));
  expect('  1× (243×62) không bị báo', !odd.some((x) => x.message.includes('btn1x')), JSON.stringify(odd));
  expect('  trùng tên khác tỉ lệ khung (bg 1532×913 vs 71×47) là ảnh khác → không báo', !odd.some((x) => x.message.includes('bg.png')), JSON.stringify(odd));
}

/* ── ca 15: asset từ lượt cắt ĐỎ (ca GW-745: gate C2 FAIL mà trim vẫn ra coords, dev dùng luôn) ── */
{
  const dist = cleanFixture('gate-red');
  const design = path.join(ROOT, 'gate-red-src');
  const red = path.join(design, 'cos-mb/assets');
  const idle = path.join(design, 'cos-popup/assets');
  w(path.join(red, 'cos-bg.png'), png(30, 30, 'bg'));
  w(path.join(idle, 'popup-khung.png'), png(40, 40, 'k'));
  writeCut(red, { runId: 'r-745', gateStatus: 'FAIL', assets: [row('cos-bg', 30, 30)] });
  writeCut(idle, { runId: 'r-746', gateStatus: 'FAIL', assets: [row('popup-khung', 40, 40)] });
  w(path.join(dist, 'images/cos-bg.png'), png(30, 30, 'bg'));
  fs.appendFileSync(path.join(dist, 'app.css'), '\n.cos{background:url(images/cos-bg.png)}');
  const reds = (res) => res.findings.filter((x) => x.check === 'cut-gate-red');

  const r = runGate(dist, ['--quiet', '--design', design]);
  const e = reds(r);
  expect('gateStatus=FAIL mà dist dùng asset → ERROR cut-gate-red', e.length === 1 && e[0].level === 'ERROR', JSON.stringify(e));
  expect('  nêu "lượt cắt đỏ" + runId', /lượt cắt đỏ/.test(e[0]?.message) && e[0]?.message.includes('r-745'), e[0]?.message);
  expect('  lượt đỏ mà dist không dùng asset nào → không chặn', !e.some((x) => x.where.includes('cos-popup')), JSON.stringify(e));

  w(path.join(red, 'overrides.json'), JSON.stringify([{ gate: 'C2', region: 'nen', reason: 'ok', measured: 19.2 }]));
  const r2 = runGate(dist, ['--quiet', '--design', design]);
  expect('override lý do <10 ký tự → vẫn ERROR, nêu vì sao bị loại', reds(r2).some((x) => /reason/.test(x.message)), JSON.stringify(reds(r2)));

  w(path.join(red, 'overrides.json'), JSON.stringify([
    { gate: 'C2', region: 'nen', reason: 'nền mờ khác preview do blend Overlay, đã so tay', measured: 19.2 }]));
  const r3 = runGate(dist, ['--quiet', '--design', design]);
  expect('overrides.json hợp lệ (gate, region, reason ≥10, measured) → hết ERROR', !reds(r3).length, JSON.stringify(reds(r3)));

  w(path.join(red, 'overrides.json'), JSON.stringify([
    { gate: 'C5', asset: 'asset-khac-khong-dung', reason: 'đã đối chiếu với design chốt', measured: 5 }]));
  const r4 = runGate(dist, ['--quiet', '--design', design]);
  expect('override C5 hợp lệ nhưng cho asset KHÁC → vẫn ERROR (reviewer 23/9: 1 dòng lạc gạt cả lượt đỏ)',
         reds(r4).some((x) => x.level === 'ERROR' && x.message.includes('cos-bg')), JSON.stringify(reds(r4)));
  w(path.join(red, 'overrides.json'), JSON.stringify([
    { gate: 'C5', asset: 'cos-bg', reason: 'đã đối chiếu với design chốt', measured: 5 }]));
  const r5 = runGate(dist, ['--quiet', '--design', design]);
  expect('override C5 đúng asset đang dùng → hết ERROR', !reds(r5).length, JSON.stringify(reds(r5)));
}

/* ── dọn ── */
fs.rmSync(ROOT, { recursive: true, force: true });

console.log(`\n${fail ? '✗' : '✓'} ${pass} pass · ${fail} fail\n`);
process.exit(fail ? 1 : 0);
