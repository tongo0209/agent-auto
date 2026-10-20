# Autopilot Branching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi stage của 1 run autopilot có lựa chọn (chạy lại / quay về / bỏ qua / chọn phương án / điểm dừng), chỉnh được luồng trước khi chạy, console vẽ đúng các lựa chọn hợp lệ.

**Architecture:** Một hàm thuần `allowedActions` + `chooseAction` trong `engine.mjs` là nguồn luật duy nhất; CLI gọi `chooseAction` rồi `continueRun`; API dùng `allowedActions` để vừa trả `actions` cho UI vừa từ chối POST sai trước khi spawn CLI; UI chỉ vẽ từ `run.actions`.

**Tech Stack:** Node ESM thuần, `node:test`, Express (mượn `console/node_modules`), frontend JS thuần không build.

**Spec:** `docs/superpowers/specs/2026-10-20-autopilot-branching-design.md`

## Global Constraints

- Code theo `~/VNG/agent-auto/rules/code-style.md` (R-CS-1..7): comment 1 dòng tối thiểu, không phòng thủ thừa, tên thay comment.
- Mọi chữ hiện cho user bằng tiếng Việt; mã nội bộ (`stopReason`, event type) giữ tiếng Anh như hiện có.
- Commit format repo nội bộ: `[autopilot] <English subject>` + 2 dòng attribution của phiên.
- Mặc định run vẫn tự chạy một mạch; chỉ dừng ở điểm dừng, mốc `pause` sẵn có, hoặc khi hỏng.
- Gate-like = `stage.kind === 'gate' || stage.id === 'ui-check'`; bỏ gate-like **bắt buộc** lý do.
- `goto` chỉ tới stage đã có biên nhận và khác stage hiện tại.
- Run cũ thiếu `plan`/`choice`/`gateSkipped` đọc như `{disabled:[],breakpoints:[]}` / `null` / `[]`, không migrate file.
- Suite chốt: `node --test --test-timeout=20000 --test-force-exit autopilot-ui/*.test.mjs tools/autopilot.test.mjs tools/lib/autopilot/*.test.mjs` (trước plan: 215/215).
- KHÔNG restart server 4800 khi chưa hỏi user (đang chạy với `AUTOPILOT_LAB_WRITES=1`). KHÔNG push.

### Hai chỗ plan lệch spec (đã đối chiếu code)

1. **Điểm dừng dùng `status: 'stopped'`, không phải `'paused'`.** `nextAction` (`engine.mjs:28`) chỉ dừng ở `done`/`stopped`; run `paused` đứng ở stage `claude` sẽ bị driver chạy luôn. Dừng tay hiện nay cũng là `stopped` + `stopReason:'paused'`. Điểm dừng = `stopped` + `stopReason:'breakpoint:<id>'`; *Chạy tiếp* = `resume` như cũ.
2. **Route `/api/autopilot/*` không nằm sau cổng 403** (`server.mjs:97` đặt trước middleware 403, cố ý từ aafe309). Bỏ ca Playwright "POST bị 403"; thay bằng test API với `spawnCli` giả.

## Review Focus

1. Bấm lựa chọn khi run vừa chuyển sang `running` (UI còn dữ liệu cũ) → API trả 400 "run đang chạy", không spawn CLI. → test ở Task 6.
2. `goto implement` sau khi đã có phiên `implement` → phiên mới, không `--resume` phiên cũ (code đã đổi). → test ở Task 1 (`sessions` bị xoá từ target trở đi).
3. Plan viết lại sau `pick` mà còn `choice` cũ → `goto plan` xoá `choice`. → test ở Task 1.
4. `plan.md` không có mục `## Phương án` (run cũ hoặc model quên) → `options` rỗng, dock giữ Duyệt/Trả về, `pick` bị từ chối. → test ở Task 2 và Task 1.
5. `--skip` tên stage không có trong luồng (gõ sai) → CLI từ chối trước khi tạo run, không tạo thư mục run rác. → test ở Task 5.

---

### Task 1: Engine — luật lựa chọn

**Files:**
- Modify: `tools/lib/autopilot/engine.mjs`
- Test: `tools/lib/autopilot/engine.test.mjs`

**Interfaces:**
- Produces:
  - `isGateLike(stage) → boolean`
  - `createRun({ ..., disabled = [], breakpoints = [], skipReason = null })` → run có `plan: { disabled, breakpoints, skipReason }`, `choice: null`, `gateSkipped: []`
  - `allowedActions(run, flow, { options = [] } = {}) → Action[]`, với `Action` là một trong:
    `{type:'retry'}` · `{type:'goto', stages:string[]}` · `{type:'skip', needsReason:boolean}` · `{type:'pick', options:string[]}` · `{type:'break', stages:string[]}`
  - `chooseAction(run, flow, action, { options = [], now }) → run` — `action = {type, stage?, option?, note?, reason?}`; ném `Error` (message tiếng Việt) khi `action.type` không nằm trong `allowedActions` hoặc thiếu lý do.
  - `applyEvent` nhận thêm event `{type:'skip', by:'user', reason}`.

Luật `allowedActions` (run `done` hoặc `aborted` ⇒ `[]`; `running` không bị ngắt ⇒ chỉ `break`):

| Action | Có khi |
|---|---|
| `retry` | status `stopped` và stage hiện tại kind `claude`/`gate` |
| `goto` | status `paused`/`stopped`; `stages` = stage có biên nhận, ≠ stage hiện tại, theo thứ tự flow |
| `skip` | status `stopped` và stage hiện tại kind `claude`/`gate`; `needsReason = isGateLike(stage)` |
| `pick` | status `paused`, stage id `approve-plan`, `options.length >= 2`; `options` = id các phương án |
| `break` | mọi status trừ `done`; `stages` = stage chưa có biên nhận, kind `claude`/`gate` |

Hành vi `chooseAction`:
- `retry`: `status:'running'`, `stopReason:null`, `loops[stage]=0`, `rejectNote=note ?? null`, xoá `sessions[stage]`.
- `goto`: `stage=target`, `status:'running'`, `stopReason:null`, `rejectNote=note`, xoá `loops` và `sessions` của target và mọi stage sau nó trong flow; target là `plan` ⇒ `choice:null`.
- `skip`: `applyEvent` với `{type:'skip', by:'user', reason, receipt:{stage, verdict:'skipped-by-user', note:reason ?? '', blocking:0, advisory:0, turns:0, costUsd:0, ms:0}}` sau khi đặt `status:'running'`; gate-like ⇒ push `{stage, reason, at}` vào `gateSkipped`.
- `pick`: `choice = {id, title, note}` (title lấy từ `options` truyền vào — dạng `{id,title}`), rồi `applyEvent({type:'approve'})`.
- `break`: toggle `stage` trong `plan.breakpoints`; không đổi status.

- [ ] **Step 1: Viết test đỏ** trong `engine.test.mjs`, dùng `FLOW`/`fresh`/`step` có sẵn. Tên + assert:
  - `allowedActions: running chỉ có break`
  - `allowedActions: stopped ở gates có retry, skip needsReason=true, goto [plan, plan-review, implement, review]`
  - `allowedActions: approve-plan có 2 phương án → pick [A,B]; 1 phương án → không có pick`
  - `chooseAction retry: reset loop + xoá session, status running`
  - `chooseAction goto implement: xoá sessions.implement, loops từ implement trở đi về 0`
  - `chooseAction goto plan: choice về null`
  - `chooseAction goto stage chưa qua → ném "chưa đi qua"`
  - `chooseAction skip gates thiếu reason → ném "cần lý do"`; `có reason → gateSkipped 1 dòng, receipt verdict skipped-by-user, stage = next`
  - `chooseAction pick A → choice.id A, stage = implement`
  - `chooseAction pick khi không có phương án → ném`
  - `chooseAction trên run running (không break) → ném "đang chạy"`
  - `createRun thiếu disabled/breakpoints → plan {disabled:[],breakpoints:[]}, choice null, gateSkipped []`
- [ ] **Step 2:** `node --test tools/lib/autopilot/engine.test.mjs` → FAIL (`allowedActions is not a function`).
- [ ] **Step 3:** Cài các hàm trên trong `engine.mjs`. `allowedActions` dùng `run.plan ?? {disabled:[],breakpoints:[]}` cho run cũ.
- [ ] **Step 4:** Chạy lại → PASS, cả test cũ trong file.
- [ ] **Step 5:** Commit `[autopilot] Engine: allowedActions/chooseAction for retry, goto, skip, pick, break`.

### Task 2: Format — phương án và ô pipeline

**Files:**
- Modify: `tools/lib/autopilot/format.mjs`
- Test: `tools/lib/autopilot/format.test.mjs`

**Interfaces:**
- Produces:
  - `parseOptions(planMd: string) → {id, title, body}[]` — đọc mục `## Phương án`, mỗi `### <A|B|C> · <tên>` là 1 phương án, `body` = text tới heading kế; không có mục ⇒ `[]`.
  - `stageCells` mỗi ô thêm `breakpoint: boolean`, `skippedReason: string|null` (biên nhận cuối `skipped-by-user` ⇒ `note`), `state:'skipped'` khi biên nhận cuối là `skipped-by-user`.

- [ ] **Step 1: Test đỏ:** `parseOptions: 3 phương án → id [A,B,C], title đúng, body không chứa heading kế` · `parseOptions: 1 phương án → 1 phần tử` · `parseOptions: không có mục → []` · `stageCells: stage bị user bỏ → state skipped, skippedReason "QC chưa cần"` · `stageCells: breakpoint đánh dấu đúng ô`.
- [ ] **Step 2:** `node --test tools/lib/autopilot/format.test.mjs` → FAIL.
- [ ] **Step 3:** Cài `parseOptions` + mở rộng `stageCells`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `[autopilot] Format: parse plan options, mark user-skipped and breakpoint cells`.

### Task 3: Driver — stage tắt, điểm dừng, phương án vào prompt

**Files:**
- Modify: `tools/lib/autopilot/driver.mjs` (vòng `drive` ~dòng 203–245, `stageVars` dòng 41, `runStage` dòng 180)
- Test: `tools/lib/autopilot/driver.test.mjs`

**Interfaces:**
- Consumes: `chooseAction`, `isGateLike` (Task 1).
- Produces: `stageVars(...)` thêm `choice: string` = `"<id> · <title>\n<note>"` hoặc `''`.

Hành vi:
- Trong `drive`, trước `runStage`: `stage.id ∈ run.plan.disabled` ⇒ `applyEvent({type:'skip', by:'user', reason: run.plan.skipReason ?? 'tắt từ đầu', receipt})` (gate-like ghi `gateSkipped`), `continue`.
- Sau `applyEvent` của stage vừa chạy: event là `pass`/`skip` và `stage.id ∈ run.plan.breakpoints` và run chưa `done`/`stopped` ⇒ `applyEvent({type:'halt', reason:`breakpoint:${stage.id}`})`.

- [ ] **Step 1: Test đỏ:** `disabled plan-review → receipt skipped-by-user, không gọi runClaude cho plan-review` · `disabled gates kèm skipReason → gateSkipped [{stage:'gates', reason}]` · `breakpoint implement → stopped breakpoint:implement, stage = stage kế` · `resume sau breakpoint chạy tiếp tới mốc pause kế` · `choice có → prompt implement chứa "A · "` · `run cũ không có plan → chạy như trước`.
- [ ] **Step 2:** `node --test tools/lib/autopilot/driver.test.mjs` → FAIL.
- [ ] **Step 3:** Cài.
- [ ] **Step 4:** PASS cả file.
- [ ] **Step 5:** Commit `[autopilot] Driver: honor disabled stages, breakpoints, pass chosen option to prompts`.

### Task 4: Prompt — plan ra phương án

**Files:**
- Modify: `flows/prompts/plan.md`, `flows/prompts/plan-review.md`, `flows/prompts/implement.md`

- [ ] **Step 1:** `plan.md` thêm mục bắt buộc (chép nguyên văn):
  ```
  ## Phương án
  Viết 2–3 cách làm khác nhau thật sự, mỗi cách:
  ### A · <tên ngắn>
  Cách làm 1–2 dòng. Đánh đổi: <được gì / mất gì>.
  Chỉ có 1 cách hợp lý ⇒ ghi đúng 1 mục `### A · <tên>` và 1 dòng vì sao không có cách khác. Không bịa lựa chọn.
  ```
- [ ] **Step 2:** `plan-review.md`: thêm 1 dòng soát — phương án có đánh đổi thật, không trùng nhau; thiếu mục `## Phương án` là `blocking`.
- [ ] **Step 3:** `implement.md`: thêm khối `{{choice}}` — "Phương án user đã chọn (làm theo đúng phương án này): {{choice}}"; rỗng thì làm theo plan.
- [ ] **Step 4:** `node tools/autopilot.mjs route --validate` → "7 luồng hợp lệ".
- [ ] **Step 5:** Commit `[autopilot] Prompts: plan lists options, review checks them, implement follows choice`.

### Task 5: CLI — xem trước + 5 lệnh lựa chọn

**Files:**
- Modify: `tools/autopilot.mjs` (`newRun` ~dòng 101, `cmdRun` 121, `cmdRoute` 308, bảng `COMMANDS` 321, `USAGE`)
- Test: `tools/autopilot.test.mjs` (dùng `sandbox`/`lastRun` có sẵn)

**Interfaces:**
- Consumes: `allowedActions`, `chooseAction`, `isGateLike` (Task 1); `parseOptions` (Task 2); `WHEN` (driver).
- Produces:
  - `autopilot route <input> --json [--flow X]` in 1 dòng JSON: `{flow, label, reason, flows:[{id,label}], stages:[{id, kind, gateLike, when, predicted:'run'|'skip'|'unknown'}]}`. `predicted`: không có `when` ⇒ `run`; `hasHandoff` ⇒ tính từ signals; `touchesUi`/`touchesPm` ⇒ `unknown`.
  - `autopilot run ... --skip a,b --skip-reason "…" --break c,d`
  - `autopilot retry|goto|skip|pick|break` đúng cú pháp spec §5.1.
  - Hàm `planOptions(run) → {id,title,body}[]` đọc `plan.md` trong `runDir` qua `parseOptions` (dùng lại ở Task 6).

Hành vi: lệnh lựa chọn = `mustLoad` → `chooseAction(...)` (bắt `Error` ⇒ `die(message)`) → `break` thì `saveRun` và in trạng thái, còn lại `continueRun`. `--skip` có gate-like mà thiếu `--skip-reason` ⇒ `die` trước khi tạo run; tên stage lạ ⇒ `die "không có stage <x> trong luồng <flow>"`.

- [ ] **Step 1: Test đỏ:** `route --json: landing-fix trả stages có gateLike gates=true, ui-check=true` · `run --skip ghost → exit≠0, không có thư mục runs/GW-30` · `run --skip gates thiếu --skip-reason → exit≠0` · `run --break implement → stopped breakpoint:implement; resume → paused ở approve-result` · `goto plan khi đang ở approve-plan với --note → plan vòng 2 thấy note` · `goto approve-result (chưa qua) → exit≠0 "chưa đi qua"` · `skip gates không --reason sau fail gate → exit≠0; có --reason → gateSkipped` · `pick B khi plan.md có A/B → choice B, chạy tiếp tới approve-result` · `retry sau loop-exhausted:plan-review → chạy lại plan-review`.
- [ ] **Step 2:** `node --test --test-timeout=20000 tools/autopilot.test.mjs` → FAIL.
- [ ] **Step 3:** Cài. Fake runner cần `plan.md` có mục phương án cho test `pick`: ghi file thẳng vào `runDir` trong test trước khi `pick`.
- [ ] **Step 4:** PASS cả file.
- [ ] **Step 5:** Commit `[autopilot] CLI: route --json preview, run --skip/--break, retry/goto/skip/pick/break`.

### Task 6: API + server

**Files:**
- Modify: `autopilot-ui/api.mjs` (`viewOf` dòng 40, `actionArgs` dòng 90), `autopilot-ui/server.mjs` (`handleAutopilot` ~dòng 60–92)
- Test: `autopilot-ui/api.test.mjs`, `autopilot-ui/server.test.mjs`

**Interfaces:**
- Consumes: `allowedActions`, `chooseAction` (Task 1), `planOptions` (Task 5 — chuyển vào `tools/lib/autopilot/format.mjs` hoặc `store.mjs` để API import được, KHÔNG import từ `tools/autopilot.mjs`).
- Produces:
  - `viewOf(run)` thêm `actions: Action[]`, `options: {id,title,body}[]` (chỉ khi stage `approve-plan`, còn lại `[]`), `gateSkipped`, `plan`.
  - `actionArgs(action, { key, note, input, flow, stage, option, reason, skip, skipReason, breaks })`: whitelist thêm `retry, goto, skip, pick, break`; `stage` khớp `/^[a-z][a-z-]*$/`, `option` khớp `/^[ABC]$/`; `run` thêm `--skip`, `--skip-reason`, `--break` khi có.
  - `checkAction(action, body) → void` trong `api.mjs`: với 5 action mới, load run, `chooseAction` trên bản sao (không lưu) — ném ⇒ server trả 400 `{error}` và KHÔNG gọi `spawnCli`.
  - `GET /api/autopilot/preview?input=…&flow=…` ⇒ `execCli(['route', input, '--json', ...flow])` ⇒ 200 JSON hoặc 400 `{error: stderr}`.

- [ ] **Step 1: Test đỏ:** `actionArgs goto: ['goto','GW-1','plan','--note','x']` · `actionArgs goto stage "../x" → ném` · `actionArgs pick option "D" → ném` · `actionArgs run có skip/skipReason/breaks → đủ cờ` · server: `POST /api/autopilot/skip cho run running → 400 "đang chạy", spawnCli không được gọi` · `POST /api/autopilot/goto hợp lệ → 200, spawnCli nhận args đúng` · `GET /api/autopilot/preview → gọi execCli với route --json` · `GET /runs: run stopped ở gates có actions chứa retry/skip/goto`.
- [ ] **Step 2:** `node --test autopilot-ui/api.test.mjs autopilot-ui/server.test.mjs` → FAIL.
- [ ] **Step 3:** Cài.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `[autopilot] API: actions/options in run view, validate choices before spawn, preview route`.

### Task 7: UI — tấm Xem trước

**Files:**
- Modify: `autopilot-ui/web/views/autopilot.js` (`MARKUP`, `openPalette`/`startRun` ~dòng 387–411), `autopilot-ui/web/views.css`

**Interfaces:**
- Consumes: `GET /api/autopilot/preview` (Task 6); `post('run', {input, flow, skip, skipReason, breaks})`.

Hành vi (spec §6.1): Enter trong palette lần 1 ⇒ gọi preview, hiện tấm Xem trước trong cùng veil (luồng + lý do + ô chọn luồng gọi lại preview; chuỗi ô stage: công tắc tắt + nút 📍; `predicted:'skip'` mờ + "tự bỏ nếu không đụng UI/pm"; tắt gate-like ⇒ ô lý do, thiếu thì nút Chạy disabled). Enter lần 2 / nút **Chạy** ⇒ `post('run', …)`. Chế độ chat (`startRun('chat')`) giữ nguyên, không qua preview.

- [ ] **Step 1:** Cài markup + CSS + handler.
- [ ] **Step 2:** Chạy server tạm ở cổng khác với runs giả: `AUTOPILOT_UI_PORT=4801 AUTOPILOT_RUNS_DIR=<scratchpad>/runs node autopilot-ui/server.mjs` (chạy nền). Mở `http://127.0.0.1:4801` ở 1920×1080 và 768×1024: gõ `GW-1`, Enter ⇒ thấy tấm xem trước; tắt `gates` ⇒ nút Chạy khoá tới khi nhập lý do; đổi luồng ⇒ chuỗi stage đổi. Không bấm Chạy thật (runs giả nhưng CLI sẽ gọi claude).
- [ ] **Step 3:** Commit `[autopilot] Console: preview sheet before run with stage toggles and breakpoints`.

### Task 8: UI — menu trên ô pipeline + ký hiệu

**Files:**
- Modify: `autopilot-ui/web/views/autopilot.js` (`nodeHtml` dòng 96, handler click pipeline), `autopilot-ui/web/views.css`

**Interfaces:**
- Consumes: `run.actions`, `cells[].breakpoint/skippedReason/max` (Task 2, 6); `post(action, {key, stage, note, reason})`.

Hành vi (spec §6.2): click ô ⇒ menu dưới ô. Ô có id trong `goto.stages` ⇒ *Quay về đây…* (ô ghi chú bắt buộc). Ô hiện tại ⇒ *Chạy lại* nếu có `retry`, *Bỏ qua* nếu có `skip` (`needsReason` ⇒ ô lý do), *Mở trong Claude* (dùng `openInClaude` sẵn có). Ô có id trong `break.stages` hoặc đang `breakpoint` ⇒ bật/tắt 📍. Không có mục nào ⇒ không mở menu. Ký hiệu: 📍 góc ô; `state skipped` + `skippedReason` ⇒ viền đỏ nét đứt + "bỏ qua · <lý do>"; badge `×N` ⇒ `vòng N/max` khi có `max`; dòng chú thích màu dưới pipeline (xong · đang chạy · chờ bạn · dừng · bỏ qua).

- [ ] **Step 1:** Cài.
- [ ] **Step 2:** Trên server 4801 với run giả dựng sẵn (copy `run.json` mẫu vào `<scratchpad>/runs/GW-T/<id>/` cho 3 trạng thái: stopped ở gates, paused ở approve-plan, stopped breakpoint): click ô đã qua / hiện tại / phía trước đúng menu; 1920 và 768 không tràn ngang. Chặn POST bằng cách chạy server KHÔNG có claude thật — chỉ kiểm menu mở/đóng và request gửi đi (tab Network), không để CLI chạy tiếp.
- [ ] **Step 3:** Commit `[autopilot] Console: per-stage menu on pipeline nodes, breakpoint and user-skip markers, round x/max`.

### Task 9: UI — dock theo tình huống

**Files:**
- Modify: `autopilot-ui/web/views/autopilot.js` (`dockMessage` 307, `oneClickAction` 323, `renderDock` 331, phím tắt), `autopilot-ui/web/views.css`

**Interfaces:**
- Consumes: `run.actions`, `run.options`, `run.gateSkipped`, `run.stopReason`.
- Produces: `const STOP_REASON = { 'loop-exhausted': (s) => `hết vòng sửa ở ${s}`, breakpoint: (s) => `dừng theo 📍 sau ${s}`, fail: (s) => `${s} trượt`, budget: () => 'hết ngân sách', paused: () => 'bạn đã dừng', runner: (s) => `${s} lỗi khi chạy claude` }` + `reasonText(stopReason)`; mã lạ ⇒ trả nguyên mã.

Hành vi theo bảng spec §6.3. Phím `1`/`2`/`3` ⇒ `pick` A/B/C khi dock có thẻ phương án; `A`/`R` giữ như cũ. *Chạy lại <stage>* ở điểm dừng = `goto` stage trong `stopReason`.

- [ ] **Step 1:** Cài.
- [ ] **Step 2:** Trên 4801 với 4 run giả (approve-plan 2 phương án, approve-plan 1 phương án, stopped `loop-exhausted:gates`, approve-result có `gateSkipped`): dock đúng nút + chữ; phím 1/2/3 gửi `pick` đúng option (xem Network); 1920 + 768.
- [ ] **Step 3:** Commit `[autopilot] Console: situational dock with plan option cards, readable stop reasons, skipped-gate warning`.

### Task 10: Chốt

- [ ] **Step 1:** Suite chốt (Global Constraints) → toàn bộ PASS; ghi số test.
- [ ] **Step 2:** `node tools/autopilot.mjs route --validate` → 7 luồng hợp lệ.
- [ ] **Step 3:** Tắt server 4801, xoá runs giả trong scratchpad.
- [ ] **Step 4:** Cập nhật checkpoint trong `docs/notes/autopilot-ui-console-plan.md` (commit list + việc tiếp: wave board spec). Commit `[autopilot] Notes: branching shipped`.
- [ ] **Step 5:** Báo user: commit list, số test, 2 chỗ lệch spec; hỏi restart 4800 (giữ `AUTOPILOT_LAB_WRITES=1`) và push.
