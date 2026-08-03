import { test } from 'node:test';
import assert from 'node:assert';
import { nextMilestone, isLate, severityByDays, daysUntil } from './format.mjs';

const TODAY = '2026-08-03';

test('nextMilestone lấy mốc gần nhất chưa qua, bỏ key ghi chú `_`', () => {
  const issue = { milestones: { html: '2026-08-10', duedate: '2026-08-07', _conflict: 'ghi chú' } };
  assert.deepEqual(nextMilestone(issue, TODAY), { name: 'duedate', date: '2026-08-07', days: 4 });
});

test('isLate: quá mốc HTML mà vẫn đang code = trễ', () => {
  assert.equal(isLate({ phase: 'coding', milestones: { html: '2026-08-01' } }, TODAY), true);
});

test('isLate KHÔNG tính ticket đã chuyển người hoặc đã đóng', () => {
  const ms = { html: '2026-08-01' };
  assert.equal(isLate({ phase: 'reassigned', milestones: ms }, TODAY), false);
  assert.equal(isLate({ phase: 'closed', milestones: ms }, TODAY), false);
});

test('isLate VẪN tính phase deliver — đang giao mà quá mốc thì vẫn trễ', () => {
  assert.equal(isLate({ phase: 'deliver', milestones: { html: '2026-08-01' } }, TODAY), true);
});

test('severity theo số ngày còn lại', () => {
  assert.equal(severityByDays(2), 'crit');
  assert.equal(severityByDays(6), 'warn');
  assert.equal(severityByDays(20), 'ok');
  assert.equal(daysUntil('2026-08-05', TODAY), 2);
});
