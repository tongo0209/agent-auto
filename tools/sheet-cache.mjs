#!/usr/bin/env node
// Ghi cache buglist từ kết quả read_file_content đã có trong transcript phiên — model không phải gõ lại nội dung sheet.
// Dùng: node tools/sheet-cache.mjs <sheetId> [--transcript <path>] [--out <dir>]
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseBugTable } from './bug-radar.mjs';

const READ_TOOL = 'mcp__claude_ai_Google_Drive__read_file_content';

function currentTranscript() {
  const id = process.env.CLAUDE_CODE_SESSION_ID;
  const root = join(homedir(), '.claude', 'projects');
  const project = id && readdirSync(root).find((p) => existsSync(join(root, p, `${id}.jsonl`)));
  return project ? join(root, project, `${id}.jsonl`) : null;
}

export function latestRead(lines, sheetId) {
  const reads = new Set();
  let latest = null;
  for (const line of lines) {
    for (const part of line.message?.content ?? []) {
      if (part.type === 'tool_use' && part.name === READ_TOOL && part.input?.fileId === sheetId) reads.add(part.id);
      if (part.type !== 'tool_result' || !reads.has(part.tool_use_id)) continue;
      const text = typeof part.content === 'string' ? part.content : part.content.map((c) => c.text ?? '').join('');
      latest = JSON.parse(text).fileContent;
    }
  }
  return latest;
}

export function bugBlocks(markdown) {
  const blocks = [];
  let current = [];
  for (const line of `${markdown}\n`.split('\n')) {
    if (line.trim().startsWith('|')) {
      current.push(line);
      continue;
    }
    if (current.length) blocks.push(current.join('\n'));
    current = [];
  }
  return blocks.filter((block) => parseBugTable(block).length > 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? null : process.argv[i + 1];
  };
  const sheetId = process.argv[2];
  const from = arg('transcript') ?? currentTranscript();
  const outDir = arg('out') ?? resolve(fileURLToPath(import.meta.url), '..', '..', '.cache', 'bugsheets');
  const lines = from ? readFileSync(from, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const content = latestRead(lines, sheetId);
  if (content === null) {
    console.error(`Phiên này chưa có lượt read_file_content cho ${sheetId} — gọi tool Drive trước. Transcript: ${from}`);
    process.exit(1);
  }
  const blocks = bugBlocks(content);
  if (!blocks.length) {
    console.error(`Sheet ${sheetId} đọc được nhưng không có khối bảng nào có cột BugID — giữ nguyên cache cũ.`);
    process.exit(1);
  }
  const cache = `${blocks.join('\n\n')}\n`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${sheetId}.md`), cache);
  const rows = blocks.reduce((n, b) => n + parseBugTable(b).length, 0);
  console.log(JSON.stringify({ sheetId, blocks: blocks.length, rows, chars: cache.length, from }));
}
