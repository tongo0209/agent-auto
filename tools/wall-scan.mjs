#!/usr/bin/env node
// Đo thời gian thật từ transcript Claude Code: máy chạy (model/tool) tách khỏi chờ user, theo skill.
// Dùng: node tools/wall-scan.mjs [--days 14] [--project <chuỗi>] [--skill <tên>] [--top 15] [--json] [--root <thư mục>]

export const OUTSIDE = '(ngoài skill)';
export const ORPHAN = '(subagent không rõ skill)';
const MODEL_GAP_MAX = 15 * 60;
const TOOL_GAP_MAX = 60 * 60;
const WAIT_GAP_MAX = 24 * 3600;
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
  const push = (slice, seconds, max) => {
    if (seconds > 0 && seconds <= max) slices.push({ session, run, sub, seconds, at: now, ...slice });
  };
  for (const line of lines) {
    now = Date.parse(line.timestamp ?? '') / 1000;
    if (Number.isNaN(now)) continue;
    const gap = prev === null ? 0 : now - prev;
    const content = Array.isArray(line.message?.content) ? line.message.content : [];
    if (line.type === 'assistant') {
      const skill = inheritedSkill ?? line.attributionSkill ?? OUTSIDE;
      if (skill !== lastSkill) { run += 1; lastSkill = skill; }
      push({ kind: 'model', skill, msgId: line.message?.id, effort: line.effort ?? line.perTurnEffort ?? 'không rõ', ctx: ctxBucket(line.message?.usage) }, gap, MODEL_GAP_MAX);
      for (const c of content) if (c.type === 'tool_use') pending.set(c.id, { name: toolName(c.name), skill, run, cmd: c.input?.command });
      prev = now;
      continue;
    }
    if (line.type !== 'user' || line.isMeta) continue;
    const results = content.filter((c) => c.type === 'tool_result');
    if (!results.length) {
      push({ kind: 'wait', skill: lastSkill ?? OUTSIDE }, gap, WAIT_GAP_MAX);
      prev = now;
      continue;
    }
    const issued = pending.get(results[0].tool_use_id);
    for (const r of results) pending.delete(r.tool_use_id);
    const agentId = line.toolUseResult?.agentId;
    if (agentId && issued) links[agentId] = issued.skill;
    if (issued?.name === 'AskUserQuestion') push({ kind: 'wait', skill: issued.skill, run: issued.run }, gap, WAIT_GAP_MAX);
    else if (issued) push({ kind: 'tool', skill: issued.skill, run: issued.run, tool: issued.name, cmd: issued.cmd }, gap, TOOL_GAP_MAX);
    prev = now;
  }
  return { slices, links };
}

// Subagent có thể sinh subagent khác, nên nối lặp tới khi hết file nối được; phần còn lại vào ORPHAN.
export function scanSession({ session, main, subagents = {} }) {
  const root = sliceTimeline(main, { session });
  const slices = [...root.slices];
  const links = { ...root.links };
  let waiting = Object.keys(subagents);
  while (waiting.length) {
    const ready = waiting.filter((id) => id in links);
    const batch = ready.length ? ready : waiting;
    for (const id of batch) {
      const r = sliceTimeline(subagents[id], { session, inheritedSkill: links[id] ?? ORPHAN, sub: true });
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
