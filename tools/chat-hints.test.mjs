import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatHints } from './chat-hints.mjs';

const state = { issues: { 'GW-882': { phase: 'ready' }, 'GW-700': { phase: 'closed' }, 'GW-901': { phase: 'coding' } } };
const line = (msg) => JSON.stringify({ from: 'PM', url: 'u', tags: [], ...msg });
const GW882_TEXT = 'xin update lại version PC tiếng việt trước nhen, mai sẽ có full mobile và ngày mốt full ngôn ngữ';

test('ca GW-882 thật: mai/mốt quy theo ngày giờ VN của tin, trùng id gộp 1', () => {
  const real = line({ id: '1', at: '2026-10-14T03:37:02.000Z', keys: ['GW-882'], text: GW882_TEXT });
  const out = chatHints([real, real], state, '2026-10-14T00:00:00Z');
  assert.equal(out['GW-882'].length, 1);
  assert.deepEqual(out['GW-882'][0].dates, ['2026-10-15', '2026-10-16']);
  assert.equal(out['GW-882'][0].kind, 'hint');
});

test('ngày lấy theo giờ VN: 18:00Z ngày 14 là 01:00 ngày 15 ở VN', () => {
  const out = chatHints([line({ id: '2', at: '2026-10-14T18:00:00Z', keys: ['GW-882'], tags: ['deadline'], text: 'hôm nay xong' })], state, '2026-10-14T00:00:00Z');
  assert.deepEqual(out['GW-882'][0].dates, ['2026-10-15']);
});

test('dd/mm và dd-mm, năm lấy theo tin', () => {
  const out = chatHints([line({ id: '3', at: '2026-10-14T03:00:00Z', keys: ['GW-882'], tags: ['design'], text: 'design 17/10, release 20-10' })], state, '2026-10-14T00:00:00Z');
  assert.deepEqual(out['GW-882'][0].dates, ['2026-10-17', '2026-10-20']);
});

test('"mốt"/"mai" nằm trong từ khác không khớp', () => {
  const out = chatHints([line({ id: '4', at: '2026-10-14T03:00:00Z', keys: ['GW-882'], tags: ['design'], text: 'chị Mai gửi, mốtxyz, maiden, bánh mì mai-mai' })], state, '2026-10-14T00:00:00Z');
  assert.deepEqual(out['GW-882'][0].dates, []);
});

test('bóc link design, bỏ link Teams thường', () => {
  const text = 'file mới https://vng.sharepoint.com/:f:/s/x/abc và https://www.figma.com/design/K/n?node-id=1-2, hub https://hub.vnggames.com/tickets/123. xem https://example.com/a';
  const out = chatHints([line({ id: '5', at: '2026-10-14T03:00:00Z', keys: ['GW-882'], tags: ['design'], text })], state, '2026-10-14T00:00:00Z');
  assert.deepEqual(out['GW-882'][0].links, [
    'https://vng.sharepoint.com/:f:/s/x/abc',
    'https://www.figma.com/design/K/n?node-id=1-2',
    'https://hub.vnggames.com/tickets/123',
  ]);
});

test('bỏ ticket closed, ticket ngoài state, tin trước since, tin không tag không gợi ý', () => {
  const lines = [
    line({ id: '6', at: '2026-10-14T03:00:00Z', keys: ['GW-700'], tags: ['design'], text: 'mai có design' }),
    line({ id: '7', at: '2026-10-14T03:00:00Z', keys: ['GW-999'], tags: ['design'], text: 'mai có design' }),
    line({ id: '8', at: '2026-10-13T03:00:00Z', keys: ['GW-882'], tags: ['design'], text: 'mai có design' }),
    line({ id: '9', at: '2026-10-14T03:00:00Z', keys: ['GW-901'], text: 'sbx nhắc anh' }),
  ];
  assert.deepEqual(chatHints(lines, state, '2026-10-14T00:00:00Z'), {});
});

test('tin bug nằm nhóm bug', () => {
  const out = chatHints([line({ id: '10', at: '2026-10-14T03:00:00Z', keys: ['GW-901'], tags: ['bug', 'deadline'], text: 'lỗi nút, mai fix' })], state, '2026-10-14T00:00:00Z');
  assert.equal(out['GW-901'][0].kind, 'bug');
  assert.deepEqual(out['GW-901'][0].dates, ['2026-10-15']);
});
