import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { loadFlow, listFlows, validateFlow, flowOfRun, promptOfRun, promptsOf, PROMPTS_DIR } from './flows.mjs';

const mini = (stages, ask = [{ need: ['key'], question: 'Ticket nào?' }]) => ({ id: 'x', budget: { usd: 1, minutes: 1 }, ask, stages });

test('flow thật đều hợp lệ', () => {
  assert.deepStrictEqual(listFlows().sort(), ['buglist', 'design-intake', 'feature', 'gameplay-change', 'landing-clone', 'landing-fix', 'landing-new']);
  for (const id of listFlows()) assert.deepStrictEqual(validateFlow(loadFlow(id), { promptsDir: PROMPTS_DIR }), [], id);
});

test('next trỏ id lạ → lỗi', () => {
  const errs = validateFlow(mini([{ id: 'a', kind: 'gate', checks: ['build'], next: 'zz' }]), { promptsDir: PROMPTS_DIR });
  assert.ok(errs.some((e) => e.includes('zz')));
});

test('id trùng → lỗi', () => {
  const errs = validateFlow(mini([{ id: 'a', kind: 'pause', next: 'a' }, { id: 'a', kind: 'pause', next: null }]), { promptsDir: PROMPTS_DIR });
  assert.ok(errs.some((e) => e.includes('trùng')));
});

test('prompt thiếu file / toolset lạ / check lạ → lỗi', () => {
  const errs = validateFlow(
    mini([
      { id: 'a', kind: 'claude', prompt: 'khong-co.md', toolset: 'review', next: 'b' },
      { id: 'b', kind: 'claude', prompt: 'plan.md', toolset: 'root', next: 'c' },
      { id: 'c', kind: 'gate', checks: ['deploy'], next: null },
    ]),
    { promptsDir: PROMPTS_DIR },
  );
  assert.strictEqual(errs.length, 3);
});

test('không tới được kết thúc → lỗi', () => {
  const errs = validateFlow(mini([{ id: 'a', kind: 'pause', next: 'b' }, { id: 'b', kind: 'pause', next: 'a' }]), { promptsDir: PROMPTS_DIR });
  assert.ok(errs.some((e) => e.includes('kết thúc')));
});

test('C: mỗi luồng phải khai 1–3 câu ask có need + question', () => {
  const stages = [{ id: 'a', kind: 'pause', next: null }];
  assert.ok(validateFlow(mini(stages, []), { promptsDir: PROMPTS_DIR }).some((e) => e.includes('ask')));
  const four = Array.from({ length: 4 }, () => ({ need: ['key'], question: 'q' }));
  assert.ok(validateFlow(mini(stages, four), { promptsDir: PROMPTS_DIR }).some((e) => e.includes('ask')));
  assert.ok(validateFlow(mini(stages, [{ question: 'q' }]), { promptsDir: PROMPTS_DIR }).some((e) => e.includes('need')));
});

test('budget không bắt buộc (mặc định không giới hạn), có khai thì phải > 0', () => {
  const stages = [{ id: 'a', kind: 'claude', prompt: 'x', next: null }];
  assert.ok(!validateFlow({ ...mini(stages), budget: undefined }, { promptsDir: PROMPTS_DIR }).some((e) => /budget/.test(e)));
  assert.ok(validateFlow({ ...mini(stages), budget: { usd: 0 } }, { promptsDir: PROMPTS_DIR }).some((e) => /budget/.test(e)));
});

test('run ghim flow lúc tạo: sửa flows/*.json không đổi luồng của run đang chạy', async () => {
  const { createRun } = await import('./engine.mjs');
  const flow = loadFlow('landing-fix');
  const run = createRun({ key: 'GW-1', runId: 'r1', flow, routerReason: 't', repo: '/repo', campaignDir: '/c', now: 0 });
  assert.deepStrictEqual(flowOfRun(run), flow);
  const edited = { ...run, flowSnapshot: { ...flow, label: 'bản đã ghim' } };
  assert.strictEqual(flowOfRun(edited).label, 'bản đã ghim');
});

const FLOWS = path.dirname(PROMPTS_DIR);
const git = (...args) => spawnSync('git', args, { cwd: FLOWS, encoding: 'utf8' }).stdout;
const lastChangeOf = (rel) => git('log', '-1', '--format=%H %ct', '--', rel).trim().split(' ');

test('run cũ chưa ghim → đọc flow ở commit HEAD, không đọc file đang sửa dở', () => {
  assert.deepStrictEqual(flowOfRun({ flow: 'landing-fix', startedAt: Date.now() }), JSON.parse(git('show', 'HEAD:./landing-fix.json')));
});

test('run cũ chưa ghim bắt đầu trước commit đổi flow → đọc bản trước commit đó', () => {
  const [hash, at] = lastChangeOf('landing-fix.json');
  const run = { flow: 'landing-fix', startedAt: (Number(at) - 1) * 1000 };
  assert.deepStrictEqual(flowOfRun(run), JSON.parse(git('show', `${hash}^:./landing-fix.json`)));
});

test('prompt ghim theo run: snapshot thắng file trên đĩa', () => {
  const run = { flow: 'landing-fix', startedAt: Date.now(), promptSnapshot: { 'implement.md': 'BẢN GHIM {{KEY}}' } };
  assert.strictEqual(promptOfRun(run, 'implement.md'), 'BẢN GHIM {{KEY}}');
});

test('run cũ chưa ghim prompt → đọc prompt ở commit trước lúc run bắt đầu', () => {
  const [hash, at] = lastChangeOf('prompts/implement.md');
  const run = { flow: 'landing-fix', startedAt: (Number(at) - 1) * 1000 };
  assert.strictEqual(promptOfRun(run, 'implement.md'), git('show', `${hash}^:./prompts/implement.md`));
});

test('prompt chưa từng commit → đọc file trên đĩa', () => {
  assert.strictEqual(promptOfRun({ flow: 'landing-fix', startedAt: Date.now() }, 'section-ui.md'), fs.readFileSync(path.join(PROMPTS_DIR, 'section-ui.md'), 'utf8'));
});

test('promptsOf chụp đủ prompt của mọi stage trong flow', () => {
  const prompts = promptsOf(loadFlow('landing-fix'));
  assert.ok(Object.keys(prompts).includes('implement.md') && Object.keys(prompts).includes('fix-section.md'));
  assert.strictEqual(prompts['implement.md'], fs.readFileSync(path.join(PROMPTS_DIR, 'implement.md'), 'utf8'));
});
