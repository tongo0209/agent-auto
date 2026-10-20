# Stage handoff — {{flow}} {{KEY}}

Bàn giao bản build của `{{campaignDir}}` sang `{{handoffDir}}` theo `rules/html-handoff.md` (R-HO-12: chỉ `mainsite/` = HTML + `dist/assets/`, URL CDN tuyệt đối). Đọc `rules/pm-contract.md` trước khi chạm file có `pm__`.
Sinh lại từng locale bằng đúng lệnh lần giao trước (prettier như bản cũ — xem memory gt-promotion-format). KHÔNG push, KHÔNG commit (stage commit làm).

Verdict: `pass` + `files` = file đã ghi, tương đối với repo gt-promotion; `fail` khi chưa có bản build hoặc folder đích.
