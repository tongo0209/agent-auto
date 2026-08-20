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

## POPUP STRUCTURE CHECK (áp dụng chung cho mọi loại)

Chỉ check khi popup tương ứng **tồn tại** trong file. Nếu popup không có → skip, không fail.

### popup_register / popup_dangky / popupChonNV / popupProfileInfo / popup_mrmiss_reg (popup đăng ký thông tin)

Element BẮT BUỘC bên trong (thiếu bất kỳ mục nào → ❌ Fail):
1. `<form>` bên trong popup
2. Trong form: `select[name="ServerID"]` — và `<option>` ĐẦU TIÊN của select này phải có class `server-select-title`
3. Trong form: select thứ 2 `select[name="CharacterID"]` — và `<option>` ĐẦU TIÊN của select này phải có class `character-select-title`
4. Trong form: `button[type="submit"]` (hoặc `button` / `a` đóng vai trò submit cho form — text "Đăng ký", "Xác nhận", "Submit")

Select tồn tại nhưng option đầu tiên KHÔNG có đúng class → ❌ Fail mục đó (ghi rõ lý do "option đầu thiếu class ...").

**Voting-specific**: Form đăng ký dự thi thường có thêm `input[type="file"][name="MediaImage[0..3]"]` (ảnh thí sinh) — nếu có flow dự thi mà thiếu input file → ⚠️ Warning.

### popup_condition / popupDieukien / popupCondition

Element bắt buộc bên trong:
1. `form` có `id="pm__condition-form"` (hoặc id chứa "condition")
2. Ít nhất 1 `input` (captcha hoặc text input)
3. **MỌI thẻ `<form>` bên trong popup đều phải có button submit RIÊNG của form đó** (`button[type="submit"]` hoặc `button`/`a` đóng vai trò submit nằm TRONG form — text "Nhận lượt", "Xác nhận", "Submit") — **NGOẠI TRỪ 2 dạng form sau, bỏ qua không check submit**:
   - Form invite (mời bạn): form có id/class/name chứa `invite`, `loimoi` hoặc `moiban`
   - Form share FB: form có id/class/name chứa `share`, `fb` hoặc `facebook`

Mỗi form thiếu button submit (ngoài 2 ngoại lệ trên) → ❌ Fail 1 dòng riêng, ghi rõ form nào (id/class + line).

### popup_inform / popupThongbao

Element bắt buộc bên trong:
1. `<p>` trực tiếp trong container `.MS__content` / `.content`
