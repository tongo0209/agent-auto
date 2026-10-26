import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { addWorktree, branchOf } from './worktree.mjs';
import { runChanges } from './review.mjs';

function repoWithRun() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-review-')));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' });
  git(repo, 'init', '-q');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'một\nhai\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'init');
  const run = { key: 'GW-7', runId: '20261020-100000' };
  const { top, dir, base } = addWorktree({ repo, parentDir: path.join(root, 'wt'), branch: branchOf(run) });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'một\nba\n');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'mới\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', '(fix): sửa a thêm b');
  fs.writeFileSync(path.join(repo, 'c.txt'), 'nhánh gốc đi tiếp\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'gốc');
  return { run: { ...run, worktrees: { [top]: dir }, bases: { [top]: base } }, top, dir, git };
}

test('runChanges: mỗi repo 1 khối — nhánh, commit so với điểm tách, file + diff, lệnh cherry-pick', () => {
  const { run, top, dir, git } = repoWithRun();
  const [block] = runChanges(run);
  const sha = git(dir, 'rev-parse', 'HEAD').stdout.trim();
  assert.deepStrictEqual([block.repo, block.name, block.worktree, block.branch], [top, 'repo', dir, 'autopilot/GW-7-20261020-100000']);
  assert.deepStrictEqual(block.commits, [{ sha, subject: '(fix): sửa a thêm b' }]);
  assert.deepStrictEqual(block.files.map((f) => [f.path, f.status]), [['a.txt', 'M'], ['b.txt', 'A']]);
  assert.match(block.files[0].diff, /^-hai$/m);
  assert.match(block.files[0].diff, /^\+ba$/m);
  assert.doesNotMatch(block.files[0].diff, /b\.txt/);
  assert.strictEqual(block.cherryPick, `git -C ${top} cherry-pick ${sha}`);
});

test('runChanges: run cũ chưa lưu base → lùi về merge-base với HEAD repo gốc', () => {
  const { run } = repoWithRun();
  const [block] = runChanges({ ...run, bases: undefined });
  assert.deepStrictEqual(block.files.map((f) => f.path), ['a.txt', 'b.txt']);
});

test('runChanges: repo không có commit mới → khối rỗng, không có lệnh cherry-pick', () => {
  const { top } = repoWithRun();
  const run = { key: 'GW-8', runId: '20261020-110000' };
  const { dir, base } = addWorktree({ repo: top, parentDir: path.join(path.dirname(top), 'wt2'), branch: branchOf(run) });
  const [block] = runChanges({ ...run, worktrees: { [top]: dir }, bases: { [top]: base } });
  assert.deepStrictEqual([block.commits, block.files, block.cherryPick], [[], [], null]);
});

test('R19 runChanges: run làm thẳng trên repo gốc → chỉ commit của run (bỏ commit phiên khác chen giữa), file gộp theo path', () => {
  const { top, git } = repoWithRun();
  const commit = (file, text, msg) => {
    fs.writeFileSync(path.join(top, file), text);
    git(top, 'add', file);
    git(top, 'commit', '-qm', msg);
    return git(top, 'rev-parse', 'HEAD').stdout.trim();
  };
  const startHead = git(top, 'rev-parse', 'HEAD').stdout.trim();
  const first = commit('a.txt', 'một\nbốn\n', 'run lần 1');
  commit('khac.txt', 'phiên khác\n', 'phiên khác');
  const second = commit('a.txt', 'một\nnăm\n', 'run lần 2');
  const run = { key: 'GW-9', runId: 'r1', worktrees: {}, workBranch: { [top]: 'main' }, startHead: { [top]: startHead }, commits: [{ repo: top, sha: first }, { repo: top, sha: second }] };
  const [block] = runChanges(run);
  assert.deepStrictEqual([block.repo, block.worktree, block.branch, block.cherryPick], [top, top, 'main', null]);
  assert.deepStrictEqual(block.commits.map((c) => c.subject), ['run lần 1', 'run lần 2']);
  assert.deepStrictEqual(block.files.map((f) => [f.path, f.status]), [['a.txt', 'M']]);
  assert.match(block.files[0].diff, /^\+bốn$/m);
  assert.match(block.files[0].diff, /^\+năm$/m);
});

test('R19 runChanges: run chưa commit gì → mỗi repo 1 khối rỗng', () => {
  const { top } = repoWithRun();
  const [block] = runChanges({ key: 'GW-9', runId: 'r2', workBranch: { [top]: 'main' }, startHead: { [top]: 'x' } });
  assert.deepStrictEqual([block.commits, block.files], [[], []]);
});

function cloneWithOrigin(name) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-push-')));
  const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' });
  git(root, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  git(root, 'clone', '-q', path.join(root, 'origin.git'), name);
  const top = path.join(root, name);
  const commit = (file, msg) => {
    fs.writeFileSync(path.join(top, file), `${msg}\n`);
    git(top, 'add', file);
    git(top, 'commit', '-qm', msg);
    return git(top, 'rev-parse', 'HEAD').stdout.trim();
  };
  commit('a.txt', 'init');
  git(top, 'push', '-q', 'origin', 'main');
  return { top, git, commit };
}

test('runChanges: run trên repo gốc → unpushed = mọi commit nhánh chưa lên origin, kể cả của phiên khác (push là đẩy cả nhánh)', () => {
  const { top, git, commit } = cloneWithOrigin('repo');
  const pushed = commit('a.txt', 'đã push');
  git(top, 'push', '-q', 'origin', 'main');
  const other = commit('b.txt', 'phiên khác');
  const mine = commit('c.txt', 'của run');
  const [block] = runChanges({ key: 'GW-9', runId: 'r3', workBranch: { [top]: 'main' }, commits: [{ repo: top, sha: pushed }, { repo: top, sha: mine }] });
  assert.deepStrictEqual(block.unpushed, [{ sha: other, subject: 'phiên khác' }, { sha: mine, subject: 'của run' }]);
});

test('runChanges: đã push hết → unpushed rỗng', () => {
  const { top, git, commit } = cloneWithOrigin('repo');
  const mine = commit('c.txt', 'của run');
  git(top, 'push', '-q', 'origin', 'main');
  const [block] = runChanges({ key: 'GW-9', runId: 'r5', workBranch: { [top]: 'main' }, commits: [{ repo: top, sha: mine }] });
  assert.deepStrictEqual(block.unpushed, []);
});

test('runChanges: commit của run đã lên, chỉ còn commit phiên khác → unpushed rỗng (push không phải việc của run này)', () => {
  const { top, git, commit } = cloneWithOrigin('repo');
  const mine = commit('c.txt', 'của run');
  git(top, 'push', '-q', 'origin', 'main');
  commit('b.txt', 'phiên khác');
  const [block] = runChanges({ key: 'GW-9', runId: 'r6', workBranch: { [top]: 'main' }, commits: [{ repo: top, sha: mine }] });
  assert.deepStrictEqual(block.unpushed, []);
});
