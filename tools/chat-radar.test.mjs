import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseConcatJson,
  topicCodes,
  topicNames,
  ticketCode,
  ticketNames,
  buildIndex,
  matchMessage,
  classify,
  shouldKeep,
  toolResults,
  renderDigest,
  runChatRadar,
} from './chat-radar.mjs';

const ME = 'tont@vng.com.vn';
const CHATS = {
  'g-nth': { topic: 'A70 | NTH | Dev Mainsite & Landing', type: 'group' },
  'g-light': { topic: 'A78 - A83 |  Light and Night | Promotion & Mainsite', type: 'group' },
  'g-cfm': { topic: '[A49 - CFM_VN] H5 Promotion', type: 'group' },
  'g-gno': { topic: '495 | GNO | Promotion', type: 'group' },
  'g-di': { topic: '[Mainsite x Promotion x PS] Dí Everything', type: 'group' },
  'dm-1': { topic: null, type: 'oneOnOne' },
};
const ISSUES = {
  'GW-912': { phase: 'coding', summary: '[A70.JUS_VN][Nghịch Thủy Hàn] [NTH] Build Landing Page – Mã May' },
  'GW-890': { phase: 'wait-test', summary: '[688][TLBBVNG] Request New H5 Event " Hồng Bao Thiên Long"' },
  'GW-723': { phase: 'closed', summary: '[495.GNOVN][Gunny Origin] Vũ Trụ Gunny' },
};
const msg = (o) => ({ id: o.id || '1', chatId: 'g-di', summary: '', createdDateTime: '2026-10-14T03:00:00.000Z', from: { displayName: 'A', email: 'a@vng.com.vn' }, ...o });

test('parseConcatJson tách chuỗi object dính liền, kể cả dấu ngoặc trong string', () => {
  assert.deepStrictEqual(parseConcatJson('{"a":"x}{y"}{"b":2}'), [{ a: 'x}{y' }, { b: 2 }]);
  assert.deepStrictEqual(parseConcatJson(''), []);
});

test('topicCodes lấy mã game ở đoạn đầu tên group', () => {
  assert.deepStrictEqual(topicCodes('A70 | NTH | Dev Mainsite & Landing'), ['A70']);
  assert.deepStrictEqual(topicCodes('A78 - A83 |  Light and Night | Promotion'), ['A78', 'A83']);
  assert.deepStrictEqual(topicCodes('[A49 - CFM_VN] H5 Promotion'), ['A49']);
  assert.deepStrictEqual(topicCodes('[Mainsite x Promotion x PS] Dí Everything'), []);
  assert.deepStrictEqual(topicCodes(null), []);
});

test('topicNames lấy tên game ở đoạn giữa', () => {
  assert.deepStrictEqual(topicNames('A70 | NTH | Dev Mainsite'), ['NTH']);
  assert.deepStrictEqual(topicNames('[A49 - CFM_VN] H5 Promotion'), ['CFM_VN']);
});

test('ticketCode + ticketNames bóc từ ngoặc vuông đầu summary', () => {
  assert.strictEqual(ticketCode(ISSUES['GW-912'].summary), 'A70');
  assert.strictEqual(ticketCode('[Mainsite] Gallery'), null);
  assert.deepStrictEqual(ticketNames(ISSUES['GW-912'].summary), ['JUS_VN', 'Nghịch Thủy Hàn', 'NTH']);
  assert.deepStrictEqual(ticketNames(ISSUES['GW-890'].summary), ['TLBBVNG']);
});

test('buildIndex chỉ lấy ticket chưa đóng, gắn group cùng mã game', () => {
  const idx = buildIndex(ISSUES, CHATS);
  assert.deepStrictEqual(Object.keys(idx.tickets).sort(), ['GW-890', 'GW-912']);
  assert.deepStrictEqual(idx.chatTickets['g-nth'], ['GW-912']);
  assert.strictEqual(idx.chatTickets['g-gno'], undefined);
  assert.strictEqual(idx.chatGame['g-gno'], 'GNO');
});

test('matchMessage: group game → ticket; Dí/1:1 → theo nội dung', () => {
  const idx = buildIndex(ISSUES, CHATS);
  assert.deepStrictEqual(matchMessage(msg({ chatId: 'g-nth', summary: 'đã thấy' }), idx, ISSUES), ['GW-912']);
  assert.deepStrictEqual(matchMessage(msg({ summary: 'bên TLBBVNG lỗi popup' }), idx, ISSUES), ['GW-890']);
  assert.deepStrictEqual(matchMessage(msg({ chatId: 'dm-1', summary: 'task NTH xong chưa' }), idx, ISSUES), ['GW-912']);
  assert.deepStrictEqual(matchMessage(msg({ summary: 'xem GW-723 giúp' }), idx, ISSUES), ['GW-723']);
  assert.deepStrictEqual(matchMessage(msg({ summary: 'đi ăn trưa không' }), idx, ISSUES), []);
  assert.deepStrictEqual(matchMessage(msg({ summary: 'MONTHLY report' }), idx, ISSUES), [], 'không khớp nửa từ');
});

test('subtask đi cùng task chính: tin nhắc mã subtask quy về task chính, index không có dòng subtask', () => {
  const issues = { ...ISSUES, 'GW-963': { parent: 'GW-890', phase: 'wait-test', summary: 'Fix design - [688][TLBBVNG] Hồng Bao' } };
  const idx = buildIndex(issues, CHATS);
  assert.strictEqual(idx.tickets['GW-963'], undefined);
  assert.deepStrictEqual(matchMessage(msg({ summary: 'GW-963 sửa giúp' }), idx, issues), ['GW-890']);
  assert.deepStrictEqual(matchMessage(msg({ summary: 'bên TLBBVNG lỗi popup' }), idx, issues), ['GW-890']);
});

test('classify gắn nhãn bug/design/deadline/mention/link', () => {
  assert.deepStrictEqual(classify('trang bị lỗi không hiện popup', 'Tố. Ngô Tất'), ['bug']);
  assert.deepStrictEqual(classify('update design mới https://www.figma.com/design/x', 'Tố. Ngô Tất'), ['design', 'link']);
  assert.deepStrictEqual(classify('gấp nha, hôm nay release', 'Tố. Ngô Tất'), ['deadline']);
  assert.deepStrictEqual(classify('Tố. Ngô Tất  check giúp', 'Tố. Ngô Tất'), ['mention']);
  assert.deepStrictEqual(classify('ok', 'Tố. Ngô Tất'), []);
  assert.deepStrictEqual(classify('vỡ layout rồi', 'Tố. Ngô Tất'), ['bug'], 'chữ có dấu ở cuối từ');
});

test('shouldKeep: bỏ tin của mình và bot; group game giữ tin có ticket; ngoài ra phải có nhãn', () => {
  const me = msg({ from: { email: ME } });
  assert.strictEqual(shouldKeep(me, ['GW-912'], ['bug'], ME), false);
  assert.strictEqual(shouldKeep(msg({ from: { displayName: 'Jira Cloud', email: null } }), [], ['mention'], ME), false);
  assert.strictEqual(shouldKeep(msg({}), ['GW-912'], [], ME), true);
  assert.strictEqual(shouldKeep(msg({}), [], ['deadline'], ME), true);
  assert.strictEqual(shouldKeep(msg({}), [], [], ME), false);
  assert.strictEqual(shouldKeep(msg({}), [], ['link'], ME), false, 'chỉ có link chưa đủ là việc');
});

test('toolResults gom kết quả theo tên tool từ stream-json', () => {
  const lines = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__claude_ai_Microsoft_365__chat_message_search' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: '{"id":"9"}{"nextOffset":25}' }] }] } },
  ].map((x) => JSON.stringify(x)).join('\n');
  assert.deepStrictEqual(toolResults(lines).messages, [{ id: '9' }]);
});

test('renderDigest nhóm theo ticket, tin chưa gắn để cuối', () => {
  const md = renderDigest('2026-10-14', [
    { id: 'r1', at: '2026-10-14T03:00:00Z', keys: ['GW-912'], tags: ['bug'], from: 'Uyên', chat: 'A70 | NTH', text: 'lỗi', url: 'u1' },
    { id: 'r2', at: '2026-10-14T03:05:00Z', keys: [], tags: ['mention'], from: 'Phú', chat: 'Dí Everything', text: 'check', url: 'u2' },
    { id: 'r3', at: '2026-10-14T03:06:00Z', keys: ['GW-884', 'GW-886'], tags: [], from: 'Mai', chat: '688 | TLBBVNG', text: 'gửi design', url: 'u3' },
    { id: 'r4', at: '2026-10-14T03:07:00Z', keys: [], game: 'GNO', tags: ['bug'], from: 'Uyên', chat: '495 | GNO', text: 'buglist', url: 'u4' },
  ]);
  assert.match(md, /## GNO[\s\S]*## GW-884, GW-886\n[^#]*gửi design[\s\S]*## GW-912[\s\S]*lỗi[\s\S]*## Chưa gắn task[\s\S]*check/);
  assert.strictEqual(md.match(/gửi design/g).length, 1, 'tin group nhiều ticket chỉ hiện 1 lần');
});

test('runChatRadar: giữ tin đúng, dời cursor, không lặp tin đã xử, báo khi có nhãn', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues: ISSUES }));
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ chatRadar: { me: ME, myName: 'Tố. Ngô Tất' } }));
  const chats = Object.entries(CHATS).map(([id, c]) => ({ id, chatType: c.type, topic: c.topic }));
  const batch = [
    msg({ id: 'm1', chatId: 'g-nth', summary: 'popup lỗi rồi', createdDateTime: '2026-10-14T03:10:00Z' }),
    msg({ id: 'm1', chatId: 'g-nth', summary: 'popup lỗi rồi', createdDateTime: '2026-10-14T03:10:00Z' }),
    msg({ id: 'm2', chatId: 'g-di', summary: 'đi ăn không', createdDateTime: '2026-10-14T03:11:00Z' }),
  ];
  const notes = [];
  const afters = [];
  const fetchChat = (after) => (afters.push(after), { ok: true, messages: batch, chats, costUsd: 0.01 });
  const now = new Date('2026-10-14T10:30:00+07:00');
  const r1 = runChatRadar({ root, now, fetchChat, notify: (t, m) => notes.push(m) });
  assert.strictEqual(r1.kept, 1);
  assert.strictEqual(notes.length, 1);
  assert.match(notes[0], /GW-912/);
  const r2 = runChatRadar({ root, now, fetchChat, notify: (t, m) => notes.push(m) });
  assert.strictEqual(r2.kept, 0, 'tin cũ không được tính lại');
  assert.strictEqual(afters[1], '2026-10-14T02:41:00.000Z', 'quét lùi 30 phút trước tin mới nhất');
  assert.strictEqual(notes.length, 1);
  assert.match(fs.readFileSync(path.join(root, 'boards', 'chat-2026-10-14.md'), 'utf8'), /popup lỗi/);
});

test('renderDigest: inbox có bản lặp vẫn chỉ ra 1 dòng mỗi id', () => {
  const item = { id: '1791952332601', at: '2026-10-14T04:32:57Z', keys: [], game: 'Light and Night', tags: [], from: 'Uyên', chat: 'A78', text: 'check', url: 'u/1791952332601' };
  const md = renderDigest('2026-10-14', [item, { ...item }]);
  assert.strictEqual(md.match(/1791952332601\)/g).length, 1);
});

const radarRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues: ISSUES }));
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ chatRadar: { me: ME, myName: 'Tố. Ngô Tất' } }));
  return root;
};
const boardOf = (root) => fs.readFileSync(path.join(root, 'boards', 'chat-2026-10-14.md'), 'utf8');
const BUG = msg({ id: 'b1', chatId: 'g-nth', summary: 'popup lỗi rồi', createdDateTime: '2026-10-14T04:32:57Z' });
const OTHER = msg({ id: 'o1', chatId: 'g-nth', summary: 'popup vỡ', createdDateTime: '2026-10-14T04:38:34Z' });

test('runChatRadar: lượt giữa search sót tin vẫn trong cửa sổ quét lùi → lượt sau không ghi lại tin đó', () => {
  const root = radarRoot();
  const now = new Date('2026-10-14T11:45:00+07:00');
  const rounds = [[BUG, OTHER], [OTHER], [BUG, OTHER]];
  const results = rounds.map((messages) => runChatRadar({ root, now, notify: () => {}, fetchChat: () => ({ ok: true, messages, chats: [] }) }));
  assert.deepStrictEqual(results.map((r) => [r.fresh, r.kept]), [[2, 2], [0, 0], [0, 0]]);
  assert.strictEqual(boardOf(root).match(/popup lỗi/g).length, 1);
});

test('runChatRadar: 2 lượt chạy chồng nhau đọc cùng cursor cũ → board không ghi trùng', () => {
  const root = radarRoot();
  const now = new Date('2026-10-14T10:44:00+07:00');
  const overlapped = () => runChatRadar({ root, now, notify: () => {}, fetchChat: () => ({ ok: true, messages: [BUG], chats: [] }) });
  runChatRadar({ root, now, notify: () => {}, fetchChat: () => (overlapped(), { ok: true, messages: [BUG], chats: [] }) });
  assert.strictEqual(boardOf(root).match(/popup lỗi/g).length, 1);
});

test('runChatRadar ngoài giờ thì bỏ lượt, không gọi fetch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  let called = false;
  const r = runChatRadar({ root, now: new Date('2026-10-18T10:00:00+07:00'), fetchChat: () => (called = true) });
  assert.strictEqual(r.skipped, 'off-day');
  assert.strictEqual(called, false);
});
