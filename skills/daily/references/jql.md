# Tra cứu: JQL + connector Atlassian

Cắt nguyên văn từ `SKILL.md` (gọn hoá lần nâng cấp 2026-08-03) — nội dung công thức JQL, cách
gọi connector Atlassian, cách xử lý key rớt khỏi query. `SKILL.md` giữ lại luật nghiệp vụ (vd
"key biến mất khỏi JQL không tự động = Done" — có thể là `reassigned`), chi tiết công thức nằm
ở đây.

## Bước 1 — Quét Jira

> ⚠ **Quét 2 JQL, không phải 1.** Ngoài `config.jql` (việc chưa Done), luôn chạy thêm
> `config.jqlRecentDone` = `assignee = currentUser() AND statusCategory = Done AND updated >= -45d`.
> Lý do: PM hay đóng ticket ngay ở mốc HTML trong khi mốc **link test / release còn phía sau** —
> ticket rơi khỏi JQL chính nhưng việc vẫn của mình. Ticket ở nhánh Done chỉ được bỏ khỏi radar
> khi **mốc muộn nhất trong `milestones` đã qua**; còn mốc chưa tới thì giữ phase thật
> (`wait-test`/`bugfix`), KHÔNG ghi `closed` — `closed` = việc của mình hết thật, không phải =
> Jira đóng. Dấu hiệu nhận ra sớm: có sub-task `[QC-Test]` đang In Progress, hoặc description
> còn mốc lớn hơn `duedate`.
> Đã trả giá: GW-610 đóng 29/7, việc chạy tới 5/8, mốc test 7/8 + release 20/8 — 8 ngày ngoài
> radar (`knowledge/lessons.md#ticket-dong-o-moc-html-van-con-moc-test-release-phia-sau`).

1. ToolSearch nạp `searchJiraIssuesUsingJql`, `getJiraIssue`. Lỗi auth → DỪNG SỚM, báo user
   bật connector Atlassian trong claude.ai settings.
2. Chạy JQL trong config → so `updated` với state → nhãn MỚI / ĐỔI / CÒN DỞ.
   Key biến mất khỏi query → `phase: closed`. Task CÒN DỞ phase ngoài mình (wait-test 🕐)
   → chỉ liệt kê 1 dòng, không xử lý lại.
3. **Quét buglist**: ticket ĐỔI có comment mới chứa link `docs.google.com/spreadsheets`
   → ghi `state.issues[key].bugSheets = ["<url>"]` (tên field CỐ ĐỊNH — console đọc field này để
   hiện nút gõ hộ `/bug-fixer-lite`), phase → `bugfix`. Game có trong `config.bugSheets` → nhắc
   "sheet cố định của <game>: có đợt bug mới không?" trong kế hoạch (không tự đoán).
4. **Snapshot theo tháng** (bắt buộc — nguồn tab "Theo tháng" của console): query THÊM 1 lần
   `assignee = currentUser() AND duedate >= "<đầu tháng, lùi 6 tháng>" AND duedate <= "<cuối tháng sau>"`
   với `fields: summary,status,duedate,resolutiondate` — **MỌI status, không lọc statusCategory**.
   Ghi ĐÈ `history/months.json`:
   ```json
   { "generatedAt":"YYYY-MM-DD", "source":"jira", "jql":"<jql đã dùng>",
     "months": { "2026-07": [ {"key","summary","status","done":true|false,"duedate","resolved"} ] } }
   ```
   - Nhóm theo **THÁNG CỦA `duedate`** (mốc kế hoạch), KHÔNG theo ngày đánh Done — team hay
     chuyển Done trễ vài tuần nên gom theo resolutiondate sẽ nhảy sai tháng.
   - `done` = `statusCategory.key === 'done'` (bao trùm cả `Done` và `COMPLETED`).
     ⚠ TUYỆT ĐỐI KHÔNG lọc `resolutiondate` để tìm task đã xong — nhiều ticket status
     `COMPLETED` KHÔNG có `resolutiondate`, lọc kiểu đó là hụt gần hết (đã trả giá 1 lần: chỉ
     thấy 2/58 ticket).
   - Ticket không có duedate → bỏ khỏi snapshot (không đoán tháng).
   - Kết quả quá lớn cho 1 lần đọc → thu hẹp `fields` hoặc chia 2 khoảng 4-5 tháng.

## Mode `delta` — JQL nhẹ

`delta` → radar nhẹ, KHÔNG hỏi gì, chạy <1 phút: (1) JQL `assignee = currentUser() AND updated >= -4h`;
(2) `git -C <gt-promotion> pull` + `git log --since` xem commit mới có đụng folder task đang theo dõi;
(3) bóc link sheet mới trong comment → `state.issues[key].bugSheets`;
(4) **refresh `history/months.json` nếu `generatedAt` ≠ hôm nay** (1 query snapshot ở mục trên,
ghi đè + backup `.backups/months/`) — tab "Theo tháng" của console đọc thẳng file này, không suy
từ `state.json`, nên bỏ bước này là console vẽ sai trạng thái/mốc dù state đã đúng.
CHỈ báo thay đổi + cập nhật board/state. Không code.
