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
