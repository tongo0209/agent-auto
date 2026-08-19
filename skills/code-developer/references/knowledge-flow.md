# Ghi knowledge — quy trình đầy đủ (manager là người ghi DUY NHẤT)

> Tách từ SKILL.md 2026-08-06. Manager đọc file này ở bước knowledge cuối pipeline (mọi mode trừ `design` và `quick`; `mid` chỉ khi dev đánh dấu ⚠).

1. Gom mục "Đề xuất knowledge" từ mọi report của agent + quan sát của chính bạn (vd: dev mắc cùng một lỗi 2 vòng liền → đó là mistake đáng ghi).
2. Đọc **`~/.claude/knowledge/code-developer/INDEX.md`** (không đọc tràn `entries/`) → **loại đề xuất trùng/na ná** entry đã có trong bảng. Nghi trùng → Read đúng entry đó để đối chiếu. Trùng nhưng có chi tiết mới → cập nhật entry cũ thay vì thêm mới.
3. Phân loại theo "Phạm vi" trong đề xuất:
   - Dự án này → `<ctx>/knowledge/mistakes.md` / `<ctx>/knowledge/improvements.md` (tạo file nếu chưa có, theo template trong `~/.claude/knowledge/code-developer/README.md`) — với product trong cdn-source, bài học tích lũy theo product.
   - Mọi dự án → **tạo file entry riêng** `~/.claude/knowledge/code-developer/entries/<m|i>-<slug>.md` **VÀ thêm 1 dòng vào bảng `entries/` trong `INDEX.md`** (tag · loại ❌/💡 · ngày · tiêu đề → path). **Thiếu dòng INDEX = entry vô hình, coi như chưa ghi.**
   - Luật chặn phình (bạn chịu trách nhiệm): bảng `entries/` vượt **60 dòng** → tỉa/gộp trước khi thêm mới; entry quá **6 tháng** không được lạt lại → chuyển `entries/archive/` + xoá dòng khỏi INDEX.
   - Tiêu chí phân tầng: **"bài học này còn đúng nếu mai sang product khác không?"** — còn → global, không → product.
4. Format entry chuẩn: theo `~/.claude/knowledge/code-developer/README.md` — **nguồn duy nhất** (5 field: Bối cảnh / Vấn đề-Cải thiện / Nguyên nhân gốc / Lần sau / **Phạm vi**). Field "Phạm vi" trong đề xuất của agent chính là căn cứ phân tầng ở bước 3.
5. **KHÔNG ghi**: typo vặt một lần, chi tiết riêng của task (đã có git), kiến thức framework phổ thông ai cũng biết.

**Single-pass tail** (single-pass read): đọc các report 1 LƯỢT — vừa soạn entry knowledge vừa soạn dòng "Knowledge đã ghi"/"Việc còn mở" của Tổng kết; rồi (1) ghi file knowledge, (2) xác nhận write trả về, (3) MỚI in dòng "Knowledge đã ghi" với nội dung thực ghi. Write fail/skip → ghi "chưa ghi: <lý do>", không claim sai.
