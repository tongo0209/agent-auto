# Checklist — STT 9: VOTE (voting / bình chọn)

> Dùng cho STT: 9, 38 (tạm).

> Validation checklist cho event type **voting**.
> Alias: `binh-chon`, `vote`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).
> **Evidence base**: phân tích 65 template voting production (TEMPLATE-VOTE). Threshold: ≥60% required, 40-59% required-conditional.

## required_popups
- popup_inform (hoặc popup_notice, popupAlert1, popupAlert2, popupThongbao)
- popup_rule (hoặc popup_thele, popup_rules, popupThele)
- popup_history (hoặc popupLichsu, popupHistory) — *(nếu có flow xem lịch sử vote)*
- popup_condition (hoặc popupCondition, popup_nhanluot, popup_nhanluot_condition) — *(nếu có điều kiện nhận lượt vote)*
- popup_register (hoặc popup_mrmiss_reg, popupProfileInfo, popup_resgiter, popupThongtin, popup_nhanluot_signUp) — *(nếu có flow đăng ký dự thi)*

## POPUP STRUCTURE CHECK

Theo [`_popup-structure.md`](_popup-structure.md), **trừ các khác biệt dưới đây**.

### Khác biệt của loại này

- `popup_register` / `popup_mrmiss_reg`: form đăng ký dự thi thường có thêm `input[type="file"][name="MediaImage[0..3]"]` (ảnh thí sinh).
  Có flow dự thi mà thiếu input file → ⚠️ Warning (không fail).
