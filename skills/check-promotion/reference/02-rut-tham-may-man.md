# Checklist — STT 2: RÚT THĂM MAY MẮN (lucky-draw / đổi quà)

> Dùng cho STT: 2, 4, 5, 24, 26, 31; merge trong combo 3, 27, 30, 33.

> Validation checklist cho event type **lucky-draw** (PromoTypeID = 9).
> Alias: `rut-tham`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).
> Gameplay kit: `luckydraw-gift-exchange` (MASTER-luckydraw) — id kit đã nằm trong variant; `popup_bxh`, `popup_confirm` của MASTER là popup chuẩn kit, không tính thừa (SKILL.md Layer 2).
> **Evidence base**: phân tích 499 template lucky-draw-gift-exchange production. Threshold: ≥60% required, 40-59% required-conditional.

## required_popups
- popup_inform (hoặc popup_notice, popupAlert1, popupAlert2, popupAlert3, popupThongbao, popup_noti, popup_chuadangnhap, popup_duluot)
- popup_history (hoặc popupLichsu, popupHistory)
- popup_condition (hoặc popup_nhanluot, popupCondition, popup_nhanluot_condition, popup_getturn, popup_topup, popupDieukien)
- popup_reward (hoặc popup_reward_draw, popup_doiqua, popupPhanthuong, popup_reward2, popupDoiqua, popup_outgame, popup_reward_wish)
- popup_rule (hoặc popup_thele, popupThele, popup_rules)
- popup_register (hoặc popup_nhanluot_signUp, popup_dangky, popupProfileInfo, popupThongtin, popupChonNV, popup_profile) — *(60% — nếu có flow đổi quà vật phẩm)*
- popup_login (hoặc popup_signIn, popupDangnhap, popup_auth) — *(59% — nếu yêu cầu login)*
- popup_selectrole (hoặc popup_select_role, popup_role, popupRole) — **(optional — popup đổi server/nhân vật `pm__selectrole-module`; corpus ~24%; có trong file cũng không tính popup thừa, không Pass/Fail)**

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md) — áp dụng chung cho mọi loại.
Chỉ check khi popup tương ứng **tồn tại** trong file; không có → skip, không fail.
