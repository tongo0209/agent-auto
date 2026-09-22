# Checklist — STT 27: ĐIỂM DANH & RÚT THĂM MAY MẮN (checkin / điểm danh)

> Dùng cho STT: 27 — LUÔN merge với `02-rut-tham-may-man.md`.

> Validation checklist cho event type **checkin**.
> Alias: `diem-danh`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_login (hoặc popupDangnhap)
- popup_register (hoặc popupProfileInfo, popup_dangky)
- popup_history (hoặc popupLichsu)
- popup_condition (hoặc popupCondition)
- popup_inform (hoặc popupThongbao)

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
