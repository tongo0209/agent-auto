# Checklist — STT 13: KHUYẾN MÃI NẠP (payment / nạp tiền / topup)

> Dùng cho STT: 13, 10 (tạm).

> Validation checklist cho event type **payment** (PromoTypeID = 15).
> Alias: `nap-tien`, `topup`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).
> **Evidence base**: phân tích 377 template payment production. Threshold: ≥60% required, 40-59% required-conditional.
> **Đo 23/9/2026** (id điều kiện): 4 campaign cdn-source có hook payment (`pm__btn_claim`/`pm__totalCash`) — 3 dùng `popup_condition` (tính cả Twig/`dist`), 0 dùng `popupCondition`; bàn giao gt-promotion: 3/4 file có hook payment dùng `popup_condition`, 0 file nào dùng `popupCondition`.

## required_popups
- popup_inform (hoặc popupAlert1, popupAlert2, popupAlert3, popupThongbao)
- popup_history (hoặc popupLichsu)
- popup_rule (hoặc popup_thele, popupThele)
- popup_login (hoặc popupDangnhap, popup_signIn, popup_auth)
- popupCondition (hoặc popup_condition, popupDieukien, popup_getturn, popup_nhanluot, popup_nhanluot_condition) — bắt buộc: gameplay payment luôn có popup điều kiện (MASTER-payment dùng `popupCondition`; bàn giao production hay dùng `popup_condition` — cả hai đều Pass, lệch id so với kit do pm-gate bắt)
- popup_reward (hoặc popup_reward2, popup_doiqua, popupPhanthuong) — *(75% — popup hiển thị quà nhận được)*
- popup_register (hoặc popup_profile, popupThongtin, popup_nhanluot_signUp) — *(57% — nếu có form profile nhận quà)*
- popup_selectrole (hoặc popup_select_role, popup_role, popupRole) — **(optional — popup đổi server/nhân vật `pm__selectrole-module`; corpus ~32%; có trong file cũng không tính popup thừa, không Pass/Fail)**

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md), **trừ các khác biệt dưới đây**.

### Khác biệt của loại này

- `popup_register` / `popupProfileInfo`: form payment thường có thêm `input[name="UserID"]` (32% file) — **không bắt buộc**, thiếu không fail.
- Popup điều kiện (`popupCondition` hoặc variant): loại này là gameplay payment → áp **Biến thể Payment** trong `_popup-structure.md`, không dùng mục 1-2 bản Lucky Draw.
