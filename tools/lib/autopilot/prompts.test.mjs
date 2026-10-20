import { test } from 'node:test';
import assert from 'node:assert';
import { renderPrompt, VERDICT_FOOTER } from './prompts.mjs';

test('dòng đầu là marker AUTOPILOT_RUN', () => {
  assert.strictEqual(renderPrompt('x', {}, 'GW-1/r1').split('\n')[0], 'AUTOPILOT_RUN: GW-1/r1');
});

test('thay biến, biến thiếu thành rỗng', () => {
  const out = renderPrompt('Ticket {{KEY}} note:[{{rejectNote}}]', { KEY: 'GW-9' }, 'm');
  assert.match(out, /Ticket GW-9 note:\[\]/);
});

test('kết thúc bằng footer verdict', () => {
  assert.ok(renderPrompt('x', {}, 'm').endsWith(VERDICT_FOOTER));
});
