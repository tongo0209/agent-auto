const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { Router } = require('express');
const { AGENT_AUTO, file, dir } = require('../lib/paths');
const { readJSON } = require('../lib/fsutil');
const { ticketDetail, designImagePath, distDirFor, safeKey } = require('../lib/ticket');

const router = Router();
const GATE_TIMEOUT = 60000;

/** GET /api/ticket/:key — mọi thứ của 1 ticket trong 1 lần gọi */
router.get('/ticket/:key', async (req, res) => {
  const out = await ticketDetail(req.params.key);
  if (out.error) return res.status(404).json(out);
  res.json(out);
});

/**
 * GET /api/design/:key/:name — phục vụ ảnh design.
 * Đường dẫn đã qua `designImagePath`: bắt buộc nằm trong `designs/<KEY>/` và là file ảnh.
 */
router.get('/design/:key/:name', (req, res) => {
  const abs = designImagePath(req.params.key, req.params.name);
  if (!abs) return res.status(404).type('text/plain').send('không có ảnh đó trong designs/<KEY>');
  res.sendFile(abs, { maxAge: 60000 });
});

/**
 * POST /api/gate/run/:key — chạy `tools/fe-gate.mjs` THẬT trên dist của ticket.
 *
 * Đây là 1 trong 2 việc console được tự chạy (cùng với serve dist) vì gate CHỈ ĐỌC dist và
 * chỉ ghi vào `knowledge/` của agent-auto — không đụng repo, không commit, không push.
 * Exit code 1 = gate FAIL, KHÔNG phải lỗi hệ thống: vẫn trả 200 kèm báo cáo.
 */
router.post('/gate/run/:key', (req, res) => {
  const key = safeKey(req.params.key);
  if (!key) return res.status(400).json({ error: 'key không hợp lệ' });

  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const found = distDirFor(key, state, config.repos || {});
  if (!found)
    return res.status(404).json({
      error: 'chưa tìm được dist/ của ' + key + ' — gắn folder bằng `/daily link ' + key + '` và build trước',
    });

  const report = path.join(dir.gates, key + '.json');
  const args = [
    path.join(AGENT_AUTO, 'tools', 'fe-gate.mjs'),
    found.dist,
    '--json',
    report,
    '--lessons',
    file.lessons,
    '--quiet',
  ];
  const designDir = path.join(dir.designs, key);
  if (fs.existsSync(designDir)) args.push('--design', designDir);

  fs.mkdirSync(dir.gates, { recursive: true });
  execFile('node', args, { timeout: GATE_TIMEOUT }, (err) => {
    // err.code 1 = có ERROR (kết quả nghiệp vụ). Chỉ code ≠ 0/1 hoặc timeout mới là lỗi thật.
    if (err && err.code !== 1) {
      return res.status(500).json({ error: 'chạy gate lỗi: ' + (err.killed ? 'timeout' : err.message) });
    }
    const out = readJSON(report, null);
    if (!out) return res.status(500).json({ error: 'gate chạy xong nhưng không đọc được báo cáo' });
    res.json({ ok: true, dist: found.dist, report: out });
  });
});

module.exports = router;
