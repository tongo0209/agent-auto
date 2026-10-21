# Stage lanes — buglist {{KEY}}

Fix các bug rổ FIX trong `{{runDir}}/bug-board.md` theo `/bug-fixer-lite` giai đoạn [2] LANE (đọc `## Chạy dưới autopilot`). Repo `{{repo}}` · campaign `{{campaignDir}}`.
KHÔNG build chung (stage gates làm), KHÔNG ghi sheet, KHÔNG commit.

Cập nhật bug-board (cột "Nơi đã sửa"). Verdict: `pass` + `files` = mọi file đã sửa.

Ticket nhiều campaign (mỗi dòng 1 folder):
{{campaignDirs}}
Từ 2 campaign trở lên: mỗi campaign 1 lane Agent riêng, tập file rời nhau, tối đa 5 lane song song; build chung do stage gates chạy từng campaign.
Tìm chữ QC trích luôn bằng `grep -rin` + thử bản bỏ dấu, trong cả campaign lẫn bản bàn giao, rồi mới được kết luận "text do BE sinh" — chép câu này vào brief từng lane.
