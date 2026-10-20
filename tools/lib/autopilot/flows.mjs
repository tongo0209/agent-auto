import fs from 'node:fs';
import path from 'node:path';
import { TOOLSETS } from './claude-runner.mjs';
import { GATE_CHECKS } from './gates.mjs';

const FLOWS_DIR = path.resolve(import.meta.dirname, '../../../flows');
export const PROMPTS_DIR = path.join(FLOWS_DIR, 'prompts');
const KINDS = ['claude', 'gate', 'pause', 'attached'];
const REF_FIELDS = ['next', 'onReject', 'onRevise', 'resume', 'rejectReturnTo'];

export const listFlows = () =>
  fs.readdirSync(FLOWS_DIR).filter((f) => f.endsWith('.json') && f !== 'router.json').map((f) => f.replace(/\.json$/, ''));

export const loadFlow = (id) => JSON.parse(fs.readFileSync(path.join(FLOWS_DIR, `${id}.json`), 'utf8'));

function edgesOf(stage, stages) {
  const targets = [stage.next, stage.onReject, stage.onRevise, stage.loop?.back];
  // stage fix (returnTo caller) quay về bất kỳ stage nào đẩy sang nó
  if (stage.returnTo === 'caller') {
    targets.push(...stages.filter((s) => s.loop?.back === stage.id || s.onReject === stage.id).map((s) => s.rejectReturnTo ?? s.id));
  }
  return targets.filter((t) => t !== undefined);
}

function reachesEnd(flow) {
  const seen = new Set();
  const queue = [flow.stages[0].id];
  while (queue.length) {
    const id = queue.shift();
    if (id === null) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const stage = flow.stages.find((s) => s.id === id);
    if (stage) queue.push(...edgesOf(stage, flow.stages));
  }
  return false;
}

export function validateFlow(flow, { promptsDir }) {
  const errors = [];
  const ids = flow.stages.map((s) => s.id);
  for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) errors.push(`stage trùng id: ${id}`);
  if (!(flow.budget?.usd > 0 && flow.budget?.minutes > 0)) errors.push('budget usd/minutes phải > 0');

  for (const s of flow.stages) {
    if (!KINDS.includes(s.kind)) errors.push(`${s.id}: kind lạ ${s.kind}`);
    for (const field of REF_FIELDS) {
      if (s[field] != null && !ids.includes(s[field])) errors.push(`${s.id}.${field} trỏ tới stage không có: ${s[field]}`);
    }
    if (s.loop && !ids.includes(s.loop.back)) errors.push(`${s.id}.loop.back trỏ tới stage không có: ${s.loop.back}`);
    if (s.kind === 'claude') {
      if (!fs.existsSync(path.join(promptsDir, s.prompt ?? ''))) errors.push(`${s.id}: thiếu prompt ${s.prompt}`);
      if (!TOOLSETS[s.toolset]) errors.push(`${s.id}: toolset lạ ${s.toolset}`);
    }
    if (s.kind === 'gate') {
      for (const c of s.checks ?? []) if (!GATE_CHECKS.includes(c)) errors.push(`${s.id}: check lạ ${c}`);
    }
  }
  if (errors.length === 0 && !reachesEnd(flow)) errors.push('không có đường từ stage đầu tới kết thúc (next: null)');
  return errors;
}
