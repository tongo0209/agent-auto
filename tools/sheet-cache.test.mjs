import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.resolve(import.meta.dirname, 'sheet-cache.mjs');
const READ = 'mcp__claude_ai_Google_Drive__read_file_content';
const BUG_A = ['|  |  |  |', '| :-: | :-: | :-: |', '| BugID | Description | DEV Check Status |', '| 1 | Nút chết | Done |'].join('\n');
const BUG_B = ['|  |  |  |', '| :-: | :-: | :-: |', '| BugID | Description | DEV Check Status |', '| 1 | Lệch ảnh |  |', '| 2 | Tràn chữ |  |'].join('\n');
const ACCOUNTS = ['|  |  |', '| :-: | :-: |', '|  | ACCOUNT 1 |'].join('\n');

function transcript(reads) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-cache-'));
  const rows = reads.flatMap(([fileId, fileContent], i) => [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: `t${i}`, name: READ, input: { fileId } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: [{ type: 'text', text: JSON.stringify({ fileContent }) }] }] } },
  ]);
  fs.writeFileSync(path.join(dir, 's.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return dir;
}

const run = (dir, sheetId) => {
  try {
    return { code: 0, out: JSON.parse(execFileSync('node', [SCRIPT, sheetId, '--transcript', path.join(dir, 's.jsonl'), '--out', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) };
  } catch (err) {
    return { code: err.status, err: String(err.stderr) };
  }
};
const cache = (dir, id) => fs.readFileSync(path.join(dir, `${id}.md`), 'utf8');

test('giữ MỌI khối có BugID nguyên văn, đúng thứ tự, bỏ bảng không phải buglist', () => {
  const dir = transcript([['S1', `${BUG_B}\n\n${BUG_A}\n\n${ACCOUNTS}\n`]]);
  const { code, out } = run(dir, 'S1');
  assert.strictEqual(code, 0);
  assert.strictEqual(cache(dir, 'S1'), `${BUG_B}\n\n${BUG_A}\n`);
  assert.deepStrictEqual({ blocks: out.blocks, rows: out.rows }, { blocks: 2, rows: 3 });
});

test('đọc sheet 2 lần thì lấy lần sau; sheet khác không lẫn vào', () => {
  const dir = transcript([['S1', BUG_A], ['S2', BUG_B], ['S1', BUG_B]]);
  run(dir, 'S1');
  assert.strictEqual(cache(dir, 'S1'), `${BUG_B}\n`);
});

test('phiên chưa đọc sheet thì báo lỗi, không ghi gì', () => {
  const dir = transcript([['S2', BUG_A]]);
  const { code, err } = run(dir, 'S1');
  assert.strictEqual(code, 1);
  assert.match(err, /read_file_content/);
  assert.strictEqual(fs.existsSync(path.join(dir, 'S1.md')), false);
});

test('đọc ra mà không có khối BugID thì báo lỗi, GIỮ cache cũ', () => {
  const dir = transcript([['S1', ACCOUNTS]]);
  fs.writeFileSync(path.join(dir, 'S1.md'), 'bản cũ');
  assert.strictEqual(run(dir, 'S1').code, 1);
  assert.strictEqual(cache(dir, 'S1'), 'bản cũ');
});
