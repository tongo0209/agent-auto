# Autopilot — điều phối task theo luồng, do code quyết định

Ngày: 2026-10-20 · Trạng thái: chờ user duyệt spec

## 1. Vì sao

Ý tưởng gốc: một tool tự plan → tự review plan → chờ người duyệt → tự code → tự review → tự QA → tự fix → ra PR,
mỗi bước có trần vòng ("round 2 of 3") và biên nhận turns · phút · $.

agent-auto đã có phần lớn nguyên liệu (bảng routing trong CLAUDE.md, cổng 3 làn của `code-developer`,
`pm-gate`/`fe-gate`/`ui-check`, phase trong `schema/vocab.json`, console), nhưng **việc nối chúng là văn xuôi
cho model đọc**: chọn luồng, nhớ chạy cổng, dừng sau mấy vòng đều phụ thuộc model nhớ. Hook `guard-*` ra đời
chính vì model quên.

Autopilot chuyển phần nối đó thành code. Mục tiêu, user chọn "tất cả":

| Mục tiêu | Đo bằng |
|---|---|
| Bớt trông phiên | Từ lúc `run` tới mốc `⏸` đầu tiên không cần user gõ gì |
| Giảm bug lọt QC | Cổng `gates` + `ui-check` là điều kiện chuyển stage, không bỏ qua được |
| Đi đúng luồng | Router chọn luồng từ tín hiệu có thật, in lý do; không khớp → dừng hỏi |
| Thấy & kiểm chi phí | Mỗi round 1 dòng biên nhận; `status` + panel console hiện như ảnh gốc |

**Không làm (YAGNI):** chạy song song nhiều run, wave board/đồ thị phụ thuộc, kênh Tele/Teams, tự push.
Việc sửa vặt (≤2 file, chỗ sửa rõ) **không** đi autopilot — chạy thẳng như hiện nay.

## 2. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Lõi là Node ngoài phiên, gọi `claude -p --output-format json` cho từng stage | Quyết định 100% bằng code; JSON trả sẵn `total_cost_usd`, `num_turns`, `session_id`; tiền lệ `radar-tick` |
| D2 | Phiên lai: mỗi stage phiên MỚI; riêng `fix` `--resume` phiên `implement`; review luôn phiên mới | Review độc lập + context không phình; fix khỏi đọc lại code |
| D3 | Mốc duyệt (`pause`) do từng luồng khai | buglist không cần duyệt plan, landing mới cần |
| D4 | Làm đủ 4 luồng trong một đợt, không thí điểm | User chốt |
| D5 | Chạy tuần tự, 1 run tại một thời điểm; Photoshop có khoá riêng | Luật "agent chạy tuần tự"; Photoshop độc chiếm |

## 3. Ràng buộc đã kiểm (20/10)

- `ui-check` là JS tiêm vào browser (`skills/ui-check/scripts/layer1-checks.js` dùng `window`/`document`) ⇒
  không chạy được bằng Node trần. browserpilot MCP khai ở `~/.claude.json` (cấp user) ⇒ `claude -p` dùng được
  ⇒ `ui-check` là **stage claude** (model `sonnet`), không phải gate 0 đồng.
- Ghi sheet của `bug-fixer-lite` cần extension Claude in Chrome — chỉ nối vào phiên CLI tương tác
  ⇒ stage loại `attached`: dừng + noti, user chạy `/bug-fixer-lite report` (đã có sẵn).
- `psd-cut` cần Photoshop ⇒ khoá tài nguyên `photoshop`.
- Hook `guard-bash`/`guard-style`/`guard-pm`/`guard-state` vẫn bắn trong `claude -p` ⇒ luật cũ giữ nguyên.

## 4. Kiến trúc

```
tools/autopilot.mjs                 CLI
tools/lib/autopilot/
  engine.mjs                        máy trạng thái THUẦN: next(run, event) → run
  router.mjs                        THUẦN: signals → {flow, reason} | {flow:null, reason}
  signals.mjs                       I/O: gom tín hiệu (state.json, tasks/<KEY>/, designs/<KEY>/, repo)
  claude-runner.mjs                 spawn claude -p; chế độ fake đọc kịch bản
  gates.mjs                         chạy build + tool cổng, chuẩn hoá kết quả
  verdict.mjs                       THUẦN: bóc + validate khối verdict trong output
  store.mjs                         đọc/ghi runs/<KEY>/<runId>/run.json (ghi nguyên tử: tmp + rename)
  lock.mjs                          khoá file runs/.lock (1 run) + runs/.lock-photoshop
  notify.mjs                        osascript display notification
flows/
  router.json                       bảng luật router
  landing-new.json · landing-fix.json · feature.json · buglist.json
  prompts/<stage>.md                prompt từng stage (template, có biến {{KEY}} {{runDir}} …)
runs/                               KHÔNG vào git (.gitignore + .gitkeep)
console/src/panels/autopilot.*      panel đọc runs/*/*/run.json
```

Ranh giới: `engine`, `router`, `verdict` không I/O ⇒ test đủ nhánh không cần claude.
`engine` không biết claude là gì — chỉ nhận event.

## 5. Định nghĩa luồng (`flows/<id>.json`)

```json
{
  "id": "landing-fix",
  "label": "Sửa/feature landing theo design",
  "budget": { "usd": 25, "minutes": 120 },
  "stages": [
    { "id": "plan", "kind": "claude", "prompt": "plan.md", "model": "opus",
      "writes": ["plan.md"], "next": "plan-review" },
    { "id": "plan-review", "kind": "claude", "prompt": "plan-review.md", "model": "opus",
      "writes": ["plan-review.json"], "loop": { "back": "plan", "max": 3 }, "next": "approve-plan" },
    { "id": "approve-plan", "kind": "pause", "show": ["plan.md", "plan-review.json"],
      "onReject": "plan", "next": "implement" },
    { "id": "implement", "kind": "claude", "prompt": "implement.md", "model": "opus",
      "keepSession": true, "next": "code-review" },
    { "id": "code-review", "kind": "claude", "prompt": "code-review.md", "model": "opus",
      "loop": { "back": "fix", "max": 3 }, "next": "gates" },
    { "id": "gates", "kind": "gate", "checks": ["build", "pm-gate", "fe-gate", "landing-parity", "layout-gate"],
      "loop": { "back": "fix", "max": 3 }, "next": "ui-check" },
    { "id": "ui-check", "kind": "claude", "prompt": "ui-check.md", "model": "sonnet",
      "loop": { "back": "fix", "max": 3 }, "next": "approve-result" },
    { "id": "fix", "kind": "claude", "prompt": "fix.md", "model": "opus",
      "resume": "implement", "returnTo": "caller" },
    { "id": "approve-result", "kind": "pause", "show": ["diff", "receipts"], "onReject": "fix", "next": "commit" },
    { "id": "commit", "kind": "gate", "checks": ["commit"], "next": null }
  ]
}
```

Loại stage:

| `kind` | Chạy gì | Kết thúc bằng event |
|---|---|---|
| `claude` | `claude-runner` với prompt đã điền biến | `pass` / `revise` / `fail` theo verdict |
| `gate` | `gates.mjs` chạy lần lượt `checks` | `pass` khi mọi check 0 blocking, ngược lại `revise` |
| `pause` | Không chạy gì; noti; chờ `approve`/`reject` | `approve` / `reject` |
| `attached` | Không chạy gì; noti kèm lệnh user phải chạy trong phiên tương tác | `approve` (user báo xong) |

Id stage là duy nhất trong một luồng. Luật vòng: `loop.max` đếm **số lần quay lại** từ stage đó. Vượt ⇒ `stopped: loop-exhausted`.
`fix` có `returnTo: "caller"` ⇒ sau fix quay về đúng stage đã đẩy sang fix (code-review, gates hay ui-check);
`resume: "implement"` ⇒ `claude --resume <sessionId của implement>`.
`check` không áp dụng cho repo hiện tại (vd không có `pm__`) ⇒ `skipped`, ghi lý do, không tính là pass ngầm.

### 4 luồng

| Luồng | Stage (⏸ = pause, ↺n = loop.max) |
|---|---|
| `landing-new` | cut (🔒photoshop, psd-cut/figma-cut) → check-design (verdict `revise` = design thiếu ⇒ ⏸ `design-gap`) → spec → plan ⇄ plan-review ↺3 → ⏸plan → implement → code-review ⇄ fix ↺3 → gates ⇄ fix ↺3 → ui-check ⇄ fix ↺3 → clean-code → gates-final (id riêng, cùng `checks`) → ⏸kết quả → commit |
| `landing-fix` | như mẫu ở trên |
| `feature` | như `landing-fix`; `ui-check` có `when: "touchesUi"` (diff có file .twig/.html/.scss/.css) |
| `buglist` | intake-triage → lanes (fix theo cụm) → gates ⇄ fix ↺2 → verify (design-checker) ⇄ fix ↺2 → ⏸kết quả → commit → write-sheet (`attached`: `/bug-fixer-lite report`) |

Prompt stage **trỏ skill/agent sẵn có**, không chép lại luật: vd `implement.md` bảo đọc
`rules/code-style.md` + `rules/cdn-source-standard.md` + `rules/landing-js.md` (theo repo) rồi code theo `plan.md`;
`intake-triage.md` gọi `/bug-fixer-lite` giai đoạn [1]; `cut.md` gọi `/psd-cut` hoặc `/figma-cut`.
Skill nào cần "chạy đúng một giai đoạn" mà chưa có cờ đó ⇒ plan thêm đoạn `## Chạy dưới autopilot` vào SKILL.md
(stage nào, ghi file nào, dừng ở đâu) — không tách skill mới.

## 6. Hợp đồng verdict

Mỗi stage `claude` kết thúc output bằng đúng một khối:

````
```autopilot-verdict
{"verdict": "pass|revise|fail", "blocking": ["…"], "advisory": ["…"], "files": ["…"], "note": "…"}
```
````

- `verdict.mjs` lấy khối **cuối cùng**; không có / JSON hỏng / thiếu `verdict` ⇒ event `fail` (tính 1 vòng).
- `revise` mà `blocking` rỗng ⇒ coi là `pass` + ghi advisory (chống review "revise" không lý do).
- `files` của `implement`/`fix` là nguồn path cho `commit` (đối chiếu thêm với `git status` của repo đích;
  chỉ commit giao của hai tập).

## 7. Run state (`runs/<KEY>/<runId>/run.json`)

```json
{
  "key": "GW-950", "runId": "20261020-1432", "flow": "landing-fix",
  "routerReason": "có designs/GW-950 + cdn-source/.../ghoststory-t10 đã tồn tại",
  "repo": "/Users/lap17727/VNG/git-vng/cdn-source", "campaignDir": "…",
  "status": "running|paused|attached|stopped|done",
  "stage": "code-review", "callerOfFix": null,
  "loops": { "plan-review": 1, "code-review": 0 },
  "sessions": { "implement": "<uuid>" },
  "blockedBy": [],
  "stopReason": null,
  "receipts": [
    { "stage": "plan", "round": 1, "verdict": "pass", "blocking": 0, "advisory": 0,
      "turns": 69, "costUsd": 2.73, "ms": 420000, "at": "2026-10-20T14:39:00+07:00" }
  ]
}
```

Artifact cùng thư mục: `plan.md`, `plan-review.json`, `review-rN.json`, `gates-rN.json`, `ui-check-rN.json`,
`stage-<id>-rN.log` (output thô của claude, để soi khi stop).

## 8. CLI

| Lệnh | Việc |
|---|---|
| `autopilot run <KEY\|link> [--flow id] [--repo path]` | Router (bỏ qua nếu có `--flow`) → tạo run → chạy tới pause/attached/stopped/done |
| `autopilot status [KEY]` | Bảng như ảnh gốc: từng round, verdict, blocking/advisory, turns · phút · $, tổng |
| `autopilot approve <KEY> [--note]` | Qua pause/attached hiện tại, chạy tiếp |
| `autopilot reject <KEY> --note "…"` | Về `onReject`; note được nạp vào prompt stage đó |
| `autopilot resume <KEY>` | Chạy tiếp run `stopped`/crash từ stage dở (đọc run.json) |
| `autopilot abort <KEY>` | Đánh `stopped: aborted`, nhả khoá |
| `autopilot route <KEY\|link>` | Chỉ in luồng + lý do, không chạy |

Mặc định chạy foreground trong terminal; `run --bg` tách nền (như `radar-tick`), log ở `runs/<KEY>/<runId>/autopilot.log`.

## 9. Router (`flows/router.json`)

Luật xét theo thứ tự, luật đầu khớp thắng. Tín hiệu gom bằng `signals.mjs`, chỉ từ nguồn có thật:

| # | Tín hiệu | Luồng |
|---|---|---|
| 1 | Input là link Google Sheets / Excel Online / file .xlsx, hoặc `state.issues[KEY].phase == "bugfix"` | `buglist` |
| 2 | `designs/<KEY>/` có `.psd/.psb` hoặc `tasks/<KEY>/brief.md` có link figma.com, **và** chưa có `_auto-export/<slug>/assets/`, **và** campaignDir chưa tồn tại | `landing-new` |
| 3 | Có design (ảnh/coords) **và** campaignDir đã tồn tại | `landing-fix` |
| 4 | Không design, có mô tả việc trong brief | `feature` |
| — | Không khớp, hoặc khớp ≥2 luật cùng độ ưu tiên mâu thuẫn | `flow: null` ⇒ dừng, in tín hiệu đã thấy, hỏi user dùng `--flow` |

## 10. Dừng, lỗi, ngân sách

Mọi nhánh lỗi kết thúc ở `stopped` + `stopReason` + noti — không treo im:

| Tình huống | Xử lý |
|---|---|
| Vượt `loop.max` | `stopped: loop-exhausted:<stage>` |
| Verdict thiếu/hỏng | event `fail`, tính 1 vòng của stage đó |
| Tổng `costUsd` > `budget.usd` hoặc thời gian > `budget.minutes` | `stopped: budget` (kiểm sau mỗi round) |
| `claude -p` exit ≠ 0 / timeout (mặc định 30 phút/stage) | Thử lại 1 lần cùng input; lại lỗi ⇒ `stopped: runner` |
| Output có mã hook `G-` (guard chặn) | `stopped: guard:<mã>` — không retry, không lách |
| Khoá đang bị giữ | `run` từ chối ngay, in run đang giữ khoá |
| Khoá mồ côi (PID chết) | Tự nhả, ghi 1 dòng log |

Ghi `run.json` nguyên tử sau MỖI event ⇒ crash ở đâu `resume` tiếp từ đó.

## 11. Quyền khi chạy headless

`claude -p` nhận `--allowedTools` theo stage (khai trong flow, mặc định theo kind):
review/plan-review: `Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Write` (chỉ ghi vào runDir — prompt dặn, hook không kiểm);
implement/fix: thêm `Edit`, `Bash(npm run *)`, `Bash(node *)`; ui-check/verify: thêm `mcp__browserpilot__*`.
**Không** cấp `Bash(git push*)`, `Bash(git commit*)` cho stage claude — commit do stage `gate:commit` (Node) làm theo R-GIT
(`git add -- <paths> && git commit --only …`, cdn-source thêm `git pull --no-rebase --no-edit origin master`).
Push không bao giờ tự làm.

## 12. Noti & console

- `notify.mjs`: `osascript display notification` khi vào `paused`, `attached`, `stopped`, `done`. Tiêu đề `Autopilot <KEY>`,
  thân = stage + việc cần làm (vd "duyệt plan: autopilot approve GW-950").
- `autopilot status`: in bảng receipts nhóm theo cycle (trước/sau duyệt), giống ảnh gốc.
- Console panel **Autopilot**: hàng ô stage (xanh = done, xanh dương = running, cam = chờ bạn, đỏ = stopped, viền đứt = chưa chạy),
  dưới là bảng receipts + tổng; cột `blockedBy`. Chỉ đọc file, nút approve/reject **không** làm đợt này (dùng CLI).

## 13. Test & nghiệm thu

1. `engine.test.mjs`: mọi nhánh — pass thẳng, revise ≤max, vượt max, pause approve/reject + note, fix `returnTo` đúng caller,
   `when` bỏ stage, budget, resume từ từng stage.
2. `router.test.mjs`: 4 luồng + không khớp + mâu thuẫn, trên fixture tín hiệu.
3. `verdict.test.mjs`: khối chuẩn, nhiều khối (lấy cuối), JSON hỏng, revise rỗng blocking.
4. `claude-runner` chế độ fake (`AUTOPILOT_FAKE=<kịch bản.json>`): chạy **end-to-end cả 4 luồng** qua CLI thật, 0 token,
   kể cả kịch bản stop/resume.
5. `gates.test.mjs`: chuẩn hoá output từng tool cổng (dùng fixture output thật).
6. `flows/*.json` validate bằng `autopilot route --validate` (stage `next`/`back`/`resume` trỏ tới id có thật, không vòng vô hạn ngoài `loop`).
7. **Nghiệm thu thật:** mỗi luồng 1 ticket thật. So $ + phút với cách chạy skill tay (số từ `tools/wall-scan.mjs`
   cho cùng loại task, baseline `docs/notes/wall-baseline-2026-09-23.json`). Ghi kết quả vào `docs/notes/autopilot-acceptance.md`.
   Autopilot đắt hơn >1.5× mà không giảm số vòng fix/bug lọt ⇒ báo user trước khi coi là xong.

## 14. Rủi ro đã biết

| Rủi ro | Giảm thiểu |
|---|---|
| Plan-review/code-review đốt tiền mà ít giá trị ở task nhỏ | Việc ≤2 file không vào autopilot; ngân sách/luồng; receipts lộ ngay stage đắt |
| Skill hiện tại viết cho phiên tương tác (hỏi user giữa chừng) | Đoạn `## Chạy dưới autopilot` trong SKILL.md: cấm hỏi, thay bằng verdict `fail` + `blocking` mô tả câu hỏi ⇒ thành pause |
| `ui-check` qua browserpilot headless có thể treo | Timeout stage + flail-stop sẵn có của skill |
| Hook `guard-state` yêu cầu sửa trong lượt | Stage chạm `state.json` chỉ có `/daily`; autopilot không ghi `state.json` (chỉ đọc) |
