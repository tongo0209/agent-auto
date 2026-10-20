import { test } from 'node:test';
import assert from 'node:assert';
import learn from './learn.js';

const { leadTimes } = learn;

test('lead time chỉ lấy mẫu từ task chính — phase của subtask (việc bổ sung ngắn) không kéo median', () => {
  const rows = [
    { at: '2026-08-01T08:00:00+07:00', key: 'GW-1', from: null, to: 'coding', reason: 'jira' },
    { at: '2026-08-03T08:00:00+07:00', key: 'GW-1', from: 'coding', to: 'deliver', reason: 'jira' },
    { at: '2026-08-04T08:00:00+07:00', key: 'GW-2', from: null, to: 'coding', reason: 'jira' },
    { at: '2026-08-04T09:00:00+07:00', key: 'GW-2', from: 'coding', to: 'wait-test', reason: 'jira' },
  ];
  const issues = { 'GW-1': { phase: 'deliver' }, 'GW-2': { parent: 'GW-1', phase: 'wait-test' } };
  const coding = leadTimes({ rows, issues }).phases.find((p) => p.phase === 'coding');
  assert.deepStrictEqual([coding.n, coding.medianHours], [1, 48]);
});
