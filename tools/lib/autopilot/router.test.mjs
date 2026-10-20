import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { route, loadRules } from './router.mjs';
import { gatherSignals } from './signals.mjs';

const RULES = loadRules();
const base = { key: 'GW-1', parentKey: null, hasBugSheet: false, inputIsSheet: false, phase: 'coding', hasRawDesign: false, hasDesign: false, hasCutAssets: false, campaignDir: '/r/c', campaignExists: true, briefText: '' };

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

test('không có campaignDir → ask, không đoán', () => {
  const r = route({ ...base, hasDesign: true, campaignDir: null }, RULES);
  assert.strictEqual(r.flow, 'ask');
  assert.match(r.reason, /campaignDir/);
});

test('G1: task con có buglist (kế thừa) → buglist', () => {
  assert.strictEqual(route({ ...base, parentKey: 'GW-901', hasBugSheet: true, phase: 'wait-test' }, RULES).flow, 'buglist');
});

test('G1: task con chưa có buglist → ask kèm câu hỏi link buglist', () => {
  const r = route({ ...base, parentKey: 'GW-918', phase: 'wait-test', hasDesign: true }, RULES);
  assert.strictEqual(r.flow, 'ask');
  assert.match(r.reason, /GW-918/);
  assert.ok(r.questions.length >= 1 && r.questions.length <= 3);
  assert.match(r.questions[0], /buglist/i);
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

test('G1: task con kế thừa paths + bugSheets của cha', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-sig-'));
  const repo = path.join(root, 'cdn-source');
  fs.mkdirSync(path.join(repo, 'products/x/landing/a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ repos: { 'cdn-source': repo } }));
  const parent = { paths: [{ repo: 'cdn-source', path: 'products/x/landing/a' }], bugSheets: ['https://docs.google.com/spreadsheets/d/p'] };
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues: { 'GW-1': parent, 'GW-2': { parent: 'GW-1', phase: 'bugfix' } } }));
  const s = gatherSignals({ input: 'GW-2', agentRoot: root });
  assert.deepStrictEqual([s.parentKey, s.campaignDir, s.hasBugSheet], ['GW-1', path.join(repo, 'products/x/landing/a'), true]);
});

test('G2: path gt-promotion là handoffDir, campaignDir lấy path code', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-sig-'));
  const repos = { 'cdn-source': path.join(root, 'cdn-source'), 'gt-promotion-template': path.join(root, 'gt') };
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ repos }));
  const paths = [{ repo: 'gt-promotion-template', path: '688/e-1' }, { repo: 'cdn-source', path: 'products/t/landing/e' }];
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues: { 'GW-1': { paths } } }));
  const s = gatherSignals({ input: 'GW-1', agentRoot: root });
  assert.deepStrictEqual([s.campaignDir, s.handoffDir, s.repos], [path.join(repos['cdn-source'], 'products/t/landing/e'), path.join(repos['gt-promotion-template'], '688/e-1'), [repos['cdn-source'], repos['gt-promotion-template']]]);
});

test('G3: có nguồn clone → landing-clone, kể cả khi có PSD chưa cắt', () => {
  const r = route({ ...base, cloneSource: '/r/src', cloneSourceDir: '/r/src', hasRawDesign: true, campaignExists: false }, RULES);
  assert.strictEqual(r.flow, 'landing-clone');
});

test('G3: nguồn clone chỉ là URL (không có folder) → ask campaign nguồn', () => {
  const r = route({ ...base, cloneSource: 'https://event.vnggames.com/x', cloneSourceDir: null }, RULES);
  assert.deepStrictEqual([r.flow, r.target], ['ask', 'landing-clone']);
  assert.match(r.questions.join(' '), /nguồn/);
});

test('G3: signal cloneSource đọc cloneFrom (folder) hoặc cloneRef (URL)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-sig-'));
  const repo = path.join(root, 'cdn-source');
  fs.mkdirSync(path.join(repo, 'products/j/landing/src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ repos: { 'cdn-source': repo } }));
  const issues = {
    'GW-1': { cloneFrom: [{ repo: 'cdn-source', from: 'products/j/landing/src', to: 'products/j/landing/dst' }] },
    'GW-2': { cloneRef: 'https://event.vnggames.com/taydu/x' },
  };
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues }));
  const a = gatherSignals({ input: 'GW-1', agentRoot: root });
  assert.deepStrictEqual([a.cloneSource, a.cloneSourceDir, a.campaignDir], [path.join(repo, 'products/j/landing/src'), path.join(repo, 'products/j/landing/src'), path.join(repo, 'products/j/landing/dst')]);
  const b = gatherSignals({ input: 'GW-2', agentRoot: root });
  assert.deepStrictEqual([b.cloneSource, b.cloneSourceDir], ['https://event.vnggames.com/taydu/x', null]);
});

test('G4: sheet thiếu cột BugID/No. → ask trước intake', () => {
  const r = route({ ...base, phase: 'bugfix', hasBugSheet: true, sheetNoBugId: true }, RULES);
  assert.deepStrictEqual([r.flow, r.target], ['ask', 'buglist']);
  assert.match(r.questions.join(' '), /BugID/);
});

test('G4: sheetKind google|excel + sheetNoBugId từ note/bugWatch radar mù', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-sig-'));
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ repos: {} }));
  const issues = {
    'GW-1': { bugSheets: ['https://docs.google.com/spreadsheets/d/AAA/edit'], note: 'sheet tab Bug — không có cột BugID nên radar không đọc được' },
    'GW-2': { bugSheets: ['https://vngms-my.sharepoint.com/:x:/g/personal/x/IQB?web=1'] },
    'GW-3': { bugSheets: ['https://docs.google.com/spreadsheets/d/BBB'] },
  };
  const bugWatch = { BBB: { url: 'https://docs.google.com/spreadsheets/d/BBB', lastPollAt: '2026-10-18', seenBugs: {} } };
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues, bugWatch }));
  const sig = (k) => gatherSignals({ input: k, agentRoot: root });
  assert.deepStrictEqual([sig('GW-1').sheetKind, sig('GW-1').sheetNoBugId], ['google', true]);
  assert.deepStrictEqual([sig('GW-2').sheetKind, sig('GW-2').sheetNoBugId], ['excel', false]);
  assert.strictEqual(sig('GW-3').sheetNoBugId, true);
});

test('G5: phase waiting-design → design-intake, không cần campaign', () => {
  assert.strictEqual(route({ ...base, phase: 'waiting-design', campaignDir: null }, RULES).flow, 'design-intake');
});

test('G5: link design chưa tải → design-intake dù phase coding', () => {
  assert.strictEqual(route({ ...base, designLinkPending: true, hasDesign: true }, RULES).flow, 'design-intake');
});

test('G5: designLinkPending = có link design mà status chưa tải xong', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-sig-'));
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ repos: {} }));
  const issues = {
    'GW-1': { designLink: 'https://x.sharepoint.com/f', design: { status: 'đã-giao-chưa-tải' } },
    'GW-2': { designLink: 'https://x.sharepoint.com/f', design: { status: 'đã-giao-đã-tải' } },
  };
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues }));
  assert.strictEqual(gatherSignals({ input: 'GW-1', agentRoot: root }).designLinkPending, true);
  assert.strictEqual(gatherSignals({ input: 'GW-2', agentRoot: root }).designLinkPending, false);
});

test('G6: đổi cơ chế gameplay → gameplay-change, thắng luật task con chưa có buglist', () => {
  const r = route({ ...base, gameplayChanged: true, gameplayLocked: true, parentKey: 'GW-890' }, RULES);
  assert.strictEqual(r.flow, 'gameplay-change');
});

test('G6: gameplayChanged từ note + gameplayLocked đọc mục Khoá của file dự án', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-sig-'));
  const repo = path.join(root, 'cdn-source');
  fs.mkdirSync(path.join(repo, 'products/tlbb/landing/hb'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects/tlbb'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects/tlbb/hb.md'), '# x\n## 1. Khoá\n- gameplay: luckydraw-gift-exchange\n## 2. Nơi code\n');
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ repos: { 'cdn-source': repo } }));
  const issues = {
    'GW-890': { paths: [{ repo: 'cdn-source', path: 'products/tlbb/landing/hb' }] },
    'GW-963': { parent: 'GW-890', note: 'Chat TLBB: đổi cơ chế sang khuyến mãi nạp' },
  };
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ issues }));
  const s = gatherSignals({ input: 'GW-963', agentRoot: root });
  assert.deepStrictEqual([s.gameplayChanged, s.gameplayLocked], [true, true]);
  assert.strictEqual(gatherSignals({ input: 'GW-890', agentRoot: root }).gameplayChanged, false);
});
