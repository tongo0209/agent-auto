import { test } from 'node:test';
import assert from 'node:assert';
import { sandboxDenial } from './sandbox.mjs';

const HOME = '/Users/u';
const WT = `${HOME}/VNG/agent-auto-lab/runs/GW-1/r1/wt/cdn-source`;
const deny = (tool_name, tool_input) => sandboxDenial({ tool_name, tool_input, cwd: WT }, HOME);

test('ghi file trong worktree → cho qua', () => {
  assert.strictEqual(deny('Edit', { file_path: `${WT}/products/a/index.html` }), null);
  assert.strictEqual(deny('Write', { file_path: 'products/a/x.scss' }), null);
});

test('ghi file vào repo gốc, agent-auto, ~/.claude → chặn', () => {
  assert.match(deny('Edit', { file_path: `${HOME}/VNG/git-vng/cdn-source/products/a/index.html` }), /git-vng/);
  assert.match(deny('Write', { file_path: `${HOME}/VNG/agent-auto/state.json` }), /agent-auto/);
  assert.match(deny('NotebookEdit', { notebook_path: `${HOME}/.claude/x.ipynb` }), /\.claude/);
  assert.match(deny('Write', { file_path: '../../../../../../git-vng/cdn-source/a.html' }), /git-vng/);
});

test('Bash nhắm vào repo gốc bằng đường tuyệt đối, ~, $HOME hay ../ → chặn', () => {
  for (const command of [
    `sed -i '' s/a/b/ ${HOME}/VNG/git-vng/cdn-source/a.html`,
    'cp x ~/VNG/git-vng/cdn-source/a.html',
    'python3 -c "open(\'$HOME/VNG/agent-auto/state.json\',\'w\')"',
    'cd ../../../../../../git-vng/cdn-source && git commit -am x',
    'node ~/VNG/agent-auto/tools/project-note.mjs lock x',
  ]) assert.ok(deny('Bash', { command }), command);
});

test('Bash trong worktree và tool chỉ đọc của agent-auto → cho qua', () => {
  assert.strictEqual(deny('Bash', { command: 'npm run build && git diff --stat' }), null);
  assert.strictEqual(deny('Bash', { command: `node ${HOME}/VNG/agent-auto/tools/pm-gate.mjs --page ${WT}/products/a` }), null);
  assert.strictEqual(deny('Bash', { command: `ls ${HOME}/VNG/agent-auto-lab/runs` }), null);
});

test('tool khác (Read, Grep) không bị chặn kể cả đọc repo gốc', () => {
  assert.strictEqual(deny('Read', { file_path: `${HOME}/VNG/git-vng/cdn-source/a.html` }), null);
});
