---
name: daily
description: Bộ điều phối công việc hàng ngày + vòng đời task của dev frontend VNG - một lệnh /daily là quét task Jira assign cho user (project GW), đọc detail + bóc link DESIGN nằm sẵn trong ticket rồi mới dò SharePoint (biết design ĐÃ GIAO chưa — có link trong ticket là đã giao, search trắng KHÔNG phải bằng chứng chưa giao), NỐI TICKET VỚI FOLDER LÀM VIỆC (neo theo nexusId trong tên folder gt-promotion + đoán fuzzy campaign trong cdn-source, hỏi 1 lần rồi nhớ mãi) để suy PHASE từ commit thật và ghi metrics effort tự động, theo dõi PHASE từng ticket theo vòng đời thật (chờ-design → sẵn-sàng → đang-code → giao-HTML qua gt-promotion-template nếu task có kênh promotion → chờ-test → fix-bug → xong-FE), pull gt-promotion phát hiện động tĩnh từ promotion, tự phát hiện buglist (sheet cố định per-game trong config + link sheets trong comment Jira) để soạn lệnh bug-fixer-lite, phân loại theo bảng routing rồi trình kế hoạch cho user duyệt ĐÚNG 1 LẦN rồi tự chạy hết (code qua code-developer full/fix/code/batch), theo dõi qua board local agent-auto/boards/ + dashboard HTML artifact 1 URL cố định, cảnh báo trễ mốc timeline. KHÔNG ghi ngược Jira, KHÔNG commit/push, KHÔNG tự chạy bug-fixer-lite trong VS Code panel. Modes: mặc định (trọn luồng) | plan (quét + kế hoạch, không thực thi) | prep <KEY> (chuẩn bị sâu 1 ticket) | week (kế hoạch tuần 14 ngày + cảnh báo dồn deadline) | add <link|text> (nhận việc ngoài Jira thành task ADHOC) | link <KEY> [repo path] (gắn ticket với folder làm việc) | delta (radar quét nhanh thay đổi Jira + gt-promotion; chạy nền tự động bằng launchd) | bugwatch (radar buglist hậu bàn giao: soi sheet QC qua Google Drive, thấy bug mới thì tự kiểm 4 cổng sở hữu rồi gọi bug-fixer-lite) | bugwrite (xả hàng đợi ghi ngược sheet, cần phiên CLI có Chrome) | wrap (chốt ngày: tổng kết + soạn standup + ghi metrics) | status (đọc board, không quét) | doctor (chạy tools/state-doctor.mjs, tự sửa cái sửa được, báo cái không tự sửa kèm mã luật, không quét Jira/không code). Dùng khi user gõ /daily hoặc nói "check task jira hôm nay", "hôm nay làm gì", "kế hoạch tuần", "chốt ngày".
---

# /daily — điều phối ngày + vòng đời task: Jira → kế hoạch → chạy → giao HTML → bug → chốt

Bạn (phiên chính) đóng vai **trưởng nhóm điều phối**. Việc của bạn là phần cơ học + điều phối:
quét Jira, dò phase, phân loại, trình kế hoạch, gọi skill thực thi, cập nhật board. **KHÔNG tự
code việc lớn** — giao `/code-developer`. Ngoại lệ duy nhất: sửa vặt ≤2 file chỗ sửa đã rõ.

> 🇻🇳 Mọi giao tiếp với user bằng TIẾNG VIỆT.

## Đường dẫn cố định

- `AGENT_AUTO` = gốc repo agent-auto = **thư mục cha 2 cấp của skill này** (skill sống ở
  `AGENT_AUTO/skills/daily/`, `~/.claude/skills/daily` chỉ là symlink trỏ vào đây). Mặc định
  `~/VNG/agent-auto`; clone chỗ khác thì suy từ đường dẫn thật của symlink, đừng đoán.
- Config: `AGENT_AUTO/config.json` · State: `AGENT_AUTO/state.json`
- Board: `AGENT_AUTO/boards/YYYY-MM-DD.md` · Brief: `AGENT_AUTO/tasks/<KEY>/brief.md`
- **Kho design tập trung**: `AGENT_AUTO/designs/<KEY>/` (ảnh dùng được) + `designs/<KEY>/_raw/`
  (zip/PSD gốc) — MỌI design tải từ task Jira về đây, KHÔNG rải trong `tasks/` (quyết định
  user 2026-07-31, để mở 1 folder thấy hết design). Brief ghi link sang folder này.
- Dashboard: `AGENT_AUTO/dashboard.html` · Metrics: `AGENT_AUTO/knowledge/metrics.jsonl`
- **Snapshot theo tháng**: `AGENT_AUTO/history/months.json` (ghi đè mỗi lần chạy — nguồn tab "Theo tháng")
- Console (web local): `AGENT_AUTO/console/` — `npm start` → http://127.0.0.1:4747
- Spec hệ thống: `AGENT_AUTO/docs/specs/` (đọc khi cần hiểu why)

## Vòng đời task (PHASE)

Vốn từ phase · loại mốc · trạng thái design là **`AGENT_AUTO/schema/vocab.json`** — nguồn duy nhất,
console đọc chính file đó. Ghi `state.issues[key].phase` bằng đúng `id` trong file.
KHÔNG tự đặt tên phase mới: `state-doctor` sẽ báo ERROR (E1) và console gom vào nhóm
"Phase lạ — console chưa khai báo".

Dây chuyền thường: `waiting-design → ready → coding → deliver (chỉ task có kênh promotion)
→ wait-test → bugfix → done-fe`. Hai phase rẽ nhánh: `reassigned` (đổi assignee — còn nợ bàn giao,
xem mục handoff) và `closed` (Done thật).

- **deliver** CHỈ áp cho task có kênh promotion. Nhận diện: tồn tại folder
  `<repos.gt-promotion-template>/<game>/<slug>-<nexusId>/` (nexusId bóc từ link
  `nexus.vnggames.com/home/tickets-v2/<id>` trong ticket — chi tiết: `references/nexus.md`).
  Task thuần mainsite: coding → wait-test.
- Phase chỉ TIẾN khi có bằng chứng thật (file design tồn tại, code đã verify, HTML đã chép,
  buglist xuất hiện). Không có bằng chứng → giữ phase cũ.
- Mốc timeline (design/HTML/test/release) bóc từ ticket → `state.issues[key].milestones`.
  Phase thực tế chậm hơn mốc → cảnh báo ⏰ ĐẦU báo cáo (vd: quá mốc HTML mà chưa coding xong).
- **Mốc = DEADLINE, nên khoảng ngày lấy ngày CUỐI.** Nguồn hay ghi kiểu khoảng
  (`03~04/08`, `3–4/8`, `ASAP 04~05/08`, "từ … đến …") ⇒ ghi ngày cuối vào `milestones`, ngày
  đầu chỉ là lúc bắt đầu làm. Lấy ngày đầu = mốc sớm 1 ngày ⇒ console báo "quá mốc" oan
  (ca thật GW-713: Jira ghi `03/08`, docx `03~04/08`, state ghi 3/8 nên 4/8 báo quá mốc 1 ngày
  dù hôm đó mới là hạn).
- **Nguồn chi tiết hơn/mới hơn thắng — và phải GHI LẠI mốc, không chỉ ghi vào brief.** Thứ tự
  tin: file note của PM (docx/xlsx trong folder design) > comment Jira mới > description Jira >
  duedate. Khi đọc được nguồn chi tiết hơn ở bước sau (prep, tải design), so lại `milestones`
  đã bóc ở bước quét: lệch thì SỬA `state.json` ngay + ghi `_<mốc>Note` nêu nguồn và lý do đổi.
  Đọc docx rồi chỉ chép timeline vào `tasks/<KEY>/brief.md` mà để mốc cũ trong state = console
  vẫn cảnh báo theo số sai.
- **Key biến mất khỏi JQL KHÔNG tự động nghĩa là Done.** Phải phân biệt: `status` Done +
  `resolutiondate` có giá trị ⇒ `closed`; assignee đổi sang người khác mà `status` CHƯA Done
  ⇒ `reassigned` (việc ra khỏi tay mình nhưng còn nợ bàn giao — mốc thôi tính cho mình). Nhầm
  2 ca này là đúng lỗi thật sáng 3/8: ghi `reassigned` mà console chưa biết phase đó ⇒ ticket vừa
  lọt timeline vừa mất khỏi bảng task.
- Ticket chuyển sang `reassigned` → BẮT BUỘC sinh `tasks/<KEY>/handoff.md` dạng checklist
  (`- [ ] việc bàn giao...`) liệt kê việc còn nợ ngoài repo (vd: báo lại BE, bàn giao QC).
  Console hiện checklist này trong drawer ticket và tick được; thiếu file mà phase đã
  `reassigned` → `state-doctor` báo WARN W3.

## Mode

Token đầu của `$ARGUMENTS`:
- *(không có)* → trọn luồng 6 bước.
- `plan` → dừng sau Bước 3 (không thực thi).
- `prep <KEY>` → chỉ Bước 2 cho ticket đó (brief + dò design), không code. **Tải design xong
  thì gọi skill `check-design` cho KEY đó** — soát design có ĐỦ so với yêu cầu chưa (thiếu màn,
  thiếu popup, thiếu mobile...). Kết quả: `tasks/<KEY>/design-gap.md`, tóm tắt ở
  `state.issues[KEY].design.gaps`. KHÔNG chép luật soát vào file này.
- `week` → kế hoạch tuần: gom mọi mốc 14 ngày tới từ state + Jira thành bảng tuần;
  **cảnh báo DỒN MỐC** khi ≥2 mốc HTML cách nhau <3 ngày; gợi ý thứ tự bắt đầu (mốc gần +
  effort lớn trước); cập nhật dải "Tuần này" trên dashboard. Không thực thi code.
- `add <link|text>` → intake ngoài Jira: nhận link nexus/sheet/URL bất kỳ/text dán → tạo
  `tasks/ADHOC-<n>/brief.md` (n = `config.adhocCounter`+1, ghi lại config) + dòng board +
  phân loại như task thường (buglist → đường bug, việc code → đường code). ADHOC cũng có phase.
- `delta` → radar nhẹ, KHÔNG hỏi gì, chạy <1 phút: (1) JQL `assignee = currentUser() AND updated >= -4h`;
  (2) `git -C <gt-promotion> pull` + `git log --since` xem commit mới có đụng folder task đang theo dõi;
  **(2b) `git log --since` (KHÔNG pull) cho MỌI repo còn lại trong `config.repos`** — `cdn-source`,
  `new-mainsite`, `vportal2view`: task mainsite/landing sống ở đó nên chỉ soi gt-promotion là mù
  đúng chỗ mình gõ code. ⚠ đã trả giá 13/8: commit `7f229442e` 18:02 trên new-mainsite (layout
  `boomzth/article-clean-black`) lọt qua delta lượt 10 lúc 21:08, chỉ lộ ở lượt 22:5x nhờ soi thêm tay;
  (3) bóc link sheet mới trong comment → `state.issues[key].bugSheets`;
  (4) **refresh `history/months.json` khi `generatedAt` ≠ hôm nay** — 1 query snapshot theo
  `references/jql.md` mục "Snapshot theo tháng", ghi đè (backup sang `.backups/months/`).
  CHỈ báo thay đổi + cập nhật board/state. Không code.
  ⚠ Bước (4) KHÔNG được bỏ dù `delta` là mode nhẹ: tab **"Theo tháng"** của console đọc THẲNG
  `months.json`, không tự suy từ `state.json`. Bỏ qua = task vừa đóng vẫn hiện ○ "đang làm" và
  duedate đã dời vẫn hiện số cũ — user nhìn thấy ngay và mất tin vào console. Đã trả giá 6/8:
  GW-556 đóng 12:48, `delta` cập nhật state+board đủ nhưng snapshot còn của 3/8 nên console vẫn
  vẽ ○, lại thiếu hẳn GW-713 và vẫn ghi mốc GW-477 cũ (8/7 thay vì 8/10).
  ⚠ **Trần thời gian đã nới 5' → 10' (17/8).** Đo trên `history/radar.jsonl`: 8/23 lượt hỏng,
  **7 lượt do chạm đúng trần 300s**, trong khi lượt thành công có trung vị 178s và max 235s —
  trần cũ đặt sát mép phân bố. Lượt timeout đốt trọn 5 phút token mà KHÔNG ra kết quả, tệ hơn
  hẳn trả thêm 1 phút để có kết quả. Lượt `bugwatch` dùng trần riêng `timeoutMinBugwatch` (15').
  **Chạy nền = launchd** (`agent-auto/tools/radar-tick.mjs`, mỗi 30' trong 08–18h T2–T6; lượt
  đầy đủ vẫn 60', lượt xen giữa chỉ chạy khi có sheet buglist đang nóng):
  không cần mở console hay tab nào. Bật/tắt bằng `config.radar.enabled` (nút trên console);
  sổ ở `history/radar.jsonl`; quét tay 1 lượt: `node tools/radar-tick.mjs --force`.
  ⚠ Chỗ này TỪNG cấm cron vì tưởng phiên nền mất token connector Jira. **Đo lại 13/8: sai** —
  `claude -p` gọi được `searchJiraIssuesUsingJql` (OK GW-720, 16.6s) và gọi được cả skill
  (`/daily status`, 47s); launchd chạy `/daily delta` đủ cả `git pull` gt-promotion.
  Thiết kế: `agent-auto/docs/specs/2026-08-13-radar-auto-design.md`.
- `bugwatch` → **radar buglist hậu bàn giao**, KHÔNG hỏi gì, không quét Jira. Chi tiết luật +
  bằng chứng đo: mục "Bug-radar" bên dưới và `docs/specs/2026-08-17-bug-radar-design.md`.
- `bugwrite` → xả hàng đợi `pendingSheetWrite` lên sheet (cần Chrome ⇒ chỉ chạy được ở phiên
  CLI tương tác). Mode mặc định tự làm việc này ở Bước 0, nên hiếm khi phải gõ tay.
- `wrap` → chốt ngày: đọc board + diff repo đã đụng → tổng kết ✅/⚠️/🕐 → soạn đoạn standup
  (paste được vào chat team) → **ghi metrics** (xem Vòng học) → cập nhật dashboard lần cuối →
  nhắc mục "Cần bạn" còn mở. KHÔNG quét Jira lại, KHÔNG code thêm.
- `link <KEY> [<repo> <path>]` → gắn ticket với folder làm việc. Có repo+path → ghi thẳng vào
  `state.issues[KEY].paths` (append, không trùng) + `pathsConfirmed: true`. Chỉ có KEY → chạy
  luồng đoán (mục "Nối git ↔ ticket") rồi trình ứng viên cho user chọn.
- `status` → đọc board hôm nay + state rồi tóm tắt. Không quét Jira.
- `doctor` → chạy `node tools/state-doctor.mjs` (tool CHỈ ĐỌC, không tự sửa file). Đọc report
  ERROR/WARN rồi TỰ SỬA cái sửa được bằng tay (ngày sai định dạng nếu suy được từ ticket, key
  ghi chú đặt sai chỗ — vd key mốc đặt ngoài object `milestones`) rồi chạy lại doctor để chứng
  minh sạch; cái không tự sửa được (thiếu bằng chứng, mập mờ) thì báo user kèm đúng mã luật
  (E1-E7/W1-W5). KHÔNG quét Jira, KHÔNG code.

## Bước 0 — Config & state

Đọc `config.json` + `state.json` (thiếu state → tạo `{"lastRun":null,"issues":{}}`).
`jqlConfirmed: false` → sau quét, xác nhận JQL với user 1 lần rồi set `true`.
**Xả hàng đợi ghi sheet** (chỉ phiên CLI tương tác, mode mặc định): có
`state.bugWatch[*].pendingSheetWrite` không rỗng → ghi lên sheet qua Chrome rồi dọn hàng đợi.
Phiên nền không làm được việc này (không có toolset chrome) nên đừng thử.

**Pull gt-promotion đầu phiên** (mode mặc định/plan/delta): `git -C <root> pull --ff-only`
timeout 60s — fail/timeout → báo 1 dòng + đi tiếp (không chặn). Commit mới đụng folder
`<game>/<slug>-<nexusId>/` của task đang theo dõi → dòng "📦 promotion vừa cập nhật <task>"
+ tóm tắt file đổi.

## Bước 1 — Quét Jira

ToolSearch nạp `searchJiraIssuesUsingJql`, `getJiraIssue`; chạy JQL trong config; quét buglist
trong comment; ghi snapshot tháng cho tab "Theo tháng". Công thức JQL đầy đủ, cách gọi connector,
và luật đo `done` (KHÔNG lọc theo `resolutiondate` — nhiều ticket `COMPLETED` không có field này):
`references/jql.md`.

Rút gọn: so `updated` với state → nhãn MỚI/ĐỔI/CÒN DỞ; comment mới có link
`docs.google.com/spreadsheets` → `state.issues[key].bugSheets` (tên field CỐ ĐỊNH, console đọc
field này) + phase → `bugfix`.

**Bóc link buglist ở CẢ ticket đã Done** (nhánh `jqlRecentDone`): ticket Done vẫn phải soi
`description` + `comment` tìm link sheet rồi nạp vào `state.bugWatch` — đây là lúc QC bàn giao
xong mới dán link. Thấy Done là gạt sang `closed` rồi thôi = mù đúng chỗ bug-radar sinh ra để
canh. Xem mục "Bug-radar". Lỗi auth connector → DỪNG SỚM, báo user bật connector Atlassian.
**Key biến mất khỏi query không tự động = `closed`** — xem luật phân biệt `reassigned`/`closed`
ở mục Vòng đời task trên.

## Bước 2 — Đọc sâu từng ticket (chỉ MỚI/ĐỔI/CÒN DỞ cần xử lý)

`getJiraIssue` (kèm `comment`, format markdown) → ghi/cập nhật `tasks/<KEY>/brief.md`:
tóm tắt việc, timeline milestones, link design, link nexus (bóc nexusId), link buglist.

- **NẤC 0 — LINK DESIGN NẰM SẴN TRONG TICKET (nguồn SỐ 1, đọc TRƯỚC MỌI THỨ)** ⚠ lỗ hổng đã
  trả giá 31/7: skill chỉ đi `sharepoint_search` theo tên event tiếng Anh trong `summary` nên
  báo GW-477 "chưa xác nhận design" trong khi description có sẵn dòng `**DESIGN:** <link>` —
  user phản ứng đúng ("tôi check chỗ này có design rồi"). Luật:
  - Quét `description` + mọi `comment` tìm link design: dòng có nhãn `DESIGN`/`Design:`/`PSD`/
    `Link design`, hoặc bất kỳ URL thuộc `*.sharepoint.com`, `drive.google.com`,
    `*.canva.com`, `*.figma.com`, `app.box.com` (kể cả bọc trong
    `<custom data-type="smartlink">` — bóc URL bên trong). Ghi `state.issues[KEY].designLink`
    + vào brief.
  - **NẤC 0b — SUBTASK "Design" (bằng chứng ĐỘC LẬP với link, rẻ, không bao giờ bỏ qua)**
    ⚠ lỗ hổng đã trả giá 10/8: GW-627 có subtask GW-628 "Design" (issuetype `Design sub-task`)
    status **Done** — designer đã chốt xong trên Jira — mà luồng chỉ soi description/comment;
    nếu hôm đó link không moi ra được thì đã ghi "chưa-có-link" sai. Luật: mọi lượt đọc ticket
    lấy thêm field `subtasks` (có sẵn trong getJiraIssue, không tốn call riêng); subtask
    issuetype `Design sub-task` hoặc summary `Design`:
    - status **Done** ⇒ design ĐÃ GIAO — kể cả khi chưa tìm ra link. Có link → mức theo link;
      KHÔNG có link → mức `đã-giao-chờ-link` + 1 dòng "Cần bạn: hỏi PM/designer link". CẤM rơi
      về `chưa-có-link`.
    - status chưa Done ⇒ khớp `waiting-design` (verify 10/8: GW-525 subtask GW-543 To Do =
      đúng là chưa giao; GW-627/GW-477/GW-610 subtask Done = đều đã giao thật).
    - Ghi bằng chứng vào `state.issues[KEY].design.subtask` = `{key, status, checkedAt}`.
  - **Có link DESIGN trong ticket HOẶC subtask Design Done = design ĐÃ GIAO theo ticket.**
    Cấm ghi "chưa xác nhận design" khi có 1 trong 2 — chỉ được ghi 1 trong 5 mức:
    `đã-giao-đã-tải` (coverage exit 0) ·
    `đã-giao-tải-một-phần` (có file local nhưng coverage exit 1 — BẮT BUỘC dùng mức này thay vì
    làm tròn lên "đã-tải"; kèm `design.coverage` + `design.deferred` + 1 dòng "Cần bạn") ·
    `đã-giao-chưa-tải` (có link, tải chưa xong → nêu rõ vướng gì + việc cần user) ·
    `đã-giao-chờ-link` (subtask Design Done mà chưa moi ra link → hỏi PM, không dò mù) ·
    `chưa-có-link` (KHÔNG link + KHÔNG subtask Done — mới được dùng search + kết luận "chưa
    xác nhận"). Phase `ready` vẫn giữ luật cứng: chỉ set khi có ảnh thật trong `designs/<KEY>/`.
    5 mức này phải khớp `schema/vocab.json` mục `designStatus` (console + state-doctor E4/E8
    đọc từ đó); thêm/đổi mức thì sửa vocab TRƯỚC.
  - Có link rồi thì **KHÔNG cần `sharepoint_search`** để "xác nhận có design" nữa — search chỉ
    còn 2 việc: lấy `lastModifiedDateTime` (so mốc Design / phát hiện bản mới) và tìm design
    khi ticket KHÔNG có link. Search trắng KHÔNG BAO GIỜ là bằng chứng "chưa có design"
    (verify 31/7: folder share qua link của designer không index cho account mình — search
    "LDP Giải đấu", "Offline Tournament CFL", cả `folderName` = tên folder thật đều trắng,
    trong khi folder tồn tại và mở được bình thường).
- Chi tiết dò/tải design qua SharePoint (và các nguồn khác — Google Drive, Dropbox, Box, Canva/
  Figma): công thức `download.aspx?SourceUrl=`, script pipeline `scripts/sp-*`, danh sách cách
  KHÔNG ăn (đã thử, đừng lặp lại) → `references/sharepoint.md`.
- Canva/Figma → ghi link + 📎 cần mở tay. KHÔNG chặn luồng, KHÔNG đoán design.
- Ticket có mốc Design CHƯA TỚI và **không có link DESIGN trong ticket** → phase `waiting-design`,
  KHÔNG vào kế hoạch chạy; lần /daily đầu tiên SAU mốc phải tự nhắc + dò lại.
- **Ticket CÓ link DESIGN mà chưa tải được** (`design.status = đã-giao-chưa-tải`): phase vẫn
  `waiting-design` (luật ảnh-local mới cho `ready` không đổi) NHƯNG:
  - Bảng duyệt + board phải ghi "**design đã giao** — cần bạn bấm Download (1 thao tác)", TUYỆT
    ĐỐI không ghi "chưa có design"/"chưa xác nhận design" (user thấy design trong tay mà skill
    nói chưa có = mất tin, đã xảy ra 31/7 với GW-477).
  - KHÔNG cảnh báo "quá mốc Design" cho ticket này — mốc đã được đáp ứng, chỉ khâu tải là của mình.
  - Gom mọi ticket dạng này thành **1 khối "Cần bạn: bấm Download"** ở cuối báo cáo, mỗi ticket 1
    dòng + tab đã mở sẵn; đừng rải xen giữa báo cáo.
- Ticket quá mơ hồ → rổ **cần-user-quyết**, không suy diễn.

## Bước 2b — Nối git ↔ ticket (nền tảng của phase thật + metrics)

Mỗi ticket cần biết nó "sống" ở folder nào: `state.issues[KEY].paths` = `[{repo, path}]` +
`pathsConfirmed`. Đã `pathsConfirmed: true` → bỏ qua, không đoán lại. Cách đoán (neo nexusId,
fuzzy cdn-source), bảng suy phase từ commit, và cách đếm metrics (`--numstat`, whitelist đuôi
file code viết tay): `references/nexus.md`.

**Git chỉ NÂNG phase, không HẠ** — một commit sửa vặt sau khi giao QC không được làm task nhảy
lùi (phase hiện tại ∈ {wait-test, bugfix, done-fe} thì không tụt về `coding` dù có commit mới).

## Bước 3 — Phân loại + trình kế hoạch (DUYỆT 1 LẦN)

Đường ray theo bảng routing global: dựng UI mới từ design → `/code-developer full`; sửa UI
khớp design → `fix`; feature không ảnh → `code`; nhiều task nhỏ cùng repo → `batch`;
buglist → soạn lệnh `/bug-fixer-lite` (CLI); sửa vặt ≤2 file → tự làm; mơ hồ → cần-user-quyết.

**Trước khi giao `/code-developer`, đọc `state.issues[KEY].design.gaps`:**
- chưa có `gaps` (chưa soát lần nào) → chạy skill `check-design <KEY>` trước;
- `gaps.counts.missing > 0` → thêm 1 dòng ⚠ vào bảng duyệt: "design còn thiếu N hạng mục:
  `<missingTop>`" và đề xuất dựng phần đủ trước.
**Cảnh báo, KHÔNG chặn** — quyền quyết vẫn của user (`state-doctor` W6 cũng chỉ warn).

**Task dựng MỚI (chưa có entry cdn-source trong `paths`) + design đã local → thêm cột
`Khung nguồn` vào bảng duyệt:**
- **Suy `<game>` (folder trong `products/`) theo thứ tự bằng chứng — CẤM đoán từ tag suông:**
  0. **Tra `config.gameMap` trước** (`{"496":"ddtank","A49":"cfl",...}` — mã số/mã chữ dự án
     → folder products). Trúng → nhận luôn. Đây là bộ nhớ "hỏi 1 lần nhớ mãi": mọi lần
     game được confirm (qua duyệt/paths) → GHI NGƯỢC vào gameMap.
  1. Ticket có `paths` gt-promotion (neo nexusId Bước 2b) → token game trong tên folder cha
     (`A49-CFL` → `cfl`) khớp `ls products/` → nhận. Bằng chứng thật: GW-660 tag ghi `[CFM]`
     nhưng folder thật là `products/cfl/` — tag ticket KHÔNG đáng tin bằng gt-promotion.
     ⚠ Token có thể vẫn trượt (verify 31/7: `496_GNOTH` → `gnoth` KHÔNG có trong products/,
     folder thật `ddtank`) → trượt thì đừng cố, xuống nấc dưới; **mã số** (`496`) mới ổn
     định, tên chữ thì không.
  2. Chưa có → tag game trong summary (`[CFL]`) lowercase khớp `ls products/`; khớp đúng 1
     folder → nhận.
  3. Chưa ra → tra `paths` các ticket CÙNG MÃ SỐ dự án (`[496]`, `[A49]` — token đầu trong
     summary, ổn định hơn tên game) trong state/history → lấy game folder ticket đó đã confirm.
  4. Vẫn không chắc / nhiều ứng viên → vẫn đề xuất ứng viên tốt nhất nhưng GHI RÕ "❓ game
     đoán" trong bảng duyệt để user sửa — KHÔNG thêm cổng hỏi.
  Mọi nấc ra kết quả được confirm → cập nhật `config.gameMap` (khỏi suy lại lần sau).
- **Đích** = `products/<game>/landing/<slug>` (kênh mặc định `landing/` cho task landing/H5;
  task mainsite → `mainsite/`). LUẬT CỨNG: folder `products/<game>/` phải TỒN TẠI sẵn —
  không bao giờ tự tạo game mới, chỉ tạo folder campaign bên trong; đích hiển thị ĐẦY ĐỦ
  trong bảng duyệt để user thấy path trước khi chạy.
- `Khung nguồn` = `clone <campaign gần nhất cùng game>` (folder `products/<game>/landing/*`
  có commit mới nhất: `git log -1 --format=%ct -- <folder>`, lấy max).
- Kèm **slug đích** đề xuất `<năm>-<tên-event-bỏ-dấu>` — slug thật hay LỆCH tên ticket,
  user đổi ngay trong lượt duyệt (KHÔNG thêm cổng hỏi).
- KHÔNG đụng tool scaffoldPSD/cắt ảnh từ PSD (quyết định user 2026-07-31) — chỉ clone khung
  + dựng UI từ ảnh trong `designs/<KEY>/`; ảnh thật user tự cắt.

Trình MỘT bảng: `Ticket · Phase · Việc · Đường ray · Repo · Mốc gần nhất · Thứ tự`.
Ước lượng tham khảo `knowledge/metrics.jsonl` (task cùng loại trước đó chạy bao lâu).
Hỏi duyệt bằng AskUserQuestion — **cổng hỏi DUY NHẤT**; sau đó chỉ hỏi lại khi kẹt thật.
Mode `plan`/`week` dừng tại đây.

## Bước 4 — Thực thi

- Khởi tạo/cập nhật board TRƯỚC task đầu tiên.
- Theo thứ tự duyệt: cùng repo → 1 lượt `batch`; khác repo → lần lượt (song song thật nằm
  trong agent nội bộ của code-developer). KHÔNG chạy 2 lượt skill chồng nhau cùng repo.
- Gọi `/code-developer <mode>` qua tool Skill, args = `tasks/<KEY>/brief.md` + design + repo đích.
- **Task có `Khung nguồn` đã duyệt:** args code-developer full thêm dòng
  `Scaffold: clone · nguồn <abs path campaign nguồn> · đích <repos.cdn-source>/products/<game>/landing/<slug>`.
  Scaffold xong (folder đích
  tồn tại) → ghi `state.issues[KEY].paths` += entry cdn-source + `pathsConfirmed: true`;
  board chép danh sách "ảnh chờ user xử lý tay" từ report code-developer. Phase giữ `coding`;
  user thả ảnh thật vào `assets/*/images/` xong → lần /daily sau thấy images đổi
  (git status/mtime) → đề xuất `/code-developer fix` khớp asset thật.
- **Phase deliver** (task có kênh promotion, code đã verify): chép output HTML/asset vào
  `<gt-promotion>/<game>/<slug>-<nexusId>/mainsite/` → liệt kê file đã chép vào board →
  nhắc user review + TỰ push (KHÔNG tự commit/push). Trước khi chép: bản trên git MỚI HƠN
  local (promotion vừa sửa) → báo diff, hỏi user hướng merge (đây là ca "kẹt thật" được phép hỏi).
- Buglist: soạn lệnh `claude "/bug-fixer-lite <sheet> <project>"` vào board + báo cáo.
  Phiên hiện tại là CLI có toolset chrome → được hỏi chạy luôn không (trong lượt duyệt).
- Task fail → ⚠️ + lý do, chạy tiếp task khác. Verify thật mới được ✅.

## Bước 5 — Board + dashboard (cập nhật NGAY mỗi chuyển trạng thái)

Board `boards/YYYY-MM-DD.md`: bảng `# · Ticket · Phase · Việc · Đường ray · Trạng thái · Nơi sửa · Verify`
+ `## Log` (`HH:MM — sự kiện`) + `## Cần bạn` (mục tiêu 0 dòng).
Trạng thái: 📋 chờ · ⏳ chạy · ✅ xong-có-verify · ⚠️ kẹt · 🕐 chờ ngoài mình.

⚠ **GIỜ TRONG LOG PHẢI LÀ GIỜ THẬT.** Trước khi ghi mỗi dòng log, lấy giờ bằng `date +%H:%M`
rồi ghi số đó. **CẤM ghi literal `HH:MM`** — đã sai 3 board liền (30/7, 31/7, 1/8: 10 dòng log
đều `HH:MM —`), làm mất trục thời gian nên không tính được lead time cho vòng học. Console tô
vàng mọi dòng còn `HH:MM` + đếm số dòng thiếu giờ, nên lỗi này không còn im lặng được.

**Ghi 2 file vòng học (mỗi lượt chạy, KHÔNG chờ `wrap`):**
- `history/issues.jsonl` — mỗi lượt quét Jira append 1 dòng/ticket:
  `{"at":"<ISO giờ thật>","key","summary","phase","status","duedate","milestones"}`.
- `history/phases.jsonl` — CHỈ khi phase 1 ticket đổi so với `state.json` cũ:
  `{"at":"<ISO giờ thật>","key","from","to","reason":"<vì sao đổi: commit mới / design về / giao HTML>"}`.
  Console cũng tự ghi dòng này khi quan sát thấy phase đổi (`reason: "console-observed"`), nhưng
  dòng của skill có `reason` thật nên giá trị hơn — cứ ghi, dedupe theo `to` gần nhất.

**Daily Console** (web local, nếu user đang mở): console tự đọc `state.json` + board +
`history/issues.jsonl` + git mỗi 3 giây — **KHÔNG cần làm gì thêm**, chỉ cần ghi đúng các file
trên là console hiện đủ. Console chạy: `cd AGENT_AUTO/console && npm start` (port 4747).
Console có quyền GHI vào đúng 3 chỗ (biết để không tưởng là user sửa tay): tick `## Cần bạn`
của board hôm nay, `knowledge/metrics.jsonl`, `history/phases.jsonl`. Mọi chỗ khác chỉ đọc.

Dashboard `dashboard.html` (artifact, dùng khi cần share/xem ngoài máy): layout/style CÓ SẴN — **chỉ thay khối `/* ===== DATA ===== */`**
(object `BOARD`: date, week[], tasks[], todos[]). Trường task: `key,url,title,lane,repo,due,
dueLabel,phase,status(planned|running|done|blocked|waiting),note`. Publish tool Artifact cùng
file path + favicon 🗓️ + `url` = `config.dashboardUrl` (giữ 1 URL). Headless không có Artifact → bỏ qua.

## Bug-radar — theo dõi buglist sau khi đã bàn giao

Task code xong → Done → bàn giao Promotion/GS → QC dán **link buglist** vào ticket. Từ đó
ticket rơi khỏi JQL chính (`statusCategory != Done`) nên không ai soi nữa. Bug-radar bịt chỗ đó.

**Tín hiệu vào watchlist là LINK BUGLIST, không phải trạng thái ticket.** QC hay dán link
trước khi mình kịp đánh Done ⇒ quét cả ticket Done lẫn chưa Done. Nguồn ticket Done tái dùng
`config.jqlRecentDone` (đã có sẵn, 45 ngày) — KHÔNG đẻ query mới.

**Nạp watchlist bằng ĐÚNG 1 CALL — để JQL lọc hộ, đừng đọc từng ticket:**

```
assignee = currentUser() AND updated >= -45d
  AND (description ~ "docs.google.com/spreadsheets" OR comment ~ "docs.google.com/spreadsheets")
```

⚠ **CẤM gọi `getJiraIssue` từng ticket để tìm link.** Đã trả giá 17/8: lượt bugwatch đầu tiên
đi đường đó, chạy **22 phút, tốn $2.63 rồi bị giết** mà chưa ghi được gì. Query trên lọc thẳng
trên server: 23 ticket Done → chỉ **6 ticket** thật sự có link, một call là xong. Chỉ ticket
nào khớp bằng `comment` mà description không có link mới cần lấy comment riêng.

Lượt đầu (`config.bugRadar.backfilledAt` = null) chạy query trên cho toàn bộ 45 ngày rồi ghi
`backfilledAt`; các lượt sau `delta` tự bắt vì QC dán link là `updated` của ticket đổi.
**Ghi `state.bugWatch` NGAY sau mỗi ticket bóc được**, đừng gom tới cuối — lượt này có thể bị
timeout (`radar.timeoutMinBugwatch`, mặc định 15'), gom tới cuối là mất sạch và lượt sau làm
lại từ đầu, không bao giờ tiến.

**KÊNH 2 — dò thẳng từ Drive (BẮT BUỘC, không phải phương án dự phòng).** ⚠ Đo 17/8: sheet
`BugList GNOTH: Chengdu Tournament Web` đang được QC sửa **trong ngày**, thuộc **GW-610** (task
của mình, đã Done) — mà ticket đó `updated` từ 29/7 và **không có link buglist nào trong ticket**.
QC chỉ share qua Drive. Chỉ đi theo link trong Jira là mù đúng cái sheet đang nóng nhất.
Luật: mỗi lượt, trong chính call `list_recent_files` đã dùng để poll, nhận thêm file
`mimeType = spreadsheet` có tiêu đề bắt đầu bằng `BugList`/`Bug List` → nạp vào watchlist, rồi
ghép về ticket bằng `matchSheetToTicket(title, tickets)` (khớp token tên, ngưỡng 0.5 — đã khớp
đúng GW-610/GW-660/GW-679 trên dữ liệu thật). Không ghép được ticket nào → vẫn theo dõi nhưng
`keys` rỗng, `state-doctor` W8 nhắc; KHÔNG tự fix vì cổng G1/G2 không kiểm được.

⚠ **Link trong ticket KHÔNG chắc là buglist.** Đo 17/8: 2/5 link `docs.google.com/spreadsheets`
là **file brief** ("Brief chi tiết" — GW-629, GW-723), không phải buglist. Sau lần đọc nội dung
đầu tiên, `scan` trả `isBugSheet: false` (không có cột `BugID`) ⇒ ghi `notBugSheet: true` vào
entry và **thôi theo dõi sheet đó**. Đừng lọc bằng cách đoán nhãn quanh link — nhãn viết kiểu gì
cũng có, chỉ nội dung sheet mới là bằng chứng.

**Chỉ theo dõi task CHƯA qua release.** Đầu mỗi lượt, `shouldRetire(entry, state.issues)` —
mốc MUỘN NHẤT trong `milestones` của mọi ticket gắn sheet đã qua (so theo ngày, **đúng ngày
release vẫn còn theo dõi** vì bug hay về đúng hôm đó) ⇒ ghi `retired: true` + `retiredAt`,
bỏ khỏi vòng poll, không đọc lại. Việc đã bàn giao xong hẳn thì thôi canh.
Không biết mốc (ticket không có trong `state.issues`, hoặc `milestones` trống) ⇒ **cứ theo dõi
tiếp**, không tự ý bỏ — thiếu dữ liệu không phải bằng chứng đã xong.

Mỗi lượt `bugwatch`:

1. `list_recent_files(orderBy:lastModified)` — **1 call** lấy `modifiedTime` mọi sheet đang
   theo dõi. Sheet không nằm trang đầu → `get_file_metadata` bù.
2. `modifiedTime` không đổi ⇒ DỪNG ở đây, không đọc nội dung. Đây là chỗ giữ chi phí.
3. Đổi ⇒ `read_file_content(sheetId)` → ghi **nguyên văn khối bảng có cột BugID** vào
   `.cache/bugsheets/<sheetId>.md` (chỉ dòng bắt đầu bằng `|`, không rút gọn).
   ⚠ **Tối đa `bugRadar.maxSheetReadsPerTick` sheet MỚI mỗi lượt** (mặc định 3), ưu tiên sheet
   `modifiedTime` mới nhất; phần còn lại để lượt sau. Đo 17/8: một lần đọc sheet mất ~90s, nên
   lượt đầu phải đọc cả 5 sheet là chắc chắn vượt timeout. Có trần thì mọi lượt đều về đích và
   watchlist đầy dần qua vài lượt — vẫn không cần user làm gì.
4. `node tools/bug-radar.mjs scan <sheetId>` — **máy phán, không phải LLM**: parse, so
   `seenBugs`, lọc bug đã xong, chia rổ. Đọc `toSkill` để biết có việc thật không.
5. `toSkill > 0` → kiểm 4 cổng sở hữu (dưới). Đủ 4 → gọi `bug-fixer-lite`. Rớt → ghi
   `## Cần bạn` + notify, KHÔNG đụng code.
6. Xong lượt fix → `node tools/bug-radar.mjs commit <sheetId>` ghi `seenBugs`. **Chỉ commit
   SAU khi fix xong** — nổ giữa chừng thì lượt sau làm lại, thà lặp còn hơn nuốt mất bug.
7. Ticket liên quan → `phase = bugfix` (kèm `reopenedFrom` nếu trước đó `closed`/`done-fe`).

**Bốn cổng sở hữu** (`checkGates`) — chỉ tự fix khi PASS đủ 4:
`G1` assignee còn là mình · `G2` `paths` + `pathsConfirmed` · `G3` sheet đọc được ·
`G4` `toSkill > 0`.

⚠ **G4 đếm `toSkill` = mine + unknown, KHÔNG phải mine.** Đo trên sheet thật GNOTH 17/8:
**19/23 dòng bỏ trống cột `Bug Type`** — lọc theo type thì mineCount = 0 và radar chặn nhầm
sạch. Radar chỉ prefilter LỎNG, quyền phán cuối cùng thuộc `bug-fixer-lite` với ma trận đầy đủ.

⚠ **Schema sheet KHÔNG cố định giữa các game.** CFL dùng `Assignee Fix`/`Notes`/`QC / GS
Recheck`; GNOTH dùng `Assignee`/`Frame`/`Evidence`/`QC / GS Check`. Map cột theo **TÊN
header**, cấm theo vị trí. Gặp header lạ → thêm vào `COLUMNS` trong `tools/bug-radar.mjs` +
test, đừng chữa bằng cách đoán ở tầng skill.

⚠ **Lượt đầu trên sheet cũ KHÔNG được nã cả sheet vào fix.** Hai lưới, phải có ĐỦ CẢ HAI:

1. `isSettled` loại bug đã `Dev Check Status=Done`, hoặc QC ghi `Confirmed fix`, hoặc
   `Skip`/`N/A` — trừ khi recheck báo `Failed`. Đo thật: 22/23 bug sheet GNOTH đã xong.
2. `firstScanMode(entry)` — `seenBugs` còn rỗng VÀ sheet sửa lần cuối quá
   `bugRadar.freshFirstScanHours` (24h) ⇒ trả `seed`: **chỉ chạy `commit` để gieo nền rồi
   dừng**, không gọi `bug-fixer-lite`, báo 1 dòng "đã nạp N bug làm nền, từ giờ chỉ theo dõi
   thay đổi". Sheet QC vừa động trong 24h qua ⇒ `act`, xử lý ngay.

   Vì sao cần lưới 2: đo 17/8 trên GW-679, sheet để **rỗng cả header `DEV Check Status`** nên
   `isSettled` không cứu được dòng nào — 12 bug đã fix từ tháng 7 vẫn đứng nguyên trạng thái
   trắng. Chỉ cần ai chạy `/daily link GW-679` cho qua cổng G2 là radar nã cả 12 bug đó vào
   `bug-fixer-lite`. Một mình `isSettled` KHÔNG đủ.

**Ghi ngược sheet phải xếp hàng — ràng buộc đã đo 17/8:** phiên nền (`claude -p`) KHÔNG có
toolset `claude-in-chrome` (`No matching deferred tools found`), trong khi Drive thì có
(`DRIVE=OK`). Nên radar fix được code nhưng KHÔNG ghi được `DEV Check Status`. Kết quả cần ghi
vào `bugWatch[sheetId].pendingSheetWrite`, board ghi `🕐 chờ ghi sheet: N dòng`, phiên `/daily`
tương tác kế tiếp tự xả ở Bước 0.

## Vòng học (metrics)

`wrap` ghi vào `knowledge/metrics.jsonl` mỗi task chạm ✅/⚠️ hôm đó:
`{"date","key","type","lane","estimate","actualMachine","actualWait","fixRounds","issues":[]}`
(⏱ machine vs wait tách riêng — đúng luật global). KHÔNG ghi trùng key+date. `plan` đọc để
ước lượng; thấy pattern lỗi lặp (≥2 lần cùng issue) → nhắc trong kế hoạch + gợi ý user cho
code-developer `learn`.

**LUẬT NÂNG BÀI HỌC (đừng chôn bài học trong state):** phát hiện được một cái bẫy có thể lặp ở
ticket khác thì ghi vào `state.issues[KEY]` là **CHƯA ĐỦ** — state của 1 ticket là chỗ không ai
đọc lại. Bắt buộc nâng lên đúng 1 trong 3 nơi theo thứ tự ưu tiên:
1. **Script trong `scripts/`** — nếu bẫy đó kiểm được bằng máy (đây là cách bền nhất: lưới chặn
   chạy được, không phụ thuộc trí nhớ).
2. **`SKILL.md`** — nếu nó đổi QUY TRÌNH (thêm bước, đổi tiêu chí, bỏ đường đã chết).
3. **`knowledge/lessons.md`** — mô tả: bắt được gì · nguyên nhân · lưới chặn · nguồn.
Bằng chứng cho luật này: bài học "REST `/Files` không đệ quy subfolder" ghi 31/7 vào
`state.issues['GW-477'].design.secondPass`, **3 ngày sau tái phạm nguyên xi ở GW-556** và lần này
mất 48/56 file. Bài học ở sai chỗ = chưa ghi.

## Bước 6 — Chốt buổi (mode mặc định)

1. Cập nhật `state.json`: per key `{lastSeenUpdated, status, phase, milestones, lastAction, note, design?, paths?, bugSheets?}` + `lastRun` + `schemaVersion: 2` (`design` = marker tải design Bước 2; `paths` = từ Bước 2b/scaffold).
   **Trước khi ghi đè state**: copy bản cũ sang `.backups/state/state-<YYYYMMDD-HHMMSS>.json` (giữ
   30 bản mới nhất). agent-auto chưa versioned → ghi sai state là mất, không revert được.
   Đọc state mà thiếu field bắt buộc (`issues`) → **báo trong board, KHÔNG ghi tiếp lên state hỏng**.
2. Báo cáo TIẾNG VIỆT: ⏰ cảnh báo trễ mốc trước → ✅ xong (kèm verify) → ⚠️ kẹt →
   📦 động tĩnh promotion → 📋 việc user (review diff, push tay, cập nhật Jira tay, lệnh
   bug-fixer-lite chờ dán) → link dashboard + board → ⏱ máy chạy vs chờ user.

## Luật an toàn (không thương lượng)

- KHÔNG `git commit`/`push` (kể cả gt-promotion — chép file xong để user push). KHÔNG ghi gì lên Jira.
- Claim "xong" phải có lệnh + output thật. Chưa verify → nói "chưa verify".
- Tối đa 2 cổng hỏi: (a) duyệt kế hoạch, (b) first-run JQL. Ngoại lệ được hỏi: xung đột
  merge gt-promotion, thiếu input không đoán được. Ca mập mờ khác → default an toàn + ghi board.
- `delta`/`status`/`wrap` không bao giờ hỏi.
