# Checklist — STT 1: ĐĂNG KÝ TRƯỚC (pre-register)

> Dùng cho STT: 1, 14 (tạm), 20, 21 (tạm); merge trong combo 3.

> Validation checklist cho event type **pre-register**.
> Alias: `dang-ky-truoc`
> Skill `check-promotion` này read-only — chỉ check popup bắt buộc + cấu trúc popup quan trọng (KHÔNG check pm__ class).

## required_popups
- popup_login (hoặc popup_dangnhap, popupDangnhap)
- popup_inform (hoặc popupThongbao)
- popup_reward (hoặc popup_reward_draw)
- popup_history (hoặc popupLichsu)

## POPUP STRUCTURE CHECK (áp dụng chung cho mọi loại)

Chỉ check khi popup tương ứng **tồn tại** trong file. Nếu popup không có → skip, không fail.

### popup_register / popup_dangky / popupChonNV / popupProfileInfo (popup đăng ký thông tin)

Element BẮT BUỘC bên trong (thiếu bất kỳ mục nào → ❌ Fail):
1. `<form>` bên trong popup
2. Trong form: `select[name="ServerID"]` — và `<option>` ĐẦU TIÊN của select này phải có class `server-select-title`
3. Trong form: select thứ 2 `select[name="CharacterID"]` — và `<option>` ĐẦU TIÊN của select này phải có class `character-select-title`
4. Trong form: `button[type="submit"]` (hoặc `button` / `a` đóng vai trò submit cho form — text "Đăng ký", "Xác nhận", "Submit")

Select tồn tại nhưng option đầu tiên KHÔNG có đúng class → ❌ Fail mục đó (ghi rõ lý do "option đầu thiếu class ...").

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
