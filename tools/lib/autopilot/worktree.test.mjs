import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { addWorktree } from './worktree.mjs';

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
