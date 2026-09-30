import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveType, checkHtml } from './check-promotion.mjs';

const page = (popups) => `<html><body>${popups}</body></html>`;

const REGISTER_OK = `<section id="popup_register"><form>
  <select name="ServerID"><option class="server-select-title">Chọn</option></select>
  <select name="CharacterID"><option class="character-select-title">Chọn</option></select>
  <button type="submit">Đăng ký</button></form></section>`;

const CONDITION_OK = `<section id="popup_condition"><form id="pm__condition-form">
  <input name="captcha"><button type="submit">Nhận lượt</button></form></section>`;

const INFORM_OK = '<section id="popup_inform"><div><div class="pm__inform-text"></div></div></section>';

const LUCKY_DRAW_FULL = page(
  INFORM_OK + CONDITION_OK + REGISTER_OK +
  '<section id="popup_history"></section><section id="popup_reward"></section><section id="popup_rule"></section><section id="popup_login"></section>',
);

const statusOf = (result, layer, match) => result[layer].find((r) => r.popup === match || r.check?.includes(match))?.status;

test('tra loại: STT, alias, tên platform, checklist phụ, không khớp', () => {
  assert.deepEqual(resolveType('13').checklists, ['13-khuyen-mai-nap.md']);
  assert.equal(resolveType('nap-tien').stt, 13);
  assert.equal(resolveType('vong-quay').stt, 39);
  assert.equal(resolveType('affiliate').stt, 22);
  assert.equal(resolveType('rút thăm may mắn & đổi quà').stt, 5);
  assert.equal(resolveType('RÚT THĂM MAY MẮN & ĐỔI QUÀ V2').stt, 24);
  assert.deepEqual(resolveType('27').checklists, ['27-diem-danh-rut-tham.md', '02-rut-tham-may-man.md']);
  assert.equal(resolveType('shop').structureOnly, true);
  assert.deepEqual(resolveType('35').checklists, []);
  assert.deepEqual(resolveType('milestone').checklists, ['milestone.md']);
  assert.equal(resolveType('abcxyz'), null);
});

test('lucky draw dựng đủ → ✅ và X/Y đúng', () => {
  const r = checkHtml(LUCKY_DRAW_FULL, resolveType('2'));
  assert.equal(r.icon, '✅');
  assert.equal(r.failed.length, 0);
  assert.equal(r.passed, r.total);
});

test('id kit popup_signIn khớp item popup_login, không tính thừa', () => {
  const r = checkHtml(page('<section id="popup_signIn"></section>'), resolveType('39'));
  assert.equal(statusOf(r, 'required', 'popup_login'), '✅ Pass');
  assert.equal(r.extra.length, 0);
});

test('item có điều kiện vắng mặt → ⚠️, không tính vào X/Y', () => {
  const r = checkHtml(page(INFORM_OK), resolveType('2'));
  assert.match(statusOf(r, 'required', 'popup_login'), /^⚠️/);
  assert.equal(statusOf(r, 'required', 'popup_history'), '❌ Fail');
  const counted = [...r.required, ...r.structure].filter((x) => /^(✅|❌)/.test(x.status));
  assert.equal(r.total, counted.length);
});

test('popup lạ → Popups Extra; popup chuẩn kit (popup_bxh) không phải thừa', () => {
  const r = checkHtml(page('<section id="popup_doiqua"></section><section id="popup_bxh"></section>'), resolveType('39'));
  assert.deepEqual(r.extra.map((x) => x.popup), ['popup_doiqua']);
});

test('popup đăng ký: option đầu thiếu class → ❌ ghi rõ lý do', () => {
  const html = page(REGISTER_OK.replace('class="character-select-title"', ''));
  const r = checkHtml(html, resolveType('39'));
  const row = r.structure.find((x) => x.check.includes('CharacterID'));
  assert.equal(row.status, '❌ Fail — option đầu thiếu class character-select-title');
});

test('popup điều kiện: form thiếu submit → ❌; form invite/share được miễn', () => {
  const html = page(`<section id="popup_condition"><form id="pm__condition-form"><input></form>
    <form class="pm__invite-form"><input></form></section>`);
  const r = checkHtml(html, resolveType('39'));
  const submitRows = r.structure.filter((x) => x.check.includes('submit riêng'));
  assert.equal(submitRows.length, 1);
  assert.match(submitRows[0].status, /^❌/);
});

test('biến thể payment: không đòi form id condition, form invite phải có input', () => {
  const html = page('<section id="popupCondition"><form class="pm__share-form"><button>Share</button></form><form class="pm__invite-form"></form></section>');
  const r = checkHtml(html, resolveType('13'));
  assert.equal(r.structure.some((x) => x.check.includes('id chứa "condition"')), false);
  assert.match(r.structure.find((x) => x.check.includes('pm__invite-form')).status, /^❌/);
});

test('popup thông báo: không có vùng chữ → ❌; <p> trong .MS__content → ✅', () => {
  const bad = checkHtml(page('<section id="popup_inform"><div></div></section>'), resolveType('39'));
  assert.match(bad.structure.find((x) => x.popup === 'popup_inform').status, /^❌/);
  const old = checkHtml(page('<section id="popup_inform"><div class="MS__content"><p>Hi</p></div></section>'), resolveType('39'));
  assert.equal(old.structure.find((x) => x.popup === 'popup_inform').status, '✅ Pass');
});

test('loại structure-only: không chạy Layer 1-2, icon tối đa ◐', () => {
  const r = checkHtml(page(REGISTER_OK + '<section id="popup_la"></section>'), resolveType('shop'));
  assert.equal(r.required.length, 0);
  assert.equal(r.extra.length, 0);
  assert.equal(r.icon, '◐');
});

test('vote: popup_mrmiss_reg là popup đăng ký, thiếu input file ảnh → ⚠️', () => {
  const html = page(REGISTER_OK.replace('popup_register', 'popup_mrmiss_reg'));
  const r = checkHtml(html, resolveType('9'));
  assert.ok(r.structure.some((x) => x.popup === 'popup_mrmiss_reg' && x.check.includes('ServerID')));
  assert.ok(r.warnings.some((w) => w.includes('MediaImage')));
});
