# Design: Skill `/daily` — Bộ điều phối công việc hàng ngày

> ⚠️ **LỊCH SỬ** — bị thay bởi `docs/specs/2026-08-13-radar-auto-design.md`. Mệnh đề "không cron vì phiên nền không auth được connector Jira" đã bị ĐO THẬT bác bỏ 13/8/2026 (`claude -p` gọi được `searchJiraIssuesUsingJql`). Đường dẫn skill trong file cũng đã đổi (`skills/` trong repo, `~/.claude/skills` chỉ là symlink).

**Ngày:** 2026-07-30 · **Trạng thái:** Đã duyệt (user chốt Hướng A)

## Mục tiêu

Một lệnh `/daily` mỗi sáng thay cho chuỗi việc tay: mở Jira xem task → đọc detail/design →
quyết định làm gì trước → gọi skill code → theo dõi tiến độ rải rác. Sau khi duyệt kế hoạch
1 lần, agent tự chạy song song đến khi xong, user theo dõi qua board local + dashboard HTML.

## Quyết định đã chốt với user

| Câu hỏi | Chốt |
|---|---|
| Hình thức chạy | 1 lệnh khi bắt đầu ngày (không cron — connector Jira claude.ai không auth được trong phiên nền) |
| Mức tự động | Duyệt kế hoạch 1 lần → chạy hết, chỉ hỏi lại khi kẹt |
| Theo dõi | File board local + dashboard HTML (artifact); KHÔNG ghi ngược Jira |
| gt-promotion-template | Để ngoài luồng /daily, dùng thủ công khi cần |
| Nhận diện task Jira | Lần đầu agent tự dò (assignee = user, chưa xong) → user xác nhận → lưu JQL vào config |

## Kiến trúc

- **Skill:** `~/.claude/skills/daily/SKILL.md` — skill cá nhân, gọi được từ mọi phiên.
- **Dữ liệu:** `~/VNG/agent-auto/`
  - `config.json` — cloudId + JQL đã chốt, đường dẫn repo (cdn-source, new-mainsite, gt-promotion-template, vportal2view), quy tắc phân loại. Tạo ở lần chạy đầu.
  - `state.json` — map `{issueKey: {updatedAt, status, lastAction}}` để lần sau chỉ xử lý mới/đổi/reopen.
  - `boards/YYYY-MM-DD.md` — board mỗi ngày 1 file.
  - `tasks/<JIRA-KEY>/` — `brief.md` (detail bóc từ ticket) + `design/` (ảnh tải được) + link design nếu không tải được.
  - `dashboard.html` — nguồn artifact, mỗi lần chạy redeploy cùng URL.

## Luồng chạy

1. **Quét Jira** (Atlassian MCP): chạy JQL trong config. Config chưa có → luồng first-run:
   `atlassianUserInfo` + `getAccessibleAtlassianResources` → JQL dò `assignee = currentUser() AND statusCategory != Done` → liệt kê cho user xác nhận/chỉnh → lưu config. So `updated` với state.json → gắn nhãn MỚI / ĐỔI / CÒN DỞ.
2. **Đọc sâu từng ticket**: `getJiraIssue` lấy description, comment, attachment. Ảnh design: thử tải qua MCP fetch; không tải được → ghi URL vào `brief.md` + đánh dấu "cần tải tay" (degrade gracefully, không chặn luồng).
3. **Phân loại + trình kế hoạch** — theo bảng routing global của user:
   - Dựng UI từ ảnh design → `/code-developer full`
   - Sửa UI cho khớp design → `/code-developer fix`
   - Sửa/thêm tính năng frontend → `/code-developer code`
   - Buglist QC (Google Sheets) → `/bug-fixer-lite` (CHỈ chuẩn bị lệnh cho user dán sang CLI terminal — VS Code panel không có Chrome extension ghi sheet)
   - Sửa vặt ≤2 file rõ chỗ → làm thẳng trong phiên
   - Mơ hồ/thiếu design/không phải việc FE → rổ "cần user quyết", không đoán
   Trình 1 bảng kế hoạch: ticket → loại → đường ray → repo đích → ước lượng. **User duyệt/chỉnh 1 lần.**
4. **Thực thi song song**: nhiều task code → ưu tiên `/code-developer batch`; task khác repo chạy song song tự nhiên, task cùng repo dùng worktree riêng hoặc tuần tự. Mỗi task verify build thật.
5. **Cập nhật liên tục**: mỗi chuyển trạng thái (⏳/✅/⚠️) → cập nhật board md + regenerate dashboard + redeploy artifact.
6. **Báo cáo cuối**: xong gì (kèm bằng chứng verify), kẹt gì vì sao, việc còn lại của user (review diff, commit/push tay, cập nhật Jira tay, lệnh bug-fixer-lite cần dán). Cập nhật state.json.

## Modes

- `/daily` — trọn luồng 6 bước.
- `/daily plan` — chỉ bước 1–3, không thực thi (dry-run).
- `/daily status` — đọc board hôm nay + state, tóm tắt nhanh, không quét Jira.

## Xử lý lỗi & an toàn

- Jira chưa auth → dừng sớm, hướng dẫn bật connector trong claude.ai settings.
- 1 task fail không kéo sập buổi chạy — board đánh ⚠️, các task khác chạy tiếp.
- KHÔNG tự commit/push (luật global), KHÔNG ghi gì lên Jira, KHÔNG tự chạy bug-fixer-lite trong panel.
- Claim "xong" phải có lệnh + output thật; chưa verify phải nói "chưa verify".

## Nghiệm thu

Lần chạy thật đầu tiên: `/daily plan` dò đúng task của user trên Jira → chốt config →
`/daily` chạy trọn luồng với task thật. Dashboard mở được, board ghi đúng trạng thái.
