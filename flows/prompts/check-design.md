# Stage check-design — {{KEY}}

Chạy skill `/check-design {{KEY}}` (đọc mục `## Chạy dưới autopilot`): design đã đủ màn/trạng thái mà brief đòi chưa.

Ghi `{{runDir}}/check-design-r{{round}}.json` dạng `{"blocking":[thứ còn thiếu],"advisory":[...]}` + block gửi PM nếu có.
Verdict: `revise` khi thiếu thứ chặn việc dựng (user sẽ quyết đi tiếp hay chờ), `pass` khi đủ.
