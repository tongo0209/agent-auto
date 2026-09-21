import { test } from 'node:test';
import assert from 'node:assert';
import { startupInput } from './startup.mjs';

test('phiên mới + có lệnh → gõ lệnh kèm Enter', () => {
  assert.equal(startupInput({ fresh: true, startup: 'claude' }), 'claude\r');
});

test('phiên nối lại sau reload → không gõ gì (claude có thể đang chạy)', () => {
  assert.equal(startupInput({ fresh: false, startup: 'claude' }), null);
});

test('không khai lệnh → không gõ gì', () => {
  assert.equal(startupInput({ fresh: true }), null);
  assert.equal(startupInput({ fresh: true, startup: '' }), null);
});
