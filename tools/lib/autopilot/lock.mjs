import fs from 'node:fs';
import path from 'node:path';
import { runsDir, writeJsonAtomic } from './store.mjs';

const lockFile = (name) => path.join(runsDir(), `.lock-${name}`);
const heldFile = () => path.join(runsDir(), '.held.json');
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

export function acquire(name, owner) {
  const holder = readJson(lockFile(name), null);
  const mine = holder && holder.pid === process.pid && sameOwner(holder, owner);
  if (holder && !mine && isAlive(holder.pid)) return { ok: false, holder };
  writeJsonAtomic(lockFile(name), { pid: process.pid, key: owner.key, runId: owner.runId, at: new Date().toISOString() });
  return { ok: true };
}

export function release(name, owner) {
  const holder = readJson(lockFile(name), null);
  if (holder && sameOwner(holder, owner)) fs.rmSync(lockFile(name));
}

export const heldCampaigns = () => readJson(heldFile(), {});

export function holdCampaign(campaignDir, owner) {
  writeJsonAtomic(heldFile(), { ...heldCampaigns(), [campaignDir]: { key: owner.key, runId: owner.runId } });
}

export function releaseCampaign(owner) {
  const kept = Object.entries(heldCampaigns()).filter(([, o]) => !sameOwner(o, owner));
  writeJsonAtomic(heldFile(), Object.fromEntries(kept));
}
