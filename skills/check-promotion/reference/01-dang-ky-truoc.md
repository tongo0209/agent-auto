# Checklist — STT 1: ĐĂNG KÝ TRƯỚC (pre-register)

> Dùng cho STT: 1, 14 (tạm), 20, 21 (tạm); merge trong combo 3.

> Validation checklist cho event type **pre-register**.
> Alias: `dang-ky-truoc`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_login (hoặc popup_dangnhap, popupDangnhap)
- popup_inform (hoặc popupThongbao)
- popup_reward (hoặc popup_reward_draw)
- popup_history (hoặc popupLichsu)

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
