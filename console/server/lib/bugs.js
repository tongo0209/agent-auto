/**
 * Bảng bug cho console — đọc `state.bugWatch` mà radar nền ghi ra.
 *
 * Vì sao console chứ không phải popup hay artifact: popup bắn một lần rồi biến, artifact thì
 * phiên headless không publish được (đo 18/8: dashboard.html đứng từ 3/8). Console tự đọc lại
 * state.json mỗi 3 giây, nên radar chỉ cần ghi file — load lại trang là thấy.
 */
const HOUR_MS = 3.6e6;

/** OPT-IN 18/8/2026: chưa bật follow = 'off'. Máy tự chặn (`notBugSheet`/`retired`) nói trước. */
const sheetState = (entry) => {
  if (entry.notBugSheet) return 'not-buglist';
  if (entry.retired) return 'retired';
  return entry.follow === true ? 'following' : 'off';
};

const STATE_RANK = { following: 0, off: 1, retired: 2, 'not-buglist': 3 };

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

const BUCKET_RANK = { mine: 0, unknown: 1, 'not-mine': 2 };
const STATUS_RANK = { 'chua-fix': 0, 'cho-confirm': 1 };
const isChuaFix = (row) => row.status !== 'cho-confirm';
const OPEN_FRESH_MS = 6 * HOUR_MS;

function openRowsOf(state, now) {
  return Object.entries(state.bugWatch || {})
    .filter(([, entry]) => sheetState(entry) === 'following')
    .flatMap(([sheetId, entry]) =>
      (entry.openBugs || []).map((row) => ({
        stale: !entry.openBugsAt || Number(now) - Date.parse(entry.openBugsAt) >= OPEN_FRESH_MS,
        openAt: entry.openBugsAt || null,
        sheetId,
        sheetTitle: entry.title || sheetId,
        sheetUrl: entry.url || null,
        keys: entry.keys || [],
        bugId: row.bugId,
        desc: row.desc || '',
        assignee: row.assignee || '',
        type: row.type || '',
        bucket: row.bucket || 'unknown',
        status: row.status || 'chua-fix',
      })),
    )
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] ||
        String(a.sheetTitle).localeCompare(String(b.sheetTitle)) ||
        String(a.bugId).localeCompare(String(b.bugId), undefined, { numeric: true }),
    );
}

/** Gộp theo TICKET, không theo sheet: một ticket có thể có nhiều buglist (đợt 1, đợt 2). */
function groupByTicket(rows, state) {
  const groups = new Map();
  for (const row of rows) {
    const keys = row.keys || [];
    const id = keys.length ? keys.join(', ') : '__mo-coi__';
    if (!groups.has(id)) {
      const issue = keys.length ? (state.issues || {})[keys[0]] : null;
      groups.set(id, {
        label: keys.length ? keys.join(', ') : 'chưa gắn ticket',
        keys,
        summary: issue ? issue.summary || null : row.sheetTitle,
        phase: issue ? issue.phase || null : null,
        rows: [],
      });
    }
    groups.get(id).rows.push(row);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      chuaFix: g.rows.filter(isChuaFix).length,
      choConfirm: g.rows.filter((r) => !isChuaFix(r)).length,
    }))
    .sort((a, b) => b.chuaFix - a.chuaFix || b.choConfirm - a.choConfirm || a.label.localeCompare(b.label));
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
      unfollowReason: entry.unfollowReason || null,
      lastChangeAt: entry.lastChangeAt || null,
      lastPollAt: entry.lastPollAt || null,
      seenCount: Object.keys(entry.seenBugs || {}).length,
      pendingCount: (entry.pendingSheetWrite || []).length,
      openCount: sheetState(entry) === 'following' ? (entry.openBugs || []).length : 0,
      openAt: entry.openBugsAt || null,
      chuaFixCount: sheetState(entry) === 'following' ? (entry.openBugs || []).filter(isChuaFix).length : 0,
      choConfirmCount:
        sheetState(entry) === 'following' ? (entry.openBugs || []).filter((r) => !isChuaFix(r)).length : 0,
      lastScan: entry.lastScan || null,
    }))
    .sort(
      (a, b) =>
        STATE_RANK[a.state] - STATE_RANK[b.state] ||
        String(b.lastChangeAt).localeCompare(String(a.lastChangeAt)),
    );

  const openRows = openRowsOf(state, now);
  const verified = rows.filter((r) => r.grade === 'verified');
  const unverified = rows.filter((r) => r.grade !== 'verified');
  return {
    counts: { verified: verified.length, unverified: unverified.length, total: rows.length },
    pending: { verified, unverified },
    open: {
      rows: openRows,
      groups: groupByTicket(openRows, state),
      counts: {
        total: openRows.length,
        mine: openRows.filter((r) => r.bucket === 'mine').length,
        unknown: openRows.filter((r) => r.bucket === 'unknown').length,
        notMine: openRows.filter((r) => r.bucket === 'not-mine').length,
        stale: openRows.filter((r) => r.stale).length,
        chuaFix: openRows.filter(isChuaFix).length,
        choConfirm: openRows.filter((r) => !isChuaFix(r)).length,
      },
    },
    sheets,
    watching: sheets.filter((s) => s.state === 'following').length,
    oldestHeldHours: rows.length ? Math.max(...rows.map((r) => r.heldHours || 0)) : 0,
  };
}

module.exports = { buildBugs, sheetState };
