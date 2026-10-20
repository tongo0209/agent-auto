const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Router } = require('express');
const { AGENT_AUTO } = require('../lib/paths');
const { listView, listArtifacts, artifactFile, actionArgs } = require('../lib/autopilot-api.mjs');
const { runsDir } = require(path.join(AGENT_AUTO, 'tools', 'lib', 'autopilot', 'store.mjs'));

const router = Router();
const CLI = path.join(AGENT_AUTO, 'tools', 'autopilot.mjs');
const PAGE = path.join(__dirname, '..', 'autopilot-page', 'index.html');

router.get('/autopilot', (_req, res) => res.sendFile(PAGE));

router.get('/api/autopilot/runs', async (_req, res) => res.json(await listView()));

router.get('/api/autopilot/runs/:key/:runId/artifacts', (req, res) => res.json(listArtifacts(req.params.key, req.params.runId)));

router.get('/api/autopilot/runs/:key/:runId/artifacts/:name', (req, res) => {
  const file = artifactFile(req.params.key, req.params.runId, req.params.name);
  if (!file) return res.status(404).type('text/plain').send('không có artifact');
  res.type('text/plain; charset=utf-8').send(fs.readFileSync(file, 'utf8'));
});

// CLI chạy tách nền vì 1 lượt duyệt kéo theo nhiều stage claude — tới mốc dừng kế tiếp trang tự poll thấy
router.post('/api/autopilot/:action', (req, res) => {
  let args;
  try {
    args = actionArgs(req.params.action, req.body || {});
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  fs.mkdirSync(runsDir(), { recursive: true });
  const log = path.join(runsDir(), `console-${Date.now()}.log`);
  const out = fs.openSync(log, 'a');
  const child = spawn(process.execPath, [CLI, ...args], { cwd: AGENT_AUTO, detached: true, stdio: ['ignore', out, out] });
  child.unref();
  res.json({ ok: true, pid: child.pid, log });
});

module.exports = router;
