#!/usr/bin/env node
// Self-test geo-fix — chạy: node tools/geo-fix.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOOL = path.resolve(import.meta.dirname, 'geo-fix.mjs');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-fix-test-'));
let pass = 0;
let fail = 0;
let seq = 0;

const w = (p, s = '') => (fs.mkdirSync(path.dirname(p), { recursive: true }), fs.writeFileSync(p, s), p);
const j = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const lineOf = (text, needle) => text.slice(0, text.indexOf(needle)).split('\n').length;

function run(cmd, args) {
  const out = path.join(ROOT, `out-${++seq}.json`);
  execFileSync('node', [TOOL, cmd, ...args, '--out', out], { encoding: 'utf8' });
  return j(out);
}
function check(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

const SCSS = `#MS__wrapper .popup {
  .bg {
    background: url(../images/bg.png) no-repeat;
    left: 0;
    top: 0;
  }
  .btn-close {
    @include sprite($btn-close);
    left: 677px;
    top: 3px;
    @include mobile {
      left: 300px;
      top: 5px;
    }
  }
  .title {
    @include sprite($title);
    left: 100px;
    top: 40px;
    &.active {
      @include sprite($title-active);
    }
  }
  .icon {
    @include sprite($icon);
  }
  .cell {
    @include sprite($cell);
    left: 10px;
    top: 10px;
  }
  .badge {
    @include sprite($badge);
    right: 20px;
    bottom: 30px;
  }
  .hero {
    left: 40px;
    top: 60px;
  }
  .hero .glow {
    left: 1px;
  }
  .item--a .art {
    left: 5px;
    top: 5px;
  }
}
`;
const TWIG = `<div class="popup"><a class="btn-close MS__sprite-btn-close"></a>
<i class="cell MS__sprite-cell"></i><i class="cell MS__sprite-cell"></i><i class="cell MS__sprite-cell"></i>
<img src="assets/other/images/hero.png" alt=""><img class="hero MJ__lazyload" data-src="assets/popup/images/hero.png">
<img class="art" src="assets/popup/images/nv-a.png"><img class="art" src="assets/popup/images/nv-b.png"></div>`;

function makeCampaign() {
  const dir = path.join(ROOT, `camp-${++seq}`);
  w(path.join(dir, 'assets/popup/scss/base.scss'), SCSS);
  w(path.join(dir, 'assets/popup/scss/sprite.generated.scss'), '.MS__sprite-x { @include sprite($x); left: 1px; }');
  w(path.join(dir, 'assets/popup/popup.html.twig'), TWIG);
  for (const f of ['btn-close', 'title', 'title-active', 'icon', 'cell', 'badge', 'nv-a', 'nv-b'])
    w(path.join(dir, `assets/popup/images/sprite/${f}.png`));
  w(path.join(dir, 'assets/popup/images/bg.png'));
  return dir;
}
const asset = (name, x, y, wd, h, file = `${name}.png`) => ({ name, file, x, y, w: wd, h });
const COORDS_PC = {
  canvas: [2000, 1000],
  assets: [
    asset('bg', 0, 0, 2000, 1000),
    asset('btn-close', 677, 3, 97, 152),
    asset('title', 100, 40, 300, 60),
    asset('icon', 500, 500, 50, 50),
    asset('cell', 10, 10, 20, 20),
    asset('badge', 1880, 900, 100, 70),
    asset('hero', 40, 60, 400, 300),
    asset('nv-a', 5, 5, 50, 50),
    asset('nv-b', 60, 5, 50, 50),
    asset('ghost', 1, 1, 5, 5),
  ],
};
const writeCoords = (dir, coords, name = 'coords.json') => w(path.join(dir, '_auto-export', name), JSON.stringify(coords));

function measure(s, shifts = {}, opts = {}) {
  const rx = 100, ry = 50;
  const m = (a, dx = 0, dy = 0, dw = 0, dh = 0, extra = {}) => ({
    name: a.name, selector: `.${a.name}`, matches: 1, parent: null, forced: false,
    x: rx + (a.x + dx) * s, y: ry + (a.y + dy) * s, w: (a.w + dw) * s, h: (a.h + dh) * s, ...extra,
  });
  const assets = [];
  for (const a of COORDS_PC.assets) {
    if (a.name === 'ghost' || (opts.skip || []).includes(a.name)) continue;
    const sh = shifts[a.name] || [];
    assets.push(m(a, ...sh));
  }
  return { viewport: [1920, 1080], wrapper: { x: 0, y: 0, w: 1920, h: 1080, scale: 0.96 }, assets, ...(opts.patch || {}) };
}
const byName = (list, n) => list.find((f) => f.name === n);

{
  const dir = makeCampaign();
  const coords = writeCoords(dir, COORDS_PC);
  const plan = run('plan', ['--campaign', dir, '--coords', coords]);
  const g = plan.groups[0];
  const A = (n) => g.assets.find((a) => a.name === n);
  check('plan: root = asset lớn nhất', g.root === 'bg', g.root);
  check('plan: viewport pc theo canvas', g.viewport === 'pc', g.viewport);
  check('plan: selector MS__sprite chỉ khi twig có', A('btn-close').selectors.includes('.MS__sprite-btn-close') && !A('title').selectors.includes('.MS__sprite-title'));
  check('plan: selector từ rule SCSS', A('btn-close').selectors.includes('#MS__wrapper .popup .btn-close'), JSON.stringify(A('btn-close').selectors));
  check('plan: rule pc left/top đúng dòng + giá trị', A('btn-close').rule.pc.left.value === 677 && A('btn-close').rule.pc.left.line === lineOf(SCSS, 'left: 677px') && A('btn-close').rule.pc.top.value === 3);
  check('plan: rule mb từ @include mobile', A('btn-close').rule.mb.left.value === 300 && A('btn-close').rule.mb.top.line === lineOf(SCSS, 'top: 5px'));
  check('plan: rule vị trí là .title, không phải &.active', A('title').rule.selector === '#MS__wrapper .popup .title' && A('title').rule.pc.left.value === 100);
  check('plan: bg map qua url()', A('bg').selectors.includes('#MS__wrapper .popup .bg') && A('bg').selectors.some((s) => s.includes('img[src*="/bg."]')));
  check('plan: icon có rule nhưng không có left/top', A('icon').rule && !A('icon').rule.pc.left && !A('icon').rule.pc.top);
  check('plan: right/bottom cũng được ghi', A('badge').rule.pc.right.value === 20 && A('badge').rule.pc.bottom.value === 30);
  check('plan: <img class> → rule theo class (gom mọi <img> cùng file), không lấy rule con .hero .glow', A('hero').rule.selector === '#MS__wrapper .popup .hero' && A('hero').rule.pc.left.value === 40 && A('hero').selectors.includes('#MS__wrapper .popup .hero'), JSON.stringify(A('hero').rule));
  check('plan: 2 <img class="art"> cùng nhận 1 rule → gỡ rule, chỉ còn selector img', !A('nv-a').rule && !A('nv-b').rule && A('nv-a').selectors.length === 1 && A('nv-a').selectors[0].startsWith('img['), JSON.stringify([A('nv-a'), A('nv-b')].map((x) => [x.rule && x.rule.selector, x.selectors])));
  check('plan: ghost → unmapped', plan.unmapped.includes('ghost') && !A('ghost').selectors.length);
  check('plan: bỏ *generated.scss', !g.assets.some((a) => a.rule && a.rule.file.includes('generated')));

  const M1 = path.join(dir, 'm1.json');
  w(M1, JSON.stringify(measure(0.5, { 'btn-close': [10, 0], icon: [5, 0], title: [0, 0, 8, 0], badge: [-6, 4] },
    { patch: {} })));
  const m1 = j(M1); byName(m1.assets, 'cell').matches = 3; fs.writeFileSync(M1, JSON.stringify(m1));
  const plan1 = path.join(dir, 'plan1.json'); fs.writeFileSync(plan1, JSON.stringify(plan));
  const d = run('diff', ['--plan', plan1, '--measure', M1]);
  const F = (n) => byName(d.findings, n);
  check('diff: không abort', d.abort === null, d.abort);
  check('diff: btn-close lệch dx=10 → position + fix left 677→667', F('btn-close').type === 'position' && F('btn-close').dx === 10 && F('btn-close').fix.left.to === 667 && F('btn-close').fix.top === undefined, JSON.stringify(F('btn-close')));
  check('diff: fix trỏ đúng file:line', F('btn-close').fix.left.file.endsWith('assets/popup/scss/base.scss') && F('btn-close').fix.left.line === lineOf(SCSS, 'left: 677px'));
  check('diff: title khớp vị trí → không position, nhưng size-mismatch dw=8', F('title').type === 'size-mismatch' && F('title').dw === 8);
  check('diff: icon lệch nhưng không có khai báo → no-declaration', F('icon').type === 'no-declaration');
  check('diff: cell matches=3 → ambiguous', F('cell').type === 'ambiguous');
  check('diff: ghost → unmapped', F('ghost').type === 'unmapped');
  check('diff: root bg không có finding', !F('bg'));
  check('diff: badge right/bottom: dx=-6 → right 20→14, dy=4 → bottom 30→34', F('badge').fix.right.to === 14 && F('badge').fix.bottom.to === 34, JSON.stringify(F('badge') && F('badge').fix));

  const M2 = path.join(dir, 'm2.json'); w(M2, JSON.stringify(measure(0.5, { 'btn-close': [2, 0], title: [2.5, 0] })));
  const d2 = run('diff', ['--plan', plan1, '--measure', M2]);
  check('diff: lệch =2px không báo, 2.5px báo', !byName(d2.findings, 'btn-close') && byName(d2.findings, 'title').type === 'position', JSON.stringify(d2.findings.map((f) => [f.name, f.type])));

  const M3 = path.join(dir, 'm3.json'); w(M3, JSON.stringify(measure(0.5, {}, { skip: ['title'] })));
  const d3 = run('diff', ['--plan', plan1, '--measure', M3]);
  check('diff: asset không có trong measure → not-measured', byName(d3.findings, 'title').type === 'not-measured');

  const M4 = path.join(dir, 'm4.json'); const m4 = measure(0.5, { title: [10, 0], icon: [10, 0] }); byName(m4.assets, 'icon').parent = 'title'; w(M4, JSON.stringify(m4));
  const d4 = run('diff', ['--plan', plan1, '--measure', M4]);
  check('diff: con cùng delta cha → skipped-parent', byName(d4.findings, 'title').type === 'position' && byName(d4.findings, 'icon').type === 'skipped-parent');

  const M5 = path.join(dir, 'm5.json'); w(M5, JSON.stringify(measure(0.5, { 'btn-close': [7, 0], title: [7, 0], icon: [7, 0], badge: [7, 0] })));
  const d5 = run('diff', ['--plan', plan1, '--measure', M5]);
  check('diff: ≥50% cùng delta → abort uniform-offset, không fix', d5.abort === 'uniform-offset' && d5.findings.every((f) => !f.fix));

  const WV = w(path.join(dir, '.claude/knowledge/waivers.md'), '- btn-close: lệch chủ ý theo art\n');
  const d6 = run('diff', ['--plan', plan1, '--measure', M1, '--waivers', WV]);
  check('diff: waiver → waived, không fix', byName(d6.findings, 'btn-close').type === 'waived' && !byName(d6.findings, 'btn-close').fix);
  fs.rmSync(WV);

  const M7 = path.join(dir, 'm7.json');
  const m7 = measure(0.96, {}, { skip: ['bg'] });
  for (const a of m7.assets) { a.x -= 100; a.y -= 50; }
  byName(m7.assets, 'btn-close').x += 10 * 0.96;
  w(M7, JSON.stringify(m7));
  const d7 = run('diff', ['--plan', plan1, '--measure', M7]);
  check('diff: thiếu root → dùng wrapper, vẫn ra dx=10', byName(d7.findings, 'btn-close').type === 'position' && byName(d7.findings, 'btn-close').dx === 10, JSON.stringify(d7.findings.map((f) => [f.name, f.type, f.dx])));

  /* ═══ 3. apply ═══ */
  const F1 = path.join(dir, 'f1.json'); fs.writeFileSync(F1, JSON.stringify(d));
  const before = fs.readFileSync(path.join(dir, 'assets/popup/scss/base.scss'), 'utf8');
  const ap = run('apply', ['--findings', F1]);
  const after = fs.readFileSync(path.join(dir, 'assets/popup/scss/base.scss'), 'utf8');
  check('apply: sửa đúng 3 dòng (left btn-close, right+bottom badge)', ap.edits.length === 3 && after.includes('left: 667px;') && after.includes('right: 14px;') && after.includes('bottom: 34px;'), JSON.stringify(ap.edits));
  check('apply: dòng khác giữ nguyên, số dòng không đổi', after.split('\n').length === before.split('\n').length && after.includes('top: 3px;') && after.includes('left: 300px;'));
  check('apply: liệt kê skipped (no-declaration/ambiguous/unmapped/size)', ap.skipped.some((s) => s.name === 'icon') && ap.skipped.some((s) => s.name === 'cell'));
  const plan2 = run('plan', ['--campaign', dir, '--coords', coords]);
  check('apply: plan lại đọc được giá trị mới', plan2.groups[0].assets.find((a) => a.name === 'btn-close').rule.pc.left.value === 667);
}

{
  const dir = makeCampaign();
  const coordsMb = writeCoords(dir, { ...COORDS_PC, canvas: [768, 1500] }, 'coords-mb.json');
  const plan = run('plan', ['--campaign', dir, '--coords', coordsMb]);
  check('plan: canvas ≤768 → viewport mb', plan.groups[0].viewport === 'mb');
  const P = path.join(dir, 'p.json'); fs.writeFileSync(P, JSON.stringify(plan));
  const M = path.join(dir, 'm.json'); w(M, JSON.stringify(measure(1, { 'btn-close': [0, 6], title: [4, 0] })));
  const d = run('diff', ['--plan', P, '--measure', M]);
  check('diff mb: btn-close sửa top trong @include mobile 5→-1', byName(d.findings, 'btn-close').fix.top.to === -1 && byName(d.findings, 'btn-close').fix.top.line === lineOf(SCSS, 'top: 5px'), JSON.stringify(byName(d.findings, 'btn-close')));
  check('diff mb: title không có block mobile → no-declaration (không sửa PC)', byName(d.findings, 'title').type === 'no-declaration');
}

{
  const dir = makeCampaign();
  const c1 = writeCoords(dir, COORDS_PC, 'a/coords.json');
  const c2 = writeCoords(dir, { ...COORDS_PC, canvas: [768, 900] }, 'b/coords.json');
  const plan = run('plan', ['--campaign', dir, '--coords', c1, '--coords', c2]);
  check('plan: 2 coords → 2 group pc + mb', plan.groups.length === 2 && plan.groups.map((g) => g.viewport).join() === 'pc,mb');
}

console.log(`\ngeo-fix.test: ${pass} pass, ${fail} fail`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
