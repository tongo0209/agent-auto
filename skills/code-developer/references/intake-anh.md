# Nhận ảnh design — chi tiết (manager code-developer)

> Core `SKILL.md` giữ luật bắt buộc. File này là lệnh đầy đủ + cạm bẫy. Đọc khi thực sự phải vớt clipboard hoặc convert file design gốc.

4. **Quy tắc nhận ảnh** (subagent chỉ đọc được ảnh là FILE trên đĩa, qua đường dẫn):
   - User đưa đường dẫn file → dùng trực tiếp.
   - User đưa thư mục hoặc pattern (`./design/dash-*.png`) → Glob, liệt kê các file tìm thấy cho user xác nhận trước khi giao việc.
   - User **dán ảnh vào chat** (không có file trên đĩa) → ảnh đó KHÔNG truyền được cho subagent (subagent khởi tạo context mới, chỉ nhận prompt text). Manager TỰ VỚT ảnh từ clipboard trước (ảnh dán thường vẫn còn trên clipboard lúc xử lý message), chỉ khi fail mới hỏi user:
     ```bash
     mkdir -p design/<slug> && osascript \
       -e 'set png to the clipboard as «class PNGf»' \
       -e 'set f to open for access POSIX file "<ĐƯỜNG DẪN TUYỆT ĐỐI>/design/<slug>/pasted-<n>.png" with write permission' \
       -e 'write png to f' -e 'close access f'
     ```
     (`POSIX file` bắt buộc đường dẫn TUYỆT ĐỐI. Máy có `pngpaste` thì dùng `pngpaste <file>` gọn hơn.)
     Sau khi lưu: **Read file và ĐỐI CHIẾU với ảnh dán trong chat** (manager nhìn được cả hai) — khớp mới dùng; lệch nghĩa là clipboard đã bị đè → coi như fail. User dán NHIỀU ảnh trong 1 message → clipboard chỉ giữ ảnh CUỐI, chỉ vớt được 1 — các ảnh còn lại đi đường fallback.
     **Fallback** (osascript lỗi / clipboard không có ảnh / đối chiếu lệch / nhiều ảnh): giải thích ngắn và đề nghị user lưu ảnh ra file (gợi ý: `design/<slug>/`) hoặc kéo-thả file ảnh vào cửa sổ chat (tự chèn đường dẫn) rồi đưa path.
   - User đưa **file design gốc** (`.psd`, `.ai`, `.sketch`, `.fig`) → subagent không xem được trực tiếp. Manager TỰ convert bằng Bash trước khi giao việc:
     ```bash
     mkdir -p design/<slug> && sips -s format png <file>.psd --out design/<slug>/<tên>.png
     ```
     (`sips` có sẵn macOS; fail thì thử `magick '<file>.psd[0]' ...` nếu có ImageMagick; cả hai fail → nhờ user xuất PNG từ Photoshop.)
     Sau khi convert: Read thử file PNG để xác nhận render đúng (PSD lưu thiếu "Maximize Compatibility" có thể ra ảnh trắng/lỗi). **Lưu ý báo user**: kết quả là bản phẳng toàn canvas — nếu PSD nhiều artboard/cần từng phần cắt riêng thì user tự xuất sẽ chuẩn hơn.
   - Trong prompt giao việc: luôn liệt kê **từng đường dẫn file ảnh** tường minh, không ghi "ảnh như trên".
