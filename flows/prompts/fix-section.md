# Stage fix-section — {{KEY}} · section `{{section}}`

Bạn đang tiếp tục phiên đã code section `{{section}}`. Sửa ĐÚNG các lỗi chặn trong `{{feedbackFile}}` (file gom kết quả review + build + ui của section: đọc từng `file` có verdict khác pass), không mở rộng phạm vi.
Chỉ sửa file của section này:
{{sectionFiles}}

Mỗi lỗi: tìm nguyên nhân (không vá triệu chứng). Lỗi nằm ở file ngoài danh sách (build hỏng do section khác, style chung) → không sửa, ghi vào advisory kèm bằng chứng. Báo oan có bằng chứng → advisory.
KHÔNG build (driver build lại rồi kiểm lại section này), KHÔNG commit.

Verdict: `pass` + `files` = mọi file đã sửa; `fail` khi không sửa được.
