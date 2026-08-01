const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON } = require('../lib/fsutil');
const { distDirFor, safeKey } = require('../lib/ticket');

const router = Router();

/**
 * GET /preview/:key/* — serve `dist/` thật của ticket ngay trong console.
 *
 * Để làm gì: xem landing cạnh ảnh design trong cùng một trang (iframe CÙNG ORIGIN nên đọc
 * được scrollTop để cuộn đồng bộ). Trước đây phải tự `cd` vào campaign rồi `npx http-server`.
 *
 * Chỉ đọc, chỉ trong `dist/` của ticket: mọi path resolve xong phải còn nằm trong đó.
 */
router.get('/preview/:key/*', (req, res) => {
  const key = safeKey(req.params.key);
  if (!key) return res.status(400).type('text/plain').send('key không hợp lệ');

  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const found = distDirFor(key, state, config.repos || {});
  if (!found) return res.status(404).type('text/plain').send('Chưa có dist/ cho ' + key + ' (gắn folder + build trước).');

  const rel = req.params[0] || 'index.html';
  const abs = path.resolve(found.dist, rel);
  if (abs !== found.dist && !abs.startsWith(found.dist + path.sep))
    return res.status(403).type('text/plain').send('path ra ngoài dist');

  const target = fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? path.join(abs, 'index.html') : abs;
  if (!fs.existsSync(target)) return res.status(404).type('text/plain').send('không có ' + rel + ' trong dist/');
  res.sendFile(target);
});

module.exports = router;
