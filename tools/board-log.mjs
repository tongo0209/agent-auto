#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const newBoard = (dateISO) => `# Board ${dateISO}\n\n## Log\n\n## Cần bạn\n`;

const eventOf = (line) => line.split('— ').slice(1).join('— ').trim();

export function appendLog(text, event, hhmm) {
  const cleanEvent = event.trim();
  if (!cleanEvent) throw new Error('sự kiện rỗng');
  const entry = `- ${hhmm} — ${cleanEvent}`;
  const lines = text.split('\n');
  const logStart = lines.findIndex((l) => /^## Log\s*$/.test(l));
  if (logStart === -1) return { text: `${text.trimEnd()}\n\n## Log\n${entry}\n`, skipped: false };

  const nextHeading = lines.findIndex((l, i) => i > logStart && /^## /.test(l));
  const logEnd = nextHeading === -1 ? lines.length : nextHeading;
  const logLines = lines.slice(logStart + 1, logEnd);
  if (logLines.some((l) => eventOf(l) === cleanEvent)) return { text, skipped: true };

  let insertAt = logEnd;
  while (insertAt > logStart + 1 && !lines[insertAt - 1].trim()) insertAt--;
  lines.splice(insertAt, 0, entry);
  return { text: lines.join('\n'), skipped: false };
}

function localDateISO(now) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args.splice(i, 2)[1];
  };
  const now = new Date();
  const date = flag('--date') ?? localDateISO(now);
  const board = flag('--board') ?? join(ROOT, 'boards', `${date}.md`);
  const event = args.join(' ');
  if (!event.trim()) {
    console.error('Cách dùng: node tools/board-log.mjs "<sự kiện>" [--date YYYY-MM-DD] [--board <path>]');
    process.exit(1);
  }
  const hhmm = now.toTimeString().slice(0, 5);
  const current = existsSync(board) ? readFileSync(board, 'utf8') : newBoard(date);
  const { text, skipped } = appendLog(current, event, hhmm);
  if (skipped) return console.log('skip: trùng');
  writeFileSync(board, text);
  console.log(`✓ ${board}: - ${hhmm} — ${event.trim()}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
