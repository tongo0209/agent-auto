const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { file, dir } = require('../lib/paths');
const { readJSON } = require('../lib/fsutil');
const { through } = require('../lib/cache');
const { reviewForIssues, diffFile } = require('../lib/review');

const router = Router();
const REVIEW_TTL = 5000; // panel poll → git status không được chạy mỗi 3s cho mọi repo

/** GET /api/review — diff đang chờ review, gom theo ticket */
router.get('/review', async (_req, res) => {
  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const { value, cached } = await through('review', REVIEW_TTL, () => reviewForIssues(state, config.repos || {}));
  res.json({ items: value, cached, repos: Object.keys(config.repos || {}) });
});

/** GET /api/review/diff?repo=&path= — diff 1 file (text/plain) */
router.get('/review/diff', async (req, res) => {
  const config = readJSON(file.config, {});
  const out = await diffFile(config.repos || {}, String(req.query.repo || ''), String(req.query.path || ''));
  if (out.error) return res.status(403).type('text/plain').send('fe-console: ' + out.error);
  res.type('text/plain').send(out.text);
});

/** GET /api/gates — tổng hợp gate của mọi ticket đã từng chạy */
router.get('/gates', (_req, res) => {
  // Không cần khởi tạo `[]`: nhánh catch return ngay, nên tới dòng `.map` bên dưới
  // chắc chắn `files` đã được gán trong try.
  let files;
  try {
    files = fs.readdirSync(dir.gates).filter((f) => f.endsWith('.json'));
  } catch {
    return res.json({ items: [] });
  }
  const items = files.map((f) => {
    const r = readJSON(path.join(dir.gates, f), {});
    return {
      key: f.replace('.json', ''),
      at: r.at || null,
      pass: r.pass === true,
      error: r.counts?.error ?? null,
      warn: r.counts?.warn ?? null,
    };
  });
  res.json({ items: items.sort((a, b) => String(b.at).localeCompare(String(a.at))) });
});

module.exports = router;
