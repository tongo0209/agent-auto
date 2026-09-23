import { test } from 'node:test';
import assert from 'node:assert';
import { sliceTimeline, scanSession, OUTSIDE, ORPHAN } from './wall-scan.mjs';

const at = (sec) => new Date(Date.UTC(2026, 8, 20, 0, 0, sec)).toISOString();
const asst = (sec, { skill, id = `m${sec}`, tool, effort = 'xhigh', ctx = 10_000 } = {}) => ({
  type: 'assistant', timestamp: at(sec), attributionSkill: skill, effort,
  message: {
    id, usage: { input_tokens: ctx },
    content: tool ? [{ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input ?? {} }] : [{ type: 'text', text: 'x' }],
  },
});
const result = (sec, toolUseId, extra = {}) => ({ type: 'user', timestamp: at(sec), message: { content: [{ type: 'tool_result', tool_use_id: toolUseId }] }, ...extra });
const say = (sec) => ({ type: 'user', timestamp: at(sec), message: { content: 'làm tiếp' } });
const pick = (slices) => slices.map(({ kind, skill, seconds, tool, cmd }) => ({ kind, skill, seconds, ...(tool && { tool }), ...(cmd && { cmd }) }));

test('model và tool chia liền nhau, tool gắn skill của dòng gọi nó', () => {
  const { slices } = sliceTimeline([
    say(0),
    asst(4, { skill: 'daily', tool: { id: 't1', name: 'Bash', input: { command: 'npm run build' } } }),
    result(14, 't1'),
    asst(20, { skill: 'daily' }),
  ], { session: 's' });
  assert.deepStrictEqual(pick(slices), [
    { kind: 'model', skill: 'daily', seconds: 4 },
    { kind: 'tool', skill: 'daily', seconds: 10, tool: 'Bash', cmd: 'npm run build' },
    { kind: 'model', skill: 'daily', seconds: 6 },
  ]);
});

test('AskUserQuestion tính vào chờ user, không vào tool', () => {
  const { slices } = sliceTimeline([
    asst(0, { skill: 'x', tool: { id: 'q', name: 'AskUserQuestion' } }),
    result(120, 'q'),
  ], { session: 's' });
  assert.deepStrictEqual(pick(slices), [{ kind: 'wait', skill: 'x', seconds: 120 }]);
});

test('gián đoạn quá 15 phút không tính là model; tin user thật là chờ user', () => {
  const { slices } = sliceTimeline([say(0), asst(2000), say(2100), asst(2103)], { session: 's' });
  assert.deepStrictEqual(pick(slices), [
    { kind: 'wait', skill: OUTSIDE, seconds: 100 },
    { kind: 'model', skill: OUTSIDE, seconds: 3 },
  ]);
});

test('tool song song không bị đếm trùng', () => {
  const { slices } = sliceTimeline([
    asst(0, { tool: { id: 'a', name: 'Bash' } }),
    asst(1, { id: 'm0', tool: { id: 'b', name: 'mcp__browserpilot__run_steps' } }),
    result(10, 'a'),
    result(12, 'b'),
  ], { session: 's' });
  const tool = slices.filter((s) => s.kind === 'tool');
  assert.strictEqual(tool.reduce((n, s) => n + s.seconds, 0), 11);
  assert.deepStrictEqual(tool.map((s) => s.tool), ['Bash', 'mcp:browserpilot']);
});

test('subagent nhận skill của dòng gọi Agent; không nối được thì vào ORPHAN', () => {
  const slices = scanSession({
    session: 's',
    main: [
      asst(0, { skill: 'bug-fixer-lite', tool: { id: 'ag', name: 'Agent' } }),
      result(1, 'ag', { toolUseResult: { agentId: 'abc' } }),
    ],
    subagents: { abc: [say(0), asst(5), asst(8)], zzz: [say(0), asst(2)] },
  });
  const sub = slices.filter((s) => s.sub);
  assert.deepStrictEqual(pick(sub), [
    { kind: 'model', skill: 'bug-fixer-lite', seconds: 5 },
    { kind: 'model', skill: 'bug-fixer-lite', seconds: 3 },
    { kind: 'model', skill: ORPHAN, seconds: 2 },
  ]);
});

test('lần chạy skill tách khi skill đổi', () => {
  const { slices } = sliceTimeline([say(0), asst(2, { skill: 'a' }), asst(3, { skill: 'b' }), asst(5, { skill: 'a' })], { session: 's' });
  assert.deepStrictEqual(slices.map((s) => `${s.skill}#${s.run}`), ['a#1', 'b#2', 'a#3']);
});
