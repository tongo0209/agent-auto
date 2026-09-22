# POPUP STRUCTURE CHECK — phần dùng chung cho MỌI loại promotion

> Trước đây đoạn này bị chép nguyên trong từng file checklist (10/12 file trùng khớp tuyệt đối).
> Sửa ở đây là sửa cho tất cả. Loại nào có ràng buộc riêng thì ghi thêm trong file của loại đó.

## Tên nhận diện

Id kit và id production là CÙNG MỘT popup (production thắng kit — dòng `kind=alias` trong `~/VNG/agent-auto/rules/pm-kit-overrides.tsv`). Layer 3 nhận popup theo tên dưới đây HOẶC theo variant của item tương ứng trong checklist loại.

- **Đăng nhập**: `popup_login` ≡ `popup_signIn` (kit) · `popup_dangnhap` · `popupDangnhap` · `popup_auth`
- **Đăng ký thông tin**: `popup_register` ≡ `popup_nhanluot_signUp` (kit) · `popup_dangky` · `popupDangky` · `popupChonNV` · `popupProfileInfo` · `popupThongtin` · `popup_profile`
- **Điều kiện**: `popup_condition` (kit Lucky Draw) · `popupCondition` (kit Payment) · `popupDieukien`
- **Thông báo**: `popup_inform` (kit) · `popupThongbao`

## POPUP STRUCTURE CHECK (áp dụng chung cho mọi loại)

Chỉ check khi popup tương ứng **tồn tại** trong file. Nếu popup không có → skip, không fail.

### Popup đăng ký thông tin

Element BẮT BUỘC bên trong (thiếu bất kỳ mục nào → ❌ Fail):
1. `<form>` bên trong popup
2. Trong form: `select[name="ServerID"]` — và `<option>` ĐẦU TIÊN của select này phải có class `server-select-title`
3. Trong form: select thứ 2 `select[name="CharacterID"]` — và `<option>` ĐẦU TIÊN của select này phải có class `character-select-title`
4. Trong form: `button[type="submit"]` (hoặc `button` / `a` đóng vai trò submit cho form — text "Đăng ký", "Xác nhận", "Submit")

Select tồn tại nhưng option đầu tiên KHÔNG có đúng class → ❌ Fail mục đó (ghi rõ lý do "option đầu thiếu class ...").

### Popup điều kiện

Element bắt buộc bên trong:
1. `form` có `id="pm__condition-form"` (hoặc id chứa "condition")
2. Ít nhất 1 `input` (captcha hoặc text input)
3. **MỌI thẻ `<form>` bên trong popup đều phải có button submit RIÊNG của form đó** (`button[type="submit"]` hoặc `button`/`a` đóng vai trò submit nằm TRONG form — text "Nhận lượt", "Xác nhận", "Submit") — **NGOẠI TRỪ 2 dạng form sau, bỏ qua không check submit**:
   - Form invite (mời bạn): form có id/class/name chứa `invite`, `loimoi` hoặc `moiban`
   - Form share FB: form có id/class/name chứa `share`, `fb` hoặc `facebook`

Mỗi form thiếu button submit (ngoài 2 ngoại lệ trên) → ❌ Fail 1 dòng riêng, ghi rõ form nào (id/class + line).

#### Biến thể Payment

Áp khi gameplay là `payment`: checklist `13-khuyen-mai-nap.md` (STT 13, 10) luôn là payment; loại khác đọc gameplay trong file dự án (`node ~/VNG/agent-auto/tools/project-note.mjs path <file>` → mục `## 1. Khoá`, dòng `- gameplay:`). MASTER-payment chỉ có `pm__share-form` + `pm__invite-form`, KHÔNG có `pm__condition-form`/captcha (AI-RULES-payment cấm thêm hook Lucky Draw) ⇒ mục 1-2 ở trên thay bằng:
1. Có ≥1 `<form>` trong popup (`pm__share-form`, `pm__invite-form`, hoặc form id chứa `condition`)
2. Có `pm__invite-form` → form đó có ≥1 `input` (ô link mời / ô nhập mã). Popup chỉ còn form share (kit cho cắt nguyên block không dùng) → bỏ qua mục này.

Mục 3 (submit riêng, trừ form invite/share) giữ nguyên.

### Popup thông báo

ĐẠT nếu có MỘT trong hai cấu trúc (không có cả hai → ❌ Fail "không có vùng chữ thông báo"):
1. **Cấu trúc kit**: phần tử class `pm__inform-text` (thẻ bất kỳ) nằm trong popup — MASTER đặt nó dưới 1 lớp bọc, không có `.MS__content`, không có `<p>`. Đây chỉ là dấu nhận cấu trúc, không phải soát `pm__`.
2. **Cấu trúc production cũ**: `<p>` trực tiếp trong container `.MS__content` / `.content`.
