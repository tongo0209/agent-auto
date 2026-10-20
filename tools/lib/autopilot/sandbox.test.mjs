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

const RUN = `${HOME}/VNG/agent-auto-lab/runs/GW-963/r1`;
const denyIn = (cwd, command) => sandboxDenial({ tool_name: 'Bash', tool_input: { command }, cwd }, HOME);

test('Bash ghi vào source gốc (đường tuyệt đối, ~, $HOME, ../, biến, cd) → chặn', () => {
  for (const command of [
    `sed -i '' s/a/b/ ${HOME}/VNG/git-vng/cdn-source/a.html`,
    "perl -pi -e 's/a/b/' ~/VNG/git-vng/cdn-source/a.html",
    'cp x ~/VNG/git-vng/cdn-source/a.html',
    'mv ~/VNG/git-vng/cdn-source/a.html ./a.html',
    'rm -rf ~/VNG/agent-auto/tasks',
    'echo y | tee ~/.claude/settings.json',
    'touch ~/VNG/agent-auto/x',
    'mkdir -p ${HOME}/VNG/git-vng/new',
    'ln -s x ~/VNG/git-vng/cdn-source/l',
    'chmod +x ~/VNG/agent-auto/tools/a.mjs',
    'rsync -a ./ ~/VNG/git-vng/cdn-source/',
    'truncate -s 0 ~/VNG/agent-auto/state.json',
    'echo y > ~/VNG/agent-auto/x',
    'echo y >>~/.claude/CLAUDE.md',
    'cd ~/VNG/git-vng/cdn-source && echo y > a.html',
    'cd ~/VNG/git-vng/cdn-source && git commit -am x',
    'git -C ~/VNG/git-vng/cdn-source add .',
    'cd ../../../../../../git-vng/cdn-source && git commit -am x',
    'K=~/VNG/git-vng/cdn-source; git -C $K checkout master',
    'D=$HOME/VNG/agent-auto; cp x ${D}/y',
    'git -C ~/VNG/git-vng/cdn-source branch -D old',
    'python3 -c "open(\'$HOME/VNG/agent-auto/state.json\',\'w\')"',
    `node -e "fs.writeFileSync('${HOME}/VNG/agent-auto/x','')"`,
    'node ~/VNG/agent-auto/tools/project-note.mjs lock x',
    'node ~/VNG/agent-auto/tools/daily.mjs run',
    'cd ~/VNG/git-vng/cdn-source; npm run build',
    'cd ~/VNG/agent-auto && npx prettier -w .',
  ]) assert.ok(deny('Bash', { command }), command);
  for (const sub of ['reset --hard', 'push', 'pull', 'merge x', 'rebase x', 'stash', 'apply p.diff', 'restore .', 'clean -fd', 'switch x', 'worktree add y', 'tag v1'])
    assert.ok(deny('Bash', { command: `git -C ~/VNG/git-vng/cdn-source ${sub}` }), sub);
});

test('Bash chỉ đọc source gốc, hoặc ghi trong worktree → cho qua', () => {
  for (const [cwd, command] of [
    [RUN, `cd ${RUN}; ls -la; node ~/VNG/agent-auto/tools/project-note.mjs path wt/cdn-source/products/tlbb/landing/x 2>&1 | tail -5`],
    [WT, 'P=products/tlbb/landing/x; ls $P; ls $P/.claude 2>/dev/null; git log --oneline -8 -- $P; git show --stat b59316f73 | head -30'],
    [WT, `f=${HOME}/.claude/file-history/abc/94b@v2; head -c 300 $f; grep -n -o -E 'nạp' $f | head -5`],
    [WT, `K=${HOME}/VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit; ls $K; git -C $K log -1 --format='%h %ad' --date=short; grep -n -iE 'payment' $K/AI-GUIDE.md`],
    [WT, 'ls ~/VNG/agent-auto/tasks/GW-963/ 2>&1 | head -30; cat ~/VNG/agent-auto/tasks/GW-963/brief.md 2>/dev/null | head -80'],
    [WT, 'cat ~/VNG/agent-auto/projects/tlbb/x.md'],
    [WT, 'rg -n foo ~/VNG/git-vng/cdn-source/products'],
    [WT, 'sed -n 1,40p ~/VNG/agent-auto/rules/pm-contract.md'],
    [WT, "find ~/VNG/git-vng/cdn-source/products/tlbb -name '*.twig'"],
    [WT, `node ~/VNG/agent-auto/tools/pm-gate.mjs --page ${WT}/products/a`],
    [WT, 'node ~/VNG/agent-auto/tools/project-note.mjs show x; node ~/VNG/agent-auto/tools/layout-gate.mjs a'],
    [WT, 'cp ~/VNG/git-vng/cdn-source/a.html ./a.html && echo y > ./local.txt'],
    [WT, 'npm run build && git diff --stat'],
    [WT, 'git commit -am x && rm -rf .claude/tmp'],
    [WT, `ls ${HOME}/VNG/agent-auto-lab/runs > /dev/null`],
  ]) assert.strictEqual(denyIn(cwd, command), null, command);
});

test('tool khác (Read, Grep) không bị chặn kể cả đọc repo gốc', () => {
  assert.strictEqual(deny('Read', { file_path: `${HOME}/VNG/git-vng/cdn-source/a.html` }), null);
});
