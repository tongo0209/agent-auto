# R-PM-* · Hợp đồng platform `pm__` (landing promotion)

Áp cho MỌI file HTML/Twig có class `pm__…` — ở `cdn-source`, `gt-promotion-template`, `new-mainsite`.

**Nguồn chuẩn (upstream, team sở hữu):** `~/VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit/`
— `AI-GUIDE.md` (router) → `gameplays/<gameplay>/AI-RULES-<gameplay>.md` (catalog hook: bắt buộc/vị trí/số lần) + `MASTER-<gameplay>.html` (khung thật) · `components/common/popups/` (popup dùng chung) · `README.md` (mục QA, hàm global).
File này **chỉ trỏ và bổ sung kỷ luật phía agent**, KHÔNG chép catalog sang — catalog đổi ở upstream thì bản chép lập tức lệch. Chỗ kit lệch production: `rules/pm-kit-overrides.tsv` (R-PM-9).
`MUST` = vi phạm là chặn, không được báo xong. `SHOULD` = nên, lệch thì phải nói rõ lý do.

| ID | Sev | Luật |
|---|---|---|
| **R-PM-1** | MUST | `pm__…`, `id` đặc biệt, `data-*` là **hợp đồng với JS platform**: cấm đổi tên, cấm xoá, giữ đúng quan hệ lồng nhau. Mất hook = nút chết trên production, KHÔNG phải lỗi CSS nên test giao diện không bắt được. **Được cắt NGUYÊN block/cơ chế không dùng** theo kit (README §9 "cắt bớt cái không dùng"; AI-RULES Payment §2b "dùng cơ chế nào thì giữ block đó") — cắt cả khối cùng mọi hook trong nó; **cấm xoá lẻ** hook trong block đang dùng. |
| **R-PM-2** | MUST | Input giữ nguyên `name` / `type` / `for` / `id`. Cần tắt field thì **ẩn khối bọc theo `id`**, không đổi tên, không xoá input. |
| **R-PM-3** | MUST | Phân biệt `pm__btn-claim` (gạch NGANG — Lucky Draw) vs `pm__btn_claim` (gạch DƯỚI — Payment). **Ngoại lệ**: popup confirm của Payment (`pm__popup-confirm`) vẫn dùng `pm__btn-claim` gạch ngang. Copy nhầm 1 ký tự = nút chết. Trước khi copy khối nút từ campaign khác: đối chiếu loại promotion theo MASTER của gameplay đang làm. |
| **R-PM-4** | MUST | Được **thêm** class/markup riêng cạnh `pm__…`; KHÔNG thay thế. `<any>` là placeholder — phải thay hết bằng tag thật trước khi build. |
| **R-PM-5** | MUST | Giao subagent chạm file `pm__`: brief phải có **đường dẫn file dự án** (R-PM-11, mục Khoá đã ghi) + trỏ file này + đường dẫn tuyệt đối tới `AI-GUIDE.md` + cặp AI-RULES/MASTER của gameplay đã khoá (hoặc `ref` khi `gameplay: none`). Không skill frontend nào tự biết luật `pm__`, subagent cũng không nạp được skill. |
| **R-PM-6** | MUST | Soát popup theo loại promotion bằng `/check-promotion <loại> <file>` trước khi giao QA — loại lấy từ `type` ở mục Khoá của file dự án (trống thì chọn loại theo R-POP-7). Còn mục Fail = chưa xong. Cùng một cổng với R-POP-7, R-GTP-5, R-HO-9. Skill đó **không** soát `pm__` — phần `pm__` là của `pm-gate` (R-PM-8). |
| **R-PM-7** | MUST | **Nguồn hợp đồng**: `AI-GUIDE.md` → bảng route §2 → đúng **MỘT** cặp `AI-RULES-<gameplay>.md` + `MASTER-<gameplay>.html` của gameplay đã khoá (R-PM-11) — không chọn lại giữa chừng. Cấm trộn hook giữa 2 gameplay (`PG-GAME`). Hook **🔸 bổ sung** mà AI-RULES liệt kê (MASTER không có) là hợp lệ. `gameplay: none` (ngoài kit): hợp đồng = 5 luật bất biến AI-GUIDE §3 + popup dùng chung (id theo R-PM-9) + checklist `/check-promotion` theo loại + hook của landing mẫu cùng loại (`ref`). Ngoài các nguồn đó thì **không tự bịa** hook, kể cả `data-*`. |
| **R-PM-8** | MUST | **Cổng trước khi báo xong** — `node ~/VNG/agent-auto/tools/pm-gate.mjs <file>` lúc sửa (file partial/Twig chỉ chạy luật cục bộ) **và** `node ~/VNG/agent-auto/tools/pm-gate.mjs --page <campaignDir>` sau build (trang `dist/` = trang thật, mới đủ `PG-REQ`/`PG-REF`). Gameplay đọc từ mục Khoá; cấm truyền `--gameplay` đoán mò để qua cổng. Landing cũ: `--baseline` mặc định `HEAD` → chỉ lỗi MỚI là 🔴, lỗi có sẵn in nhóm nợ → `project-note debt` ghi mục 7. Landing mới: `--baseline none`. 🔴 = chặn; 🟡 phải soát tay, không lờ. Mã lỗi: bảng *Mã của pm-gate* dưới. Thiếu output của `--page` = chưa xong; hook `guard-pm` im ≠ đã qua cổng trang. |
| **R-PM-9** | MUST | **Production thắng kit.** Chỗ kit lệch production (id popup, hook thừa, kit tự lỗi) theo `rules/pm-kit-overrides.tsv` (`alias` kit→production · `drop` · `fix`) — vd dùng `popup_login`, không dùng `popup_signIn` (`PG-OVR`). Thấy lệch mới: thêm 1 dòng có dẫn chứng đếm (số campaign cdn-source · số file gt-promotion), `reported` = `no`, rồi ghi vào note báo team `docs/notes/2026-09-23-kit-vs-production.md`. Không tự sửa kit — kit là của team promotion. |
| **R-PM-10** | MUST | **QA của kit trước bàn giao** (README §8 + AI-RULES §5) — soát tay, gate không đo được: (a) `data-*` cấu hình đã điền đúng thể lệ (lượt, mốc, mốc nạp, hệ số, ảnh quà); (b) popup profile chỉ hiện field cần, ẩn theo `id` (R-PM-2); (c) trang nạp pm bundle + hàm global mà template gọi (`SubmitForm`, `zmXLoginWg.openPopup`, `feedToWall`, `copyLink`; `LuckyDrawExchangeModule` chỉ Lucky Draw); (d) class/id trần JS dựa vào giữ nguyên tên (`box-item`, `close`, `btn-refresh`, `page-link`, `page-back`/`page-next`, `server-select-title`, `character-select-title`, trạng thái `active`); (e) tag thật có sẵn giữ nguyên, `<any></any>` rỗng thay tag chứ không xoá; (f) chạy luồng thật đăng nhập → đăng ký → chọn role → điều kiện → quay/nạp → nhận/đổi → lịch sử → thông báo; (g) responsive + đa ngôn ngữ `pm__text_*`. Kết quả ghi bằng `project-note log`; mục chưa đạt → mục 6 (chờ) hoặc 7 (nợ); không chạy được mục nào thì ghi `chưa verify: <lý do>` (R-EV-2). |
| **R-PM-11** | MUST | **Cửa vào mọi task landing `pm__`** (dựng · sửa · fix bug · bàn giao): đọc **file dự án** `projects/<game>/<slug>.md` TRƯỚC khi đọc code, và **khoá gameplay TRƯỚC dòng code đầu tiên** — trình tự ở mục dưới. Cấm đoán gameplay từ hook trong file (đo: 95/143 campaign "giống Lucky" chỉ vì kit Lucky gom hook dùng chung). Không khớp dòng route, hoặc không chọn chắc được loại/mẫu → **hỏi user** kèm đề xuất, không tự chọn. |
| **R-PM-12** | MUST | **Cấm dùng skill `fill-pm-class`** cho landing: bản org-synced đó ngược kit — tự thêm `pm__btn-rank` (hook không tồn tại), không biết `pm__btn_claim`, cấm `data-*`. Điền hook theo MASTER/AI-RULES (R-PM-7) rồi qua `pm-gate` (R-PM-8). |

## R-PM-11 — trình tự một task landing `pm__`

Lệnh chạy từ bất kỳ đâu: `node ~/VNG/agent-auto/tools/project-note.mjs …` (viết tắt `project-note`), `node ~/VNG/agent-auto/tools/pm-gate.mjs …` (viết tắt `pm-gate`).

1. `project-note path <file|campaignDir>` → có file dự án thì đọc nó trước (mục 3 sơ đồ file, mục 4 bản đồ hook đã trả lời "cái gì ở đâu"). File gt-promotion map về campaign qua mục 2 *Nơi code*.
2. Chưa có file (stderr `chưa có file — chạy: project-note init …`; exit 1 là không map được về campaign nào) → `project-note init <campaignDir> [--jira KEY]` trong campaign cdn-source.
3. **Bước khoá.** Mục 1 đã khoá → dùng, không khoá lại. Chưa: đọc brief/thể lệ → bảng route AI-GUIDE §2 → `gameplay: luckydraw-gift-exchange` | `payment`, hoặc `gameplay: none` + `type: <STT>-<slug>` (bảng 39 loại của `/check-promotion`) + `ref: <campaign mẫu cùng loại gần nhất>`.
4. `project-note lock <campaignDir> --gameplay <g> [--type <t>] [--ref <dir>] [--by ai|user]`.
5. Code theo R-PM-1..7; giao subagent thì brief theo R-PM-5.
6. **Pha tối ưu.** Landing mới — sau khi bản cơ bản chạy được: dọn theo R-CS + `cdn-source-standard.md` (quy trình `/clean-code`: không đổi hành vi, không đụng hợp đồng) → build → `pm-gate --page <campaignDir> --baseline none` → `node ~/VNG/agent-auto/tools/layout-gate.mjs <path>` → `/check-promotion`. Landing cũ — dọn trong file/section đang chạm; phần thấy mà không chạm → mục 7 *Nợ kỹ thuật*.
7. Sau build: `pm-gate --page <campaignDir>` (R-PM-8); có nhóm nợ thì `pm-gate --page <campaignDir> --json > <scratch>/gate.json` rồi `project-note debt <campaignDir> --from <scratch>/gate.json` (`debt` đọc cả mảng của `--page` lẫn report 1 file). Trước bàn giao thêm R-PM-10 + R-PM-6.
8. Cuối task: `project-note refresh <campaignDir>` + tự cập nhật mục 5/6/7 + `project-note log <campaignDir> "<task · đổi gì · commit>"`. `project-note check <campaignDir>` báo mục đã lỗi thời.

## Mã của `pm-gate` (PG-*)

Báo lỗi thì trích mã gate kèm luật gốc (`PG-CLAIM → R-PM-3 MUST`). Exit: 0 sạch hoặc chỉ 🟡 · 1 có 🔴 · 2 lỗi dùng (thiếu file, cờ sai, không có kit) — exit ≠ 0 luôn có stderr. Cách đo từng mã: `tools/pm-gate/checks.mjs`.

| Mã | Mức | Bắt | Luật |
|---|---|---|---|
| `PG-GAME` | 🔴 | chưa khoá gameplay; có hook độc quyền của gameplay kia (trộn) | R-PM-7, R-PM-11 |
| `PG-CLAIM` | 🔴 | `-claim`/`_claim` sai gameplay, gồm ngoại lệ `pm__popup-confirm` của Payment | R-PM-3 |
| `PG-REQ` | 🔴 | thiếu hook bắt buộc ✅ (🔸 khi khối chứa nó có mặt), gồm popup id + class module — chỉ chạy trên trang đủ (`<body` hoặc `--page`) | R-PM-1 |
| `PG-ONCE` | 🔴 | SINGLETON > 1 toàn trang; `[1/popup]` > 1 trong cùng popup. Twig tính theo nhánh `{% if %}`, không cộng các nhánh | R-PM-8 |
| `PG-NEST` | 🔴 | lồng sai (kể cả container là form theo `id`); hook "ngoài popup" nằm trong popup | R-PM-1 |
| `PG-OPEN` | 🔴 | class module popup không ở thẻ mở của phần tử mang id popup (AI-RULES §3.1) | R-PM-8 |
| `PG-FORM` | 🔴 | form dò theo `id` bị đổi sang class / đổi id (§3.3) | R-PM-8 |
| `PG-INPUT` | 🔴 | input lệch `name`/`type`/`id`/`for` so với MASTER | R-PM-2 |
| `PG-PAIR` | 🔴 | thiếu thuộc tính/class đi cùng (`data-value`, `data-milestone`, `data-rate`, class provider, `pm__ajax`…) | R-PM-1 |
| `PG-DONT` | 🔴 | vi phạm bảng DON'T của AI-RULES §5 (`pm__btn-rank`, `pm__group-N` để nguyên, sửa `sumbit`, `pm__module` trên `pm__inform`) | R-PM-7 |
| `PG-TYPO` | 🔴 | hook gần trùng hook đã biết (lệch 1 ký tự, `-`↔`_`, hoa/thường) — nút chết | R-PM-1 |
| `PG-ANY` | 🔴 | còn `<any>` (đếm theo phần tử) | R-PM-4 |
| `PG-REF` | 🔴 | `gameplay: none`: hook/id popup mà landing mẫu (`ref`) có, trang thiếu | R-PM-7 |
| `PG-OVR` | 🔴 | dùng id kit đã bị alias sang production (vd `popup_signIn` → `popup_login`) | R-PM-9 |
| `PG-TEXT` | 🟡 | text động không ở element con cuối (§3.2) | R-PM-8 |
| `PG-MODULE` | 🟡 | `pm__module` đi lệch module (§3.4) | R-PM-8 |
| `PG-UNKNOWN` | 🟡 | hook lạ hẳn (không có trong MASTER, 🔸, override, `ref`) — production có thể dùng; kiểm lại, đừng tự xoá | R-PM-7 |

## Vì sao tách ra file này
Luật `pm__` trước đây chỉ nằm ở văn xuôi trong `~/.claude/CLAUDE.md`, mỗi lần giao subagent phải copy lại
→ dễ rơi. Có ID rồi thì `code-audit` / `design-checker` trích được `R-PM-3 MUST` thay vì diễn giải lại,
và brief chỉ cần 1 dòng trỏ tới đây.
