# Mode `batch` — nhiều task nhỏ trong MỘT lần chạy

> Tách từ SKILL.md 2026-08-06. Manager đọc file này khi user đưa ≥2 task cùng campaign/repo một lượt.

Lý do tồn tại: mỗi task chạy skill riêng = manager cold-start lại + nạp lại knowledge + build lại + checker lại. Đo thật trên `jxm/landing/2026-vo-lam-tinh-tu`: 3 slug rời (`thongtin`, `dangky-form`, `vltt-header`) = **3× toàn bộ chi phí cố định**. Batch gộp còn **1×**.

**Điều kiện:** mọi task cùng `<ctx>`. Task khác campaign → tách lần chạy riêng, CẤM gom.

## Luồng

1. **Triage** — cho từng task chạy qua gate 3 làn Bước 0, xếp vào 2 rổ. Báo user **1 bảng** rồi làm luôn (không chờ xác nhận, user phủ quyết được):

   | # | Task | Rổ | Cụm file |
   |---|---|---|---|

2. **Rổ QUICK** (đạt tín hiệu xanh: ≤4 file, chỗ sửa rõ, không component mới) → **manager tự sửa tuần tự trong phiên, 0 dispatch**. Đây là phần lãi lớn nhất của batch.
3. **Rổ CẦN DEV** → gom thành cụm file **không giao nhau** → dev song song theo **Fan-out song song — LUẬT CHUNG** (`references/fan-out.md`: cap 3, cân lane, tier per-lane). Task nào chạm file dùng chung → tách riêng, chạy sau, một mình.
4. **1 build chung** sau khi CẢ hai rổ xong.
   - **Build FAIL → BISECT theo cụm** (revert/tắt từng cụm để khoanh), CẤM rollback cả batch. Khoanh xong sửa đúng cụm đó rồi build lại.
5. **1 checker chung**, vai trò `CHỐT`: truyền **danh sách điểm cần verify gộp** của mọi task (mỗi task 1-3 assertion), không phải N lần gọi checker. Checker trả 1 report có bảng verdict per-task.
6. **Kết quả per-task**: PASS/FAIL ghi riêng từng task. Một task FAIL **KHÔNG** kéo cả batch thành FAIL — báo user task nào hỏng, các task khác vẫn tính xong.

## Ràng buộc

- `state.md`: ghi **1 entry cho mỗi slug** (để lần sau tra được từng task), nhưng cùng một dòng `Chi phí` của lần chạy batch — ghi rõ `batch N task`.
- Cap vòng fix áp cho **cả batch**, không phải mỗi task: tối đa 1 vòng fix chung sau checker. FAIL tiếp → dừng, hỏi user.
- Batch > **6 task** → cảnh báo user và đề nghị tách 2 lần chạy: triage dài làm manager sinh nhiều chữ, ăn mất phần lãi.
