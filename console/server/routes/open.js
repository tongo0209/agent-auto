const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { Router } = require('express');
const { OPEN_WHITELIST } = require('../lib/paths');

const router = Router();

/**
 * POST /api/open { app: 'finder' | 'vscode', target: <abs path> }
 * Chỉ mở path nằm trong OPEN_WHITELIST — chặn console thành lỗ hổng mở file tuỳ ý.
 */
router.post('/open', (req, res) => {
  const { app: appName, target } = req.body || {};
  const abs = path.resolve(String(target || ''));

  if (!OPEN_WHITELIST.some((root) => abs === root || abs.startsWith(root + path.sep))) {
    return res.status(403).json({ error: 'path ngoài whitelist: ' + abs });
  }
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'không tồn tại: ' + abs });

  const args = appName === 'vscode' ? ['-a', 'Visual Studio Code', abs] : [abs];
  execFile('open', args, { timeout: 5000 }, (err) =>
    err ? res.status(500).json({ error: err.message }) : res.json({ ok: true, opened: abs })
  );
});

module.exports = router;
