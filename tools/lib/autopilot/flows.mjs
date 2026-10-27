import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { TOOLSETS } from './claude-runner.mjs';
import { GATE_CHECKS } from './gates.mjs';
import { membersOf } from './engine.mjs';

const FLOWS_DIR = path.resolve(import.meta.dirname, '../../../flows');
export const PROMPTS_DIR = path.join(FLOWS_DIR, 'prompts');
const KINDS = ['claude', 'gate', 'pause', 'attached', 'parallel', 'sections'];
const MAX_ASK = 3;
const REF_FIELDS = ['next', 'onReject', 'onRevise', 'resume', 'rejectReturnTo'];

export const listFlows = () =>
  fs.readdirSync(FLOWS_DIR).filter((f) => f.endsWith('.json') && f !== 'router.json').map((f) => f.replace(/\.json$/, ''));

export const loadFlow = (id) => JSON.parse(fs.readFileSync(path.join(FLOWS_DIR, `${id}.json`), 'utf8'));

// Run ghim flow + prompt lúc tạo: sửa flows/ không đổi luồng của run đang chạy. Run tạo trước khi có ghim đọc bản đã commit lúc nó bắt đầu, không đọc file đang sửa dở
function committedAtStart(run, rel) {
  const rev = spawnSync('git', ['rev-list', '-1', `--before=${Math.floor(run.startedAt / 1000)}`, 'HEAD'], { cwd: FLOWS_DIR, encoding: 'utf8' }).stdout?.trim();
  if (!rev) return null;
  const shown = spawnSync('git', ['show', `${rev}:./${rel}`], { cwd: FLOWS_DIR, encoding: 'utf8' });
  return shown.status === 0 ? shown.stdout : null;
}

const readPrompt = (name) => fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8');

export function flowOfRun(run) {
  if (run.flowSnapshot) return run.flowSnapshot;
  const committed = committedAtStart(run, `${run.flow}.json`);
  return committed ? JSON.parse(committed) : loadFlow(run.flow);
}

export const promptOfRun = (run, name) => run.promptSnapshot?.[name] ?? committedAtStart(run, `prompts/${name}`) ?? readPrompt(name);

export const promptsOf = (flow) => Object.fromEntries(flow.stages.filter((s) => s.prompt).map((s) => [s.prompt, readPrompt(s.prompt)]));

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
  if (flow.budget && !Object.values(flow.budget).every((v) => v > 0)) errors.push('budget usd/minutes nếu khai thì phải > 0');
  if (!(flow.ask?.length >= 1 && flow.ask.length <= MAX_ASK)) errors.push(`ask phải có 1–${MAX_ASK} câu hỏi khi thiếu đầu vào`);
  for (const a of flow.ask ?? []) if (!a.need?.length || !a.question) errors.push(`ask thiếu need/question: ${JSON.stringify(a)}`);

  for (const s of flow.stages) {
    if (!KINDS.includes(s.kind)) errors.push(`${s.id}: kind lạ ${s.kind}`);
    for (const field of REF_FIELDS) {
      if (s[field] != null && !ids.includes(s[field])) errors.push(`${s.id}.${field} trỏ tới stage không có: ${s[field]}`);
    }
    if (s.loop && !ids.includes(s.loop.back)) errors.push(`${s.id}.loop.back trỏ tới stage không có: ${s.loop.back}`);
    for (const m of membersOf(s)) if (!ids.includes(m)) errors.push(`${s.id} gọi stage không có: ${m}`);
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
