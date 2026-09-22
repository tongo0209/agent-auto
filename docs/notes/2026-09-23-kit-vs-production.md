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

## Bổ sung sau khi đo 34 campaign thật (23/9)

Cổng soát tự động của bên mình đã chạy trên 34 landing thật (cdn-source + bản bàn giao gt-promotion-template). Những chỗ dưới đây production làm khác kit một cách lặp lại — bên mình tạm theo production. Nhờ team xác nhận từng dòng: kit sửa theo, hay production đang sai.

| Gameplay | Kit ghi | Production dùng | Loại lệch | Số đo |
|---|---|---|---|---|
| * | `popup_signIn` | `popup_login` | production dùng tên khác | cdn-source 94 campaign popup_login vs 1 popup_signIn; gt-promotion 106 vs 0 |
| * | `popup_nhanluot_signUp` | `popup_register` | production dùng tên khác | cdn-source 113 campaign popup_register vs 0; gt-promotion 136 vs 0 |
| luckydraw-gift-exchange | `popup_noti` | — | kit tự lỗi | MASTER-luckydraw:499 getElementById('popup_noti') không có phần tử |
| payment | `pm__module@popup-condition` | — | kit tự lỗi | components/popups/popup-condition.html:2 còn pm__module, MASTER đã bỏ |
| * | `mto-login-form` | — | bỏ khỏi bắt buộc | gtp 0/29 request có id="mto-login-form"; 10 request có pm__btn-login đặt thẳng trong pm__login-module · rg -l 'id="mto-login-form"' gt-promotion-template -g '**/Promotion/*.html' |
| * | `pm__anchor` | — | bỏ khỏi bắt buộc | gtp 7/29 request có pm__anchor · rg -l pm__anchor gt-promotion-template -g '**/Promotion/*.html' |
| * | `pm__anchor@pm__login` | — | bỏ khỏi bắt buộc | gtp 1/13 request đặt pm__anchor cùng thẻ pm__login; cdn 10/12 campaign không kèm · rg -l -e 'pm__login [^"]*pm__anchor' -e 'pm__anchor [^"]*pm__login[ "]' |
| * | `pm__anchor@pm__logout` | — | bỏ khỏi bắt buộc | gtp 2/11 request đặt pm__anchor cùng thẻ pm__logout; cdn 24/25 campaign không kèm |
| * | `pm__login` | `repeat` | cho phép | gtp 5 request có ≥2 pm__login/file (header + menu MS__mb) · rg -c -o 'class="([^"]* )?pm__login[ "]' |
| * | `pm__logout` | `repeat` | cho phép | gtp 5 request có ≥2 pm__logout/file (header + menu MS__mb) |
| * | `pm__login` | `h5` | bỏ khỏi bắt buộc | H5: gtp 0/9 request, cdn 0/32 campaign có pm__login (webview trong game đã đăng nhập) · rg -l 'H5\s*:\s*true' gt-promotion-template -g '**/Promotion/*.html' |
| * | `pm__logout` | `h5` | bỏ khỏi bắt buộc | H5: gtp 0/9, cdn 1/32 có pm__logout |
| * | `popup_login` | `h5` | bỏ khỏi bắt buộc | H5: gtp 3/9, cdn 9/32 có popup_login (kèm pm__login-module) |
| * | `pm__btn-login` | `h5` | bỏ khỏi bắt buộc | H5: gtp 1/9, cdn 1/32 có pm__btn-login |
| * | `pm__zing` | `h5` | bỏ khỏi bắt buộc | nhóm provider pm__zing/appleid/google/email/facebook — H5: gtp 1/9, cdn 2/32 |
| * | `popup_register` | `h5` | bỏ khỏi bắt buộc | H5: gtp 3/9, cdn 17/32 có popup_register (kèm pm__profileinfo-module) |
| * | `pm__profile-form` | `h5` | bỏ khỏi bắt buộc | H5: gtp 3/9, cdn 17/32 có id="pm__profile-form" |
| * | `input-phone` | — | bỏ khỏi bắt buộc | 0 file có id="input-phone" (gtp 10 file, cdn 97 file có name="Phone") · rg -l 'id="input-phone"' gt-promotion-template cdn-source/products -g '*.html' |
| * | `input-zalo` | — | bỏ khỏi bắt buộc | 0 file gtp/cdn có id="input-zalo" |
| luckydraw-gift-exchange | `pm__rut pm__btn-claim` | — | chỉ cần 1 trong các id | gtp: 5 request chỉ quay (pm__rut, không pm__btn-claim), 4 chỉ đổi quà, 12 cả hai · rg -l 'class="([^"]* )?pm__rut[ "]' vs rg -l pm__btn-claim, -g '**/Promotion/*.html' |
| luckydraw-gift-exchange | `pm__point` | `pm__rut` | when | gtp: 0 request có pm__rut mà thiếu pm__point; 4 request chỉ đổi quà không có cả hai |
| payment | `popupCondition popup_condition` | — | chỉ cần 1 trong các id | payment production (có pm__btn_claim): popup_condition ở mwly/2026-dang-nhap-nhan-qua, taydu2/2026-phuc-loi-nap-2 + bàn giao 118-NLMB/LandingDangNhapNhanQua2026_58378 (= bản của mwly), popupCondition 0; gtp popupCondition 0 file vs popup_condition 134 · rg -l 'id="popupCondition"' |
| luckydraw-gift-exchange | `popup_condition popupCondition` | — | chỉ cần 1 trong các id | cdn 21 campaign có id="popupCondition" — 0 là payment, 37/151 file kèm pm__rut/pm__btn-claim (vd tlbb/2026-thienlongtambao) · rg -l 'id="popupCondition"' cdn-source/products -g '*.html' -g '*.twig' -g '!node_modules' |
| payment | `pm__condition-form` | `gameplay` | cho phép | 2/3 campaign payment cdn (có pm__btn_claim ở dist): mwly/2026-dang-nhap-nhan-qua, taydu2/2026-phuc-loi-nap-2 dùng, gnmobinew/2026-trung-thu không · gtp chỉ 1 request payment là 118-NLMB/LandingDangNhapNhanQua2026_58378 = bản bàn giao của mwly, giữ nguyên · 2 campaign riêng biệt, dưới ngưỡng ≥3 → cần team xác nhận |
| * | `pm__menu-invite` | `popup` | cho phép | gtp 6 request đặt trong popup (danh sách nhiệm vụ của popup điều kiện) vs 3 ngoài · đếm tổ tiên id popup* bằng tools/pm-gate/scan.mjs |
| * | `pm__menu-date` | `popup` | cho phép | gtp 6 request trong popup vs 4 ngoài |
| * | `pm__menu-invitecode` | `popup` | cho phép | gtp 3 request trong popup vs 1 ngoài |
| * | `pm__charactername` | `repeat` | cho phép | 3 campaign có ≥2 pm__charactername/trang: ddtank/2026-chengdu-tournament (MS__pc + MS__mb, bàn giao 496_GNOTH giữ nguyên), gtp 381-DT3Q, gtp A49-CFL/h5rungkybi-56985 |
| * | `pm__pagination` | `in:pm__*-module` | cho phép | phân trang trong module khác rank/history: gtp 221_JXM/RequestH5BinhChonVoLam_56193 (pm__home-module), gtp 016_GunnyPC/LDP_PROMOTION_SanPetChiTon_T9_58656 (pm__condition-module) |
| * | `pm__pagination` | `in:pm__rankchar-pagination` | cho phép | 4 campaign dùng pm__pagination + pm__rankchar-pagination cho BXH nhân vật ngoài popup: jxm/2026-vo-lam-tinh-tu, jxm/2026-vo-lam-tinh-tu-bh, ghoststory/2026-2nd-anniverary, gtp 221_JXM · rg -l pm__rankchar-pagination (cdn 5 campaign, gtp 3 request) |
| * | `pm__milestone` | `in:pm__total*-milestone` | cho phép | wrapper dải mốc ngoài totalregister: pm__totaldraw-milestone 2, pm__totalmodulebyguild-milestone 2 (vd kto/2026-sinh-nhat-thang3), pm__totalmember-milestone 1, pm__totalmodule-milestone 1 campaign/request · rg -o 'pm__total[A-Za-z]*-milestone' cdn-source/products gt-promotion-template |
| luckydraw-gift-exchange | `popup_condition` | `h5` | bỏ khỏi bắt buộc | H5 Lucky (có pm__rut/pm__btn-claim) không popup điều kiện — lượt đến từ trong game: gtp 4/7 request (A49-CFL h5rungkybi, lanxier, monthlycardt9, wumengmeng), cdn 5/19 (cfl/2025-may-quay-chien-binh, cfl/2026-rung-ky-bi, cfl/2026-truy-tim-kho-bau, ovensmash/2026-leftmenu, zsm/2026-dua-co-hoi-h5) |
| luckydraw-gift-exchange | `popup_history` | `h5` | bỏ khỏi bắt buộc | H5 Lucky không popup lịch sử: gtp 2/7 (A49-CFL h5rungkybi, monthlycardt9), cdn 3/19 (cfl/2025-may-quay-chien-binh, cfl/2026-rung-ky-bi, zsm/2026-dua-co-hoi-h5) — 4 campaign riêng biệt |
| luckydraw-gift-exchange | `pm__form-history` | `h5` | bỏ khỏi bắt buộc | H5 Lucky không pm__form-history: gtp 1/7 (A49-CFL monthlycardt9), cdn 3/19 (cfl/2025-may-quay-chien-binh, cfl/2026-truy-tim-kho-bau, zsm/2026-dua-co-hoi-h5) |
| * | `pm__playnow` | `like:pm__zing` | cho phép | provider đăng nhập Play Now cạnh pm__btn-login: cdn 4 campaign (boomzth/2025-anniversary-2, boomzth/2025-webshop, ddtank/2025-vote, gnmobinew/2026-trung-thu), gtp 2 request (622-Bomber-VNG/Request-landing-convert-(ZSM-GNO)-57041) · rg -l -e 'pm__playnow[ "]' |
| luckydraw-gift-exchange | `pm__title-form` | `in:pm__condition-module` | cho phép | gtp 3 request đặt pm__title-form thẳng trong pm__condition-module, ngoài form: 496_GNOTH/ChengduTournamentWebEvent2026_55990, A78-LAN/H5-Halloween-56357, LAN/h5trungthu-53730 (AI-RULES Payment cũng cho "trực tiếp trong pm__condition-module") |

**Cần team chốt (mẫu dưới 3 campaign, bên mình chưa dám coi là chuẩn):**
- Payment dùng `pm__condition-form`: 2 campaign riêng biệt (mwly, taydu2); bản bàn giao 118-NLMB chính là bản của mwly.
- `pm__pagination` nằm trong module khác (`pm__home-module`, `pm__condition-module`): 2 request (221_JXM, 016_GunnyPC).
- Hook Lucky (`pm__rut`, `pm__point`) trên trang Payment: AI-RULES Payment không liệt kê là cấm, production payment 0/4 nhóm có — có được phép không?
- `server-select-title` đi kèm `pm__text_select_server`: README kit nói JS dựa vào class này, nhưng cdn dist 83 nhóm thiếu / 3 có, gt-promotion 14 thiếu / 19 có.
- `pm__point` gắn 2 lần (header + popup) ở 2 campaign; captcha trong Payment ở 1 campaign — bên mình đang coi là lỗi.
