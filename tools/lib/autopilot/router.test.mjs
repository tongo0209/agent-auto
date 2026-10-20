import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { route, loadRules } from './router.mjs';
import { gatherSignals } from './signals.mjs';

const RULES = loadRules();
const base = { key: 'GW-1', inputIsSheet: false, phase: 'coding', hasRawDesign: false, hasDesign: false, hasCutAssets: false, campaignDir: '/r/c', campaignExists: true, briefText: '' };

test('link sheet → buglist kể cả không có campaign', () => {
  assert.strictEqual(route({ ...base, inputIsSheet: true, campaignDir: null }, RULES).flow, 'buglist');
});

test('phase bugfix → buglist', () => {
  assert.strictEqual(route({ ...base, phase: 'bugfix' }, RULES).flow, 'buglist');
});

test('PSD chưa cắt + campaign chưa có → landing-new', () => {
  assert.strictEqual(route({ ...base, hasRawDesign: true, hasDesign: true, campaignExists: false }, RULES).flow, 'landing-new');
});

test('design + campaign đã có → landing-fix', () => {
  assert.strictEqual(route({ ...base, hasDesign: true, hasCutAssets: true }, RULES).flow, 'landing-fix');
});

test('chỉ có brief → feature', () => {
  assert.strictEqual(route({ ...base, briefText: 'thêm nút share' }, RULES).flow, 'feature');
});

test('không có campaignDir → null, không đoán', () => {
  const r = route({ ...base, hasDesign: true, campaignDir: null }, RULES);
  assert.strictEqual(r.flow, null);
  assert.match(r.reason, /campaignDir/);
});

test('reason liệt kê điều kiện đã khớp', () => {
  const r = route({ ...base, hasDesign: true }, RULES);
  assert.deepStrictEqual(r.matched, ['hasDesign', 'campaignExists']);
  assert.match(r.reason, /hasDesign/);
});

test('gatherSignals đọc state/config/designs/tasks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-sig-'));
  const repo = path.join(root, 'cdn-source');
  fs.mkdirSync(path.join(repo, 'products/x/landing/a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ repos: { 'cdn-source': repo } }));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues: { 'GW-7': { phase: 'coding', paths: [{ repo: 'gt-promotion-template', path: 'z' }, { repo: 'cdn-source', path: 'products/x/landing/a' }] } } }));
  fs.mkdirSync(path.join(root, 'designs/GW-7/_auto-export'), { recursive: true });
  fs.writeFileSync(path.join(root, 'designs/GW-7/main.psd'), '');
  fs.mkdirSync(path.join(root, 'tasks/GW-7'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tasks/GW-7/brief.md'), 'link https://www.figma.com/design/abc');

  const s = gatherSignals({ input: 'GW-7', agentRoot: root });
  assert.deepStrictEqual(
    [s.key, s.repo, s.campaignDir, s.campaignExists, s.hasRawDesign, s.hasDesign, s.hasCutAssets, s.inputIsSheet],
    ['GW-7', repo, path.join(repo, 'products/x/landing/a'), true, true, true, true, false],
  );
  assert.strictEqual(gatherSignals({ input: 'https://docs.google.com/spreadsheets/d/x', agentRoot: root }).inputIsSheet, true);
});
