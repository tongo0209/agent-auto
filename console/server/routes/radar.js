const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON, readJSONL } = require('../lib/fsutil');
const { snapshot, writeAtomic } = require('../lib/backup');
const { radarStatus } = require('../lib/radar');

const router = Router();

/** GET /api/radar — trạng thái radar nền, đọc history/radar.jsonl (CHỈ ĐỌC) */
router.get('/radar', (_req, res) => {
  const cfg = readJSON(file.config, {}).radar || {};
  res.json(radarStatus({ rows: readJSONL(file.radar), cfg, now: new Date() }));
});

/**
 * POST /api/radar/toggle — bật/tắt bằng `config.radar.enabled`, KHÔNG đụng launchctl: tick vẫn
 * nổ đúng nhịp rồi thoát ngay ở cổng giờ. Đổi 1 khoá JSON thì hoàn tác được và thấy được trong
 * backup; còn bootout/bootstrap từ server web mà lỗi thì user mất radar mà không biết vì sao.
 */
router.post('/radar/toggle', (req, res) => {
  const cfg = readJSON(file.config, null);
  if (!cfg) return res.status(500).json({ error: 'không đọc được config.json' });
  cfg.radar = { ...(cfg.radar || {}), enabled: Boolean(req.body?.enabled) };
  snapshot(file.config, 'config'); // luật của repo: backup trước MỌI lần console ghi
  writeAtomic(file.config, JSON.stringify(cfg, null, 2) + '\n');
  res.json({ enabled: cfg.radar.enabled });
});

module.exports = router;
