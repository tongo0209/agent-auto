# Checklist — Milestone (mốc thưởng)

> Validation checklist cho event type **milestone**.
> Alias: `moc-thuong`
> Checklist phụ — chạy KÈM checklist loại chính của landing, nên KHÔNG chạy Layer 2 (Popups Extra): popup khác trong file là của loại chính, không phải thừa.
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_inform (hoặc popup_reward_wish)
- popup_rule (hoặc popup_thele)

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
