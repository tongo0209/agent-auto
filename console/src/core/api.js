import $ from 'jquery';

/** Một chỗ duy nhất gọi backend — panel không tự fetch */
async function getJSON(url) {
  return $.ajax({ url, dataType: 'json' });
}
async function getText(url) {
  return $.ajax({ url, dataType: 'text' });
}
async function postJSON(url, body) {
  return $.ajax({ url, method: 'POST', contentType: 'application/json', data: JSON.stringify(body), dataType: 'json' });
}

export const api = {
  state: () => getJSON('/api/state'),
  months: (limit) => getJSON('/api/months' + (limit ? '?limit=' + encodeURIComponent(limit) : '')),
  git: (month) => getJSON('/api/git' + (month ? '?month=' + encodeURIComponent(month) : '')),
  promotion: () => getJSON('/api/promotion'),
  activity: () => getJSON('/api/activity'),
  activityFor: (key) => getJSON('/api/activity/' + key),
  boards: () => getJSON('/api/boards'),
  board: (date) => getText('/api/board/' + date),
  brief: (key) => getText('/api/brief/' + key),
  metrics: () => getJSON('/api/metrics'),

  // Review & push (hệ con ②)
  review: () => getJSON('/api/review'),
  reviewDiff: (repo, path) =>
    getText('/api/review/diff?repo=' + encodeURIComponent(repo) + '&path=' + encodeURIComponent(path)),

  // Gate chất lượng (hệ con ③)
  gates: () => getJSON('/api/gates'),

  // Drawer chi tiết 1 ticket
  ticket: (key) => getJSON('/api/ticket/' + encodeURIComponent(key)),
  runGate: (key) => postJSON('/api/gate/run/' + encodeURIComponent(key), {}),

  // Cảnh báo chủ động (hệ con ①)
  alerts: () => getJSON('/api/alerts'),

  // Radar nền (launchd → tools/radar-tick.mjs) — trạng thái + công tắc
  radar: () => getJSON('/api/radar'),
  radarToggle: (enabled) => postJSON('/api/radar/toggle', { enabled }),
  /** Hàng bug chờ bạn duyệt + động tĩnh buglist (radar nền ghi state.bugWatch) */
  bugs: () => getJSON('/api/bugs'),
  bugWatch: (sheetId, watching) => postJSON('/api/bugs/watch', { sheetId, watching }),
  /** Nợ "Cần bạn" ở board CŨ mà hôm nay không ai nhắc lại — tick bằng `boardCheck` với `date` gốc */
  debt: () => getJSON('/api/debt'),
  // Hợp đồng state.json vs schema/vocab.json (Task 5) — trộn vào dải cảnh báo
  doctor: () => getJSON('/api/doctor'),
  // "Có gì mới từ lần bạn xem" (Task 8) — đọc history/issues.jsonl + phases.jsonl, KHÔNG
  // trộn vào dải cảnh báo trên: đây là tin tức, không phải báo động.
  delta: (since) => getJSON('/api/delta?since=' + encodeURIComponent(since)),

  // Vòng học (hệ con ④)
  learn: () => getJSON('/api/learn'),
  lessons: () => getText('/api/lessons'),

  /** Tick / bỏ tick 1 mục "Cần bạn" — chỗ DUY NHẤT console ghi vào board */
  boardCheck: ({ date, index, done, expectText }) => postJSON('/api/board/check', { date, index, done, expectText }),
  /** Thêm dòng vào board; với section 'Log' thì SERVER tự lấy giờ thật */
  boardAppend: ({ date, section, text }) => postJSON('/api/board/append', { date, section, text }),

  // Sổ bàn giao `tasks/<KEY>/handoff.md` — hiện trong drawer ticket khi ticket đã chuyển người
  handoff: (key) => getJSON('/api/handoff/' + encodeURIComponent(key)),
  handoffCheck: (key, body) => postJSON('/api/handoff/' + encodeURIComponent(key) + '/check', body),

  /**
   * Ticket đã bàn giao qua gt-promotion chưa (soi repo: file có + đã push lên remote).
   * Chỉ đọc, nhưng có `git fetch` bên trong nên chậm vài giây — gọi rời, đừng chặn drawer.
   */
  delivery: (key) => getJSON('/api/jira/delivery/' + encodeURIComponent(key)),
  /** Đổi status ticket sang hoàn thành. Đây là hành động THẬT trên Jira — chỉ gọi sau khi user xác nhận. */
  jiraDone: (key, body) => postJSON('/api/jira/done/' + encodeURIComponent(key), body),

  open: (app, target) => postJSON('/api/open', { app, target }),
};
