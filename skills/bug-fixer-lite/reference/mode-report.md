# Mode `report` — bug-fixer-lite

> Tách từ `SKILL.md` ngày 2026-09-23 để lõi nhẹ hơn mỗi lượt. Chỉ đọc khi token đầu = `report`.

## Mode `report` — chạy lại riêng bước ghi

> ⛔ **CỔNG 30 GIÂY — việc ĐẦU TIÊN của mode `report`, TRƯỚC cả khi đọc board:** ToolSearch `+claude-in-chrome` → `list_connected_browsers` (đây là lần gọi DUY NHẤT của mode này).
> Rỗng/toolset vắng → in đúng 1 block hướng dẫn rồi **DỪNG PHIÊN NGAY**. KHÔNG đọc board, KHÔNG dựng lại danh sách pending, KHÔNG thử đường khác, KHÔNG gọi lại. Lý do: `report` chỉ có **một** việc là ghi lên sheet — không nối được browser thì mọi thứ còn lại đều vô nghĩa.
> Block in ra: *"Chưa nối được extension Claude in Chrome. Đang ở VS Code panel? → mở integrated terminal, chạy `claude` tại thư mục project rồi gọi lại `report` ở đó (panel KHÔNG nạp toolset chrome). Đang ở CLI? → mở trình duyệt mặc định đã login, gõ `/chrome` (chọn 'Enabled by default' để phiên sau tự nối), rồi gọi lại. Chưa ghi ô nào — board giữ nguyên `pending`, không mất gì."*
> *(Đo thật 23/7: 4 lượt `report` hỏng chạy từ 2m36s tới 9m04s rồi mới chịu báo, tổng 22.5 phút + 253k output token cho 0 ô ghi được. Cổng này cắt còn dưới 30 giây.)*

Có browser rồi mới làm tiếp: đọc board `bugs-lite` mới nhất của project → lấy bug PASS có `Ghi-sheet: pending|manual` + bug có `Note-routing: pending|manual` → chạy GIAI ĐOẠN [5] y nguyên (pre-flight + xác nhận header + 2 nhịp verify). **Trong `report` KHÔNG có merge/verify** nên gộp BURST NOTE + BURST DONE thành **1 lượt ghi** (mở tab 1 lần, ghi hết pending). Nguồn `file`/`text`/`gdoc`/`drive-file` → in lại kết quả-block. Không có board → báo user chạy trọn luồng trước. Đây là đường chuẩn khi phiên fix trước thiếu Chrome/rớt giữa chừng — user chỉ cần mở phiên có Chrome và gọi `report`, không dán tay.
