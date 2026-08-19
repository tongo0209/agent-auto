import { test } from 'node:test';
import assert from 'node:assert';
import {
  bugStatus,
  openBySheet,
  followSheet,
  unfollowSheet,
  statusReadable,
  openRows,
  countOpen,
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
  firstScanMode,
  shouldRetire,
  lastMilestone,
  pickPrompt,
  checkGates,
  gradeFix,
  countPending,
  queueRow,
  mergeWatch,
  isWatched,
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
  const state = { bugWatch: { s1: { follow: true, heat: 'hot' } } };
  assert.deepEqual(pickPrompt(state, T(9, 35)), { prompt: '/daily bugwatch', why: 'hot' });
});

test('nửa giờ + không sheet nóng + vừa poll xong ⇒ bỏ lượt, KHÔNG đốt token', () => {
  const state = {
    bugWatch: { s1: { follow: true, heat: 'warm', lastPollAt: new Date(Number(T(9, 35)) - 3.6e5).toISOString() } },
  };
  assert.deepEqual(pickPrompt(state, T(9, 35)), { skip: 'cold' });
});

test('sheet nguội mà lâu chưa poll thì KHÔNG được bỏ lượt — đó là cách radar tự tỉnh lại', () => {
  const state = { bugWatch: { s1: { follow: true, heat: 'warm' } } };
  assert.deepEqual(pickPrompt(state, T(9, 35)), { prompt: '/daily bugwatch', why: 'stale' });
});

test('tắt bugRadar thì lượt nửa giờ im hẳn dù sheet đang nóng', () => {
  const state = { bugWatch: { s1: { follow: true, heat: 'hot' } } };
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

test('lượt quét ĐẦU trên sheet cũ ⇒ chỉ gieo nền, KHÔNG nã bug tháng trước vào fix — ca thật GW-679', () => {
  const stale = { seenBugs: {}, modifiedTime: '2026-07-27T03:00:00.000Z' };
  assert.equal(firstScanMode(stale, T(10)), 'seed');
});

test('lượt quét đầu trên sheet QC vừa động hôm nay ⇒ xử lý ngay', () => {
  const fresh = { seenBugs: {}, modifiedTime: new Date(2026, 7, 17, 2).toISOString() };
  assert.equal(firstScanMode(fresh, T(10)), 'act');
});

test('đã có nền rồi thì mọi lượt sau đều xử lý bình thường', () => {
  const seeded = { seenBugs: { 1: 'h' }, modifiedTime: '2026-01-01T00:00:00.000Z' };
  assert.equal(firstScanMode(seeded, T(10)), 'act');
});

test('sheet chưa biết mốc sửa ⇒ gieo nền cho chắc, không đoán', () => {
  assert.equal(firstScanMode({ seenBugs: {} }, T(10)), 'seed');
});

const ISSUES = {
  'GW-660': { milestones: { design: '2026-07-27', html: '2026-08-03', release: '2026-08-26' } },
  'GW-578': { milestones: { html: '2026-07-10', test: '2026-07-14', release: '2026-07-15' } },
  'GW-999': {},
};

test('task đã qua release ⇒ thôi theo dõi buglist', () => {
  assert.equal(shouldRetire({ keys: ['GW-578'] }, ISSUES, T(10)), true);
});

test('task chưa tới release ⇒ vẫn theo dõi', () => {
  assert.equal(shouldRetire({ keys: ['GW-660'] }, ISSUES, T(10)), false);
});

test('ĐÚNG ngày release vẫn còn theo dõi — bug hay về đúng hôm đó', () => {
  const issues = { 'GW-1': { milestones: { release: '2026-08-17' } } };
  assert.equal(shouldRetire({ keys: ['GW-1'] }, issues, T(10)), false);
});

test('sheet dùng chung nhiều ticket: chỉ nghỉ khi TẤT CẢ đã qua release', () => {
  assert.equal(shouldRetire({ keys: ['GW-578', 'GW-660'] }, ISSUES, T(10)), false);
});

test('không biết mốc nào ⇒ cứ theo dõi tiếp, không tự ý bỏ', () => {
  assert.equal(shouldRetire({ keys: ['GW-999'] }, ISSUES, T(10)), false);
  assert.equal(shouldRetire({ keys: ['GW-chưa-có'] }, ISSUES, T(10)), false);
  assert.equal(shouldRetire({ keys: [] }, ISSUES, T(10)), false);
});

test('mốc muộn nhất mới là mốc chốt, kể cả khi nằm sau release', () => {
  const issues = { 'GW-2': { milestones: { release: '2026-08-10', bugfix: '2026-08-30', _note: 'bỏ qua' } } };
  assert.equal(lastMilestone(issues['GW-2'].milestones), '2026-08-30');
  assert.equal(shouldRetire({ keys: ['GW-2'] }, issues, T(10)), false);
});

const FULL = { buildOk: true, liveMatch: true, hasQcImage: true, repro: true };

test('đủ bằng chứng máy ⇒ verified', () => {
  assert.equal(gradeFix(FULL).grade, 'verified');
  assert.equal(gradeFix({ ...FULL, repro: false }).grade, 'verified');
  assert.equal(gradeFix({ ...FULL, hasQcImage: false }).grade, 'verified');
});

test('thiếu từng mảnh bằng chứng ⇒ unverified kèm lý do phân biệt được', () => {
  assert.equal(gradeFix({ ...FULL, buildOk: false }).why, 'build-failed');
  assert.equal(gradeFix({ ...FULL, buildOk: undefined }).why, 'build-not-run');
  assert.equal(gradeFix({ ...FULL, liveMatch: false }).why, 'live-mismatch');
  assert.equal(gradeFix({ ...FULL, liveMatch: undefined }).why, 'live-not-checked');
  assert.equal(gradeFix({ ...FULL, hasQcImage: false, repro: false }).why, 'no-evidence');
  assert.equal(gradeFix({}).grade, 'unverified');
});

test('mọi lý do unverified đều có nhãn tiếng Việt để console và popup khỏi tự chế', () => {
  const cases = [{ buildOk: false }, {}, { buildOk: true, liveMatch: false }, { buildOk: true }, { ...FULL, hasQcImage: false, repro: false }];
  for (const c of cases) assert.ok(gradeFix(c).whyLabel, `thiếu nhãn cho ${JSON.stringify(c)}`);
  assert.equal(gradeFix(FULL).whyLabel, null);
});

test('xếp hàng: chấm điểm ngay lúc ghi, không để lúc đọc mới đoán', () => {
  const entry = queueRow({}, { bugId: '3', evidence: FULL }, T(1));
  assert.equal(entry.pendingSheetWrite.length, 1);
  assert.equal(entry.pendingSheetWrite[0].grade, 'verified');
  assert.equal(entry.pendingSheetWrite[0].queuedAt, T(1).toISOString());
});

test('xếp hàng lại cùng bugId ⇒ THAY dòng cũ, không đẻ bản trùng', () => {
  const once = queueRow({}, { bugId: '3', evidence: {} }, T(1));
  const twice = queueRow(once, { bugId: '3', evidence: FULL }, T(2));
  assert.equal(twice.pendingSheetWrite.length, 1);
  assert.equal(twice.pendingSheetWrite[0].grade, 'verified');
});

test('đếm hàng chờ tách theo grade — đây là thứ radar-tick so trước/sau để quyết báo', () => {
  const state = {
    bugWatch: {
      a: { pendingSheetWrite: [{ bugId: '1', grade: 'verified' }, { bugId: '2', grade: 'unverified' }] },
      b: { pendingSheetWrite: [{ bugId: '9', grade: 'verified' }] },
      c: {},
    },
  };
  assert.deepEqual(countPending(state), { total: 3, verified: 2, unverified: 1 });
  assert.deepEqual(countPending({}), { total: 0, verified: 0, unverified: 0 });
});

test('sheet bình thường thì còn trong vòng theo dõi', () => {
  assert.equal(isWatched({ follow: true, keys: ['GW-660'] }), true);
});

test('ba kiểu rơi khỏi vòng poll: qua mốc, không phải buglist, chưa bật follow', () => {
  assert.equal(isWatched({ follow: true, retired: true }), false);
  assert.equal(isWatched({ follow: true, notBugSheet: true }), false);
  assert.equal(isWatched({ follow: false }), false);
});

test('user tắt theo dõi tay thì có mốc thời gian và lý do để sau còn đọc lại', () => {
  const entry = unfollowSheet({ keys: [], follow: true }, 'sheet mồ côi, QC không dùng nữa', T(10));
  assert.equal(entry.follow, false);
  assert.equal(entry.unfollowReason, 'sheet mồ côi, QC không dùng nữa');
  assert.equal(entry.unfollowedAt, T(10).toISOString());
});

test('bật lại theo dõi thì xoá sạch cờ tắt, giữ nguyên bug đã thấy', () => {
  const entry = followSheet(unfollowSheet({ seenBugs: { 3: 'h' } }, 'nhầm', T(10)), T(10));
  assert.equal(entry.follow, true);
  assert.equal(entry.unfollowedAt, undefined);
  assert.equal(entry.unfollowReason, undefined);
  assert.deepEqual(entry.seenBugs, { 3: 'h' });
});

test('sheet đã tắt theo dõi dù đang nóng cũng KHÔNG kéo được lượt bugwatch', () => {
  const state = { bugWatch: { s1: { heat: 'hot', follow: false } } };
  assert.deepEqual(pickPrompt(state, T(9, 35)), { skip: 'cold' });
});

// ---------- bug ĐANG MỞ: cái mà console và popup cần mà trước giờ không ai lưu ----------

const row = (o) => ({ bugId: '1', type: 'functional', assignee: 'Mainsite', desc: 'nút chết', ...o });

test('bug đang mở gồm CẢ dòng không đổi từ lượt trước — đây là chỗ diffRows bỏ sót', () => {
  const rows = [row({ bugId: '1' }), row({ bugId: '2' })];
  const seen = { 1: rowHash(rows[0]), 2: rowHash(rows[1]) };
  assert.deepEqual(diffRows(seen, rows).actionable, []);
  assert.deepEqual(
    openRows(rows).map((r) => r.bugId),
    ['1', '2'],
  );
});

test('chỉ QC xác nhận mới rơi khỏi danh sách; dev ghi Done vẫn còn treo chờ confirm', () => {
  const rows = [
    row({ bugId: '1', recheck: 'Confirmed' }),
    row({ bugId: '2', devStatus: 'Done' }),
    row({ bugId: '3' }),
  ];
  assert.deepEqual(
    openRows(rows).map((r) => [r.bugId, r.status]),
    [
      ['2', 'cho-confirm'],
      ['3', 'chua-fix'],
    ],
  );
});

test('dòng QC mở lại thì vẫn mở dù dev ghi done', () => {
  const rows = [row({ bugId: '1', devStatus: 'Done', recheck: 'Reopen' })];
  assert.deepEqual(
    openRows(rows).map((r) => r.bugId),
    ['1'],
  );
});

test('mỗi bug mở mang sẵn nhãn của ai, để console khỏi phải đoán lại', () => {
  const open = openRows([
    row({ bugId: '1', type: 'functional' }),
    row({ bugId: '2', assignee: 'Game Studio' }),
    row({ bugId: '3', type: 'gì đó lạ', assignee: '' }),
  ]);
  assert.deepEqual(
    open.map((r) => [r.bugId, r.bucket]),
    [
      ['1', 'mine'],
      ['2', 'not-mine'],
      ['3', 'unknown'],
    ],
  );
});

test('summarize trả kèm danh sách bug đang mở', () => {
  const found = summarize({}, REAL_SHEET);
  assert.equal(Array.isArray(found.open), true);
  assert.equal(
    found.open.every((r) => r.bugId && r.bucket),
    true,
  );
});

test('đếm bug đang mở: chỉ tính sheet còn theo dõi', () => {
  const fresh = new Date().toISOString();
  const state = {
    bugWatch: {
      a: { follow: true, openBugsAt: fresh, openBugs: [{ bugId: '1', bucket: 'mine' }, { bugId: '2', bucket: 'unknown' }] },
      b: { follow: true, openBugsAt: fresh, openBugs: [{ bugId: '9', bucket: 'not-mine' }] },
      c: { retired: true, openBugsAt: fresh, openBugs: [{ bugId: '7', bucket: 'mine' }] },
      d: { follow: false, openBugsAt: fresh, openBugs: [{ bugId: '8', bucket: 'mine' }] },
    },
  };
  assert.deepEqual(countOpen(state), { total: 3, chuaFix: 3, choConfirm: 0, mine: 1, unknown: 1, notMine: 1 });
});

test('state chưa có openBugs thì đếm ra 0, không nổ', () => {
  assert.deepEqual(countOpen({ bugWatch: { a: { follow: true, seenBugs: { 1: 'h' } } } }), {
    total: 0,
    chuaFix: 0,
    choConfirm: 0,
    mine: 0,
    unknown: 0,
    notMine: 0,
  });
});

// ---------- vòng khoá chết: hot chỉ được đặt trong bugwatch, mà bugwatch lại đòi hot ----------

const at45 = (h) => new Date(2026, 7, 18, h, 45);
const hoursAgo = (n, from = at45(14)) => new Date(Number(from) - n * 3.6e6).toISOString();

test('sheet lâu chưa poll thì tự tới lượt bugwatch, không cần ai đặt hot', () => {
  const state = { bugWatch: { s1: { follow: true, lastPollAt: hoursAgo(5) } } };
  assert.deepEqual(pickPrompt(state, at45(14)), { prompt: '/daily bugwatch', why: 'stale' });
});

test('vừa poll xong thì thôi, đừng đọc lại cho tốn tiền', () => {
  const state = { bugWatch: { s1: { follow: true, lastPollAt: hoursAgo(1) } } };
  assert.deepEqual(pickPrompt(state, at45(14)), { skip: 'cold' });
});

test('sheet chưa poll lần nào là tới lượt ngay', () => {
  assert.deepEqual(pickPrompt({ bugWatch: { s1: { follow: true, title: 'mới thêm' } } }, at45(14)), {
    prompt: '/daily bugwatch',
    why: 'stale',
  });
});

test('sheet đã thôi theo dõi thì có cũ mấy cũng không kéo bugwatch dậy', () => {
  const state = {
    bugWatch: {
      s1: { follow: true, retired: true, lastPollAt: hoursAgo(99) },
      s2: { follow: false, lastPollAt: hoursAgo(99) },
      s3: { follow: true, notBugSheet: true, lastPollAt: hoursAgo(99) },
    },
  };
  assert.deepEqual(pickPrompt(state, at45(14)), { skip: 'cold' });
});

test('hot vẫn thắng: sheet vừa đổi thì đọc ngay chứ không đợi hết chu kỳ', () => {
  const state = { bugWatch: { s1: { follow: true, heat: 'hot', lastPollAt: hoursAgo(1) } } };
  assert.deepEqual(pickPrompt(state, at45(14)), { prompt: '/daily bugwatch', why: 'hot' });
});

test('tắt bugRadar thì im hoàn toàn, kể cả sheet cũ mèm', () => {
  const state = { bugWatch: { s1: { follow: true, lastPollAt: hoursAgo(99) } } };
  assert.deepEqual(pickPrompt(state, at45(14), { enabled: false }), { skip: 'bugradar-off' });
});

// ---------- sheet thiếu cột trạng thái: KHÔNG được coi là bug đang mở ----------

const SHEET_OK = `| BugID | Assignee Fix | Description | DEV Check Status | QC / GS Recheck | Bug Type |
| :-: | :-: | :-: | :-: | :-: | :-: |
| 1 | Mainsite | nút chết | Done | Confirmed fix | Functional |
| 2 | Mainsite | chữ tràn |  |  | Visual |
`;

const SHEET_NO_STATUS = `| BugID | Device | Assignee Fix | Description |  | Notes | Bug Type |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 1 | PC | Mainsite | đổi text EN |  |  |  |
| 2 | PC | Mainsite | đổi banner |  |  |  |
`;

test('sheet có cột DEV Check Status thì đọc được trạng thái', () => {
  assert.equal(statusReadable(SHEET_OK), true);
});

test('sheet để TRỐNG header cột trạng thái thì không đọc được, không dám phán', () => {
  assert.equal(statusReadable(SHEET_NO_STATUS), false);
});

test('không đọc được trạng thái thì báo 0 bug mở, KHÔNG đoán là đang mở', () => {
  const found = summarize({}, SHEET_NO_STATUS);
  assert.equal(found.rowsTotal, 2);
  assert.deepEqual(found.open, []);
  assert.equal(found.statusUnreadable, true);
});

test('đọc được trạng thái thì loại dòng đã Done, giữ dòng còn trống', () => {
  const found = summarize({}, SHEET_OK);
  assert.equal(found.statusUnreadable, false);
  assert.deepEqual(
    found.open.map((r) => r.bugId),
    ['2'],
  );
});

test('cột QC recheck một mình cũng đủ để phán trạng thái', () => {
  const onlyRecheck = `| BugID | Assignee Fix | Description | QC / GS Recheck |
| :-: | :-: | :-: | :-: |
| 1 | Mainsite | nút chết | Confirmed fix |
| 2 | Mainsite | chữ tràn |  |
`;
  assert.equal(statusReadable(onlyRecheck), true);
  assert.deepEqual(
    summarize({}, onlyRecheck).open.map((r) => r.bugId),
    ['2'],
  );
});

// ---------- số liệu cũ KHÔNG được sinh thông báo (lỗi 18/8: backfill từ cache 21h rồi báo) ----------

const NOW_OPEN = new Date(2026, 7, 18, 15, 0);
const agoH = (h) => new Date(Number(NOW_OPEN) - h * 3.6e6).toISOString();

test('chỉ đếm bug mở từ lượt đọc còn tươi', () => {
  const state = {
    bugWatch: {
      tuoi: { follow: true, openBugsAt: agoH(1), openBugs: [{ bugId: '1', bucket: 'mine' }] },
      cu: { follow: true, openBugsAt: agoH(21), openBugs: [{ bugId: '9', bucket: 'mine' }] },
    },
  };
  assert.deepEqual(countOpen(state, NOW_OPEN), { total: 1, chuaFix: 1, choConfirm: 0, mine: 1, unknown: 0, notMine: 0 });
});

test('không có mốc thời gian đọc thì KHÔNG đếm — không biết cũ hay mới thì không báo', () => {
  const state = { bugWatch: { a: { follow: true, openBugs: [{ bugId: '1', bucket: 'mine' }] } } };
  assert.deepEqual(countOpen(state, NOW_OPEN), {
    total: 0,
    chuaFix: 0,
    choConfirm: 0,
    mine: 0,
    unknown: 0,
    notMine: 0,
  });
});

test('ngưỡng tươi chỉnh được, mặc định 6 giờ', () => {
  const state = { bugWatch: { a: { follow: true, openBugsAt: agoH(5), openBugs: [{ bugId: '1', bucket: 'unknown' }] } } };
  assert.equal(countOpen(state, NOW_OPEN).total, 1);
  assert.equal(countOpen(state, NOW_OPEN, 4).total, 0);
});

// ---------- dòng đánh số sẵn nhưng RỖNG không phải bug ----------

const SHEET_TEMPLATE_ROWS = `| BugID | Assignee Fix | Description | DEV Check Status | QC / GS Recheck | Bug Type |
| :-: | :-: | :-: | :-: | :-: | :-: |
| 1 | Mainsite | nút chết |  |  | Functional |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
`;

test('dòng chỉ có số thứ tự, không mô tả, không assignee thì KHÔNG phải bug', () => {
  assert.deepEqual(
    parseBugTable(SHEET_TEMPLATE_ROWS).map((r) => r.bugId),
    ['1'],
  );
});

test('khung trống không được biến thành bug đang mở — ca thật CFL: 6 bug, 66 dòng trống', () => {
  assert.deepEqual(
    openRows(parseBugTable(SHEET_TEMPLATE_ROWS)).map((r) => r.bugId),
    ['1'],
  );
});

test('dòng có mô tả mà chưa gán ai thì VẪN là bug', () => {
  const md = `| BugID | Assignee Fix | Description | DEV Check Status |
| :-: | :-: | :-: | :-: |
| 9 |  | chữ tràn ở popup |  |
`;
  assert.deepEqual(
    parseBugTable(md).map((r) => r.bugId),
    ['9'],
  );
});

// ---------- ĐỔI LUẬT 18/8: mặc định KHÔNG theo dõi, user tự bật cái mình follow ----------

test('sheet mới vào sổ thì KHÔNG theo dõi — user phải tự bật', () => {
  assert.equal(isWatched({ title: 'BugList vừa thấy trên Drive' }), false);
});

test('bật follow thì mới theo dõi', () => {
  assert.equal(isWatched(followSheet({ title: 'x' })), true);
});

test('tắt follow thì thôi theo dõi và giữ lý do', () => {
  const off = unfollowSheet(followSheet({ title: 'x' }), 'ticket đã xong');
  assert.equal(isWatched(off), false);
  assert.equal(off.unfollowReason, 'ticket đã xong');
});

test('máy tự chặn vẫn thắng follow: qua mốc release hoặc không phải buglist', () => {
  assert.equal(isWatched({ follow: true, retired: true }), false);
  assert.equal(isWatched({ follow: true, notBugSheet: true }), false);
});

test('bật follow thì dọn sạch dấu vết cờ muted đời cũ', () => {
  const on = followSheet({ title: 'x', muted: true, mutedAt: 'hôm qua', muteReason: 'cũ' });
  assert.equal(isWatched(on), true);
  assert.equal('muted' in on, false);
  assert.equal('muteReason' in on, false);
});

test('sheet chưa bật follow thì không được kéo bugwatch dậy dù chưa poll bao giờ', () => {
  const state = { bugWatch: { s1: { title: 'chưa bật' } } };
  assert.deepEqual(pickPrompt(state, at45(14)), { skip: 'cold' });
});

test('sheet đã bật follow mà lâu chưa poll thì mới tới lượt', () => {
  const state = { bugWatch: { s1: { follow: true } } };
  assert.deepEqual(pickPrompt(state, at45(14)), { prompt: '/daily bugwatch', why: 'stale' });
});

// ---------- 3 trạng thái thật của một bug (user chốt 18/8) ----------

const r2 = (o) => ({ bugId: '1', type: 'functional', assignee: 'Mainsite', desc: 'nút chết', ...o });

test('dev chưa ghi gì ⇒ chưa fix', () => {
  assert.equal(bugStatus(r2({})), 'chua-fix');
});

test('dev ghi Done mà QC chưa recheck ⇒ ĐÃ SỬA, CHỜ CONFIRM (không phải xong)', () => {
  assert.equal(bugStatus(r2({ devStatus: 'Done' })), 'cho-confirm');
});

test('QC confirm rồi ⇒ xong hẳn', () => {
  assert.equal(bugStatus(r2({ devStatus: 'Done', recheck: 'Confirmed fix' })), 'xong');
});

test('QC mở lại thì về chưa fix, dù dev ghi Done', () => {
  assert.equal(bugStatus(r2({ devStatus: 'Done', recheck: 'Reopen' })), 'chua-fix');
});

test('bug bị bỏ qua thì không nằm trong việc phải làm', () => {
  assert.equal(bugStatus(r2({ recheck: 'not a bug' })), 'bo-qua');
  assert.equal(bugStatus(r2({ devStatus: 'skip' })), 'bo-qua');
});

test('danh sách theo dõi = chưa fix + chờ confirm, bỏ xong và bỏ qua', () => {
  const rows = [
    r2({ bugId: '1', devStatus: 'Done' }),
    r2({ bugId: '2', devStatus: 'Done', recheck: 'Confirmed fix' }),
    r2({ bugId: '3' }),
    r2({ bugId: '4', recheck: 'not a bug' }),
  ];
  assert.deepEqual(
    openRows(rows).map((r) => [r.bugId, r.status]),
    [
      ['1', 'cho-confirm'],
      ['3', 'chua-fix'],
    ],
  );
});

test('đếm tách chưa fix với chờ confirm — hai việc khác nhau', () => {
  const state = {
    bugWatch: {
      a: {
        follow: true,
        openBugsAt: new Date().toISOString(),
        openBugs: [
          { bugId: '1', bucket: 'mine', status: 'chua-fix' },
          { bugId: '2', bucket: 'unknown', status: 'chua-fix' },
          { bugId: '3', bucket: 'mine', status: 'cho-confirm' },
        ],
      },
    },
  };
  const c = countOpen(state);
  assert.equal(c.chuaFix, 2);
  assert.equal(c.choConfirm, 1);
  assert.equal(c.total, 3);
  assert.equal(c.mine, 2);
});

test('gom theo từng buglist để thông báo nói rõ sheet nào', () => {
  const now = new Date();
  const state = {
    bugWatch: {
      a: {
        follow: true,
        title: 'BugList CFL',
        openBugsAt: now.toISOString(),
        openBugs: [{ bugId: '6', bucket: 'unknown', status: 'chua-fix' }],
      },
      b: {
        follow: true,
        title: 'BugList LAN',
        openBugsAt: now.toISOString(),
        openBugs: [{ bugId: '1', bucket: 'mine', status: 'cho-confirm' }],
      },
      tat: { follow: false, title: 'không theo dõi', openBugsAt: now.toISOString(), openBugs: [{ bugId: '9', bucket: 'mine', status: 'chua-fix' }] },
    },
  };
  assert.deepEqual(
    openBySheet(state, now).map((s) => ({ title: s.title, chuaFix: s.chuaFix, choConfirm: s.choConfirm })),
    [
      { title: 'BugList CFL', chuaFix: 1, choConfirm: 0 },
      { title: 'BugList LAN', chuaFix: 0, choConfirm: 1 },
    ],
  );
});

test('mỗi buglist trong thông báo mang theo mốc đọc, để số không bị hiểu là tức thời', () => {
  const now = new Date(2026, 7, 18, 17, 30);
  const state = {
    bugWatch: {
      a: {
        follow: true,
        title: 'BugList CFL',
        openBugsAt: new Date(Number(now) - 5.4e6).toISOString(),
        openBugs: [{ bugId: '6', bucket: 'unknown', status: 'chua-fix' }],
      },
    },
  };
  const [row] = openBySheet(state, now);
  assert.equal(row.readAt, state.bugWatch.a.openBugsAt);
  assert.equal(row.ageMin, 90);
});
