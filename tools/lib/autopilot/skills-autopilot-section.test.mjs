import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const SKILLS = path.resolve(import.meta.dirname, '../../../skills');
const HEADING = '## Chạy dưới autopilot';
const CONDITION = 'Chỉ áp dụng khi prompt có dòng `AUTOPILOT_RUN:` — phiên gõ tay bỏ qua toàn bộ mục này.';
const REQUIRED = ['code-developer', 'bug-fixer-lite', 'psd-cut', 'figma-cut', 'ui-check', 'check-design', 'clean-code'];

const readSkill = (name) => fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8');

test('skill mà prompt stage gọi tới đều có mục autopilot', () => {
  for (const name of REQUIRED) assert.ok(readSkill(name).includes(HEADING), name);
});

test('mục autopilot luôn mở bằng câu điều kiện chuẩn', () => {
  for (const name of fs.readdirSync(SKILLS)) {
    const file = path.join(SKILLS, name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const at = lines.indexOf(HEADING);
    if (at === -1) continue;
    const firstText = lines.slice(at + 1).find((l) => l.trim() !== '');
    assert.strictEqual(firstText, CONDITION, name);
  }
});
