import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PANEL_PROMPT, panelClaude, launchCommand } from './panel-claude.mjs';

// claude giả in từng argv một dòng để soi shell tách đối số đúng chưa
const runInShell = (command) => spawnSync('/bin/sh', ['-c', `claude() { pwd; printf '%s\\n' "$AUTOPILOT_RUN" "$@"; }; ${command}`], { encoding: 'utf8' }).stdout.split('\n').slice(0, -1);

test('launchCommand: cd đúng cwd, env, claude kèm đúng nguyên văn đoạn dặn panel, đối số có nháy/$/khoảng trắng không vỡ', () => {
  const cwd = fs.realpathSync(path.dirname(PANEL_PROMPT));
  const args = ["Đọc '/a b/brief.md' rồi làm", '--settings', '{"x":"$HOME"}'];
  const lines = runInShell(launchCommand({ cwd, args, env: { AUTOPILOT_RUN: "GW-1/r'1" } }));
  assert.deepStrictEqual(lines.slice(0, 2), [cwd, "GW-1/r'1"]);
  assert.strictEqual(lines[2], '--append-system-prompt');
  assert.strictEqual(lines.slice(3, -3).join('\n'), fs.readFileSync(PANEL_PROMPT, 'utf8').trimEnd());
  assert.deepStrictEqual(lines.slice(-3), args);
});

test('panelClaude không đối số = claude trần + đoạn dặn (nút claude, tab +)', () => {
  assert.strictEqual(runInShell(panelClaude())[2], '--append-system-prompt');
});

test('đoạn dặn: việc có ticket thì route rồi run --bg (run thường chạy tiền cảnh làm treo tab), có open/status, cấm đụng repo gốc', () => {
  const text = fs.readFileSync(PANEL_PROMPT, 'utf8');
  const cli = text.match(/node (\S+autopilot\.mjs)/)[1];
  assert.ok(fs.existsSync(cli), cli);
  assert.match(text, /autopilot\.mjs route <KEY\|link>/);
  assert.match(text, /autopilot\.mjs run <KEY\|link> --bg/);
  assert.ok(!/autopilot\.mjs run <KEY\|link>(?! --bg)/.test(text));
  assert.match(text, /autopilot\.mjs open <KEY>/);
  assert.match(text, /autopilot\.mjs status <KEY>/);
  assert.match(text, /Chạy autopilot hay tôi sửa trực tiếp\?/);
  assert.match(text, /TỰ commit theo R-GIT/);
  assert.match(text, /KHÔNG tự push/);
  assert.match(text, /CẤM `--autostash`\/`--amend`/);
});
