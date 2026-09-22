# Checklist — STT 22: MỜI BẠN BÈ NHẬN QUÀ (affiliate / mời bạn)

> Dùng cho STT: 22, 37; merge trong combo 30, 33.

> Validation checklist cho event type **affiliate**.
> Alias: `moi-ban`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_login (hoặc popup_dangnhap)
- popup_register (hoặc popup_dangky)
- popup_history (hoặc popupLichsu)
- popup_inform (hoặc popupThongbao)
- popup_rule (hoặc popup_thele)

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
