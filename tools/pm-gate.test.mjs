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
const MILESTONE_VALUE = '100';

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
    .replaceAll('pm__remain-*', 'pm__remain-canhen')
    .replaceAll('data-milestone=""', `data-milestone="${MILESTONE_VALUE}"`);
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
const describeOne = (json) => `🔴[${json.fails.map((f) => `${f.code} ${f.token}`)}] 🟡[${codes(json.warns)}] nợ[${codes(json.preexisting ?? [])}]`;
const describe = (r) => {
  if (!r.json) return `exit=${r.exit} stderr=${r.stderr.trim().split('\n')[0]}`;
  const pages = [].concat(r.json);
  return `exit=${r.exit} ${pages.map((page) => (pages.length > 1 ? `${page.file.split('/').pop()}: ` : '') + describeOne(page)).join(' | ')}`;
};

const red = (code) => (r) => Boolean(r.json) && codes(r.json.fails).includes(code);
const noRed = (r) => Boolean(r.json) && r.json.fails.length === 0;
const clean = (r) => r.exit === 0 && noRed(r) && r.json.warns.length === 0;
const onlyWarn = (code) => (r) => noRed(r) && codes(r.json.warns).includes(code);
const redWithout = (code) => (r) => r.exit !== 2 && Boolean(r.json) && !codes(r.json.fails).includes(code);

const SHARE_BUTTON = '<a class="pm__btn-share" title="Share ngay" href="javascript:;" onclick="feedToWall()">Share Facebook</a>';

function baselineRun(committed, edited) {
  const repo = mkdtempSync(join(root, 'repo-'));
  const file = join(repo, 'index.html');
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });
  git('init', '-q');
  writeFileSync(file, committed);
  git('add', 'index.html');
  git('commit', '-qm', 'fixture');
  writeFileSync(file, edited);
  return run([file, '--gameplay', L, '--baseline', 'HEAD']);
}

function baselineCase() {
  const withDebt = once(base(L), '<a href="#" class="pm__menu-selectrole"></a>', '<a href="#" class="pm__menu-selectrole"></a>\n  <span class="pm__point">0</span>');
  return baselineRun(withDebt, once(withDebt, 'class="pm__login pm__anchor"', 'class="pm__loginn pm__anchor"'));
}

const BARE_MILESTONE = '<div class="list"><div class="pm__milestone" data-milestone="5"></div></div>';
const withBareMilestones = (count) => once(base(L), '</body>', `${BARE_MILESTONE.repeat(count)}\n</body>`);

function lockedByNoteCase() {
  const projects = join(root, 'projects');
  mkdirSync(join(projects, 'g'), { recursive: true });
  writeFileSync(join(projects, 'g', 's.md'), '# g/s\n\n## 1. Khoá\n- gameplay: payment\n- type: 13-khuyen-mai-nap\n\n## 2. Nơi code\n');
  const campaign = join(root, 'products', 'g', 'landing', 's');
  mkdirSync(campaign, { recursive: true });
  writeFileSync(join(campaign, 'index.html'), base(P));
  return run([join(campaign, 'index.html'), '--baseline', 'none'], { PM_PROJECTS_DIR: projects });
}

function refCaseWith(refBody) {
  const ref = mkdtempSync(join(root, 'ref-'));
  writeFileSync(join(ref, 'index.html'), `<body>${refBody}</body>`);
  const file = writeCase('<body><div id="popup_history" class="pm__history-module"></div></body>');
  return run([file, '--gameplay', 'none', '--ref', ref, '--baseline', 'none']);
}

function refDistCase(targetBody) {
  const ref = mkdtempSync(join(root, 'ref-'));
  mkdirSync(join(ref, 'dist'));
  mkdirSync(join(ref, 'assets', 'module'), { recursive: true });
  writeFileSync(join(ref, 'dist', 'index.html'), '<body><div id="popup_login"><a class="pm__btn-login pm__email"></a></div><a class="pm__btn-history"></a></body>');
  writeFileSync(join(ref, 'assets', 'module', 'popup_condition.html.twig'), '<div id="popup_condition" class="pm__condition-module"></div>');
  return run([writeCase(`<body>${targetBody}</body>`), '--gameplay', 'none', '--ref', ref, '--baseline', 'none']);
}

const HOOKS_PROJECTS = join(root, 'hooks-at-projects');
const missingPoint = () => once(base(L), 'class="pm__point"', 'class="counter"');
const HISTORY_ONLY = '<body><div id="popup_history" class="pm__history-module"></div></body>';

// Note khoá Lucky + dòng hooks-at; file đặt trong campaign cdn-source hoặc ở thư mục bàn giao gt-promotion (mục 2).
function hooksAtCase(slug, hooksAtLine, text, { handoff = false, args = [] } = {}) {
  const dir = handoff ? join(root, 'gt-promotion', slug, 'Promotion') : join(root, 'cdn-source/products/g/landing', slug);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(HOOKS_PROJECTS, 'g'), { recursive: true });
  const places = handoff ? `- gt-promotion: ${dir}\n` : '';
  writeFileSync(join(HOOKS_PROJECTS, 'g', `${slug}.md`), `## 1. Khoá\n- gameplay: ${L}\n${hooksAtLine}\n## 2. Nơi code\n${places}`);
  writeFileSync(join(dir, 'index.html'), text);
  return run([join(dir, 'index.html'), '--baseline', 'none', ...args], { PM_PROJECTS_DIR: HOOKS_PROJECTS });
}

function refDir() {
  const ref = mkdtempSync(join(root, 'ref-'));
  writeFileSync(join(ref, 'index.html'), '<body><a href="#" class="pm__btn-history"></a><div id="popup_history" class="pm__history-module"></div></body>');
  return ref;
}

const deferredWarn = (code) => (r) => r.exit === 0 && noRed(r) && r.json.warns.some((f) => f.code === code && f.msg.includes('hooks-at: handoff'));

const refCase = () => refCaseWith('<a href="#" class="pm__btn-history"></a><div id="popup_history" class="pm__history-module"></div>');

function pageCase(g, pages) {
  const campaign = mkdtempSync(join(root, 'page-'));
  for (const [path, text] of Object.entries(pages)) {
    mkdirSync(dirname(join(campaign, 'dist', path)), { recursive: true });
    writeFileSync(join(campaign, 'dist', path), text);
  }
  return run(['--page', campaign, '--gameplay', g, '--baseline', 'none']);
}

const pageOf = (r, name) => r.json?.find((page) => page.file.endsWith(`/${name}`));
const lacks = (r, code, token) => Boolean(r.json) && !r.json.fails.some((f) => f.code === code && f.token === token);
const redOn = (code, token) => (r) => Boolean(r.json) && r.json.fails.some((f) => f.code === code && f.token === token);

function between(text, from, to) {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error(`fixture lệch MASTER — không thấy khối ${from} … ${to}`);
  return text.slice(0, start) + text.slice(end);
}

// Trang H5 (webview trong game) đã đăng nhập sẵn: không nút/popup đăng nhập, không popup đăng ký.
function withoutLogin(text) {
  const noButtons = once(once(text, '<a href="#" class="pm__login pm__anchor"></a>', ''), '<a href="#" class="pm__logout pm__anchor"></a>', '');
  return between(noButtons, '<!-- Module đăng nhập MTO -->', '<!-- Popup đổi/chọn role');
}

const withoutPopups = (text) => between(text, '<!-- ══════════ POPUP ══════════ -->', '<!-- Popup kết quả quay');
// cdn-source ghép trang từ partial: index-vn.html.twig include libraryMainsite-t-popup (totalfootball, ddtank chengdu…).
const popupsIncluded = (text) => once(withoutPopups(text), '<!-- Popup kết quả quay',
  "{% include './libraryMainsite-t-popup/libraryMainsite-t-popup.html.twig' %}\n<!-- Popup kết quả quay");
const withoutConditionAndHistory =(text) => between(between(text, '<!-- ═══════════ ② KHUNG', '<!-- Popup lịch sử -->'), '<!-- Popup lịch sử -->', '<!-- Popup thông báo -->');
const H5_FLAG = '<script>var varMS = { H5: true, onlyPC: false };</script>\n</body>';
const noRut = (text) => text.replace(/ class="pm__rut" data-value="\d+"/g, ' class="spin"').replace('class="pm__point"', 'class="counter"');
const noClaim = (text) => text.replaceAll('class="pm__btn-claim"', 'class="gift"');

function popupConditionPartial() {
  const text = base(L);
  return text.slice(text.indexOf('<div id="popup_condition"'), text.indexOf('<!-- Popup lịch sử -->'));
}

const POINT = '<div class="pm__point">0</div>';
const PARTIAL_WITH_BODY_IN_SCRIPT = '<div id="popup_history" class="pm__history-module"><div class="pm__form-history"></div></div>\n<script>\n  // tên quà theo class của <body class="vn">\n</script>';

const TWIG_PARTIAL = '{% if a %}<form id="sso-login-form"><input type="text" name="u"></form>{% else %}<form id="sso-login-form"><input type="text" name="u"></form>{% endif %}';

// Mỗi ca: danh sách [nhãn, kết quả chạy, điều kiện] — ca xanh khi mọi điều kiện đúng.
const CASES = [
  ['0 base L/P sạch', () => [
    ['L', gate(L, base(L)), clean],
    ['P', gate(P, base(P)), clean],
  ]],
  ['1 MASTER thô (tên kit popup_signIn/popup_nhanluot_signUp) → hợp lệ ngang tên production (NSTT 62633, user chốt 6/10)', () => [
    ...[L, P].map((g) => [g, gate(g, ALIASES.reduce((t, [kit, production]) => t.replaceAll(production, kit), base(g))), noRed]),
  ]],
  ['1b pm__btn-show-condition trong popup_getlist → không PG-NEST (NSTT 62633)', () => [
    ['L', gate(L, once(base(L), '</body>', '<section id="popup_getlist" class="MS__popup"><a href="#" class="pm__btn-show-condition"></a></section>\n</body>')),
      (r) => lacks(r, 'PG-NEST', 'pm__btn-show-condition')],
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
    ['id', gate(L, once(base(L), 'name="u" id="u"', 'name="u" id="user"')), red('PG-INPUT')],
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
  ['31 --page: trang nằm trong dist/<thư mục con> vẫn được soi', () => [
    ['main/', pageCase(L, { 'main/index.html': base(L) }), (r) => r.exit === 0 && r.json?.length === 1 && r.json[0].fails.length === 0],
  ]],
  ['32 --page: hook bắt buộc ở trang khác cùng bộ → không PG-REQ; bản ngôn ngữ thiếu → PG-REQ', () => [
    ['2 trang', pageCase(L, { 'index.html': once(base(L), 'class="pm__point"', 'class="counter"'), 'quayso.html': '<body><span class="pm__point">0</span></body>' }),
      (r) => r.json?.length === 2 && r.json.every((page) => lacks({ json: page }, 'PG-REQ', 'pm__point'))],
    ['index-en', pageCase(L, { 'index.html': base(L), 'index-en.html': once(base(L), 'class="pm__point"', 'class="counter"') }),
      (r) => lacks({ json: pageOf(r, 'index.html') }, 'PG-REQ', 'pm__point') && redOn('PG-REQ', 'pm__point')({ json: pageOf(r, 'index-en.html') })],
  ]],
  ['33 L: chỉ quay hoặc chỉ đổi quà (production) → không PG-REQ; không cả hai → PG-REQ', () => [
    ['chỉ quay', gate(L, noClaim(base(L))), noRed],
    ['chỉ đổi', gate(L, noRut(base(L))), noRed],
    ['không cả hai', gate(L, noClaim(noRut(base(L)))), redOn('PG-REQ', 'pm__rut / pm__btn-claim')],
  ]],
  ['34 trang H5 không nút/popup đăng nhập → không PG-REQ; trang web thì PG-REQ', () => [
    ['H5', gate(L, once(withoutLogin(base(L)), '</body>', H5_FLAG)), noRed],
    ['web', gate(L, withoutLogin(base(L))), redOn('PG-REQ', 'pm__login')],
  ]],
  ['34b trang H5 Lucky không popup điều kiện/lịch sử (lượt từ trong game) → không PG-REQ; trang web thì PG-REQ', () => [
    ['H5', gate(L, once(withoutConditionAndHistory(base(L)), '</body>', H5_FLAG)), noRed],
    ['web', gate(L, withoutConditionAndHistory(base(L))), (r) => redOn('PG-REQ', 'popup_condition / popupCondition')(r) && redOn('PG-REQ', 'popup_history')(r)],
  ]],
  ['35 bỏ khối mto-login-form → PG-REQ (kit thắng từ 6/10); pm__btn-login ra ngoài pm__login-module → PG-NEST', () => [
    ['bỏ wrapper', gate(L, once(base(L), '<div id="mto-login-form">', '<div>')), redOn('PG-REQ', 'mto-login-form')],
    ['ra ngoài', gate(L, once(once(base(L), '<div id="mto-login-form">', '<div>'), '<a href="#" class="pm__menu-selectrole"></a>',
      '<a href="#" class="pm__menu-selectrole"></a>\n  <a href="#" class="pm__btn-login pm__zing"></a>')), redOn('PG-NEST', 'pm__btn-login')],
  ]],
  ['35b #refresh-captcha thiếu class trần btn-refresh (JS kit bám) → PG-PAIR', () => [
    ['thiếu', gate(L, once(base(L), 'class="btn-refresh"', 'class=""')), redOn('PG-PAIR', 'refresh-captcha')],
  ]],
  ['36 pm__login/pm__logout không kèm pm__anchor (production) → không 🔴; nút quiz vẫn phải kèm', () => [
    ['L', gate(L, once(once(once(base(L), 'class="pm__login pm__anchor"', 'class="pm__login"'), 'class="pm__logout pm__anchor"', 'class="pm__logout"'),
      'class="pm__anchor pm__text_get_point"', 'class="pm__text_get_point"')),
    (r) => lacks(r, 'PG-REQ', 'pm__anchor') && lacks(r, 'PG-PAIR', 'pm__login') && lacks(r, 'PG-PAIR', 'pm__logout') && redOn('PG-PAIR', 'pm__text_get_point')(r)],
  ]],
  ['37 pm__login ×2 (header + menu mobile, production) → không PG-ONCE', () => [
    ['L', gate(L, once(base(L), '<a href="#" class="pm__login pm__anchor"></a>', '<a href="#" class="pm__login pm__anchor"></a><a href="#" class="pm__login pm__anchor"></a>')), noRed],
    ['P', gate(P, once(base(P), '<a href="#" class="pm__logout">Đăng xuất</a>', '<a href="#" class="pm__logout">Đăng xuất</a><a href="#" class="pm__logout">Đăng xuất</a>')), noRed],
  ]],
  ['38 pm__menu-invite trong popup điều kiện (production) → không PG-NEST', () => [
    ['L', gate(L, once(base(L), '<div class="pm__condition_list_popup_title"></div>', '<div class="pm__condition_list_popup_title"></div><a href="#" class="pm__menu-invite"></a>')), noRed],
  ]],
  ['39 popup điều kiện nhận cả popup_condition lẫn popupCondition ở cả 2 gameplay', () => [
    ['P popup_condition', gate(P, once(base(P), 'id="popupCondition"', 'id="popup_condition"')), noRed],
    ['L popupCondition', gate(L, once(base(L), 'id="popup_condition"', 'id="popupCondition"')), noRed],
    ['P không có cả hai', gate(P, once(base(P), 'id="popupCondition" ', '')), redOn('PG-REQ', 'popupCondition / popup_condition')],
  ]],
  ['40 P: pm__condition-form (production) → không PG-GAME; captcha-image vẫn PG-GAME', () => [
    ['condition-form', gate(P, once(base(P), '<div class="pm__title-form">LỊCH SỬ NHẬN</div>', '<div class="pm__title-form">LỊCH SỬ NHẬN</div><form id="pm__condition-form"></form>')), noRed],
    ['captcha', gate(P, once(base(P), '<div class="pm__title-form">LỊCH SỬ NHẬN</div>', '<div class="pm__title-form">LỊCH SỬ NHẬN</div><img id="captcha-image" src="#">')), redOn('PG-GAME', 'captcha-image')],
  ]],
  ['41 id popup đánh số (popup_reward2) → không PG-TYPO; popup_resgister vẫn PG-TYPO', () => [
    ['popup_reward2', gate(L, once(base(L), '<!-- Popup xác nhận đổi quà (nếu cần) -->', '<div id="popup_reward2"></div>')), noRed],
    ['popup_resgister', gate(L, once(base(L), 'id="popup_register"', 'id="popup_resgister"')), red('PG-TYPO')],
  ]],
  ['42 ô Phone không mang id="input-phone" (production 0 file) → không PG-INPUT', () => [
    ['L', gate(L, once(base(L), '<input id="input-phone" type="tel" name="Phone">', '<input type="tel" name="Phone">')), noRed],
  ]],
  ['43 [1/popup] không gộp phần tử ngoài popup; pm__pagination trong pm__*-module (production) → không 🔴', () => [
    ['L', gate(L, once(base(L), '</body>', `${'<div class="pm__vote-module"><ul class="pm__pagination"></ul></div>'.repeat(2)}\n</body>`)), noRed],
  ]],
  ['44 pm__pagination kèm pm__rankchar-pagination ngoài popup (production) → không PG-NEST', () => [
    ['L', gate(L, once(base(L), '</body>', '<ul class="pm__pagination pm__rankchar-pagination"></ul>\n</body>')), noRed],
  ]],
  ['45 pm__milestone trong pm__total*-milestone khác (production) → không PG-NEST; ngoài mọi wrapper → PG-NEST', () => [
    ['byguild', gate(L, once(base(L), '</body>', '<div class="pm__totalmodulebyguild-milestone"><div class="pm__milestone" data-milestone="5"></div></div>\n</body>')), noRed],
    ['trần', gate(L, once(base(L), '</body>', '<div class="list"><div class="pm__milestone" data-milestone="5"></div></div>\n</body>')), redOn('PG-NEST', 'pm__milestone')],
  ]],
  ['46 id hook trùng tên class ở phần tử khác (form-profile) → không PG-ONCE; trùng id → PG-ONCE', () => [
    ['class', gate(L, once(base(L), '<div class="pm__role">', '<div class="pm__role form-profile">')), noRed],
    ['id', gate(L, once(base(L), '<div class="pm__role">', '<div class="pm__role" id="form-profile">')), redOn('PG-ONCE', 'form-profile')],
  ]],
  ['47 MTO-login-form (sai hoa/thường hook kit) → PG-TYPO', () => [
    ['L', gate(L, once(base(L), 'id="mto-login-form"', 'id="MTO-login-form"')), redOn('PG-TYPO', 'MTO-login-form')],
  ]],
  ['48 --ref: popup riêng của ref (popup_chucmung) không phải hợp đồng → không PG-REF; popup platform vẫn bắt', () => [
    ['riêng', refCaseWith('<div id="popup_chucmung"></div><div id="popup_history" class="pm__history-module"></div>'), (r) => lacks(r, 'PG-REF', 'popup_chucmung')],
    ['platform', refCaseWith('<div id="popup_inform"></div><div id="popup_history" class="pm__history-module"></div>'), redOn('PG-REF', 'popup_inform')],
  ]],
  ['50 provider pm__playnow (production) cạnh pm__btn-login → không 🔴', () => [
    ['L', gate(L, once(base(L), 'class="pm__btn-login pm__facebook"', 'class="pm__btn-login pm__playnow"')), noRed],
  ]],
  ['51 --ref có dist/: hook lấy từ trang ref đã build, không từ popup thư viện chưa include', () => [
    ['web', refDistCase('<a class="pm__btn-history"></a>'), (r) => lacks(r, 'PG-REF', 'pm__condition-module') && redOn('PG-REF', 'pm__email')(r)],
  ]],
  ['52 --ref: trang H5 không bị đòi hook đăng nhập của ref (production H5 0/9)', () => [
    ['H5', refDistCase(`<a class="pm__btn-history"></a>${H5_FLAG}`), noRed],
  ]],
  ['53 L: pm__title-form thẳng trong pm__condition-module (production, như kit Payment) → không PG-NEST', () => [
    ['L', gate(L, once(once(base(L), 'class="pm__title-form"', 'class="title"'), '<div class="pm__condition_list_popup_title"></div>',
      '<div class="pm__condition_list_popup_title"></div><div class="pm__title-form"></div>')), noRed],
  ]],
  ['49 pm__charactername ×2 (PC + MB, production) → không PG-ONCE; pm__point ×2 vẫn PG-ONCE', () => [
    ['charactername', gate(L, once(base(L), '<a href="#" class="pm__menu-selectrole"></a>', '<a href="#" class="pm__menu-selectrole"></a><span class="MS__pc"><span class="pm__charactername"></span></span><span class="MS__mb"><span class="pm__charactername"></span></span>')),
      (r) => lacks(r, 'PG-ONCE', 'pm__charactername')],
    ['point', gate(L, once(base(L), '<div class="pm__point">0</div>', '<div class="pm__point">0</div><span class="pm__point">0</span>')), redOn('PG-ONCE', 'pm__point')],
  ]],
  ['54 hook chỉ nằm trong <template>/<noscript> (không vào DOM) → PG-REQ', () => ['template', 'noscript'].map((tag) => [tag,
    gate(L, once(base(L), POINT, `<${tag}>${POINT}</${tag}>`)), redOn('PG-REQ', 'pm__point')])],
  ['55 partial có chữ <body> trong comment JS (cfl configProduction) → không PG-REQ', () => [
    ['partial', gate(L, PARTIAL_WITH_BODY_IN_SCRIPT, 'config.html.twig'), redWithout('PG-REQ')],
  ]],
  ['56 baseline: chép thêm 1 khối đang sai → 🔴; sửa bớt 1 khối → vẫn là nợ', () => [
    ['thêm', baselineRun(withBareMilestones(1), withBareMilestones(2)), redOn('PG-NEST', 'pm__milestone')],
    ['bớt', baselineRun(withBareMilestones(2), withBareMilestones(1)), (r) => noRed(r) && codes(r.json.preexisting).includes('PG-NEST')],
  ]],
  ['57 data-value / data-milestone / data-rate rỗng → PG-PAIR; data-msg_invalid rỗng (MASTER) → không', () => [
    ['data-value', gate(L, once(base(L), 'data-value="10"', 'data-value=""')), redOn('PG-PAIR', 'pm__rut')],
    ['data-milestone như MASTER', gate(L, base(L).replaceAll(`data-milestone="${MILESTONE_VALUE}"`, 'data-milestone=""')), redOn('PG-PAIR', 'pm__milestone')],
    ['data-rate', gate(P, once(base(P), 'data-rate="1"', 'data-rate=""')), redOn('PG-PAIR', 'pm__totalCash')],
  ]],
  ['58 Twig if/else: nhánh else có 2 bản singleton → PG-ONCE (lấy max các nhánh)', () => [
    ['L', gate(L, once(base(L), POINT, `{% if a %}${POINT}{% else %}${POINT}${POINT}{% endif %}`), 'index.twig'), redOn('PG-ONCE', 'pm__point')],
  ]],
  ['59 trang Twig có <body> + {% include %} popup (19 campaign cdn-source) → không PG-REQ; không include mà thiếu popup → PG-REQ', () => [
    ['include', gate(L, popupsIncluded(base(L)), 'index-vn.html.twig'), noRed],
    ['không include', gate(L, withoutPopups(base(L)), 'index-vn.html.twig'), redOn('PG-REQ', 'popup_login')],
    ['include + popup mất class module (bomber/2026-worldcup)', gate(L, once(once(base(L), 'id="popup_register" class="pm__module pm__profileinfo-module"', 'id="popup_register"'),
      '</body>', "{% include './main/html/configProduction.html.twig' %}\n</body>"), 'index.html.twig'), redOn('PG-NEST', 'pm__profile-form')],
  ]],
  ['60 hooks-at: cdn-source + handoff thiếu hook → 🟡 PG-REQ/PG-REF; source / file bàn giao → 🔴; hook đã gắn sai vẫn 🔴', () => [
    ['cdn + handoff', hooksAtCase('h-handoff', '- hooks-at: handoff', missingPoint()), deferredWarn('PG-REQ')],
    ['cdn, note không ghi hooks-at → handoff', hooksAtCase('h-default', '', missingPoint()), deferredWarn('PG-REQ')],
    ['cdn + source', hooksAtCase('h-source', '- hooks-at: source', missingPoint()), redOn('PG-REQ', 'pm__point')],
    ['cờ --hooks-at source thắng note', hooksAtCase('h-flag', '- hooks-at: handoff', missingPoint(), { args: ['--hooks-at', 'source'] }), redOn('PG-REQ', 'pm__point')],
    ['file bàn giao gt-promotion + handoff', hooksAtCase('h-gt', '- hooks-at: handoff', missingPoint(), { handoff: true }), redOn('PG-REQ', 'pm__point')],
    ['cdn + handoff mà nhầm -claim', hooksAtCase('h-claim', '- hooks-at: handoff', once(missingPoint(), 'class="pm__btn-claim">gift', 'class="pm__btn_claim">gift')),
      (r) => r.exit === 1 && red('PG-CLAIM')(r) && lacks(r, 'PG-REQ', 'pm__point')],
    ['cdn + handoff, gameplay none thiếu hook của ref', hooksAtCase('h-ref', '- hooks-at: handoff', HISTORY_ONLY, { args: ['--gameplay', 'none', '--ref', refDir()] }), deferredWarn('PG-REF')],
  ]],
  ['61 hooks-at lạ (cờ hoặc note) → exit 2', () => [
    ['cờ', hooksAtCase('h-bad-flag', '', base(L), { args: ['--hooks-at', 'sorce'] }), (r) => r.exit === 2 && r.stderr.includes('hooks-at "sorce"')],
    ['note', hooksAtCase('h-bad-note', '- hooks-at: sorce', base(L)), (r) => r.exit === 2 && r.stderr.includes('hooks-at "sorce"')],
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
