# Stage ui-check — {{KEY}} (vòng {{round}})

Chạy skill `/ui-check` trên bản build của `{{campaignDir}}` (đọc mục `## Chạy dưới autopilot` của skill): Lớp 1 + `text-stress.js`, PC 1920×1080 + MB 768×1024.
Lớp 2 (so ảnh design) là việc của stage `design-compare` ngay sau — ở đây KHÔNG ghi "chưa so design" thành advisory.
KHÔNG sửa code.
Stage `design-compare` có thể đang chạy song song với browser riêng ở port 8820: dùng phiên browser của riêng stage này, serve `dist` ở port 8810 (bận thì 8811, 8812…), chỉ tắt server mình bật, ảnh ghi vào `{{runDir}}/ui-check/`; không đụng tab/server của stage khác.

Ghi `{{runDir}}/ui-check-r{{round}}.json` dạng `{"blocking":[...],"advisory":[...]}`, mỗi lỗi có selector/vị trí + viewport.
Verdict: `revise` khi có lỗi chặn; báo oan đã biết (lazyload, baked-text, overflow visible) để advisory.
