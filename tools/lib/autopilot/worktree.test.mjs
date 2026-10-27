import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { addWorktree, repoState } from './worktree.mjs';

test('worktree mượn node_modules của campaign và thư mục cha (git không theo dõi) để build được', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-wt-'));
  const repo = path.join(root, 'repo');
  const campaign = path.join(repo, 'products/x/landing');
  fs.mkdirSync(path.join(campaign, 'node_modules/gulp'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'products/x/node_modules'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
  fs.writeFileSync(path.join(campaign, 'package.json'), '{}');
  const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');

  const { dir } = addWorktree({ repo, parentDir: path.join(root, 'wt'), branch: 'ap/x', linkDirs: [campaign] });
  const wtCampaign = path.join(dir, 'products/x/landing');
  assert.strictEqual(fs.realpathSync(path.join(wtCampaign, 'node_modules')), fs.realpathSync(path.join(campaign, 'node_modules')));
  assert.ok(fs.lstatSync(path.join(dir, 'products/x/node_modules')).isSymbolicLink());
  assert.strictEqual(git('status', '--porcelain').stdout, '');
});

test('addWorktree trả base = commit gốc lúc tách nhánh', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-wt-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  const { base } = addWorktree({ repo, parentDir: path.join(root, 'wt'), branch: 'ap/y' });
  assert.strictEqual(base, git('rev-parse', 'HEAD').stdout.trim());
});

test('repoState: file rename đã stage → dirty có đủ đường dẫn mới và cũ, không cắt chữ', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-rs-'));
  const git = (...a) => spawnSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' });
  git('init', '-q');
  fs.mkdirSync(path.join(repo, 'products/x'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'products/x/old.html'), 'x\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  git('mv', 'products/x/old.html', 'products/x/new.html');
  fs.writeFileSync(path.join(repo, 'products/x/moi.txt'), 'y');
  assert.deepStrictEqual(repoState(repo).dirty.sort(), ['products/x/moi.txt', 'products/x/new.html', 'products/x/old.html']);
});

test('repoState: dirtyHashes chụp nội dung từng file dở, file đã xoá là null', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-rs-'));
  const git = (...a) => spawnSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' });
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'sua.txt'), 'a');
  fs.writeFileSync(path.join(repo, 'xoa.txt'), 'b');
  git('add', '.');
  git('commit', '-qm', 'init');
  fs.writeFileSync(path.join(repo, 'sua.txt'), 'dở');
  fs.rmSync(path.join(repo, 'xoa.txt'));
  const hash = git('hash-object', 'sua.txt').stdout.trim();
  assert.deepStrictEqual(repoState(repo).dirtyHashes, { 'sua.txt': hash, 'xoa.txt': null });
});
