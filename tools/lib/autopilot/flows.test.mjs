import { test } from 'node:test';
import assert from 'node:assert';
import { loadFlow, listFlows, validateFlow, PROMPTS_DIR } from './flows.mjs';

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
