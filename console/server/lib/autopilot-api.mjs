// View thuần cho trang /autopilot — đọc runs/ qua store của tools/lib/autopilot, không tự ghi run.json
import fs from 'node:fs';
import path from 'node:path';
import { listRuns, runDir } from '../../../tools/lib/autopilot/store.mjs';
import { loadFlow, listFlows } from '../../../tools/lib/autopilot/flows.mjs';
import { stageOf } from '../../../tools/lib/autopilot/engine.mjs';
import { stageCells, totals } from '../../../tools/lib/autopilot/format.mjs';

const STATUS_ORDER = ['paused', 'attached', 'running', 'stopped', 'done'];
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KEY = /^[A-Z][A-Z0-9]*-[A-Za-z0-9-]+$/;

function viewOf(run) {
  const flow = loadFlow(run.flow);
  return {
    ...run,
    flowLabel: flow.label,
    cells: stageCells(run, flow),
    totals: totals(run),
    show: stageOf(flow, run.stage)?.show ?? [],
    command: stageOf(flow, run.stage)?.command ?? null,
  };
}

export async function listView() {
  const runs = listRuns()
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.runId.localeCompare(a.runId))
    .map(viewOf);
  return { runs, flows: listFlows().map((id) => ({ id, label: loadFlow(id).label })) };
}

export function listArtifacts(key, runId) {
  if (!SAFE_SEGMENT.test(key) || !SAFE_SEGMENT.test(runId)) return [];
  const dir = runDir(key, runId);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f !== 'run.json').sort() : [];
}

export function artifactFile(key, runId, name) {
  if (![key, runId, name].every((s) => SAFE_SEGMENT.test(s))) return null;
  const file = path.join(runDir(key, runId), name);
  return fs.existsSync(file) ? file : null;
}

export function actionArgs(action, { key, note, input, flow } = {}) {
  if (action === 'run') {
    if (!input || input.startsWith('-')) throw new Error('input không hợp lệ');
    if (flow && !listFlows().includes(flow)) throw new Error('flow không có');
    return ['run', input, ...(flow ? ['--flow', flow] : [])];
  }
  if (!['approve', 'reject', 'resume', 'abort'].includes(action)) throw new Error(`action lạ: ${action}`);
  if (!KEY.test(key ?? '')) throw new Error('key không hợp lệ');
  if (action === 'reject' && !note?.trim()) throw new Error('reject cần note');
  return [action, key, ...(note?.trim() ? ['--note', note.trim()] : [])];
}
