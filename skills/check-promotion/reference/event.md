# Checklist — Event (sự kiện chung)

> Validation checklist cho event type **event**.
> Alias: `su-kien`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_login (hoặc popup_dangnhap, popupDangnhap)
- popup_register (hoặc popup_dangky, popupProfileInfo)
- popup_history (hoặc popupLichsu)
- popup_condition (hoặc popupCondition)
- popup_inform (hoặc popupThongbao)
- popup_rule (hoặc popup_thele)

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
