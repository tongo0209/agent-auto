/**
 * Bảng bug cho console — đọc `state.bugWatch` mà radar nền ghi ra.
 *
 * Vì sao console chứ không phải popup hay artifact: popup bắn một lần rồi biến, artifact thì
 * phiên headless không publish được (đo 18/8: dashboard.html đứng từ 3/8). Console tự đọc lại
 * state.json mỗi 3 giây, nên radar chỉ cần ghi file — load lại trang là thấy.
 */
const HOUR_MS = 3.6e6;

const sheetState = (entry) => {
  if (entry.notBugSheet) return 'not-buglist';
  if (entry.retired) return 'retired';
  return 'watching';
};

function pendingRows(state, now) {
  return Object.entries(state.bugWatch || {}).flatMap(([sheetId, entry]) =>
    (entry.pendingSheetWrite || []).map((row) => ({
      sheetId,
      sheetTitle: entry.title || sheetId,
      sheetUrl: entry.url || null,
      keys: entry.keys || [],
      bugId: row.bugId,
      desc: row.desc || '',
      note: row.note || '',
      fixCommit: row.fixCommit || null,
      verifyHint: row.verifyHint || '',
      grade: row.grade === 'verified' ? 'verified' : 'unverified',
      whyLabel: row.whyLabel || null,
      queuedAt: row.queuedAt || null,
      heldHours: row.queuedAt ? Math.round((Number(now) - Date.parse(row.queuedAt)) / HOUR_MS) : null,
    })),
  );
}

function buildBugs({ state = {}, now = new Date() } = {}) {
  const rows = pendingRows(state, now).sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
  const sheets = Object.entries(state.bugWatch || {})
    .map(([sheetId, entry]) => ({
      sheetId,
      title: entry.title || sheetId,
      url: entry.url || null,
      keys: entry.keys || [],
      state: sheetState(entry),
      lastChangeAt: entry.lastChangeAt || null,
      lastPollAt: entry.lastPollAt || null,
      seenCount: Object.keys(entry.seenBugs || {}).length,
      pendingCount: (entry.pendingSheetWrite || []).length,
      lastScan: entry.lastScan || null,
    }))
    .sort((a, b) => {
      if (a.state !== b.state) return a.state === 'watching' ? -1 : 1;
      return String(b.lastChangeAt).localeCompare(String(a.lastChangeAt));
    });

  const verified = rows.filter((r) => r.grade === 'verified');
  const unverified = rows.filter((r) => r.grade !== 'verified');
  return {
    counts: { verified: verified.length, unverified: unverified.length, total: rows.length },
    pending: { verified, unverified },
    sheets,
    watching: sheets.filter((s) => s.state === 'watching').length,
    oldestHeldHours: rows.length ? Math.max(...rows.map((r) => r.heldHours || 0)) : 0,
  };
}

module.exports = { buildBugs, sheetState };
