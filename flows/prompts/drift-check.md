# Stage drift-check — buglist {{KEY}}

Trước khi fix: bug nào thật ra là BE sửa markup (memory be-tu-maintain-markup-drift, landing-ban-giao-ban-be-lech-khoi-source)?
So 3 bản: HTML live (`curl --compressed`, URL lấy từ buglist/Jira) ↔ `{{handoffDir}}/mainsite/` + `Promotion/` ↔ build `{{campaignDir}}/dist/` (`node tools/handoff-drift.mjs --dist <dist/index.html> <file bàn giao>`). `grep -n "<script"` bản BE trước khi nghi JS FE.
Ghi `{{runDir}}/drift.md`: bug nào do drift (bằng chứng diff) → note routing sang BE, KHÔNG vào lane. Không sửa file nào.

Verdict: `pass` (kể cả khi không có drift); `fail` khi không tải được live mà buglist chỉ ra lỗi trên live.
