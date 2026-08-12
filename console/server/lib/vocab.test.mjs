import { test } from 'node:test';
import assert from 'node:assert';
import vocabLib from './vocab.js';

test('9 phase, không trùng id', () => {
  assert.equal(vocabLib.PHASE_IDS.length, 9);
  assert.equal(new Set(vocabLib.PHASE_IDS).size, 9);
});

test('offMyPlate = đúng reassigned + closed', () => {
  assert.deepEqual([...vocabLib.OFF_MY_PLATE_PHASES].sort(), ['closed', 'reassigned']);
});

test('deliver KHÔNG được miễn trễ mốc — đang giao mà quá mốc vẫn là trễ', () => {
  // Đây là invariant đã trả giá: server từng gate cảnh báo mốc bằng `htmlTodo` (loại `deliver`
  // ra) trong khi client `isLate` lại tính `deliver` là trễ — hai bên nói khác nhau về cùng 1
  // ticket. Giờ cả hai đọc `lateExempt`, và ca này khoá lại chiều đó.
  assert.ok(!vocabLib.LATE_EXEMPT_PHASES.includes('deliver'));
  assert.ok(vocabLib.LATE_EXEMPT_PHASES.includes('wait-test'));
});

test('không còn cờ CHẾT trong vocab — mọi cờ phase phải có người đọc', () => {
  // Cờ chết trong file chịu lực là bẫy: người sau bật/tắt nó rồi tưởng hành vi đổi.
  // `htmlDone` từng ở đây và không còn consumer nào sau khi alerts.js chuyển sang `lateExempt`.
  const used = new Set([
    'id', 'label', 'icon', 'sev', 'group',
    'offMyPlate', 'htmlTodo', 'lateExempt', 'active', 'dim', 'folded', 'needsHandoff', 'key',
    // `gone` / `doneMine` tách nhánh của `offMyPlate` cho timeline — consumer là
    // core/constants.mjs (GONE_PHASES · DONE_PHASES) → core/marks.mjs keepOnTimeline().
    'gone', 'doneMine',
  ]);
  const unknown = [...new Set(vocabLib.vocab.phases.flatMap((p) => Object.keys(p)))].filter((k) => !used.has(k));
  assert.deepEqual(unknown, []);
});

test('duedate là mốc hành chính, không phải mốc phải giao', () => {
  assert.ok(vocabLib.MILESTONE_IDS.includes('duedate'));
  assert.ok(!vocabLib.MUST_DELIVER_IDS.includes('duedate'));
});
