import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jiraClaudeArgs, parseJiraSnapshot, jiraChangedSince, fetchJiraSnapshot } from './jira-snapshot.mjs';

const SNAPSHOT = { key: 'GW-905', summary: 's', status: 'In Progress', duedate: null, updated: '2026-10-21T10:47:12.000+0700', description: 'd', latestComment: null };

test('claude -p chỉ được gọi getJiraIssue, model haiku, cloudId nằm trong prompt', () => {
  const args = jiraClaudeArgs('GW-905', 'cloud-1');
  assert.strictEqual(args[args.indexOf('--allowedTools') + 1], 'mcp__claude_ai_Atlassian__getJiraIssue');
  assert.strictEqual(args[args.indexOf('--model') + 1], 'haiku');
  assert.match(args[args.indexOf('-p') + 1], /cloud-1[\s\S]*GW-905|GW-905[\s\S]*cloud-1/);
});

test('bóc JSON ảnh chụp từ result của claude, kể cả khi bọc ```json', () => {
  const stdout = JSON.stringify({ type: 'result', is_error: false, result: 'Đây:\n```json\n' + JSON.stringify(SNAPSHOT) + '\n```' });
  assert.deepStrictEqual(parseJiraSnapshot(stdout), SNAPSHOT);
});

test('result lỗi hoặc thiếu updated → ném lỗi', () => {
  assert.throws(() => parseJiraSnapshot(JSON.stringify({ is_error: true, result: 'needs auth' })), /needs auth/);
  assert.throws(() => parseJiraSnapshot(JSON.stringify({ result: '{"key":"GW-1"}' })), /updated/);
});

test('Jira đổi sau lần quét cuối khi updated mới hơn lastSeenUpdated; chưa quét lần nào cũng tính là đổi', () => {
  assert.strictEqual(jiraChangedSince(SNAPSHOT, '2026-10-21T10:14:00.000+0700'), true);
  assert.strictEqual(jiraChangedSince(SNAPSHOT, '2026-10-21T10:47:12.000+0700'), false);
  assert.strictEqual(jiraChangedSince(SNAPSHOT, undefined), true);
});

function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

test('AUTOPILOT_FAKE_JIRA trả ảnh chụp từ file; AUTOPILOT_FAKE/AUTOPILOT_NO_JIRA không gọi Jira', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-jira-')), 'jira.json');
  fs.writeFileSync(file, JSON.stringify(SNAPSHOT));
  assert.deepStrictEqual(withEnv({ AUTOPILOT_FAKE_JIRA: file }, () => fetchJiraSnapshot('GW-905', 'c')), SNAPSHOT);
  assert.strictEqual(withEnv({ AUTOPILOT_NO_JIRA: '1' }, () => fetchJiraSnapshot('GW-905', 'c')), null);
  assert.strictEqual(withEnv({ AUTOPILOT_FAKE: '/x' }, () => fetchJiraSnapshot('GW-905', 'c')), null);
});
