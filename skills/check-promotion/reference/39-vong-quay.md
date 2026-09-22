# Checklist — STT 39: VÒNG QUAY VONG ƯU KỲ TRÂN (spin-wheel / vòng quay)

> Dùng cho STT: 39.

> Validation checklist cho event type **spin-wheel**.
> Alias: `vong-quay`, `quay-so`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_login (hoặc popup_dangnhap, popupDangnhap)
- popup_register (hoặc popup_dangky, popupChonNV, popupProfileInfo)
- popup_condition (hoặc popupDieukien, popupCondition, popup_nhanluot)
- popup_history (hoặc popupLichsu, popupHistory)
- popup_reward (hoặc popup_reward_draw, popup_thele_reward)
- popup_inform (hoặc popupThongbao, popup_noti)
- popup_rule (hoặc popup_thele, popupThele)

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
