const { Router } = require('express');
const path = require('path');
const { file, AGENT_AUTO } = require('../lib/paths');
const { readJSON } = require('../lib/fsutil');
const { snapshot, writeAtomic } = require('../lib/backup');
const { buildBugs } = require('../lib/bugs');

// Node 25 cho require file ESM — dùng thẳng hàm của tool để console và CLI không lệch luật
const { unfollowSheet, followSheet, isWatched } = require(path.join(AGENT_AUTO, 'tools', 'bug-radar.mjs'));

const router = Router();

/** GET /api/bugs — hàng chờ bạn duyệt + động tĩnh buglist, đọc state.bugWatch (CHỈ ĐỌC) */
router.get('/bugs', (_req, res) => {
  res.json(buildBugs({ state: readJSON(file.state, { bugWatch: {} }), now: new Date() }));
});

/**
 * POST /api/bugs/watch — bật/tắt theo dõi 1 buglist. Sheet tắt thì lượt bugwatch không đọc nữa
 * (mỗi lần đọc sheet ~90s + token), và state-doctor thôi nhắc W8.
 */
router.post('/bugs/watch', (req, res) => {
  const { sheetId, watching, reason } = req.body || {};
  const state = readJSON(file.state, null);
  const entry = state?.bugWatch?.[sheetId];
  if (!entry) return res.status(404).json({ error: 'không có sheet này trong watchlist' });

  state.bugWatch[sheetId] = watching ? followSheet(entry) : unfollowSheet(entry, reason || 'tắt từ console');
  snapshot(file.state, 'state');
  writeAtomic(file.state, JSON.stringify(state, null, 2) + '\n');
  res.json({ sheetId, watching: isWatched(state.bugWatch[sheetId]) });
});

module.exports = router;
