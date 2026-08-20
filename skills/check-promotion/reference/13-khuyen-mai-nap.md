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

## POPUP STRUCTURE CHECK (áp dụng chung cho mọi loại)

Chỉ check khi popup tương ứng **tồn tại** trong file. Nếu popup không có → skip, không fail.

### popup_register / popup_dangky / popupChonNV / popupProfileInfo (popup đăng ký thông tin)

Element BẮT BUỘC bên trong (thiếu bất kỳ mục nào → ❌ Fail):
1. `<form>` bên trong popup
2. Trong form: `select[name="ServerID"]` — và `<option>` ĐẦU TIÊN của select này phải có class `server-select-title`
3. Trong form: select thứ 2 `select[name="CharacterID"]` — và `<option>` ĐẦU TIÊN của select này phải có class `character-select-title`
4. Trong form: `button[type="submit"]` (hoặc `button` / `a` đóng vai trò submit cho form — text "Đăng ký", "Xác nhận", "Submit")

Select tồn tại nhưng option đầu tiên KHÔNG có đúng class → ❌ Fail mục đó (ghi rõ lý do "option đầu thiếu class ...").

**Payment-specific**: Payment form thường có thêm input `name="UserID"` (32% file) — không bắt buộc, không fail nếu thiếu.

### popup_condition / popupDieukien / popupCondition

**BỎ QUA cho loại payment** — popup_condition là optional (xem required_popups), không chạy structure check kể cả khi popup tồn tại trong file.

### popup_inform / popupThongbao

Element bắt buộc bên trong:
1. `<p>` trực tiếp trong container `.MS__content` / `.content`
