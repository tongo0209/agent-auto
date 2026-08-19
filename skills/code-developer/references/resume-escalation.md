# Agent chết giữa chừng (RESUME) + Escalation

> Tách từ SKILL.md 2026-08-06. Manager đọc file này khi một agent về không có kết quả, hoặc agent nêu yêu cầu hỗ trợ trong report.

## RESUME — đừng chạy lại từ đầu

Agent có thể chết (interrupt-kill, lỗi API, hết ngân sách). Đã xảy ra thật: *"analyst bị interrupt-kill nên hạ về fix"*. Luật:

1. Agent về mà **không có kết quả**, hoặc bạn không nhận được report → **ĐỌC file artifact của nó trên đĩa TRƯỚC** (`<ctx>/specs/<slug>.md`, `<ctx>/reports/<slug>-dev-<n>.md`, `<ctx>/reports/<slug>-check-<n>.md`). Cả 3 agent đều ghi tăng dần theo luật CHECKPOINT.
2. File **còn dòng `<!-- CHECKPOINT: ... -->`** = lượt DỞ, nhưng phần đã ghi là **dùng được**. Re-dispatch kèm chỉ thị tiếp nối:
   - analyst: `Spec đã có tới mục N (xem file). Đọc file rồi VIẾT TIẾP từ mục N+1. CẤM làm lại mục đã có.`
   - dev: `Đã sửa xong các file <list> (xem Dev Report). Làm tiếp phần còn lại, CẤM đụng lại file đã xong.`
   - checker: `Đã verify <list> (xem report). RE-CHECK chỉ phần còn thiếu, CẤM chạy lại lượt browser đã làm.`
3. **File không tồn tại hoặc rỗng** → agent chết quá sớm, dispatch lại bình thường.
4. **Lần re-dispatch do agent chết KHÔNG tính là một vòng fix** (giống escalation). Nhưng tối đa **2 lần/pipeline** — quá ngưỡng nghĩa là có vấn đề môi trường → dừng, báo user, đừng hạ mode âm thầm.
5. **CẤM tự hạ mode** (`full` → `fix`) chỉ vì một agent chết. Hạ mode là quyết định của user — hỏi, kèm thông tin: đã có gì trên đĩa, còn thiếu gì.

## Escalation — khi agent cần hỗ trợ

Subagent **không thể gọi subagent khác** (giới hạn của Claude Code) — mọi yêu cầu hỗ trợ đi vòng qua manager (hub-and-spoke):

1. Worker kết thúc lượt và nêu yêu cầu trong report (mục "Cần quyết định / Cần hỗ trợ / Ngoài phạm vi" của dev, "Câu hỏi mở" của analyst, "Chưa check được" của checker).
2. Manager đáp ứng: gọi agent phù hợp (vd analyst làm rõ spec mục N) hoặc hỏi user.
3. Giao việc lại cho worker kèm kết quả hỗ trợ (đường dẫn spec đã cập nhật / câu trả lời của user).

Quy tắc: lần re-dispatch do escalation **không tính** là một vòng fix; nhưng tối đa **2 lần escalation** mỗi pipeline — quá ngưỡng nghĩa là input gốc có vấn đề → dừng, hỏi user.
