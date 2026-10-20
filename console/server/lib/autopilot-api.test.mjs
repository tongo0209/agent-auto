import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-api-'));
const { listView, artifactFile, listArtifacts, actionArgs } = await import('./autopilot-api.mjs');
const { saveRun, writeArtifact } = await import('../../../tools/lib/autopilot/store.mjs');

const run = {
  key: 'GW-1', runId: '20261020-100000', flow: 'landing-fix', status: 'paused', stage: 'approve-plan', stopReason: null,
  routerReason: 'x', campaignDir: '/c', blockedBy: [], loops: {}, sessions: {}, budget: { usd: 25, minutes: 120 },
  receipts: [{ stage: 'plan', round: 1, verdict: 'pass', blocking: 0, advisory: 0, turns: 10, costUsd: 1.5, ms: 60000 }],
};
saveRun(run);
writeArtifact(run, 'plan.md', '# Sửa tab');
saveRun({ ...run, key: 'GW-2', status: 'done', stage: null });

test('listView: chờ bạn xếp trước, có cells + totals + show của stage hiện tại', async () => {
  const view = await listView();
  assert.deepStrictEqual(view.runs.map((r) => r.key), ['GW-1', 'GW-2']);
  const first = view.runs[0];
  assert.strictEqual(first.cells.find((c) => c.id === 'approve-plan').state, 'waiting');
  assert.deepStrictEqual(first.totals, { runs: 1, turns: 10, minutes: 1, usd: 1.5 });
  assert.deepStrictEqual(first.show, ['plan.md', 'plan-review-r*.json']);
  assert.ok(first.flowLabel.length > 0);
});

test('artifact: chỉ đọc file trong thư mục run, chặn path traversal', () => {
  assert.ok(artifactFile('GW-1', '20261020-100000', 'plan.md').endsWith('plan.md'));
  assert.strictEqual(artifactFile('GW-1', '20261020-100000', '../../.lock-run'), null);
  assert.strictEqual(artifactFile('../x', '20261020-100000', 'plan.md'), null);
  assert.strictEqual(artifactFile('GW-1', '20261020-100000', 'khong-co.md'), null);
  assert.deepStrictEqual(listArtifacts('GW-1', '20261020-100000'), ['plan.md']);
});

test('actionArgs: dựng đúng lệnh CLI, chặn đầu vào xấu', () => {
  assert.deepStrictEqual(actionArgs('approve', { key: 'GW-1' }), ['approve', 'GW-1']);
  assert.deepStrictEqual(actionArgs('reject', { key: 'GW-1', note: 'thêm tab' }), ['reject', 'GW-1', '--note', 'thêm tab']);
  assert.deepStrictEqual(actionArgs('run', { input: 'GW-9', flow: 'feature' }), ['run', 'GW-9', '--flow', 'feature']);
  assert.throws(() => actionArgs('reject', { key: 'GW-1' }), /note/);
  assert.throws(() => actionArgs('rm', { key: 'GW-1' }), /action/);
  assert.throws(() => actionArgs('approve', { key: 'GW-1; rm -rf /' }), /key/);
  assert.throws(() => actionArgs('run', { input: 'GW-9', flow: '../x' }), /flow/);
});
