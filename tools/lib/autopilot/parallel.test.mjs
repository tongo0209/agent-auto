import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-par-'));
const { drive, WHEN } = await import('./driver.mjs');
const { createRun, applyEvent, chooseAction, allowedActions } = await import('./engine.mjs');
const { loadFlow, validateFlow, PROMPTS_DIR } = await import('./flows.mjs');
const { runDir, loadRun, saveRun, pauseFile, writeArtifact } = await import('./store.mjs');
const { formatStatus } = await import('./format.mjs');
const { killChildren } = await import('./claude-runner.mjs');
const { acquire, release } = await import('./lock.mjs');

const verdict = (v, extra = {}) => '```autopilot-verdict\n' + JSON.stringify({ verdict: v, ...extra }) + '\n```';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DELAY = 40;

// Đếm số lượt claude chạy cùng lúc để chứng minh song song (và không vượt trần)
function slowClaude(script = {}, { delay = DELAY, during = () => {} } = {}) {
  const calls = [];
  let live = 0;
  const stats = { peak: 0, overlaps: [] };
  const runClaude = async (opts) => {
    calls.push(opts);
    live++;
    stats.peak = Math.max(stats.peak, live);
    await during(opts);
    await wait(delay);
    live--;
    const list = script[opts.stageId] ?? [{ result: verdict('pass') }];
    const entry = list[opts.round - 1] ?? list.at(-1);
    return { ok: true, sessionId: `s-${opts.stageId}`, turns: 1, costUsd: 0, ms: delay, result: entry.result ?? verdict('pass') };
  };
  return { runClaude, calls, stats };
}

function slowGates({ delay = DELAY, fail = {} } = {}) {
  const calls = [];
  let live = 0;
  const stats = { peak: 0 };
  const runGates = async (checks) => {
    calls.push(checks);
    live++;
    stats.peak = Math.max(stats.peak, live);
    await wait(delay);
    live--;
    const failed = fail[checks.join(',')]?.shift();
    return { pass: !failed, error: null, results: checks.map((check) => ({ check, status: failed ? 'fail' : 'pass', blocking: failed ? ['lỗi'] : [], note: '' })) };
  };
  return { runGates, calls, stats };
}

const ASK = [{ need: ['key'], question: 'Ticket nào?' }];
const groupFlow = {
  id: 'pg', budget: {}, ask: ASK,
  stages: [
    { id: 'implement', kind: 'claude', prompt: 'implement.md', toolset: 'implement', next: 'checks', keepSession: true },
    { id: 'checks', kind: 'parallel', branches: [['code-review'], ['gates', ['ui-check', 'design-compare']]], loop: { back: 'fix', max: 3 }, next: 'handoff' },
    { id: 'code-review', kind: 'claude', prompt: 'code-review.md', toolset: 'review' },
    { id: 'gates', kind: 'gate', checks: ['build'] },
    { id: 'ui-check', kind: 'claude', prompt: 'ui-check.md', toolset: 'browser' },
    { id: 'design-compare', kind: 'claude', prompt: 'design-compare.md', toolset: 'browser' },
    { id: 'handoff', kind: 'claude', prompt: 'handoff.md', toolset: 'implement', next: null },
    { id: 'fix', kind: 'claude', prompt: 'fix.md', toolset: 'implement', resume: 'implement', returnTo: 'caller' },
  ],
};
const sequentialFlow = {
  ...groupFlow, id: 'seq',
  stages: [
    { id: 'implement', kind: 'claude', prompt: 'implement.md', toolset: 'implement', next: 'code-review', keepSession: true },
    { id: 'code-review', kind: 'claude', prompt: 'code-review.md', toolset: 'review', next: 'gates' },
    { id: 'gates', kind: 'gate', checks: ['build'], next: 'ui-check' },
    { id: 'ui-check', kind: 'claude', prompt: 'ui-check.md', toolset: 'browser', next: 'design-compare' },
    { id: 'design-compare', kind: 'claude', prompt: 'design-compare.md', toolset: 'browser', next: 'handoff' },
    { id: 'handoff', kind: 'claude', prompt: 'handoff.md', toolset: 'implement', next: null },
  ],
};

const fakeRepoState = (repo) => ({ top: repo, branch: 'tont', head: 'h0', dirty: [] });
const deps = (extra) => ({ now: () => Date.now(), notify: () => {}, repoState: fakeRepoState, ...extra });
const newRun = (flow, extra = {}) => ({
  ...createRun({ key: 'GW-9', runId: `r${Math.random().toString(36).slice(2, 8)}`, flow, routerReason: 't', repo: '/repo', campaignDir: '/repo/products/x/landing/a', now: Date.now() }),
  ...extra,
});
const startedOf = (calls, id) => calls.find((c) => c.stageId === id);

beforeEach(() => fs.rmSync(path.join(process.env.AUTOPILOT_RUNS_DIR, '.repos.json'), { force: true }));

test('fan-out/join: code-review chạy cùng lúc với gates → ui-check ∥ design-compare, join xong mới tới handoff', async () => {
  const claude = slowClaude();
  const gates = slowGates();
  const run = await drive(newRun(groupFlow), groupFlow, deps({ runClaude: claude.runClaude, runGates: gates.runGates }));
  assert.strictEqual(run.status, 'done');
  assert.deepStrictEqual(claude.calls.map((c) => c.stageId).sort(), ['code-review', 'design-compare', 'handoff', 'implement', 'ui-check']);
  assert.ok(claude.stats.peak >= 2, `peak ${claude.stats.peak}`);
  assert.strictEqual(claude.calls.at(-1).stageId, 'handoff');
  const group = run.receipts.find((r) => r.stage === 'checks');
  assert.strictEqual(group.verdict, 'pass');
  assert.ok(group.wallMs < group.branchMs, `wall ${group.wallMs} branch ${group.branchMs}`);
  assert.deepStrictEqual(run.receipts.filter((r) => ['code-review', 'gates', 'ui-check', 'design-compare'].includes(r.stage)).map((r) => r.round), [1, 1, 1, 1]);
});

test('nhánh song song có childFile riêng — pause/abort tắt được từng tiến trình', async () => {
  const claude = slowClaude();
  await drive(newRun(groupFlow), groupFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
  const files = ['code-review', 'ui-check', 'design-compare'].map((id) => startedOf(claude.calls, id).childFile);
  assert.strictEqual(new Set(files).size, 3);
});

test('1 nhánh revise → các nhánh khác vẫn chạy xong, fix nhận file gom đủ kết quả, rồi chạy lại cả nhóm', async () => {
  const claude = slowClaude({ 'ui-check': [{ result: verdict('revise', { blocking: ['chữ tràn'] }) }, { result: verdict('pass') }] });
  const run = await drive(newRun(groupFlow), groupFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
  assert.strictEqual(run.status, 'done');
  const order = claude.calls.map((c) => c.stageId);
  const fixAt = order.indexOf('fix');
  assert.ok(order.slice(0, fixAt).includes('design-compare') && order.slice(0, fixAt).includes('code-review'));
  const fix = claude.calls[fixAt];
  assert.strictEqual(fix.resumeSessionId, 's-implement');
  const feedback = fix.prompt.match(/(\S+checks-r1\.json)/)[1].replace(/`/g, '');
  const merged = JSON.parse(fs.readFileSync(feedback, 'utf8'));
  assert.strictEqual(merged.verdict, 'revise');
  assert.deepStrictEqual(merged.stages.map((s) => [s.stage, s.verdict]).sort(), [['code-review', 'pass'], ['design-compare', 'pass'], ['gates', 'pass'], ['ui-check', 'revise']]);
  assert.ok(merged.stages.every((s) => fs.existsSync(s.file)));
  assert.deepStrictEqual(order.slice(fixAt + 1).sort(), ['code-review', 'design-compare', 'handoff', 'ui-check']);
});

test('gates fail trong nhánh → bước sau của nhánh đó không chạy, nhánh kia vẫn chạy xong', async () => {
  const claude = slowClaude();
  const gates = slowGates({ fail: { build: [true] } });
  const run = await drive(newRun(groupFlow), groupFlow, deps({ runClaude: claude.runClaude, runGates: gates.runGates }));
  const firstFix = claude.calls.findIndex((c) => c.stageId === 'fix');
  const beforeFix = claude.calls.slice(0, firstFix).map((c) => c.stageId);
  assert.ok(beforeFix.includes('code-review'));
  assert.ok(!beforeFix.includes('ui-check'));
  assert.strictEqual(run.status, 'done');
});

test('pause giữa nhóm → mọi nhánh claude dừng, resume nối đúng phiên từng nhánh', async () => {
  let run = newRun(groupFlow);
  const claude = slowClaude({}, {
    during: async (opts) => {
      if (opts.stageId === 'ui-check') fs.writeFileSync(pauseFile(run.key, run.runId), '');
    },
  });
  run = await drive(run, groupFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
  assert.deepStrictEqual([run.status, run.stopReason, run.stage], ['stopped', 'paused', 'checks']);
  const cut = [run.cutSession].flat().map((c) => c.stage).sort();
  assert.ok(cut.includes('ui-check') && cut.includes('design-compare'), cut.join());
  assert.ok(!claude.calls.some((c) => c.stageId === 'handoff'));

  const again = slowClaude();
  run = await drive({ ...run, status: 'running', stopReason: null }, groupFlow, deps({ runClaude: again.runClaude, runGates: slowGates().runGates }));
  assert.strictEqual(run.status, 'done');
  assert.strictEqual(startedOf(again.calls, 'ui-check').resumeSessionId, 's-ui-check');
  assert.strictEqual(startedOf(again.calls, 'design-compare').resumeSessionId, 's-design-compare');
});

test('killChildren tắt mọi tiến trình con của run (nhánh song song)', async () => {
  const run = newRun(groupFlow);
  saveRun(run);
  const kids = ['ui-check', 'design-compare'].map((id) => {
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    fs.writeFileSync(path.join(runDir(run.key, run.runId), `.child-${id}`), JSON.stringify({ pid: child.pid }));
    return new Promise((resolve) => child.on('exit', (code, signal) => resolve(signal)));
  });
  assert.strictEqual(killChildren(run.key, run.runId), 2);
  assert.deepStrictEqual(await Promise.all(kids), ['SIGTERM', 'SIGTERM']);
});

test('board hiện nhiều stage đang chạy cùng lúc', async () => {
  let snapshot = null;
  let run = newRun(groupFlow);
  const claude = slowClaude({}, {
    during: async (opts) => {
      if (opts.stageId === 'design-compare') {
        await wait(5);
        snapshot = loadRun(run.key, run.runId);
      }
    },
  });
  run = await drive(run, groupFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
  assert.ok(snapshot.active.includes('ui-check') && snapshot.active.includes('design-compare'), snapshot.active.join());
  const line = formatStatus(snapshot, groupFlow).split('\n')[2];
  assert.match(line, /● ui-check/);
  assert.match(line, /● design-compare/);
  assert.ok(!('active' in run));
});

test('2 nhánh browser cùng run dùng chung khoá browser tới khi nhánh browser cuối xong', async () => {
  const other = { key: 'GW-OTHER', runId: 'x' };
  let heldMidway = null;
  const claude = slowClaude({}, {
    during: async (opts) => {
      if (opts.stageId !== 'design-compare') return;
      await wait(DELAY + 30);
      heldMidway = !acquire('browser', other).ok;
    },
  });
  const run = await drive(newRun(groupFlow), groupFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
  assert.strictEqual(run.status, 'done');
  assert.strictEqual(heldMidway, true);
  assert.strictEqual(acquire('browser', other).ok, true);
  release('browser', other);
});

test('ui-check và design-compare chạy song song serve ở port khác nhau, phiên browser riêng', () => {
  const port = (file) => fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8').match(/serve `dist` ở port (\d+)/)?.[1];
  assert.ok(port('ui-check.md') && port('design-compare.md'));
  assert.notStrictEqual(port('ui-check.md'), port('design-compare.md'));
});

test('song song nhanh hơn tuần tự (cùng thời lượng giả từng stage)', async () => {
  const time = async (flow) => {
    const started = Date.now();
    await drive(newRun(flow), flow, deps({ runClaude: slowClaude({}, { delay: 150 }).runClaude, runGates: slowGates({ delay: 150 }).runGates }));
    return Date.now() - started;
  };
  const seq = await time(sequentialFlow);
  const par = await time(groupFlow);
  console.log(`đo: tuần tự ${seq}ms · song song ${par}ms`);
  assert.ok(par < seq - 150, `song song ${par}ms, tuần tự ${seq}ms`);
});

test('run cũ đang đứng ở stage giờ là thành viên nhóm → chạy cả nhóm thay vì stage lẻ', async () => {
  const claude = slowClaude();
  const run = await drive(newRun(groupFlow, { stage: 'gates' }), groupFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
  assert.strictEqual(run.status, 'done');
  assert.ok(claude.calls.some((c) => c.stageId === 'code-review'));
});

test('fix gọi bởi stage thành viên (callerOfFix cũ) → quay về nhóm', () => {
  const run = applyEvent(newRun(groupFlow, { stage: 'fix', callerOfFix: 'gates' }), groupFlow, { type: 'pass' }, Date.now());
  assert.strictEqual(run.stage, 'checks');
});

test('goto thành viên → về nhóm; skip nhóm cần lý do như cổng', () => {
  const stopped = { ...newRun(groupFlow), stage: 'handoff', status: 'stopped', stopReason: 'x', receipts: [{ stage: 'checks', round: 1, verdict: 'pass', ms: 0, costUsd: 0, turns: 0 }, { stage: 'ui-check', round: 1, verdict: 'pass', ms: 0, costUsd: 0, turns: 0 }] };
  const gotoStages = allowedActions(stopped, groupFlow).find((a) => a.type === 'goto').stages;
  assert.ok(gotoStages.includes('checks') && !gotoStages.includes('ui-check'));
  assert.strictEqual(chooseAction(stopped, groupFlow, { type: 'goto', stage: 'ui-check' }, { now: Date.now() }).stage, 'checks');
  const atGroup = { ...stopped, stage: 'checks' };
  assert.throws(() => chooseAction(atGroup, groupFlow, { type: 'skip' }, { now: Date.now() }), /lý do/);
});

test('mỗi lượt stage ghi startedAt/endedAt/durationMs vào <stage>-rN.json và receipt; status in thời gian tiết kiệm', async () => {
  const run = await drive(newRun(groupFlow), groupFlow, deps({ runClaude: slowClaude().runClaude, runGates: slowGates().runGates }));
  for (const id of ['implement', 'code-review', 'gates', 'ui-check', 'checks']) {
    const art = JSON.parse(fs.readFileSync(path.join(runDir(run.key, run.runId), `${id}-r1.json`), 'utf8'));
    assert.ok(art.startedAt && art.endedAt && art.durationMs >= 0, id);
    const receipt = run.receipts.find((r) => r.stage === id);
    assert.ok(receipt.startedAt && receipt.durationMs >= 0, id);
  }
  const out = formatStatus(run, groupFlow);
  assert.match(out, /code-review · r1 · pass .*\d+(ms|s)/);
  assert.match(out, /Song song tiết kiệm: \d/);
});

test('flow thật: landing-fix / landing-new / feature dùng nhóm code-review ∥ (gates → ui-check ∥ design-compare)', () => {
  for (const id of ['landing-fix', 'landing-new', 'feature']) {
    const flow = loadFlow(id);
    const group = flow.stages.find((s) => s.kind === 'parallel' && s.branches.flat(2).includes('code-review'));
    assert.deepStrictEqual(group.branches, [['code-review'], ['gates', ['ui-check', 'design-compare']]], id);
    assert.deepStrictEqual(validateFlow(flow, { promptsDir: PROMPTS_DIR }), [], id);
    assert.strictEqual(flow.stages.find((s) => s.id === 'approve-result').rejectReturnTo, group.id, id);
  }
  const startup = loadFlow('landing-new').stages.find((s) => s.kind === 'parallel' && s.branches.flat(2).includes('cut'));
  assert.deepStrictEqual(startup.branches, [['cut'], ['check-design']]);
});

test('validateFlow: nhánh trỏ stage không có → lỗi', () => {
  const flow = { ...groupFlow, stages: [{ ...groupFlow.stages[1], branches: [['khong-co']] }, ...groupFlow.stages.filter((s) => s.id !== 'checks')] };
  assert.ok(validateFlow(flow, { promptsDir: PROMPTS_DIR }).some((e) => e.includes('khong-co')));
});

// ---- pipeline theo section ----

const sectionFlow = {
  id: 'sec', budget: {}, ask: ASK,
  stages: [
    { id: 'sections', kind: 'sections', when: 'multiSection', lane: 'implement-section', review: 'section-review', build: 'section-build', ui: 'section-ui', fix: 'fix-section', rounds: 3, next: 'implement' },
    { id: 'implement', kind: 'claude', prompt: 'implement.md', toolset: 'implement', when: 'singleSection', next: null, keepSession: true },
    { id: 'implement-section', kind: 'claude', prompt: 'implement-section.md', toolset: 'implement', keepSession: true },
    { id: 'section-review', kind: 'claude', prompt: 'section-review.md', toolset: 'review' },
    { id: 'section-build', kind: 'gate', checks: ['build'] },
    { id: 'section-ui', kind: 'claude', prompt: 'section-ui.md', toolset: 'browser' },
    { id: 'fix-section', kind: 'claude', prompt: 'fix-section.md', toolset: 'implement' },
  ],
};

function withSections(run, sections) {
  saveRun(run);
  writeArtifact(run, 'sections.json', { sections });
  return run;
}
const threeSections = [{ id: 's1', files: ['a/s1.scss'] }, { id: 's2', files: ['a/s2.scss'] }, { id: 's3', files: ['a/s3.scss'] }];

test('pipeline: section 2 lỗi cấp section → chỉ lane 2 sửa (nối phiên lane), section 1/3 không chạy lại', async () => {
  const run0 = withSections(newRun(sectionFlow), threeSections);
  const claude = slowClaude({ 'section-ui@s2': [{ result: verdict('revise', { blocking: ['lệch'] }) }, { result: verdict('pass') }] });
  const run = await drive(run0, sectionFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
  assert.strictEqual(run.status, 'done');
  const ids = claude.calls.map((c) => c.stageId);
  assert.deepStrictEqual(ids.filter((id) => id.startsWith('fix-section')), ['fix-section@s2']);
  assert.strictEqual(startedOf(claude.calls, 'fix-section@s2').resumeSessionId, 's-implement-section@s2');
  for (const s of ['s1', 's3']) assert.strictEqual(ids.filter((id) => id.endsWith(`@${s}`)).length, 3, s);
  assert.strictEqual(ids.filter((id) => id === 'section-ui@s2').length, 2);
  assert.ok(!ids.includes('implement'));
  assert.match(startedOf(claude.calls, 'section-ui@s1').prompt, /#s1/);
});

test('pipeline: section xong trước được kiểm ngay, không chờ lane chậm', async () => {
  const run0 = withSections(newRun(sectionFlow), threeSections);
  const order = [];
  const claude = slowClaude({}, { during: async (opts) => { order.push(opts.stageId); if (opts.stageId === 'implement-section@s3') await wait(200); } });
  await drive(run0, sectionFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
  assert.ok(order.indexOf('section-review@s1') < order.length - 1);
  const s3Done = order.indexOf('section-review@s3');
  assert.ok(order.indexOf('section-review@s1') < s3Done && order.indexOf('section-ui@s1') < s3Done);
});

test('pipeline: trần 5 agent cùng lúc, build không bao giờ 2 lượt cùng lúc và không chạy khi ui đang đọc dist', async () => {
  const sections = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, files: [`a/s${i}.scss`] }));
  const run0 = withSections(newRun(sectionFlow), sections);
  let building = false;
  let uiReading = 0;
  const clashes = [];
  const claude = slowClaude({}, { during: async (opts) => { if (opts.stageId.startsWith('section-ui') && building) clashes.push(opts.stageId); if (opts.stageId.startsWith('section-ui')) uiReading++; } });
  const wrapped = async (opts) => {
    const r = await claude.runClaude(opts);
    if (opts.stageId.startsWith('section-ui')) uiReading--;
    return r;
  };
  const gates = slowGates();
  const runGates = async (checks, ctx) => {
    if (uiReading) clashes.push('build-while-ui');
    building = true;
    const r = await gates.runGates(checks, ctx);
    building = false;
    return r;
  };
  const run = await drive(run0, sectionFlow, deps({ runClaude: wrapped, runGates }));
  assert.strictEqual(run.status, 'done');
  assert.ok(claude.stats.peak <= 5, `peak ${claude.stats.peak}`);
  assert.strictEqual(claude.stats.peak, 5);
  assert.strictEqual(gates.stats.peak, 1);
  assert.ok(gates.calls.length < sections.length, `${gates.calls.length} lượt build cho ${sections.length} section`);
  assert.deepStrictEqual(clashes, []);
});

test('pipeline nhanh hơn làm tuần tự từng section', async () => {
  const time = async (flow, sections) => {
    const run0 = withSections(newRun(flow), sections);
    const started = Date.now();
    await drive(run0, flow, deps({ runClaude: slowClaude({}, { delay: 60 }).runClaude, runGates: slowGates({ delay: 60 }).runGates }));
    return Date.now() - started;
  };
  const one = await time({ ...sectionFlow, stages: sectionFlow.stages.map((s) => (s.id === 'sections' ? { ...s, maxAgents: 1 } : s)) }, threeSections);
  const five = await time(sectionFlow, threeSections);
  assert.ok(five < one - 150, `pipeline ${five}ms, 1 agent ${one}ms`);
});

test('1 section hoặc file chồng nhau → rơi về implement thường', async () => {
  for (const sections of [[threeSections[0]], [{ id: 's1', files: ['a/x.scss'] }, { id: 's2', files: ['a/x.scss'] }]]) {
    const run0 = withSections(newRun(sectionFlow), sections);
    assert.strictEqual(WHEN.multiSection(run0), false);
    const claude = slowClaude();
    const run = await drive(run0, sectionFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
    assert.strictEqual(run.status, 'done');
    assert.deepStrictEqual(claude.calls.map((c) => c.stageId), ['implement']);
  }
});

test('pipeline: pause giữa chừng rồi resume → section đã pass không chạy lại', async () => {
  let run = withSections(newRun(sectionFlow), threeSections);
  const claude = slowClaude({}, { during: async (opts) => { if (opts.stageId === 'implement-section@s3') { await wait(300); fs.writeFileSync(pauseFile(run.key, run.runId), ''); } } });
  run = await drive(run, sectionFlow, deps({ runClaude: claude.runClaude, runGates: slowGates().runGates }));
  assert.deepStrictEqual([run.status, run.stopReason], ['stopped', 'paused']);
  assert.deepStrictEqual([...run.sectionsPassed].sort(), ['s1', 's2']);
  const again = slowClaude();
  run = await drive({ ...run, status: 'running', stopReason: null }, sectionFlow, deps({ runClaude: again.runClaude, runGates: slowGates().runGates }));
  assert.strictEqual(run.status, 'done');
  assert.ok(again.calls.every((c) => c.stageId.endsWith('@s3')), again.calls.map((c) => c.stageId).join());
});

test('flow thật: landing-new / landing-fix có pipeline section trước implement, hợp lệ', () => {
  for (const id of ['landing-new', 'landing-fix']) {
    const flow = loadFlow(id);
    const sections = flow.stages.find((s) => s.kind === 'sections');
    assert.ok(sections, id);
    assert.strictEqual(sections.next, 'implement');
    assert.strictEqual(flow.stages.find((s) => s.id === 'approve-plan').next, sections.id);
    assert.strictEqual(flow.stages.find((s) => s.id === 'implement').when, 'singleSection');
  }
});
