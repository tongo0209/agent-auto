#!/usr/bin/env node
// Gợi ý mốc/link design từ tin Teams (chat-radar inbox) cho `/daily delta` — chỉ gợi ý, phiên /daily quyết.
// Dùng: node tools/chat-hints.mjs [--since ISO] [--inbox path] [--state path]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanWindow } from './delta-scan.mjs';

const DAY = 86400e3;
const VN_OFFSET = 7 * 3600e3;
const HINT_TAGS = ['design', 'deadline'];
const DESIGN_HOST = /sharepoint\.com|drive\.google\.com|docs\.google\.com|figma\.com|canva\.com|hub\.vnggames\.com\/tickets/;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
// `\b` của JS chỉ hiểu ASCII ("Nếu"→"Xếu"), nên ranh giới từ phải tự định nghĩa.
const EDGE_BEFORE = String.raw`(?<=^|[\s.,!?;:()"'])`;
const EDGE_AFTER = String.raw`(?=$|[\s.,!?;:()"'])`;
const word = (pattern, flags = '') => new RegExp(EDGE_BEFORE + pattern + EDGE_AFTER, flags + 'g');
// "mai" viết hoa thường là tên người (chị Mai) nên chỉ khớp chữ thường.
const RELATIVE_DAYS = [
  [word('hôm nay', 'i'), 0],
  [word('(?:ngày )?mai'), 1],
  [word('ngày mai', 'i'), 1],
  [word('(?:ngày )?mốt', 'i'), 2],
];
const DAY_MONTH = /(?<![\d/-])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?(?!\d)/g;

const vnDate = (ms) => new Date(ms + VN_OFFSET).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');

function datesIn(text, atMs) {
  const dates = new Set();
  for (const [pattern, offsetDays] of RELATIVE_DAYS) {
    if (pattern.test(text)) dates.add(vnDate(atMs + offsetDays * DAY));
    pattern.lastIndex = 0;
  }
  const year = vnDate(atMs).slice(0, 4);
  for (const [, day, month, explicitYear] of text.matchAll(DAY_MONTH)) {
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) dates.add(`${explicitYear ?? year}-${pad(month)}-${pad(day)}`);
  }
  return [...dates].sort();
}

const designLinks = (text) =>
  (text.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;:)]+$/, '')).filter((url) => DESIGN_HOST.test(url));

export function chatHints(inboxLines, state, sinceIso) {
  const sinceMs = Date.parse(sinceIso);
  const openKeys = new Set(Object.entries(state.issues ?? {}).filter(([, issue]) => issue.phase !== 'closed').map(([key]) => key));
  const seenIds = new Set();
  const hints = {};
  for (const line of inboxLines) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (seenIds.has(msg.id) || Date.parse(msg.at) < sinceMs) continue;
    seenIds.add(msg.id);
    const keys = msg.keys.filter((key) => openKeys.has(key));
    if (!keys.length) continue;
    const text = msg.text.normalize('NFC');
    const textWithoutUrls = text.replace(URL_PATTERN, ' ');
    const dates = datesIn(textWithoutUrls, Date.parse(msg.at));
    const links = designLinks(text);
    const isBug = msg.tags.includes('bug');
    // Tagger của chat-radar bỏ sót tin như GW-882 14/10 (tags rỗng) nên tin có ngày/link vẫn giữ.
    if (!isBug && !msg.tags.some((tag) => HINT_TAGS.includes(tag)) && !dates.length && !links.length) continue;
    const hint = { id: msg.id, at: msg.at, from: msg.from, tags: msg.tags, kind: isBug ? 'bug' : 'hint', text, url: msg.url, dates, links };
    for (const key of keys) (hints[key] ??= []).push(hint);
  }
  return hints;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? null : process.argv[i + 1];
  };
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const state = JSON.parse(readFileSync(arg('--state') ?? resolve(root, 'state.json'), 'utf8'));
  const inbox = readFileSync(arg('--inbox') ?? resolve(root, 'history/chat-radar/inbox.jsonl'), 'utf8');
  const since = arg('--since') ?? scanWindow(state.lastRun, Date.now()).sinceIso;
  console.log(JSON.stringify(chatHints(inbox.split('\n'), state, since), null, 2));
}
