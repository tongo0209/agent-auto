import { test } from 'node:test';
import assert from 'node:assert';
import bugs from './bugs.js';

const { buildBugs, sheetState, filterSheets } = bugs;

const NOW = new Date('2026-08-18T10:00:00Z');

const STATE = {
  bugWatch: {
    s1: {
      follow: true,
      title: 'BugList GNOTH',
      url: 'https://sheet/1',
      keys: ['GW-610'],
      lastChangeAt: '2026-08-17T11:01:59.871Z',
      seenBugs: { 1: 'h', 2: 'h' },
      pendingSheetWrite: [
        { bugId: '22', grade: 'verified', note: 'đã fix', queuedAt: '2026-08-17T11:05:36.823Z' },
      ],
      lastScan: { at: '2026-08-18T01:57:00Z', reopened: ['7'], fresh: 1, toSkill: 1 },
    },
    s2: {
      follow: true,
      title: 'BugList CFM',
      keys: ['GW-660'],
      lastChangeAt: '2026-08-18T09:00:00Z',
      pendingSheetWrite: [
        { bugId: '1', grade: 'unverified', whyLabel: 'không có ảnh QC', queuedAt: '2026-08-18T09:56:00Z' },
      ],
    },
    s3: { follow: true, title: 'sheet nghỉ', retired: true, lastChangeAt: '2026-08-18T09:30:00Z' },
    s4: { follow: true, title: 'file brief', notBugSheet: true },
    s5: { title: 'sheet mồ côi', keys: [], follow: false, unfollowReason: 'QC không dùng nữa', lastChangeAt: '2026-08-18T09:40:00Z' },
  },
};

test('tách hai rổ theo grade — verified chờ gật, unverified cần mắt người', () => {
  const out = buildBugs({ state: STATE, now: NOW });
  assert.deepEqual(out.counts, { verified: 1, unverified: 1, total: 2 });
  assert.equal(out.pending.verified[0].bugId, '22');
  assert.equal(out.pending.unverified[0].bugId, '1');
  assert.equal(out.pending.unverified[0].whyLabel, 'không có ảnh QC');
});

test('dòng treo lâu nhất nổi lên đầu và đếm được số giờ — ca GNOTH treo 33h phải tự lộ', () => {
  const out = buildBugs({ state: STATE, now: NOW });
  assert.equal(out.pending.verified[0].heldHours, 23);
  assert.equal(out.oldestHeldHours, 23);
  const all = [...out.pending.verified, ...out.pending.unverified];
  assert.ok(all.every((r) => r.sheetTitle && r.keys));
});

test('sheet đang theo dõi xếp trước sheet đã nghỉ, dù sheet nghỉ mới động hơn', () => {
  const out = buildBugs({ state: STATE, now: NOW });
  assert.deepEqual(
    out.sheets.map((s) => s.state),
    ['following', 'following', 'off', 'retired', 'not-buglist'],
  );
  assert.equal(out.sheets[0].title, 'BugList CFM');
  assert.equal(out.watching, 2);
});

test('mang theo lastScan để console kể được động tĩnh, kể cả bug QC mở lại', () => {
  const out = buildBugs({ state: STATE, now: NOW });
  const gnoth = out.sheets.find((s) => s.sheetId === 's1');
  assert.deepEqual(gnoth.lastScan.reopened, ['7']);
  assert.equal(gnoth.seenCount, 2);
  assert.equal(out.sheets.find((s) => s.sheetId === 's4').lastScan, null);
});

test('state rỗng không làm vỡ trang', () => {
  assert.deepEqual(buildBugs({}).counts, { verified: 0, unverified: 0, total: 0 });
  assert.deepEqual(buildBugs({ state: {}, now: NOW }).sheets, []);
  assert.equal(buildBugs({}).oldestHeldHours, 0);
});

test('grade lạ hoặc thiếu ⇒ coi là CHƯA verify, không mặc định cho qua', () => {
  const state = { bugWatch: { x: { pendingSheetWrite: [{ bugId: '5' }, { bugId: '6', grade: 'ok?' }] } } };
  assert.deepEqual(buildBugs({ state, now: NOW }).counts, { verified: 0, unverified: 2, total: 2 });
});

test('phân loại sheet: brief lẫn vào watchlist không được đếm là đang theo dõi', () => {
  assert.equal(sheetState({}), 'off');
  assert.equal(sheetState({ follow: true }), 'following');
  assert.equal(sheetState({ follow: true, retired: true }), 'retired');
  assert.equal(sheetState({ follow: true, notBugSheet: true }), 'not-buglist');
  assert.equal(sheetState({ follow: true, notBugSheet: true, retired: true }), 'not-buglist');
});

test('sheet chưa bật follow hiện rõ là off kèm lý do, không tính vào số đang theo dõi', () => {
  const out = buildBugs({ state: STATE, now: NOW });
  const orphan = out.sheets.find((s) => s.sheetId === 's5');
  assert.equal(orphan.state, 'off');
  assert.equal(orphan.unfollowReason, 'QC không dùng nữa');
  assert.equal(out.watching, 2);
  assert.equal(sheetState({ follow: false }), 'off');
});

// ---------- bug ĐANG MỞ: trước 18/8 tab Bug chỉ thấy fix chờ ghi, không thấy bug mới ----------

const openState = {
  bugWatch: {
    s1: {
      follow: true,
      title: 'BugList CFL',
      url: 'https://sheet/cfl',
      keys: ['GW-660'],
      openBugs: [
        { bugId: '5', bucket: 'unknown', desc: 'chưa rõ của ai', assignee: '', type: 'gì đó' },
        { bugId: '4', bucket: 'mine', desc: 'nút chết', assignee: 'Mainsite', type: 'functional' },
      ],
    },
    s2: { follow: true, title: 'BugList khác', openBugs: [{ bugId: '9', bucket: 'not-mine', desc: 'của GS' }] },
    s3: { follow: true, title: 'Đã nghỉ', retired: true, openBugs: [{ bugId: '1', bucket: 'mine', desc: 'cũ' }] },
    s4: { follow: false, title: 'Đã tắt', openBugs: [{ bugId: '2', bucket: 'mine', desc: 'tắt' }] },
  },
};

test('bug đang mở lên bảng, kèm sheet và nhãn của ai', () => {
  const out = buildBugs({ state: openState, now: NOW });
  const four = out.open.rows.find((r) => r.bugId === '4');
  assert.equal(four.sheetTitle, 'BugList CFL');
  assert.equal(four.sheetUrl, 'https://sheet/cfl');
  assert.deepEqual(four.keys, ['GW-660']);
  assert.equal(four.bucket, 'mine');
  assert.equal(four.desc, 'nút chết');
});

test('bug của mình xếp trước bug chưa rõ, chưa rõ trước bug của người khác', () => {
  const out = buildBugs({ state: openState, now: NOW });
  assert.deepEqual(
    out.open.rows.map((r) => r.bugId),
    ['4', '5', '9'],
  );
});

test('sheet đã nghỉ hoặc đã tắt không góp bug mở nào', () => {
  const out = buildBugs({ state: openState, now: NOW });
  assert.equal(
    out.open.rows.some((r) => ['1', '2'].includes(r.bugId)),
    false,
  );
});

test('đếm bug mở tách theo của mình / chưa rõ / của người khác', () => {
  const out = buildBugs({ state: openState, now: NOW });
  assert.deepEqual(out.open.counts, {
    total: 3, mine: 1, unknown: 1, notMine: 1, stale: 3, chuaFix: 3, choConfirm: 0, daFix: 0, daGhi: 0,
  });
});

test('mỗi sheet mang sẵn số bug đang mở để vẽ badge', () => {
  const out = buildBugs({ state: openState, now: NOW });
  assert.equal(out.sheets.find((s) => s.sheetId === 's1').openCount, 2);
  assert.equal(out.sheets.find((s) => s.sheetId === 's3').openCount, 0);
});

test('state cũ chưa có openBugs thì bảng rỗng, không nổ', () => {
  const out = buildBugs({ state: STATE, now: NOW });
  assert.deepEqual(out.open.rows, []);
  assert.deepEqual(out.open.counts, {
    total: 0, mine: 0, unknown: 0, notMine: 0, stale: 0, chuaFix: 0, choConfirm: 0, daFix: 0, daGhi: 0,
  });
});

// ---------- số liệu cũ phải nói rõ là cũ (trả giá 18/8: cache 21h báo như hiện tại) ----------

const agedState = {
  bugWatch: {
    tuoi: {
      follow: true,
      title: 'CFL',
      openBugsAt: '2026-08-18T09:30:00Z',
      openBugs: [{ bugId: '5', bucket: 'mine', desc: 'mới' }],
    },
    cu: {
      follow: true,
      title: 'LightAndNight',
      openBugsAt: '2026-08-17T10:00:00Z',
      openBugs: [{ bugId: '1', bucket: 'unknown', desc: 'đọc từ hôm qua' }],
    },
  },
};

test('bug mở từ lượt đọc cũ bị đánh dấu là cũ', () => {
  const out = buildBugs({ state: agedState, now: NOW });
  assert.equal(out.open.rows.find((r) => r.bugId === '5').stale, false);
  assert.equal(out.open.rows.find((r) => r.bugId === '1').stale, true);
});

test('đếm tách phần cũ để không ai tưởng tất cả đều là số mới', () => {
  const out = buildBugs({ state: agedState, now: NOW });
  assert.equal(out.open.counts.total, 2);
  assert.equal(out.open.counts.stale, 1);
});

test('mỗi sheet mang mốc thời gian đọc để hiện trên bảng', () => {
  const out = buildBugs({ state: agedState, now: NOW });
  assert.equal(out.sheets.find((s) => s.sheetId === 'cu').openAt, '2026-08-17T10:00:00Z');
});

test('chưa đọc lần nào thì openAt rỗng và không có dòng nào', () => {
  const out = buildBugs({ state: STATE, now: NOW });
  assert.equal(out.sheets[0].openAt, null);
  assert.deepEqual(out.open.rows, []);
});

// ---------- tab Bug: tách "chưa fix" với "đã sửa, chờ QC confirm" ----------

const statusState = {
  bugWatch: {
    s1: {
      follow: true,
      title: 'BugList CFL',
      openBugsAt: '2026-08-18T09:30:00Z',
      openBugs: [
        { bugId: '1', bucket: 'mine', status: 'cho-confirm', desc: 'đã sửa' },
        { bugId: '6', bucket: 'unknown', status: 'chua-fix', desc: 'chưa ai làm' },
        { bugId: '3', bucket: 'mine', status: 'chua-fix', desc: 'của mình, chưa làm' },
      ],
    },
  },
};

test('bug chưa fix xếp trước bug chờ confirm, trong nhóm chưa fix thì của mình lên đầu', () => {
  const out = buildBugs({ state: statusState, now: NOW });
  assert.deepEqual(
    out.open.rows.map((r) => [r.bugId, r.status]),
    [
      ['3', 'chua-fix'],
      ['6', 'chua-fix'],
      ['1', 'cho-confirm'],
    ],
  );
});

test('đếm tách hai loại việc để hiện 2 nhóm — "chưa fix" gồm cả dòng chờ QC confirm chưa ai sửa', () => {
  const out = buildBugs({ state: statusState, now: NOW, boards: {} });
  assert.equal(out.open.counts.chuaFix, 3);
  assert.equal(out.open.counts.choConfirm, 1);
});

test('mỗi buglist mang sẵn số chưa fix + chờ confirm để vẽ badge', () => {
  const out = buildBugs({ state: statusState, now: NOW, boards: {} });
  const s = out.sheets.find((x) => x.sheetId === 's1');
  assert.equal(s.chuaFixCount, 3);
  assert.equal(s.choConfirmCount, 1);
});

// ---------- gộp theo ticket/project cho dễ nhìn (user chốt 18/8) ----------

const groupState = {
  issues: {
    'GW-660': { summary: '[A49][CFM] H5 Rừng Thu Kỳ Bí', phase: 'bugfix' },
    'GW-610': { summary: '[496][GNOTH] Chengdu Tournament', phase: 'wait-test' },
  },
  bugWatch: {
    cfl: {
      follow: true,
      title: 'Bug List CFL',
      keys: ['GW-660'],
      openBugsAt: '2026-08-18T09:30:00Z',
      openBugs: [
        { bugId: '1', bucket: 'mine', status: 'cho-confirm', desc: 'đã sửa' },
        { bugId: '6', bucket: 'unknown', status: 'chua-fix', desc: 'chưa làm' },
        { bugId: '3', bucket: 'mine', status: 'chua-fix', desc: 'của mình' },
      ],
    },
    cflPhu: {
      follow: true,
      title: 'Bug List CFL đợt 2',
      keys: ['GW-660'],
      openBugsAt: '2026-08-18T09:30:00Z',
      openBugs: [{ bugId: '9', bucket: 'mine', status: 'chua-fix', desc: 'sheet khác cùng ticket' }],
    },
    gnoth: {
      follow: true,
      title: 'Bug List GNOTH',
      keys: ['GW-610'],
      openBugsAt: '2026-08-18T09:30:00Z',
      openBugs: [{ bugId: '22', bucket: 'unknown', status: 'cho-confirm', desc: 'chờ confirm' }],
    },
    moCoi: {
      follow: true,
      title: 'Bug List không gắn ticket',
      keys: [],
      openBugsAt: '2026-08-18T09:30:00Z',
      openBugs: [{ bugId: '4', bucket: 'mine', status: 'chua-fix', desc: 'mồ côi' }],
    },
  },
};

test('hai sheet cùng ticket gộp về MỘT nhóm', () => {
  const g = buildBugs({ state: groupState, now: NOW }).open.groups;
  const cfl = g.find((x) => x.keys.includes('GW-660'));
  assert.equal(cfl.rows.length, 4);
  assert.equal(cfl.chuaFix, 3);
  assert.equal(cfl.choConfirm, 1);
});

test('nhóm mang tên ticket + summary + phase để nhìn là biết project nào', () => {
  const g = buildBugs({ state: groupState, now: NOW }).open.groups;
  const cfl = g.find((x) => x.keys.includes('GW-660'));
  assert.equal(cfl.label, 'GW-660');
  assert.equal(cfl.summary, '[A49][CFM] H5 Rừng Thu Kỳ Bí');
  assert.equal(cfl.phase, 'bugfix');
});

test('sheet chưa gắn ticket vẫn có nhóm riêng, nhãn theo tên sheet', () => {
  const g = buildBugs({ state: groupState, now: NOW }).open.groups;
  const mc = g.find((x) => !x.keys.length);
  assert.equal(mc.label, 'task ngoài Jira');
  assert.equal(mc.summary, 'Bug List không gắn ticket');
  assert.equal(mc.chuaFix, 1);
});

test('trong nhóm: chưa fix trước chờ confirm, của mình lên đầu', () => {
  const g = buildBugs({ state: groupState, now: NOW }).open.groups;
  const cfl = g.find((x) => x.keys.includes('GW-660'));
  assert.deepEqual(
    cfl.rows.map((r) => [r.bugId, r.status, r.bucket]),
    [
      ['3', 'chua-fix', 'mine'],
      ['9', 'chua-fix', 'mine'],
      ['6', 'chua-fix', 'unknown'],
      ['1', 'cho-confirm', 'mine'],
    ],
  );
});

test('nhóm nhiều việc chưa fix xếp trên', () => {
  const g = buildBugs({ state: groupState, now: NOW }).open.groups;
  assert.equal(g[0].keys[0], 'GW-660');
  assert.equal(g.at(-1).keys.includes('GW-610'), true);
});

test('không có bug treo thì không sinh nhóm rỗng', () => {
  assert.deepEqual(buildBugs({ state: STATE, now: NOW }).open.groups, []);
});

test('sheets xếp mới nhất trước: lastChangeAt, chưa quét thì tính addedAt', () => {
  const state = {
    bugWatch: {
      cu: { follow: true, title: 'cũ', lastChangeAt: '2026-09-01T00:00:00Z' },
      moi: { follow: true, title: 'mới', lastChangeAt: '2026-09-20T00:00:00Z' },
      vuaThem: { follow: true, title: 'vừa thêm', addedAt: '2026-09-21T00:00:00Z' },
      chuaBiet: { follow: true, title: 'không mốc' },
    },
  };
  const order = buildBugs({ state, now: NOW }).sheets.map((s) => s.title);
  assert.deepEqual(order, ['vừa thêm', 'mới', 'cũ', 'không mốc']);
});

// ---------- chia mục: đang theo dõi · chưa theo dõi · task đã đóng ----------

const GROUPED = {
  issues: {
    'GW-1': { phase: 'bugfix', summary: 'còn sống' },
    'GW-2': { phase: 'closed', summary: 'đã đóng' },
    'GW-3': { phase: 'reassigned', summary: 'sang tay người khác' },
  },
  bugWatch: {
    song: { follow: true, title: 'BugList đang chạy', keys: ['GW-1'], lastChangeAt: '2026-08-18T09:00:00Z' },
    dong: { follow: true, title: 'BugList ticket đóng', keys: ['GW-2'], lastChangeAt: '2026-08-18T08:00:00Z' },
    tatSong: { follow: false, title: 'BugList chờ bật', keys: ['GW-1'], lastChangeAt: '2026-08-18T07:00:00Z' },
    tatDong: { follow: false, title: 'BugList xong rồi', keys: ['GW-2', 'GW-3'], lastChangeAt: '2026-08-18T06:00:00Z' },
    khongMa: { follow: false, title: 'BugList ngoài Jira', keys: [], lastChangeAt: '2026-08-18T05:00:00Z' },
    khongMaCu: { follow: false, title: 'BugList chiến dịch cũ', keys: [], lastChangeAt: '2026-05-01T05:00:00Z' },
    nghi: { follow: true, title: 'BugList hết hạn', keys: ['GW-1'], retired: true },
  },
};
const grouped = () => Object.fromEntries(buildBugs({ state: GROUPED, now: NOW }).sheets.map((s) => [s.sheetId, s]));

test('sheet đang theo dõi vào mục following, ticket còn sống xếp trên ticket đã đóng', () => {
  const g = grouped();
  assert.equal(g.song.group, 'following');
  assert.equal(g.song.alive, true);
  assert.equal(g.dong.group, 'following');
  assert.equal(g.dong.alive, false);
  const order = buildBugs({ state: GROUPED, now: NOW }).sheets.map((s) => s.sheetId);
  assert.ok(order.indexOf('song') < order.indexOf('dong'));
});

test('sheet đã tắt: ticket còn sống thì nằm mục chờ bật, mọi ticket đóng thì vào khu đã đóng', () => {
  const g = grouped();
  assert.equal(g.tatSong.group, 'off');
  assert.equal(g.tatDong.group, 'closed');
});

test('sheet không gắn ticket: mới có động tĩnh thì chờ bật, im lâu thì vào khu đã đóng', () => {
  assert.equal(grouped().khongMa.group, 'off');
  assert.equal(grouped().khongMaCu.group, 'closed');
});

test('ticket lạ không có trong state.issues thì xét như sheet không ticket — cũ là vào khu đã đóng', () => {
  const state = { issues: GROUPED.issues, bugWatch: { x: { follow: false, keys: ['GW-999'], lastChangeAt: '2026-05-01T00:00:00Z' } } };
  assert.equal(buildBugs({ state, now: NOW }).sheets[0].group, 'closed');
});

test('ticket còn sống thì luôn ở khu chờ bật dù buglist im lâu', () => {
  const state = { issues: GROUPED.issues, bugWatch: { x: { follow: false, keys: ['GW-1'], lastChangeAt: '2026-01-01T00:00:00Z' } } };
  assert.equal(buildBugs({ state, now: NOW }).sheets[0].group, 'off');
});

test('retired và not-buglist luôn nằm khu đã đóng dù đang bật theo dõi', () => {
  assert.equal(grouped().nghi.group, 'closed');
  assert.equal(buildBugs({ state: STATE, now: NOW }).sheets.find((s) => s.sheetId === 's4').group, 'closed');
});

test('searchText gom mã task + tên sheet, thường hoá để lọc tại chỗ', () => {
  const g = grouped();
  assert.ok(g.song.searchText.includes('gw1'));
  assert.ok(g.song.searchText.includes('buglistđangchạy'));
  const hits = Object.values(g).filter((s) => s.searchText.includes('gw2'));
  assert.deepEqual(hits.map((s) => s.sheetId).sort(), ['dong', 'tatDong']);
});

// ---------- lọc: gõ số trần cũng ra đúng task ----------

const FILTER_SHEETS = buildBugs({
  state: {
    issues: { 'GW-477': { phase: 'closed', summary: 'CFL Offline' } },
    bugWatch: {
      a: { follow: true, title: 'CFL Offline Tournament', keys: ['GW-477'] },
      b: { follow: true, title: 'BugList NTH Affiliate v2 — đợt 477 câu hỏi', keys: [] },
      c: { follow: true, title: 'BugList GNOTH', keys: ['GW-610'] },
    },
  },
  now: NOW,
}).sheets;
const ids = (q) => filterSheets(FILTER_SHEETS, q).map((s) => s.sheetId);

test('gõ số trần ra đúng task, sheet khớp MÃ xếp trước sheet chỉ khớp tên', () => {
  assert.deepEqual(ids('477'), ['a', 'b']);
});

test('gõ có tiền tố, có gạch hay có khoảng trắng đều khớp cùng một mã', () => {
  for (const q of ['GW-477', 'gw477', 'gw 477', '  Gw-477 ']) assert.deepEqual(ids(q), ['a'], q);
});

test('gõ tên sheet vẫn lọc theo tên', () => {
  assert.deepEqual(ids('gnoth'), ['c']);
});

test('gõ chuỗi không có gì ⇒ rỗng; ô lọc trống ⇒ giữ nguyên danh sách', () => {
  assert.deepEqual(ids('khongcogi'), []);
  assert.equal(filterSheets(FILTER_SHEETS, '   ').length, 3);
});

// ---------- nối board fix: bug đã fix không được đếm là "chưa fix" ----------

const FIX_STATE = {
  bugWatch: {
    s9: {
      follow: true,
      title: 'BugList Trung Thu',
      keys: ['GW-525'],
      openBugsAt: '2026-08-18T09:00:00Z',
      openBugs: [
        { bugId: '3', desc: 'lệch nút', bucket: 'mine', status: 'chua-fix' },
        { bugId: '5', desc: 'sai text', bucket: 'mine', status: 'cho-confirm' },
        { bugId: '9', desc: 'chưa ai đụng', bucket: 'mine', status: 'chua-fix' },
      ],
    },
  },
};
const BOARDS = { s9: { 3: { fixedAt: '2026-08-18', board: '/b/x.md', sheetWritten: null }, 5: { fixedAt: '2026-08-18', board: '/b/x.md', sheetWritten: 'done' } } };
const bySheet9 = (boards) => buildBugs({ state: FIX_STATE, now: NOW, boards }).sheets[0];

test('bug có trong board fix ⇒ da-fix-chua-ghi-sheet, bug không có ⇒ chua-fix', () => {
  const out = buildBugs({ state: FIX_STATE, now: NOW, boards: BOARDS });
  assert.deepEqual(
    out.open.rows.map((r) => [r.bugId, r.fixState]),
    [
      ['3', 'da-fix-chua-ghi-sheet'],
      ['9', 'chua-fix'],
      ['5', 'da-ghi-sheet'],
    ],
  );
});

test('số "chưa fix" phải TRỪ phần board báo đã fix', () => {
  const s = bySheet9(BOARDS);
  assert.equal(s.chuaFixCount, 1);
  assert.equal(s.daFixCount, 1);
  assert.equal(s.daGhiCount, 1);
  assert.equal(buildBugs({ state: FIX_STATE, now: NOW, boards: BOARDS }).open.counts.chuaFix, 1);
});

test('sheet không map được board hoặc board rỗng ⇒ giữ nguyên như cũ, không ném lỗi', () => {
  for (const boards of [{}, { khac: {} }, undefined]) {
    const s = bySheet9(boards);
    assert.equal(s.chuaFixCount, 3, 'không có board thì cả 3 bug vẫn là chưa fix');
    assert.equal(s.daFixCount, 0);
  }
});
