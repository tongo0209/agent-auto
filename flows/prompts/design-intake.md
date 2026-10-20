# Stage fetch-design — design-intake {{KEY}}

Tìm design của {{KEY}}: `state.issues.{{KEY}}.designLink` → description Jira → subtask "Review design"/"Hình quà" → comment hub (memory nexus-ticket-mo-qua-hub).
Có link: tải đủ theo nguồn vào `designs/{{KEY}}/` (SharePoint/Drive: bộ sp-fetch + sp-coverage; Figma: `/figma-cut --precheck`, chưa cắt). Đủ = khớp byte với nguồn, không tự chọn tập con.
Chưa có link: ghi rõ "chưa có link" + mốc design đã hứa (nếu thấy) vào `{{runDir}}/design-intake.md`. KHÔNG dựng code, KHÔNG sửa state.json.

Verdict: `pass` khi đã tải đủ hoặc đã xác nhận chưa có link; `fail` khi không đọc được nguồn (ghi lý do vào blocking).
