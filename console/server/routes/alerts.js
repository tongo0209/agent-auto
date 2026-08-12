const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON, todayStr } = require('../lib/fsutil');
const { through } = require('../lib/cache');
const { activityForIssue } = require('../lib/activity');
const { buildAlerts } = require('../lib/alerts');
const { readAllNeedYou } = require('../lib/board');
const { buildDebt } = require('../lib/debt');

const router = Router();
const TTL = 60000; // git log per-path nặng; cảnh báo "đứng yên" đổi theo ngày, không theo giây

/** GET /api/alerts — cảnh báo chủ động (mốc gấp · quá mốc · đứng yên · design chưa tải) */
router.get('/alerts', async (_req, res) => {
  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const today = todayStr();

  const { value: activity } = await through('alerts-activity', TTL, async () => {
    const map = {};
    for (const [key, issue] of Object.entries(state.issues || {})) {
      if (issue.phase !== 'coding') continue; // chỉ phase này cần biết "đứng yên"
      map[key] = await activityForIssue(key, issue, config.repos || {}, config.gitAuthor || '');
    }
    return map;
  });

  const debt = buildDebt({ boards: readAllNeedYou(), today, state });
  res.json({ items: buildAlerts(state, today, activity, debt), today });
});

module.exports = router;
