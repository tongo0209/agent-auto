# Hợp đồng platform — không đi kèm bản public

`/code-audit` soi 5 trục; trục **"hợp đồng platform"** cần đặc tả riêng của nền tảng bạn đang làm
việc trên đó: class/`id`/`data-*` nào là hook mà JS platform đọc, đổi tên là nút chết.

Đặc tả gốc là tài liệu nội bộ của tổ chức đã xây bộ này nên không phát hành kèm. Hệ quả: chạy
`/code-audit` trên bản public thì **trục này bị bỏ qua**, 4 trục còn lại (trùng lặp & tái sử dụng,
đúng-sai khi chạy thật, dễ bảo trì, code-style `R-CS-*`) vẫn đủ.

Muốn bật lại: viết file này theo khuôn dưới rồi đặt đúng chỗ (`skills/code-audit/references/pm-contract.md`).

| Cần khai | Ví dụ khuôn |
|---|---|
| Tiền tố class là hợp đồng | `pm__`, `MS__`, … — cấm đổi tên, cấm xoá, giữ đúng lồng nhau |
| `id` / `data-*` đặc biệt | liệt kê từng cái + ý nghĩa với JS platform |
| Cặp dễ nhầm | tên chỉ khác nhau một ký tự nhưng thuộc 2 luồng khác nhau |
| Field form | `name` / `type` / `for` / `id` phải giữ nguyên; tắt field bằng cách ẩn khối bọc |
| Mã lỗi | mỗi vi phạm một mã để báo cáo trích mã thay vì diễn giải |
