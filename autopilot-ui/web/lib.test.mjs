import { test } from 'node:test';
import assert from 'node:assert';
import { pushCommand } from './lib.js';

test('pushCommand: cdn-source chỉ chạy git mr — push trần trước thì MR không được tạo', () => {
  assert.strictEqual(pushCommand('/x/git-vng/cdn-source', 'tont'), 'git -C "/x/git-vng/cdn-source" mr');
});

test('pushCommand: repo khác push đúng nhánh lên origin', () => {
  assert.strictEqual(pushCommand('/x/git-vng/gt-promotion-template', 'master'), 'git -C "/x/git-vng/gt-promotion-template" push origin master');
});
