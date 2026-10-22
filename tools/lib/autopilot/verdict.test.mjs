import { test } from 'node:test';
import assert from 'node:assert';
import { parseVerdict } from './verdict.mjs';

const block = (obj) => '```autopilot-verdict\n' + JSON.stringify(obj) + '\n```';

test('khối chuẩn → pass với đủ mảng', () => {
  const v = parseVerdict('xong.\n' + block({ verdict: 'pass', advisory: ['a'], files: ['x.scss'], note: 'ok' }));
  assert.deepStrictEqual(v, { verdict: 'pass', blocking: [], advisory: ['a'], files: ['x.scss'], note: 'ok', campaignDir: null, evidence: [], malformed: false });
});

test('nhiều khối → lấy khối cuối', () => {
  const v = parseVerdict(block({ verdict: 'pass' }) + '\n' + block({ verdict: 'revise', blocking: ['b1'] }));
  assert.strictEqual(v.verdict, 'revise');
  assert.deepStrictEqual(v.blocking, ['b1']);
});

test('JSON hỏng → fail malformed', () => {
  const v = parseVerdict('```autopilot-verdict\n{verdict: pass\n```');
  assert.strictEqual(v.verdict, 'fail');
  assert.strictEqual(v.malformed, true);
});

test('không có khối hoặc output rỗng → fail malformed', () => {
  assert.strictEqual(parseVerdict('chỉ có chữ').malformed, true);
  assert.strictEqual(parseVerdict('').verdict, 'fail');
});

test('revise mà blocking rỗng → pass, giữ advisory', () => {
  const v = parseVerdict(block({ verdict: 'revise', advisory: ['nên đổi tên'] }));
  assert.strictEqual(v.verdict, 'pass');
  assert.deepStrictEqual(v.advisory, ['nên đổi tên']);
});

test('verdict lạ → fail malformed', () => {
  assert.strictEqual(parseVerdict(block({ verdict: 'ok' })).malformed, true);
});

test('giữ campaignDir khi stage intake báo về', () => {
  assert.strictEqual(parseVerdict(block({ verdict: 'pass', campaignDir: 'products/x/landing/a' })).campaignDir, 'products/x/landing/a');
  assert.strictEqual(parseVerdict(block({ verdict: 'pass' })).campaignDir, null);
});

test('giữ evidence (ảnh bằng chứng) khi stage khai', () => {
  assert.deepStrictEqual(parseVerdict(block({ verdict: 'pass', evidence: ['/tmp/pc-01.png'] })).evidence, ['/tmp/pc-01.png']);
});
