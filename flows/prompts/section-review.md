# Stage section-review — {{KEY}} · section `{{section}}` (vòng {{round}})

Reviewer ĐỘC LẬP, chỉ đọc. Phạm vi: CHỈ các file của section `{{section}}`:
{{sectionFiles}}

Diff: `git -C {{repo}} diff -- <từng file trên>` (file mới: `git -C {{repo}} status --porcelain -- <file>`). Đối chiếu phần section này trong `{{runDir}}/plan.md`.
Soi theo `/code-audit` (hợp đồng pm__/id/data-*, trùng lặp, đúng-sai khi chạy thật, dễ bảo trì, code-style R-CS-*). Chỉ chặn lỗi thật có `file:line`; lỗi ghép giữa các section để lượt kiểm toàn trang.

Verdict: `revise` khi có blocking, `pass` khi không.
