import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGates } from './gates.mjs';

function fixture({ scripts = { 'build-dev': 'x', 'build-optimize': 'y' }, html = '<div class="pm__login"></div>' } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-gates-'));
  const campaignDir = path.join(repo, 'products/x/landing/a');
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(path.join(campaignDir, 'package.json'), JSON.stringify({ scripts }));
  fs.writeFileSync(path.join(campaignDir, 'index.html'), html);
  return { repo, campaignDir };
}

function fakeExec(codes = {}, porcelain = '') {
  const calls = [];
  const exec = (cmd, args, opts) => {
    const line = [cmd, ...args].join(' ');
    calls.push({ line, cwd: opts?.cwd });
    if (line.startsWith('git status')) return { code: 0, stdout: porcelain, stderr: '' };
    const hit = Object.entries(codes).find(([needle]) => line.includes(needle));
    return { code: hit ? hit[1] : 0, stdout: hit ? 'dòng lỗi 1\ndòng lỗi 2' : 'ok', stderr: '' };
  };
  return { exec, calls };
}

const ctx = (f, exec, extra = {}) => ({ ...f, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa tab quà.', exec, ...extra });

test('landing chỉ có build-dev + build-pro → chạy build-pro (bản dev sinh sprite sau dist ⇒ dist-stale)', async () => {
  const f = fixture({ scripts: { 'build-dev': 'x', 'build-pro': 'y' } });
  const { exec, calls } = fakeExec();
  await runGates(['build'], ctx(f, exec));
  assert.match(calls[0].line, /npm run build-pro/);
});

test('build ưu tiên build-optimize', async () => {
  const f = fixture();
  const { exec, calls } = fakeExec();
  const r = await runGates(['build'], ctx(f, exec));
  assert.strictEqual(r.pass, true);
  assert.match(calls[0].line, /npm run build-optimize/);
  assert.strictEqual(calls[0].cwd, f.campaignDir);
});

test('không có script build → error', async () => {
  const f = fixture({ scripts: {} });
  const r = await runGates(['build'], ctx(f, fakeExec().exec));
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.error, 'build');
});

test('campaign là file template twig (vportal2view) → build skipped, không chặn', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-gates-'));
  const twig = path.join(repo, 'gn/layout/a.html.twig');
  fs.mkdirSync(path.dirname(twig), { recursive: true });
  fs.writeFileSync(twig, '<div></div>');
  const r = await runGates(['build'], ctx({ repo, campaignDir: twig }, fakeExec().exec));
  assert.deepStrictEqual([r.pass, r.error, r.results[0].status], [true, null, 'skipped']);
});

test('campaign là file twig có pm__ → pm-gate kiểm thẳng file, đủ bộ cổng không vấp', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-gates-'));
  const twig = path.join(repo, 'gn/layout/a.html.twig');
  fs.mkdirSync(path.dirname(twig), { recursive: true });
  fs.writeFileSync(twig, '<div class="pm__login"></div>');
  const { exec, calls } = fakeExec();
  const r = await runGates(['build', 'pm-gate', 'fe-gate', 'landing-parity', 'layout-gate'], ctx({ repo, campaignDir: twig }, exec));
  assert.deepStrictEqual([r.pass, r.error], [true, null]);
  assert.ok(calls.some((c) => c.line.endsWith(`pm-gate.mjs ${twig}`)), calls.map((c) => c.line).join('\n'));
  assert.ok(calls.some((c) => c.line.endsWith(`layout-gate.mjs ${twig}`)));
});

test('exit 1 → fail kèm blocking', async () => {
  const f = fixture();
  const r = await runGates(['pm-gate'], ctx(f, fakeExec({ 'pm-gate': 1 }).exec));
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.results[0].blocking, ['dòng lỗi 1', 'dòng lỗi 2']);
});

test('exit 2 → error; check chỉ đọc chạy cùng lượt vẫn có kết quả', async () => {
  const f = fixture();
  const { exec, calls } = fakeExec({ 'pm-gate': 2 });
  const r = await runGates(['pm-gate', 'layout-gate'], ctx(f, exec));
  assert.deepStrictEqual([r.pass, r.error], [false, 'pm-gate']);
  assert.ok(calls.some((c) => c.line.includes('layout-gate')));
});

test('build lỗi → dừng, không chạy check cần dist sau nó', async () => {
  const f = fixture();
  const { exec, calls } = fakeExec({ 'build-optimize': 2 });
  const r = await runGates(['build', 'pm-gate', 'layout-gate'], ctx(f, exec));
  assert.strictEqual(r.error, 'build');
  assert.deepStrictEqual(calls.map((c) => c.line.split(' ')[2]), ['build-optimize']);
});

test('không có pm__ → pm-gate skipped', async () => {
  const f = fixture({ html: '<div class="x"></div>' });
  const r = await runGates(['pm-gate'], ctx(f, fakeExec().exec));
  assert.strictEqual(r.results[0].status, 'skipped');
  assert.strictEqual(r.pass, true);
});

test('commit chỉ lấy giao files verdict với git status', async () => {
  const f = fixture();
  const porcelain = ' M products/x/landing/a/index.html\0 M products/y/other.scss\0';
  const { exec, calls } = fakeExec({}, porcelain);
  const files = ['products/x/landing/a/index.html', 'products/x/landing/a/not-changed.js'];
  await runGates(['commit'], ctx(f, exec, { files }));
  const add = calls.find((c) => c.line.startsWith('git add'));
  assert.strictEqual(add.line, 'git add -- products/x/landing/a/index.html');
});

test('commit message đúng format + trailer, cdn-source luôn pull --no-rebase --no-edit sau commit', async () => {
  const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cdn-')), 'cdn-source');
  const campaignDir = path.join(repo, 'products/x/landing/a');
  fs.mkdirSync(campaignDir, { recursive: true });
  const { exec, calls } = fakeExec({}, ' M products/x/landing/a/index.html\0');
  await runGates(['commit'], ctx({ repo, campaignDir }, exec, { files: ['products/x/landing/a/index.html'] }));
  const commit = calls.find((c) => c.line.startsWith('git commit'));
  assert.match(commit.line, /--only products\/x\/landing\/a\/index.html -m \(fix\): sửa tab quà\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>$/);
  assert.strictEqual(calls.at(-1).line, 'git pull --no-rebase --no-edit origin master');
  assert.ok(!calls.some((c) => /--autostash|--amend/.test(c.line)));
});

test('R19: commit thẳng repo gốc (không cần AUTOPILOT_LAB_WRITES), gom cả file dở có sẵn trong campaign, trả hash commit', async () => {
  const f = gitRepo();
  fs.writeFileSync(path.join(f.campaignDir, 'dang-do.css'), 'dở từ trước');
  const files = ['products/x/landing/a/index.html'];
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-fix', files, planTitle: 'Sửa tab' });
  assert.strictEqual(r.results[0].status, 'pass', r.results[0].note);
  assert.strictEqual(r.results[0].commit, f.git('rev-parse', 'HEAD').stdout.trim());
  assert.deepStrictEqual(f.git('show', '--name-only', '--format=', 'HEAD').stdout.trim().split('\n').sort(), ['products/x/landing/a/dang-do.css', 'products/x/landing/a/index.html']);
});

test('commit không có file giao → skipped', async () => {
  const f = fixture();
  const r = await runGates(['commit'], ctx(f, fakeExec().exec, { files: ['a.js'] }));
  assert.strictEqual(r.results[0].status, 'skipped');
});

function gitRepo(scripts = { 'build-pro': 'true' }) {
  const f = fixture({ scripts });
  const git = (...args) => spawnSync('git', args, { cwd: f.repo, encoding: 'utf8' });
  git('init', '-q');
  // package.json là file có sẵn của campaign; index.html chưa track = phần run vừa dựng
  git('add', 'products/x/landing/a/package.json');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  return { ...f, git };
}

test('commit: campaign mới chưa track (landing-new) vẫn commit đúng file trong verdict', async () => {
  const f = gitRepo();
  fs.mkdirSync(path.join(f.campaignDir, 'mới'), { recursive: true });
  fs.writeFileSync(path.join(f.campaignDir, 'mới', 'ảnh.txt'), 'x');
  fs.writeFileSync(path.join(f.repo, 'khac.txt'), 'của phiên khác');
  const files = ['products/x/landing/a/index.html', 'products/x/landing/a/mới/ảnh.txt'];
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-new', files, planTitle: 'Dựng landing' });
  assert.strictEqual(r.results[0].status, 'pass', r.results[0].note);
  const committed = f.git('-c', 'core.quotepath=off', 'show', '--name-only', '--format=', 'HEAD').stdout.trim().split('\n').sort();
  assert.deepStrictEqual(committed, files.sort());
});

test('chưa có campaignDir → error, không ném', async () => {
  const r = await runGates(['build'], { repo: '/r', campaignDir: null, key: 'GW-1', files: [], exec: fakeExec().exec });
  assert.deepStrictEqual([r.pass, r.error], [false, 'build']);
});

test('commitMessage bỏ tiền tố (type): có sẵn trong tiêu đề plan', async () => {
  const { commitMessage } = await import('./gates.mjs');
  assert.match(commitMessage('landing-fix', '(feat): NTH mã mây (GW-912)'), /^\(fix\): nth mã mây \(gw-912\)\n/);
});

function handoffFixture(html = '<div class="pm__login"></div><section id="popup_login"></section>') {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-gt-'));
  const campaignDir = path.join(repo, '688-TLBBVNG/event-62839');
  fs.mkdirSync(path.join(campaignDir, 'mainsite'), { recursive: true });
  if (html) fs.writeFileSync(path.join(campaignDir, 'mainsite/index.html'), html);
  return { repo, campaignDir };
}

test('G2: pm-gate-handoff chạy pm-gate --baseline none trên mainsite/*.html', async () => {
  const f = handoffFixture();
  const { exec, calls } = fakeExec();
  const r = await runGates(['pm-gate-handoff', 'check-promotion'], ctx(f, exec));
  assert.strictEqual(r.pass, true);
  assert.match(calls[0].line, /pm-gate\.mjs .*mainsite\/index\.html --baseline none$/);
  assert.match(calls[1].line, /check-promotion\.mjs \S*mainsite\/index\.html --baseline HEAD$/);
});

test('G2: chưa có mainsite/*.html → handoff checks skipped', async () => {
  const r = await runGates(['pm-gate-handoff', 'check-promotion'], ctx(handoffFixture(null), fakeExec().exec));
  assert.deepStrictEqual(r.results.map((x) => x.status), ['skipped', 'skipped']);
});

test('check-promotion: loại do tool tự đọc từ file dự án, mỗi file có popup 1 lần soát; trang phụ không popup bị bỏ', async () => {
  const f = handoffFixture();
  fs.writeFileSync(path.join(f.campaignDir, 'mainsite/index-en.html'), '<section id="popup_login"></section>');
  fs.writeFileSync(path.join(f.campaignDir, 'mainsite/huong-dan.html'), '<div class="pm__x"></div>');
  const { exec, calls } = fakeExec();
  await runGates(['check-promotion'], ctx(f, exec));
  assert.strictEqual(calls.length, 1);
  assert.match(calls[0].line, /check-promotion\.mjs \S*index-en\.html \S*index\.html --baseline HEAD$/);
});

test('check-promotion: landing mới (landing-new/clone) soát đủ, không trừ lỗi cũ', async () => {
  const f = handoffFixture();
  const { exec, calls } = fakeExec();
  await runGates(['check-promotion'], ctx(f, exec, { flowId: 'landing-new' }));
  assert.match(calls[0].line, /mainsite\/index\.html$/);
});

test('G6: check-promotion trên campaign chưa bàn giao đọc dist/*.html', async () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.campaignDir, 'dist'));
  fs.writeFileSync(path.join(f.campaignDir, 'dist/index.html'), '<section id="popup_login"></section>');
  const { exec, calls } = fakeExec();
  await runGates(['check-promotion'], ctx(f, exec));
  assert.match(calls[0].line, /check-promotion\.mjs \S*dist\/index\.html --baseline HEAD$/);
});

test('I1: repo đang merge dở (MERGE_HEAD) → error "merge dở — xử lý tay", không commit, không tự merge --abort', async () => {
  const f = gitRepo();
  fs.writeFileSync(path.join(f.repo, '.git', 'MERGE_HEAD'), f.git('rev-parse', 'HEAD').stdout);
  const before = f.git('rev-parse', 'HEAD').stdout;
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-fix', files: ['products/x/landing/a/index.html'], planTitle: 'x' });
  assert.deepStrictEqual([r.pass, r.error, r.results[0].status], [false, 'commit', 'error']);
  assert.match(r.results[0].note, /merge dở — xử lý tay/);
  assert.strictEqual(f.git('rev-parse', 'HEAD').stdout, before);
  assert.ok(fs.existsSync(path.join(f.repo, '.git', 'MERGE_HEAD')));
});

test('I1: file UU trong status → error merge dở', async () => {
  const f = fixture();
  const { exec, calls } = fakeExec({}, 'UU products/x/landing/a/index.html\0');
  const r = await runGates(['commit'], ctx(f, exec, { files: ['products/x/landing/a/index.html'] }));
  assert.match(r.results[0].note, /merge dở/);
  assert.ok(!calls.some((c) => /git (add|commit|merge)/.test(c.line)));
});

const cdnRepo = () => {
  const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cdn-')), 'cdn-source');
  const campaignDir = path.join(repo, 'products/x/landing/a');
  fs.mkdirSync(campaignDir, { recursive: true });
  return { repo, campaignDir };
};

test('I1: cdn-source pull lỗi → error kèm commit + pullPending, note nói commit đã có', async () => {
  const { exec } = fakeExec({ 'git pull': 1, 'rev-parse HEAD': 0 }, ' M products/x/landing/a/index.html\0');
  const r = await runGates(['commit'], ctx(cdnRepo(), exec, { files: ['products/x/landing/a/index.html'] }));
  const [res] = r.results;
  assert.deepStrictEqual([r.error, res.status, res.pullPending, Boolean(res.commit), res.midMerge], ['commit', 'error', true, true, false]);
  assert.match(res.note, /đã có, pull lỗi/);
});

test('I1: cdn-source index có file phiên khác đã stage → không pull, error pullPending liệt kê file', async () => {
  const { exec, calls } = fakeExec({}, 'M  products/y/khac.scss\0 M products/x/landing/a/index.html\0');
  const r = await runGates(['commit'], ctx(cdnRepo(), exec, { files: ['products/x/landing/a/index.html'] }));
  const [res] = r.results;
  assert.deepStrictEqual([res.status, res.pullPending, res.blocking], ['error', true, ['products/y/khac.scss']]);
  assert.ok(!calls.some((c) => c.line.startsWith('git pull')));
});

test('I1: resume sau pull lỗi (không còn file để commit) → cdn-source vẫn pull lại, đạt', async () => {
  const { exec, calls } = fakeExec({}, '');
  const r = await runGates(['commit'], ctx(cdnRepo(), exec, { files: ['products/x/landing/a/index.html'] }));
  assert.strictEqual(r.results[0].status, 'pass');
  assert.ok(calls.some((c) => c.line === 'git pull --no-rebase --no-edit origin master'));
  assert.ok(!calls.some((c) => c.line.startsWith('git commit')));
});

test('I2: run sửa file ngoài campaign → error liệt kê file ngoài campaign, không commit im', async () => {
  const f = fixture();
  const porcelain = ' M products/x/landing/a/index.html\0 M products/y/ngoai.scss\0';
  const files = ['products/x/landing/a/index.html', 'products/y/ngoai.scss'];
  const r = await runGates(['commit'], ctx(f, fakeExec({}, porcelain).exec, { files }));
  const [res] = r.results;
  assert.strictEqual(res.status, 'error');
  assert.deepStrictEqual(res.blocking, ['products/y/ngoai.scss (ngoài campaign)']);
});

test('scopes: run 2 campaign cùng repo, campaign 1 chỉ có file dở từ trước → 1 commit gom đủ cả 2, không dừng', async () => {
  const f = gitRepo();
  const second = path.join(f.repo, 'products/x/landing/b');
  fs.mkdirSync(second, { recursive: true });
  fs.writeFileSync(path.join(second, 'index.html'), 'b');
  const files = ['products/x/landing/b/index.html'];
  const r = await runGates(['commit'], { ...f, scopes: [f.campaignDir, second], key: 'GW-1', flowId: 'landing-fix', files, planTitle: 'Sửa b' });
  assert.strictEqual(r.results[0].status, 'pass', r.results[0].note);
  assert.deepStrictEqual(f.git('show', '--name-only', '--format=', 'HEAD').stdout.trim().split('\n').sort(), ['products/x/landing/a/index.html', files[0]]);
});

test('I4: file đổi trong campaign nhưng agent quên khai ở files → vẫn commit, không skipped', async () => {
  const f = gitRepo();
  fs.writeFileSync(path.join(f.campaignDir, 'quen-khai.js'), 'x');
  fs.writeFileSync(path.join(f.repo, 'khac.txt'), 'của phiên khác');
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa' });
  assert.strictEqual(r.results[0].status, 'pass', r.results[0].note);
  assert.match(f.git('show', '--name-only', '--format=', 'HEAD').stdout, /quen-khai\.js/);
  assert.doesNotMatch(f.git('show', '--name-only', '--format=', 'HEAD').stdout, /khac\.txt/);
});

test('M5: rev-parse MERGE_HEAD lỗi không bị coi là merge dở', async () => {
  const f = fixture();
  const exec = (cmd, args) => (args[0] === 'rev-parse' && args[1] === '--git-path' ? { code: 128, stdout: '', stderr: 'fatal' } : fakeExec({}, ' M products/x/landing/a/index.html\0').exec(cmd, args));
  const r = await runGates(['commit'], ctx(f, exec, { files: ['products/x/landing/a/index.html'] }));
  assert.notStrictEqual(r.results[0].note, undefined);
  assert.doesNotMatch(r.results[0].note, /merge dở/);
});

test('commit: run làm mất file đã track (vd build-dev xoá dist/fonts) → dừng liệt kê, không commit', async () => {
  const f = gitRepo();
  fs.writeFileSync(path.join(f.campaignDir, 'index.html'), 'sửa');
  fs.rmSync(path.join(f.campaignDir, 'package.json'));
  const head = f.git('rev-parse', 'HEAD').stdout;
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa' });
  assert.strictEqual(r.results[0].status, 'error');
  assert.match(r.results[0].blocking.join('\n'), /package\.json/);
  assert.strictEqual(f.git('rev-parse', 'HEAD').stdout, head);
});

function trackInCampaign(f, rels) {
  for (const rel of rels) {
    fs.mkdirSync(path.dirname(path.join(f.campaignDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(f.campaignDir, rel), 'x');
  }
  f.git('add', '--', ...rels.map((rel) => `products/x/landing/a/${rel}`));
  f.git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'landing cũ');
}

test('commit: dựng lại section xoá asset cũ (kèm dist sinh từ nó) → commit cả phần xoá', async () => {
  const f = gitRepo();
  const source = ['assets/sec/images/bg.png', 'assets/sec/images/sprite/btn.png', 'assets/main/fonts/Old.woff2'];
  const built = ['dist/optimized/sec/images/bg.webp', 'dist/optimized/sec/images/sprite.webp', 'dist/fonts/Old.woff2'];
  trackInCampaign(f, [...source, ...built]);
  for (const rel of [...source, ...built]) fs.rmSync(path.join(f.campaignDir, rel));
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-new', files: [], planTitle: 'Dựng lại' });
  assert.strictEqual(r.results[0].status, 'pass', r.results[0].blocking?.join('\n'));
  const removed = f.git('show', '--diff-filter=D', '--name-only', '--format=', 'HEAD').stdout.trim().split('\n');
  assert.strictEqual(removed.length, source.length + built.length);
});

test('commit: dist mất file mà source vẫn còn (build-dev ghi đè) → vẫn dừng', async () => {
  const f = gitRepo();
  trackInCampaign(f, ['assets/main/fonts/Keep.woff2', 'dist/fonts/Keep.woff2']);
  fs.rmSync(path.join(f.campaignDir, 'dist/fonts/Keep.woff2'));
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-new', files: [], planTitle: 'Sửa' });
  assert.strictEqual(r.results[0].status, 'error');
  assert.deepStrictEqual(r.results[0].blocking, ['products/x/landing/a/dist/fonts/Keep.woff2']);
});

test('commit: dist đã commit là bản build-dev (dist/assets/), build production thay bằng dist/optimized/ → commit cả phần xoá (GW-882)', async () => {
  const f = gitRepo();
  trackInCampaign(f, ['assets/hero/images/bg.jpg', 'dist/assets/hero/images/bg.jpg', 'dist/assets/hero/images/sprite/btn.png']);
  fs.rmSync(path.join(f.campaignDir, 'dist/assets'), { recursive: true });
  fs.mkdirSync(path.join(f.campaignDir, 'dist/optimized/hero/images'), { recursive: true });
  fs.writeFileSync(path.join(f.campaignDir, 'dist/optimized/hero/images/bg.webp'), 'webp');
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa' });
  assert.strictEqual(r.results[0].status, 'pass', r.results[0].blocking?.join('\n'));
  const removed = f.git('show', '--diff-filter=D', '--name-only', '--format=', 'HEAD').stdout.trim().split('\n');
  assert.strictEqual(removed.length, 2);
});

test('commit: dist/assets/ mất mà không có dist/optimized/ thay → vẫn dừng', async () => {
  const f = gitRepo();
  trackInCampaign(f, ['assets/hero/images/bg.jpg', 'dist/assets/hero/images/bg.jpg']);
  fs.rmSync(path.join(f.campaignDir, 'dist/assets'), { recursive: true });
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa' });
  assert.strictEqual(r.results[0].status, 'error');
  assert.deepStrictEqual(r.results[0].blocking, ['products/x/landing/a/dist/assets/hero/images/bg.jpg']);
});

test('C1: commit build lại bản production (build-optimize > build-pro > build-dev) trước khi commit; build lỗi → dừng, không commit', async () => {
  const f = gitRepo({ 'build-dev': 'echo dev > dist.txt', 'build-pro': 'echo pro > dist.txt' });
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa' });
  assert.strictEqual(r.results[0].status, 'pass', r.results[0].note);
  assert.strictEqual(f.git('show', 'HEAD:products/x/landing/a/dist.txt').stdout.trim(), 'pro');
  const g = gitRepo({ 'build-pro': 'exit 3' });
  const head = g.git('rev-parse', 'HEAD').stdout;
  const bad = await runGates(['commit'], { ...g, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa' });
  assert.deepStrictEqual([bad.results[0].status, g.git('rev-parse', 'HEAD').stdout], ['error', head]);
});

test('I2: run sửa file ngoài campaign → dừng liệt kê, không commit im rồi done', async () => {
  const f = gitRepo();
  fs.mkdirSync(path.join(f.repo, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(f.repo, 'shared/lib.scss'), 'x');
  const head = f.git('rev-parse', 'HEAD').stdout;
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-fix', files: ['shared/lib.scss', 'products/x/landing/a/index.html'], planTitle: 'Sửa' });
  assert.strictEqual(r.results[0].status, 'error');
  assert.match(r.results[0].blocking.join('\n'), /shared\/lib\.scss \(ngoài campaign\)/);
  assert.strictEqual(f.git('rev-parse', 'HEAD').stdout, head);
});

test('huỷ run trong lúc commit đang build production → dừng, không commit', async () => {
  const f = gitRepo({ 'build-pro': 'echo pro > dist.txt' });
  const head = f.git('rev-parse', 'HEAD').stdout;
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa', aborted: () => true });
  assert.deepStrictEqual([r.results[0].status, f.git('rev-parse', 'HEAD').stdout], ['error', head]);
});

test('scope không còn trên đĩa (handoff đã skip) → bỏ qua khi build, không crash', async () => {
  const f = gitRepo();
  const scopes = [f.campaignDir, path.join(f.repo, 'products/khong-co')];
  const r = await runGates(['commit'], { ...f, scopes, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa' });
  assert.notStrictEqual(r.results[0].status, 'crash');
  assert.ok(['pass', 'skipped'].includes(r.results[0].status), r.results[0].note);
});

test('build chạy trước một mình, các check chỉ đọc chạy đồng thời sau khi dist đã ghi xong', async () => {
  const f = fixture();
  const events = [];
  let live = 0;
  let peak = 0;
  const exec = async (cmd, args) => {
    const name = args.find((a) => /build|pm-gate|layout-gate/.test(a)).replace(/.*\//, '');
    events.push(`start ${name}`);
    live++;
    peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 30));
    live--;
    events.push(`end ${name}`);
    return { code: 0, stdout: 'ok', stderr: '' };
  };
  const r = await runGates(['build', 'pm-gate', 'layout-gate'], ctx(f, exec));
  assert.strictEqual(r.pass, true);
  assert.deepStrictEqual(events.slice(0, 2), ['start build-optimize', 'end build-optimize']);
  assert.strictEqual(peak, 2);
  assert.deepStrictEqual(r.results.map((x) => x.check), ['build', 'pm-gate', 'layout-gate']);
});
