const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSONL } = require('../lib/fsutil');
const { buildDelta } = require('../lib/delta');

const router = Router();

/**
 * GET /api/delta?since=<ISO> — "có gì mới từ lần bạn xem", đọc thẳng 2 sổ nhật ký
 * history/issues.jsonl + history/phases.jsonl (chỉ ĐỌC, không sửa 2 file này).
 * Thiếu `since` thì mặc định 12h trước — cùng cửa sổ với REPEAT_MS của lib/notify.js.
 */
router.get('/delta', (req, res) => {
  const since = req.query.since || new Date(Date.now() - 12 * 3600e3).toISOString();
  res.json({
    since,
    items: buildDelta({
      issueRows: readJSONL(file.issues),
      phaseRows: readJSONL(file.phases),
      sinceISO: since,
    }),
  });
});

module.exports = router;
