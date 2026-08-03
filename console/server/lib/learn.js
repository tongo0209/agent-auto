const { file } = require('./paths');
const { readJSON, readJSONL, todayStr } = require('./fsutil');
const { appendJSONL } = require('./backup');
const { activityForIssue } = require('./activity');
const { cleanPhaseRows } = require('./phaselog');

/**
 * Vòng học — dữ liệu phải sinh ra như TÁC DỤNG PHỤ của việc đang làm.
 *
 * Bài học 1/8: `metrics.jsonl` 0 dòng, `issues.jsonl` không tồn tại sau 3 ngày chạy, vì cả hai
 * phụ thuộc `/daily wrap` — một bước phải gõ tay, cuối ngày, đúng lúc dễ bỏ nhất.
 *
 * Nên ở đây console TỰ quan sát: mỗi lần poll /api/state mà thấy phase đổi thì ghi 1 dòng
 * `phases.jsonl`; mỗi ngày ghi 1 dòng `metrics.jsonl` per ticket đo TỪ GIT (không phải ước lượng).
 * Skill vẫn được ghi cùng file (có `reason` cụ thể hơn) — dedup theo `to` gần nhất.
 */

/** key → phase gần nhất đã ghi (khởi tạo từ file, sau đó giữ trong RAM) */
let lastPhase = null;

function loadLastPhase() {
  const map = {};
  for (const row of readJSONL(file.phases)) if (row && row.key && row.to) map[row.key] = row.to;
  return map;
}

/**
 * Giờ hiện tại kèm OFFSET múi giờ. Offset là bắt buộc, không phải cho đẹp: chuỗi thiếu offset
 * (`2026-08-03T10:39:39`) được `new Date()` hiểu theo múi giờ CỦA TIẾN TRÌNH ĐANG ĐỌC, nên nếu
 * tiến trình đọc chạy ở múi khác tiến trình ghi thì thứ tự thời gian trong `phases.jsonl` bị
 * ĐẢO — và `lib/delta.js` sort theo `at` để chọn dòng nào là dòng thật sẽ chọn sai.
 * Skill `/daily` vốn đã ghi kèm offset; đây là chỗ console ghi cho khớp.
 */
function nowISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const tz = -d.getTimezoneOffset(); // phút, dương = phía đông UTC
  const sign = tz >= 0 ? '+' : '-';
  const off = `${sign}${p(Math.floor(Math.abs(tz) / 60))}:${p(Math.abs(tz) % 60)}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off}`;
}

/**
 * Ghi phase đổi. Gọi mỗi lần đọc state (3s/lần) nên phải RẺ: chỉ so map trong RAM,
 * chỉ ghi khi thật sự đổi.
 * @returns số dòng đã ghi
 */
function observePhases(state) {
  if (lastPhase === null) lastPhase = loadLastPhase();
  let written = 0;
  for (const [key, issue] of Object.entries(state.issues || {})) {
    const to = issue.phase;
    if (!to) continue;
    const from = lastPhase[key];
    if (from === to) continue;
    appendJSONL(file.phases, { at: nowISO(), key, from: from || null, to, reason: 'console-observed' });
    lastPhase[key] = to;
    written++;
  }
  return written;
}

/* ─────────────────── lead time từng phase ─────────────────── */

const HOUR = 3600000;
const parse = (at) => new Date(String(at).replace(' ', 'T')).getTime();

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentile(nums, p) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

/**
 * Từ phases.jsonl dựng khoảng thời gian mỗi ticket nằm trong mỗi phase.
 * Khoảng CHƯA đóng (phase hiện tại) không tính vào median — nếu tính thì phase đang chạy
 * luôn kéo median xuống và dự báo thành vô nghĩa.
 */
function leadTimes() {
  // LÀM SẠCH trước khi tính, dùng chung luật với lib/delta.js (xem lib/phaselog.js).
  // Đo thật 3/8: 2 dòng rác của GW-556 (1 dòng TRÙNG cách 18 phút + 1 dòng NO-OP `coding→coding`)
  // biến thành 2 mẫu "phase coding dài 0.3h", kéo median phase `coding` từ ~47h xuống 23.5h →
  // dự báo báo "xong hôm nay" cho ticket đang đứng yên 2 ngày. Đọc sổ thô là tính sai.
  const rows = cleanPhaseRows(readJSONL(file.phases));

  const byKey = {};
  for (const r of rows) (byKey[r.key] ||= []).push(r);

  const closed = {}; // phase → [giờ]
  const open = {}; // key → { phase, since, hours }
  for (const [key, list] of Object.entries(byKey)) {
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      const next = list[i + 1];
      if (next) {
        const hours = (parse(next.at) - parse(cur.at)) / HOUR;
        if (hours >= 0) (closed[cur.to] ||= []).push(hours);
      } else {
        open[key] = { phase: cur.to, since: cur.at, hours: (Date.now() - parse(cur.at)) / HOUR };
      }
    }
  }

  const phases = Object.entries(closed).map(([phase, hours]) => ({
    phase,
    n: hours.length,
    medianHours: median(hours),
    p80Hours: percentile(hours, 80),
  }));

  return { phases, open, sampleRows: rows.length };
}

/**
 * Dự báo cho ticket đang chạy — CHỈ khi đủ mẫu.
 * n < 3 thì trả `enough: false` để UI in thẳng "chưa đủ dữ liệu (n=…)".
 * Dự báo bịa còn tệ hơn không dự báo: nó làm hoãn đúng việc gấp.
 */
const MIN_SAMPLES = 3;

function forecast() {
  const { phases, open, sampleRows } = leadTimes();
  const byPhase = Object.fromEntries(phases.map((p) => [p.phase, p]));
  const running = Object.entries(open).map(([key, o]) => {
    const stat = byPhase[o.phase];
    const enough = Boolean(stat && stat.n >= MIN_SAMPLES);
    return {
      key,
      phase: o.phase,
      since: o.since,
      hours: Math.round(o.hours * 10) / 10,
      enough,
      n: stat ? stat.n : 0,
      medianHours: stat ? Math.round(stat.medianHours * 10) / 10 : null,
      overdue: enough && o.hours > stat.medianHours,
    };
  });
  return { phases, running, sampleRows, minSamples: MIN_SAMPLES };
}

/* ─────────────────── metrics đo từ git ─────────────────── */

/**
 * Mỗi ngày 1 dòng/ticket: commit/file/dòng THẬT từ git. Idempotent theo (date, key).
 * Chạy lúc boot + mỗi 6h; không chặn request nào.
 */
async function syncMetrics() {
  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const today = todayStr();
  const existing = new Set(readJSONL(file.metrics).map((r) => `${r.date}|${r.key}`));
  const repos = config.repos || {};
  const author = config.gitAuthor || '';
  let written = 0;

  for (const [key, issue] of Object.entries(state.issues || {})) {
    if (issue.phase === 'closed') continue;
    if (!Array.isArray(issue.paths) || !issue.paths.length) continue;
    if (existing.has(`${today}|${key}`)) continue;

    const act = await activityForIssue(key, issue, repos, author);
    appendJSONL(file.metrics, {
      date: today,
      key,
      phase: issue.phase,
      source: 'git',
      commits: act.commits || 0,
      activeDays: act.activeDays || 0,
      files: (act.commitList || []).reduce((s, c) => s + (c.sourceFiles || 0), 0),
      added: act.sourceAdded || 0,
      deleted: act.sourceRemoved || 0,
      lastCommit: act.lastCommit ? act.lastCommit.date : null,
    });
    written++;
  }
  return written;
}

module.exports = { observePhases, leadTimes, forecast, syncMetrics, nowISO };
