# Stage ui-check — {{KEY}} (vòng {{round}})

Chạy skill `/ui-check` trên bản build của `{{campaignDir}}` (đọc mục `## Chạy dưới autopilot` của skill): Lớp 1 + `text-stress.js`, PC 1920×1080 + MB 768×1024, so với design `~/VNG/agent-auto/designs/{{KEY}}/` khi có `coords.json`.
KHÔNG sửa code.

Ghi `{{runDir}}/ui-check-r{{round}}.json` dạng `{"blocking":[...],"advisory":[...]}`, mỗi lỗi có selector/vị trí + viewport.
Verdict: `revise` khi có lỗi chặn; báo oan đã biết (lazyload, baked-text, overflow visible) để advisory.
