const path = require('path');
const { Router } = require('express');
const { file, AGENT_AUTO } = require('../lib/paths');
const { readJSON } = require('../lib/fsutil');
const { snapshot, appendJSONL } = require('../lib/backup');
const { finishIssue, reopenIssue } = require('../lib/finish');

const { writeMerged } = require(path.join(AGENT_AUTO, 'tools', 'state-merge.mjs'));

const router = Router();

function apply(res, change) {
  const base = readJSON(file.state, null);
  if (!base) return res.status(500).json({ error: 'không đọc được state.json' });
  let out;
  try {
    out = change(base, new Date().toISOString());
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  snapshot(file.state, 'state');
  // Hợp nhất lúc ghi như routes/bugs.js: radar nền và /daily cũng ghi file này
  writeMerged(file.state, base, out.state);
  appendJSONL(file.phases, out.log);
  res.json(out.log);
}

/** POST /api/ticket/:key/finish { to: 'done-fe'|'closed', expectPhase } — user báo ticket chờ test / fix bug đã xong */
router.post('/ticket/:key/finish', (req, res) => {
  const { to, expectPhase } = req.body || {};
  apply(res, (state, nowISO) => finishIssue(state, String(req.params.key), to, { nowISO, expectPhase }));
});

/** POST /api/ticket/:key/reopen — hoàn tác lần báo xong ở trên */
router.post('/ticket/:key/reopen', (req, res) => {
  apply(res, (state, nowISO) => reopenIssue(state, String(req.params.key), { nowISO }));
});

module.exports = router;
