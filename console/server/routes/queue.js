const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON, todayStr } = require('../lib/fsutil');
const { writeAtomic } = require('../lib/backup');
const { through } = require('../lib/cache');
const { readBoard, readAllNeedYou } = require('../lib/board');
const { buildDebt } = require('../lib/debt');
const { buildBugs } = require('../lib/bugs');
const { reviewForIssues } = require('../lib/review');
const { currentAlerts, currentDoctor } = require('../lib/sources');
const { buildQueue, applySnooze, pruneSnoozes } = require('../lib/queue');

const router = Router();
const REVIEW_TTL = 5000; // cùng khoá cache với /api/review — git status không chạy 2 lần
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/queue — hàng đợi "Làm gì tiếp": now · waiting · debt · snoozed */
router.get('/queue', async (_req, res) => {
  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const today = todayStr();
  const [alerts, doctor, review] = await Promise.all([
    currentAlerts(),
    currentDoctor(),
    through('review', REVIEW_TTL, () => reviewForIssues(state, config.repos || {})),
  ]);
  const pending = buildBugs({ state, now: new Date() }).pending;
  res.json({
    today,
    ...buildQueue({
      today,
      issues: state.issues || {},
      alerts: alerts.items,
      doctor,
      board: readBoard(),
      debt: buildDebt({ boards: readAllNeedYou(), today, state }),
      review: review.value,
      bugs: [...pending.verified, ...pending.unverified],
      snoozes: readJSON(file.snooze, {}),
    }),
  });
});

/** POST /api/queue/snooze { id, until: 'YYYY-MM-DD' | null, level, text } — `null` = bỏ hoãn */
router.post('/queue/snooze', (req, res) => {
  const { id, until, level, text } = req.body || {};
  if (!id || (until !== null && !DATE_RE.test(String(until))))
    return res.status(400).json({ error: 'cần id và until dạng YYYY-MM-DD (hoặc null để bỏ hoãn)' });
  const snoozes = pruneSnoozes(readJSON(file.snooze, {}), todayStr());
  writeAtomic(file.snooze, JSON.stringify(applySnooze(snoozes, { id, until, level, text }), null, 2) + '\n');
  res.json({ id, until });
});

module.exports = router;
