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

// Mỗi run 1 lock process riêng: nhiều task chạy song song, nhưng 1 run không bị 2 process cùng drive
export const runLock = (owner) => `run-${owner.key}-${owner.runId}`;

// Chờ lock bận (vd cổng commit của run khác đang build/pull) thay vì dừng run
export async function waitLock(name, owner, { pollMs = 2000, isAborted = () => false } = {}) {
  for (;;) {
    if (isAborted()) return false;
    if (acquire(name, owner).ok) return true;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

// running trên đĩa mà không process nào còn giữ lock run của nó = bị tắt ngang
export function isInterrupted(run) {
  if (run.status !== 'running') return false;
  const holder = readJson(lockFile(runLock(run)), null);
  return !(holder && sameOwner(holder, run) && isAlive(holder.pid));
}

export const heldCampaigns = () => readJson(heldFile(), {});

// Giữ tới khi run xong/bị xoá (qua cả lúc chờ duyệt, không theo pid)
const isOver = (owner) => {
  const run = loadRun(owner.key, owner.runId);
  return !run || run.status === 'done';
};

export function holdCampaign(campaignDir, owner) {
  withMutex('held', () => writeJsonAtomic(heldFile(), { ...heldCampaigns(), [campaignDir]: { key: owner.key, runId: owner.runId } }));
}

// Kiểm và giữ trong 1 mutex: 2 run song song không cùng nhận được 1 campaign
export function claimCampaign(campaignDir, owner) {
  return withMutex('held', () => {
    const held = heldCampaigns();
    const holder = held[campaignDir];
    if (holder && holder.key !== owner.key && !isOver(holder)) return { ok: false, holder };
    writeJsonAtomic(heldFile(), { ...held, [campaignDir]: { key: owner.key, runId: owner.runId } });
    return { ok: true };
  });
}

export function releaseCampaign(owner) {
  withMutex('held', () => {
    const kept = Object.entries(heldCampaigns()).filter(([, o]) => !sameOwner(o, owner));
    writeJsonAtomic(heldFile(), Object.fromEntries(kept));
  });
}

// File cũ ghi 1 chủ/repo dạng {key, runId}; mới là danh sách chủ, mỗi chủ shared hoặc giữ riêng
const repoHolders = (entry) => (Array.isArray(entry) ? entry : entry ? [{ ...entry, shared: false }] : []);

// Run đã có campaign thì chung repo với run khác (campaign đã khoá riêng); run chưa có campaign giữ cả repo
export function holdRepo(top, owner, { shared = false } = {}) {
  return withMutex('repos', () => {
    const held = readJson(reposFile(), {});
    const others = repoHolders(held[top]).filter((h) => !sameOwner(h, owner) && !isOver(h));
    const blocker = others.find((h) => !shared || !h.shared);
    if (blocker) return { ok: false, holder: blocker };
    writeJsonAtomic(reposFile(), { ...held, [top]: [...others, { key: owner.key, runId: owner.runId, shared }] });
    return { ok: true };
  });
}

export function releaseRepos(owner) {
  withMutex('repos', () => {
    const entries = Object.entries(readJson(reposFile(), {}))
      .map(([top, entry]) => [top, repoHolders(entry).filter((h) => !sameOwner(h, owner))])
      .filter(([, holders]) => holders.length);
    writeJsonAtomic(reposFile(), Object.fromEntries(entries));
  });
}
