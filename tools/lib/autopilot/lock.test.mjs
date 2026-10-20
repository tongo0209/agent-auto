import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-lock-'));
const { acquire, release, holdCampaign, releaseCampaign, heldCampaigns, isInterrupted, holdRepo, releaseRepos } = await import('./lock.mjs');
const { saveRun } = await import('./store.mjs');

const A = { key: 'GW-1', runId: 'r1' };
const B = { key: 'GW-2', runId: 'r2' };
const dir = process.env.AUTOPILOT_RUNS_DIR;

beforeEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
});

test('acquire lần 2 bị từ chối kèm holder', () => {
  assert.deepStrictEqual(acquire('run', A), { ok: true });
  const second = acquire('run', B);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.holder.key, 'GW-1');
});

test('lock của PID đã chết thì chiếm lại', () => {
  fs.writeFileSync(path.join(dir, '.lock-run'), JSON.stringify({ pid: 999999, ...A, at: 'x' }));
  assert.deepStrictEqual(acquire('run', B), { ok: true });
});

test('release sai owner không xoá', () => {
  acquire('run', A);
  release('run', B);
  assert.strictEqual(acquire('run', B).ok, false);
  release('run', A);
  assert.strictEqual(acquire('run', B).ok, true);
});

test('held campaign thêm và xoá theo owner', () => {
  holdCampaign('/repo/products/x/landing/a', A);
  holdCampaign('/repo/products/x/landing/b', B);
  releaseCampaign(A);
  assert.deepStrictEqual(heldCampaigns(), { '/repo/products/x/landing/b': B });
});

test('heldCampaigns khi chưa có file → rỗng', () => {
  assert.deepStrictEqual(heldCampaigns(), {});
});

test('cùng owner nhưng PID khác còn sống → không chiếm (2 process cùng run)', () => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.lock-run'), JSON.stringify({ pid: process.ppid, ...A }));
  assert.strictEqual(acquire('run', A).ok, false);
});

test('isInterrupted: run running mà không process nào giữ lock run của nó', () => {
  const running = { ...A, status: 'running' };
  assert.strictEqual(isInterrupted(running), true);
  fs.writeFileSync(path.join(dir, '.lock-run'), JSON.stringify({ pid: 999999, ...A }));
  assert.strictEqual(isInterrupted(running), true);
  fs.writeFileSync(path.join(dir, '.lock-run'), JSON.stringify({ pid: process.pid, ...B }));
  assert.strictEqual(isInterrupted(running), true);
  fs.writeFileSync(path.join(dir, '.lock-run'), JSON.stringify({ pid: process.pid, ...A }));
  assert.strictEqual(isInterrupted(running), false);
  fs.rmSync(path.join(dir, '.lock-run'));
  assert.strictEqual(isInterrupted({ ...A, status: 'paused' }), false);
});

test('nhiều process cùng acquire một lúc → đúng 1 process được', async () => {
  const { spawn } = await import('node:child_process');
  const lockUrl = new URL('./lock.mjs', import.meta.url).href;
  const script = `const { acquire } = await import(${JSON.stringify(lockUrl)}); while (Date.now() < Number(process.env.START_AT)); console.log(acquire('run', { key: 'GW-' + process.pid, runId: 'r' }).ok); setTimeout(() => {}, 1000);`;
  const one = () => new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('exit', () => resolve(out.trim()));
  });
  for (let round = 0; round < 5; round++) {
    fs.rmSync(path.join(dir, '.lock-run'), { force: true });
    process.env.START_AT = String(Date.now() + 400);
    const results = await Promise.all(Array.from({ length: 8 }, one));
    assert.strictEqual(results.filter((r) => r === 'true').length, 1, `vòng ${round}: ${results}`);
  }
});

test('holdRepo: 1 repo chỉ 1 run; run khác bị từ chối kèm holder; chủ cũ xong/bị xoá hoặc nhả thì nhường', () => {
  saveRun({ ...A, status: 'paused' });
  assert.deepStrictEqual(holdRepo('/repo', A), { ok: true });
  assert.deepStrictEqual(holdRepo('/repo', A), { ok: true });
  const refused = holdRepo('/repo', B);
  assert.deepStrictEqual([refused.ok, refused.holder.key], [false, 'GW-1']);
  assert.deepStrictEqual(holdRepo('/other', B), { ok: true });
  saveRun({ ...A, status: 'done' });
  assert.deepStrictEqual(holdRepo('/repo', B), { ok: true });
  releaseRepos(B);
  saveRun({ ...A, status: 'paused' });
  assert.deepStrictEqual(holdRepo('/repo', A), { ok: true });
  fs.rmSync(path.join(dir, 'GW-1'), { recursive: true });
  assert.deepStrictEqual(holdRepo('/repo', B), { ok: true });
});
