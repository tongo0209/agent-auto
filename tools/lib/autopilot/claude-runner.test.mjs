import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TOOLSETS, buildClaudeArgs, runClaude, guardCode } from './claude-runner.mjs';

test('buildClaudeArgs có --resume và --model khi truyền', () => {
  const args = buildClaudeArgs({ prompt: 'p', model: 'sonnet', toolset: 'review', resumeSessionId: 's1' });
  assert.deepStrictEqual(args.slice(0, 5), ['-p', 'p', '--output-format', 'stream-json', '--verbose']);
  assert.ok(args.includes('--resume') && args[args.indexOf('--resume') + 1] === 's1');
  assert.ok(args.includes('--model') && args[args.indexOf('--model') + 1] === 'sonnet');
});

test('review không được Edit; không toolset nào có git commit/push', () => {
  assert.ok(!TOOLSETS.review.split(',').includes('Edit'));
  for (const tools of Object.values(TOOLSETS)) assert.doesNotMatch(tools, /git (commit|push)/);
});

test('chưa bật AUTOPILOT_LAB_WRITES → gắn hook sandbox chặn ghi ra ngoài worktree', () => {
  const settingsOf = (args) => JSON.parse(args[args.indexOf('--settings') + 1]);
  const hook = settingsOf(buildClaudeArgs({ prompt: 'p', toolset: 'implement' })).hooks.PreToolUse[0];
  assert.match(hook.matcher, /Edit/);
  assert.match(hook.hooks[0].command, /sandbox-hook\.mjs/);
  process.env.AUTOPILOT_LAB_WRITES = '1';
  try {
    assert.ok(!buildClaudeArgs({ prompt: 'p', toolset: 'implement' }).includes('--settings'));
  } finally {
    delete process.env.AUTOPILOT_LAB_WRITES;
  }
});

test('toolset lạ → ném lỗi', () => {
  assert.throws(() => buildClaudeArgs({ prompt: 'p', toolset: 'root' }), /toolset/);
});

function withFake(script, fn) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-fake-')), 'fake.json');
  fs.writeFileSync(file, JSON.stringify(script));
  process.env.AUTOPILOT_FAKE = file;
  return fn().finally(() => delete process.env.AUTOPILOT_FAKE);
}

test('fake trả theo round, vượt round lấy phần tử cuối', () =>
  withFake({ plan: [{ result: 'r1', costUsd: 1, turns: 5 }, { result: 'r2' }] }, async () => {
    const one = await runClaude({ stageId: 'plan', round: 1, prompt: 'x', toolset: 'review' });
    assert.deepStrictEqual([one.ok, one.result, one.costUsd, one.turns], [true, 'r1', 1, 5]);
    assert.strictEqual((await runClaude({ stageId: 'plan', round: 9, prompt: 'x', toolset: 'review' })).result, 'r2');
  }));

test('fake thiếu stage → verdict pass', () =>
  withFake({}, async () => {
    const r = await runClaude({ stageId: 'implement', round: 1, prompt: 'x', toolset: 'implement' });
    assert.match(r.result, /"verdict":"pass"/);
    assert.match(r.sessionId, /^fake-implement/);
  }));

test('guardCode bắt mã hook G-', () => {
  assert.strictEqual(guardCode('bị chặn: G-GIT-4 (autostash)'), 'G-GIT-4');
  assert.strictEqual(guardCode('mọi thứ ổn'), null);
});

test('đường thật: đặt env AUTOPILOT_RUN, đọc JSON của claude, ghi log', async () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-bin-'));
  fs.writeFileSync(
    path.join(bin, 'claude'),
    '#!/bin/sh\necho \'{"type":"assistant","message":{"content":[{"type":"text","text":"dang doc"}]}}\'\nsleep 0.4\nprintf \'{"type":"result","result":"env=%s","session_id":"s9","num_turns":4,"total_cost_usd":0.5,"duration_ms":10,"is_error":false}\\n\' "$AUTOPILOT_RUN"\n',
    { mode: 0o755 },
  );
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  try {
    const logFile = path.join(bin, 'log', 'plan.log');
    const running = runClaude({ stageId: 'plan', round: 1, prompt: 'x', toolset: 'review', marker: 'GW-1/r1', logFile });
    await new Promise((r) => setTimeout(r, 200));
    assert.match(fs.readFileSync(logFile, 'utf8'), /dang doc/, 'log phải có sự kiện ngay khi claude còn chạy');
    const r = await running;
    assert.deepStrictEqual([r.ok, r.result, r.sessionId, r.turns, r.costUsd], [true, 'env=GW-1/r1', 's9', 4, 0.5]);
    assert.ok(fs.existsSync(logFile));
  } finally {
    process.env.PATH = oldPath;
  }
});

test('đường thật: output không phải JSON → ok false', async () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-bin-'));
  fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\necho boom >&2\nexit 1\n', { mode: 0o755 });
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  try {
    const r = await runClaude({ stageId: 'plan', round: 1, prompt: 'x', toolset: 'review', marker: 'm' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /exit 1/);
  } finally {
    process.env.PATH = oldPath;
  }
});
