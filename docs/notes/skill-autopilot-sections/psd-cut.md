## Chạy dưới autopilot

Chỉ áp dụng khi prompt có dòng `AUTOPILOT_RUN:` — phiên gõ tay bỏ qua toàn bộ mục này.

- Chạy ĐÚNG giai đoạn prompt stage nêu, rồi dừng. Đầu vào/đầu ra là file trong thư mục run prompt đưa.
- KHÔNG hỏi user (không AskUserQuestion, không chờ xác nhận): chỗ skill bảo "hỏi user" → kết thúc bằng verdict `fail`, ghi câu hỏi vào `blocking`; autopilot sẽ dừng và gọi user.
- KHÔNG commit, KHÔNG push, KHÔNG ghi sheet/Jira — stage `commit`/`write-sheet` của autopilot làm sau khi user duyệt.
- Kết thúc bằng khối `autopilot-verdict` đúng như prompt mô tả.
- Photoshop đã được autopilot khoá cho run này. Thiếu font → `fail` + tên font vào blocking (không tự cài).
