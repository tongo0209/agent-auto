# Checklist — STT 11: NGƯỜI CŨ QUAY VỀ (comeback)

> Dùng cho STT: 11.

> Validation checklist cho event type **nguoi-cu-quay-ve**.
> Alias: `comeback`, `nguoi-cu-quay-ve`, `quay-ve`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).
> **Evidence base**: 108 template production khớp `nguoi-cu|quay-ve|comeback` trong `gt-promotion-template` + `vportal2public` (đo 22/9/2026). Gom theo nhóm ngữ nghĩa vì tên popup phân mảnh theo từng game. Threshold: ≥60% required, 40-59% required-conditional.

## required_popups

- popup_rule (hoặc popupThele, popupTheleNguoiCuTroVe, popupTheleSinhNhat) — *(86%)*
- popup_register (hoặc popupThongtin, popupDangky) — *(86%)*
- popup_login (hoặc popupDangnhap) — *(86%)*
- popup_inform (hoặc popupAlert) — **(optional — chỉ có khi landing có thông báo lỗi/thành công riêng)**
- popup_history (hoặc popupLichsu) — **(optional — chỉ có khi có flow xem lịch sử nhận quà)**
- popup_reward — **(optional — chỉ có khi mốc quà mở popup xem chi tiết)**

Ba nhóm bắt buộc đi liền nhau trong hầu hết template: người cũ phải đăng nhập → xác nhận thông tin nhân vật → đọc thể lệ mốc quà hồi quy.

## Lưu ý riêng của loại này

- Tên popup thể lệ hay gắn tên chiến dịch (`popupTheleNguoiCuTroVe`, `popupTheleSinhNhat`). Vẫn khớp ĐÚNG TÊN theo SKILL.md Layer 1 — không khớp kiểu "chứa `thele`". Gặp tên thể lệ mới → item `popup_rule` ra ❌ và tên đó hiện ở Popups Extra: người soát xác nhận rồi thêm tên vào variant ở trên.
- Mốc quà hồi quy dùng 3 trạng thái `.off`/`.active`/`.received` như mọi gameplay khác — xem `~/VNG/agent-auto/rules/promo-states.md`.

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
