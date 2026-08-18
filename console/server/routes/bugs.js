const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON } = require('../lib/fsutil');
const { buildBugs } = require('../lib/bugs');

const router = Router();

/** GET /api/bugs — hàng chờ bạn duyệt + động tĩnh buglist, đọc state.bugWatch (CHỈ ĐỌC) */
router.get('/bugs', (_req, res) => {
  res.json(buildBugs({ state: readJSON(file.state, { bugWatch: {} }), now: new Date() }));
});

module.exports = router;
