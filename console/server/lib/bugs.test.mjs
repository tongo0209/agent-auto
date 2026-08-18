import { test } from 'node:test';
import assert from 'node:assert';
import bugs from './bugs.js';

const { buildBugs, sheetState } = bugs;

const NOW = new Date('2026-08-18T10:00:00Z');

const STATE = {
  bugWatch: {
    s1: {
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
      title: 'BugList CFM',
      keys: ['GW-660'],
      lastChangeAt: '2026-08-18T09:00:00Z',
      pendingSheetWrite: [
        { bugId: '1', grade: 'unverified', whyLabel: 'không có ảnh QC', queuedAt: '2026-08-18T09:56:00Z' },
      ],
    },
    s3: { title: 'sheet nghỉ', retired: true, lastChangeAt: '2026-08-18T09:30:00Z' },
    s4: { title: 'file brief', notBugSheet: true },
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
    ['watching', 'watching', 'retired', 'not-buglist'],
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
  assert.equal(sheetState({}), 'watching');
  assert.equal(sheetState({ retired: true }), 'retired');
  assert.equal(sheetState({ notBugSheet: true }), 'not-buglist');
  assert.equal(sheetState({ notBugSheet: true, retired: true }), 'not-buglist');
});
