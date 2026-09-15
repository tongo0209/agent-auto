#!/usr/bin/env node
// Self-test landing-parity — chạy: node tools/landing-parity.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TOOL = path.resolve(import.meta.dirname, 'landing-parity.mjs');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-parity-test-'));
let pass = 0;
let fail = 0;

const w = (p, s = '') => (fs.mkdirSync(path.dirname(p), { recursive: true }), fs.writeFileSync(p, s), p);
function check(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}
function run(args) {
  const r = spawnSync('node', [TOOL, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const products = path.join(ROOT, 'cdn-source/products');
const REF = path.join(products, 'gx/landing/2026-ref');
const NEW = path.join(products, 'gx/landing/2026-new');
const OLD = path.join(products, 'gx/landing/2025-old');

w(path.join(REF, 'config.js'), `module.exports = {\n  name: 'ref',\n  H5: false,\n  scaleWidthPC: 2000,\n  folderUse: ['main', 'language'],\n};\n`);
w(path.join(REF, 'package.json'), JSON.stringify({ scripts: { 'build-dev': 'webpack', 'build-pro': 'webpack --optimize' } }));
w(path.join(REF, 'assets/main/main.html.twig'), `<div id="MS__wrapper" class="MS__pc">\n{% include './language.html.twig' %}\n<a class="pm__btn_claim MJ__lazyload" data-lang="vi"></a>\n<span class="MS__language MS__sprite-x"></span>\n</div>\n`);
w(path.join(REF, 'assets/main/main.js'), `window.libraryMainsite.promotion.init({});\nconst h5 = varMS.H5;\n$(document).on('promotion:done', () => {});\n`);
w(path.join(REF, 'assets/main/main.scss'), `.a { @include mobile { left: 0; } @include sprite($x); }\n@import './scss/sprite.generated';\n`);
w(path.join(REF, 'assets/language/language.js'), 'export const lang = 1;\n');
w(path.join(REF, 'node_modules/x/index.js'), 'MS__from_node_modules');
w(path.join(REF, 'dist/index.html'), '<div class="MS__from_dist"></div>');

w(path.join(OLD, 'config.js'), `module.exports = { name: 'old', H5: true, legacyOnly: 1 };\n`);
w(path.join(OLD, 'assets/main/main.html.twig'), '<div class="MS__legacy"></div>');
fs.utimesSync(OLD, new Date(2025, 0, 1), new Date(2025, 0, 1));

w(path.join(NEW, 'config.js'), `module.exports = {\n  name: 'new',\n  scaleWidthPC: 2000,\n  folderUse: ['main'],\n  newOnly: 1,\n};\n`);
w(path.join(NEW, 'package.json'), JSON.stringify({ scripts: { 'build-dev': 'webpack' } }));
w(path.join(NEW, 'assets/main/main.html.twig'), `<div id="MS__wrapper" class="MS__pc MS__bogus">\n<a class="pm__btn_claim MJ__lazyload MJ__made-up"></a>\n</div>\n`);
w(path.join(NEW, 'assets/main/main.js'), `const h5 = varMS.H5;\n`);
w(path.join(NEW, 'assets/main/main.scss'), `.a { @include sprite($x); }\n`);

w(path.join(products, 'tf/skin-2026/config.js'), `module.exports = { skinOnlyKey: 1 };\n`);
const BASE = w(path.join(ROOT, 'base-structure.md'), `| # | Project | Đường dẫn |\n| 1 | gx ref | \`gx/landing/2026-ref\` |\n| 2 | gone | \`.../zz/landing/khong-ton-tai\` |\n| 3 | skin | \`tf/skin-2026\` |\n`);

{
  const { code, out } = run([NEW, '--base-structure', BASE]);
  check('exit 0 mặc định (advisory)', code === 0, String(code));
  const refLine = out.split('\n')[0].split('refs:')[1];
  check('ref = sibling cùng product + base-structure, dedupe, không lấy chính nó', /2026-ref/.test(refLine) && !/2026-new/.test(refLine) && (refLine.match(/2026-ref/g) || []).length === 1, refLine);
  check('sibling cũ hơn cũng vào ref (2 sibling mới nhất)', /2025-old/.test(out.split('\n')[0]), out.split('\n')[0]);
  check('thiếu config H5 kèm file:line ref + đếm ref', /config\s+H5\s+←\s+.*2026-ref\/config\.js:3\s+\(2\/2 ref\)/.test(out), out);
  check('thiếu ở nhiều ref xếp trước', out.indexOf('config       H5') < out.indexOf('config       legacyOnly'));
  check('thiếu include language.html.twig', /twigInclude\s+language\.html\.twig/.test(out));
  check('thiếu class MS__language', /msClass\s+MS__language/.test(out));
  check('thiếu data-lang', /dataAttr\s+data-lang/.test(out));
  check('thiếu gọi platform libraryMainsite.promotion.init', /jsPlatform\s+libraryMainsite\.promotion\.init/.test(out));
  check('thiếu event promotion:done', /jsEvent\s+promotion:done/.test(out));
  check('thiếu @include mobile (không tính sprite)', /scssInclude\s+mobile/.test(out) && !/scssInclude\s+sprite/.test(out));
  check('thiếu folder assets/language', /assetDir\s+language/.test(out));
  check('thiếu script build-pro', /npmScript\s+build-pro/.test(out));
  check('thiếu key legacyOnly từ ref cũ vẫn báo', /config\s+legacyOnly/.test(out));
  check('không đọc node_modules/dist của ref', !/MS__from_node_modules|MS__from_dist/.test(out));
  check('MS__sprite-* bỏ qua', !/MS__sprite-x/.test(out));
  check('MỚI có class lạ → 🔴 kèm file:line', /🔴\s+msClass\s+MS__bogus\s+.*main\.html\.twig:1/.test(out) && /🔴\s+mjClass\s+MJ__made-up/.test(out), out);
  check('ref skin không dùng cho campaign landing', !/skin-2026|skinOnlyKey/.test(out), out.split('\n')[0]);
  check('extra ⚪ ẩn mặc định, có đếm', /\(⚪ \d+ mục khác, --all để xem\)/.test(out) && !/⚪\s+config/.test(out), out);
  check('thứ có ở cả hai không báo', !/MS__wrapper|MJ__lazyload|pm__btn_claim|scaleWidthPC/.test(out.replace(/refs:.*\n/, '')), out);
}
{
  const { code } = run([NEW, '--base-structure', BASE, '--strict']);
  check('--strict + có 🔴 → exit 1', code === 1, String(code));
  check('--all hiện extra ⚪', /⚪\s+/.test(run([NEW, '--base-structure', BASE, '--all']).out));
  const jsonOut = path.join(ROOT, 'parity.json');
  const r = run([NEW, '--ref', REF, '--base-structure', BASE, '--json', jsonOut]);
  const j = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
  check('--ref tường minh thay ref mặc định', j.refs.length === 1 && j.refs[0].endsWith('2026-ref') && !/legacyOnly/.test(r.out));
  check('--json: missing/extra có feature+value+loc', j.missing.some((m) => m.feature === 'config' && m.value === 'H5' && /config\.js:3$/.test(m.loc)) && j.extra.some((e) => e.value === 'MS__bogus' && e.severity === 'red'));
}
{
  fs.rmSync(path.join(NEW, 'assets/main/main.html.twig'));
  w(path.join(NEW, 'assets/main/main.html.twig'), `<div id="MS__wrapper" class="MS__pc"><span class="MS__language"></span>{% include './language.html.twig' %}<a class="pm__btn_claim MJ__lazyload" data-lang="vi"></a></div>`);
  w(path.join(NEW, 'config.js'), `module.exports = { name: 'new', H5: false, scaleWidthPC: 2000, folderUse: ['main','language'] };\n`);
  w(path.join(NEW, 'assets/main/main.js'), `window.libraryMainsite.promotion.init({});\nconst h5 = varMS.H5;\n$(document).on('promotion:done', () => {});\n`);
  w(path.join(NEW, 'assets/main/main.scss'), `.a { @include mobile { left: 0; } @include sprite($x); }\n@import './scss/sprite.generated';\n`);
  w(path.join(NEW, 'assets/language/language.js'), '1');
  w(path.join(NEW, 'package.json'), JSON.stringify({ scripts: { 'build-dev': 'webpack', 'build-pro': 'x' } }));
  const { code, out } = run([NEW, '--ref', REF, '--strict']);
  check('campaign đủ → sạch, --strict exit 0', code === 0 && /không thiếu gì/.test(out) && /không có class lạ/.test(out), out);
}

console.log(`\nlanding-parity.test: ${pass} pass, ${fail} fail`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
