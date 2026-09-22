# Checklist — STT 13: KHUYẾN MÃI NẠP (payment / nạp tiền / topup)

> Dùng cho STT: 13, 10 (tạm).

> Validation checklist cho event type **payment** (PromoTypeID = 15).
> Alias: `nap-tien`, `topup`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).
> **Evidence base**: phân tích 377 template payment production. Threshold: ≥60% required, 40-59% required-conditional.

## required_popups
- popup_inform (hoặc popupAlert1, popupAlert2, popupAlert3, popupThongbao)
- popup_history (hoặc popupLichsu)
- popup_rule (hoặc popup_thele, popupThele)
- popup_login (hoặc popupDangnhap, popup_signIn, popup_auth)
- popup_condition (hoặc popupCondition, popup_getturn, popup_nhanluot, popup_nhanluot_condition) — **(optional — loại payment BỎ QUA không check popup này: không Pass/Fail, có trong file cũng không tính popup thừa)**
- popup_reward (hoặc popup_reward2, popup_doiqua, popupPhanthuong) — *(75% — popup hiển thị quà nhận được)*
- popup_register (hoặc popup_profile, popupThongtin, popup_nhanluot_signUp) — *(57% — nếu có form profile nhận quà)*
- popup_selectrole (hoặc popup_select_role, popup_role, popupRole) — **(optional — popup đổi server/nhân vật `pm__selectrole-module`; corpus ~32%; có trong file cũng không tính popup thừa, không Pass/Fail)**

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md), **trừ các khác biệt dưới đây**.

### Khác biệt của loại này

- `popup_register` / `popupProfileInfo`: form payment thường có thêm `input[name="UserID"]` (32% file) — **không bắt buộc**, thiếu không fail.
- `popup_condition`: **BỎ QUA hoàn toàn** — với loại payment popup này là optional, không chạy structure check kể cả khi nó tồn tại trong file.
