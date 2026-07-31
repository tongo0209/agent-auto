const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON, todayStr } = require('../lib/fsutil');

const router = Router();
const DEFAULT_MONTHS = 3; // mặc định chỉ 3 tháng gần nhất — đủ nhìn, không tràn màn hình

/**
 * GET /api/months — task Jira nhóm theo THÁNG CỦA DUE DATE (mốc kế hoạch).
 *
 * Nguồn: history/months.json — snapshot REAL do skill /daily query thẳng Jira mỗi lần chạy
 * (assignee = tôi, duedate trong ~9 tháng quanh hiện tại, MỌI status).
 * `done` lấy theo statusCategory hiện tại của ticket, KHÔNG theo resolutiondate —
 * nhiều ticket ở status COMPLETED không có resolutiondate nên lọc theo ngày resolve sẽ hụt.
 *
 * Chưa có snapshot → tạm dựng từ state.json để console không trống.
 */
router.get('/months', (req, res) => {
  const snapshot = readJSON(file.months, null);
  const limit = req.query.limit === 'all' ? Infinity : Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_MONTHS);

  if (snapshot && snapshot.months) {
    const all = Object.entries(snapshot.months)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, issues]) => {
        const done = issues.filter((i) => i.done).length;
        return { month, total: issues.length, done, doing: issues.length - done, issues };
      });
    return res.json({
      generatedAt: snapshot.generatedAt || null,
      source: 'jira',
      months: all.slice(0, limit === Infinity ? all.length : limit),
      totalMonths: all.length,
    });
  }

  const state = readJSON(file.state, { issues: {} });
  const byMonth = {};
  for (const [key, issue] of Object.entries(state.issues || {})) {
    const due = (issue.milestones || {}).html || issue.duedate || todayStr();
    const month = due.slice(0, 7);
    (byMonth[month] = byMonth[month] || []).push({
      key,
      summary: issue.summary || '',
      status: issue.status || '',
      done: ['done-fe', 'closed'].includes(issue.phase),
      duedate: due,
    });
  }
  const months = Object.entries(byMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, issues]) => {
      const done = issues.filter((i) => i.done).length;
      return { month, total: issues.length, done, doing: issues.length - done, issues };
    });

  res.json({ generatedAt: null, source: 'state-fallback', months });
});

module.exports = router;
