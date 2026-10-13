#!/usr/bin/env node
// Chạy: node --test tools/handoff-drift.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), 'handoff-drift.mjs');
const root = mkdtempSync(join(tmpdir(), 'handoff-drift-'));
const CDN = 'https://cdn-mainsite-aka.vnggames.com/mainsite/products/x/landing/y/dist/';

const DIST = `<body class="vi"><div id="MS__wrapper">
  <section id="frame1"><img src="assets/f1/bg.png"><p class="pm__point">0</p>
  <a class="pm__btn-claim btn">Nhận</a><span class="days">7 ngày</span></section>
  <div id="popup_reward" class="MS__popup"></div></div><script>var a = "<b>x</b>";</script></body>`;

function write(rel, html) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return file;
}

function run(...args) {
  const dist = write('dist/index.html', DIST);
  const res = spawnSync('node', [TOOL, '--dist', dist, ...args, '--json'], { encoding: 'utf8' });
  return { code: res.status, report: JSON.parse(res.stdout) };
}

const kinds = list => list.map(i => i.kind).sort();

test('mainsite giống dist, chỉ khác URL CDN tuyệt đối → sạch', () => {
  const f = write('a/mainsite/index.html', DIST.replace('src="assets/', `src="${CDN}assets/`));
  const { code, report } = run(f);
  assert.equal(report.files[0].mode, 'mainsite');
  assert.deepEqual(report.files[0].errors, []);
  assert.equal(code, 0);
});

test('mainsite còn chữ cũ trong khi local đã sửa → error text (ca mwly R26)', () => {
  const f = write('b/mainsite/index.html', DIST.replace('7 ngày', '5 ngày'));
  const { code, report } = run(f);
  assert.deepEqual(kinds(report.files[0].errors), ['text', 'text']);
  assert.equal(code, 1);
});

test('mainsite thiếu markup của commit mới → error class (ca LAN trung-thu #22)', () => {
  const f = write('c/mainsite/index.html', DIST.replace(' class="MS__popup"', ''));
  const { code, report } = run(f);
  assert.deepEqual(kinds(report.files[0].errors), ['class']);
  assert.equal(code, 1);
});

test('Promotion do BE gắn dữ liệu, nhân item, thêm hook riêng → sạch', () => {
  const be = DIST.replace('<body class="vi">', '<body class="vi"><% MODULE_CONTENT %>')
    .replace('<p class="pm__point">0</p>', '<p class="pm__point">1.250</p><p class="pm__point">80</p><i class="pm__be-only"></i>');
  const f = write('d/Promotion/index.html', be);
  const { code, report } = run(f);
  assert.equal(report.files[0].mode, 'promotion');
  assert.deepEqual(report.files[0].warns, []);
  assert.equal(code, 0);
});

test('Promotion thiếu hook mà dist có → warn hook (BE đè mất fix FE, ca CFL R1#6)', () => {
  const f = write('e/promotion/index.html', DIST.replace('<div id="popup_reward" class="MS__popup"></div>', ''));
  const { code, report } = run(f);
  assert.deepEqual(kinds(report.files[0].warns), ['class', 'popup']);
  assert.equal(code, 0);
});

test('--strict biến warn thành exit 1', () => {
  const f = write('f/promotion/index.html', DIST.replace('<div id="popup_reward" class="MS__popup"></div>', ''));
  const dist = write('dist/index.html', DIST);
  const res = spawnSync('node', [TOOL, '--dist', dist, f, '--strict'], { encoding: 'utf8' });
  assert.equal(res.status, 1);
});

test('popup_* đổi từ class sang id ở bản BE vẫn là cùng hook → không warn (ca CFL popup_danhsachmember)', () => {
  const dist = write('dist/index.html', DIST.replace('<div id="popup_reward" class="MS__popup">', '<div class="popup_reward MS__popup">'));
  const f = write('g/Promotion/index.html', DIST);
  const res = spawnSync('node', [TOOL, '--dist', dist, f, '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(res.stdout).files[0].warns, []);
});

test('URL trong data-* và đường dẫn ngoài dist/ được chuẩn hoá như src → sạch', () => {
  const dist = write('dist/index.html', DIST.replace('<section id="frame1">',
    '<section id="frame1" data-src="optimized/popup/bg.webp"><link rel="icon" href="../cdn/favicon.png">'));
  const f = write('h/mainsite/index.html', DIST.replace('<section id="frame1">',
    `<section id="frame1" data-src="${CDN}optimized/popup/bg.webp"><link rel="icon" href="https://cdn-mainsite-aka.vnggames.com/mainsite/products/x/cdn/favicon.png">`));
  const res = spawnSync('node', [TOOL, '--dist', dist, f, '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(res.stdout).files[0].errors, []);
});

test('file nằm ngay gốc dist/ (css chính) khớp với URL CDN tuyệt đối → sạch', () => {
  const dist = write('dist/index.html', DIST.replace('<body class="vi">', '<link href="main.css"><body class="vi">'));
  const f = write('i/mainsite/index.html', DIST.replace('<body class="vi">', `<link href="${CDN}main.css"><body class="vi">`));
  const res = spawnSync('node', [TOOL, '--dist', dist, f, '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(res.stdout).files[0].errors, []);
});
