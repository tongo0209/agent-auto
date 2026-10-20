import fs from 'node:fs';
import path from 'node:path';
import { parseOptions } from './format.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

export const runsDir = () => process.env.AUTOPILOT_RUNS_DIR || path.join(REPO_ROOT, 'runs');

const pad = (n) => String(n).padStart(2, '0');

export const newRunId = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export const runDir = (key, runId) => path.join(runsDir(), key, runId);

// CLI pause chỉ thả file này; run.json do process driver ghi
export const pauseFile = (key, runId) => path.join(runDir(key, runId), '.pause');
export const childFile = (key, runId) => path.join(runDir(key, runId), '.child');

export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export const saveRun = (run) => writeJsonAtomic(path.join(runDir(run.key, run.runId), 'run.json'), run);

function latestRunId(key) {
  const dir = path.join(runsDir(), key);
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'run.json'))).sort().at(-1) ?? null;
}

export function loadRun(key, runId = latestRunId(key)) {
  if (!runId) return null;
  const file = path.join(runDir(key, runId), 'run.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

export function listRuns() {
  if (!fs.existsSync(runsDir())) return [];
  return fs.readdirSync(runsDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadRun(d.name))
    .filter(Boolean);
}

export function writeArtifact(run, name, content) {
  const file = path.join(runDir(run.key, run.runId), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return file;
}

export function planOptions(run) {
  const file = path.join(runDir(run.key, run.runId), 'plan.md');
  return fs.existsSync(file) ? parseOptions(fs.readFileSync(file, 'utf8')) : [];
}
