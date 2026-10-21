import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-lock-'));
const { acquire, release, holdCampaign, claimCampaign, releaseCampaign, heldCampaigns, isInterrupted, holdRepo, releaseRepos, runLock, waitLock } = await import('./lock.mjs');
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

test('isInterrupted: run running mà không process nào giữ lock run của chính nó', () => {
  const running = { ...A, status: 'running' };
  const file = path.join(dir, `.lock-${runLock(A)}`);
  assert.strictEqual(isInterrupted(running), true);
  fs.writeFileSync(file, JSON.stringify({ pid: 999999, ...A }));
  assert.strictEqual(isInterrupted(running), true);
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, ...A }));
  assert.strictEqual(isInterrupted(running), false);
  fs.rmSync(file);
  assert.strictEqual(isInterrupted({ ...A, status: 'paused' }), false);
});

test('lock run tách theo từng run: 2 run khác nhau giữ lock cùng lúc được', () => {
  assert.deepStrictEqual(acquire(runLock(A), A), { ok: true });
  assert.deepStrictEqual(acquire(runLock(B), B), { ok: true });
});

test('claimCampaign: campaign đang bị run khác (chưa xong) giữ → từ chối; run cũ xong/bị xoá thì nhường', () => {
  saveRun({ ...A, status: 'paused' });
  assert.deepStrictEqual(claimCampaign('/c1', A), { ok: true });
  const refused = claimCampaign('/c1', B);
  assert.deepStrictEqual([refused.ok, refused.holder.key], [false, 'GW-1']);
  assert.deepStrictEqual(claimCampaign('/c2', B), { ok: true });
  saveRun({ ...A, status: 'done' });
  assert.deepStrictEqual(claimCampaign('/c1', B), { ok: true });
});

test('waitLock: chờ tới khi chủ cũ nhả; isAborted → trả false không giữ', async () => {
  acquire('commit', A);
  setTimeout(() => release('commit', A), 120);
  assert.strictEqual(await waitLock('commit', B, { pollMs: 20 }), true);
  assert.strictEqual(acquire('commit', A).ok, false);
  assert.strictEqual(await waitLock('commit', A, { pollMs: 20, isAborted: () => true }), false);
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

test('holdRepo: run có campaign dùng chung repo; run chưa có campaign giữ riêng; chủ cũ xong/bị xoá hoặc nhả thì nhường', () => {
  const C = { key: 'GW-3', runId: 'r3' };
  saveRun({ ...A, status: 'paused' });
  saveRun({ ...B, status: 'paused' });
  assert.deepStrictEqual(holdRepo('/repo', A, { shared: true }), { ok: true });
  assert.deepStrictEqual(holdRepo('/repo', A, { shared: true }), { ok: true });
  assert.deepStrictEqual(holdRepo('/repo', B, { shared: true }), { ok: true });
  const exclusive = holdRepo('/repo', C);
  assert.deepStrictEqual([exclusive.ok, exclusive.holder.key], [false, 'GW-1']);
  releaseRepos(A);
  releaseRepos(B);
  saveRun({ ...C, status: 'paused' });
  assert.deepStrictEqual(holdRepo('/repo', C), { ok: true });
  const refused = holdRepo('/repo', A, { shared: true });
  assert.deepStrictEqual([refused.ok, refused.holder.key], [false, 'GW-3']);
  assert.deepStrictEqual(holdRepo('/other', A, { shared: true }), { ok: true });
  saveRun({ ...C, status: 'done' });
  assert.deepStrictEqual(holdRepo('/repo', A, { shared: true }), { ok: true });
  fs.rmSync(path.join(dir, 'GW-1'), { recursive: true });
  assert.deepStrictEqual(holdRepo('/repo', C), { ok: true });
});

test('holdRepo đọc được file .repos.json định dạng cũ (1 chủ/repo)', () => {
  saveRun({ ...A, status: 'paused' });
  fs.writeFileSync(path.join(dir, '.repos.json'), JSON.stringify({ '/repo': A }));
  assert.strictEqual(holdRepo('/repo', B, { shared: true }).ok, false);
  releaseRepos(A);
  assert.deepStrictEqual(holdRepo('/repo', B, { shared: true }), { ok: true });
});
