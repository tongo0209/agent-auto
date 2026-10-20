# Autopilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lệnh `node tools/autopilot.mjs` chạy một ticket qua luồng khai báo (plan → review → duyệt → code → review → cổng → ui-check → commit), có trần vòng, biên nhận $/turn, noti và panel console.

**Architecture:** Node ngoài phiên. Lõi thuần (`engine`, `router`, `verdict`, `prompts`) không I/O; vỏ I/O (`store`, `lock`, `claude-runner`, `gates`, `signals`, `notify`) mỏng; CLI ghép lại thành vòng lặp. Mỗi stage `claude` là một `claude -p --output-format json`.

**Tech Stack:** Node ≥22 ESM, `node:test`, `node:child_process`; console = express (CJS) + webpack/jQuery.

**Spec:** `docs/superpowers/specs/2026-10-20-autopilot-design.md`

## Global Constraints

- Không thêm dependency npm. Test bằng `node --test`, file `*.test.mjs` cạnh file nguồn (khớp `npm run test:tools` của console: `../tools/*.test.mjs` — test của `tools/lib/autopilot/` chạy bằng `node --test tools/lib/autopilot/`).
- Code style theo `rules/code-style.md` (R-CS-1..7): comment 1 dòng tối giản, không phòng thủ thừa, tên thay comment.
- Commit repo này: `[<leaf-folder>] <English subject>` + trailer Co-Authored-By. Commit repo VNG (do stage `commit`): `(<type>): <mô tả chữ thường>` + `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Stage claude KHÔNG được cấp `Bash(git commit*)`/`Bash(git push*)`. Không bao giờ push.
- `runs/` không vào git (`.gitignore` + `runs/.gitkeep`).
- Ghi `run.json` nguyên tử (tmp + rename) sau mỗi event.
- Mọi prompt stage bắt đầu bằng dòng `AUTOPILOT_RUN: <KEY>/<runId>`; runner đặt env `AUTOPILOT_RUN` cùng giá trị.
- Timeout mặc định 30 phút/stage claude; runner lỗi → thử lại đúng 1 lần.
- Budget mặc định: landing-new $40/240′, landing-fix $25/120′, feature $25/120′, buglist $30/150′.

## Review Focus

1. `fix` quay về sai caller sau nhiều vòng xen kẽ (code-review → fix → code-review pass → gates → fix → phải về `gates`, không về `code-review`) — test trong Task 2.
2. `resume` sau crash giữa stage (run.json còn `status: running`, lock của PID chết) — phải nhận lock mồ côi và chạy lại đúng stage — test Task 3 + Task 9.
3. Verdict có nhiều khối / khối nằm trong code fence khác / output rỗng — lấy khối cuối, rỗng ⇒ fail — test Task 1.
4. Repo đích có thay đổi sẵn của phiên khác (cdn-source dùng chung) — commit chỉ được lấy giao của `files` verdict và `git status` — test Task 5.
5. Router với ticket không có `paths` trong state ⇒ phải `flow: null`, không đoán — test Task 6.

---

### Task 1: verdict + prompts (thuần)

**Files:**
- Create: `tools/lib/autopilot/verdict.mjs`, `tools/lib/autopilot/verdict.test.mjs`
- Create: `tools/lib/autopilot/prompts.mjs`, `tools/lib/autopilot/prompts.test.mjs`
- Create: `runs/.gitkeep`; Modify: `.gitignore` (thêm `runs/*` + `!runs/.gitkeep`)

**Interfaces — Produces:**
- `parseVerdict(text: string) → {verdict:'pass'|'revise'|'fail', blocking:string[], advisory:string[], files:string[], note:string, malformed:boolean}`
- `renderPrompt(template: string, vars: Record<string,string>, marker: string) → string` — thay `{{name}}`, biến thiếu thay chuỗi rỗng; dòng đầu `AUTOPILOT_RUN: <marker>`; nối `VERDICT_FOOTER` ở cuối.
- `VERDICT_FOOTER: string` — hướng dẫn ghi khối ```` ```autopilot-verdict ```` (§6 spec).

- [ ] **Step 1: Test verdict**: `pass thẳng` (khối chuẩn → verdict pass, mảng đúng) · `lấy khối cuối` (2 khối, khối cuối revise) · `JSON hỏng → fail malformed:true` · `không có khối → fail malformed:true` · `revise blocking rỗng → pass, advisory giữ` · `verdict lạ ("ok") → fail malformed`.
- [ ] **Step 2: Test prompts**: dòng đầu đúng `AUTOPILOT_RUN: GW-1/r1`; `{{KEY}}` thay; biến thiếu → rỗng; kết thúc bằng `VERDICT_FOOTER`.
- [ ] **Step 3: Chạy fail** — `node --test tools/lib/autopilot/` → FAIL (module không có).
- [ ] **Step 4: Implement** — regex `/```autopilot-verdict\s*\n([\s\S]*?)```/g`, lấy match cuối.
- [ ] **Step 5: Chạy pass** + commit `[autopilot] Add verdict parser and prompt renderer`.

### Task 2: engine (máy trạng thái thuần)

**Files:** Create `tools/lib/autopilot/engine.mjs`, `engine.test.mjs`

**Interfaces — Produces:**
- `createRun({key, runId, flow, routerReason, repo, campaignDir, now}) → Run` — `stage = flow.stages[0].id`, `status:'running'`, `loops:{}`, `sessions:{}`, `receipts:[]`, `budget: {...flow.budget}`, `startedAt: now`, `callerOfFix:null`, `rejectNote:null`, `blockedBy:[]`, `stopReason:null`.
- `stageOf(flow, id) → Stage`
- `nextAction(run, flow) → {type:'claude'|'gate'|'pause'|'attached'|'done'|'stopped', stage: Stage|null}` — `done`/`stopped` theo `run.status`; còn lại theo `stage.kind`.
- `applyEvent(run, flow, event, now) → Run` (không mutate) với `event = {type:'pass'|'revise'|'fail'|'skip'|'approve'|'reject', receipt?, note?, sessionId?}`.
- `resumeRun(run, {budgetUsd?}) → Run`
- `roundOf(run, stageId) → number` = số receipt của stage + 1.

Luật (đúng §5 spec):
- `receipt` có ⇒ push vào `receipts`; `sessionId` có và `stage.keepSession` ⇒ `sessions[stage.id] = sessionId`.
- `pass`/`skip`/`approve` ⇒ đi `stage.next`; nếu stage có `returnTo:'caller'` ⇒ đi `callerOfFix` rồi xoá nó. `next:null` ⇒ `status:'done'`.
- `revise`: có `onRevise` ⇒ đi tới đó; có `loop` ⇒ `loops[id]++`, vượt `loop.max` ⇒ `stopped`, `stopReason:'loop-exhausted:<id>'`; không thì đi `loop.back`, nếu stage đích có `returnTo:'caller'` ⇒ `callerOfFix = id`. Không `loop`/`onRevise` ⇒ coi như `pass`.
- `fail`: có `loop` ⇒ xử như `revise` (tính vòng); không ⇒ `stopped`, `stopReason:'fail:<id>'`.
- `reject` (chỉ ở pause): `rejectNote = note`; có `onReject` ⇒ đi tới đó; không ⇒ `stopped:'rejected'`.
- Vào stage `pause` ⇒ `status:'paused'`; `attached` ⇒ `'attached'`; còn lại `'running'`.
- Sau mỗi event: tổng `costUsd` > `budget.usd` hoặc `now - startedAt` > `budget.minutes` phút ⇒ `stopped:'budget'` (trừ khi đã `done`).
- `resumeRun`: `status:'running'`, `stopReason:null`; stopReason `loop-exhausted:<id>` ⇒ `loops[id]=0`; `budgetUsd` ⇒ ghi đè `budget.usd`.

- [ ] **Step 1: Test** (fixture flow mini 7 stage: plan, plan-review(loop back plan max 2), approve(pause onReject plan), implement(keepSession), review(loop back fix max 2), gates(gate, loop back fix max 2), fix(returnTo caller, resume implement), done-pause → null): `đi thẳng tới done` · `revise quá max → loop-exhausted:plan-review` · `reject ghi note và về plan` · `fix về đúng caller xen kẽ` (Review Focus 1) · `fail stage không loop → fail:<id>` · `budget usd vượt → stopped budget` · `budget phút vượt` · `keepSession lưu sessionId` · `resume loop-exhausted reset vòng` · `onRevise đi nhánh pause` · `applyEvent không mutate input`.
- [ ] **Step 2: Chạy fail** → **Step 3: Implement** → **Step 4: Chạy pass** → **Step 5: Commit** `[autopilot] Add pure state machine engine`.

### Task 3: store + lock + held

**Files:** Create `tools/lib/autopilot/store.mjs`, `store.test.mjs`, `lock.mjs`, `lock.test.mjs`

**Interfaces — Produces:**
- `RUNS_DIR` (mặc định `<repo>/runs`, ghi đè bằng env `AUTOPILOT_RUNS_DIR` cho test).
- `newRunId(now: Date) → 'YYYYMMDD-HHmmss'` (giờ local).
- `runDir(key, runId) → string`; `saveRun(run) → void` (mkdir -p, tmp+rename); `loadRun(key, runId?) → Run|null` (không runId ⇒ run mới nhất theo tên thư mục); `listRuns() → Run[]` (run mới nhất mỗi KEY).
- `writeArtifact(run, name, content) → path`.
- `acquire(name, owner:{key, runId}) → {ok:true}|{ok:false, holder}` — file `runs/.lock-<name>` chứa `{pid, key, runId, at}`; PID chết (`process.kill(pid,0)` ném) ⇒ chiếm lại. `release(name, owner)` chỉ xoá khi owner khớp.
- `holdCampaign(campaignDir, owner)` / `releaseCampaign(owner)` / `heldCampaigns() → {[dir]:{key, runId}}` — file `runs/.held.json`.

- [ ] Test: `saveRun nguyên tử + loadRun mới nhất` · `listRuns mỗi KEY 1 run` · `acquire lần 2 bị từ chối kèm holder` · `PID chết thì chiếm lại` (Review Focus 2: ghi lock với pid 999999) · `release sai owner không xoá` · `held thêm/xoá`.
- [ ] Fail → implement → pass → commit `[autopilot] Add run store, locks and held campaigns`.

### Task 4: claude-runner (thật + fake)

**Files:** Create `tools/lib/autopilot/claude-runner.mjs`, `claude-runner.test.mjs`

**Interfaces — Produces:**
- `TOOLSETS: Record<'review'|'implement'|'browser'|'cut'|'intake', string>` — chuỗi `--allowedTools`:
  - `review`: `Read,Grep,Glob,Write,Bash(git diff:*),Bash(git log:*),Bash(git status:*),Bash(node:*)`
  - `implement`: review + `Edit,Skill,Agent,Bash(npm run:*),Bash(npm ci:*),Bash(npx:*),Bash(ls:*),Bash(python3:*)`
  - `browser`: implement + `mcp__browserpilot__*`
  - `cut`: implement + `Bash(osascript:*)` + `mcp__claude_ai_Figma__*`
  - `intake`: implement + `mcp__claude_ai_Google_Drive__read_file_content,mcp__claude_ai_Google_Drive__get_file_metadata,mcp__claude_ai_Microsoft_365__read_resource`
- `buildClaudeArgs({prompt, model, toolset, resumeSessionId}) → string[]` — `['-p', prompt, '--output-format','json','--allowedTools', TOOLSETS[toolset]]` + `--model` + `--resume <id>`.
- `runClaude({stageId, round, prompt, model, toolset, resumeSessionId, cwd, marker, timeoutMs=1_800_000, logFile}) → Promise<{ok, sessionId, turns, costUsd, ms, result, error}>` — spawn `claude`, env thêm `AUTOPILOT_RUN=marker`; đọc JSON `{result, session_id, num_turns, total_cost_usd, duration_ms, is_error}`; ghi stdout+stderr vào `logFile`. Env `AUTOPILOT_FAKE=<file.json>` ⇒ không spawn: đọc `script[stageId][round-1] ?? script[stageId].at(-1)` dạng `{result, costUsd?, turns?, ok?}`; thiếu stage ⇒ `{ok:true, result:'```autopilot-verdict\n{"verdict":"pass"}\n```'}`.
- `guardCode(text) → string|null` — `/\bG-[A-Z]+-\d+\b/`.

- [ ] Test: `buildClaudeArgs có --resume khi có session` · `review không có Edit, không có git commit/push trong mọi toolset` · `fake trả theo round, round vượt lấy phần tử cuối` · `fake stage thiếu → pass` · `guardCode bắt G-GIT-4`.
- [ ] Fail → implement → pass → commit `[autopilot] Add claude runner with fake mode`.

### Task 5: gates

**Files:** Create `tools/lib/autopilot/gates.mjs`, `gates.test.mjs`

**Interfaces — Produces:**
- `runGates(checks: string[], ctx) → Promise<{pass:boolean, error:string|null, results:{check, status:'pass'|'fail'|'skipped'|'error', blocking:string[], note:string}[]}>` với `ctx = {repo, campaignDir, key, flowId, files, planTitle, exec}`; `exec(cmd, args, {cwd}) → {code, stdout, stderr}` (mặc định `spawnSync`, test tiêm giả).
- Check (exit 0 = pass, 1 = fail với `blocking` = 30 dòng cuối stdout+stderr, khác = error):
  - `build`: đọc `package.json` của `campaignDir` rồi lên dần tới `repo`; script `build-dev` ưu tiên rồi `build`; không có ⇒ `error: 'no build script'`.
  - `pm-gate`: chỉ khi `grep -rl pm__` trong `campaignDir` có file ⇒ `node tools/pm-gate.mjs --page <campaignDir>`; không ⇒ skipped.
  - `fe-gate`: khi `<campaignDir>/dist` tồn tại ⇒ `node tools/fe-gate.mjs <dist> --design designs/<key>` (bỏ `--design` nếu thư mục không có).
  - `landing-parity`: khi `repo` là cdn-source ⇒ `node tools/landing-parity.mjs <campaignDir>`.
  - `layout-gate`: `node tools/layout-gate.mjs <campaignDir>`.
  - `commit`: `files ∩ (git status --porcelain -- campaignDir)` (Review Focus 4); rỗng ⇒ skipped; `git add -- <f…>` rồi `git commit --only <f…> -m "(<type>): <title>\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>"`, `type` = `feat` cho landing-new/feature, `fix` cho landing-fix/buglist; `title` = `planTitle` viết thường, bỏ dấu chấm cuối; repo cdn-source ⇒ thêm `git pull --no-rebase --no-edit origin master` (fail ⇒ error, không auto-resolve).
- `pass` = không result nào `fail`/`error`; `error` = check đầu tiên `error`.

- [ ] Test (exec giả): `exit 1 → fail kèm blocking` · `exit 2 → error dừng` · `không pm__ → skipped` · `commit chỉ lấy giao files với git status` · `commit message đúng format + trailer` · `build chọn build-dev trước build`.
- [ ] Fail → implement → pass → commit `[autopilot] Add gate runner over existing tools`.

### Task 6: signals + router

**Files:** Create `tools/lib/autopilot/router.mjs`, `router.test.mjs`, `signals.mjs`, `flows/router.json`

**Interfaces — Produces:**
- `gatherSignals({input, agentRoot}) → Signals` — `{key, inputIsSheet, phase, hasPsd, hasFigmaLink, designDir, hasDesign, campaignDir, campaignExists, repo, hasCutAssets, briefText}`. `key` = `input` khớp `/^[A-Z]+-\d+$/` hoặc null; `inputIsSheet` = link `docs.google.com/spreadsheets` / `sharepoint.com` / `.xlsx`; `campaignDir` = `state.issues[key].paths` mục đầu có `repo` trong `config.repos` (join). Không I/O ngoài đọc file.
- `route(signals, rules) → {flow:string|null, reason:string, matched:string[]}` — luật trong `flows/router.json` dạng `[{flow, all:[cond…]}]`, cond là tên field signal (truthy) hoặc `"!field"` hoặc `"phase=bugfix"`; thứ tự luật = ưu tiên; khớp `[]` hoặc thiếu `campaignDir` mà flow không phải `buglist`/`landing-new` ⇒ `flow:null`.
- `flows/router.json` đúng bảng §9 spec.

- [ ] Test: `sheet → buglist` · `phase=bugfix → buglist` · `psd chưa cắt + campaign chưa có → landing-new` · `design + campaign có → landing-fix` · `brief không design → feature` · `không paths → null` (Review Focus 5) · `reason liệt kê field đã khớp`.
- [ ] Fail → implement → pass → commit `[autopilot] Add signal gathering and rule router`.

### Task 7: flows + validate

**Files:** Create `flows/landing-new.json`, `flows/landing-fix.json`, `flows/feature.json`, `flows/buglist.json`, `tools/lib/autopilot/flows.mjs`, `flows.test.mjs`

**Interfaces — Produces:**
- `loadFlow(id) → Flow`; `listFlows() → string[]`; `validateFlow(flow, {promptsDir}) → string[]` (rỗng = hợp lệ): id duy nhất · `next/loop.back/onReject/onRevise/resume` trỏ id có thật · stage `claude` có `prompt` tồn tại + `toolset` hợp lệ · stage `gate` có `checks` trong danh sách gates · có đường từ stage đầu tới `next:null` · `budget.usd/minutes` > 0.
- Stage field bổ sung: `when: "touchesUi"` (feature/ui-check) — CLI đánh giá.
- 4 file flow đúng bảng §5 spec + budget ở Global Constraints. `buglist`: `intake-triage`(intake) → `lanes`(implement, keepSession) → `gates`(build) ⇄ `fix` ↺2 → `verify`(browser) ⇄ `fix` ↺2 → `approve-result` → `commit` → `write-sheet`(attached, `command: "/bug-fixer-lite report"`) → null.

- [ ] Test: `4 flow thật hợp lệ` · `next trỏ id lạ → lỗi` · `id trùng → lỗi` · `prompt thiếu file → lỗi`.
- [ ] Fail → implement (flows + prompts rỗng tạm để test đường dẫn chưa pass ⇒ làm cùng Task 8 commit) → pass sau Task 8.

### Task 8: prompts stage + đoạn "Chạy dưới autopilot" trong skill

**Files:** Create `flows/prompts/{cut,check-design,spec,plan,plan-review,implement,code-review,fix,ui-check,clean-code,intake-triage,lanes,verify}.md`; Modify `skills/code-developer/SKILL.md`, `skills/bug-fixer-lite/SKILL.md`, `skills/psd-cut/SKILL.md`, `skills/figma-cut/SKILL.md`, `skills/ui-check/SKILL.md`, `skills/check-design/SKILL.md`, `skills/clean-code/SKILL.md` (thêm đoạn cuối); Create `tools/lib/autopilot/skills-autopilot-section.test.mjs`

Mỗi prompt: việc của stage, file đầu vào (`{{runDir}}/plan.md`, `{{feedbackFile}}`, `{{rejectNote}}`), rules phải đọc theo repo (trỏ đường dẫn, không chép), file đầu ra, khi nào `revise` vs `fail`. Cấm hỏi user: câu hỏi ⇒ `verdict: revise|fail` + `blocking` ghi câu hỏi. Prompt review chỉ đọc diff (`git -C {{repo}} diff -- {{campaignDir}}`) + plan.

Đoạn skill, mở bằng đúng câu: `## Chạy dưới autopilot` + dòng `Chỉ áp dụng khi prompt có dòng \`AUTOPILOT_RUN:\` — phiên gõ tay bỏ qua toàn bộ mục này.` rồi: chạy đúng giai đoạn prompt nêu, không hỏi user, không commit/push, kết thúc bằng khối verdict.

- [ ] Test: `mọi SKILL.md có "## Chạy dưới autopilot" thì dòng ngay sau là câu điều kiện chuẩn` · `4 flow validate sạch với promptsDir thật`.
- [ ] Chạy pass → commit `[autopilot] Add flows, stage prompts and skill autopilot sections`.

### Task 9: notify + CLI + e2e fake

**Files:** Create `tools/lib/autopilot/notify.mjs`, `tools/autopilot.mjs`, `tools/autopilot.test.mjs`, `tools/lib/autopilot/fixtures/fake-*.json`

**Interfaces — Consumes:** mọi thứ Task 1–8. **Produces:**
- `notify(title, message)` — `osascript display notification`; env `AUTOPILOT_NO_NOTIFY=1` ⇒ chỉ ghi stderr.
- `drive(run, flow, deps) → Promise<Run>` (export để test): vòng `nextAction` → chạy → `applyEvent` → `saveRun`, tới pause/attached/done/stopped. Stage `claude`: `when` sai ⇒ `skip`; vars `{KEY, runDir, repo, campaignDir, round, rejectNote, feedbackFile, callerOfFix}`; `feedbackFile` = artifact cuối của `callerOfFix`; resume session theo `stage.resume`; runner `!ok` ⇒ thử lại 1 lần ⇒ vẫn lỗi ⇒ `stopped:'runner:<id>'`; verdict malformed + `guardCode` ⇒ `stopped:'guard:<mã>'`; verdict ghi `<stage>-r<N>.json`. Stage `gate`: `gates-r<N>.json`; `error` ⇒ `stopped:'gate-error:<check>'`. Receipt mọi stage chạy (gate: turns 0, cost 0).
- CLI: `run <KEY|link> [--flow id] [--bg] [--budget-usd n]`, `status [KEY]`, `approve <KEY> [--note]`, `reject <KEY> --note`, `resume <KEY> [--budget-usd n]`, `abort <KEY>`, `route <KEY|link> [--validate]`. `run` lấy lock `run` (1 run cùng lúc) + `photoshop` khi flow có stage `cut`, `holdCampaign`; nhả cả hai khi done/stopped/abort; pause/attached giữ held, nhả lock `run`.
- `formatStatus(run, flow) → string` — hàng stage `✓ ● ⏸ ✗ ·` + bảng receipts `stage · round · verdict · blocking/advisory · turns · phút · $` + dòng tổng (giống ảnh gốc).

- [ ] Test e2e (env `AUTOPILOT_RUNS_DIR` tạm, `AUTOPILOT_FAKE`, `AUTOPILOT_NO_NOTIFY=1`, gates `exec` giả qua env `AUTOPILOT_FAKE_GATES=<file>`): mỗi flow chạy `run` → dừng ở pause đầu → `approve` … → `done` · `plan-review revise 3 lần → stopped loop-exhausted` · `reject có note → note vào prompt plan` · `resume sau khi xoá lock PID chết` · `status in tổng $ đúng`.
- [ ] Fail → implement → pass → commit `[autopilot] Add CLI driver, notify and fake end-to-end tests`.

### Task 10: statusline báo campaign bị giữ

**Files:** Modify `tools/statusline.mjs`, `tools/statusline.test.mjs`

- `statusLine({..., held})` — `held` mặc định đọc `heldCampaigns()`; có ⇒ thêm phần `🤖 <KEY> giữ <basename(campaignDir)>` (+n nếu nhiều). Test: `có held → hiện`, `không → không đổi output cũ`.
- [ ] Commit `[statusline] Show campaigns held by autopilot`.

### Task 11: console panel

**Files:** Create `console/server/routes/autopilot.js`, `console/src/panels/autopilotPanel.js`, `console/src/core/autopilotView.mjs`, `autopilotView.test.mjs`; Modify `console/server/index.js` (mount route), nơi khởi tạo panel (`console/src/index.js`).

- Route `GET /api/autopilot` → `[{run, flowStages}]` từ `runs/*/` (run mới nhất mỗi KEY, import động `tools/lib/autopilot/store.mjs`).
- `autopilotView.mjs` thuần: `stageCells(run, flow) → [{id, state:'done'|'running'|'waiting'|'stopped'|'pending', label, sub}]`, `totals(run) → {turns, minutes, usd, runs}`.
- Panel vẽ hàng ô màu (xanh/xanh dương/cam/đỏ/viền đứt) + bảng receipts + `blockedBy`; refresh 15s như queuePanel; chỉ đọc.
- [ ] Test view → `npm --prefix console run check` pass → commit `[console] Add autopilot panel`.

### Task 12: tài liệu + nghiệm thu thật

**Files:** Modify `docs/architecture.md` (bảng Tool + Cấu trúc), `docs/skills.md`; Create `docs/notes/autopilot-acceptance.md`; Modify `templates/CLAUDE.md` + `~/.claude/CLAUDE.md` (1 dòng routing: "Ticket mid/full chạy nền → `node ~/VNG/agent-auto/tools/autopilot.mjs run <KEY>`").

- [ ] Chạy thật 1–2 ticket (user chọn hoặc ticket đang mở có design + campaign) tới mốc pause đầu, ghi receipts + so với `tools/wall-scan.mjs` vào acceptance.
- [ ] Commit `[docs] Document autopilot and record first real runs`.
