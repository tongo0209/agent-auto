import { test } from 'node:test';
import assert from 'node:assert';
import { shouldAutoClose, planAutoClose, applyAutoClose } from './autoclose.mjs';

const TODAY = '2026-09-14';
const DONE = ['done', 'completed', 'canceled', 'cancelled', 'closed', 'resolved'];
const ask = (issue) => shouldAutoClose(issue, { todayISO: TODAY, doneStatuses: DONE });

test('đóng ticket bugfix khi Jira COMPLETED và mốc cuối đã qua', () => {
  const r = ask({ phase: 'bugfix', status: 'COMPLETED', milestones: { html: '2026-08-14', release: '2026-08-26' } });
  assert.equal(r.close, true);
  assert.match(r.reason, /2026-08-26/);
  assert.match(r.reason, /19 ngày/);
});

test('đóng ticket wait-test khi Jira Done và mốc cuối đã qua', () => {
  assert.equal(ask({ phase: 'wait-test', status: 'Done', milestones: { release: '2026-08-31' } }).close, true);
});

test('KHÔNG đóng khi Jira còn To Do dù mốc đã qua', () => {
  const r = ask({ phase: 'wait-test', status: 'To Do', milestones: { release: '2026-09-01' } });
  assert.equal(r.close, false);
  assert.match(r.reason, /Jira/);
});

test('KHÔNG đóng khi còn mốc ở tương lai', () => {
  assert.equal(ask({ phase: 'bugfix', status: 'COMPLETED', milestones: { html: '2026-08-14', release: '2026-09-19' } }).close, false);
});

test('KHÔNG đóng khi mốc cuối rơi đúng hôm nay', () => {
  assert.equal(ask({ phase: 'wait-test', status: 'COMPLETED', milestones: { release: TODAY } }).close, false);
});

test('KHÔNG đóng khi ticket không có mốc nào — không đoán', () => {
  assert.equal(ask({ phase: 'bugfix', status: 'COMPLETED', milestones: {} }).close, false);
});

test('key ghi chú gạch dưới không tính là mốc', () => {
  assert.equal(ask({ phase: 'bugfix', status: 'COMPLETED', milestones: { _releaseNote: 'dời sang 2027-01-01' } }).close, false);
});

test('phase closed rồi thì không đóng lại', () => {
  assert.equal(ask({ phase: 'closed', status: 'COMPLETED', milestones: { release: '2026-08-01' } }).close, false);
});

test('phase reassigned không bị đụng — việc đã sang người khác', () => {
  assert.equal(ask({ phase: 'reassigned', status: 'COMPLETED', milestones: { release: '2026-08-01' } }).close, false);
});

test('so status không phân biệt hoa thường', () => {
  assert.equal(ask({ phase: 'bugfix', status: 'completed', milestones: { release: '2026-08-01' } }).close, true);
});

test('done-fe quá mốc cũng được đóng hẳn', () => {
  assert.equal(ask({ phase: 'done-fe', status: 'COMPLETED', milestones: { release: '2026-08-15' } }).close, true);
});

test('planAutoClose chỉ trả ticket đủ điều kiện, kèm số ngày quá hạn', () => {
  const state = { issues: {
    'GW-660': { phase: 'bugfix', status: 'COMPLETED', milestones: { release: '2026-08-26' } },
    'GW-745': { phase: 'wait-test', status: 'To Do', milestones: { release: '2026-09-14' } },
    'GW-796': { phase: 'deliver', status: 'To Do', milestones: { release: '2026-10-01' } },
  } };
  const plan = planAutoClose(state, { todayISO: TODAY, doneStatuses: DONE });
  assert.deepEqual(plan.map((p) => p.key), ['GW-660']);
  assert.equal(plan[0].from, 'bugfix');
  assert.equal(plan[0].daysPast, 19);
});

test('applyAutoClose ghi phase + dấu vết kiểm chứng được', () => {
  const state = { issues: { 'GW-660': { phase: 'bugfix', status: 'COMPLETED', milestones: { release: '2026-08-26' } } } };
  const plan = planAutoClose(state, { todayISO: TODAY, doneStatuses: DONE });
  const { state: next, phaseLog } = applyAutoClose(state, plan, { nowISO: '2026-09-14T10:00:00+07:00' });
  const it = next.issues['GW-660'];
  assert.equal(it.phase, 'closed');
  assert.equal(it.closedAuto, true);
  assert.equal(it.closedAt, '2026-09-14T10:00:00+07:00');
  assert.match(it.closedReason, /2026-08-26/);
  assert.deepEqual(phaseLog.map((l) => [l.key, l.from, l.to]), [['GW-660', 'bugfix', 'closed']]);
});

test('applyAutoClose chạy lại lần 2 không đổi gì thêm', () => {
  const state = { issues: { 'GW-660': { phase: 'bugfix', status: 'COMPLETED', milestones: { release: '2026-08-26' } } } };
  const opts = { todayISO: TODAY, doneStatuses: DONE };
  const once = applyAutoClose(state, planAutoClose(state, opts), { nowISO: '2026-09-14T10:00:00+07:00' }).state;
  const twice = applyAutoClose(once, planAutoClose(once, opts), { nowISO: '2026-09-15T10:00:00+07:00' });
  assert.equal(twice.phaseLog.length, 0);
  assert.equal(twice.state.issues['GW-660'].closedAt, '2026-09-14T10:00:00+07:00');
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAutoClose } from './autoclose.mjs';

const tmpRepo = (issues) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclose-'));
  fs.mkdirSync(path.join(root, 'schema'), { recursive: true });
  fs.mkdirSync(path.join(root, 'history'), { recursive: true });
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues }, null, 2));
  fs.writeFileSync(path.join(root, 'schema/vocab.json'), JSON.stringify({ doneStatuses: DONE }));
  return root;
};
const NOW = new Date('2026-09-14T10:00:00+07:00');

test('runAutoClose ghi state, phases.jsonl và backup', () => {
  const root = tmpRepo({ 'GW-660': { phase: 'bugfix', status: 'COMPLETED', milestones: { release: '2026-08-26' } } });
  const res = runAutoClose({ root, now: NOW });

  assert.equal(res.closed.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8')).issues['GW-660'].phase, 'closed');
  assert.match(fs.readFileSync(path.join(root, 'history/phases.jsonl'), 'utf8'), /"to":"closed"/);
  assert.equal(fs.readdirSync(path.join(root, '.backups/state')).length, 1);
});

test('runAutoClose không đụng gì khi không có ticket đủ điều kiện', () => {
  const root = tmpRepo({ 'GW-745': { phase: 'wait-test', status: 'To Do', milestones: { release: '2026-09-14' } } });
  const before = fs.readFileSync(path.join(root, 'state.json'), 'utf8');

  const res = runAutoClose({ root, now: NOW });

  assert.equal(res.closed.length, 0);
  assert.equal(fs.readFileSync(path.join(root, 'state.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, '.backups/state')), false);
});

test('runAutoClose dry không ghi gì nhưng vẫn báo sẽ đóng ai', () => {
  const root = tmpRepo({ 'GW-660': { phase: 'bugfix', status: 'COMPLETED', milestones: { release: '2026-08-26' } } });
  const before = fs.readFileSync(path.join(root, 'state.json'), 'utf8');

  const res = runAutoClose({ root, now: NOW, dry: true });

  assert.deepEqual(res.closed.map((c) => c.key), ['GW-660']);
  assert.equal(fs.readFileSync(path.join(root, 'state.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, 'history/phases.jsonl')), false);
});

test('thiếu schema/vocab.json thì báo lỗi ra, KHÔNG ném và không đụng state', () => {
  const root = tmpRepo({ 'GW-660': { phase: 'bugfix', status: 'COMPLETED', milestones: { release: '2026-08-26' } } });
  fs.rmSync(path.join(root, 'schema/vocab.json'));
  const before = fs.readFileSync(path.join(root, 'state.json'), 'utf8');

  const res = runAutoClose({ root, now: NOW });

  assert.deepEqual(res.closed, []);
  assert.match(res.error, /vocab/);
  assert.equal(fs.readFileSync(path.join(root, 'state.json'), 'utf8'), before);
});

/**
 * Ca thật 21/9: radar-tick cầm bản chụp state.json lúc đầu lượt, user bấm tắt theo dõi một
 * sheet ở giữa lượt, radar ghi đè sau cùng thì mất thao tác tắt. `autoclose.mjs` cùng dạng
 * write-cả-file nên trúng đúng lỗi này. Giả lập bằng cách chặn LẦN ĐỌC ĐẦU (bản `base` autoclose
 * cầm) rồi mới ghi thay đổi của "user" xuống đĩa — lần đọc THỨ HAI (writeMerged đọc lại lúc ghi)
 * phải thấy được thay đổi đó.
 */
test('user tắt follow một sheet giữa lúc autoclose cầm bản chụp cũ vẫn không mất', () => {
  const root = tmpRepo({ 'GW-660': { phase: 'bugfix', status: 'COMPLETED', milestones: { release: '2026-08-26' } } });
  const statePath = path.join(root, 'state.json');
  const seed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  seed.bugWatch = { s1: { follow: true, title: 'buglist X' } };
  fs.writeFileSync(statePath, JSON.stringify(seed, null, 2));

  const realRead = fs.readFileSync;
  let firstRead = true;
  fs.readFileSync = (p, ...rest) => {
    const result = realRead(p, ...rest);
    if (firstRead && String(p) === statePath) {
      firstRead = false;
      const state = JSON.parse(result);
      state.bugWatch.s1.follow = false;
      state.bugWatch.s1.unfollowReason = 'user tắt giữa lượt';
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    }
    return result;
  };
  try {
    runAutoClose({ root, now: NOW });
  } finally {
    fs.readFileSync = realRead;
  }

  const after = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(after.bugWatch.s1.follow, false, 'follow tắt của user bị autoclose ghi đè lại');
  assert.equal(after.issues['GW-660'].phase, 'closed', 'autoclose vẫn đóng đúng ticket của nó');
});

test('state.json hỏng lúc autoclose ghi — không ném, giữ bản mình', () => {
  const root = tmpRepo({ 'GW-660': { phase: 'bugfix', status: 'COMPLETED', milestones: { release: '2026-08-26' } } });
  const statePath = path.join(root, 'state.json');

  const realRead = fs.readFileSync;
  let firstRead = true;
  fs.readFileSync = (p, ...rest) => {
    const result = realRead(p, ...rest);
    if (firstRead && String(p) === statePath) {
      firstRead = false;
      fs.writeFileSync(statePath, '{ hỏng giữa lượt');
    }
    return result;
  };
  try {
    assert.doesNotThrow(() => runAutoClose({ root, now: NOW }));
  } finally {
    fs.readFileSync = realRead;
  }

  assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).issues['GW-660'].phase, 'closed');
});
