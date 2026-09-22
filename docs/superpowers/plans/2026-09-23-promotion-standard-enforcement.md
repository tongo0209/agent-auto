# Áp chuẩn promotion trọn vẹn — Implementation Plan

> **For agentic workers:** chạy bằng Workflow theo pha (ultracode), ≤3 agent song song, mỗi agent 1 lane có file KHÔNG giao nhau. Agent KHÔNG commit — orchestrator commit giữa các pha bằng `git add <đường dẫn cụ thể>`. Steps dùng checkbox.

**Goal:** Mọi landing `pm__` được khoá gameplay/loại trước khi code, ra đúng hợp đồng template (production thắng kit), có file dự án để lần sau khỏi đọc lại code, và vùng UI/JS tự do được dọn theo chuẩn cdn-source của user.

**Spec:** `docs/specs/2026-09-23-promotion-standard-enforcement-design.md` (đọc §1-§8 trước khi làm lane của mình).

**Tech:** Node ≥20 ESM (`.mjs`, không dependency ngoài), bash, markdown. Test = script standalone kiểu `tools/layout-gate.test.mjs` (đếm pass/fail, exit 1 khi fail, fixture trong `os.tmpdir()`).

## Global Constraints
- agent-auto là repo **PUBLIC**: KHÔNG commit bản sao MASTER/AI-RULES/popup của kit, KHÔNG dán code nghiệp vụ campaign. Test đọc kit từ `PM_KIT_DIR` || `~/VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit` lúc chạy; thiếu → in `SKIP` + exit 0.
- `projects/*` gitignore, chỉ `projects/.gitkeep` vào git.
- Code theo `rules/code-style.md` R-CS-1..7 (comment 1 dòng, không phòng thủ thừa, tên thay comment). Không thêm dependency npm.
- KHÔNG sửa file có thay đổi dở của user: `knowledge/lessons.md`, `tools/bug-radar.mjs`, `tools/bug-radar.test.mjs`, `docs/sdlc-ai/`, `tools/bug-sheet-tick.py`. `skills/daily/SKILL.md` có thay đổi dở → sửa được nhưng orchestrator KHÔNG commit file đó (báo user).
- gt-promotion-template / new-mainsite / cdn-source: CHỈ ĐỌC trong plan này.
- Không đụng `~/.claude/settings.json` ngoài việc chạy `tools/install-skills.sh --write-hooks`.
- Báo cáo lane theo `rules/agent-evidence.md`: ≤30 dòng, có mục `Bằng chứng:` (lệnh đã chạy + 1 dòng output), liệt kê file đã đổi.

## Giao diện dùng chung (đã có, commit f8c3132)
`tools/lib/project-lock.mjs`:
- `projectsRoot() → string` (env `PM_PROJECTS_DIR` || `<agent-auto>/projects`)
- `campaignOf(fileOrDir) → {game, slug, dir} | null` (khớp `/products/<game>/landing/<slug>`)
- `notePathFor(fileOrDir) → string | null` (`<root>/<game>/<slug>.md`)
- `readLock(notePath) → {gameplay, type, ref} | null` (đọc `- gameplay:`/`- type:`/`- ref:` trong `## 1. Khoá`; `CHƯA KHOÁ` → null)
- `noteForAnyFile(file) → string | null` — `notePathFor` trước; không thuộc cdn-source thì dò dòng `- <nhãn>: /đường/dẫn/tuyệt/đối` trong `## 2. Nơi code` của mọi note (khớp đúng thư mục hoặc con của nó). Test: `node tools/lib/project-lock.test.mjs` (11 ca).

---

## PHA 1 — Build (3 lane song song)

### Lane A · Task 1: pm-gate v2
**Files:**
- Rewrite: `tools/pm-gate.mjs` (CLI mỏng)
- Create: `tools/pm-gate/scan.mjs`, `tools/pm-gate/contract.mjs`, `tools/pm-gate/checks.mjs`, `tools/pm-gate/baseline.mjs`
- Create: `rules/pm-kit-overrides.tsv`
- Create: `tools/pm-gate.test.mjs`

**Interfaces (Produces):**
- CLI `node tools/pm-gate.mjs <file> [--page <campaignDir>] [--gameplay luckydraw-gift-exchange|payment|none] [--type <STT-slug>] [--ref <campaignDir>] [--baseline <git-ref>|none] [--json]`
- `--page <dir>`: chạy trên mọi `dist/*.html` có `pm__` của campaign (trang đã build = trang thật); thiếu dist → exit 2 "build trước".
- Phân giải gameplay: `--gameplay` → `readLock(noteForAnyFile(file|page))` → 🔴 `PG-GAME` "chưa khoá gameplay — làm bước khoá (R-PM-11)" exit 1.
- JSON: `{ file, gameplay, type, ref, mode: 'file'|'page', fails: Finding[], warns: Finding[], preexisting: Finding[] }`, `Finding = { code, msg, token, lines: number[] }`.
- Exit: 0 (không 🔴) · 1 (có 🔴) · 2 (lỗi dùng: thiếu file/cờ sai/kit không có). stderr có nội dung mọi khi exit ≠ 0.
- Text output: dòng đầu `pm-gate · <file> · gameplay: <g>`; `  🔴 <CODE>  <msg>  (dòng …)`; `  🟡 <CODE>  <msg>`; nhóm `  ── lỗi có sẵn (nợ):` cho baseline; dòng cuối `  ✗ N lỗi chặn — chưa được báo xong` | `  ✓ không có lỗi chặn`.

**Mô-đun:**
- `scan.mjs` — `scanHtml(text) → { elements: El[], anyCount }`. `El = { tag, classes: string[], id, attrs: Map, line, parent: index|-1, branch: string }`. Bỏ `<!-- -->`, `{# #}`, nội dung `<script>`/`<style>` (thay bằng khoảng trắng giữ số dòng). Twig: `{% if %}`/`{% elseif %}`/`{% else %}`/`{% endif %}` gán `branch` dạng `"3:0"`, `"3:1"` (if thứ 3, nhánh 0/1) lồng được; `{% for %}` giữ nguyên. `anyCount` = số thẻ MỞ `<any`.
- `contract.mjs` — `loadContract(gameplay, { kitDir, overridesPath, refDir }) → Contract`:
  - `catalog: Row[]` từ AI-RULES §2 (mọi bảng 2a-2d): `Row = { tokens: string[], kind: 'class'|'id'|'data'|'mixed', required: 'yes'|'extra'|'no' (✅/🔸/⬜), placement: {type:'outside-popup'|'inside'|'any', containers: string[]}, count: {type:'1'|'N'|'>=2'|'per', per?: string} }`. Ô Hook nhiều token (`a` + `b`, `id` + `class`) → tokens nhiều phần tử, kind `mixed` = phải cùng MỘT phần tử. Ô "Phải nằm trong": `ngoài popup` → outside-popup; các `` `x` `` (kể cả "trong `x`", "cha của `x`", "`a` / `b` / trực tiếp trong `c`") → inside + containers; `—` → any.
  - `singletons: string[]` từ §4 (gồm wildcard `pm__text_*` và provider list), `perPopup: string[]` (`[1/popup]`), `repeatable: string[]` (KHÔNG thuộc singleton).
  - `dont: {bad: string, hint: string}[]` từ §5 (hook cụ thể: `pm__btn-rank`, `pm__invite-submit-code`, `pm__group-N` nguyên văn, `pm__module` trên `pm__inform`).
  - `master: El[]` = `scanHtml(MASTER)`; `inputs: {form, name, type, id, for}[]` rút từ master; `pairs` = thuộc tính `data-*`/class đi cùng phần tử hook trong master (vd `pm__rut`→`data-value`).
  - `exclusive: Set` = hook `pm__` có trong MASTER gameplay này mà KHÔNG có trong MASTER gameplay kia.
  - `overrides` từ `rules/pm-kit-overrides.tsv` áp lên catalog/master: `alias kit→production` (thay token trong contract), `drop` (bỏ khỏi required), `fix` (ghi chú kit lỗi, bỏ qua).
  - `known: Set` = mọi hook trong master ∪ catalog ∪ override ∪ hook của `refDir` (nếu có).
  - gameplay `none`: catalog = popup dùng chung (`components/common/popups/*.html`, id qua override) + 5 luật; `refHooks` = hook `pm__`/id `popup*` quét từ html/twig của `refDir` (bỏ dist/node_modules).
- `checks.mjs` — `runChecks(scan, contract, { mode, fullDocument }) → Finding[]` với `severity` gắn theo bảng mã (spec §4.2): 🔴 `PG-GAME PG-CLAIM PG-REQ PG-ONCE PG-NEST PG-OPEN PG-FORM PG-INPUT PG-PAIR PG-DONT PG-TYPO PG-ANY PG-REF PG-OVR`; 🟡 `PG-TEXT`(§3.2) `PG-MODULE`(§3.4) `PG-UNKNOWN`(hook lạ). `PG-REQ`/`PG-REF` chỉ chạy khi `fullDocument` (có `<body` hoặc mode page) — file partial chỉ chạy luật cục bộ. SINGLETON trong Twig: đếm theo nhánh — 2 phần tử ở 2 nhánh khác nhau của CÙNG một `if` không tính là trùng. `PG-OVR` = dùng id kit đã bị override alias (vd `popup_signIn`) → 🔴 "production dùng `popup_login`".
- `baseline.mjs` — `baselineText(file, ref) → string|null` (`git -C <repoRoot> show <ref>:<relpath>`, null nếu không có); `splitNew(current, base) → { fresh, preexisting }` so khoá `code|token|msg` (bỏ số dòng). Mặc định `--baseline HEAD` nếu file nằm trong git và có ở HEAD, ngược lại `none`.

**`rules/pm-kit-overrides.tsv`** (header + dòng tối thiểu):
```
gameplay	kit	production	kind	evidence	reported
*	popup_signIn	popup_login	alias	cdn-source 94 campaign popup_login vs 1 popup_signIn; gt-promotion 106 vs 0	no
*	popup_nhanluot_signUp	popup_register	alias	cdn-source 113 campaign popup_register vs 0; gt-promotion 136 vs 0	no
luckydraw-gift-exchange	popup_noti	-	fix	MASTER-luckydraw:499 getElementById('popup_noti') không có phần tử	no
payment	pm__module@popup-condition	-	fix	components/popups/popup-condition.html:2 còn pm__module, MASTER đã bỏ	no
```

**Test `tools/pm-gate.test.mjs`** — fixture: đọc MASTER từ kit, chuẩn hoá `base(g)` = thay `<any`→`<div`, `</any>`→`</div>`, rồi áp alias override (`popup_signIn`→`popup_login`, `popup_nhanluot_signUp`→`popup_register`, mọi chỗ xuất hiện). Mỗi ca = 1 phép biến đổi chuỗi trên base, ghi file tmp, chạy CLI `--gameplay <g> --baseline none --json`, so `code` kỳ vọng xuất hiện trong `fails` (🔴) hoặc `warns` (🟡) hoặc "không có 🔴". Ca bắt buộc (L=lucky, P=payment):

| # | Ca | Kỳ vọng |
|---|---|---|
| 0 | base L, base P | exit 0, 0 🔴 0 🟡 |
| 1 | MASTER thô (chỉ any→div, không alias) | 🔴 PG-OVR |
| 2 | nhân đôi phần tử `id="sso-login-form"` (L,P) | 🔴 PG-ONCE |
| 3 | L: 1 `pm__btn-claim`→`pm__btn_claim` | 🔴 PG-CLAIM |
| 4 | P: nút khu chính `pm__btn_claim`→`pm__btn-claim` | 🔴 PG-CLAIM |
| 5 | P: nút trong `pm__popup-confirm` `pm__btn-claim`→`pm__btn_claim` | 🔴 PG-CLAIM |
| 6 | để lại đúng 1 phần tử `<any>…</any>` | 🔴 PG-ANY, msg chứa "1 thẻ" |
| 7 | dời `pm__history-module` / `pm__inform` / `pm__login-module` từ thẻ mở popup xuống thẻ con đầu tiên | 🔴 PG-OPEN (cả 3) |
| 8 | xoá `pm__point`; xoá id `popup_login`; P: xoá id `popupCondition` | 🔴 PG-REQ |
| 9 | input `name="Fullname"`→`fullname`; đổi `id` của input đó; đổi `type` | 🔴 PG-INPUT |
| 10 | L: xoá `data-value` trên `pm__rut` | 🔴 PG-PAIR |
| 11 | thêm `class="pm__btn-rank"` vào 1 `<a>` | 🔴 PG-DONT |
| 12 | L chèn `<a class="pm__btn_claim">`; P chèn `<form id="x" class="pm__quiz-form">` | 🔴 PG-GAME hoặc PG-CLAIM (L) · PG-GAME (P) |
| 13 | thêm `pm__module` vào phần tử `pm__inform` | 🔴 PG-DONT |
| 14 | nhân đôi phần tử có `pm__text_fullname` | 🔴 PG-ONCE |
| 15 | `pm__invite-sumbit-code`→`pm__invite-submit-code` (nếu có trong MASTER) | 🔴 PG-DONT hoặc PG-TYPO |
| 16 | 2 `pm__form-history` trong cùng `popup_history` | 🔴 PG-ONCE |
| 17 | form `id="sso-login-form"` → `class="sso-login-form"` | 🔴 PG-FORM |
| 18 | chuyển `pm__login` vào trong `popup_login` | 🔴 PG-NEST |
| 19 | thêm `data-foo="1"` vào 1 thẻ | 🟡 PG-UNKNOWN, không 🔴 |
| 20 | thêm `<span class="pm__rankchar-Rank">` | 🟡 PG-UNKNOWN, không 🔴 |
| 21 | `pm__point`→`pm__pointt` | 🔴 PG-TYPO |
| 22 | nhân đôi `sso-login-form` nhưng bản thứ 2 nằm trong `<!-- -->` | không 🔴 |
| 23 | file `.twig`: `{% if a %}<form id="sso-login-form">…{% else %}<form id="sso-login-form">…{% endif %}` + gameplay L | exit ≠ 2, không PG-ONCE |
| 24 | P: `pm__group-N` nguyên văn trên các nhóm | 🔴 PG-DONT; ngược lại `pm__group-1..3` → không 🔴 |
| 25 | không `--gameplay`, không note (`PM_PROJECTS_DIR` rỗng) | exit 1, 🔴 PG-GAME "chưa khoá" |
| 26 | note tạm `projects/g/s.md` có `- gameplay: payment`, file nằm ở `<tmp>/products/g/landing/s/index.html`, không cờ | đọc đúng gameplay payment |
| 27 | baseline: git repo tạm, commit bản có dup `pm__point`, sửa thêm `pm__login`→`pm__loginn`, chạy `--baseline HEAD` | 🔴 chỉ PG-TYPO; dup nằm trong `preexisting` |
| 28 | file partial (không `<body`) chỉ chứa 1 popup condition | không PG-REQ |
| 29 | `--gameplay none --ref <tmpRef>`: ref có `pm__btn-history`, file không có (có `<body`) | 🔴 PG-REF |
| 30 | container form theo id: `pm__btn-share` dời ra ngoài `pm__share-form` (P) | 🔴 PG-NEST (không phải 🟡) |

- [ ] Step 1: viết `tools/pm-gate.test.mjs` đủ 31 ca (0-30), mỗi ca 1 hàm biến đổi rõ ràng; chạy → FAIL (gate cũ).
- [ ] Step 2: viết `scan.mjs` + test nội bộ nhanh trong test file (ca 22, 23 xanh).
- [ ] Step 3: `contract.mjs` + `rules/pm-kit-overrides.tsv` (ca 0, 1 xanh).
- [ ] Step 4: `checks.mjs` từng mã, chạy test sau mỗi mã.
- [ ] Step 5: `baseline.mjs` + `--page` (ca 27 xanh; thử `--page` trên 1 campaign thật có dist: `node tools/pm-gate.mjs --page ~/VNG/git-vng/cdn-source/products/cfl/landing/2026-offline-tournament --gameplay luckydraw-gift-exchange` chạy không crash).
- [ ] Step 6: `node tools/pm-gate.test.mjs` → `pass=31 fail=0`. Gỡ probe cũ không cần.

### Lane A · Task 2: guard-pm
**Files:** Modify `hooks/guard-pm.sh`, `hooks/guard-pm.test.sh`
- Hook gọi `node "$AGENT_AUTO/tools/pm-gate.mjs" "$f"` (không `2>/dev/null`), `AGENT_AUTO` = thư mục repo tính từ vị trí hook thật (`readlink -f`), fallback `~/VNG/agent-auto`.
- Gate exit 1 → hook in output gate ra stderr + exit 2 (chặn, model đọc được). Gate exit 0 có 🟡 → in ra stderr, exit 0. Gate exit 2 → in stderr "pm-gate lỗi dùng: …", exit 0 (không chặn nhưng không im).
- Test dùng `HOME` tạm + `GUARD_LOG` tạm (hook ghi log vào `${GUARD_LOG:-$HOME/.claude/hooks/guard.log}`); thêm ca: chưa khoá gameplay (chặn, có chữ PG-GAME), 🟡 hiện ra, `.twig` chạy được, file không `pm__` bỏ qua, dist bỏ qua.
- [ ] Step 1: sửa test trước (FAIL) → Step 2: sửa hook → Step 3: `bash hooks/guard-pm.test.sh | tail -5` → fail=0; `wc -l ~/.claude/hooks/guard.log` không đổi trước/sau.

### Lane B · Task 3: project-note
**Files:** Create `tools/project-note.mjs`, `tools/project-note.test.mjs`, `projects/.gitkeep`; Modify `.gitignore` (thêm vào khối "DỮ LIỆU VẬN HÀNH": `projects/*` + `!projects/.gitkeep`).
**Consumes:** `tools/lib/project-lock.mjs`.
**Produces (CLI):**
- `path <file|dir>` → `noteForAnyFile` → in note path; null → exit 1 "không map được — chạy init trong campaign cdn-source trước". Mục 2 do `init` ghi PHẢI dùng dạng `- <nhãn>: <đường dẫn tuyệt đối>` (mỗi dòng 1 path) để `noteForAnyFile` đọc được.
- `init <campaignDir> [--jira KEY]` → tạo khung 9 mục (heading đúng spec §5.1, mục 1 = `- gameplay: CHƯA KHOÁ`, `- type:`, `- ref:`, `- nguồn chuẩn:`, `- ngày khoá:`); tự điền mục 2 (cdn-source path; gt-promotion: `find` thư mục có tên chứa slug hoặc Jira số trong `~/VNG/git-vng/gt-promotion-template` sâu ≤3), 3 (file nguồn html/twig/js/scss/config, bỏ node_modules/dist/assets ảnh), 4 (hook `pm__*` + id `popup*` → `file:line`, gom theo popup id bao ngoài), 8 (scripts package.json). Đã có file → exit 1 không ghi đè.
- `refresh <campaignDir>` → viết lại mục 3, 4 giữa hai heading, giữ nguyên mục khác.
- `check <campaignDir>` → liệt kê: file ở mục 3 không còn; hook ở mục 4 không còn/đổi dòng; mục 1 chưa khoá. Exit 1 nếu có mục lỗi thời.
- `lock <campaignDir> --gameplay <g> [--type <t>] [--ref <dir>] [--by <ai|user>]` → ghi mục 1 + ngày.
- `debt <campaignDir> --from <pm-gate.json>` → thêm các `preexisting`/`warns` vào mục 7 dạng `- [ ] <CODE> <token> (<file>)`, khử trùng.
- `log <campaignDir> "<dòng>"` → thêm `- <YYYY-MM-DD> <dòng>` vào mục 9.
- Test: campaign giả trong tmp (`PM_PROJECTS_DIR` tmp, `PM_GT_PROMOTION_DIR` tmp chứa `Foo/LandingX_12345/Promotion/index.html`), mỗi lệnh ≥1 ca, `init` 2 lần → lần 2 exit 1; `refresh` giữ nguyên mục 5 người viết.
- [ ] Step 1 test FAIL → Step 2 implement → Step 3 `node tools/project-note.test.mjs` fail=0 → Step 4 `node tools/project-note.mjs init ~/VNG/git-vng/cdn-source/products/lan/landing/2026-trung-thu` với `PM_PROJECTS_DIR=<scratch>` chạy thật, dán 10 dòng đầu mục 4 vào báo cáo.

### Lane B · Task 4: note báo team kit
**File:** Create `docs/notes/2026-09-23-kit-vs-production.md` — bảng id lệch (số đếm spec §1), `popup_noti`, `pm__module` thừa, docx nhắc VGA mà kit không có, 3 câu hỏi cho team (id nào là chuẩn nền tảng; kit có định đổi id production không; hook 🔸 có vào MASTER không). Tiếng Việt, gửi được nguyên văn. Không nhắc người trong team bằng tên.

### Lane C · Task 5: gộp bản đang chạy về agent-auto + trỏ symlink
**Files:** Modify `skills/{code-developer,code-audit,bug-fixer-lite,website-audit}/**`, `agents/*.md`, `tools/install-skills.sh`.
- [ ] Step 1: với mỗi cặp (bản đang chạy = `readlink ~/.claude/skills/<s>` / `~/.claude/agents/<a>.md`, bản agent-auto): `diff -ru`. Với từng hunk: bản nào có nội dung mà bản kia không → giữ; hai bản sửa cùng chỗ khác nhau → lấy bản có `git log -1` mới hơn cho file đó (ghi lý do). Kết quả ghi vào agent-auto. Ghi bảng gộp vào báo cáo (file | lấy từ | lý do).
- [ ] Step 2: `tools/install-skills.sh`: (a) nhận diện hook đã cài theo TỪNG script (guard-bash, guard-read, guard-state, guard-style, guard-pm, token-watch) — thiếu cái nào thì `--write-hooks` bổ sung cái đó, không ghi đè cái khác; (b) chế độ `--check` in rõ skill/agent nào symlink ra ngoài agent-auto; (c) có cờ `--relink` đổi symlink `~/.claude/skills/<s>`, `~/.claude/agents/<a>.md` về agent-auto (backup symlink cũ vào `.backups/relink-<ts>.txt`), cài thêm `bug-fixer`, `agents/references`.
- [ ] Step 3: chạy `bash tools/install-skills.sh --relink` rồi `--check` → 0 "cần bạn xem"; `readlink` từng skill/agent → trỏ agent-auto.
- [ ] Step 4: không đụng file skill `check-promotion` (Lane F pha 2 làm).

## Orchestrator sau pha 1
- Chạy lại cả 3 test + `install-skills.sh --check`; commit 3 nhóm: `[tools] Rewrite pm-gate…`, `[hooks] …`, `[tools] Add project-note…`, `[docs] …`, `[skills] Merge running copies back and relink…`.

## PHA 2 — Wire (3 lane song song)

### Lane D · Task 6: luật
**Files:** `rules/pm-contract.md`, `rules/popup-library.md`, `rules/html-handoff.md`, `rules/repo-gt-promotion.md`, `rules/promo-states.md`, `templates/rules-index.tsv`, `templates/CLAUDE.md`, `templates/CLAUDE.internal.md`.
- Theo spec §4.5 nguyên văn: sửa R-PM-1, R-PM-7, R-PM-8 (trỏ mã PG-* + `--page` + baseline), thêm R-PM-9..12; thống nhất MUST ở R-PM-6/R-GTP-5/R-POP-7/R-HO-9; R-POP-7 trỏ `agent-auto/skills/check-promotion`; promo-states ghi `.active` là class trần JS platform bật.
- R-PM-11 nêu rõ trình tự: `project-note path` → (chưa có) `init` → bước khoá §4.1 → `project-note lock` → code → pha tối ưu §5.4 → `pm-gate --page` (sau build) → `project-note refresh` + `log`.
- Kiểm: `grep -c 'R-PM-1[0-2]' rules/pm-contract.md` ≥3; không còn chữ "SHOULD" cạnh check-promotion trong 4 file.

### Lane E · Task 7: nối skill/agent
**Files:** `skills/code-developer/SKILL.md` (+ file brief template trong skill), `skills/bug-fixer-lite/SKILL.md` (+ prompt lane), `skills/bug-fixer/SKILL.md`, `skills/code-audit/SKILL.md` (xoá `references/pm-contract.md` fork, trỏ `rules/pm-contract.md` + gọi pm-gate), `skills/daily/SKILL.md` (KHÔNG commit), `agents/frontend-developer.md`, `agents/bug-lane.md`, `agents/bug-analyst.md`, `agents/design-checker.md`, `agents/design-analyst.md`.
- Mỗi nơi dựng/sửa/soát `pm__`: (1) đầu việc `node ~/VNG/agent-auto/tools/project-note.mjs path|init` + đọc file dự án trước khi đọc code; (2) bước khoá R-PM-11 (hoặc nhận khoá từ brief); (3) brief subagent = đường dẫn file dự án + `rules/pm-contract.md` + AI-GUIDE + cặp RULES/MASTER hoặc ref; (4) cuối việc: pha tối ưu (landing mới) / dọn vùng chạm + ghi nợ (landing cũ), `pm-gate --page` sau build, `project-note refresh` + `log`; (5) code-developer sửa "R-PM-1..6" → "R-PM-1..12". bug-fixer-lite đọc `<loại>.md` + `_popup-structure.md`.
- Agent definitions: thêm khối ngắn "Landing `pm__`" trỏ `~/VNG/agent-auto/rules/pm-contract.md` (R-PM-11) + "đọc file dự án trong brief trước khi đọc code" + design-checker/bug-analyst chạy `pm-gate` khi soát.
- Kiểm: `grep -l 'project-note' skills/*/SKILL.md agents/*.md` đủ danh sách; `grep -rn 'fill-pm-class' skills agents rules` = 0 ngoài luật cấm R-PM-12.

### Lane F · Task 8: check-promotion
**Files:** `skills/check-promotion/SKILL.md`, `skills/check-promotion/reference/{_popup-structure,09-vote,13-khuyen-mai-nap,39-vong-quay,11-nguoi-cu-quay-ve,02-rut-tham-may-man,milestone}.md`.
- Theo spec §4.4 từng gạch đầu dòng. Kiểm bằng script mô phỏng Layer 1 (danh sách popup bắt buộc theo loại) trên base MASTER (alias production): loại 02/13/39 không Fail vì popup chuẩn kit; Payment thiếu `popupCondition` → Fail; loại structure-only → không ✅. Script mô phỏng để ở scratchpad, không commit.

## Orchestrator sau pha 2
- Commit từng lane (trừ `skills/daily/SKILL.md`).

## PHA 3 — P2 vùng tự do (quét → tổng hợp)
### Task 9: quét pattern (3 reader song song, chỉ đọc)
- Danh sách campaign: `git -C ~/VNG/git-vng/cdn-source log --author='tont\|tongo0209' --name-only` ∩ có `pm__` (143), ưu tiên 2026, mỗi reader ≥12 campaign khác game.
- Reader JS: state machine `data-*`, `config.js`, claim/`startActionClaim`, mở/đóng popup, init, xử lý lỗi, dùng `MJ__*`.
- Reader SCSS/asset: sprite (`@include sprite`), px/scale, `MS__*`, cấu trúc `assets/<frame>/`, font subset, lazyload.
- Reader cấu trúc/HTML: tách frame, twig popup library, `documentsClass.txt`, `_docs/`, cách giữ hook khi reskin.
- Mỗi reader trả: pattern | tốt/chưa tốt | dẫn chứng `campaign:file:line` ≥2 | đã có luật nào (mã) | đề xuất luật.
### Task 10: tổng hợp luật + clean-code
- Files: `rules/cdn-source-standard.md` (thêm mã R-CDN-15+ / hoặc file mới `rules/landing-js.md` nếu >8 luật JS), `skills/clean-code/SKILL.md` (bước JS/SCSS theo luật mới + đọc/ghi file dự án + chỉ dọn vùng chạm với landing cũ), `templates/rules-index.tsv`.
- Mỗi luật: ID, MUST/SHOULD, ❌ cũ / ✅ chuẩn (đoạn ngắn tự viết, không dán code campaign), dẫn chứng 2 campaign.

## PHA 4 — Validate + review
### Task 11: gate trên campaign thật
- ≥20 campaign của user có `dist/*.html`: `--page`, `--baseline none`, gameplay = bảng khảo sát (`lucky` → luckydraw…, `payment` → payment, còn lại `none` + `--ref` = campaign cùng game gần nhất). Phân loại mọi 🔴: lỗi thật / override thiếu / báo giả. Báo giả → sửa gate + thêm ca test tái hiện; override thiếu → thêm dòng tsv có dẫn chứng. Lặp tới khi báo giả = 0. Bảng kết quả vào báo cáo (không commit dữ liệu campaign).
### Task 12: review đối kháng
- 2 reviewer độc lập: (a) phá gate — tìm hợp đồng lọt (viết ca mới, chạy thật); (b) soát nhất quán luật/skill/agent với spec §2 D1-D8 + grep nối dây. Finding thật → sửa + test → orchestrator commit.

## Done
- `node tools/pm-gate.test.mjs`, `node tools/project-note.test.mjs`, `node tools/lib/project-lock.test.mjs`, `bash hooks/guard-pm.test.sh` đều fail=0.
- `bash tools/install-skills.sh --check` 0 "cần bạn xem".
- Bảng Task 11 báo giả = 0. Review Task 12 không còn finding mở.
- Báo user: commit list, `skills/daily/SKILL.md` chưa commit, note team cần gửi, việc KHÔNG làm (push).
