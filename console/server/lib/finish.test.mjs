import { test } from 'node:test';
import assert from 'node:assert';
import finish from './finish.js';

const { finishIssue, reopenIssue } = finish;
const NOW = '2026-10-01T07:00:00.000Z';
const state = () => ({
  issues: {
    'GW-796': { phase: 'wait-test', milestones: { release: '2026-10-12' } },
    'GW-881': { phase: 'coding' },
  },
});

test('chờ test → xong FE: ghi dấu manualFinish để hoàn tác được, kèm 1 dòng log phase', () => {
  const { state: next, log } = finishIssue(state(), 'GW-796', 'done-fe', { nowISO: NOW, expectPhase: 'wait-test' });
  assert.strictEqual(next.issues['GW-796'].phase, 'done-fe');
  assert.deepStrictEqual(next.issues['GW-796'].manualFinish, { from: 'wait-test', at: NOW });
  assert.strictEqual(next.issues['GW-796'].closedAt, undefined);
  assert.deepStrictEqual(log, { at: NOW, key: 'GW-796', from: 'wait-test', to: 'done-fe', reason: 'console-manual — user báo xong' });
});

test('đóng hẳn ghi closedAt + closedReason như autoclose, nhưng KHÔNG gắn closedAuto', () => {
  const { state: next } = finishIssue(state(), 'GW-796', 'closed', { nowISO: NOW, expectPhase: 'wait-test' });
  const issue = next.issues['GW-796'];
  assert.strictEqual(issue.phase, 'closed');
  assert.strictEqual(issue.closedAt, NOW);
  assert.match(issue.closedReason, /user đóng từ console/);
  assert.strictEqual(issue.closedAuto, undefined);
});

test('chỉ nhận ticket đang chờ test / fix bug, và chỉ chuyển sang xong FE / đóng', () => {
  assert.throws(() => finishIssue(state(), 'GW-881', 'done-fe', { nowISO: NOW, expectPhase: 'coding' }), /chờ test|fix bug/);
  assert.throws(() => finishIssue(state(), 'GW-796', 'coding', { nowISO: NOW, expectPhase: 'wait-test' }), /done-fe|closed/);
  assert.throws(() => finishIssue(state(), 'GW-1', 'closed', { nowISO: NOW }), /không có/);
});

test('phase trên đĩa đã đổi so với lúc user bấm (radar vừa chuyển bugfix) ⇒ từ chối, mã 409', () => {
  assert.throws(() => finishIssue(state(), 'GW-796', 'done-fe', { nowISO: NOW, expectPhase: 'bugfix' }), (e) => e.status === 409);
});

test('hoàn tác trả đúng phase cũ và gỡ hết dấu mình đã ghi', () => {
  const closed = finishIssue(state(), 'GW-796', 'closed', { nowISO: NOW, expectPhase: 'wait-test' }).state;
  const { state: back, log } = reopenIssue(closed, 'GW-796', { nowISO: NOW });
  assert.deepStrictEqual(back.issues['GW-796'], state().issues['GW-796']);
  assert.strictEqual(log.to, 'wait-test');
  assert.strictEqual(log.from, 'closed');
});

test('không hoàn tác ticket do máy đóng (không có manualFinish)', () => {
  const s = { issues: { 'GW-1': { phase: 'closed', closedAuto: true } } };
  assert.throws(() => reopenIssue(s, 'GW-1', { nowISO: NOW }), /không phải/);
});
