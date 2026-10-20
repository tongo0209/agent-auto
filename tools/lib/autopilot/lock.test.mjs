import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-lock-'));
const { acquire, release, holdCampaign, releaseCampaign, heldCampaigns } = await import('./lock.mjs');

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
