import { test } from 'node:test';
import assert from 'node:assert';
import { startupInput } from './startup.mjs';
import { createPtyStore } from '../../server/lib/ptyStore.js';

const fakePty = () => ({ onData: () => {}, onExit: () => {}, write: () => {}, resize: () => {}, kill: () => {} });

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

/**
 * Chỗ NỐI, không phải hàm lá: server mới là nơi biết phiên cũ hay mới. Test này đỏ nếu ai đó
 * cho client tự khai "phiên mới" (vd `onclose → connect(session, true)`) mà bỏ cờ `fresh`.
 */
test('nối lại phiên cũ dù URL vẫn mang startup=1 → không gõ lệnh', () => {
  const store = createPtyStore({ spawn: () => fakePty(), now: () => 1000, ttlMs: 60000, bufferBytes: 100 });
  const client = { send: () => {} };
  const startup = 'claude'; // startup=1 ⇒ server luôn kèm lệnh trong gói `attached`
  const first = store.attach('s1', client, { cols: 80, rows: 24 });
  store.detach('s1');
  const again = store.attach('s1', client, { cols: 80, rows: 24 });

  assert.equal(startupInput({ fresh: first.fresh, startup }), 'claude\r');
  assert.equal(startupInput({ fresh: again.fresh, startup }), null);
});
