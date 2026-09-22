# Checklist — STT 23: LÀM BÁNH (crafting / chế biến)

> Dùng cho STT: 23.

> Validation checklist cho event type **crafting**.
> Alias: `lam-banh`, `che-bien`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_login (hoặc popup_signIn)
- popup_register (hoặc popup_nhanluot_signUp)
- popup_condition (hoặc popup_nhanluot_condition)
- popup_history (hoặc popup_history_ingredient)
- popup_inform (hoặc popup_notice, popup_reward)
- popup_rule (hoặc popup_thele)

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
