import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULTS, restoreHint, planDesigns, planOps, applyPlan, runJanitor, formatReport, dueToday, sweepAlert } from './janitor.mjs';

const NOW = new Date(2026, 7, 18, 10, 0);
const daysAgo = (n) => new Date(Number(NOW) - n * 86400e3).toISOString();

const tmpRepo = () => fs.mkdtempSync(path.join(os.tmpdir(), 'janitor-'));

const put = (root, rel, bytes = 16) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.alloc(bytes, 1));
  return p;
};

const seedTicket = (root, key, { phase, updated = daysAgo(30), manifest = true, link = null } = {}) => {
  put(root, `designs/${key}/_raw/hero.psd`, 4096);
  put(root, `designs/${key}/_src/PSD/page.psb`, 2048);
  put(root, `designs/${key}/cut_PC.png`, 512);
  if (manifest) {
    fs.writeFileSync(
      path.join(root, `designs/${key}/sp-manifest.json`),
      JSON.stringify({ key, site: 'https://sp/site', root: '/Docs/' + key, files: [] }),
    );
  }
  const statePath = path.join(root, 'state.json');
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { issues: {} };
  state.issues[key] = { phase, lastSeenUpdated: updated };
  if (link) state.issues[key].designLink = link;
  fs.writeFileSync(statePath, JSON.stringify(state));
  return state;
};

const readState = (root) => JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));
const rel = (v) => v.path;

// ---------- đường về: chỉ xoá thứ tải lại được ----------

test('có sp-manifest.json thì đường về là manifest', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  assert.equal(restoreHint(root, 'GW-1', readState(root)).kind, 'manifest');
});

test('không manifest nhưng state có designLink thì đường về là link', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-2', { phase: 'closed', manifest: false, link: 'https://sp/x' });
  const hint = restoreHint(root, 'GW-2', readState(root));
  assert.equal(hint.kind, 'link');
  assert.equal(hint.ref, 'https://sp/x');
});

test('không manifest, không link thì KHÔNG có đường về', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-3', { phase: 'closed', manifest: false });
  assert.equal(restoreHint(root, 'GW-3', readState(root)).kind, 'none');
});

// ---------- chọn nạn nhân ----------

test('ticket đã xong + có đường về: gom _raw và _src, chừa ảnh cắt và manifest', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(plan.victims.map(rel).sort(), ['designs/GW-1/_raw', 'designs/GW-1/_src']);
  assert.equal(
    plan.victims.every((v) => v.restore.kind === 'manifest'),
    true,
  );
});

test('byte báo cáo là byte đo thật của thư mục', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  const raw = plan.victims.find((v) => v.path.endsWith('_raw'));
  assert.equal(raw.bytes, 4096);
});

test('ticket chưa xong thì không đụng tới', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-4', { phase: 'coding' });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(plan.victims, []);
  assert.equal(plan.skipped.find((s) => s.key === 'GW-4').why, 'phase-active');
});

test('ticket đã xong nhưng KHÔNG có đường về thì chỉ báo, không xoá', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-5', { phase: 'closed', manifest: false });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(plan.victims, []);
  assert.equal(plan.skipped.find((s) => s.key === 'GW-5').why, 'no-restore');
});

test('vừa xong trong hạn ân xá thì chưa xoá', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-6', { phase: 'closed', updated: daysAgo(2) });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(plan.victims, []);
  assert.equal(plan.skipped.find((s) => s.key === 'GW-6').why, 'grace');
});

test('thư mục design không có ticket trong state thì không dám xoá', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  put(root, 'designs/GW-999/_raw/x.psd', 999);
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.equal(
    plan.victims.some((v) => v.path.includes('GW-999')),
    false,
  );
  assert.equal(plan.skipped.find((s) => s.key === 'GW-999').why, 'unknown-ticket');
});

test('_archive quá 2 tuần thì tự xoá — user chốt 18/8', () => {
  const root = tmpRepo();
  const dir = 'designs/_archive/GW-525-rev1-2026-08-01';
  put(root, `${dir}/_src/old.psd`, 1024);
  fs.utimesSync(path.join(root, dir), new Date(2026, 7, 1), new Date(2026, 7, 1));
  const plan = planDesigns({ root, state: { issues: {} }, now: NOW });
  assert.deepEqual(plan.victims.map(rel), [dir]);
  assert.equal(plan.victims[0].restore.kind, 'superseded');
});

test('_archive chưa tới 2 tuần thì giữ', () => {
  const root = tmpRepo();
  const dir = 'designs/_archive/GW-525-rev2-2026-08-15';
  put(root, `${dir}/_src/new.psd`, 1024);
  const plan = planDesigns({ root, state: { issues: {} }, now: NOW });
  assert.deepEqual(plan.victims, []);
  assert.equal(plan.skipped.find((s) => s.path === dir).why, 'grace');
});

test('tắt công tắc archive thì trở lại chế độ chỉ báo', () => {
  const root = tmpRepo();
  const dir = 'designs/_archive/GW-525-rev1-2026-08-01';
  put(root, `${dir}/_src/old.psd`, 1024);
  fs.utimesSync(path.join(root, dir), new Date(2026, 7, 1), new Date(2026, 7, 1));
  const plan = planDesigns({ root, state: { issues: {} }, now: NOW, cfg: { archiveAutoDelete: false } });
  assert.deepEqual(plan.victims, []);
  assert.equal(plan.skipped.find((s) => s.path === dir).why, 'archive-manual');
});

test('đang fix bug là VẪN ĐANG LÀM — không phải đã xong', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-610', { phase: 'bugfix', updated: daysAgo(30) });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(plan.victims, []);
  assert.equal(plan.skipped.find((s) => s.key === 'GW-610').why, 'phase-active');
});

// ---------- thi hành + sổ hoàn tác ----------

test('xoá thật và ghi sổ hoàn tác đủ đường về', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  const res = applyPlan({ root, victims: plan.victims, now: NOW });

  assert.equal(fs.existsSync(path.join(root, 'designs/GW-1/_raw')), false);
  assert.equal(fs.existsSync(path.join(root, 'designs/GW-1/cut_PC.png')), true);
  assert.equal(fs.existsSync(path.join(root, 'designs/GW-1/sp-manifest.json')), true);
  assert.equal(res.bytes, 6144);

  const rows = fs
    .readFileSync(path.join(root, '.janitor-log.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].restore.kind, 'manifest');
  assert.equal(rows[0].at, NOW.toISOString());
});

test('--dry thì không xoá gì và không ghi sổ', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  const res = applyPlan({ root, victims: plan.victims, now: NOW, dry: true });

  assert.equal(fs.existsSync(path.join(root, 'designs/GW-1/_raw')), true);
  assert.equal(fs.existsSync(path.join(root, '.janitor-log.jsonl')), false);
  assert.equal(res.bytes, 6144);
});

test('đường dẫn trỏ ra ngoài repo thì từ chối, không xoá', () => {
  const root = tmpRepo();
  const outside = tmpRepo();
  put(outside, 'victim.txt', 8);
  const res = applyPlan({
    root,
    victims: [{ rule: 'bịa', path: '../' + path.basename(outside), bytes: 8, restore: { kind: 'none' } }],
    now: NOW,
  });
  assert.equal(fs.existsSync(path.join(outside, 'victim.txt')), true);
  assert.equal(res.refused.length, 1);
  assert.equal(res.removed, 0);
});

test('mặc định: hạn ân xá và phase đã xong khai báo rõ ràng', () => {
  assert.equal(DEFAULTS.graceDays > 0, true);
  assert.deepEqual(DEFAULTS.donePhases.includes('closed'), true);
});

// ---------- dữ liệu vận hành ----------

const aged = (root, rel, days) => {
  const t = new Date(Number(NOW) - days * 86400e3);
  fs.utimesSync(path.join(root, rel), t, t);
};

test('cache quá hạn thì xoá, cache còn mới thì giữ', () => {
  const root = tmpRepo();
  put(root, '.cache/bugsheets/old.md', 100);
  put(root, '.cache/bugsheets/new.md', 100);
  aged(root, '.cache/bugsheets/old.md', 40);
  const plan = planOps({ root, now: NOW });
  assert.deepEqual(
    plan.victims.filter((v) => v.rule === 'cache-stale').map(rel),
    ['.cache/bugsheets/old.md'],
  );
});

test('backup giữ N bản mới nhất mỗi họ, xoá phần cũ hơn', () => {
  const root = tmpRepo();
  for (let i = 0; i < 5; i++) {
    put(root, `.backups/state/state-${i}.json`, 10);
    aged(root, `.backups/state/state-${i}.json`, 5 - i);
  }
  put(root, '.backups/config/config-0.json', 10);
  const plan = planOps({ root, now: NOW, cfg: { backupsKeepPerFamily: 2 } });
  assert.deepEqual(plan.victims.filter((v) => v.rule === 'backup-rotate').map(rel).sort(), [
    '.backups/state/state-0.json',
    '.backups/state/state-1.json',
    '.backups/state/state-2.json',
  ]);
});

test('rác hệ thống .DS_Store bị gom ở mọi tầng', () => {
  const root = tmpRepo();
  put(root, '.DS_Store', 8);
  put(root, 'designs/GW-1/.DS_Store', 8);
  const plan = planOps({ root, now: NOW });
  assert.deepEqual(
    plan.victims.filter((v) => v.rule === 'junk').map(rel).sort(),
    ['.DS_Store', 'designs/GW-1/.DS_Store'],
  );
});

test('lịch sử và ghi chép task KHÔNG bao giờ bị dọn tự động', () => {
  const root = tmpRepo();
  put(root, 'history/issues.jsonl', 100);
  put(root, 'tasks/GW-1/brief.md', 100);
  aged(root, 'history/issues.jsonl', 400);
  aged(root, 'tasks/GW-1/brief.md', 400);
  const plan = planOps({ root, now: NOW });
  assert.deepEqual(plan.victims, []);
});

// ---------- một lượt trọn vẹn ----------

const seedRepo = () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  put(root, '.DS_Store', 8);
  return root;
};

test('công tắc tắt trong config thì không làm gì cả', () => {
  const root = seedRepo();
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ janitor: { enabled: false } }));
  const res = runJanitor({ root, now: NOW });
  assert.equal(res.skipped, 'disabled');
  assert.equal(fs.existsSync(path.join(root, 'designs/GW-1/_raw')), true);
});

test('một lượt thật: xoá, ghi sổ chi tiết và ghi sổ lượt', () => {
  const root = seedRepo();
  const res = runJanitor({ root, now: NOW });

  assert.equal(fs.existsSync(path.join(root, 'designs/GW-1/_raw')), false);
  assert.equal(fs.existsSync(path.join(root, '.DS_Store')), false);
  assert.equal(res.bytes, 6152);
  assert.equal(res.removed, 3);

  const ticks = fs.readFileSync(path.join(root, 'history/janitor.jsonl'), 'utf8').split('\n').filter(Boolean);
  assert.equal(ticks.length, 1);
  assert.equal(JSON.parse(ticks[0]).bytes, 6152);
  assert.equal(fs.readFileSync(path.join(root, '.janitor-log.jsonl'), 'utf8').split('\n').filter(Boolean).length, 3);
});

test('lượt --dry báo đủ số nhưng không đụng file, không ghi sổ nào', () => {
  const root = seedRepo();
  const res = runJanitor({ root, now: NOW, argv: ['--dry'] });
  assert.equal(res.bytes, 6152);
  assert.equal(fs.existsSync(path.join(root, 'designs/GW-1/_raw')), true);
  assert.equal(fs.existsSync(path.join(root, 'history/janitor.jsonl')), false);
  assert.equal(fs.existsSync(path.join(root, '.janitor-log.jsonl')), false);
});

test('thứ không tải lại được nổi lên mục "cần bạn quyết" kèm dung lượng', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-9', { phase: 'closed', manifest: false });
  const res = runJanitor({ root, now: NOW, argv: ['--dry'] });
  const report = formatReport(res);
  assert.match(report, /GW-9/);
  assert.match(report, /no-restore/);
  assert.doesNotMatch(formatReport({ ...res, needsYou: [] }), /cần bạn quyết/);
});

// ---------- đồng hồ ân xá: tính từ lần ĐỔI PHASE, không phải lần Jira đổi ----------

test('hạn ân xá tính theo lần đổi phase trong history/phases.jsonl', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed', updated: daysAgo(90) });
  put(root, 'history/phases.jsonl', 0);
  fs.writeFileSync(
    path.join(root, 'history/phases.jsonl'),
    JSON.stringify({ at: daysAgo(60), key: 'GW-1', to: 'coding' }) +
      '\n' +
      JSON.stringify({ at: daysAgo(1), key: 'GW-1', to: 'closed' }) +
      '\n',
  );
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(plan.victims, []);
  assert.equal(plan.skipped.find((s) => s.key === 'GW-1').why, 'grace');
});

test('không có sổ phase thì rơi về lastSeenUpdated', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed', updated: daysAgo(30) });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.equal(plan.victims.length, 2);
});

test('ticket đã sang tay người khác cũng là đã xong', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'reassigned', updated: daysAgo(30) });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.equal(plan.victims.length, 2);
});

// ---------- nhịp: đúng một lượt dọn mỗi ngày ----------

test('sổ trống thì tới hạn dọn', () => {
  assert.equal(dueToday(tmpRepo(), NOW), true);
});

test('đã dọn hôm nay thì không dọn nữa', () => {
  const root = tmpRepo();
  put(root, 'history/janitor.jsonl', 0);
  fs.writeFileSync(path.join(root, 'history/janitor.jsonl'), JSON.stringify({ at: NOW.toISOString() }) + '\n');
  assert.equal(dueToday(root, NOW), false);
});

test('lượt dọn cuối là hôm qua thì tới hạn lại', () => {
  const root = tmpRepo();
  put(root, 'history/janitor.jsonl', 0);
  fs.writeFileSync(path.join(root, 'history/janitor.jsonl'), JSON.stringify({ at: daysAgo(1) }) + '\n');
  assert.equal(dueToday(root, NOW), true);
});

// ---------- kê khai: xoá rồi vẫn biết mình đã có những file gì ----------

test('sổ hoàn tác kê từng file đã xoá kèm dung lượng', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  applyPlan({ root, victims: plan.victims, now: NOW });
  const rows = fs
    .readFileSync(path.join(root, '.janitor-log.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const raw = rows.find((r) => r.path.endsWith('_raw'));
  assert.deepEqual(raw.inventory, { files: [{ rel: 'hero.psd', bytes: 4096 }], truncated: false });
  const src = rows.find((r) => r.path.endsWith('_src'));
  assert.deepEqual(src.inventory.files, [{ rel: 'PSD/page.psb', bytes: 2048 }]);
});

test('kê khai quá dài thì cắt và nói rõ là đã cắt', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  for (let i = 0; i < 6; i++) put(root, `designs/GW-1/_raw/f${i}.psd`, 1);
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  applyPlan({ root, victims: plan.victims, now: NOW, inventoryCap: 3 });
  const raw = fs
    .readFileSync(path.join(root, '.janitor-log.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .find((r) => r.path.endsWith('_raw'));
  assert.equal(raw.inventory.files.length, 3);
  assert.equal(raw.inventory.truncated, true);
});

test('rác lẻ một file thì kê khai chính nó', () => {
  const root = tmpRepo();
  put(root, '.DS_Store', 8);
  const plan = planOps({ root, now: NOW });
  applyPlan({ root, victims: plan.victims, now: NOW });
  const row = JSON.parse(fs.readFileSync(path.join(root, '.janitor-log.jsonl'), 'utf8').split('\n')[0]);
  assert.deepEqual(row.inventory.files, [{ rel: '.DS_Store', bytes: 8 }]);
});

// ---------- "chỉ báo" phải có người nghe ----------

test('đủ nặng và không tự xoá được thì soạn tin nhắn nêu tên + dung lượng', () => {
  const msg = sweepAlert({ needsYou: [{ key: 'GW-9', why: 'no-restore', bytes: 700 * 1024 ** 2 }] });
  assert.match(msg, /GW-9/);
  assert.match(msg, /700/);
});

test('không có gì cần quyết thì KHÔNG báo', () => {
  assert.equal(sweepAlert({ needsYou: [] }), null);
  assert.equal(sweepAlert({ skipped: 'disabled' }), null);
});

test('vài chục MB thì im, đừng làm ồn', () => {
  assert.equal(sweepAlert({ needsYou: [{ key: 'GW-9', why: 'no-restore', bytes: 20 * 1024 ** 2 }] }), null);
});

test('nhiều mục thì gộp một tin, không bắn từng cái', () => {
  const msg = sweepAlert({
    needsYou: [
      { key: 'GW-9', why: 'no-restore', bytes: 600 * 1024 ** 2 },
      { path: 'designs/_archive/GW-525-rev1', why: 'archive-manual', bytes: 722 * 1024 ** 2 },
    ],
  });
  assert.equal(msg.split('\n').length <= 3, true);
  assert.match(msg, /GW-9/);
  assert.match(msg, /_archive/);
});

// ---------- cấm tuyệt đối: nguồn đã hỏng thì bản local là bản duy nhất ----------

test('nguồn hỏng (sourceIntegrity BAD) thì không xoá, dù có manifest', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-660', { phase: 'closed' });
  const state = readState(root);
  state.issues['GW-660'].design = { sourceIntegrity: 'BAD — zip trên SharePoint thiếu EOCD' };
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(state));
  const plan = planDesigns({ root, state, now: NOW });
  assert.deepEqual(plan.victims, []);
  assert.equal(plan.skipped.find((s) => s.key === 'GW-660').why, 'source-broken');
});

test('nguồn lành thì vẫn xoá như thường', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  const state = readState(root);
  state.issues['GW-1'].design = { sourceIntegrity: 'OK' };
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(state));
  assert.equal(planDesigns({ root, state, now: NOW }).victims.length, 2);
});

test('ticket trong danh sách bảo vệ thì miễn nhiễm', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-1', { phase: 'closed' });
  const plan = planDesigns({ root, state: readState(root), now: NOW, cfg: { protect: ['GW-1'] } });
  assert.deepEqual(plan.victims, []);
  assert.equal(plan.skipped.find((s) => s.key === 'GW-1').why, 'protected');
});

// ---------- zip đã giải nén cạnh nó = bản trùng ----------

test('zip đã giải nén cạnh nó thì xoá được, không cần chờ ticket xong', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-7', { phase: 'coding' });
  put(root, 'designs/GW-7/_raw/art/a.psd', 32);
  put(root, 'designs/GW-7/_raw/art/b.psd', 32);
  execFileSync('zip', ['-q', '-r', 'src.zip', 'art'], { cwd: path.join(root, 'designs/GW-7/_raw') });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(
    plan.victims.filter((v) => v.rule === 'design-zip').map(rel),
    ['designs/GW-7/_raw/src.zip'],
  );
});

test('zip CHƯA giải nén thì giữ — nó là bản duy nhất', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-7', { phase: 'coding' });
  put(root, 'designs/GW-7/_raw/art/a.psd', 32);
  execFileSync('zip', ['-q', '-r', '../lone.zip', 'art'], { cwd: path.join(root, 'designs/GW-7/_raw') });
  fs.rmSync(path.join(root, 'designs/GW-7/_raw/art'), { recursive: true });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(plan.victims.filter((v) => v.rule === 'design-zip'), []);
});

test('zip của ticket nguồn hỏng thì cũng không đụng', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-7', { phase: 'coding' });
  put(root, 'designs/GW-7/_raw/art/a.psd', 32);
  execFileSync('zip', ['-q', '-r', 'src.zip', 'art'], { cwd: path.join(root, 'designs/GW-7/_raw') });
  const state = readState(root);
  state.issues['GW-7'].design = { sourceIntegrity: 'BAD — nguồn hỏng' };
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(state));
  assert.deepEqual(planDesigns({ root, state, now: NOW }).victims, []);
});

// ---------- rác tạm khác ----------

test('ảnh chụp tạm của browserpilot quá hạn thì dọn', () => {
  const root = tmpRepo();
  put(root, '.browserpilot/shots/fail-step0-123.png', 64);
  put(root, '.browserpilot/shots/moi.png', 64);
  aged(root, '.browserpilot/shots/fail-step0-123.png', 40);
  const plan = planOps({ root, now: NOW });
  assert.deepEqual(
    plan.victims.filter((v) => v.rule === 'shots-stale').map(rel),
    ['.browserpilot/shots/fail-step0-123.png'],
  );
});

test('cache rỗng là lần đọc hỏng bị đóng băng — xoá ngay bất kể tuổi', () => {
  const root = tmpRepo();
  put(root, '.cache/bugsheets/rong.md', 0);
  put(root, '.cache/bugsheets/co-noi-dung.md', 100);
  const plan = planOps({ root, now: NOW });
  assert.deepEqual(
    plan.victims.filter((v) => v.rule === 'cache-empty').map(rel),
    ['.cache/bugsheets/rong.md'],
  );
});

test('zip bị lột thư mục gốc lúc giải nén vẫn tính là đã giải nén', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-7', { phase: 'coding' });
  const raw = path.join(root, 'designs/GW-7/_raw');
  put(root, 'designs/GW-7/_raw/goc/1_Homepage.psd', 128);
  put(root, 'designs/GW-7/_raw/goc/2_Event.psd', 256);
  execFileSync('zip', ['-q', '-r', 'nguon.zip', 'goc'], { cwd: raw });
  fs.renameSync(path.join(raw, 'goc/1_Homepage.psd'), path.join(raw, '1_Homepage.psd'));
  fs.renameSync(path.join(raw, 'goc/2_Event.psd'), path.join(raw, '2_Event.psd'));
  fs.rmSync(path.join(raw, 'goc'), { recursive: true });
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(
    plan.victims.filter((v) => v.rule === 'design-zip').map(rel),
    ['designs/GW-7/_raw/nguon.zip'],
  );
});

test('thiếu dù một file trong zip thì giữ nguyên zip', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-7', { phase: 'coding' });
  const raw = path.join(root, 'designs/GW-7/_raw');
  put(root, 'designs/GW-7/_raw/goc/a.psd', 128);
  put(root, 'designs/GW-7/_raw/goc/b.psd', 256);
  execFileSync('zip', ['-q', '-r', 'nguon.zip', 'goc'], { cwd: raw });
  fs.rmSync(path.join(raw, 'goc/b.psd'));
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(plan.victims.filter((v) => v.rule === 'design-zip'), []);
});

test('cùng tên nhưng khác dung lượng thì KHÔNG tính là đã giải nén', () => {
  const root = tmpRepo();
  seedTicket(root, 'GW-7', { phase: 'coding' });
  const raw = path.join(root, 'designs/GW-7/_raw');
  put(root, 'designs/GW-7/_raw/goc/a.psd', 128);
  execFileSync('zip', ['-q', '-r', 'nguon.zip', 'goc'], { cwd: raw });
  fs.writeFileSync(path.join(raw, 'goc/a.psd'), Buffer.alloc(999, 2));
  const plan = planDesigns({ root, state: readState(root), now: NOW });
  assert.deepEqual(plan.victims.filter((v) => v.rule === 'design-zip'), []);
});
