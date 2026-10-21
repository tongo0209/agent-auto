import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveType, checkHtml, typeFromNote, newGameplayType, withoutDebt } from './check-promotion.mjs';

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

test('popup production khai kind=known (popup_getlist) không bị báo thừa', () => {
  const r = checkHtml(page(INFORM_OK + '<section id="popup_getlist"></section>'), resolveType('5'));
  assert.ok(!r.extra.some((x) => x.popup === 'popup_getlist'));
});

test('type trong file dự án dạng <STT>-<slug> → đúng loại; slug ngoài bảng → null', () => {
  assert.equal(typeFromNote('2-lucky-draw').stt, 2);
  assert.equal(typeFromNote('01-dang-ky-truoc').stt, 1);
  assert.equal(typeFromNote('22-moi-ban-be-nhan-qua').stt, 22);
  assert.equal(typeFromNote('vong-quay').stt, 39);
  assert.equal(typeFromNote('dang-ky-thi-dau-va-to-chuc-su-kien'), null);
});

test('gameplay mới: bộ popup chung + popup của landing mẫu, không báo thừa, icon tối đa ◐', () => {
  const type = newGameplayType('tournament');
  const ref = page('<section id="popup_dangkytochuc"></section><section id="popup_login"></section>');
  const html = page(LUCKY_DRAW_FULL.replace(/<\/?(html|body)>/g, '') + '<section id="popup_riengmoi"></section>');
  const missing = checkHtml(html, type, { refHtmls: [ref] });
  assert.ok(missing.failed.some((f) => f.includes('popup_dangkytochuc')));
  assert.equal(missing.extra.length, 0);
  const full = checkHtml(html.replace('popup_riengmoi', 'popup_dangkytochuc'), type, { refHtmls: [ref] });
  assert.deepEqual(full.failed, []);
  assert.equal(full.icon, '◐');
});

test('landing cũ: lỗi có từ bản trước run thành nợ, chỉ lỗi mới chặn', () => {
  const type = resolveType('2');
  const before = checkHtml(page(INFORM_OK), type);
  const after = checkHtml(page(INFORM_OK.replace('pm__inform-text', 'x')), type);
  const r = withoutDebt(after, before, type);
  assert.ok(r.debt.includes('popup_history'));
  assert.ok(!r.failed.includes('popup_history'));
  assert.ok(r.failed.some((f) => f.startsWith('popup_inform')));
});

function cliFixture(type, ref = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cli-'));
  const dir = path.join(root, 'gt/A1-X/event-1');
  fs.mkdirSync(path.join(dir, 'mainsite'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects/x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects/x/event.md'), `# x\n\n## 1. Khoá\n- gameplay: none\n- type: ${type}\n- ref: ${ref}\n\n## 2. Nơi code\n- gt-promotion: ${dir}\n`);
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q');
  const run = (...args) => spawnSync('node', [path.join(import.meta.dirname, 'check-promotion.mjs'), ...args], {
    encoding: 'utf8', env: { ...process.env, PM_PROJECTS_DIR: path.join(root, 'projects') },
  });
  return { dir, git, run, file: (name, html) => { fs.writeFileSync(path.join(dir, 'mainsite', name), html); return path.join(dir, 'mainsite', name); } };
}

test('CLI: không truyền loại → lấy từ file dự án, soát MỌI file truyền vào', () => {
  const f = cliFixture('2-lucky-draw');
  const ok = f.file('index.html', LUCKY_DRAW_FULL);
  const bad = f.file('index-en.html', page(INFORM_OK));
  const r = f.run(ok, bad);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /index\.html[\s\S]*STT 2[\s\S]*index-en\.html[\s\S]*❌ Thiếu/);
});

test('CLI: gameplay mới lấy popup của ref; --baseline HEAD chỉ chặn lỗi mới', () => {
  const ref = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ref-'));
  fs.writeFileSync(path.join(ref, 'index.html'), page('<section id="popup_dangkytochuc"></section>'));
  const f = cliFixture('to-chuc-giai-dau', ref);
  const file = f.file('index.html', page(INFORM_OK));
  const fresh = f.run(file);
  assert.equal(fresh.status, 1);
  assert.match(fresh.stdout, /gameplay mới[\s\S]*popup_dangkytochuc/);
  f.git('add', '.');
  f.git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base');
  assert.equal(f.run(file, '--baseline', 'HEAD').status, 0);
  f.file('index.html', page(INFORM_OK.replace('pm__inform-text', 'x')));
  const broke = f.run(file, '--baseline', 'HEAD');
  assert.equal(broke.status, 1);
  assert.match(broke.stdout, /Lỗi có sẵn trước run[\s\S]*popup_register/);
});

test('CLI: không truyền loại và file dự án chưa có type → exit 2', () => {
  const f = cliFixture('');
  assert.equal(f.run(f.file('index.html', LUCKY_DRAW_FULL)).status, 2);
});
