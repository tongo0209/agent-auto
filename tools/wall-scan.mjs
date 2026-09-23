#!/usr/bin/env node
// Đo thời gian thật từ transcript Claude Code: máy chạy (model/tool) tách khỏi chờ user, theo skill.
// Dùng: node tools/wall-scan.mjs [--days 14] [--project <chuỗi>] [--skill <tên>] [--top 15] [--json] [--root <thư mục>]
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const OUTSIDE = '(ngoài skill)';
export const ORPHAN = '(subagent không rõ skill)';
const MODEL_GAP_MAX = 15 * 60;
const TOOL_GAP_MAX = 60 * 60;
const WAIT_GAP_MAX = 24 * 3600;
const CARRY_BREAK = 30 * 60;
const CTX_BUCKETS = [[50e3, '<50k'], [150e3, '50-150k'], [300e3, '150-300k'], [Infinity, '>300k']];

const toolName = (name) => (name.startsWith('mcp__') ? `mcp:${name.split('__')[1]}` : name);
const ctxBucket = (usage = {}) => {
  const tokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  return CTX_BUCKETS.find(([limit]) => tokens < limit)[1];
};

// Mỗi khoảng giữa 2 mốc liên tiếp thuộc đúng 1 loại, nên tool chạy song song không bị đếm trùng.
export function sliceTimeline(lines, { session, inheritedSkill = null, sub = false }) {
  const slices = [];
  const links = {};
  const pending = new Map();
  let prev = null;
  let now = 0;
  let run = 0;
  let lastSkill;
  let carried = null;
  const push = (slice, seconds, max) => {
    if (seconds > 0 && seconds <= max) slices.push({ session, run, sub, seconds, at: now, ...slice });
  };
  for (const line of lines) {
    now = Date.parse(line.timestamp ?? '') / 1000;
    if (Number.isNaN(now)) continue;
    const gap = prev === null ? 0 : now - prev;
    const content = Array.isArray(line.message?.content) ? line.message.content : [];
    if (line.type === 'assistant') {
      // attributionSkill chỉ gắn trong lượt user đã gọi skill, nên phải giữ nhãn qua các lượt sau.
      if (line.attributionSkill) carried = line.attributionSkill;
      const skill = inheritedSkill ?? carried ?? OUTSIDE;
      if (skill !== lastSkill) { run += 1; lastSkill = skill; }
      push({ kind: 'model', skill, msgId: line.message?.id, effort: line.effort ?? line.perTurnEffort ?? 'không rõ', ctx: ctxBucket(line.message?.usage) }, gap, MODEL_GAP_MAX);
      for (const c of content) if (c.type === 'tool_use') pending.set(c.id, { name: toolName(c.name), skill, run, cmd: c.input?.command });
      prev = now;
      continue;
    }
    if (line.type !== 'user' || line.isMeta) continue;
    const results = content.filter((c) => c.type === 'tool_result');
    if (!results.length) {
      if (gap > CARRY_BREAK) carried = null;
      push({ kind: 'wait', skill: lastSkill ?? OUTSIDE }, gap, WAIT_GAP_MAX);
      prev = now;
      continue;
    }
    const issued = pending.get(results[0].tool_use_id);
    for (const r of results) pending.delete(r.tool_use_id);
    const child = line.toolUseResult?.agentId ?? line.toolUseResult?.runId;
    if (child && issued) links[child] = issued.skill;
    if (issued?.name === 'AskUserQuestion') push({ kind: 'wait', skill: issued.skill, run: issued.run }, gap, WAIT_GAP_MAX);
    else if (issued) push({ kind: 'tool', skill: issued.skill, run: issued.run, tool: issued.name, cmd: issued.cmd }, gap, TOOL_GAP_MAX);
    prev = now;
  }
  return { slices, links };
}

// Agent của Workflow mang khoá `<runId>/<agentId>` và nối qua runId.
const parentOf = (id) => id.split('/')[0];

// Subagent có thể sinh subagent khác, nên nối lặp tới khi hết file nối được; phần còn lại vào ORPHAN.
export function scanSession({ session, main, subagents = {} }) {
  const root = sliceTimeline(main, { session });
  const slices = [...root.slices];
  const links = { ...root.links };
  let waiting = Object.keys(subagents);
  while (waiting.length) {
    const ready = waiting.filter((id) => parentOf(id) in links);
    const batch = ready.length ? ready : waiting;
    for (const id of batch) {
      const r = sliceTimeline(subagents[id], { session, inheritedSkill: links[parentOf(id)] ?? ORPHAN, sub: true });
      slices.push(...r.slices);
      Object.assign(links, r.links);
    }
    waiting = waiting.filter((id) => !batch.includes(id));
  }
  return slices;
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

export function summarize(slices) {
  const totals = { mainModel: 0, mainTool: 0, subModel: 0, subTool: 0, wait: 0 };
  const bySkill = new Map();
  const entry = (skill) => {
    if (!bySkill.has(skill)) bySkill.set(skill, { skill, model: 0, sub: 0, wait: 0, tools: {}, effort: {}, ctx: {}, runs: new Map(), bash: [] });
    return bySkill.get(skill);
  };
  const addTurn = (bucket, key, msgId, seconds) => {
    bucket[key] ??= { turns: new Set(), seconds: 0 };
    bucket[key].turns.add(msgId);
    bucket[key].seconds += seconds;
  };
  for (const s of slices) {
    const e = entry(s.skill);
    if (s.kind === 'wait') { totals.wait += s.seconds; e.wait += s.seconds; continue; }
    if (s.sub) {
      totals[s.kind === 'model' ? 'subModel' : 'subTool'] += s.seconds;
      e.sub += s.seconds;
      continue;
    }
    const run = e.runs.get(`${s.session}#${s.run}`) ?? { seconds: 0, turns: new Set() };
    e.runs.set(`${s.session}#${s.run}`, run);
    run.seconds += s.seconds;
    if (s.kind === 'model') {
      totals.mainModel += s.seconds;
      e.model += s.seconds;
      run.turns.add(s.msgId);
      addTurn(e.effort, s.effort, s.msgId, s.seconds);
      addTurn(e.ctx, s.ctx, s.msgId, s.seconds);
      continue;
    }
    totals.mainTool += s.seconds;
    e.tools[s.tool] = (e.tools[s.tool] ?? 0) + s.seconds;
    if (s.tool === 'Bash') e.bash.push({ cmd: String(s.cmd ?? '').replace(/\s+/g, ' ').slice(0, 100), seconds: s.seconds });
  }
  const counted = (bucket) => Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, { turns: v.turns.size, seconds: v.seconds }]));
  const skills = [...bySkill.values()].map((e) => {
    const runs = [...e.runs.values()];
    const durations = runs.map((r) => r.seconds).sort((x, y) => x - y);
    const toolSeconds = Object.values(e.tools).reduce((n, v) => n + v, 0);
    return {
      skill: e.skill, machine: e.model + toolSeconds, model: e.model, sub: e.sub, wait: e.wait, tools: e.tools,
      effort: counted(e.effort), ctx: counted(e.ctx),
      runs: runs.length, runMedian: quantile(durations, 0.5), runP90: quantile(durations, 0.9),
      turnsPerRun: runs.length ? runs.reduce((n, r) => n + r.turns.size, 0) / runs.length : 0,
      slowBash: e.bash.sort((x, y) => y.seconds - x.seconds).slice(0, 10),
    };
  });
  skills.sort((x, y) => y.machine + y.sub - (x.machine + x.sub));
  return { totals, skills };
}

const readLines = (path) => readFileSync(path, 'utf8').split('\n').flatMap((l) => {
  try { return l ? [JSON.parse(l)] : []; } catch { return []; }
});

function subagentFiles(dir, out = {}, prefix = '') {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) subagentFiles(path, out, e.name.startsWith('wf_') ? `${e.name}/` : prefix);
    else if (/^agent-.+\.jsonl$/.test(e.name)) out[prefix + e.name.slice(6, -6)] = readLines(path);
  }
  return out;
}

export function loadSlices({ root, days, project = '', nowMs = Date.now() }) {
  const cutoff = nowMs / 1000 - days * 86400;
  const slices = [];
  let sessions = 0;
  for (const proj of readdirSync(root)) {
    if (project && !proj.includes(project)) continue;
    const dir = join(root, proj);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const mainPath = join(dir, name);
      if (statSync(mainPath).mtimeMs / 1000 < cutoff) continue;
      const session = basename(name, '.jsonl');
      const found = scanSession({ session, main: readLines(mainPath), subagents: subagentFiles(join(dir, session, 'subagents')) })
        .filter((s) => s.at >= cutoff);
      if (found.length) sessions += 1;
      slices.push(...found);
    }
  }
  return { slices, sessions };
}

const fmt = (sec) => (sec >= 3600 ? `${(sec / 3600).toFixed(1)}h` : `${Math.round(sec / 60)}m`);
const share = (bucket, keys) => {
  const all = Object.values(bucket).reduce((n, v) => n + v.seconds, 0);
  const hit = keys.reduce((n, k) => n + (bucket[k]?.seconds ?? 0), 0);
  return all ? `${Math.round((hit / all) * 100)}%` : '-';
};

function printTable({ totals, skills }, { days, sessions, top }) {
  console.log(`\n⏱ ${days} ngày · ${sessions} phiên`);
  console.log(`  Máy chạy: model phiên chính ${fmt(totals.mainModel)} · tool phiên chính ${fmt(totals.mainTool)} · model subagent ${fmt(totals.subModel)} · tool subagent ${fmt(totals.subTool)}`);
  console.log(`  Chờ user: ${fmt(totals.wait)} (gồm AskUserQuestion)\n`);
  console.log(`  ${'skill'.padEnd(34)}${'lần'.padStart(5)}${'trung vị'.padStart(10)}${'p90'.padStart(8)}${'lượt/lần'.padStart(10)}${'máy'.padStart(8)}${'subagent'.padStart(10)}${'xhigh'.padStart(7)}${'>150k'.padStart(7)}`);
  for (const s of skills.slice(0, top)) {
    console.log(`  ${s.skill.slice(0, 33).padEnd(34)}${String(s.runs).padStart(5)}${fmt(s.runMedian).padStart(10)}${fmt(s.runP90).padStart(8)}${s.turnsPerRun.toFixed(0).padStart(10)}${fmt(s.machine).padStart(8)}${fmt(s.sub).padStart(10)}${share(s.effort, ['xhigh']).padStart(7)}${share(s.ctx, ['150-300k', '>300k']).padStart(7)}`);
  }
}

function printSkill(s) {
  console.log(`\n🔎 ${s.skill} — ${s.runs} lần · trung vị ${fmt(s.runMedian)} · p90 ${fmt(s.runP90)} · ${s.turnsPerRun.toFixed(0)} lượt model/lần`);
  console.log(`  model ${fmt(s.model)} · subagent ${fmt(s.sub)} · chờ user ${fmt(s.wait)}`);
  const rows = (title, bucket) => console.log(`  ${title}: ` + Object.entries(bucket).sort((x, y) => y[1].seconds - x[1].seconds)
    .map(([k, v]) => `${k} ${fmt(v.seconds)} (${v.turns} lượt, ${(v.seconds / v.turns).toFixed(1)}s/lượt)`).join(' · '));
  rows('effort', s.effort);
  rows('context', s.ctx);
  console.log('  tool: ' + Object.entries(s.tools).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k} ${fmt(v)}`).join(' · '));
  console.log('  Bash chậm nhất:');
  for (const b of s.slowBash) console.log(`    ${b.seconds.toFixed(0).padStart(5)}s  ${b.cmd}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
  };
  const days = Number(arg('days', 14));
  const top = Number(arg('top', 15));
  const skill = arg('skill', '');
  const { slices, sessions } = loadSlices({ root: arg('root', join(homedir(), '.claude', 'projects')), days, project: arg('project', '') });
  const summary = summarize(slices);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ days, sessions, ...summary }, null, 2));
  else if (skill) summary.skills.filter((s) => s.skill.includes(skill)).forEach(printSkill);
  else printTable(summary, { days, sessions, top });
}
