#!/usr/bin/env node
// Chạy: node --test skills/ui-check/scripts/text-stress.test.mjs — cần Google Chrome (headless).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'text-stress.js'), 'utf8');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = mkdtempSync(join(tmpdir(), 'text-stress-'));

// Giả lập `page` của browserpilot run_script: evaluate chạy hàm ngay trong trang.
function runOn(name, body) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font:16px/20px Arial} .row{position:relative;width:400px;height:40px}
  </style></head><body><div id="MS__wrapper"><section id="s1">${body}</section></div><script>
    (async () => {
      const page = { evaluate: (fn, arg) => Promise.resolve(fn(arg)) };
      const result = await (async () => { ${SCRIPT} })();
      result.textAfter = [...document.querySelectorAll('[data-keep]')].map(el => el.textContent);
      document.body.setAttribute('data-result', JSON.stringify(result));
    })().catch(e => document.body.setAttribute('data-result', JSON.stringify({ error: String(e) })));
  </script></body></html>`;
  const file = join(dir, `${name}.html`);
  writeFileSync(file, html);
  const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=5000',
    '--dump-dom', `file://${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const raw = dom.match(/data-result="([^"]*)"/)?.[1];
  assert.ok(raw, `${name}: trang không trả data-result`);
  const result = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.equal(result.error, undefined, `${name}: script lỗi ${result.error}`);
  return result;
}

const checksOf = r => r.issues.map(i => `${i.check}:${i.severity}`);

test('chữ BE dài chạy xuống dưới nút → stress-overlap (ca CFL R1#18)', () => {
  const r = runOn('overlap', `<div class="row">
    <span class="pm__deadline" style="position:absolute;left:0;top:0;white-space:nowrap">Hạn: 20/9</span>
    <a class="btn" style="position:absolute;right:0;top:0;width:100px;height:40px">Chi tiết</a></div>`);
  assert.deepEqual(checksOf(r), ['stress-overlap:error']);
});

test('chữ BE nhiều dòng tràn khỏi khung cao cố định → stress-spill', () => {
  const r = runOn('spill', `<div style="width:200px;height:20px"><p class="pm__desc" style="margin:0">Nhận 1 lượt</p></div>`);
  assert.deepEqual(checksOf(r), ['stress-spill:error']);
});

test('khung overflow:hidden cắt mất dòng → stress-clipped', () => {
  const r = runOn('clipped', `<div style="width:200px;height:20px;overflow:hidden"><p class="pm__desc" style="margin:0">Nhận 1 lượt</p></div>`);
  assert.deepEqual(checksOf(r), ['stress-clipped:error']);
});

test('ellipsis là cắt chủ ý → không báo (cách fix CFL R2#22)', () => {
  const r = runOn('ellipsis', `<div class="pm__name" style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Hà Nội</div>`);
  assert.deepEqual(checksOf(r), []);
});

test('khung tự cao theo chữ → không báo', () => {
  const r = runOn('auto', `<div style="width:200px"><p class="pm__desc" style="margin:0">Nhận 1 lượt</p></div>`);
  assert.deepEqual(checksOf(r), []);
});

test('chữ tĩnh (không phải vùng dữ liệu) tràn → chỉ warn (chữ dịch dài hơn, ca ananta)', () => {
  const r = runOn('static', `<div style="width:140px;height:20px"><h3 style="margin:0;font-size:16px">Thế giới mở</h3></div>`);
  assert.deepEqual(checksOf(r), ['stress-spill:warn']);
});

test('chữ gốc được trả lại sau khi đo', () => {
  const r = runOn('restore', `<div style="width:200px;height:20px"><p class="pm__desc" data-keep style="margin:0">Nhận 1 lượt</p></div>`);
  assert.deepEqual(r.textAfter, ['Nhận 1 lượt']);
});

test('nhãn trên nút mang hook pm__ là chữ tĩnh → chỉ warn (CFL pm__menu-*)', () => {
  const r = runOn('button-label', `<div style="width:40px;height:20px"><a class="pm__btn-claim">Nhận</a></div>`);
  assert.deepEqual(checksOf(r), ['stress-spill:warn']);
});

test('nhãn tĩnh nằm trong khung pm__ → chỉ warn, không kế thừa vùng dữ liệu', () => {
  const r = runOn('label-in-module', `<div class="pm__leader"><div style="width:40px;height:20px"><span>PTS</span></div></div>`);
  assert.deepEqual(checksOf(r), ['stress-spill:warn']);
});

test('nav position:fixed đè lên trang là chủ ý → không tính stress-overlap', () => {
  const r = runOn('fixed-nav', `<div class="row"><span class="pm__name" style="white-space:nowrap">Tiger</span></div>
    <a class="btn" style="position:fixed;left:200px;top:0;width:200px;height:40px">Nav</a>`);
  assert.deepEqual(checksOf(r), []);
});

test('số tĩnh không bị dịch → không bơm', () => {
  const r = runOn('static-number', `<div style="width:40px;height:20px"><span>4.2K</span></div>`);
  assert.deepEqual(checksOf(r), []);
});
