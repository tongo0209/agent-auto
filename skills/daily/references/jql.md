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
   Key biến mất khỏi query → **KHÔNG mặc định là `closed`**: phân biệt `closed` vs `reassigned`
   theo luật ở `SKILL.md` mục "Vòng đời task (PHASE)". Task CÒN DỞ phase ngoài mình (wait-test 🕐)
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

## Fallback REST qua Chrome (khi connector Atlassian chết)

Thêm 17/9/2026 sau ca `CONNECT_TIMEOUT`: connector `claude.ai Atlassian` không nạp được tool, lượt
`delta` suýt báo "0 ticket đổi" trong khi GW-796 vừa chuyển COMPLETED 13:09. Dùng khi — và chỉ khi —
`ToolSearch` không ra `searchJiraIssuesUsingJql`.

**Cách chạy** (cần toolset `claude-in-chrome` ⇒ chỉ phiên CLI tương tác):
1. `navigate` tới `https://vnggames.atlassian.net/jira/software/c/projects/GW/issues` (tab mới).
2. Dán trọn `scripts/jira-via-chrome.js` qua `javascript_tool` → có `window.JIRA`. Nạp **1 lần/phiên**,
   sau đó chỉ gọi lệnh ngắn.
3. `await JIRA.delta('<state.lastRun lùi 30 phút, yyyy-MM-dd HH:mm>')` → trả `{changed[], open[],
   recentDone[]}`; `changed` đã kèm `subs` (subtask + status) và `sheets` (link buglist bóc sẵn từ
   description + comment) nên **không phải gọi thêm `getJiraIssue`**.
   `await JIRA.months('2026-03-01','2026-10-31')` → snapshot tab "Theo tháng", cùng cấu trúc
   `history/months.json`.
4. Xong thì `tabs_close_mcp`.

**3 luật cứng:**
- **CHỈ GET.** Không POST/PUT/DELETE qua đường này. Luật "KHÔNG ghi gì lên Jira" không có ngoại lệ,
  và cookie session của user thì ghi được thật — đó chính là lý do phải ghi luật ra đây.
- **Không phải JSON = LỖI, không phải "0 ticket".** `get()` ném khi status ≠ 2xx hoặc body không mở
  đầu bằng `{`/`[` (trang login/SSO trả HTML kèm 200). Im lặng nuốt ca này là biến sự cố đăng nhập
  thành báo cáo sai — cùng họ với luật "search SharePoint trắng không phải bằng chứng".
- **Output của `javascript_tool` BỊ CẮT** (đo thật: ~2.5 KB thì `[TRUNCATED]`). Tập lớn thì **so
  ngay trong trang** rồi chỉ trả phần lệch, đừng mang 73 dòng ra ngoài.

**Đã đo tương đương connector** (17/9 13:4x): `JIRA.months('2026-03-01','2026-10-31')` ra **73 ticket
/ 7 tháng**, so `key|duedate|status|resolved|hash(summary)` với bản connector sinh 09:56 cùng ngày →
**lệch đúng 1 dòng**: `GW-796 To Do → COMPLETED`, tức chính thay đổi thật lúc 13:09. Fallback không
làm nghèo dữ liệu.

**Giới hạn còn lại:** cần tab Chrome ⇒ **radar nền headless vẫn mù Jira** khi connector chết.
