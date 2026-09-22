#!/usr/bin/env node
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLock } from './lib/project-lock.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'project-note.mjs');
const root = mkdtempSync(join(tmpdir(), 'project-note-'));
const env = {
  ...process.env,
  PM_PROJECTS_DIR: join(root, 'projects'),
  PM_GT_PROMOTION_DIR: join(root, 'gt'),
  PM_KIT_DIR: join(root, 'kit'),
};
let pass = 0, fail = 0;

function check(name, actual, expected) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — mong ${JSON.stringify(expected)}, nhận ${JSON.stringify(actual)}`); }
}

function run(...args) {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8', env });
  return { code: r.status, out: r.stdout + r.stderr };
}

function put(path, content = '') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const section = (text, heading) => text.split(/^(?=## )/m).find((c) => c.startsWith(`## ${heading}\n`)) || '';
const today = new Date().toLocaleDateString('sv-SE');

const campaign = join(root, 'cdn-source/products/foo/landing/2026-landingx');
const note = join(root, 'projects/foo/2026-landingx.md');
const handoff = join(root, 'gt/Foo/LandingX_12345');

put(join(campaign, 'package.json'), JSON.stringify({ scripts: { dev: 'webpack --watch', 'build-pro': 'webpack --mode production' } }));
put(join(campaign, 'config.js'), 'export default {};\n');
put(join(campaign, 'assets/index.html.twig'), [
  '<html><head><title>Landing X Trung Thu</title></head><body>',
  '<!-- <div class="pm__ghost"></div> -->',
  '{# pm__ghost2 #}',
  '<span class="score pm__point">0</span>',
  '<div id="popup_register" class="MS__popup">',
  '  <img src="a.png">',
  '  <button class="pm__btn-register">Đăng ký</button>',
  '</div>',
  "{% include './popup/popup_login.html.twig' %}",
  '</body></html>',
].join('\n'));
put(join(campaign, 'assets/popup/popup_login.html.twig'), [
  "{% extends '../base.html.twig' %}",
  "{% set sectionId = 'popup_login' %}",
  '{% block content %}',
  '<a href="#" class="pm__btn-login pm__zalo">Zalo</a>',
  "{% include './form.html.twig' %}",
  '{% endblock %}',
].join('\n'));
put(join(campaign, 'assets/popup/form.html.twig'), '<form id="pm__login-form" action="#">\n</form>\n');
put(join(campaign, 'assets/main.js'), 'console.log(1);\n');
put(join(campaign, 'assets/main.scss'), '.a { color: red; }\n');
put(join(campaign, '_docs/hop-dong-hook.md'), '# viết tay\n');
put(join(campaign, 'assets/img/bg.png'), 'png');
put(join(campaign, 'node_modules/lib/index.js'), '');
put(join(campaign, 'dist/index.html'), '<div class="pm__point"></div>');
put(join(handoff, 'Promotion/index.html'), '<div></div>');
put(join(handoff, 'mainsite/index.html'), '<div></div>');
put(join(root, 'gt/Foo/LandingY_123456/Promotion/index.html'), '<div></div>');
put(join(root, 'gt/B45_Other/2026-trung-thu-menh-hon-58837/Promotion/index.html'), '<div></div>');
put(join(root, 'gt/622-Bomber/Landing_58000/Promotion/index.html'), '<div></div>');
put(join(root, 'gt/C11/2026-trung-thu_59999/mainsite/index.html'), '<div></div>');

mkdirSync(env.PM_KIT_DIR, { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: env.PM_KIT_DIR });
put(join(env.PM_KIT_DIR, 'AI-GUIDE.md'), 'kit');
execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.'], { cwd: env.PM_KIT_DIR });
execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'kit'], { cwd: env.PM_KIT_DIR });
const kitSha = execFileSync('git', ['log', '-1', '--format=%h'], { cwd: env.PM_KIT_DIR, encoding: 'utf8' }).trim();

console.log('project-note.mjs\n');

check('init → exit 0', run('init', campaign, '--jira', 'GW-12345').code, 0);
check('init tạo note theo game/slug', existsSync(note), true);
const first = readFileSync(note, 'utf8');

check('9 heading đúng thứ tự spec §5.1',
  [...first.matchAll(/^## (.+)$/gm)].map((m) => m[1]).join(' | '),
  '1. Khoá | 2. Nơi code | 3. Sơ đồ file | 4. Bản đồ hook | 5. Quyết định & hằng số | 6. Câu hỏi đang chờ | 7. Nợ kỹ thuật | 8. Lệnh | 9. Nhật ký');
check('tiêu đề lấy <title> của index', first.split('\n')[0], '# foo/2026-landingx — Landing X Trung Thu');
check('mục 1 CHƯA KHOÁ → readLock null', readLock(note), null);
check('mục 1 có đủ nhãn khoá', ['gameplay: CHƯA KHOÁ', 'type:', 'ref:', 'nguồn chuẩn:', 'ngày khoá:'].every((k) => section(first, '1. Khoá').includes(`- ${k}`)), true);

const places = section(first, '2. Nơi code');
check('mục 2 có cdn-source tuyệt đối', places.includes(`- cdn-source: ${campaign}\n`), true);
check('mục 2 có gt-promotion Promotion/', places.includes(`- gt-promotion: ${handoff}/Promotion\n`), true);
check('mục 2 có gt-promotion mainsite/', places.includes(`- gt-promotion: ${handoff}/mainsite\n`), true);
check('mục 2 bỏ thư mục số dài hơn (123456)', places.includes('LandingY_123456'), false);
check('mục 2 ghi Jira', places.includes('- jira: GW-12345\n'), true);

const other = join(root, 'cdn-source/products/bar/landing/2026-trung-thu');
put(join(other, 'index.html'), '<div></div>');
run('init', other, '--jira', 'GW-622', '--nexus', '58000');
const otherPlaces = [...section(readFileSync(join(root, 'projects/bar/2026-trung-thu.md'), 'utf8'), '2. Nơi code').matchAll(/^- gt-promotion: (\S+)$/gm)].map((m) => m[1].slice(root.length));
check('gt-promotion: khớp Nexus + tên đúng slug(+số); bỏ tên chỉ CHỨA slug và thư mục game trùng số Jira',
  otherPlaces.join(' '), '/gt/622-Bomber/Landing_58000/Promotion /gt/C11/2026-trung-thu_59999/mainsite');

const pathOut = run('path', join(handoff, 'mainsite/index.html'));
check('path file bàn giao → note (qua mục 2)', `${pathOut.code} ${pathOut.out.trim()}`, `0 ${note}`);
check('path file trong campaign → note', run('path', join(campaign, 'assets/main.js')).out.trim(), note);
const lost = run('path', join(root, 'elsewhere/index.html'));
check('path ngoài mọi note → exit 1 + hướng dẫn init', lost.code === 1 && lost.out.includes('không map được'), true);

const files = section(first, '3. Sơ đồ file');
check('mục 3 liệt kê file nguồn + tài liệu viết tay',
  [...files.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]).join(' '),
  '_docs/hop-dong-hook.md assets/index.html.twig assets/main.js assets/main.scss assets/popup/form.html.twig assets/popup/popup_login.html.twig config.js');

const hooks = section(first, '4. Bản đồ hook');
check('mục 4: hook ngoài popup', hooks.includes('- `assets/index.html.twig` (ngoài popup) → .pm__point:4\n'), true);
check('mục 4: popup theo id + hook bên trong', hooks.includes('- `assets/index.html.twig` #popup_register:5 → .pm__btn-register:7\n'), true);
check('mục 4: popup theo sectionId, 2 class cùng thẻ', hooks.includes('- `assets/popup/popup_login.html.twig` #popup_login:2 → .pm__btn-login.pm__zalo:4\n'), true);
check('mục 4: partial nhận popup của file include nó', hooks.includes('- `assets/popup/form.html.twig` #popup_login (qua include) → #pm__login-form:1\n'), true);
check('mục 4: bỏ hook trong comment + dist', /pm__ghost|dist\//.test(hooks), false);

check('mục 8 có scripts package.json', section(first, '8. Lệnh').includes('- `npm run build-pro` — webpack --mode production'), true);
check('mục 9 ghi ngày init', section(first, '9. Nhật ký').includes(`- ${today} `), true);

const again = run('init', campaign);
check('init lần 2 → exit 1', again.code, 1);
check('init lần 2 không ghi đè', readFileSync(note, 'utf8'), first);

const unlocked = run('check', campaign);
check('check note mới → exit 1 vì chưa khoá', unlocked.code === 1 && unlocked.out.includes('chưa khoá'), true);

check('lock gameplay lạ → exit 2', run('lock', campaign, '--gameplay', 'paymnet').code, 2);
check('lock → exit 0', run('lock', campaign, '--gameplay', 'payment', '--type', '13-khuyen-mai-nap', '--by', 'ai').code, 0);
check('lock → readLock đọc được, ref trống', JSON.stringify(readLock(note)), JSON.stringify({ gameplay: 'payment', type: '13-khuyen-mai-nap', ref: '' }));
const lockSection = section(readFileSync(note, 'utf8'), '1. Khoá');
check('lock ghi ngày + ai khoá + commit kit', [`- ngày khoá: ${today}`, '- ai khoá: ai', `- nguồn chuẩn: kit ${kitSha}`].every((l) => lockSection.includes(l)), true);
check('check sau khoá, đĩa chưa đổi → exit 0', run('check', campaign).code, 0);

const human = readFileSync(note, 'utf8')
  .replace('- `assets/main.scss`', '- `assets/main.scss` — style trang chính')
  .replace(/(## 5\. Quyết định & hằng số\n)/, '$1- tốc độ đèn 120px/s · PM · 2026-09-20\n');
writeFileSync(note, human);
rmSync(join(campaign, 'assets/main.js'));
put(join(campaign, 'assets/popup/popup_login.html.twig'), readFileSync(join(campaign, 'assets/popup/popup_login.html.twig'), 'utf8').replace('{% block content %}', '{% block content %}\n<p>mới</p>'));

const stale = run('check', campaign);
check('check: file mục 3 không còn', stale.code === 1 && stale.out.includes('assets/main.js'), true);
check('check: hook mục 4 đổi dòng', stale.out.includes('.pm__btn-login.pm__zalo:4'), true);

check('refresh → exit 0', run('refresh', campaign).code, 0);
const refreshed = readFileSync(note, 'utf8');
check('refresh giữ nguyên mục 5 người viết', section(refreshed, '5. Quyết định & hằng số'), section(human, '5. Quyết định & hằng số'));
check('refresh giữ mô tả việc ở mục 3', refreshed.includes('- `assets/main.scss` — style trang chính\n'), true);
check('refresh bỏ file đã xoá', refreshed.includes('`assets/main.js`'), false);
check('refresh cập nhật dòng hook', refreshed.includes('.pm__btn-login.pm__zalo:5'), true);
check('check sau refresh → exit 0', run('check', campaign).code, 0);

const gateJson = join(root, 'pm-gate.json');
writeFileSync(gateJson, JSON.stringify({
  file: join(campaign, 'dist/index.html'),
  fails: [{ code: 'PG-REQ', msg: 'thiếu', token: 'pm__login', lines: [] }],
  warns: [{ code: 'PG-TEXT', msg: 'chữ', token: 'pm__text_vi', lines: [3] }],
  preexisting: [{ code: 'PG-ONCE', msg: 'trùng', token: 'pm__point', lines: [4, 9] }, { code: 'PG-ONCE', msg: 'trùng', token: 'pm__point', lines: [4, 9] }],
}));
check('debt → exit 0', run('debt', campaign, '--from', gateJson).code, 0);
run('debt', campaign, '--from', gateJson);
const debt = section(readFileSync(note, 'utf8'), '7. Nợ kỹ thuật');
check('debt ghi preexisting + warns, khử trùng, bỏ fails',
  debt.split('\n').filter((l) => l.startsWith('- [')).join(' | '),
  '- [ ] PG-ONCE pm__point (dist/index.html) | - [ ] PG-TEXT pm__text_vi (dist/index.html)');

check('log → exit 0', run('log', campaign, 'GW-12345 sửa popup login · abc123').code, 0);
check('log thêm dòng cuối mục 9', section(readFileSync(note, 'utf8'), '9. Nhật ký').trimEnd().split('\n').at(-1), `- ${today} GW-12345 sửa popup login · abc123`);

check('lệnh lạ → exit 2', run('nope', campaign).code, 2);
check('init ngoài campaign cdn-source → exit 2', run('init', join(root, 'elsewhere')).code, 2);

console.log(`\npass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
