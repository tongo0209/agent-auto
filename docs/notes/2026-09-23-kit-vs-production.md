# AI template kit lệch bản bàn giao đang chạy — cần team chốt

Đo ngày 23/9/2026 · kit `standard-html-templates/ai-template-kit` ở commit `72bcec9c` (gt-promotion-template).

**Tóm tắt:** kit dùng tên id popup khác với gần như mọi landing đã bàn giao. Làm đúng kit thì ra id mà
production hầu như không dùng; làm theo production thì lệch kit. Cần team chốt id nào là chuẩn nền tảng.
Trong lúc chờ, bên mình tạm theo bản bàn giao đang chạy.

## 1. Id popup: kit vs production

| Popup | Kit | cdn-source (số campaign) | gt-promotion bàn giao (số file `.html`) |
|---|---|---|---|
| Đăng nhập | `popup_signIn` | `popup_login` 181 · `popup_signIn` 1 | `popup_login` 107 · `popup_signIn` 0 |
| Đăng ký thông tin | `popup_nhanluot_signUp` | `popup_register` 164 · `popup_nhanluot_signUp` 0 | `popup_register` 137 · `popup_nhanluot_signUp` 0 |
| Điều kiện (Payment) | `popupCondition` | `popupCondition` 21 | `popupCondition` 0 · `popup_condition` 135 |

Hàng cuối: 21 campaign trong cdn-source dùng `popupCondition`, nhưng không file bàn giao nào có id này —
bản bàn giao dùng `popup_condition`.

Cách đếm (chạy lại được, thay `<id>`):
- cdn-source, đứng ở `products/` — số thư mục `<game>/landing/<slug>` có ít nhất 1 file `.twig`/`.html` chứa id:
  `grep -rlF '<id>' --include='*.twig' --include='*.html' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.claude . | grep -oE '^\./[^/]+/landing/[^/]+' | sort -u | wc -l`
- gt-promotion-template, đứng ở gốc repo — số file `.html` chứa id, bỏ chính thư mục kit:
  `grep -rlF '<id>' --include='*.html' --exclude-dir=.git --exclude-dir=.claude --exclude-dir=standard-html-templates . | wc -l`

## 2. Chỗ kit tự lỗi — đề nghị sửa

| Chỗ | Vấn đề |
|---|---|
| `gameplays/luckydraw-gift-exchange/MASTER-luckydraw-gift-exchange.html:499` | Gọi `getElementById('popup_noti')` nhưng cả `standard-html-templates/` không có phần tử nào `id="popup_noti"` (0 file) → luôn trả `null`. |
| `gameplays/payment/components/popups/popup-condition.html:2` | Còn `pm__module` trên `popupCondition`, trong khi `MASTER-payment.html:279` và bảng hook của `AI-RULES-payment.md` (dòng 74) chỉ có `pm__condition-module`. Copy popup rời thì ra khác MASTER. |
| `AI-Template-Kit-Huong-dan-su-dung.docx` | Mục cấu trúc thư mục ghi `popup-login.html` gồm "MTO + SSO3 + VGA", nhưng `components/common/popups/popup-login.html` không có chữ "VGA" nào, và ngoài docx không file nào trong kit nhắc VGA. |

## 3. Hook 🔸 "bổ sung" chưa có trong MASTER

Mỗi file AI-RULES (Lucky Draw, Payment) có 6 hook 🔸 — production có dùng nhưng MASTER không có.
Ví dụ `pm__btn-history` (nút mở `popup_history`): chính AI-RULES ghi thiếu nút này thì không mở được
popup lịch sử. Dev dựng thẳng từ MASTER sẽ thiếu các hook này nếu không đọc kỹ AI-RULES.

## 4. Câu hỏi cần team trả lời

1. **Id nào là chuẩn nền tảng** (id mà JS platform thật sự bind): `popup_login` / `popup_register` /
   `popup_condition` như bản bàn giao, hay `popup_signIn` / `popup_nhanluot_signUp` / `popupCondition`
   như kit — hay platform nhận cả hai?
2. **Kit có định đổi id của các landing đang chạy không**, hay kit sẽ sửa lại theo production?
3. **Các hook 🔸 có được đưa vào MASTER không?** Nếu không, những hook nào là bắt buộc thêm tay khi dựng
   từ MASTER (vd `pm__btn-history`, `pm__btn-show-condition`, `pm__menu-invite`)?
