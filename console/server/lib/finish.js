/**
 * User tự báo ticket đã xong / đã đóng từ console — cho ca radar không tự đóng được: QC test xong
 * mà Jira chưa chuyển Done (autoclose cần Jira Done), hoặc buglist đã sạch nhưng phase còn treo.
 * Chỉ dùng 2 phase có sẵn trong vocab, không đặt phase mới. `manualFinish` giữ phase cũ để hoàn tác.
 */
const { MANUAL_FINISH_PHASES } = require('./vocab');

const TO = ['done-fe', 'closed'];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function finishIssue(state, key, to, { nowISO, expectPhase }) {
  const issue = state.issues?.[key];
  if (!issue) fail(404, `không có ${key} trong state.json`);
  if (!TO.includes(to)) fail(400, `chỉ chuyển sang ${TO.join(' / ')}`);
  if (issue.phase !== expectPhase) fail(409, `${key} vừa đổi sang "${issue.phase}" — xem lại trước khi báo xong`);
  if (!MANUAL_FINISH_PHASES.includes(issue.phase)) fail(400, `${key} không ở chờ test / fix bug`);

  const next = structuredClone(state);
  const target = next.issues[key];
  target.phase = to;
  target.manualFinish = { from: issue.phase, at: nowISO };
  if (to === 'closed') {
    target.closedAt = nowISO;
    target.closedReason = 'user đóng từ console';
  }
  const reason = to === 'closed' ? 'console-manual — user đóng' : 'console-manual — user báo xong';
  return { state: next, log: { at: nowISO, key, from: issue.phase, to, reason } };
}

function reopenIssue(state, key, { nowISO }) {
  const issue = state.issues?.[key];
  if (!issue) fail(404, `không có ${key} trong state.json`);
  if (!issue.manualFinish) fail(400, `${key} không phải do bạn báo xong từ console — không hoàn tác được`);

  const next = structuredClone(state);
  const target = next.issues[key];
  const from = target.phase;
  target.phase = issue.manualFinish.from;
  delete target.manualFinish;
  delete target.closedAt;
  delete target.closedReason;
  return { state: next, log: { at: nowISO, key, from, to: target.phase, reason: 'console-manual — hoàn tác' } };
}

module.exports = { finishIssue, reopenIssue };
