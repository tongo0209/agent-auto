#!/usr/bin/env node
// Đọc tin Teams mới → gắn ticket đang mở → boards/chat-<ngày>.md + báo máy. Chạy: node tools/chat-radar.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULTS, shouldRunNow, failStreak, readJSON, todayStr } from './radar-tick.mjs';

const SEARCH_TOOL = 'mcp__claude_ai_Microsoft_365__chat_message_search';
const CHATS_TOOL = 'mcp__claude_ai_Microsoft_365__teams_list_chats';
const MAX_PAGES = 8;
const TOPICS_TTL_MS = 24 * 3600e3;
const TOPICS_RETRY_MS = 2 * 3600e3;
// Search của Teams đánh chỉ mục trễ: quét lùi lại để không sót tin vào chỉ mục muộn, cursor.seen lọc trùng.
const INDEX_LAG_MS = 30 * 60e3;
const FETCH_TIMEOUT_MS = 4 * 60e3;
const MIN_ALIAS_LEN = 3;
const NOTIFY_TAGS = ['bug', 'design', 'deadline', 'mention'];

const GENERIC_ALIASES = new Set(['Mainsite', 'Promotion', 'Landing']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// \b của JS chỉ hiểu ASCII: "vỡ layout" không có ranh giới sau "ỡ", nên tự dựng bằng \p{L}.
const wordRe = (words) => new RegExp(`(?<![\\p{L}\\d])(${words.map(escapeRe).join('|')})(?![\\p{L}\\d])`, 'iu');

const TAG_RULES = {
  bug: wordRe(['bug', 'lỗi', 'fix', 'vỡ', 'hỏng', 'sai', 'crash', '404', 'không hiện', 'không chạy', 'không được', 'không bấm', 'không nhận']),
  design: wordRe(['design', 'figma', 'psd', 'asset', 'ảnh mới', 'đổi ảnh', 'đổi hình']),
  deadline: wordRe(['gấp', 'deadline', 'eta', 'release', 'dí', 'hôm nay', 'xong chưa', 'khi nào', 'bao giờ']),
  link: /docs\.google\.com\/spreadsheets|figma\.com|sharepoint\.com/i,
};

export function parseConcatJson(text) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{' && depth++ === 0) start = i;
    else if (ch === '}' && --depth === 0) out.push(JSON.parse(text.slice(start, i + 1)));
  }
  return out;
}

const topicHead = (topic) => (topic || '').split('|')[0].replace(/[[\]]/g, ' ');

export const topicCodes = (topic) => topicHead(topic).match(/\b[A-Z]?\d{2,3}\b/g) || [];

export function topicNames(topic) {
  const [head, middle] = (topic || '').split('|');
  if (middle) return [middle.trim()].filter(Boolean);
  return (head.match(/\[([^\]]+)\]/)?.[1] || '').split(/\s*-\s*/).slice(1).filter(Boolean);
}

export const ticketCode = (summary) => summary.match(/^\[([A-Z]?\d{2,3})\b/)?.[1] || null;

export const ticketNames = (summary) =>
  [...summary.matchAll(/\[([^\]]+)\]/g)].flatMap(([, inner]) => inner.split('.')).filter((s) => !/^[A-Z]?\d{2,3}$/.test(s));

export function buildIndex(issues, chats) {
  const tickets = {};
  for (const [key, issue] of Object.entries(issues)) {
    if (issue.phase === 'closed' || !issue.summary) continue;
    tickets[key] = { code: ticketCode(issue.summary), aliases: new Set(ticketNames(issue.summary)) };
  }
  const chatTickets = {};
  const chatGame = {};
  for (const [chatId, chat] of Object.entries(chats)) {
    const codes = topicCodes(chat.topic);
    if (!codes.length) continue;
    chatGame[chatId] = topicNames(chat.topic)[0] || codes[0];
    const keys = Object.keys(tickets).filter((k) => codes.includes(tickets[k].code));
    for (const k of keys) topicNames(chat.topic).forEach((n) => tickets[k].aliases.add(n));
    if (keys.length) chatTickets[chatId] = keys;
  }
  return { tickets, chatTickets, chatGame };
}


export function matchMessage(msg, index, issues) {
  const text = msg.summary || '';
  const byKey = (text.match(/\bGW-\d+\b/g) || []).filter((k) => issues[k]);
  if (byKey.length) return [...new Set(byKey)];
  if (index.chatTickets[msg.chatId]) return index.chatTickets[msg.chatId];
  return Object.entries(index.tickets)
    .filter(([, t]) => [...t.aliases].some((a) => a.length >= MIN_ALIAS_LEN && !GENERIC_ALIASES.has(a) && wordRe([a]).test(text)))
    .map(([k]) => k);
}

// Teams chèn tên hiển thị người được tag vào nội dung tin, không có trường mention riêng.
export function classify(text, myName) {
  const isMention = Boolean(myName) && text.includes(myName);
  return ['bug', 'design', 'deadline', 'mention', 'link'].filter((t) => (t === 'mention' ? isMention : TAG_RULES[t].test(text)));
}

export function shouldKeep(msg, keys, tags, me) {
  if (msg.from?.email === me || !msg.from?.email) return false;
  return keys.length > 0 || tags.some((t) => t !== 'link');
}

export function toolResults(streamText) {
  const nameById = {};
  const results = { messages: [], chats: [] };
  for (const line of streamText.split('\n')) {
    if (!line.startsWith('{')) continue;
    const ev = JSON.parse(line);
    for (const block of ev.message?.content || []) {
      if (block.type === 'tool_use') nameById[block.id] = block.name;
      if (block.type !== 'tool_result') continue;
      const text = typeof block.content === 'string' ? block.content : (block.content || []).map((c) => c.text || '').join('');
      const items = parseConcatJson(text).filter((o) => o.id);
      if (nameById[block.tool_use_id] === SEARCH_TOOL) results.messages.push(...items);
      if (nameById[block.tool_use_id] === CHATS_TOOL) results.chats.push(...items);
    }
  }
  return results;
}

export function renderDigest(day, items) {
  const groups = {};
  const uniqueItems = [...new Map(items.map((it) => [it.id, it])).values()];
  for (const it of uniqueItems) (groups[it.keys.join(', ') || it.game || 'Chưa gắn task'] ||= []).push(it);
  const order = Object.keys(groups).sort((a, b) => (a === 'Chưa gắn task') - (b === 'Chưa gắn task') || a.localeCompare(b));
  const line = (it) => {
    const hhmm = new Date(it.at).toTimeString().slice(0, 5);
    const tags = it.tags.length ? ` \`${it.tags.join(',')}\`` : '';
    return `- ${hhmm} **${it.from}** · ${it.chat}${tags} — ${it.text} [↗](${it.url})`;
  };
  return [`# Tin Teams ${day}`, '', ...order.flatMap((k) => [`## ${k}`, ...groups[k].map(line), ''])].join('\n');
}

function fetchPrompt(afterIso, withChats) {
  const steps = [
    `Gọi ${SEARCH_TOOL} với query "*", afterDateTime "${afterIso}", limit 25, offset 0. Còn nextOffset thì gọi tiếp với offset đó, tối đa ${MAX_PAGES} lần.`,
  ];
  if (withChats) steps.push(`Gọi ${CHATS_TOOL} với limit 25. Còn nextCursor thì gọi tiếp với cursor đó, tối đa ${MAX_PAGES} lần.`);
  return `Chỉ gọi tool, không phân tích, không tóm tắt.\n${steps.map((s, i) => `${i + 1}) ${s}`).join('\n')}\nXong trả lời đúng chữ: DONE`;
}

function realFetch(afterIso, withChats) {
  const args = ['-p', fetchPrompt(afterIso, withChats), '--allowedTools', `${SEARCH_TOOL},${CHATS_TOOL}`];
  args.push('--model', 'haiku', '--output-format', 'stream-json', '--verbose');
  try {
    const out = execFileSync('claude', args, { encoding: 'utf8', timeout: FETCH_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
    const result = out.split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l))[0] || {};
    return { ok: !result.is_error, costUsd: result.total_cost_usd ?? null, err: result.is_error ? String(result.result).slice(0, 300) : null, ...toolResults(out) };
  } catch (err) {
    return { ok: false, err: (String(err.stdout || '').slice(-300) + ' ' + err.message).trim().slice(0, 500), messages: [], chats: [] };
  }
}

function osaNotify(title, message) {
  try {
    execFileSync('osascript', ['-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`]);
  } catch {
    // Chưa cấp quyền Notifications không được làm hỏng lượt quét.
  }
}

const readJsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

export function runChatRadar({ root, now = new Date(), argv = [], fetchChat = realFetch, notify = osaNotify }) {
  const config = readJSON(path.join(root, 'config.json'), {});
  const cfg = { ...DEFAULTS, ...(config.chatRadar || {}) };
  const gate = shouldRunNow(now, cfg);
  if (!gate.run && !argv.includes('--force')) return { at: now.toISOString(), skipped: gate.why };

  const dir = path.join(root, 'history', 'chat-radar');
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    cursor: path.join(dir, 'cursor.json'),
    topics: path.join(dir, 'topics.json'),
    inbox: path.join(dir, 'inbox.jsonl'),
    log: path.join(dir, 'runs.jsonl'),
  };
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const cursor = readJSON(files.cursor, { lastAt: startOfDay, seen: {} });
  const topics = readJSON(files.topics, { fetchedAt: 0, chats: {} });
  const topicsAge = Number(now) - topics.fetchedAt;
  const topicsStale = topicsAge > TOPICS_TTL_MS || (topics.hasUnknownChat && topicsAge > TOPICS_RETRY_MS);

  const res = fetchChat(new Date(Date.parse(cursor.lastAt) - INDEX_LAG_MS).toISOString(), topicsStale);
  res.messages = [...new Map(res.messages.map((m) => [m.id, m])).values()];
  const logRow = (row) => {
    fs.appendFileSync(files.log, JSON.stringify(row) + '\n');
    return row;
  };
  if (!res.ok) {
    const row = logRow({ at: now.toISOString(), ok: false, err: res.err });
    const streak = failStreak(readJsonl(files.log));
    if (streak === 3) notify('Chat radar — agent-auto', `Đọc Teams hỏng ${streak} lượt liền: ${String(res.err).slice(0, 120)}`);
    return row;
  }

  if (res.chats.length) {
    topics.chats = Object.fromEntries(res.chats.map((c) => [c.id, { topic: c.topic, type: c.chatType }]));
    topics.fetchedAt = Number(now);
  }
  const seen = cursor.seen || {};
  const fresh = res.messages.filter((m) => !seen[m.id]);
  topics.hasUnknownChat = fresh.some((m) => !topics.chats[m.chatId]);
  fs.writeFileSync(files.topics, JSON.stringify(topics));

  const issues = readJSON(path.join(root, 'state.json'), {}).issues || {};
  const index = buildIndex(issues, topics.chats);
  const me = cfg.me;
  const kept = [];
  // Đọc lại inbox sau fetch: lượt chạy chồng có thể vừa ghi đúng tin này.
  const inboxIds = new Set(readJsonl(files.inbox).map((it) => it.id));
  for (const m of fresh) {
    if (inboxIds.has(m.id)) continue;
    const keys = matchMessage(m, index, issues);
    const tags = classify(m.summary || '', cfg.myName);
    if (!shouldKeep(m, keys, tags, me)) continue;
    const chat = topics.chats[m.chatId];
    kept.push({
      id: m.id,
      at: m.createdDateTime,
      keys,
      tags,
      game: index.chatGame[m.chatId] || null,
      from: m.from.displayName,
      chat: chat?.topic || (chat?.type === 'oneOnOne' ? 'chat riêng' : m.chatId),
      text: (m.summary || '').replace(/\s+/g, ' ').trim(),
      url: m.webUrl,
    });
  }
  for (const it of kept) fs.appendFileSync(files.inbox, JSON.stringify(it) + '\n');

  const day = todayStr(now);
  const todayItems = readJsonl(files.inbox).filter((it) => todayStr(new Date(it.at)) === day);
  fs.mkdirSync(path.join(root, 'boards'), { recursive: true });
  fs.writeFileSync(path.join(root, 'boards', `chat-${day}.md`), renderDigest(day, todayItems));

  const newest = res.messages.reduce((max, m) => (m.createdDateTime > max ? m.createdDateTime : max), cursor.lastAt);
  const nextScanFrom = Date.parse(newest) - INDEX_LAG_MS;
  const seenNow = { ...seen, ...Object.fromEntries(res.messages.map((m) => [m.id, m.createdDateTime])) };
  const seenInNextScan = Object.entries(seenNow).filter(([, at]) => Date.parse(at) >= nextScanFrom);
  fs.writeFileSync(files.cursor, JSON.stringify({ lastAt: newest, seen: Object.fromEntries(seenInNextScan) }));

  const loud = kept.filter((it) => it.tags.some((t) => NOTIFY_TAGS.includes(t)));
  if (loud.length) {
    const lines = loud.slice(0, 4).map((it) => `${it.keys[0] || it.game || it.chat}: ${it.tags.filter((t) => t !== 'link').join('/')} — ${it.from}`);
    notify(`Teams: ${loud.length} tin cần xem`, lines.join('\n') + `\nboards/chat-${day}.md`);
  }
  const truncated = res.messages.length >= MAX_PAGES * 25;
  return logRow({ at: now.toISOString(), ok: true, fetched: res.messages.length, fresh: fresh.length, kept: kept.length, loud: loud.length, truncated: truncated || undefined, costUsd: res.costUsd });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  console.log(JSON.stringify(runChatRadar({ root: path.resolve(import.meta.dirname, '..'), argv: process.argv.slice(2) })));
}
