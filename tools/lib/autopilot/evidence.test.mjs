import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { missingEvidence } from './evidence.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-evidence-'));
const crop = (name) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, 'png');
  return file;
};
const readLine = (file) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: file } }] } });

test('khai ảnh, ảnh có trên đĩa và đã Read → đủ', () => {
  const a = crop('a.png');
  assert.deepStrictEqual(missingEvidence([a], [readLine(a)]), []);
});

test('không khai ảnh nào → thiếu', () => {
  assert.strictEqual(missingEvidence([], ['']).length, 1);
});

test('ảnh khai mà chưa mở → thiếu, nêu tên ảnh', () => {
  const b = crop('b.png');
  assert.match(missingEvidence([b], ['']).join(), /b\.png/);
});

test('ảnh khai mà không có trên đĩa → thiếu', () => {
  const ghost = path.join(dir, 'ghost.png');
  assert.match(missingEvidence([ghost], [readLine(ghost)]).join(), /ghost\.png/);
});

test('Read nằm ở log lượt nhắc lại vẫn tính', () => {
  const c = crop('c.png');
  assert.deepStrictEqual(missingEvidence([c], ['dòng rác không phải JSON', readLine(c)]), []);
});
