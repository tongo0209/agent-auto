# Xuất bản công khai (người bảo trì)

Bản public là **sản phẩm phái sinh** của repo này: sinh ra một repo mới history trắng, không có
rules nội bộ và không có tên thật của repo/hệ thống nội bộ trong bất kỳ commit nào.

Bản public là **sản phẩm phái sinh**, sinh ra bằng:

```bash
bash tools/export-public.sh --dry          # xem trước: file nào vào, thay bao nhiêu lượt
bash tools/export-public.sh                # → ../agent-auto-public, history trắng, 1 commit
bash tools/export-public.test.sh           # self-test 13 ca của chính bộ export
```

Luồng: liệt kê file → phân loại theo `publish/manifest.txt` → copy → áp `publish/overrides/` →
áp `publish/redactions.tsv` → cổng `publish/denylist.txt` → chạy test của bản export → `git init`
+ 1 commit. Làm hết trong thư mục tạm, chỉ `mv` sang đích khi **mọi** cổng pass; đích đã tồn tại
thì dừng, script không xoá gì.

Bốn cơ chế đáng nhớ:

- **Manifest chặn file chưa phân loại.** File mới mà không khớp dòng `+` lẫn `-` thì export **fail**.
  Mặc định là "chưa quyết định", không phải "cho ra ngoài".
- **Redaction đếm số lần thay** và cảnh báo pattern nào thay 0 lần — thường là gõ sai pattern.
- **Denylist chạy trên cả working tree lẫn `git log -p`**, nên nội dung lọt vào commit vẫn bị bắt.
- **Test là một cổng.** Redaction đổi chuỗi có thể làm hỏng code (ví dụ tên có gạch nối không dùng
  được làm key JS trần) — chỉ test mới thấy.
