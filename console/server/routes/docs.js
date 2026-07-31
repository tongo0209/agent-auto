const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { file, dir } = require('../lib/paths');
const { readJSONL } = require('../lib/fsutil');
const { listBoardDates, readBoardRaw } = require('../lib/board');

const router = Router();
const safeKey = (s) => String(s || '').replace(/[^A-Za-z0-9-]/g, '');
const safeDate = (s) => String(s || '').replace(/[^0-9-]/g, '');

/** GET /api/boards — danh sách ngày có board */
router.get('/boards', (_req, res) => res.json({ boards: listBoardDates() }));

/** GET /api/board/:date — nội dung board markdown */
router.get('/board/:date', (req, res) => {
  const raw = readBoardRaw(safeDate(req.params.date));
  if (raw === null) return res.status(404).send('Không có board ' + req.params.date);
  res.type('text/plain').send(raw);
});

/** GET /api/brief/:key — brief đã bóc từ ticket Jira */
router.get('/brief/:key', (req, res) => {
  const key = safeKey(req.params.key);
  const p = path.join(dir.tasks, key, 'brief.md');
  if (!fs.existsSync(p)) return res.status(404).send('Chưa có brief cho ' + key + ' — chạy /daily prep ' + key);
  res.type('text/plain').send(fs.readFileSync(p, 'utf8'));
});

/** GET /api/metrics — vòng học: ước lượng vs thực tế */
router.get('/metrics', (_req, res) => res.json({ records: readJSONL(file.metrics) }));

module.exports = router;
