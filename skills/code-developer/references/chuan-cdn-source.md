# Chuẩn cdn-source — cách manager áp trong pipeline

Luật nằm ở `~/VNG/agent-auto/rules/` (R-CDN-*, R-POP-*, R-HO-*). File này chỉ nói **manager làm gì với chúng**.

## 1. Nhồi rules vào brief — không agent nào tự biết

| Giao ai | Dòng phải có trong brief |
|---|---|
| `frontend-developer` | `cdn-source-standard.md` + `popup-library.md` (+ `html-handoff.md` nếu có bàn giao) + `code-style.md` |
| `design-checker` | 3 file trên — chấm theo mã luật, mỗi lệch ghi `<mã> — file:line` |
| `design-analyst` | `popup-library.md` — spec phải liệt kê popup ↔ module có sẵn, và đoán loại promotion |
| Bất kỳ ai, khi chạm `pm__` | khối `Landing pm__:` (SKILL.md 🧱): file dự án + khoá + `pm-contract.md` (R-PM-1..12) + AI-GUIDE + cặp AI-RULES/MASTER đã khoá (hoặc ref khi `gameplay: none`) — xem §6 |

Trỏ **đường dẫn đầy đủ**, không copy nội dung luật vào brief (tốn token, dễ lệch bản).

## 2. Chốt thế hệ trước khi giao việc (R-CDN-1)

Manager tự xác định, ghi vào brief một dòng — đừng để mỗi agent tự đoán:

```
Thế hệ: assets-flat   (bằng chứng: assets/index.html.twig + config.folderUse)
Thế hệ: src-setup     (bằng chứng: src/<gameplay>/{js,scss,html} + src/setup/js/_promotion.js)
```

Dựng campaign mới → nguồn clone phải là assets-flat (R-CDN-2). Thấy task đòi clone campaign legacy →
đây là **điểm dừng hỏi user**, không tự quyết.

## 3. Cổng popup cuối luồng (R-POP-7)

Áp cho mọi mode có sinh/sửa code (trừ `design`, `check` thuần đọc):

1. Trang có gameplay promotion không? Cứ liệu: `prodTemplate` trong `configProduction.html.twig`, hook `pm__`,
   ticket Jira, design có popup nhận quà/điều kiện/lịch sử.
2. Chốt **loại promotion**: lấy từ ticket/spec. Không chắc → **AskUserQuestion đúng 1 câu** (skill
   `check-promotion` không tự đoán loại — người chốt loại là user).
3. Chạy `/check-promotion <loại> <file>`; dán bảng Pass/Fail vào Tổng kết.
4. Còn Fail → giao `frontend-developer` bổ sung popup theo `libraryMainsite-t-popup` (R-POP-1..3), không tự chế markup.
   Checklist đòi popup mà design không có → hỏi user/PM, ghi "Cần quyết định".

## 4. Mode `learn` — chỉ đề xuất, không ghi đè luật

`learn` quét code mới và cập nhật `~/.claude/knowledge/code-developer/base/`. Nó **KHÔNG** được sửa file trong
`~/VNG/agent-auto/rules/`. Thấy code thực tế lệch luật → in ra khối:

```
## Đề xuất sửa luật (user duyệt)
- R-CDN-<n>: luật nói <X>, code mới nhất làm <Y> — bằng chứng <file:line>. Đổi luật? (y/n)
```

Lý do: ảnh chụp code có thể chụp trúng campaign làm ẩu; để nó tự thành luật là cách chuẩn bị trôi mất.

## 5. Bàn giao HTML (R-HO-*)

Task có chữ "đưa lên gt-promotion", "apply mainsite", "giao platform" → brief phải kèm `html-handoff.md` và
nhắc 3 điểm chết người: URL CDN tuyệt đối · giữ `<% MODULE_CONTENT %>` ở bản `Promotion/` · soát **cả**
`Promotion/` lẫn `mainsite/`. Manager KHÔNG commit hộ user ở 2 repo đó — chỉ đưa `git diff --stat`.

## 6. Landing `pm__` — file dự án + khoá gameplay (R-PM-11)

Áp mọi mode có dựng · sửa · soát file `pm__`. `PN` = `node ~/VNG/agent-auto/tools/project-note.mjs`,
`PG` = `node ~/VNG/agent-auto/tools/pm-gate.mjs`. Landing **mới** = campaign dựng/clone trong lượt này
(chưa có ở HEAD); landing **cũ** = đã có commit.

| Lúc | Manager làm |
|---|---|
| Đầu task | `PN path <campaign\|file>` in đường dẫn; stderr `chưa có file` → `PN init <campaign> [--jira KEY]`; exit 1 = không map được (file ngoài cdn-source chưa có dòng handoff ở mục 2 note nào) → chạy `path` trên campaign cdn-source tương ứng. Đọc file dự án TRƯỚC khi đọc code — mục 2 nơi code/handoff, 3 sơ đồ file, 4 bản đồ hook thay cho việc đọc lại cả campaign. `PN check <campaign>` báo lỗi thời → `PN refresh <campaign>` trước khi giao việc. |
| Khoá | Mục 1 có `gameplay:` → dùng, không khoá lại. `CHƯA KHOÁ` → đọc brief/thể lệ → bảng route AI-GUIDE §2 → `luckydraw-gift-exchange` · `payment` · `none` + `type <STT-slug>` (bảng 39 loại của `/check-promotion`) + `ref <campaign mẫu cùng loại gần nhất>`. Không khớp route / không chọn được loại → AskUserQuestion. CẤM đoán gameplay từ hook trong file. Ghi `PN lock <campaign> --gameplay <g> [--type <t>] [--ref <dir>] [--hooks-at handoff\|source] --by <ai\|user>` TRƯỚC dòng code đầu. |
| Khoá `hooks-at` | Hook `pm__` gắn ở bước nào — mặc định `handoff` (gắn lúc sang gt-promotion): `PG` trên `dist/` cdn-source hạ `PG-REQ`/`PG-REF` xuống 🟡, file bàn giao gt-promotion mới chặn đủ (R-HO-7). Brief/user nói gắn hook ngay ở cdn-source → `--hooks-at source`. |
| Giao việc | Khối `Landing pm__:` vào MỌI brief — subagent không tự khoá, không đọc lại cả campaign. |
| Sau khi chạy được | **Landing mới** — pha tối ưu: dọn theo R-CS + chuẩn cdn-source (quy trình `/clean-code`: không đổi hành vi, không đụng hợp đồng) → build → `PG --page <campaign> --baseline none` → `layout-gate` → `/check-promotion`. **Landing cũ** — chỉ dọn trong file/section đang chạm; phần thấy mà không chạm + lỗi có sẵn của gate → mục 7 Nợ: `PG --page <campaign> --json > <scratch>/pg.json` rồi `PN debt <campaign> --from <scratch>/pg.json`. |
| Cuối task | Còn 🔴 = chưa xong. `PN refresh <campaign>` + sửa tay mục 5/6 nếu có quyết định/câu hỏi mới + `PN log <campaign> "<task> — <đổi gì>"`. Dán dòng cuối của `PG` vào Tổng kết. |
