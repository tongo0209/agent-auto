import fs from 'node:fs';
import path from 'node:path';
import { runsDir, writeJsonAtomic, loadRun } from './store.mjs';

const lockFile = (name) => path.join(runsDir(), `.lock-${name}`);
const heldFile = () => path.join(runsDir(), '.held.json');
const reposFile = () => path.join(runsDir(), '.repos.json');
const sameOwner = (a, b) => a.key === b.key && a.runId === b.runId;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

const STALE_MUTEX_MS = 5000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// mkdir nguyên tử: chỉ 1 process được đọc-rồi-ghi file lock tại một thời điểm
function withMutex(name, fn) {
  const mutex = `${lockFile(name)}.mutex`;
  fs.mkdirSync(runsDir(), { recursive: true });
  for (;;) {
    try {
      fs.mkdirSync(mutex);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Process giữ mutex chết giữa chừng thì mutex mồ côi; quá hạn mới gỡ
      const age = Date.now() - (fs.statSync(mutex, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (age > STALE_MUTEX_MS) fs.rmSync(mutex, { recursive: true, force: true });
      sleep(5);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(mutex, { recursive: true, force: true });
  }
}

export function acquire(name, owner) {
  return withMutex(name, () => {
    const holder = readJson(lockFile(name), null);
    const mine = holder && holder.pid === process.pid && sameOwner(holder, owner);
    if (holder && !mine && isAlive(holder.pid)) return { ok: false, holder };
    writeJsonAtomic(lockFile(name), { pid: process.pid, key: owner.key, runId: owner.runId, at: new Date().toISOString() });
    return { ok: true };
  });
}

export function release(name, owner) {
  withMutex(name, () => {
    const holder = readJson(lockFile(name), null);
    if (holder && sameOwner(holder, owner)) fs.rmSync(lockFile(name));
  });
}

// running trên đĩa mà không process nào còn giữ lock run của nó = bị tắt ngang
export function isInterrupted(run) {
  if (run.status !== 'running') return false;
  const holder = readJson(lockFile('run'), null);
  return !(holder && sameOwner(holder, run) && isAlive(holder.pid));
}

export const heldCampaigns = () => readJson(heldFile(), {});

export function holdCampaign(campaignDir, owner) {
  writeJsonAtomic(heldFile(), { ...heldCampaigns(), [campaignDir]: { key: owner.key, runId: owner.runId } });
}

export function releaseCampaign(owner) {
  const kept = Object.entries(heldCampaigns()).filter(([, o]) => !sameOwner(o, owner));
  writeJsonAtomic(heldFile(), Object.fromEntries(kept));
}

// Run làm thẳng trên repo gốc nên mỗi repo chỉ 1 run; giữ tới khi run xong/abort (qua cả lúc chờ duyệt, không theo pid)
const isOver = (owner) => {
  const run = loadRun(owner.key, owner.runId);
  return !run || run.status === 'done';
};

export function holdRepo(top, owner) {
  return withMutex('repos', () => {
    const held = readJson(reposFile(), {});
    const holder = held[top];
    if (holder && !sameOwner(holder, owner) && !isOver(holder)) return { ok: false, holder };
    writeJsonAtomic(reposFile(), { ...held, [top]: { key: owner.key, runId: owner.runId } });
    return { ok: true };
  });
}

export function releaseRepos(owner) {
  withMutex('repos', () => {
    const kept = Object.entries(readJson(reposFile(), {})).filter(([, o]) => !sameOwner(o, owner));
    writeJsonAtomic(reposFile(), Object.fromEntries(kept));
  });
}
