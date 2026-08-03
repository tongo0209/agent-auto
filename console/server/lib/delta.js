/**
 * "Có gì mới từ lần bạn xem" — đọc 2 sổ nhật ký đã ghi sẵn mà trước đây không ai đọc:
 * history/issues.jsonl (mỗi lần /daily quét Jira ghi 1 dòng/ticket) và history/phases.jsonl
 * (mỗi lần phase 1 ticket đổi). Trước đó muốn biết thay đổi phải tự gõ `/daily delta`.
 *
 * Chỉ suy được 4 loại thay đổi từ dữ liệu THẬT đang có trong 2 file trên: status · duedate ·
 * milestone (đổi bất kỳ mốc nào trong object milestones) · phase. Không suy loại "bugsheet" vì
 * issues.jsonl không mang field bugSheets — bịa loại thay đổi là báo sai cho user.
 */
const { cleanPhaseRows, phaseRowTime: at } = require('./phaselog');

/** So 2 dòng issues.jsonl liền kề (baseline → hiện tại) của CÙNG 1 ticket */
function diffRows(prev, cur) {
  const out = [];
  if (!prev) return out; // chưa có baseline (ticket mới xuất hiện sau `since`) — không có gì để so
  if (prev.status !== cur.status) out.push({ type: 'status', from: prev.status, to: cur.status, at: cur.at });
  if (prev.duedate !== cur.duedate) out.push({ type: 'duedate', from: prev.duedate, to: cur.duedate, at: cur.at });
  // Mốc: diff THEO TỪNG MỐC, không so cả object bằng JSON string.
  // Bản trước nhả nguyên 2 khối JSON vào `from`/`to` — trên UI thành một dòng dài không ai đọc
  // được (đo thật: `{"design":"2026-07-03?","deliver":...}→{"duedate":"2026-08-05"}`), và còn lôi
  // cả key ghi chú `_note`/`_conflict` của skill vào như thể chúng là mốc.
  const prevMs = prev.milestones || {};
  const curMs = cur.milestones || {};
  const names = [...new Set([...Object.keys(prevMs), ...Object.keys(curMs)])]
    .filter((n) => !n.startsWith('_')) // key `_` là ghi chú của skill, không phải mốc
    .sort();
  for (const name of names) {
    if (prevMs[name] === curMs[name]) continue;
    out.push({ type: 'milestone', name, from: prevMs[name] ?? null, to: curMs[name] ?? null, at: cur.at });
  }
  return out;
}

/**
 * `buildDelta({ issueRows, phaseRows, sinceISO })` → mảng `{ key, changes: [...] }`.
 *
 * Mốc so sánh: với mỗi ticket, lấy dòng MỚI NHẤT TRƯỚC (hoặc đúng) `since` làm baseline và
 * dòng MỚI NHẤT overall làm hiện tại — không phải so 2 dòng liên tiếp bất kỳ. Không có dòng
 * nào MỚI HƠN `since` thì ticket đó không có gì mới (không báo bừa dù có nhiều dòng cũ hơn).
 */
function buildDelta({ issueRows = [], phaseRows = [], sinceISO }) {
  const since = new Date(sinceISO).getTime();
  const byKey = {};

  for (const row of issueRows) {
    if (!row || !row.key) continue;
    (byKey[row.key] = byKey[row.key] || []).push(row);
  }

  const items = [];
  for (const [key, rowsForKey] of Object.entries(byKey)) {
    const sorted = [...rowsForKey].sort((x, y) => at(x) - at(y));
    const newer = sorted.filter((r) => at(r) > since);
    if (!newer.length) continue; // không có dòng nào mới hơn since → im lặng, không báo bừa
    const baseline = sorted.filter((r) => at(r) <= since).pop() || null;
    const current = newer[newer.length - 1];
    const changes = diffRows(baseline, current);
    if (changes.length) items.push({ key, changes });
  }

  // phases.jsonl: mỗi dòng TỰ NÓ là 1 sự kiện đổi phase (đã có from/to/reason), không cần baseline
  // như issues.jsonl. Nhưng sổ này bị 2 nguồn cùng ghi nên phải LÀM SẠCH trước — luật làm sạch
  // nằm ở `lib/phaselog.js` (dùng chung với `learn.js::leadTimes()`, xem lý do trong file đó).
  //
  // THỨ TỰ QUAN TRỌNG: làm sạch trên TOÀN lịch sử trước, chỉ lọc `since` ở bước hiển thị. Lọc
  // `since` trước thì dòng THẬT rơi trước mốc "đã xem" không được đăng ký, và dòng trùng của
  // observer nổi lên một mình → báo sai là "thay đổi mới", mất luôn lý do thật (tái hiện được
  // bằng dữ liệu thật với `since = 10:30`).
  const keptRows = cleanPhaseRows(phaseRows);

  for (const row of keptRows) {
    if (at(row) <= since) continue; // chỉ hiển thị cái mới, nhưng dedupe đã xét cả lịch sử
    const change = { type: 'phase', from: row.from, to: row.to, at: row.at, reason: row.reason };
    const found = items.find((i) => i.key === row.key);
    // Phase đứng đầu danh sách thay đổi của ticket: đổi phase là tín hiệu quan trọng nhất
    // (đổi cả vòng đời ticket), status/duedate/milestone chỉ là chi tiết bên trong 1 phase.
    if (found) found.changes.unshift(change);
    else items.push({ key: row.key, changes: [change] });
  }

  return items;
}

module.exports = { buildDelta };
