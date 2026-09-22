# Áp chuẩn promotion trọn vẹn — khoá gameplay, cổng template, file dự án, vùng tự do

Ngày: 2026-09-23 · Trạng thái: user đã duyệt thiết kế (brainstorming) · Commit: không push

## 1. Bối cảnh — audit 22-23/9 trả lời "đã áp hết chuẩn promotion chưa": CHƯA

Chuẩn upstream (team promotion sở hữu, repo nội bộ):
`~/VNG/git-vng/gt-promotion-template/standard-html-templates/`
- `ai-template-kit/` — AI-GUIDE.md (router) · `gameplays/{luckydraw-gift-exchange,payment}/` (AI-RULES + MASTER + popup riêng) · `components/common/popups/` (login, profile, selectrole, history, inform) · README.md (cho người) · docx.
- `ai-template-check-skill/` — SKILL.md + 12 checklist (agent-auto đã hấp thụ đủ vào `skills/check-promotion`).

Lỗ hổng đã đo (probe 36 ca cấy lỗi trên bản sao MASTER, chạy thật cả gate lẫn hook):

| # | Lỗ | Dẫn chứng |
|---|---|---|
| G1 | Nhầm `pm__btn-claim`↔`pm__btn_claim` ở Lucky Draw: gate exit 2 "lẫn gameplay", hook nuốt stderr + chỉ kêu khi exit 1 → im | pm-gate.mjs:23-37 · guard-pm.sh:37-38 |
| G2 | Xoá hook bắt buộc: chỉ 🟡 (hook bỏ qua 🟡); 6 dòng ✅ nhiều token (popup id + class) bị bỏ hẳn → xoá `popup_signIn`/`pm__history-module`/`popupCondition` vẫn "✓" | pm-gate.mjs:73, :140-142 |
| G3 | Class module dời xuống thẻ con (§3.1 AI-RULES): 0/3 ca bắt | không có code |
| G4 | Đổi `name`/`type`/`id`/`for` input: 0/3 ca bắt | không có code |
| G5 | Nút confirm Payment đổi sang `pm__btn_claim`: không bắt | — |
| G6 | Hook phụ đi kèm (`pm__rut`+`data-value`, `pm__milestone`+`data-milestone`, `pm__totalCash`+`data-rate`), cặp class cùng thẻ (`pm__btn-login`+provider, `pm__refresh`+`pm__ajax`…), `[1/popup]`, `[≥2]`, bảng DON'T (`pm__btn-rank`, bịa `data-*`, `pm__group-N` để nguyên) | không có code |
| G7 | Bug :146 `hits(inside,'class')` — container là form theo `id` thì lồng sai hạ xuống 🟡 kèm câu sai | pm-gate.mjs:146 |
| G8 | Báo động giả: hook trong `<!-- -->` bị đếm trùng; 2 nhánh Twig `{% if %}/{% else %}` bị đếm trùng; `<any>` đếm cả thẻ đóng (×2); `pm__group-N` logic ngược | probe |
| G9 | Không skill/agent viết code nào nhồi AI-GUIDE vào brief (R-PM-5) hay chạy pm-gate (R-PM-8); 5 agent không biết kit | grep 0 kết quả |
| G10 | `check-promotion/SKILL.md:8,289` chỉ sang `fill-pm-class` — skill org-synced NGƯỢC kit (tự thêm `pm__btn-rank`, không có `pm__btn_claim`, cấm `data-*`) | `~/.claude/skills/synced/*/fill-pm-class/` |
| G11 | check-promotion: Payment thiếu `popupCondition` vẫn Pass (13:15 optional, 13:27 bỏ structure) · 11 loại structure-only ra ✅ (SKILL.md:273-276) · `_popup-structure.md:10` thiếu tên popup đăng ký của kit và của STT 11 · `09-vote.md:23` lỏng hơn team (bỏ `popup_mrmiss_reg`) · SKILL.md:54 slug STT 31 bị ghi đè · backtick thừa :68 · 11-nguoi-cu-quay-ve.md:12-27 lệch cú pháp · báo "thừa" `popup_bxh`/`popup_confirm` | agent audit 2 |
| G12 | Luật mâu thuẫn kit: R-PM-7 cấm hook ngoài MASTER ↔ AI-RULES có hook 🔸 bổ sung (L:36, P:36); R-PM-1 "cấm xoá" ↔ kit cho cắt block không dùng (README:319-320, P:47); mức nặng check-promotion SHOULD (R-PM-6, R-GTP-5) vs MUST (R-POP-7, R-HO-9); R-POP-7 trỏ bản checklist của team, bug-fixer-lite đọc bản agent-auto | agent audit 3 |
| G13 | Mục QA của kit chưa thành luật: điền `data-*` cấu hình campaign, nạp pm bundle + hàm global (SubmitForm, feedToWall, copyLink, zmXLoginWg, LuckyDrawExchangeModule), class trần JS dựa vào (box-item, close, btn-refresh, page-link, active…), giữ tag thật / `<any></any>` rỗng đừng xoá, test luồng thật login→…→inform, đa ngôn ngữ `pm__text_*` | README:71-72,127-130,282-311 |
| G14 | code-audit dùng bản fork `references/pm-contract.md` (thiếu SINGLETON, thiếu ngoại lệ popup-confirm Payment) | code-audit/SKILL.md:76 |
| G15 | Bản cài lệch repo: code-developer + 4 agent → `~/VNG/promptAgent`, bug-fixer-lite + bug-lane → `cdn-source/products/tontagent`, code-audit → `~/VNG/review-verify-code`, website-audit → `~/VNG/tool/checking-optimize-website`; bug-fixer chưa cài; install-skills.sh:197 coi "đã bật hook" khi thấy guard-bash → máy cũ không được thêm guard-pm | `install-skills.sh --check` "12 cần bạn xem" |
| G16 | Hook test ghi vào `~/.claude/hooks/guard.log` thật; ghi file bằng Bash lọt hook | guard-pm.test.sh |

**Phát hiện then chốt — kit lệch production:**

| id | kit | cdn-source (campaign) | gt-promotion bàn giao (file) |
|---|---|---|---|
| popup đăng nhập | `popup_signIn` | `popup_login` 94 · `popup_signIn` 1 | `popup_login` 106 · `popup_signIn` 0 |
| popup đăng ký | `popup_nhanluot_signUp` | `popup_register` 113 · kit-id 0 | `popup_register` 136 · kit-id 0 |
| condition Payment | `popupCondition` | 21 campaign | 0 file (bàn giao dùng `popup_condition` 134) |

Kit tự lỗi: `MASTER-luckydraw:499` gọi `getElementById('popup_noti')` — id không tồn tại; `payment/components/popups/popup-condition.html:2` còn `pm__module` trong khi MASTER đã bỏ.

## 2. Quyết định user đã chốt

| # | Quyết định |
|---|---|
| D1 | Chia 2 vùng. **BẮT BUỘC** = hợp đồng template (hook/`id`/`data-*`/lồng nhau/input) theo gameplay/loại đã khoá TRƯỚC KHI CODE. **TỰ DO** = UI/CSS/JS riêng, nhưng làm chuẩn frontend theo cách user đã code ở cdn-source; UI/JS chưa tốt thì agent dọn cho sạch nhất có thể |
| D2 | **Production thắng kit** ở mọi chỗ lệch (không chỉ id popup). Chỗ lệch ghi vào bảng override + báo team |
| D3 | Landing ngoài 2 gameplay của kit: bắt buộc = 5 luật bất biến AI-GUIDE §3 + popup dùng chung (id production) + checklist `/check-promotion` theo loại + so hook với landing CÙNG LOẠI gần nhất của user (landing-parity) — mẫu có mà mới thiếu = 🔴 |
| D4 | File ngữ cảnh per-project đặt NGOÀI repo campaign, trong agent-auto: `projects/<game>/<slug>.md`. agent-auto là repo **PUBLIC** → `projects/*` gitignore (chỉ `.gitkeep`) |
| D5 | Landing cũ: chỉ 🔴 lỗi MỚI do lần sửa gây ra (so HEAD); lỗi có sẵn in 🟡 + ghi mục Nợ của file dự án |
| D6 | Dọn code landing cũ: dọn vùng đang chạm + ghi phần còn lại vào Nợ. Landing mới: luôn có pha tối ưu sau khi chạy được |
| D7 | Trỏ hết skill/agent đang chạy về agent-auto (gộp phần mới hơn của bản đang chạy vào trước). Bản tontagent trong cdn-source không được cập nhật — user chấp nhận |
| D8 | Làm một loạt, không dừng giữa pha trừ khi gặp quyết định thật của user. Commit từng phần `[<leaf>] English`, KHÔNG push |

## 3. Ràng buộc chung

- **KHÔNG commit bản sao MASTER / AI-RULES / popup của kit vào agent-auto** (repo public, kit là tài liệu nội bộ). Test đọc upstream lúc chạy, cấy lỗi trong thư mục tạm (`os.tmpdir()`); thiếu upstream → test `skip` có lời nhắn, không fail âm thầm.
- `rules/pm-contract.md` tiếp tục KHÔNG chép catalog hook. Riêng `rules/pm-kit-overrides.tsv` là danh sách lệch (ít dòng, có dẫn chứng đếm) — được phép.
- Code theo `rules/code-style.md` (R-CS-1..7). Chạm cdn-source → `rules/cdn-source-standard.md`. Bàn giao → `rules/html-handoff.md`.
- gt-promotion-template / new-mainsite: KHÔNG commit hộ (R-GIT). Note báo team là file để user tự gửi.
- Không đụng `~/.claude/settings.json` permissions; chỉ đổi symlink skill/agent và đăng ký hook qua `install-skills.sh`.

## 4. P1 — Khoá gameplay + cổng template

### 4.1 Bước khoá (đầu mọi luồng dựng/sửa landing `pm__`)
Luồng áp: `code-developer` (full/code/fix/quick/mid), `bug-fixer-lite` (+ `bug-lane`), `daily` khi đẩy sang code, `frontend-developer`.
1. Đọc file dự án (§5). Đã có mục **Khoá** → dùng, không khoá lại.
2. Chưa có: đọc brief/thể lệ → bảng route AI-GUIDE §2 → một trong:
   - `gameplay: luckydraw-gift-exchange` | `gameplay: payment`
   - `gameplay: none` + `type: <STT>-<slug>` (bảng 39 loại của check-promotion) + `ref: <campaign mẫu cùng loại gần nhất>`
3. Không khớp dòng route / không chọn được loại → HỎI user. Cấm đoán gameplay từ hook trong file (đo: 95/143 campaign "giống Lucky" chỉ vì kit Lucky gom hook dùng chung).
4. Ghi mục Khoá vào file dự án (§5) trước khi viết dòng code đầu tiên.

### 4.2 `tools/pm-gate.mjs` v2 (viết lại, TDD)
CLI: `node tools/pm-gate.mjs <file> [--gameplay <g>] [--type <STT>] [--ref <campaignDir>] [--baseline <git-ref|file|none>] [--json]`

Phân giải gameplay (theo thứ tự): cờ `--gameplay` → file dự án của campaign chứa `<file>` (qua `tools/project-note.mjs path`) → **🔴 exit 1 "chưa khoá gameplay — chạy bước khoá (pm-contract R-PM-7)"**. Không còn exit 2 im lặng.

Nguồn hợp đồng:
- **Cây hook của MASTER** gameplay đã khoá: mỗi hook (`pm__*`, id đặc biệt, `data-*`) + chuỗi tổ tiên là hook + thuộc tính đi kèm trên cùng phần tử + input (`name`/`type`/`id`/`for`).
- **AI-RULES**: cột bắt buộc (✅, 🔸), SINGLETON (kể cả `pm__text_*` wildcard), `[1/popup]`, `[≥2]`, "phải nằm trong"/"ngoài popup", bảng DON'T. Dòng nhiều token (popup id + class) phải được hiểu, không bỏ qua.
- **`rules/pm-kit-overrides.tsv`** (production thắng kit): cột `gameplay | kit | production | kind(alias|drop|fix) | evidence | reported`. Tối thiểu: `popup_signIn→popup_login`, `popup_nhanluot_signUp→popup_register`, `popupCondition`/`popup_condition` nhận cả hai ở cả 2 gameplay (21 campaign cdn dùng `popupCondition` đều KHÔNG phải payment; payment + bàn giao dùng `popup_condition`), `popup_noti` (kit lỗi), `pm__module` thừa ở payment popup-condition.
- **Ngoài kit (`gameplay: none`)**: 5 luật bất biến + popup dùng chung (`components/common/popups`, id qua override) + hook của `--ref` (tái dùng `tools/landing-parity.mjs` ở chế độ hook, hoặc hàm dùng chung tách từ nó) — hook `pm__`/id popup có ở ref mà file thiếu = 🔴.

Luật chặn (🔴) — mỗi luật một mã để trích:
| Mã | Bắt |
|---|---|
| PG-GAME | chưa khoá gameplay; có hook ĐỘC QUYỀN của gameplay kia (trộn) |
| PG-CLAIM | `-claim`/`_claim` sai gameplay, gồm ngoại lệ `pm__popup-confirm` của Payment dùng `pm__btn-claim` |
| PG-REQ | thiếu hook bắt buộc (✅; 🔸 khi khối chứa nó có mặt), gồm popup id + class module |
| PG-ONCE | SINGLETON > 1; `[1/popup]` > 1 trong cùng popup |
| PG-NEST | lồng sai (kể cả container là form theo `id`), "ngoài popup" nằm trong popup |
| PG-OPEN | class module popup không nằm ở thẻ mở của phần tử mang id popup (§3.1) |
| PG-FORM | form tìm theo `id` bị đổi sang class/đổi id (§3.3) |
| PG-INPUT | input trong form bắt buộc lệch `name`/`type`/`id`/`for` so với MASTER |
| PG-PAIR | thiếu thuộc tính/cặp class đi kèm (data-value, data-milestone, data-rate, provider, pm__ajax…) |
| PG-DONT | vi phạm bảng DON'T (pm__btn-rank, `pm__group-N` để nguyên, sửa lỗi chính tả hook như `sumbit`) |
| PG-TYPO | hook `pm__`/id gần trùng hook đã biết (lệch 1 ký tự, đổi `-`↔`_`, đổi hoa/thường) — nút chết. Hook lạ hẳn (không có trong MASTER ∪ AI-RULES 🔸 ∪ override ∪ ref) chỉ 🟡 "hook lạ — production có thể dùng, kiểm lại", vì landing thật dùng nhiều hook ngoài kit (`pm__rankchar-*`, `pm__username`…) |
| PG-ANY | còn `<any>` (đếm theo phần tử, không ×2) |

Cảnh báo (🟡): §3.2 text động không ở element con cuối; §3.4 `pm__module` đi lệch module; hook 🔸 thiếu khi không xác định được khối; lỗi có sẵn trong chế độ baseline.

Chống báo động giả: bỏ `<!-- -->`, `{# #}`, nội dung `<script>`/`<style>` khi đếm hook; Twig: đếm SINGLETON theo từng nhánh `{% if %}…{% else %}…{% endif %}` (lấy max các nhánh, không cộng); `.twig` được parse (không exit 2).

**Baseline (D5):** `--baseline` mặc định `HEAD` khi file nằm trong git repo và đã có ở HEAD; chạy gate trên bản baseline (qua `git show HEAD:<path>`) và bản hiện tại, lỗi có ở cả hai = 🟡 "có sẵn", chỉ lỗi mới = 🔴. `--baseline none` = chặn tất cả (landing mới). Output in 2 nhóm: "Lỗi mới (chặn)" / "Lỗi có sẵn (nợ — đã ghi file dự án)". Có file dự án → gate `--json` cho phép `project-note.mjs debt` ghi nợ.

Exit: 0 sạch hoặc chỉ 🟡 · 1 có 🔴 · 2 lỗi dùng (thiếu file, cờ sai). stderr luôn có nội dung khi exit ≠ 0.

### 4.3 `hooks/guard-pm.sh`
- Chạy cho `.html/.htm/.twig` có `pm__` (giữ loại trừ node_modules/vendor/min/dist).
- Chuyển nguyên output gate (cả 🔴 lẫn 🟡) cho model; exit 1 của gate → chặn (hook exit 2 theo hợp đồng PostToolUse) kèm lời nhắn; exit 2 → báo lỗi dùng, không nuốt.
- Test: `HOME` tạm → không ghi `~/.claude/hooks/guard.log` thật; thêm ca trộn gameplay, chưa khoá gameplay, 🟡, Twig, baseline.

### 4.4 `skills/check-promotion`
- `_popup-structure.md`: danh sách tên popup đăng ký/đăng nhập nhận id production + id kit (qua override); thêm `popupThongtin`/`popupDangky` (STT 11); structure inform chấp nhận cấu trúc kit (`pm__inform-text` sâu 1 tầng, không bắt `.MS__content`).
- `13-khuyen-mai-nap.md`: `popupCondition` BẮT BUỘC khi gameplay payment; bỏ "skip structure" cho condition.
- `09-vote.md`: trả lại `popup_mrmiss_reg` vào 4 mục bắt buộc như bản team.
- `39-vong-quay.md`: nhận `popup_login`/`popup_register` (id production) — vòng quay route vào Lucky Draw.
- Popup chuẩn của kit (`popup_bxh`, `popup_confirm`, `popup_reward`, `popup_selectrole`, `popup_history`) không bị báo "thừa"; `popup_reward` ghi chú điều kiện được định nghĩa rõ trong SKILL.md (optional có điều kiện ≠ bắt buộc).
- SKILL.md: sửa slug STT 31 (:54), backtick :68; icon tổng kết: loại structure-only KHÔNG được ✅ (tối đa ◐ + lời nhắc thiếu checklist popup); thay con trỏ `fill-pm-class` (:8, :289) bằng `pm-gate` + R-PM; ghi rõ popup_rule/reward là popup UI tự do (được thêm, không phải hook kit).
- `11-nguoi-cu-quay-ve.md`: đưa về đúng cú pháp SKILL (hoặc, optional_popups, luật khớp tên).
- bug-fixer-lite: đọc `<loại>.md` + `_popup-structure.md`.

### 4.5 Luật (`rules/`)
- `pm-contract.md`:
  - R-PM-1: thêm "được cắt NGUYÊN block/cơ chế không dùng theo kit (README §cắt block); cấm xoá lẻ hook trong block đang dùng".
  - R-PM-7: hook 🔸 bổ sung liệt kê trong AI-RULES là hợp lệ; ngoài kit dùng hook của landing mẫu cùng loại; vẫn cấm bịa.
  - R-PM-8: trỏ pm-gate v2 + mã PG-*; baseline cho landing cũ.
  - **R-PM-9 MUST** production thắng kit — nguồn `pm-kit-overrides.tsv`; phát hiện lệch mới → thêm dòng + ghi note team.
  - **R-PM-10 MUST** mục QA kit (G13) — checklist tay trước bàn giao, ghi kết quả vào file dự án.
  - **R-PM-11 MUST** bước khoá gameplay §4.1 + file dự án §5 là cửa vào.
  - **R-PM-12 MUST** cấm dùng `fill-pm-class` cho landing (ngược kit: `pm__btn-rank`, thiếu `pm__btn_claim`, cấm `data-*`).
- Thống nhất `/check-promotion` = MUST trước QA ở R-PM-6, R-GTP-5, R-POP-7, R-HO-9; R-POP-7 trỏ đúng `agent-auto/skills/check-promotion`.
- `promo-states.md`: ghi rõ `.active` là class trần JS platform có thể bật (không chỉ CSS).
- Cập nhật `templates/rules-index.tsv` và `templates/CLAUDE.internal.md`/`templates/CLAUDE.md` cho mã mới.
- code-audit: bỏ `references/pm-contract.md` fork → trỏ `rules/pm-contract.md` + gọi pm-gate.

### 4.6 Note báo team — `docs/notes/2026-09-23-kit-vs-production.md`
Bảng id lệch production (số đếm), `popup_noti`, `pm__module` thừa, docx nhắc VGA mà kit không có, câu hỏi cần team trả lời. Không tự gửi.

## 5. P3 — File dự án + pha tối ưu

### 5.1 File `projects/<game>/<slug>.md`
`<game>/<slug>` = `products/<game>/landing/<slug>` của cdn-source. Khung cố định (heading giữ nguyên để tool đọc):
```
# <game>/<slug> — <tên campaign>
## 1. Khoá            gameplay · type · ref · nguồn chuẩn (kit commit) · ngày khoá · ai khoá
## 2. Nơi code        cdn-source path · gt-promotion handoff paths (Promotion/ + mainsite/) · Twig new-mainsite · Jira key
## 3. Sơ đồ file      file → việc (1 dòng/file)
## 4. Bản đồ hook     section/popup → hook chính → file:line
## 5. Quyết định & hằng số   giá trị · nguồn (PM/sheet/design) · ngày
## 6. Câu hỏi đang chờ
## 7. Nợ kỹ thuật     từ pm-gate baseline + phần dọn dở (D5, D6)
## 8. Lệnh            build · dev · verify (pm-gate, layout-gate, check-promotion, ui-check)
## 9. Nhật ký         ngày · task/bug · đổi gì · commit
```

### 5.2 `tools/project-note.mjs`
- `path <file|campaignDir>` → in đường dẫn file dự án (dò ngược lên `products/<game>/landing/<slug>`); không thuộc cdn-source → dò bảng handoff trong các file dự án (mục 2) để map file gt-promotion về campaign.
- `init <campaignDir>` → sinh khung; tự điền mục 2 (dò gt-promotion theo tên/slug/Jira nếu có), 3 (liệt kê file nguồn, bỏ node_modules/dist), 4 (quét hook `pm__`/id popup kèm file:line), 8 (scripts trong package.json). Mục 1 để trống có nhãn "CHƯA KHOÁ". Không ghi đè file đã có.
- `refresh <campaignDir>` → cập nhật lại mục 3, 4 (giữ nguyên mục do người/agent viết).
- `check <campaignDir>` → báo lỗi thời: file trong mục 3 không còn, hook mục 4 lệch dòng/không còn, mục 1 trống.
- `debt <campaignDir> --from <pm-gate.json>` → ghi/khử trùng lỗi có sẵn vào mục 7.
- `log <campaignDir> "<dòng>"` → thêm mục 9.
- `.gitignore`: `projects/*` + `!projects/.gitkeep`.

### 5.3 Nối vào luồng
- Đầu task: `project-note path` → chưa có thì `init` → đọc file TRƯỚC khi đọc code; brief subagent trỏ file này (kèm AI-GUIDE + cặp RULES/MASTER hoặc ref) thay vì bắt đọc lại cả campaign.
- Cuối task: `refresh` + cập nhật mục 5/6/7 + `log`.
- Nơi sửa: `code-developer`, `bug-fixer-lite` (+ `bug-lane`), `daily`, `clean-code`, `code-audit`, agent `frontend-developer`, `design-checker`, `bug-analyst`.

### 5.4 Pha tối ưu
- **Landing mới** (sau khi bản cơ bản chạy được, trước khi báo xong): dọn theo R-CS + chuẩn cdn-source (quy trình `/clean-code` — không đổi hành vi, không đụng hợp đồng) → build → `pm-gate --baseline none` → `layout-gate` → `/check-promotion` → `project-note refresh` + log.
- **Landing cũ** (D6): dọn trong file/section đang chạm; phần thấy mà không chạm → mục 7 Nợ.

## 6. P2 — Vùng tự do theo chuẩn cdn-source của user

- Quét campaign `pm__` user đã commit ở cdn-source (danh sách 143 từ `git log --author`), ưu tiên 2026 và đa dạng game; rút pattern JS (state machine `data-*`, `config.js`, luồng claim/`startActionClaim`, mở/đóng popup, init module), SCSS/sprite, cấu trúc `assets/`, dùng `MS__`/`MJ__` (`documentsClass.txt`).
- Đối chiếu `rules/cdn-source-standard.md`, `layout-standard.md`, `promo-states.md`, `animation.md`, `code-style.md`. Pattern tốt chưa có luật → thêm luật có mã; pattern chưa tốt → luật dạng ❌ cũ / ✅ chuẩn (không chép theo cái chưa tốt). Mỗi luật mới kèm 1-2 dẫn chứng `campaign:file:line`.
- `skills/clean-code`: thêm bước JS/SCSS theo luật mới.
- Không dán code nghiệp vụ/nội dung campaign vào rules (repo public) — chỉ pattern.

## 7. Trỏ về agent-auto (D7)

1. Với từng skill/agent đang symlink ra ngoài: `diff` bản đang chạy ↔ bản agent-auto; gộp phần mới hơn của bản đang chạy vào agent-auto (giữ phần agent-auto mới hơn); ghi lại gộp gì.
2. Đổi symlink `~/.claude/skills/<s>` và `~/.claude/agents/<a>.md` về agent-auto (qua `install-skills.sh` nếu nó hỗ trợ, không thì `ln -sfn` và sửa install-skills để lần sau tự đúng); cài `bug-fixer` và `agents/references`.
3. `install-skills.sh`: kiểm từng hook (guard-bash, guard-state, guard-style, guard-pm, token-watch…) thay vì chỉ guard-bash.
4. `bash tools/install-skills.sh --check` → 0 "cần bạn xem".

## 8. Kiểm chứng (điều kiện xong)

- `pm-gate` v2: test tự động phủ 36 ca probe + các ca §4.2 → mọi ca lỗi bắt đúng mã PG-*; MASTER (thay `<any>`→div) 0 🔴 0 🟡 ở cả 2 gameplay; Twig/comment không báo giả.
- Chạy gate v2 (`--baseline none`, gameplay suy từ khoá tạm cho khảo sát) trên ≥20 campaign thật của user → mọi 🔴 được phân loại: lỗi thật / override thiếu / báo giả (báo giả phải sửa về 0).
- `guard-pm.test.sh`, test `project-note`, test `check-promotion` (nếu có harness) xanh; không ghi guard.log thật.
- `install-skills.sh --check` sạch; `readlink` mọi skill/agent trỏ agent-auto.
- `grep` xác nhận mọi skill/agent ở §5.3 trỏ `pm-contract` R-PM-11 + file dự án + pm-gate.
- Review đối kháng cuối (đọc diff, thử phá gate) trước khi báo xong. Báo cáo theo R-EV (mục Bằng chứng).
