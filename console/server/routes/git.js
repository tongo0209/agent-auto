const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON, todayStr } = require('../lib/fsutil');
const { commitsByAuthor, countMerges, lastTouch } = require('../lib/git');
const cache = require('../lib/cache');

const router = Router();
const MONTH_CHOICES = 6;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TTL_PAST_MONTH = 6 * 60 * 60 * 1000; // tháng đã qua: không đổi nữa
const TTL_THIS_MONTH = 60 * 1000; // tháng hiện tại: commit mới hiện sau ~1 phút

/** Danh sách tháng chọn được: tháng này + (MONTH_CHOICES-1) tháng trước */
function recentMonths(fromISO) {
  const [y, m] = fromISO.split('-').map(Number);
  const out = [];
  for (let i = 0; i < MONTH_CHOICES; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return out;
}

/** Khoảng ngày của một tháng: [YYYY-MM-01, tháng sau-01) */
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const next = new Date(y, m, 1);
  return {
    since: `${ym}-01`,
    until: next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-01',
    days: new Date(y, m, 0).getDate(),
  };
}

/** GET /api/git?month=YYYY-MM — commit CỦA TÔI trong tháng đó, mọi repo trong config.repos */
router.get('/git', async (req, res) => {
  const config = readJSON(file.config, {});
  const author = config.gitAuthor || 'tont';
  const today = todayStr();
  const months = recentMonths(today);
  const month = MONTH_RE.test(req.query.month || '') ? req.query.month : months[0];
  const range = monthRange(month);

  const repos = Object.entries(config.repos || {});
  const ttl = month === months[0] ? TTL_THIS_MONTH : TTL_PAST_MONTH;

  const { value: payload, cached } = await cache.through(`git:${author}:${month}`, ttl, async () => {
    const [groups, merges] = await Promise.all([
      Promise.all(repos.map(([name, p]) => commitsByAuthor(name, p, author, range))),
      Promise.all(repos.map(([, p]) => countMerges(p, author, range))),
    ]);
    return {
      commits: groups.flat().sort((a, b) => b.date.localeCompare(a.date)),
      mergeCount: merges.reduce((sum, n) => sum + n, 0),
    };
  });

  res.json({
    author,
    month,
    months,
    daysInMonth: range.days,
    commits: payload.commits,
    mergeCount: payload.mergeCount,
    cached,
  });
});

/** GET /api/promotion — trạng thái các folder gt-promotion của task đang theo dõi */
router.get('/promotion', async (_req, res) => {
  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const root = (config.repos || {})['gt-promotion-template'];
  if (!root) return res.json({ root: null, items: [] });

  const tracked = Object.entries(state.issues || {}).filter(([, i]) => i.promoFolder);
  const items = await Promise.all(
    tracked.map(async ([key, issue]) => ({
      key,
      folder: issue.promoFolder,
      last: await lastTouch(root, issue.promoFolder),
    }))
  );
  res.json({ root, items });
});

module.exports = router;
