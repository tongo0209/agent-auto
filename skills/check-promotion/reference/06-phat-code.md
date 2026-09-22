# Checklist — STT 6: PHÁT CODE (redeem-code / nhập code)

> Dùng cho STT: 6, 7 (tạm).

> Validation checklist cho event type **redeem-code**.
> Alias: `active-code`, `nhap-code`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_login (hoặc popup_auth)
- popup_notice (hoặc popup_inform)
- popup_getcode (hoặc popup_detail)

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
