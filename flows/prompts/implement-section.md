# Stage implement-section — {{KEY}} · section `{{section}}`

Repo `{{repo}}` · Campaign `{{campaignDir}}`. Code ĐÚNG section `{{section}}` theo `{{runDir}}/plan.md` đã được user duyệt. Phương án đã chọn: {{choice}}

File của section này (chỉ được sửa/tạo các file này — section khác do lane khác làm song song cùng lúc):
{{sectionFiles}}

Luật đọc trước khi sửa: `~/VNG/agent-auto/rules/code-style.md`, `cdn-source-standard.md`, `landing-structure.md` (section `<section id="{{section}}">` = tên folder, SCSS bọc `#{{section}}`), `popup-library.md`, `landing-js.md`; thêm `pm-contract.md` nếu có `pm__`.
Làm theo skill `/code-developer` (mục `## Chạy dưới autopilot`). KHÔNG build (webpack ghi chung `dist/`, driver build 1 lượt cho mọi section xong cùng lúc), KHÔNG commit, KHÔNG gọi Agent khác.
Xong là driver kiểm section này ngay (review + ui khoanh `#{{section}}`); lỗi sẽ được gửi lại đúng phiên này để sửa.

Verdict: `pass` + `files` = mọi file đã sửa/tạo (tương đối với `{{repo}}`); `fail` khi kẹt hoặc phải sửa file ngoài danh sách (ghi file nào, vì sao vào blocking).
