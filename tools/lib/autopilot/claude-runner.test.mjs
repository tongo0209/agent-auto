import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TOOLSETS, buildClaudeArgs, runClaude, guardCode, tokensOf } from './claude-runner.mjs';

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

test('sandbox mặc định TẮT (user 22/10: xử lý linh động); AUTOPILOT_SANDBOX=1 mới gắn hook', () => {
  assert.ok(!buildClaudeArgs({ prompt: 'p', toolset: 'implement' }).includes('--settings'));
  process.env.AUTOPILOT_SANDBOX = '1';
  try {
    const args = buildClaudeArgs({ prompt: 'p', toolset: 'implement' });
    const hook = JSON.parse(args[args.indexOf('--settings') + 1]).hooks.PreToolUse[0];
    assert.match(hook.matcher, /Edit/);
    assert.match(hook.hooks[0].command, /sandbox-hook\.mjs/);
  } finally {
    delete process.env.AUTOPILOT_SANDBOX;
  }
});

test('tokensOf cộng cả 4 loại token của usage, thiếu usage → 0', () => {
  assert.strictEqual(tokensOf({ input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 4000 }), 4330);
  assert.strictEqual(tokensOf(undefined), 0);
});

test('intake mở Chrome của user (SharePoint/Sheets cần phiên đã đăng nhập), toolset khác không', () => {
  const intake = buildClaudeArgs({ prompt: 'p', toolset: 'intake' });
  assert.ok(intake.includes('--chrome'));
  assert.match(intake[intake.indexOf('--allowedTools') + 1], /mcp__claude-in-chrome__\*/);
  assert.ok(!buildClaudeArgs({ prompt: 'p', toolset: 'implement' }).includes('--chrome'));
});

test('toolset sửa code được thay ảnh bằng lệnh đơn (rule allow → auto-mode không chặn oan; hook sandbox vẫn giữ ranh giới)', () => {
  for (const toolset of ['implement', 'browser', 'cut', 'intake'])
    for (const rule of ['Bash(cp:*)', 'Bash(mkdir:*)', 'Bash(sips:*)']) assert.ok(TOOLSETS[toolset].split(',').includes(rule), `${toolset} ${rule}`);
  assert.ok(!TOOLSETS.review.includes('Bash(cp:*)'));
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

test('đường thật: ghi PID ra childFile, bị tắt giữa chừng vẫn trả sessionId của phiên', async () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-bin-'));
  fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\necho \'{"type":"system","subtype":"init","session_id":"s7"}\'\nexec sleep 5\n', { mode: 0o755 });
  const childFile = path.join(bin, '.child');
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  try {
    const running = runClaude({ stageId: 'plan', round: 1, prompt: 'x', toolset: 'review', marker: 'm', childFile });
    await new Promise((r) => setTimeout(r, 300));
    process.kill(-JSON.parse(fs.readFileSync(childFile, 'utf8')).pid, 'SIGTERM');
    const r = await running;
    assert.deepStrictEqual([r.ok, r.sessionId], [false, 's7']);
    assert.strictEqual(fs.existsSync(childFile), false);
  } finally {
    process.env.PATH = oldPath;
  }
});

test('R19: hook sandbox (khi bật) nhận danh sách repo của run được ghi', () => {
  process.env.AUTOPILOT_SANDBOX = '1';
  const args = buildClaudeArgs({ prompt: 'p', toolset: 'implement', writable: ['/Users/u/VNG/git-vng/cdn-source'] });
  const command = JSON.parse(args[args.indexOf('--settings') + 1]).hooks.PreToolUse[0].hooks[0].command;
  delete process.env.AUTOPILOT_SANDBOX;
  assert.match(command, /sandbox-hook\.mjs" "\/Users\/u\/VNG\/git-vng\/cdn-source"$/);
});
