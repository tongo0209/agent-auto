import { test } from 'node:test';
import assert from 'node:assert';
import {
  extractSheetLinks,
  looksLikeBugSheet,
  matchSheetToTicket,
  normalizeCell,
  parseBugTable,
  rowHash,
  diffRows,
  classifyBug,
  isSettled,
  summarize,
  prefilterMine,
  updateHeat,
  pickPrompt,
  checkGates,
  mergeWatch,
} from './bug-radar.mjs';

/**
 * Mẫu chép NGUYÊN VĂN từ Drive read_file_content của sheet thật
 * "BugList CFL: H5 Rừng Thu Kỳ Bí" (17/8/2026) — kể cả `\[merged\]`, dấu escape `\-\>`,
 * header lặp 2 lần, và 69 dòng trống chỉ có BugID.
 */
const REAL_SHEET = `|  |  |  |  |  |  |  |  |  |  |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| \\[merged\\] H5 Bí Mật của Wu Mengmeng | \\[merged\\] H5 Bí Mật của Wu Mengmeng | \\[merged\\] H5 Bí Mật của Wu Mengmeng | \\[merged\\] H5 Bí Mật của Wu Mengmeng | \\[merged\\] H5 Bí Mật của Wu Mengmeng | \\[merged\\] H5 Bí Mật của Wu Mengmeng | \\[merged\\] H5 Bí Mật của Wu Mengmeng | \\[merged\\] H5 Bí Mật của Wu Mengmeng | \\[merged\\] H5 Bí Mật của Wu Mengmeng | \\[merged\\]  |
| \\[merged\\] BugID | \\[merged\\] Assignee Fix | \\[merged\\] Description | \\[merged\\] Image | \\[merged\\] Comment Thread  (cột này để QC-Dev và GS trao đổi nhanh) | \\[merged\\] Reporter | \\[merged\\] DEV Check Status | \\[merged\\] Notes | \\[merged\\] QC / GS Recheck | \\[merged\\] Bug Type |
| \\[merged\\] BugID | \\[merged\\] Assignee Fix | \\[merged\\] Description | \\[merged\\] Image | \\[merged\\] Comment Thread  (cột này để QC-Dev và GS trao đổi nhanh) | \\[merged\\] Reporter | \\[merged\\] DEV Check Status | \\[merged\\] Notes | \\[merged\\] QC / GS Recheck | \\[merged\\] Bug Type |
| 1 | Promotion | Giảm size text để không bị bể layout như hình.  Mong muốn: Giảm từ 64px -\\> 50px |  |  | minhnq8 |  |  |  | Content |
| 2 | GameStudio | \\[Pop-up Thể Lệ\\] Ngày bắt đầu chạy event thực tế chưa đúng so với hiện tại, cần GS tự update lại nội dung event |  |  | minhnq8 |  |  |  | Content |
| 3 | Mainsite | Pop-up Nhiệm Vụ bị bể layout ở title |  |  | minhnq8 |  |  |  | Visual |
| 4 |  |  |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |  |  |

|  |  |  |
| :-: | :-: | :-: |
| ID | meiochan03939@gmail.com | meichen220498@gmail.com |
| RoleID | 1449674790 | 1704875616 |`;


test('bóc sheetId từ description Jira, bỏ trùng, giữ thứ tự', () => {
  const text = `**BUGLIST:** https://docs.google.com/spreadsheets/d/1XFJ-8m6FnWWx21XLnNuBurEpv33TavFZG6V86Iz5j-w/edit?gid=0#gid=0
  lặp lại https://docs.google.com/spreadsheets/d/1XFJ-8m6FnWWx21XLnNuBurEpv33TavFZG6V86Iz5j-w/edit
  và https://docs.google.com/spreadsheets/d/1DlEuaemEGmXpc95Ue0j5GmMPjdzYFrwlzx6Zz7V0ejw/edit`;
  assert.deepEqual(
    extractSheetLinks(text).map((s) => s.sheetId),
    ['1XFJ-8m6FnWWx21XLnNuBurEpv33TavFZG6V86Iz5j-w', '1DlEuaemEGmXpc95Ue0j5GmMPjdzYFrwlzx6Zz7V0ejw'],
  );
});

test('không nhận nhầm link Google Doc / Drive folder thành buglist', () => {
  const text = `https://docs.google.com/document/d/1abcDEF_ghijklmnopqrstuvwxyz012345/edit
  https://drive.google.com/drive/folders/12Ff3XtiV9-SOK1ml0aqnxos3PbYCnhkQ`;
  assert.deepEqual(extractSheetLinks(text), []);
});

test('sheetId ngắn bất thường bị bỏ — tránh bắt rác từ text QC dán lỗi', () => {
  assert.deepEqual(extractSheetLinks('docs.google.com/spreadsheets/d/abc123/edit'), []);
});


test('parse đúng 3 bug thật, bỏ 2 dòng trống chỉ có BugID', () => {
  const rows = parseBugTable(REAL_SHEET);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.bugId),
    ['1', '2', '3'],
  );
});

test('gỡ [merged] và dấu escape markdown khỏi nội dung ô', () => {
  const rows = parseBugTable(REAL_SHEET);
  assert.equal(rows[0].desc, 'Giảm size text để không bị bể layout như hình. Mong muốn: Giảm từ 64px -> 50px');
  assert.ok(rows[1].desc.startsWith('[Pop-up Thể Lệ]'));
});

test('map đúng cột theo TÊN header, không theo vị trí', () => {
  const [bug1, , bug3] = parseBugTable(REAL_SHEET);
  assert.equal(bug1.assignee, 'Promotion');
  assert.equal(bug1.type, 'Content');
  assert.equal(bug1.reporter, 'minhnq8');
  assert.equal(bug1.devStatus, '');
  assert.equal(bug3.type, 'Visual');
});

test('header lặp 2 lần không sinh bug trùng', () => {
  const ids = parseBugTable(REAL_SHEET).map((r) => r.bugId);
  assert.equal(new Set(ids).size, ids.length);
});

test('bảng thứ hai (Accounts) không có cột BugID nên bị bỏ qua hoàn toàn', () => {
  const rows = parseBugTable(REAL_SHEET);
  assert.ok(!rows.some((r) => r.desc.includes('@gmail.com')));
});

test('cột đổi thứ tự vẫn parse đúng — QC hay chèn cột', () => {
  const shuffled = `| Bug Type | BugID | Description | Assignee Fix | DEV Check Status |
| :-: | :-: | :-: | :-: | :-: |
| Functional | 7 | Nút nhận thưởng bấm không ăn | Promotion | |`;
  assert.deepEqual(parseBugTable(shuffled), [
    {
      bugId: '7',
      assignee: 'Promotion',
      desc: 'Nút nhận thưởng bấm không ăn',
      image: '',
      reporter: '',
      devStatus: '',
      notes: '',
      recheck: '',
      type: 'Functional',
    },
  ]);
});

test('normalizeCell gộp khoảng trắng và xuống dòng của ô nhiều dòng', () => {
  assert.equal(normalizeCell('  Giảm   từ 64px\n\n-> 50px '), 'Giảm từ 64px -> 50px');
});


test('hash ổn định khi chỉ khác khoảng trắng/hoa thường', () => {
  const a = { bugId: '1', desc: 'Bể  layout', devStatus: '', recheck: '', assignee: 'Promotion', type: 'Visual' };
  const b = { bugId: '1', desc: 'bể layout', devStatus: '', recheck: '', assignee: 'promotion', type: 'visual' };
  assert.equal(rowHash(a), rowHash(b));
});

test('hash đổi khi QC sửa mô tả', () => {
  const a = { bugId: '1', desc: 'Bể layout' };
  assert.notEqual(rowHash(a), rowHash({ ...a, desc: 'Bể layout ở mobile' }));
});

test('lượt đầu: mọi bug đều MỚI', () => {
  const rows = parseBugTable(REAL_SHEET);
  const d = diffRows({}, rows);
  assert.equal(d.fresh.length, 3);
  assert.equal(d.changed.length, 0);
});

test('lượt sau không đổi gì: không có việc để làm', () => {
  const rows = parseBugTable(REAL_SHEET);
  const seen = diffRows({}, rows).next;
  const d = diffRows(seen, rows);
  assert.deepEqual(d.actionable, []);
});

test('QC thêm bug mới giữa chừng: chỉ bug đó là MỚI', () => {
  const rows = parseBugTable(REAL_SHEET);
  const seen = diffRows({}, rows).next;
  const added = [...rows, { bugId: '4', desc: 'Ảnh banner vỡ', assignee: 'Promotion', type: 'Visual', recheck: '' }];
  const d = diffRows(seen, added);
  assert.deepEqual(
    d.fresh.map((r) => r.bugId),
    ['4'],
  );
});

test('QC trả Failed ở cột recheck ⇒ tính là REOPEN, không phải bug mới', () => {
  const base = { bugId: '1', desc: 'Bể layout', assignee: 'Promotion', type: 'Visual', devStatus: 'Done', recheck: '' };
  const seen = diffRows({}, [base]).next;
  const d = diffRows(seen, [{ ...base, recheck: 'Failed - vẫn còn lỗi' }]);
  assert.equal(d.fresh.length, 0);
  assert.equal(d.reopened.length, 1);
  assert.equal(d.actionable.length, 1);
});

test('seenBugs cũ của bug đã biến mất khỏi sheet vẫn được giữ, không làm nó thành MỚI lần sau', () => {
  const seen = { 1: 'abc', 2: 'def' };
  const d = diffRows(seen, [{ bugId: '2', desc: 'x' }]);
  assert.ok(d.next['1'] === 'abc');
});


test('bug Functional/Performance/Visual = của mình ở mọi vùng', () => {
  for (const type of ['Functional', 'Performance', 'Visual', 'visual - CSS']) {
    assert.equal(classifyBug({ assignee: 'Promotion', type }), 'mine', type);
    assert.equal(classifyBug({ assignee: 'Mainsite', type }), 'mine', type);
  }
});

test('content chỉ nhận ở mainsite, content promotion thì bỏ', () => {
  assert.equal(classifyBug({ assignee: 'Mainsite', type: 'Content' }), 'mine');
  assert.equal(classifyBug({ assignee: 'Promotion', type: 'Content' }), 'not-mine');
});

test('GameStudio giữ quyền phủ quyết, kể cả bug code', () => {
  assert.equal(classifyBug({ assignee: 'GameStudio', type: 'Functional' }), 'not-mine');
  assert.equal(classifyBug({ assignee: 'GS', type: 'Visual' }), 'not-mine');
});

test('bug chưa gắn Bug Type ⇒ unknown, KHÔNG tự nhận là của mình', () => {
  assert.equal(classifyBug({ assignee: 'Promotion', type: '' }), 'unknown');
});

test('prefilter chia đúng 3 rổ trên sheet thật', () => {
  const b = prefilterMine(parseBugTable(REAL_SHEET));
  assert.deepEqual(
    b.mine.map((r) => r.bugId),
    ['3'],
  );
  assert.deepEqual(
    b.notMine.map((r) => r.bugId),
    ['1', '2'],
  );
});


const T = (h, m = 0) => new Date(2026, 7, 17, h, m);

test('sheet vừa đổi ⇒ nóng', () => {
  const e = updateHeat({ modifiedTime: 'A' }, 'B', T(10));
  assert.equal(e.heat, 'hot');
  assert.equal(e.changed, true);
});

test('3h không đổi ⇒ nguội lại', () => {
  const hot = updateHeat({ modifiedTime: 'A' }, 'B', T(10));
  const later = updateHeat(hot, 'B', T(13, 1));
  assert.equal(later.heat, 'warm');
  assert.equal(later.changed, false);
});

test('chưa tới 3h thì vẫn giữ nóng dù lượt này không đổi', () => {
  const hot = updateHeat({ modifiedTime: 'A' }, 'B', T(10));
  assert.equal(updateHeat(hot, 'B', T(12, 30)).heat, 'hot');
});

test('sheet chưa từng đổi lần nào ⇒ nguội, không nóng oan lượt đầu', () => {
  assert.equal(updateHeat({}, null, T(10)).heat, 'warm');
});

test('mốc modifiedTime luôn được ghi lại để lượt sau so', () => {
  assert.equal(updateHeat({ modifiedTime: 'A' }, 'B', T(10)).modifiedTime, 'B');
});


test('đầu giờ luôn chạy lượt delta đầy đủ', () => {
  assert.deepEqual(pickPrompt({ bugWatch: {} }, T(9, 5)), { prompt: '/daily delta', why: 'full' });
});

test('nửa giờ + có sheet nóng ⇒ lượt bugwatch nhẹ', () => {
  const state = { bugWatch: { s1: { heat: 'hot' } } };
  assert.deepEqual(pickPrompt(state, T(9, 35)), { prompt: '/daily bugwatch', why: 'hot' });
});

test('nửa giờ + không sheet nào nóng ⇒ bỏ lượt, KHÔNG đốt token', () => {
  const state = { bugWatch: { s1: { heat: 'warm' } } };
  assert.deepEqual(pickPrompt(state, T(9, 35)), { skip: 'cold' });
});

test('tắt bugRadar thì lượt nửa giờ im hẳn dù sheet đang nóng', () => {
  const state = { bugWatch: { s1: { heat: 'hot' } } };
  assert.deepEqual(pickPrompt(state, T(9, 35), { enabled: false }), { skip: 'bugradar-off' });
});


const OK = { assigneeIsMe: true, pathsConfirmed: true, sheetReadable: true, mineCount: 2 };

test('đủ 4 cổng ⇒ được tự fix', () => {
  assert.equal(checkGates(OK).pass, true);
});

test('task đã sang người khác ⇒ chặn, nêu đúng lý do', () => {
  const r = checkGates({ ...OK, assigneeIsMe: false });
  assert.equal(r.pass, false);
  assert.deepEqual(r.failed, ['g1']);
  assert.match(r.why, /assignee/);
});

test('không có bug nào của mình ⇒ chặn ở G4', () => {
  assert.deepEqual(checkGates({ ...OK, mineCount: 0 }).failed, ['g4']);
});

test('rớt nhiều cổng thì báo hết, không dừng ở cổng đầu', () => {
  assert.deepEqual(checkGates({}).failed, ['g1', 'g2', 'g3', 'g4']);
});


test('sheet mới được thêm kèm ticket, sheet cũ giữ nguyên seenBugs', () => {
  const before = { s1: { url: 'u1', keys: ['GW-1'], seenBugs: { 1: 'h' }, heat: 'hot' } };
  const after = mergeWatch(before, [
    { sheetId: 's1', url: 'u1', key: 'GW-2' },
    { sheetId: 's2', url: 'u2', key: 'GW-3', title: 'BugList X' },
  ]);
  assert.deepEqual(after.s1.keys, ['GW-1', 'GW-2']);
  assert.deepEqual(after.s1.seenBugs, { 1: 'h' });
  assert.equal(after.s2.title, 'BugList X');
  assert.equal(after.s2.heat, 'warm');
});

test('cùng ticket gặp lại sheet cũ không nhân đôi key', () => {
  const after = mergeWatch({}, [
    { sheetId: 's1', url: 'u', key: 'GW-1' },
    { sheetId: 's1', url: 'u', key: 'GW-1' },
  ]);
  assert.deepEqual(after.s1.keys, ['GW-1']);
});

test('mergeWatch không sửa object gốc', () => {
  const before = { s1: { keys: ['GW-1'] } };
  mergeWatch(before, [{ sheetId: 's1', key: 'GW-9' }]);
  assert.deepEqual(before.s1.keys, ['GW-1']);
});

const GNOTH_SHEET = `| BugID | Assignee | Frame | Description | Image | Comment Thread | Reporter | Dev Check Status | Evidence | QC / GS Check | Bug Type |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 2 | Promotion | FRAME 2 | Change the text to Thai language |  |  | nattakornb | Done |  | Confirmed fix |  |
| 5 | Promotion | FRAME 2 | Adjust the text ประวิติ to รับหมุนฟรี |  |  | nattakornb |  |  | Confirmed fix |  |
| 16 | Mainsite | FRAME 3 | Rank, Character Name không hiện |  |  | nattakornb | Skip |  | Skip |  |
| 22 | Mainsite | FRAME 2 | Change the text to Thai language |  |  | nattakornb |  |  |  |  |`;

test('sheet GNOTH có schema KHÁC (Assignee, Frame, Evidence, QC / GS Check) vẫn parse đủ 4 dòng', () => {
  assert.deepEqual(
    parseBugTable(GNOTH_SHEET).map((r) => r.bugId),
    ['2', '5', '16', '22'],
  );
});

test('cột "QC / GS Check" map đúng vào recheck — thiếu map này là mất hẳn khả năng bắt reopen', () => {
  const [bug2] = parseBugTable(GNOTH_SHEET);
  assert.equal(bug2.recheck, 'Confirmed fix');
  assert.equal(bug2.devStatus, 'Done');
  assert.equal(bug2.assignee, 'Promotion');
});

test('bug đã Done + QC confirm ⇒ đã xong, không nã lại vào bug-fixer-lite', () => {
  assert.equal(isSettled({ devStatus: 'Done', recheck: 'Confirmed fix' }), true);
});

test('QC confirm dù dev để trống vẫn là đã xong — ca thật bug 5 sheet GNOTH', () => {
  assert.equal(isSettled({ devStatus: '', recheck: 'Confirmed fix' }), true);
});

test('Skip ở bất kỳ cột nào ⇒ QC đã quyết bỏ, không phải việc phải fix', () => {
  assert.equal(isSettled({ devStatus: 'Skip', recheck: 'Skip' }), true);
  assert.equal(isSettled({ devStatus: '', recheck: 'N/A' }), true);
});

test('recheck báo Failed thắng mọi dấu hiệu đã xong', () => {
  assert.equal(isSettled({ devStatus: 'Done', recheck: 'Failed - vẫn còn lỗi' }), false);
});

test('hai cột trống ⇒ bug còn mở', () => {
  assert.equal(isSettled({ devStatus: '', recheck: '' }), false);
});

test('summarize lọc hết bug đã xong, chỉ giao phần còn mở', () => {
  const s = summarize({}, GNOTH_SHEET);
  assert.equal(s.rowsTotal, 4);
  assert.equal(s.settled, 3);
  assert.equal(s.toSkill, 1);
});

test('Bug Type để trống (19/23 dòng sheet thật) vẫn phải vào rổ giao skill, không được nuốt', () => {
  const s = summarize({}, GNOTH_SHEET);
  assert.deepEqual(
    s.unknown.map((r) => r.bugId),
    ['22'],
  );
  assert.equal(s.mine.length, 0);
  assert.equal(s.toSkill, 1);
});

test('sheet có cột BugID ⇒ đúng là buglist', () => {
  assert.equal(looksLikeBugSheet(REAL_SHEET), true);
  assert.equal(looksLikeBugSheet(GNOTH_SHEET), true);
});

test('file brief bị dán nhầm chỗ link buglist ⇒ nhận ra và loại — ca thật GW-629, GW-723', () => {
  const brief = `| STT | Hạng mục | Mô tả | Ghi chú |
| :-: | :-: | :-: | :-: |
| 1 | Frame 1 | Header | |`;
  assert.equal(looksLikeBugSheet(brief), false);
  assert.equal(summarize({}, brief).toSkill, 0);
});

test('sheet rỗng hoàn toàn không làm vỡ luồng', () => {
  assert.equal(looksLikeBugSheet(''), false);
  assert.equal(summarize({}, '').rowsTotal, 0);
});

const TICKETS = [
  { key: 'GW-610', summary: '[496][GNOTH] Chengdu Tournament Web Event 2026' },
  { key: 'GW-660', summary: '[A49][CFM] H5 Rừng Thu Kỳ Bí' },
  { key: 'GW-679', summary: 'FIX - [A78][LAN] Mainsite Thất Tịch 030826' },
  { key: 'GW-578', summary: '[661][PTG] Fix bug Brand Partners' },
];

test('ghép sheet Drive về đúng ticket dù ticket KHÔNG có link — ca thật GW-610', () => {
  assert.equal(matchSheetToTicket('BugList GNOTH: Chengdu Tournament Web', TICKETS).key, 'GW-610');
});

test('ghép đúng khi mã game trong sheet khác mã trong ticket (CFL vs CFM)', () => {
  assert.equal(matchSheetToTicket('BugList CFL: H5 Rừng Thu Kỳ Bí', TICKETS).key, 'GW-660');
});

test('ghép được cả khi ticket có tiền tố FIX và đuôi ngày', () => {
  assert.equal(matchSheetToTicket('BugList LightAndNight: Mainsite Thất Tịch', TICKETS).key, 'GW-679');
});

test('sheet lạ không ép ghép bừa vào ticket nào', () => {
  assert.equal(matchSheetToTicket('BugList XYZ: Sự kiện chưa từng có', TICKETS), null);
});

test('từ chung chung (bug, list, web, event, mainsite) không được tự tạo điểm khớp', () => {
  assert.equal(matchSheetToTicket('Bug List Web Event', TICKETS), null);
});

test('sheet mới phát hiện nhưng sửa lần cuối từ lâu ⇒ NGUỘI ngay, không chạy dày vô ích', () => {
  const e = updateHeat({}, '2026-07-25T03:00:00.000Z', T(10));
  assert.equal(e.heat, 'warm');
  assert.equal(e.changed, true);
});

test('sheet mới phát hiện mà QC vừa sửa xong ⇒ NÓNG ngay lượt đầu', () => {
  const e = updateHeat({}, new Date(2026, 7, 17, 9, 30).toISOString(), T(10));
  assert.equal(e.heat, 'hot');
});
