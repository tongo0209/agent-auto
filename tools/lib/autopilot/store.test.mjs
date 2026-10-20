import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-store-'));
const { runsDir, newRunId, runDir, saveRun, loadRun, listRuns, writeArtifact } = await import('./store.mjs');

beforeEach(() => fs.rmSync(runsDir(), { recursive: true, force: true }));

const run = (key, runId, extra = {}) => ({ key, runId, stage: 'plan', status: 'running', receipts: [], ...extra });

test('newRunId theo giờ local YYYYMMDD-HHmmss', () => {
  assert.strictEqual(newRunId(new Date(2026, 9, 20, 9, 5, 7)), '20261020-090507');
});

test('saveRun ghi nguyên tử, loadRun không runId lấy run mới nhất', () => {
  saveRun(run('GW-1', '20261020-090000'));
  saveRun(run('GW-1', '20261020-100000', { stage: 'implement' }));
  assert.strictEqual(loadRun('GW-1').stage, 'implement');
  assert.strictEqual(loadRun('GW-1', '20261020-090000').stage, 'plan');
  assert.deepStrictEqual(fs.readdirSync(runDir('GW-1', '20261020-100000')).filter((f) => f.includes('.tmp')), []);
});

test('loadRun KEY chưa có → null', () => {
  assert.strictEqual(loadRun('GW-404'), null);
});

test('listRuns mỗi KEY một run mới nhất', () => {
  saveRun(run('GW-1', '20261020-090000'));
  saveRun(run('GW-1', '20261020-100000'));
  saveRun(run('GW-2', '20261020-110000'));
  assert.deepStrictEqual(listRuns().map((r) => r.runId).sort(), ['20261020-100000', '20261020-110000']);
});

test('writeArtifact ghi vào thư mục run', () => {
  const r = run('GW-1', '20261020-090000');
  const p = writeArtifact(r, 'plan.md', '# x');
  assert.strictEqual(fs.readFileSync(p, 'utf8'), '# x');
  assert.strictEqual(path.dirname(p), runDir('GW-1', '20261020-090000'));
});
