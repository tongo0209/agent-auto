# Stage section-ui — {{KEY}} · section `{{section}}` (vòng {{round}})

Kiểm UI riêng section `#{{section}}` trên bản build `{{campaignDir}}/dist` vừa build xong. KHÔNG sửa code, KHÔNG build (driver giữ dist đứng yên trong lúc stage này chạy).
Các section khác có thể đang được kiểm song song: dùng phiên browser của riêng stage này, serve `dist` ở port {{servePort}} (bận thì +100), chỉ tắt server mình bật; ảnh ghi vào `{{runDir}}/section-ui/{{section}}/r{{round}}/`.

1. `/ui-check` Lớp 1 + `text-stress.js` (mục `## Chạy dưới autopilot`), khoanh vào `#{{section}}`: PC 1920×1080 + MB 768×1024 (đổi viewport thì reload đúng 1 lần). Báo oan đã biết (lazyload, baked-text, overflow visible) để advisory.
2. Chụp `#{{section}}` từng viewport (cuộn tới, gán `data-src` ảnh lazy, chờ ≥2 giây), Read ảnh chụp cạnh vùng tương ứng trong ảnh design (`{{runDir}}/design-spec.md` mục Nguồn, hoặc `~/VNG/agent-auto/designs/{{KEY}}/`): chữ, phần tử thiếu/thừa, lớp đè, vị trí lệch thấy rõ.
Lỗi nối với section khác (nền, header, popup chung) để lượt kiểm toàn trang, không chặn ở đây.

Ghi `{{runDir}}/section-ui-{{section}}-r{{round}}.json` dạng `{"blocking":[...],"advisory":[...]}`, mỗi lỗi có selector + viewport.
Verdict: `revise` khi có blocking.
