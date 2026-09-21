import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { merge3, readState, writeMerged } from './state-merge.mjs';

const tmpState = (obj) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-merge-'));
  const p = path.join(dir, 'state.json');
  if (obj !== undefined) fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  return p;
};
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

test('trường mình không đụng thì lấy theo đĩa — user tắt theo dõi giữa lượt radar vẫn tắt', () => {
  const base = { bugWatch: { s1: { follow: true, heat: 'warm' } } };
  const mine = { bugWatch: { s1: { follow: true, heat: 'warm', lastPollAt: 'T10' } } };
  const theirs = { bugWatch: { s1: { follow: false, unfollowReason: 'tắt từ console', heat: 'warm' } } };
  const out = merge3(base, mine, theirs);
  assert.equal(out.bugWatch.s1.follow, false);
  assert.equal(out.bugWatch.s1.unfollowReason, 'tắt từ console');
  assert.equal(out.bugWatch.s1.lastPollAt, 'T10');
});

test('sheet người khác vừa thêm giữa lượt không bị xoá', () => {
  const base = { bugWatch: { s1: { follow: true } } };
  const mine = { bugWatch: { s1: { follow: true, lastPollAt: 'T10' } } };
  const theirs = { bugWatch: { s1: { follow: true }, s2: { follow: true, title: 'mới add' } } };
  assert.deepEqual(Object.keys(merge3(base, mine, theirs).bugWatch), ['s1', 's2']);
});

test('trường mình sở hữu vẫn ghi được đè lên bản đĩa cũ', () => {
  const base = { bugWatch: { s1: { seenBugs: { a: 1 }, openBugs: 3 } } };
  const mine = { bugWatch: { s1: { seenBugs: { a: 1, b: 2 }, openBugs: 5 } } };
  const out = merge3(base, mine, base);
  assert.deepEqual(out.bugWatch.s1, { seenBugs: { a: 1, b: 2 }, openBugs: 5 });
});

test('mình xoá key thì key mất; key chỉ có trên đĩa thì giữ', () => {
  const base = { a: 1, b: 2 };
  const out = merge3(base, { a: 1 }, { a: 1, b: 2, c: 3 });
  assert.deepEqual(out, { a: 1, c: 3 });
});

test('hai bên cùng sửa một ô lá: bản ghi sau thắng, không nuốt cả nhánh', () => {
  const base = { bugWatch: { s1: { heat: 'warm', follow: true } } };
  const mine = { bugWatch: { s1: { heat: 'hot', follow: true } } };
  const theirs = { bugWatch: { s1: { heat: 'cold', follow: false } } };
  const out = merge3(base, mine, theirs);
  assert.equal(out.bugWatch.s1.heat, 'hot');
  assert.equal(out.bugWatch.s1.follow, false);
});

test('writeMerged đọc lại đĩa ngay lúc ghi: thao tác chen giữa không mất', () => {
  const p = tmpState({ bugWatch: { s1: { follow: true } } });
  const base = read(p);
  const mine = { bugWatch: { s1: { follow: true, lastPollAt: 'T10' } } };
  fs.writeFileSync(p, JSON.stringify({ bugWatch: { s1: { follow: false }, s2: { follow: true } } }, null, 2));
  writeMerged(p, base, mine);
  assert.deepEqual(read(p).bugWatch, { s1: { follow: false, lastPollAt: 'T10' }, s2: { follow: true } });
});

test('hai lần ghi liên tiếp từ hai phía không mất lệnh nào', () => {
  const p = tmpState({ bugWatch: { s1: { follow: false }, s2: { follow: false } } });
  const baseA = read(p);
  const baseB = read(p);
  writeMerged(p, baseA, { bugWatch: { s1: { follow: true }, s2: { follow: false } } });
  writeMerged(p, baseB, { bugWatch: { s1: { follow: false }, s2: { follow: true } } });
  assert.deepEqual(read(p).bugWatch, { s1: { follow: true }, s2: { follow: true } });
});

test('file hỏng hoặc chưa có: không ném, giữ bản của mình', () => {
  const p = tmpState();
  assert.equal(readState(p), null);
  writeMerged(p, { bugWatch: {} }, { bugWatch: { s1: { follow: true } } });
  assert.deepEqual(read(p).bugWatch, { s1: { follow: true } });
  fs.writeFileSync(p, '{ hỏng');
  writeMerged(p, { bugWatch: {} }, { bugWatch: { s2: { follow: true } } });
  assert.deepEqual(read(p).bugWatch, { s2: { follow: true } });
});
