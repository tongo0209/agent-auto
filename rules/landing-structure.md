# R-STR-* · Cấu trúc landing trong cdn-source (section, trang, clone, bàn giao)

Áp cho **cách tổ chức** một campaign assets-flat (R-CDN-1): folder section, markup Twig, tên, trang phụ, build
optimize, tài liệu. Cách viết SCSS/ảnh/font: [`cdn-source-standard.md`](cdn-source-standard.md) (R-CDN/R-SPR). JS:
[`landing-js.md`](landing-js.md) (R-JS). Hook platform `pm__`: [`pm-contract.md`](pm-contract.md) (R-PM).
`MUST` = chặn · `SHOULD` = lệch thì nói rõ lý do.

**Vì sao có file này:** quét 18 campaign 2026 + 10 bản clone `ma-dao-vinh-hoa` (23/9/2026) thấy lỗi cấu trúc lặp
theo đường clone: tên bundle `AI_Agent`, folder mang mã campaign cũ, `<head>` chép tay từng trang lệch version lib,
list gõ tay từng khối, `<body class>` thêm class làm lib tra trượt tên quà. Kiểu tốt thành luật; kiểu chưa tốt ghi
❌ cũ / ✅ chuẩn. Đoạn code dưới là mẫu tự viết, KHÔNG phải code campaign.

**Landing cũ:** đụng tới đâu chuyển tới đó; phần thấy mà không chạm → mục *7. Nợ kỹ thuật* của file dự án
(`project-note path <campaign>`). **Campaign đã bàn giao: KHÔNG đổi tên folder/bundle** (R-STR-3). Landing mới: đúng ngay từ đầu.

**Dẫn chứng** viết `<game>/<slug>/<file>:<dòng>` = `products/<game>/landing/<slug>/<file>`; `libraryMainsite/…` = `products/libraryMainsite/…`.

## Luật

| ID | Sev | Luật (chi tiết + ví dụ ở mục dưới) |
|---|---|---|
| **R-STR-1** | MUST | Section `<x>/`: twig mở bằng `<section id="<x>">`, mọi rule của `<x>.scss` lồng dưới `#<x> { }`; selector trần chỉ ở `main/` |
| **R-STR-2** | MUST | CSS/SCSS chỉ style class vai trò, cấm style/định vị bám `.pm__…` hay `.MS__sprite-<tên png>`; JS nối engine chọn hook `pm__` theo R-JS-1/R-JS-5 |
| **R-STR-3** | MUST | Clone xong, trước dòng code đầu: đặt lại `name`, tên folder theo vai trò, sửa typo kế thừa; kebab/BEM, cấm snake_case. Đã bàn giao thì giữ nguyên |
| **R-STR-4** | MUST | Trang phụ trong iframe: `generateFile` + `separateFiles.<key>`, trang con nạp đúng `<key>.css/js`, iframe mang `MJ__setFrame` |
| **R-STR-5** | MUST | Nhiều trang/ngôn ngữ/game = 1 layout partial + map dữ liệu; 1 campaign đúng 1 version lib |
| **R-STR-6** | MUST | List đều trong Twig = mảng `{% set %}` + 1 `{% for %}`; cấm chép tay từng khối |
| **R-STR-7** | MUST | Campaign đã bàn giao: đuôi ảnh HTML BE đang trỏ phải đứng yên qua mọi lần `build-optimize` |
| **R-STR-8** | MUST | Tài liệu cho người (BE, dev sau) không vào `generateFile[]`/`dist/`; ghi chú dự án → file dự án |
| **R-STR-9** | MUST | `<body class="{{ locate }}">` — đúng 1 mã locate, không thêm class nào |

### R-STR-1 · MUST · Section = folder, id = tên folder, SCSS bọc trong id
`<x>/<x>.html.twig` mở bằng `<section id="<x>">` — id trùng tên folder, đúng hoa/thường (R-CDN-3 lo phần tên file).
Mọi rule trong `<x>.scss` nằm dưới `#<x> { }`: CSS mọi section nối vào 1 file, rule không bọc rò sang section khác
và sang popup. Selector trần `html`/`body`/`a`/`img` chỉ được ở `main/`. Section cần nav cuộn tới thì thêm
`MJ__setFrame` (lib gom `.MJ__setFrame` làm khung cho `MJ__scrollToFrame`).
```scss
// ❌ navigation.scss dòng 1 — mọi thẻ <a> của trang, kể cả popup, ăn rule này
a { color: #fff; }

// ✅ navigation/navigation.scss
#navigation {
  a { color: #fff; }
}
```
Dẫn chứng ✅: `jx1m/2026-tinh-quang-chi-da/assets/Frame2/Frame2.html.twig:13` + `Frame2/Frame2.scss:2` · `tqht/2026-trung-thu-menh-hon/assets/vote/vote.scss:2` · `mwly/2026-dang-nhap-nhan-qua/assets/diemdanh/diemdanh.scss:7`. ❌: `gno/2026-request-landing-convert/assets/frame1/frame1.html.twig:1` (`id="frame-1"` ≠ folder `frame1`) + `frame1/frame1.scss:2` (không bọc) · `kto/2026-sinh-nhat-thang3/assets/kto-26-sinhnhat3tuoi-navigation/kto-26-sinhnhat3tuoi-navigation.scss:1` (`a {`) · `pwm/2026-v34-ani/assets/frame4/frame4.scss:8` (`html, body` trong section).

### R-STR-2 · MUST · CSS bám class vai trò, JS nối engine bám hook
Phần tử mang `pm__…` hoặc `MS__sprite-*` luôn có thêm class vai trò (`turns__value`, `spin-actions__btn`), đứng
đầu: `<vai-trò/BEM> [MS__…] [MJ__…] pm__… <state>`.
- **CSS/SCSS** chỉ style class vai trò — không style, không định vị `.pm__…` hay `.MS__sprite-*`. Lý do: hook đổi
  theo kit/BE, PNG đổi tên là layout lệch âm thầm (`.MS__sprite-<tên>` chính là tên file ảnh).
- **JS** gắn hành vi riêng của campaign vào class vai trò; chỗ nối engine và đọc/ghi dữ liệu platform chọn hook
  `pm__` như R-JS-*: `el.action: '.pm__rut'` (R-JS-1), node BE bơm số `.pm__point` (R-JS-5).

Hook lấy đúng tên trong kit (R-PM-7) — không đẻ `pm__` mới cho có chỗ bám style. Cột/hàng nút đều nhau → container
flex/grid + `gap` (R-LAY-1), không gắn toạ độ từng nút. Ngoại lệ duy nhất cho CSS: DOM do engine render, không gắn
được class riêng → được chọn `.pm__…` nhưng lồng dưới `#<section>`.
```scss
// ❌ SCSS bám hook platform và tên PNG; mỗi nút một toạ độ
.pm__point { color: var(--c-title); }
.MS__sprite-quay-x1 { left: 212px; }
.MS__sprite-quay-x10 { left: 406px; }
```
```twig
{# ✅ class vai trò đứng đầu, hook đặt đúng thẻ kit quy định #}
<p class="turns">Lượt quay: <span class="turns__value pm__point">0</span></p>
<div class="spin-actions">
	<a href="#" class="spin-actions__btn MS__sprite-quay-x1 pm__rut" data-value="1"></a>
	<a href="#" class="spin-actions__btn MS__sprite-quay-x10 pm__rut" data-value="10"></a>
</div>
```
```scss
// ✅
.turns__value { color: var(--c-title); }
.spin-actions { position: absolute; left: 212px; top: 640px; display: flex; gap: 40px; }
```
Dẫn chứng ✅: `jx1m/2026-tinh-quang-chi-da/assets/Frame2/Frame2.html.twig:18,24` · `tqht/2026-trung-thu-menh-hon/assets/vote/vote.html.twig:18`. ❌: `nghichthuyhan/2026-affiliate-2/assets/Frame1/Frame1.html.twig:31,37-38` ← `Frame1/Frame1.scss:39` (`pm__spin-count` lại là hook không có trong kit — kit dùng `pm__point`) · `ddtank/2026-chengdu-tournament/assets/Frame2/Frame2.scss:138-140` (toạ độ bám tên PNG, lại là cột đều bước 94px) · `gnmobinew/2026-trung-thu/assets/Frame2/Frame2.scss:290,296`. Ngoại lệ engine render: `jxm/2026-vo-lam-tinh-tu-bh/assets/binhchon/binhchon.scss:175` · `ghoststory/2026-2nd-anniverary/assets/frame2/frame2.scss:361`.

### R-STR-3 · MUST · Đặt tên khi clone
Clone xong, **trước dòng code đầu**: `name` trong `config.js` = `<game>` hoặc `<game>-<slug>` của chính campaign
(không `AI_Agent`, không tên game khác); folder section đặt lại theo vai trò (`frame1`, `footer`, `diem-danh`), không
mang mã campaign cũ (`kto-tet-*`, `vxphl-ld-25-a-*`); sửa typo kế thừa (`navigaion`). Folder và class mới:
kebab-case hoặc BEM `khoi__phan--bien`, cấm snake_case (đếm ở `promo-states.md` mục đặt tên). Section đánh số
theo kiểu campaign đang dùng, `FrameN` hoặc `frameN` (đo 23/9 trên 184 campaign 2026: 60 `FrameN`, 23 `frameN`,
0 trộn) — không trộn 2 kiểu trong 1 campaign, id vẫn trùng đúng hoa/thường (R-STR-1). **Campaign ĐÃ bàn
giao: GIỮ nguyên `name` và folder** — `name` sinh ra `{{name}}.css/js`, folder nằm trong `dist/optimized/<folder>/…`,
cả hai đang được HTML BE trỏ tới.
```js
// ❌ config.js clone từ campaign khác
name: 'AI_Agent',
folderUse: ['main', 'kto-tet-vongquay', 'navigaion'],

// ✅
name: 'xx-sinh-nhat',
folderUse: ['main', 'vong-quay', 'navigation'],
```
Dẫn chứng ❌: `ghoststory/2026-2nd-anniverary/config.js:2,10` · `pwm/2026-v34-ani/config.js:2,10` · `nghichthuyhan/2026-affiliate-2/config.js:2` (toàn repo 28 `config.js` còn `AI_Agent`) · `jx1/2026-ma-dao-vinh-hoa/config.js:2,6` (`name: 'jx2'`, folder `kto-tet-vongquay`) · `taydu2/2026-tam-gioi-ky-ngo/config.js:6` · snake_case: `kto/2026-sinh-nhat-thang3/assets/index.html.twig:13`, `omg3q/2026-sinh-nhat-9/assets/Footer/Footer.html.twig:14`. Bẫy đổi tên sau bàn giao: `lan/2026-trung-thu/config.js:2-3`.

### R-STR-4 · MUST · Trang phụ trong iframe
Module cần trang riêng (điểm danh, đột phá… nhúng bằng iframe): thêm trang vào `generateFile[]` + khai
`separateFiles.<key> = { files: ['main', '<section>', 'libraryMainsite-t-popup'], name: '<key>' }`; trang con nạp đúng
`<key>.css`/`<key>.js`; `<iframe>` ở trang cha mang `MJ__setFrame MJ__setFollowFrame` như một section. Trang con nạp
`{{ name }}.css` là kéo cả landing vào iframe, còn bundle riêng build ra không ai dùng.
```twig
{# ❌ iframe-diemdanh.html.twig — separateFiles đã build bundle riêng #}
<link rel="stylesheet" href="{{ name }}.css"/>

{# ✅ diemdanh.html.twig, separateFiles.diemdanh.name = 'diemdanh' #}
<link rel="stylesheet" href="diemdanh.css">
```
Dẫn chứng ✅: `tqht/2026-trung-thu-menh-hon/config.js:26-30` + `assets/index.html.twig:22` + `assets/diemdanh.html.twig:16` · `omg3q/2026-sinh-nhat-9/config.js:27` + `assets/index.html.twig:15` + `assets/dotpha.html.twig:8`. ❌: `kto/2026-sinh-nhat-thang3/config.js:23` + `assets/iframe-diemdanh.html.twig:9` · `gnmobinew/2026-trung-thu/assets/main/html/body.html.twig:190` (iframe, không có `separateFiles`).

### R-STR-5 · MUST · Nhiều trang dùng chung 1 layout
Campaign có ≥2 trang (ngôn ngữ, game, biến thể): `<head>` (lib CSS/JS, preload, SEO) + khung body ở **1** partial
`main/html/…html.twig`; mỗi trang = 1 dòng include kèm biến; khác biệt (URL, ảnh, text) gom vào 1 map `{% set %}`.
Version lib **1 giá trị** cho cả campaign, kể cả trang iframe (R-HO-4). Cổng:
`grep -ohE 'prod-source/[0-9.]+' assets/*.html.twig assets/main/html/*.twig | sort -u` ra đúng 1 dòng.
```twig
{# ❌ index.html.twig, index-en.html.twig, index-th.html.twig: 3 bản <head> ~85 dòng chép tay #}

{# ✅ index-en.html.twig #}
{% include './main/html/layout.html.twig' with { locate: 'en' } %}
```
Dẫn chứng ✅: `gnmobinew/2026-trung-thu/assets/gno.html.twig:1` + `assets/main/html/body.html.twig:9,165,186` (6 trang, mỗi trang 1 dòng). ❌: `kto/2026-sinh-nhat-thang3/assets/iframe-diemdanh.html.twig:8` (lib `1.1.2`) vs `assets/index.html.twig:7` (`1.3.0`) · `lan/2026-trung-thu/assets/index.html.twig`, `index-en.html.twig`, `index-th.html.twig` (3 bản chép; `main/html/loading*.html.twig` 3 file cùng md5).

### R-STR-6 · MUST · List trong Twig sinh từ dữ liệu
List đều (mốc, ngày điểm danh, ô quà, hạng) = mảng `{% set %}` đầu file + **1** `{% for %}`; ảnh đánh số theo
`loop.index`. Seed trạng thái trong mảng chỉ để xem local đủ 3 trạng thái (R-ST-1) — trạng thái thật do platform ghi
đè lúc chạy. Clone chỉ khác số mốc ⇒ sửa mảng, không nhân khối. Đây là nửa markup của R-LAY-1/R-LAY-8.
```twig
{# ❌ 8 khối gõ tay chỉ khác số #}
<div class="gift-box box-a pm__milestone" data-milestone="5">…</div>
<div class="gift-box box-b pm__milestone" data-milestone="10">…</div>

{# ✅ #}
{% set tiers = [{ need: 5, state: 'received' }, { need: 10, state: 'active' }, { need: 20, state: 'off' }] %}
{% for tier in tiers %}
	<div class="tier tier-{{ loop.index }} pm__milestone {{ tier.state }}" data-milestone="{{ tier.need }}">…</div>
{% endfor %}
```
Dẫn chứng ✅: `jx1m/2026-tinh-quang-chi-da/assets/Frame2/Frame2.html.twig:2-3,17` · `gnmobinew/2026-trung-thu/assets/Frame2/Frame2.html.twig:14-16` (ghi rõ platform ghi đè trạng thái) · `gno/2026-request-landing-convert/assets/frame2/frame2.html.twig:2-4`. ❌: `tqht/2026-trung-thu-menh-hon/assets/vongquay/vongquay.html.twig:65,70` · `jx1/2026-ma-dao-vinh-hoa/assets/kto-tet-milestone/kto-tet-milestone.html.twig:15,24,33` (10 bản clone chỉ khác số mốc) · `metalslug/2026-h5-commander/assets/frame2/frame2.html.twig:12,18`.

### R-STR-7 · MUST · Đuôi ảnh đứng yên sau bàn giao
`build-optimize` chọn webp hay định dạng gốc theo **tổng dung lượng cả bộ** (`webpack.config.optimize.js:366-377`, bản
chung 184 campaign cùng md5) ⇒ đổi nội dung 1 ảnh là đuôi cả bộ có thể lật, HTML BE giữ riêng ở
`gt-promotion-template` trỏ đuôi cũ ⇒ 404. Campaign đã bàn giao: build xong, trước khi giao lại, kiểm mọi URL
`…/<slug>/dist/…` trong HTML bàn giao còn file thật (chạy ở thư mục campaign, không in gì = đạt; đo trên
`omg3q/2026-sinh-nhat-9/html-pro/index.html`: 38 URL, 0 dòng 404):
`grep -oE '<slug>/dist/[^"'"'"') ?]+' <html bàn giao> | sed 's#^.*/dist/#dist/#' | sort -u | while read p; do [ -f "$p" ] || echo "404 $p"; done`.
Cần ghim đuôi thì dùng cơ chế campaign đang có; chưa có thì port `pinExt` của jx1m (key
tính từ `assets/`, bỏ đuôi) — **không tự viết thêm cơ chế thứ 4** (đang có 3 bản khác tên: `pinExt`, `forceExt`, `pinnedExt`).

Dẫn chứng: `jx1m/2026-tinh-quang-chi-da/config.js:20-24` (lý do + map `pinExt`) + `webpack.config.optimize.js:48` · `cfl/2026-offline-tournament/webpack.config.optimize.js:48,208` (`forceExt`) · `gno/2026-request-landing-convert/webpack.config.optimize.js:185` (`pinnedExt`, cả 5 campaign cùng họ).

### R-STR-8 · MUST · Tài liệu không ship lên CDN
Tài liệu cho người đọc (hướng dẫn gắn hook cho BE, hợp đồng hook tự đặt `data-<mã>-*`, toạ độ, quy ước màn) không
vào `generateFile[]` — trang sinh ra nằm trong `dist/`, chính thư mục CDN phục vụ (URL bàn giao trỏ
`…/<campaign>/dist/…`, R-HO-1), ai đoán được đường dẫn là đọc được. Ghi chú dự án → file dự án (R-PM-11); gửi BE qua kênh
bàn giao. `documentsClass.txt` (167 bản cùng md5 chép theo template) là cheat-sheet, không phải nguồn chân lý —
nó ghi `MS__pc / MS__mb` như tiện ích lib trong khi CSS lib 1.3.0 không có (R-CDN-19); danh mục `MS__`/`MJ__` hợp lệ
đọc từ lib (`libraryMainsite/prod-source/<ver>/`). `_docs/` trong thư mục campaign: chuyển sang file dự án khi chạm.
```js
// ❌ config.js — trang ghi chú cho BE build ra dist/ cạnh trang thật
generateFile: ['index', 'index-en', 'notes-for-be'],
// ✅
generateFile: ['index', 'index-en'],
```
Dẫn chứng ❌: `cfl/2026-offline-tournament/config.js:27` + `assets/huong-dan.html.twig:1-3` (`dist/huong-dan.html` đang git-track) · `lan/2026-trung-thu/_docs/hop-dong-hook.md:1` (4 file) · `lan/2026-trung-thu/documentsClass.txt:1-3`.

### R-STR-9 · MUST · `<body class>` chỉ mang mã locate
`<body class="{{ locate }}">` — đúng 1 mã (`vn` `en` `th` `id` `cn`), không thêm class nào, ở **mọi** trang kể cả
iframe con. Lib tra tên quà và câu báo hết lượt theo NGUYÊN chuỗi class của body
(`names[$("body").attr("class")][indexWord]`, `notEnoughCp[$("body").attr("class")]` trong `libraryMainsite-1.3.0.js`)
⇒ trang có gameplay mà body là `"vn h5frame"` hay `<body>` trống là trượt khoá (`undefined`). Đo 23/9: 252/354 file
twig 2026 có `<body` mang đúng mã locate. Class game/trang/font đặt trên `<html>`. `<html lang>`
đặt đúng cho SEO/trình đọc màn hình nhưng JS không đọc nó (R-JS-13). Giữ khung này khi bàn giao (R-HO-3).
```twig
{# ❌ #}
<body class="{{ locate }} page-h5">
{# ✅ #}
<html lang="vi" class="page-h5">
	<body class="{{ locate }}">
```
Dẫn chứng ✅: `jxm/2026-vo-lam-tinh-tu-bh/assets/index.html.twig:10` · `omg3q/2026-sinh-nhat-9/assets/index.html.twig:10` · `mwly/2026-dang-nhap-nhan-qua/assets/index.html.twig:19`. ❌: `tlbb/2026-thienlongtambao/assets/index.html.twig:12` · `ghoststory/2026-bingo-h5/assets/index.html.twig:13` (`vn h5frame`; JS phải tự tách ở `Frame1/Frame1.js:51`) · `taydu2/2026-tam-gioi-ky-ngo/assets/index.html.twig:12` + `metalslug/2026-h5-commander/assets/index.html.twig:11` (`<body>` không class, lib 1.3.0).

## Luật cũ vẫn bị vi phạm lặp lại (không đẻ luật mới)
- **R-POP-3** — `base.html.twig` sửa riêng từng campaign, rơi `MS__content` + nút `MS__popup-close MJ__close-popup`:
  `taydu2/2026-tam-gioi-ky-ngo/assets/libraryMainsite-t-popup/html/base.html.twig:1-3` (kèm `gift-10` gắn lên MỌI popup) ·
  `mwly/2026-dang-nhap-nhan-qua/assets/libraryMainsite-t-popup/html/base.html.twig:1-3`. ✅ tuỳ biến bằng biến Twig có default:
  `gno/2026-request-landing-convert/assets/popup/html/base.html.twig:1` (`{{ popupTheme|default('') }}`).
- **R-POP-5** — module popup không được include: `jxm/2026-vo-lam-tinh-tu-bh/assets/libraryMainsite-t-popup/` 13 module / 8 include.
- **R-POP-4** — họ `2026-request-landing-convert` đổi thư viện popup thành `popup/` (`gno/2026-request-landing-convert/config.js:11`) và để nguyên
  `libraryMainsite-t-popup/` 114 file git-track không ai tham chiếu.
- **R-HO-1** — bản bàn giao chép tay / script riêng thay vì `tools/mk-handoff-html.py`: `jxm/2026-vo-lam-tinh-tu-bh/index.html:267` (URL tương đối sót) ·
  `taydu2/2026-tam-gioi-ky-ngo/cdn-rewrite.js:2-3` (script one-shot).
- **R-JS-8** — mock đi vào bundle giao BE: `lan/2026-trung-thu/assets/main/main.js:9` (`import "./_mockup.js"`). ✅ `cfl/2026-offline-tournament/webpack.config.js:15-16,43` (`DEMO=1` mới nạp `*.demo.js`).
- **R-CDN-13 + R-CS-1** — code chết: `ddtank/2026-chengdu-tournament/assets/Frame5/Frame5.js:1-49` (toàn comment) · `jx1/2026-ma-dao-vinh-hoa/assets/main/promotion3.js`
  (không entry nào nạp — webpack chỉ nạp `<item>/<item>.js`).
- **R-JS-9 + R-ST-7** — router màn tự viết mỗi campaign, tên class màn khác nhau: `lan/2026-trung-thu/assets/main/_state.js:137-138` (`.is-active`) ·
  `cfl/2026-offline-tournament/assets/main/main.js:75` (`.active`).
- **R-PM-1** — đang đạt: 10 bản clone `2026-ma-dao-vinh-hoa` giữ nguyên tập 16 hook `pm__`; cổng `tools/landing-parity.mjs` đã so tập này.

## Quan hệ với các luật khác
- SCSS/font/ảnh/sprite: [`cdn-source-standard.md`](cdn-source-standard.md) — R-CDN-*, R-SPR-*. JS: [`landing-js.md`](landing-js.md) — R-JS-*.
- List/layout: [`layout-standard.md`](layout-standard.md) — R-LAY-*. Trạng thái ô quà: [`promo-states.md`](promo-states.md) — R-ST-*.
- Popup: [`popup-library.md`](popup-library.md) — R-POP-*. Bàn giao: [`html-handoff.md`](html-handoff.md) — R-HO-*.
- Clone/reskin xong: `node ~/VNG/agent-auto/tools/landing-parity.mjs <campaign>`. Dọn code theo file này: `/clean-code` (nhóm 5).
