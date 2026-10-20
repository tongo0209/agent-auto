import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-chat-'));
process.env.AUTOPILOT_CLAUDE_PROJECTS = root;
const { latestSession, sessionUsage } = await import('./chat.mjs');

const line = (o) => JSON.stringify(o);

test('latestSession: thư mục phiên theo cwd (ký tự ngoài chữ-số thành -), lấy file sửa gần nhất', () => {
  const cwd = '/Users/x/VNG/agent-auto-lab/runs/GW-1/r1/wt/cdn-source';
  assert.strictEqual(latestSession(cwd), null);
  const dir = path.join(root, '-Users-x-VNG-agent-auto-lab-runs-GW-1-r1-wt-cdn-source');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.jsonl'), '');
  fs.utimesSync(path.join(dir, 'a.jsonl'), new Date(2020, 1, 1), new Date(2020, 1, 1));
  fs.writeFileSync(path.join(dir, 'b.jsonl'), '');
  fs.writeFileSync(path.join(dir, 'c.txt'), '');
  assert.deepStrictEqual(latestSession(cwd), { id: 'b', file: path.join(dir, 'b.jsonl') });
});

test('sessionUsage: cộng usage mỗi message 1 lần (stream ghi lặp cùng id), phút = đầu tới cuối phiên', () => {
  const file = path.join(root, 's.jsonl');
  const usage = { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 30, cache_creation_input_tokens: 400 };
  fs.writeFileSync(file, [
    line({ type: 'user', timestamp: '2026-10-20T10:00:00Z', message: { role: 'user', content: 'x' } }),
    line({ type: 'assistant', timestamp: '2026-10-20T10:01:00Z', message: { id: 'm1', usage } }),
    line({ type: 'assistant', timestamp: '2026-10-20T10:01:01Z', message: { id: 'm1', usage } }),
    line({ type: 'assistant', timestamp: '2026-10-20T10:05:00Z', message: { id: 'm2', usage: { output_tokens: 7 } } }),
    '{"type":"assis',
  ].join('\n'));
  assert.deepStrictEqual(sessionUsage(file), { tokens: 440, ms: 5 * 60_000 });
});
