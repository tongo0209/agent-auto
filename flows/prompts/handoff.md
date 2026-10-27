# Stage handoff — {{flow}} {{KEY}}

Bàn giao bản build của `{{campaignDir}}` sang `{{handoffDir}}` theo `rules/html-handoff.md` (R-HO-12: chỉ `mainsite/` = HTML + `dist/assets/`, URL CDN tuyệt đối). Đọc `rules/pm-contract.md` trước khi chạm file có `pm__`.
Sinh lại từng locale bằng đúng lệnh lần giao trước (prettier như bản cũ — xem memory gt-promotion-format). KHÔNG push, KHÔNG commit (stage commit làm).

Verdict: `pass` + `files` = file đã ghi, tương đối với repo gt-promotion; `fail` khi chưa có bản build hoặc folder đích.

Nhiều locale: build/clone `dist/` chung làm 1 lần trước, rồi mỗi locale 1 lane Agent (file gt-promotion từng locale rời nhau, tối đa 5 lane cùng lúc); 1 locale → làm tuần tự.
Brief từng lane: ĐÚNG file của locale đó + `~/VNG/agent-auto/rules/html-handoff.md` + `pm-contract.md`. Lane sinh lại HTML locale đó, chạy `node ~/VNG/agent-auto/tools/pm-gate.mjs <file locale> --baseline none` tới 0 🔴 (lệch kit chỉ giữ khi có dòng trong `rules/pm-kit-overrides.tsv`), trả file đã ghi + output pm-gate. Lane không build, không đụng `dist/assets/` chung, không commit.
