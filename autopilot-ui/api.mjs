// View thuần cho trang /autopilot — đọc runs/ qua store của tools/lib/autopilot, không tự ghi run.json
import fs from 'node:fs';
import path from 'node:path';
import { listRuns, runDir } from '../tools/lib/autopilot/store.mjs';
import { loadFlow, listFlows } from '../tools/lib/autopilot/flows.mjs';
import { stageOf } from '../tools/lib/autopilot/engine.mjs';
import { stageCells, totals } from '../tools/lib/autopilot/format.mjs';
import { tokensOf } from '../tools/lib/autopilot/claude-runner.mjs';
import { isInterrupted } from '../tools/lib/autopilot/lock.mjs';

const STATUS_ORDER = ['paused', 'attached', 'running', 'stopped', 'done'];
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KEY = /^[A-Z][A-Z0-9]*-[A-Za-z0-9-]+$/;

const logTokens = new Map();
function tokensFromLog(run, receipt) {
  const log = path.join(runDir(run.key, run.runId), `${receipt.stage}-r${receipt.round}.log`);
  if (!logTokens.has(log)) {
    const result = fs.existsSync(log) && fs.readFileSync(log, 'utf8').split('\n').findLast((line) => line.includes('"type":"result"'));
    logTokens.set(log, result ? tokensOf(JSON.parse(result).usage) : 0);
  }
  return logTokens.get(log);
}

// run chạy trước khi receipt có trường tokens: đọc bù từ log của stage
const withTokens = (run) => ({ ...run, receipts: run.receipts.map((r) => (r.tokens != null || !r.turns ? r : { ...r, tokens: tokensFromLog(run, r) })) });

function viewOf(saved) {
  const run = withTokens(saved);
  const flow = loadFlow(run.flow);
  return {
    ...run,
    interrupted: isInterrupted(run),
    flowLabel: flow.label,
    cells: stageCells(run, flow).map((c) => {
      const stage = stageOf(flow, c.id);
      return { ...c, next: stage.next ?? null, back: stage.loop?.back ?? null, side: stage.returnTo === 'caller' };
    }),
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
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f !== 'run.json' && !f.startsWith('.')).sort() : [];
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
  if (!['approve', 'reject', 'pause', 'resume', 'abort'].includes(action)) throw new Error(`action lạ: ${action}`);
  if (!KEY.test(key ?? '')) throw new Error('key không hợp lệ');
  if (action === 'reject' && !note?.trim()) throw new Error('reject cần note');
  return [action, key, ...(note?.trim() ? ['--note', note.trim()] : [])];
}

const TAIL_BYTES = 256 * 1024;
const MAX_LINES = 300;
const clip = (s, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function toolLabel({ name, input = {} }) {
  const arg = input.file_path ?? input.command ?? input.pattern ?? input.skill ?? input.description ?? '';
  return clip(`${name} ${arg}`.trim());
}

function eventLines(event) {
  if (event.type === 'system') return event.subtype === 'init' ? [{ kind: 'init', text: `phiên ${event.model ?? ''}`.trim() }] : [];
  if (event.type === 'result') return [{ kind: 'done', text: `xong · ${event.num_turns ?? 0} lượt · $${(event.total_cost_usd ?? 0).toFixed(2)}` }];
  return (event.message?.content ?? []).flatMap((part) => {
    if (part.type === 'text' && part.text.trim()) return [{ kind: 'text', text: clip(part.text.trim(), 600) }];
    if (part.type === 'tool_use') return [{ kind: 'tool', text: toolLabel(part) }];
    if (part.type === 'tool_result') {
      const body = Array.isArray(part.content) ? part.content.map((c) => c.text ?? '').join(' ') : String(part.content ?? '');
      return [{ kind: 'result', text: clip(body.replace(/\s+/g, ' ').trim()) }];
    }
    return [];
  });
}

export function liveLog(key, runId, name) {
  const logs = listArtifacts(key, runId).filter((f) => f.endsWith('.log') && (!name || f === name));
  if (!logs.length) return null;
  const dir = runDir(key, runId);
  const file = logs.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0];
  const full = path.join(dir, file);
  const { size, mtimeMs } = fs.statSync(full);
  const fd = fs.openSync(full, 'r');
  const buf = Buffer.alloc(Math.min(size, TAIL_BYTES));
  fs.readSync(fd, buf, 0, buf.length, size - buf.length);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n').flatMap((raw) => {
    try {
      return eventLines(JSON.parse(raw));
    } catch {
      return [];
    }
  });
  return { file, mtimeMs, lines: lines.slice(-MAX_LINES) };
}
