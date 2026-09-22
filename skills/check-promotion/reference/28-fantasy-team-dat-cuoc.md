# Checklist — STT 28: FANTASY TEAM & ĐẶT CƯỢC (betting / dự đoán)

> Dùng cho STT: 28, 34.

> Validation checklist cho event type **betting**.
> Alias: `du-doan`, `ty-le-cuoc`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_login (hoặc popup_dangnhap)
- popup_register (hoặc popup_dangky)
- popup_condition (hoặc popup_selectcoin)
- popup_history (hoặc popup_history_betting)
- popup_inform (hoặc popup_changegifts)

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
