# Checklist — STT 11: NGƯỜI CŨ QUAY VỀ (comeback)

> Dùng cho STT: 11.

> Validation checklist cho event type **nguoi-cu-quay-ve**.
> Alias: `comeback`, `nguoi-cu-quay-ve`, `quay-ve`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).
> **Evidence base**: 108 template production khớp `nguoi-cu|quay-ve|comeback` trong `gt-promotion-template` + `vportal2public` (đo 22/9/2026). Gom theo nhóm ngữ nghĩa vì tên popup phân mảnh theo từng game. Threshold: ≥60% required, 40-59% required-conditional.

## required_popups

- popup_rule (86% — `popupTheleNguoiCuTroVe`, `popupThele`, `popupTheleSinhNhat`)
- popup_register (86% — `popupThongtin`, `popupDangky`)
- popup_login (86% — `popupDangnhap`)

Ba nhóm trên đi liền nhau trong hầu hết template: người cũ phải đăng nhập → xác nhận thông tin nhân vật → đọc thể lệ mốc quà hồi quy.

## optional_popups

- popup_inform / popupAlert — *(nếu có thông báo lỗi/thành công riêng)*
- popup_history / popupLichsu — *(nếu có flow xem lịch sử nhận quà)*
- popup_reward — *(nếu mốc quà mở popup xem chi tiết)*

## Lưu ý riêng của loại này

- Tên popup thể lệ hay gắn tên chiến dịch (`popupTheleNguoiCuTroVe`, `popupTheleSinhNhat`) — match theo **chứa** `thele`/`rule`, đừng so khớp tuyệt đối.
- Mốc quà hồi quy dùng 3 trạng thái `.off`/`.active`/`.received` như mọi gameplay khác — xem `rules/promo-states.md`.

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
