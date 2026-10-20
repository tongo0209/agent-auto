import { test } from 'node:test';
import assert from 'node:assert';
import { sandboxDenial } from './sandbox.mjs';

const HOME = '/Users/u';
const WT = `${HOME}/VNG/agent-auto-lab/runs/GW-1/r1/wt/cdn-source`;
const deny = (tool_name, tool_input) => sandboxDenial({ tool_name, tool_input, cwd: WT }, HOME, [WT]);

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
const denyIn = (cwd, command) => sandboxDenial({ tool_name: 'Bash', tool_input: { command }, cwd }, HOME, [WT]);

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
    [WT, `node ~/VNG/agent-auto/tools/handoff-drift.mjs --dist dist/index.html ${HOME}/VNG/git-vng/gt-promotion-template/x/mainsite/index.html --json`],
    [WT, 'node ~/VNG/agent-auto/tools/project-note.mjs show x; node ~/VNG/agent-auto/tools/layout-gate.mjs a'],
    [WT, 'cp ~/VNG/git-vng/cdn-source/a.html ./a.html && echo y > ./local.txt'],
    [WT, 'npm run build && git diff --stat'],
    [WT, 'npm run build && rm .claude/tmp/a'],
    [WT, `ls ${HOME}/VNG/agent-auto-lab/runs > /dev/null`],
  ]) assert.strictEqual(denyIn(cwd, command), null, command);
});

test('tool khác (Read, Grep) không bị chặn kể cả đọc repo gốc', () => {
  assert.strictEqual(deny('Read', { file_path: `${HOME}/VNG/git-vng/cdn-source/a.html` }), null);
});

test('R19: repo của run được ghi thẳng (file + git); repo khác, agent-auto, ~/.claude vẫn chặn', () => {
  const CDN = `${HOME}/VNG/git-vng/cdn-source`;
  const own = (tool_name, tool_input) => sandboxDenial({ tool_name, tool_input, cwd: CDN }, HOME, [CDN]);
  assert.strictEqual(own('Edit', { file_path: `${CDN}/products/a/index.html` }), null);
  assert.strictEqual(own('Write', { file_path: 'products/a/x.scss' }), null);
  assert.strictEqual(own('Bash', { command: 'sed -i "" s/a/b/ products/a/index.html && git status && git diff' }), null);
  assert.match(own('Edit', { file_path: `${HOME}/VNG/git-vng/gt-promotion-template/a.html` }), /git-vng/);
  assert.match(own('Write', { file_path: `${HOME}/VNG/agent-auto/state.json` }), /agent-auto/);
  assert.match(own('Bash', { command: 'rm -rf ~/.claude/x' }), /\.claude/);
  assert.match(own('Edit', { file_path: `${HOME}/VNG/git-vng/cdn-source-old/a.html` }), /git-vng/);
});

test('R19: trên repo gốc của run agent không được chạy git ghi (checkout/reset/stash/clean/commit/add/push…) — commit chỉ qua cổng', () => {
  const CDN = `${HOME}/VNG/git-vng/cdn-source`;
  const own = (command, cwd = CDN) => sandboxDenial({ tool_name: 'Bash', tool_input: { command }, cwd }, HOME, [CDN]);
  for (const cmd of ['git checkout -- a.html', 'git reset --hard', 'git stash', 'git clean -fd', 'git add -A', 'git commit -m x', 'git push', 'git switch master', 'git branch -D tont']) {
    assert.match(own(cmd) ?? '', /git .*repo gốc.*cổng commit/, cmd);
  }
  assert.match(own(`git -C ${CDN} restore .`, '/tmp') ?? '', /repo gốc/);
  assert.match(own('cd products/a && git checkout .') ?? '', /repo gốc/);
  assert.strictEqual(own('git log -3 && git show HEAD --stat'), null);
});

test('R19: git ghi đội lốt (-c, env, /usr/bin/git, sh -c, bash -c, xargs, plumbing) trên repo gốc → chặn', () => {
  const CDN = `${HOME}/VNG/git-vng/cdn-source`;
  const own = (command) => sandboxDenial({ tool_name: 'Bash', tool_input: { command }, cwd: CDN }, HOME, [CDN]);
  for (const cmd of [
    'git -c core.x=1 checkout -- .', 'env git stash', 'env A=1 git reset --hard', 'A=1 git clean -fd', '/usr/bin/git restore .', 'command git switch x',
    'sh -c "git checkout -- ."', "bash -c 'cd products && git stash'", 'ls | xargs git checkout --', 'xargs -n 1 git rm',
    'git checkout-index -a -f', 'git read-tree HEAD', 'git update-index --assume-unchanged a',
  ]) assert.match(own(cmd) ?? '', /repo gốc/, cmd);
  assert.strictEqual(own('git -c color.ui=never log -3'), null);
  assert.strictEqual(own('sh -c "git status"'), null);
});

test('R20: rm -r / find -delete trong repo của run → chặn; agent-auto-lab cũng là vùng chỉ đọc', () => {
  const CDN = `${HOME}/VNG/git-vng/cdn-source`;
  const own = (command) => sandboxDenial({ tool_name: 'Bash', tool_input: { command }, cwd: CDN }, HOME, [CDN]);
  for (const cmd of ['rm -rf products/a', 'rm -r products', 'rm -fr dist', 'rm -R x', 'rm --recursive x', 'find . -name x -delete', '(rm -rf products)'])
    assert.match(own(cmd) ?? '', /xoá/, cmd);
  assert.strictEqual(own('rm products/a/old.png'), null);
  assert.strictEqual(own('rm -f products/a/old.png'), null);
  const LAB = `${HOME}/VNG/agent-auto-lab`;
  assert.match(sandboxDenial({ tool_name: 'Edit', tool_input: { file_path: `${LAB}/tools/lib/autopilot/gates.mjs` }, cwd: CDN }, HOME, [CDN]) ?? '', /agent-auto-lab/);
  assert.match(own(`echo x > ${LAB}/runs/GW-1/r1/run.json`) ?? '', /agent-auto-lab/);
});

test('R19: subshell và GIT_DIR= trên repo gốc → chặn', () => {
  const CDN = `${HOME}/VNG/git-vng/cdn-source`;
  const own = (command) => sandboxDenial({ tool_name: 'Bash', tool_input: { command }, cwd: '/tmp' }, HOME, [CDN]);
  assert.match(own(`(cd ${CDN} && git stash)`) ?? '', /repo gốc/);
  assert.match(own(`GIT_DIR=${CDN}/.git git reset --hard`) ?? '', /repo gốc/);
  assert.match(own(`git --git-dir=${CDN}/.git checkout -- .`) ?? '', /repo gốc/);
  assert.match(own(`git -C ${CDN} update-ref refs/heads/tont HEAD~1`) ?? '', /repo gốc/);
  assert.strictEqual(own(`git -C ${CDN} log -1`), null);
});
