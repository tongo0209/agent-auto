# Dev Report: GW-814 lane A (header/footer/nav) — vòng 1

## Files đã tạo / sửa
- `cfl-ms-25-header/cfl-ms-25-header.html.twig` — bg mới, bỏ logo/tagline/video (đã bake vào bg, video lệch nội dung — xem "Ngoài phạm vi"), thêm title/lantern/ribbon/qr-panel/social-icons, `.info` rút gọn còn tên (bỏ "Xin chào," vì đã bake trong bg)
- `cfl-ms-25-header/cfl-ms-25-header.scss`, `cfl-ms-25-header.sprite.scss` — toạ độ absolute theo `coords.json`, height 1050(PC)/1664(MB)
- `cfl-ms-25-header/images/*` — bg/bg-mb/title/title-mb/lantern-mb/ribbon/ribbon-mb/qr-panel (PNG mới từ design) + `sprite/btn-login.png`, `sprite/social-icons.png`; xoá bg.jpg/bg-mb.jpg/logo.png/tagline.png/3kf.mp4/sprite/btn-logout.png
- `gnm-ld-sn-footer/gnm-ld-sn-footer.html.twig` + `.scss` — bg mới (logo Qookka+VNG đã bake), bỏ `<img logo-footer.png>` + wrapper `.gr_footer` thừa, `<p>` absolute theo vùng chữ đo được
- `gnm-ld-sn-footer/images/bg.png`, `bg-mb.png` (mới); xoá bg.jpg/bg-mb.jpg/logo-footer.png
- `tanomg3q-ld-daile-navigation/*.html.twig` + `.scss` + `.sprite.scss` — bg (logo đã bake) thay bg-nav.png, bỏ `<a class="logo">`, login theo sprite dang-nhap mới, bỏ box-shadow hack cũ (nút đã có viền riêng)
- `tanomg3q-ld-daile-navigation/images/bg-nav.png` (overwrite), `sprite/btn-login.png` (overwrite 228×66); xoá logo.png, sprite/btn-logout.png

## Quyết định kỹ thuật
- `.info` (tên user header): bg PC/MB đã bake sẵn "Xin chào Chúa Công:" nên bỏ literal "Xin chào," trong twig, giữ `p.name > span` (không đổi tên class — nghi ngờ platform ngoài bundle đọc selector này để set username, không có JS login trong bundle này).
- `right-menu-misc`/`group-27` (QR + social icon cluster): không có link/URL thật trong brief → render tĩnh, không gắn `href` thật (xem "Cần quyết định").
- Gỡ `<div class="MJ__loadVideo" data-video="3kf.mp4">`: video baked nội dung nhân vật KHÁC hẳn key art Trung Thu (cảnh trăng-hươu thay vì pháo hoa/lân sư rồng), che mất bg.png mới + hộp "Xin chào Chúa Công" — xác nhận bằng screenshot PC trước/sau. Rác kế thừa từ `2026-van-son-khai-te`.
- Đo toạ độ `.info`, `<p>` footer bằng PIL crop trực tiếp trên PNG design (không có asset text riêng để chạy `design-diff.py match`) — ước lượng bbox, không phải số đo chính xác pixel.

## Lệch spec
Không có spec chính thức (task giao trực tiếp qua brief + design assets), không tính là "lệch spec".

## Rules đã áp
| Nhóm file | Mã luật đã áp/kiểm |
|---|---|
| `cfl-ms-25-header/*.scss` | R-CDN-4,5,6 (px tuyệt đối, `@include mobile`, không sửa generated) · R-SPR-1,3,4,5,7 (đọc webpack.config.js, sửa PNG nguồn, `@include sprite()`, không tự viết `background-position`) |
| `*.html.twig` (3 module) | R-CDN-9 (giữ `MS__pc/MS__mb/MJ__*`) · R-CDN-13 (dọn rác kế thừa: logo/tagline/video/logo-footer trùng bg mới) |
| tất cả file sửa | R-CS-1 (2 comment 1 dòng, lý do đo toạ độ) · R-CS-2,3 (bỏ wrapper `.gr_footer` thừa, bỏ box-shadow hack không còn cần) |

## Kết quả verify
- build (`npm run build-dev`, cold — xoá `node_modules/.cache`): PASS, `webpack 5.99.9 compiled successfully`
- lint/type-check/test: repo không có
- runtime console: sạch (`read_signals level=error` rỗng sau khi loại trừ 404 `favicon.ico` — không thuộc phạm vi 3 module)
- Self-smoke (pre-handoff): PASS
  - selector đã assert: `#cfl-ms-25-header`, `#cfl-ms-25-header .btn-login`, `#cfl-ms-25-header .title`, `#cfl-ms-25-header .qr-panel`, `#cfl-ms-25-header .social-icons`, `#cfl-ms-25-header .info .name` (text đúng), `#gnm-ld-sn-footer`, `#tanomg3q-ld-daile-navigation` (MB) / vắng đúng trên PC
  - viewport: PC 1920×1080 ✓ · MB 768×1024 (reload 1 lần) ✓
  - screenshot: `~/VNG/.browserpilot/shots/gw814-lanea-pc-full-4.png` (PC header trước khi gỡ video), `mb-header-6.png`/`mb-nav-7.png`/`mb-footer-8.png` (MB, có popup đăng nhập của `libraryMainsite-t-popup` che mờ phía trên — popup này tự bật do chưa có session, KHÔNG thuộc 3 module của tôi, xác nhận qua DOM text không lặp)

## Cần quyết định / Cần hỗ trợ / Ngoài phạm vi
- **QR + link tải app** (`qr-panel.png`, group-27 social icons): design chỉ có ảnh tĩnh, không có URL App Store/Google Play/APK hay link Facebook/Youtube/TikTok thật → hiện render tĩnh, không `href`. Cần PM cấp link để gắn.
- **Video `3kf.mp4` đã xoá** (nội dung không khớp design mới) — nếu có video ĐÚNG cho sự kiện Trung Thu này, cần cấp lại file, tôi sẽ wire lại `MJ__loadVideo` y nguyên cấu trúc cũ.
- **Nút "Đăng xuất"**: design không có asset riêng, đã bỏ SCSS/sprite của `.btn-logout`, giữ dòng comment HTML `<!--...-->` làm chỗ trống cho sau này.
- Ngoài phạm vi: `libraryMainsite-t-popup` tự bật popup đăng nhập ngay khi load trang (không phải bug của tôi, không sửa vì ngoài 3 folder cho phép).

## Đề xuất knowledge
### [mistake] Video overlay `MJ__loadVideo` có thể che mất bg mới mà build vẫn xanh
- **Bối cảnh:** clone campaign cũ sang campaign mới, header giữ nguyên `<div class="MJ__loadVideo" data-video="...">` từ scaffold.
- **Vấn đề:** video autoplay đè lên toàn bộ `<img class="background">`, nội dung video (nhân vật/cảnh) không khớp design mới — chỉ phát hiện qua browser screenshot, build/lint không báo gì.
- **Nguyên nhân gốc:** video là asset media không nằm trong coords.json/PSD nên bước "so khớp design" bằng ảnh tĩnh bỏ sót nó.
- **Lần sau:** sau khi build, luôn screenshot PC thật (không chỉ đọc code) cho section có `MJ__loadVideo`/`MJ__lazyload` media để xác nhận nội dung hiển thị khớp asset mới, không chỉ khớp code.
- **Phạm vi:** mọi dự án cdn-source có scaffold-clone.
