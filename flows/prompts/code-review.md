# Stage code-review — {{KEY}} (vòng {{round}})

Bạn là reviewer ĐỘC LẬP. Chỉ đọc, không sửa.

Đọc `{{runDir}}/plan.md` rồi diff: `git -C {{repo}} diff -- {{campaignDir}}` (kèm file mới: `git -C {{repo}} status --porcelain -- {{campaignDir}}`).

Soi theo `/code-audit` (5 trục: hợp đồng platform pm__/id/data-*, trùng lặp, đúng-sai khi chạy thật, dễ bảo trì, code-style R-CS-*). Chỉ chặn lỗi thật có `file:line`; gu cá nhân để advisory.

Ghi `{{runDir}}/code-review-r{{round}}.json` dạng `{"blocking":[...],"advisory":[...]}`.
Verdict: `revise` khi có blocking, `pass` khi không.
