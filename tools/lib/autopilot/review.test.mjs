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
