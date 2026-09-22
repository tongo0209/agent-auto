#!/usr/bin/env node
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = join(dirname(fileURLToPath(import.meta.url)), 'pm-gate.mjs');
const KIT = process.env.PM_KIT_DIR || join(homedir(), 'VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit');
const L = 'luckydraw-gift-exchange';
const P = 'payment';
const ALIASES = [['popup_signIn', 'popup_login'], ['popup_nhanluot_signUp', 'popup_register']];

if (!existsSync(join(KIT, 'gameplays'))) {
  console.log(`SKIP — không thấy ai-template-kit ở ${KIT}`);
  process.exit(0);
}

const root = mkdtempSync(join(tmpdir(), 'pm-gate-'));
const noProjects = join(root, 'no-projects');
mkdirSync(noProjects);

// Kit không vào repo public: fixture dựng lúc chạy từ MASTER thật.
function rawMaster(g) {
  return readFileSync(join(KIT, 'gameplays', g, `MASTER-${g}.html`), 'utf8').replaceAll('<any', '<div').replaceAll('</any>', '</div>');
}

function base(g) {
  let text = rawMaster(g);
  for (const [kit, production] of ALIASES) text = text.replaceAll(kit, production);
  let group = 0;
  return text.replace(/pm__group-N/g, () => `pm__group-${++group}`)
    .replaceAll('pm__option-N', 'pm__option-1')
    .replaceAll('pm__remain-*', 'pm__remain-canhen');
}

function once(text, from, to) {
  if (!text.includes(from)) throw new Error(`fixture lệch MASTER — không thấy: ${from}`);
  return text.replace(from, () => to);
}

function onceAfter(text, marker, from, to) {
  const start = text.indexOf(marker);
  const at = text.indexOf(from, start);
  if (start < 0 || at < 0) throw new Error(`fixture lệch MASTER — không thấy ${from} sau ${marker}`);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

function moveClassToFirstChild(text, id, cls) {
  const opener = `<div id="${id}" class="${cls}">`;
  const withoutClass = once(text, opener, `<div id="${id}">`);
  return onceAfter(withoutClass, `<div id="${id}">`, '<div>', `<div class="${cls}">`);
}

function writeCase(text, name = 'case.html') {
  const dir = mkdtempSync(join(root, 'c-'));
  const file = join(dir, name);
  writeFileSync(file, text);
  return file;
}

function run(args, env = {}) {
  const r = spawnSync('node', [GATE, ...args, '--json'], { encoding: 'utf8', env: { ...process.env, PM_PROJECTS_DIR: noProjects, ...env } });
  const json = r.stdout.trim() ? JSON.parse(r.stdout) : null;
  return { exit: r.status, json, stderr: r.stderr };
}

const gate = (g, text, name) => run([writeCase(text, name), '--gameplay', g, '--baseline', 'none']);
const codes = (list) => list.map((f) => f.code);
const describe = (r) => (r.json
  ? `exit=${r.exit} 🔴[${codes(r.json.fails)}] 🟡[${codes(r.json.warns)}] nợ[${codes(r.json.preexisting ?? [])}]`
  : `exit=${r.exit} stderr=${r.stderr.trim().split('\n')[0]}`);

const red = (code) => (r) => Boolean(r.json) && codes(r.json.fails).includes(code);
const noRed = (r) => Boolean(r.json) && r.json.fails.length === 0;
const clean = (r) => r.exit === 0 && noRed(r) && r.json.warns.length === 0;
const onlyWarn = (code) => (r) => noRed(r) && codes(r.json.warns).includes(code);
const redWithout = (code) => (r) => r.exit !== 2 && Boolean(r.json) && !codes(r.json.fails).includes(code);

const SHARE_BUTTON = '<a class="pm__btn-share" title="Share ngay" href="javascript:;" onclick="feedToWall()">Share Facebook</a>';

function baselineCase() {
  const repo = mkdtempSync(join(root, 'repo-'));
  const file = join(repo, 'index.html');
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });
  git('init', '-q');
  writeFileSync(file, once(base(L), '<a href="#" class="pm__menu-selectrole"></a>', '<a href="#" class="pm__menu-selectrole"></a>\n  <span class="pm__point">0</span>'));
  git('add', 'index.html');
  git('commit', '-qm', 'fixture');
  writeFileSync(file, once(readFileSync(file, 'utf8'), 'class="pm__login pm__anchor"', 'class="pm__loginn pm__anchor"'));
  return run([file, '--gameplay', L, '--baseline', 'HEAD']);
}

function lockedByNoteCase() {
  const projects = join(root, 'projects');
  mkdirSync(join(projects, 'g'), { recursive: true });
  writeFileSync(join(projects, 'g', 's.md'), '# g/s\n\n## 1. Khoá\n- gameplay: payment\n- type: 13-khuyen-mai-nap\n\n## 2. Nơi code\n');
  const campaign = join(root, 'products', 'g', 'landing', 's');
  mkdirSync(campaign, { recursive: true });
  writeFileSync(join(campaign, 'index.html'), base(P));
  return run([join(campaign, 'index.html'), '--baseline', 'none'], { PM_PROJECTS_DIR: projects });
}

function refCase() {
  const ref = mkdtempSync(join(root, 'ref-'));
  writeFileSync(join(ref, 'index.html'), '<body><a href="#" class="pm__btn-history"></a><div id="popup_history" class="pm__history-module"></div></body>');
  const file = writeCase('<body><div id="popup_history" class="pm__history-module"></div></body>');
  return run([file, '--gameplay', 'none', '--ref', ref, '--baseline', 'none']);
}

function popupConditionPartial() {
  const text = base(L);
  return text.slice(text.indexOf('<div id="popup_condition"'), text.indexOf('<!-- Popup lịch sử -->'));
}

const TWIG_PARTIAL = '{% if a %}<form id="sso-login-form"><input type="text" name="u"></form>{% else %}<form id="sso-login-form"><input type="text" name="u"></form>{% endif %}';

// Mỗi ca: danh sách [nhãn, kết quả chạy, điều kiện] — ca xanh khi mọi điều kiện đúng.
const CASES = [
  ['0 base L/P sạch', () => [
    ['L', gate(L, base(L)), clean],
    ['P', gate(P, base(P)), clean],
  ]],
  ['1 MASTER thô (chưa alias) → PG-OVR', () => [
    ['L', gate(L, rawMaster(L)), red('PG-OVR')],
    ['P', gate(P, rawMaster(P)), red('PG-OVR')],
  ]],
  ['2 nhân đôi sso-login-form → PG-ONCE', () => [L, P].map((g) => [g,
    gate(g, once(base(g), '<div id="sso-login-form">', '<div id="sso-login-form"></div>\n<div id="sso-login-form">')), red('PG-ONCE')])],
  ['3 L: 1 pm__btn-claim → pm__btn_claim → PG-CLAIM', () => [
    ['L', gate(L, once(base(L), 'class="pm__btn-claim">gift', 'class="pm__btn_claim">gift')), red('PG-CLAIM')],
  ]],
  ['4 P: nút khu chính → pm__btn-claim → PG-CLAIM', () => [
    ['P', gate(P, once(base(P), 'class="pm__btn_claim">', 'class="pm__btn-claim">')), red('PG-CLAIM')],
  ]],
  ['5 P: nút popup-confirm → pm__btn_claim → PG-CLAIM', () => [
    ['P', gate(P, once(base(P), 'class="pm__btn-claim">Đồng ý', 'class="pm__btn_claim">Đồng ý')), red('PG-CLAIM')],
  ]],
  ['6 sót đúng 1 <any> → PG-ANY "1 thẻ"', () => [
    ['L', gate(L, once(base(L), '<div class="pm__point">0</div>', '<any class="pm__point">0</any>')),
      (r) => r.json?.fails.some((f) => f.code === 'PG-ANY' && f.msg.includes('1 thẻ'))],
    ['P', gate(P, once(base(P), '<div class="pm__totalCash" data-rate="1">0</div>', '<any class="pm__totalCash" data-rate="1">0</any>')),
      (r) => r.json?.fails.some((f) => f.code === 'PG-ANY' && f.msg.includes('1 thẻ'))],
  ]],
  ['7 class module dời xuống thẻ con → PG-OPEN', () => [
    ['history', gate(L, moveClassToFirstChild(base(L), 'popup_history', 'pm__history-module')), red('PG-OPEN')],
    ['inform', gate(L, moveClassToFirstChild(base(L), 'popup_inform', 'pm__inform')), red('PG-OPEN')],
    ['login', gate(P, moveClassToFirstChild(base(P), 'popup_login', 'pm__module pm__login-module')), red('PG-OPEN')],
  ]],
  ['8 xoá hook bắt buộc → PG-REQ', () => [
    ['pm__point', gate(L, once(base(L), 'class="pm__point"', 'class="counter"')), red('PG-REQ')],
    ['popup_login', gate(L, once(base(L), 'id="popup_login" ', '')), red('PG-REQ')],
    ['popupCondition', gate(P, once(base(P), 'id="popupCondition" ', '')), red('PG-REQ')],
  ]],
  ['9 input lệch name/id/type → PG-INPUT', () => [
    ['name', gate(L, once(base(L), 'name="Fullname"', 'name="fullname"')), red('PG-INPUT')],
    ['id', gate(L, once(base(L), 'id="input-phone"', 'id="phone-number"')), red('PG-INPUT')],
    ['type', gate(L, once(base(L), 'type="tel" name="Phone"', 'type="text" name="Phone"')), red('PG-INPUT')],
  ]],
  ['10 L: pm__rut mất data-value → PG-PAIR', () => [
    ['L', gate(L, once(base(L), 'class="pm__rut" data-value="10"', 'class="pm__rut"')), red('PG-PAIR')],
  ]],
  ['11 thêm pm__btn-rank → PG-DONT', () => [L, P].map((g) => [g,
    gate(g, once(base(g), '<a href="#" class="pm__menu-selectrole">', '<a href="#popup_bxh" class="pm__btn-rank"></a>\n  <a href="#" class="pm__menu-selectrole">')), red('PG-DONT')])],
  ['12 trộn hook gameplay khác → PG-GAME/PG-CLAIM', () => [
    ['L', gate(L, once(base(L), '</body>', '<a class="pm__btn_claim"></a>\n</body>')), (r) => red('PG-GAME')(r) || red('PG-CLAIM')(r)],
    ['P', gate(P, once(base(P), '</body>', '<form id="x" class="pm__quiz-form"></form>\n</body>')), red('PG-GAME')],
  ]],
  ['13 pm__module trên pm__inform → PG-DONT', () => [L, P].map((g) => [g,
    gate(g, once(base(g), 'class="pm__inform"', 'class="pm__module pm__inform"')), red('PG-DONT')])],
  ['14 nhân đôi pm__text_fullname → PG-ONCE', () => [
    ['L', gate(L, once(base(L), '<div for="Fullname" class="pm__text_fullname"></div>', '<div for="Fullname" class="pm__text_fullname"></div><label class="pm__text_fullname"></label>')), red('PG-ONCE')],
  ]],
  ['15 sửa chính tả sumbit → PG-DONT/PG-TYPO', () => [L, P].map((g) => [g,
    gate(g, once(base(g), 'pm__invite-sumbit-code', 'pm__invite-submit-code')), (r) => red('PG-DONT')(r) || red('PG-TYPO')(r)])],
  ['16 2 pm__form-history trong popup_history → PG-ONCE', () => [
    ['L', gate(L, onceAfter(base(L), '<div id="popup_history"', '<div class="pm__form-history">', '<div class="pm__form-history"></div><div class="pm__form-history">')), red('PG-ONCE')],
  ]],
  ['17 id sso-login-form → class → PG-FORM', () => [L, P].map((g) => [g,
    gate(g, once(base(g), 'id="sso-login-form"', 'class="sso-login-form"')), red('PG-FORM')])],
  ['18 pm__login chuyển vào popup_login → PG-NEST', () => [
    ['L', gate(L, once(once(base(L), 'class="pm__login pm__anchor"', 'class="pm__anchor"'),
      '<div class="pm__login_popup_title"></div>', '<div class="pm__login_popup_title"></div><a href="#" class="pm__login pm__anchor"></a>')), red('PG-NEST')],
  ]],
  ['19 bịa data-foo → chỉ 🟡 PG-UNKNOWN', () => [
    ['L', gate(L, once(base(L), 'class="pm__point"', 'class="pm__point" data-foo="1"')), onlyWarn('PG-UNKNOWN')],
  ]],
  ['20 hook production ngoài kit → chỉ 🟡 PG-UNKNOWN', () => [
    ['L', gate(L, once(base(L), '<a href="#" class="pm__menu-selectrole"></a>', '<a href="#" class="pm__menu-selectrole"></a>\n  <span class="pm__rankchar-Rank"></span>')), onlyWarn('PG-UNKNOWN')],
  ]],
  ['21 pm__point → pm__pointt → PG-TYPO', () => [
    ['L', gate(L, once(base(L), 'class="pm__point"', 'class="pm__pointt"')), red('PG-TYPO')],
  ]],
  ['22 bản trùng nằm trong <!-- --> → không 🔴', () => [
    ['L', gate(L, once(base(L), '<div id="sso-login-form">', '<!-- <div id="sso-login-form"></div> -->\n<div id="sso-login-form">')), noRed],
  ]],
  ['23 Twig if/else 2 nhánh cùng id → không PG-ONCE', () => [
    ['partial', gate(L, TWIG_PARTIAL, 'popup.twig'), redWithout('PG-ONCE')],
    ['full', gate(L, once(base(L), '<div id="sso-login-form">', '{% if a %}<div id="sso-login-form" class="v1">{% else %}<div id="sso-login-form" class="v2">{% endif %}'), 'index.twig'), redWithout('PG-ONCE')],
  ]],
  ['24 P: pm__group-N nguyên văn → PG-DONT; pm__group-1..3 → không 🔴', () => [
    ['N', gate(P, base(P).replace(/pm__group-\d/g, 'pm__group-N')), red('PG-DONT')],
    ['1..3', gate(P, base(P)), noRed],
  ]],
  ['25 không cờ, không note → PG-GAME "chưa khoá"', () => [
    ['L', run([writeCase(base(L)), '--baseline', 'none']),
      (r) => r.exit === 1 && r.stderr.trim() !== '' && r.json?.fails.some((f) => f.code === 'PG-GAME' && f.msg.includes('chưa khoá'))],
  ]],
  ['26 gameplay đọc từ note dự án', () => [
    ['P', lockedByNoteCase(), (r) => r.json?.gameplay === P && r.exit === 0],
  ]],
  ['27 baseline HEAD: chỉ lỗi mới chặn', () => [
    ['L', baselineCase(), (r) => Boolean(r.json) && r.json.fails.length > 0 && r.json.fails.every((f) => f.code === 'PG-TYPO')
      && codes(r.json.preexisting).includes('PG-ONCE')],
  ]],
  ['28 file partial không <body → không PG-REQ', () => [
    ['L', gate(L, popupConditionPartial()), redWithout('PG-REQ')],
  ]],
  ['29 --gameplay none --ref: ref có hook mà file thiếu → PG-REF', () => [
    ['none', refCase(), red('PG-REF')],
  ]],
  ['30 P: pm__btn-share ra ngoài form id → PG-NEST 🔴', () => [
    ['P', gate(P, once(once(base(P), SHARE_BUTTON, ''), '<form id="pm__invite-form">', `${SHARE_BUTTON}\n        <form id="pm__invite-form">`)), red('PG-NEST')],
  ]],
];

let pass = 0;
let fail = 0;
console.log('pm-gate.mjs\n');
for (const [name, build] of CASES) {
  let results;
  try {
    results = build();
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name} — ${e.message}`);
    continue;
  }
  const bad = results.filter(([, r, ok]) => !ok(r));
  if (!bad.length) { pass++; console.log(`  ✓ ${name}`); continue; }
  fail++;
  console.log(`  ✗ ${name}`);
  for (const [label, r] of bad) console.log(`      ${label}: ${describe(r)}`);
}
rmSync(root, { recursive: true, force: true });
console.log(`\npass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
