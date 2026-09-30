# cdn-source — chuẩn code landing/skin + R-CDN-*

`/Users/lap17727/VNG/git-vng/cdn-source` · monorepo landing page & mainsite skin VNGGames.
Đọc file này **trước khi** viết dòng code đầu tiên trong repo đó — kể cả sửa vặt.

**Vì sao có file này:** knowledge `~/.claude/knowledge/code-developer/` là **ảnh chụp** code hiện có, nó mô tả
"đang có gì", không phán "phải theo cái nào". Khi campaign cũ và campaign mới cùng nằm trong ảnh chụp, agent
chọn nhầm thế hệ cũ mà vẫn thấy "đúng knowledge" — ra code chậm, sai cơ chế scale, sai engine gameplay.
File này là **luật**: khi luật và ảnh chụp đá nhau, luật thắng.

**Dẫn chứng** viết `<game>/<slug>/<file>:<dòng>` = `products/<game>/landing/<slug>/<file>`; `libraryMainsite/…` = `products/libraryMainsite/…`.

## Facts (kiểm 2026-08-19, có bằng chứng)

| Việc | Thực tế |
|---|---|
| Stack | Webpack 5 + Twig (`twig-loader`) + SCSS (Dart Sass) + vanilla JS. KHÔNG framework, KHÔNG TypeScript, KHÔNG Babel, KHÔNG test/CI |
| Đơn vị làm việc | 1 campaign = `products/<game>/[landing/]<campaign>/`, độc lập, có `package.json` + webpack riêng |
| Thư viện dùng chung | `libraryMainsite` nạp từ CDN, **bản đang dùng ở campaign mới nhất là `prod-source/1.3.0`** (`products/cfl/landing/2026-hanh-trinh-cua-fox/assets/index.html.twig:6,7,17`) |
| jQuery / Swiper | **global từ CDN libraryMainsite**, không bundle. Major Swiper khác nhau theo project — đọc `package.json` |
| Popup | module `libraryMainsite-t-popup/` **copy vào từng campaign**, KHÔNG nằm trong bundle CDN — xem `popup-library.md` |
| Hai thế hệ cùng tồn tại | `assets-flat` (chuẩn hiện hành) — **189** campaign có `assets/index.html.twig` · `src-setup` (legacy) — **121** thư mục `src/setup/`, **123** file `_promotion.js` (đếm 19/8/2026, đã trừ `dist/`+`node_modules`) |
| Verify | `npm run build-dev` one-shot. `npm run dev` là `webpack --watch` — treo phiên |

## Nguồn chân lý & cách tiến hoá

1. **File này** (R-CDN-*) — luật, do user chốt. Mọi skill/agent theo.
2. `~/.claude/knowledge/code-developer/base/` + `cdn-source-conventions.md` — **chi tiết & ví dụ** cho luật ở đây.
3. Mode `learn` của `/code-developer` **chỉ được ĐỀ XUẤT** sửa luật (in ra cho user duyệt), **KHÔNG tự ghi đè**
   file này. Ảnh chụp code có thể chụp trúng campaign làm ẩu — không được để nó thành luật.

## Luật

| ID | Sev | Luật |
|---|---|---|
| **R-CDN-1** | MUST | **Chốt thế hệ trước khi viết.** `assets/index.html.twig` + `config.js` có `folderUse[]` → **assets-flat** (chuẩn hiện hành). `src/<gameplay>/{js,scss,html}` + `src/setup/js/_promotion.js` → **src-setup** (legacy). Cấm trộn: không bê `dndPromotion`/helper `src/setup/` vào campaign assets-flat, không bê `window.libraryMainsite.promotion` vào campaign legacy. |
| **R-CDN-2** | MUST | **Tạo campaign mới = clone thế hệ MỚI.** Nguồn clone hợp lệ: `products/libraryMainsite/prod-source/<bản mới nhất>` hoặc một campaign **assets-flat** gần đây. Cấm clone campaign legacy `src-setup` để dựng mới, kể cả khi gameplay giống hệt. |
| **R-CDN-3** | MUST | **`config.js` là single source of truth.** Thêm section = tạo folder + file **trùng tên folder** (`frame1/frame1.{html.twig,scss,js}`) + thêm tên vào `folderUse[]`. Thêm page = thêm `generateFile[]`. Thả folder vào `assets/` mà quên `folderUse[]` → webpack bỏ qua âm thầm, build vẫn xanh. `main` luôn đứng đầu `folderUse`. Section không có JS: đọc hàm dựng entry của `webpack.config.js` — có `fs.existsSync(jsPath)` (`libraryMainsite/prod-source/1.3.1/webpack.config.js:50`, `gnmobinew/2026-trung-thu/webpack.config.js:40`) thì bỏ file JS được; không có guard đó thì giữ file JS rỗng 0 byte. Cấu trúc section/trang: [`landing-structure.md`](landing-structure.md) (R-STR-*). |
| **R-CDN-4** | MUST | **px tuyệt đối + absolute.** Phần tử trong section dùng `position:absolute` và px tuyệt đối — libraryMainsite scale cả `#MS__wrapper`. Dùng `rem`/`%`/`flex` để căn giữa toàn cục là chống lại hệ scale. |
| **R-CDN-5** | MUST | **Cấm viết `@media` tay.** Responsive CHỈ qua mixin global `@include mobile` / `@include pc` (inject bằng sass `additionalData`). Thân mixin phụ thuộc `$maxWidthMB` và **khác nhau theo project** — đọc `additionalData` trong `webpack.config.js` trước khi dùng. Hand-roll `@media` phá hợp đồng H5. |
| **R-CDN-6** | MUST | **Không sửa `*generated.scss`** (vd `scss/sprite.generated.scss`) — webpack-spritesmith sinh lại mỗi lần build. Sửa sprite = sửa PNG nguồn trong `images/sprite/`. Cách DÙNG sprite: xem mục **R-SPR-*** cuối file. |
| **R-CDN-7** | MUST | **jQuery / Swiper / `window.libraryMainsite` là global CDN.** Cấm `npm install`, cấm `import`, cấm bundle chúng. JS section giả định `$`/`Swiper`/`window.libraryMainsite` đã tồn tại. |
| **R-CDN-8** | MUST | **Không tự viết engine gameplay.** Vòng quay / gacha / mốc thưởng / đổi quà / điểm danh đã có: `window.libraryMainsite.promotion` (assets-flat) hoặc `dndPromotion` (`src/setup/js/_promotion.js`, legacy). Section chỉ cấp config + `animResult`/callback. Tra `~/.claude/knowledge/code-developer/gameplay-registry.json` trước khi code gameplay — cấm đoán, cấm né bằng cách tự viết lại. |
| **R-CDN-9** | MUST | **Prefix là hợp đồng.** `MS__*` = layout/style của libraryMainsite, `MJ__*` = hook hành vi JS của lib. Cấm bịa `MS__`/`MJ__` mới, cấm đổi tên, **giữ nguyên cả typo** (`MJ__toogleActive`). |
| **R-CDN-10** | MUST | **H5 (webview ngang)**: `config.js` đặt `H5: true`, `maxWidthMB: '0'`, `scaleWidthMB: 0`; KHÔNG thêm breakpoint mobile (mixin `mobile` không khớp là đúng thiết kế). Kiểm 1 view ngang 1920×1080, không đổi viewport. |
| **R-CDN-11** | MUST | **Verify = `npm run build-dev`** one-shot, đọc stdout/stderr, `ERROR in` hoặc exit ≠ 0 thì fix tới khi sạch. CẤM `npm run dev` để verify (watch — treo phiên). Build production: đọc `scripts` trong `package.json` của **từng** project (`build-pro` vs `build-optimize` khác nhau). Project track `dist/` (vd `community/skin-2026-new`): `build-dev` xoá `dist/optimized/**` + fonts → khôi phục `git checkout -- dist/`. |
| **R-CDN-12** | SHOULD | Thụt lề: Twig = **TAB**, SCSS = **2 space**. Tên section kebab-case theo vai trò (`frame1`, `footer`, `diem-danh`); section đánh số `FrameN`/`frameN` theo kiểu campaign đang dùng — tên mang mã campaign cũ kiểu `vxphl-ld-25-a-*` là rác clone, không phải mẫu (R-STR-3). |
| **R-CDN-13** | MUST | **Rác kế thừa ≠ chuẩn.** Campaign clone thường còn popup/ảnh/`_promotion-v2.js` của chiến dịch cũ không dùng. Không lấy chúng làm mẫu, không mang sang campaign mới. Ngược lại: `prodTemplate` trong `configProduction.html.twig` và engine promotion là **đồ sống**, không phải rác. |
| **R-CDN-14** | MUST | **Campaign hiện tại làm sai luật này thì báo, đừng bắt chước.** Thấy code trong repo lệch R-CDN-* → nói ra ở phần tổng kết (file:line), sửa nếu nằm trong phạm vi task, KHÔNG im lặng nhân bản cái sai sang chỗ mới. |

## SCSS, font, ảnh — R-CDN-15..23

Quét 16 campaign 2026 (23/9/2026): cùng một việc viết nhiều kiểu. Kiểu tốt thành luật, kiểu chưa tốt ghi
❌ cũ / ✅ chuẩn. Đoạn code dưới là mẫu tự viết, KHÔNG phải code campaign. Landing cũ: đụng tới đâu chuyển tới
đó, phần thấy mà không chạm → mục 7 Nợ của file dự án (như R-SPR-2).

| ID | Sev | Luật (chi tiết + ví dụ ở mục dưới) |
|---|---|---|
| **R-CDN-15** | MUST | Breakpoint + mixin `mobile`/`pc` chỉ đến từ `additionalData`; cấm khai lại, cấm `@import` `main/scss/mixin.scss` |
| **R-CDN-16** | MUST | Font: `woff2` subset + `font-display: swap`, khai bằng 1 map `$fonts` + `@each`; cấm ship TTF/TTC/OTF bản đủ |
| **R-CDN-17** | SHOULD | Màu, font-family, z-index dùng ở ≥2 section → token `:root { --c-* --f-* --z-* }` trong `main/scss/_tokens.scss` |
| **R-CDN-18** | MUST | Ảnh/khối CSS dùng ở ≥2 section đặt ở `main/`; cấm section trỏ ảnh của section khác |
| **R-CDN-19** | MUST | `.MS__pc`/`.MS__mb` khai đúng 1 lần ở `main.scss` — CSS lib không có luật hiển thị cho cặp này |
| **R-CDN-20** | MUST | `<img>` dưới màn đầu: `MJ__lazyload` + `data-src`; ảnh màn đầu giữ `src`; không trộn `loading="lazy"` |
| **R-CDN-21** | SHOULD | Ảnh đục lưu `.jpg`/`.webp` ngay tại nguồn; PNG chỉ cho ảnh có alpha thật |
| **R-CDN-22** | SHOULD | UI bám màn hình bên trong vùng đã scale: `var(--sr-device-height)` của lib, không `100vh` |
| **R-CDN-23** | SHOULD | N phần tử cùng hiệu ứng CSS: 1 `@keyframes`, tham số từng phần tử qua CSS var hoặc `animation-delay` âm |
| **R-CDN-24** | MUST | Code mới chỉ trỏ `https://cdn-mainsite-aka.vnggames.com/` — `global-mainsite.mto.zing.vn` đã ngưng |

### R-CDN-15 · MUST · Breakpoint chỉ từ `additionalData`
`webpack.config.js` bơm `$maxWidthMB`/`$minWidthPC` + `@mixin mobile|pc` vào đầu mọi file SCSS (R-CDN-5). File
nào khai lại — thường là `main/scss/mixin.scss` chép theo template rồi được `@import` ở popup `base.scss` — sẽ đè
giá trị của `config.js` trong file đó: trang H5 `maxWidthMB: "0"` bị bật lại `@include mobile` ở ≤768px. Clone
xong: xoá `main/scss/mixin.scss` và mọi dòng `@import` nó.
```scss
// ❌ popup scss/base.scss — mixin.scss khai lại $maxWidthMB: 768px
@import "../../main/scss/mixin.scss";

// ✅ không import gì, mixin đã có sẵn
.box { @include mobile { width: 700px; } }
```
Dẫn chứng: `taydu2/2026-tam-gioi-ky-ngo/assets/libraryMainsite-t-popup/scss/base.scss:1` + `assets/main/scss/mixin.scss:2-3` vs `config.js:16` (`maxWidthMB: "0"`) · `metalslug/2026-h5-commander/assets/libraryMainsite-t-popup/scss/base.scss:1` vs `config.js:17` · `mwly/2026-dang-nhap-nhan-qua/assets/libraryMainsite-t-popup/scss/base.scss:1` (lặp lại `webpack.config.js:318-319`). Toàn repo còn 66 popup `base.scss` có dòng import này.

### R-CDN-16 · MUST · Font
Chỉ ship `woff2`, subset theo chữ thật (tiếng Việt, chỉ số…) bằng `pyftsubset --text/--unicodes`, hậu tố
`-subset`/`-digits` để người sau biết file không đủ bộ chữ; mọi `@font-face` có `font-display: swap`. Khai bằng
**1** map `$fonts` + `@each` sinh cả `@font-face` lẫn class `.MS__<Tên>` theo mẫu lib
(`libraryMainsite/prod-source/1.3.1/assets/main/scss/fonts.scss`, đổi `src` sang woff2) — tên class = font-family
= tên file. Class `.MS__<Tên-font>` sinh từ map theo đúng mẫu đó không tính là bịa `MS__` (R-CDN-9). Clone xong xoá
file trong `main/fonts/` không `@font-face` nào trỏ tới (R-CDN-13).
```scss
// ❌ TTF bản đủ, không swap, class gõ tay tên lệch font-family
@font-face { font-family: "Title"; src: url("./fonts/Title-Full.ttf"); }
.MS__title { font-family: "Title-Bold"; }

// ✅ main/main.scss
$fonts: ("Title-Bold": "./fonts/Title-Bold-subset.woff2");
@each $name, $path in $fonts {
  @font-face { font-family: $name; src: url($path) format("woff2"); font-display: swap; }
  .MS__#{$name} { font-family: $name; }
}
```
Dẫn chứng ❌: `ghoststory/2026-2nd-anniverary/assets/main/main.scss:12` (`dist/fonts/FZCYSK.ttf` 11,4MB) · `taydu2/2026-tam-gioi-ky-ngo/assets/main/main.scss:12,17` (`.ttc`) · tên lệch: `jx1m/2026-tinh-quang-chi-da/assets/main/main.scss:49`, `omg3q/2026-sinh-nhat-9/assets/main/main.scss:26`, `ddtank/2026-chengdu-tournament/assets/main/main.scss:51`. ✅: `lan/2026-trung-thu/assets/main/main.scss:53-55` (woff2 chỉ gồm chữ số) · `tqht/2026-trung-thu-menh-hon/assets/main/main.scss:24-27` · `cfl/2026-offline-tournament/assets/main/main.scss:21-24`.

### R-CDN-17 · SHOULD · Token dùng chung
Mỗi section là 1 entry Sass biên dịch riêng nên `$var` khai ở `main` không sang được section; CSS custom property
thì sang (mọi CSS nối vào cùng trang). Màu, font-family, z-index xuất hiện ở ≥2 section → `main/scss/_tokens.scss`
khai `:root { … }`, `@import` ở `main.scss`, section dùng `var(--…)`. Tên theo vai trò (`--c-title`), không theo giá
trị (`--blue-005ac0`). z-index là **1 thang** trong token, popup nâng đúng 1 chỗ (`libraryMainsite-t-popup/scss/base.scss`).
`$var` chỉ giữ cho số cần tính bằng Sass (bề rộng canvas…), để trong file chỉ-biến rồi `@import`.
```scss
// ❌ cùng mã màu gõ lại ở 3 frame; z-index mỗi file một số
color: #f0c75e;
z-index: 1500;

// ✅ main/scss/_tokens.scss
:root { --c-subtitle: #f0c75e; --z-nav: 100; --z-drawer: 200; --z-popup: 1000; }
// frameN.scss
color: var(--c-subtitle);
z-index: var(--z-drawer);
```
Dẫn chứng ✅: `gpn/2026-he-ruc-ro/assets/main/scss/_tokens.scss:1-8` + `assets/main/main.scss:4` (đúng cơ chế; tên theo giá trị như `--blue-005ac0` ở file này là phần KHÔNG theo) · `lan/2026-trung-thu/assets/main/scss/_tokens.scss:3,69`. ❌: `gnmobinew/2026-trung-thu/assets/Frame2/Frame2.scss:70` = `Frame3/Frame3.scss:55` = `Frame4/Frame4.scss:54` · `pwm/2026-v34-ani/assets/main/main.scss:10` = `frame3/frame3.scss:61` = `frame4/frame4.scss:15` · z-index: `cfl/2026-offline-tournament/assets/bottomnav/bottomnav.scss:36`, `header/scss/_drawer.scss:15`, `frame1/scss/_thongbao.scss:26`, `libraryMainsite-t-popup/scss/base.scss:55` · `jx1m/2026-tinh-quang-chi-da/assets/Frame1/Frame1.scss:357`, `libraryMainsite-t-popup/scss/base.scss:10`, `main/main.scss:191`.

### R-CDN-18 · MUST · Thứ dùng ở ≥2 section nằm ở `main/`
Ảnh dùng ở ≥2 section → `main/images/` (`main` luôn đứng đầu `folderUse`). Section cấm trỏ ảnh của section khác
(`../Frame4/images/…`, `/assets/<section khác>/…`): ảnh sống chết theo section chủ — đổi tên, xoá hay bỏ section
đó khỏi `folderUse` (pipeline optimize chỉ nén `assets/<folderUse>/images/**`, `webpack.config.optimize.js:4`) là
section này mất ảnh mà không ai sửa nó. Khối CSS giống hệt ở ≥2 section (`.sr-only`, tiêu đề phụ) → 1 class global
trong `main.scss`, gắn class đó trong Twig — `@extend`/placeholder không xuyên được entry.
```scss
// ❌ frame3.scss mượn ảnh của frame2
.badge { background: url("../frame2/images/badge.png") no-repeat; }

// ✅ ảnh chuyển về main/images/
.badge { background: url("../main/images/badge.png") no-repeat; }
```
Dẫn chứng ❌: `lan/2026-trung-thu/assets/Frame5/Frame5.scss:139-141,163` · `cfl/2026-offline-tournament/assets/frame1/scss/_home.scss:292` + `header/scss/_drawer.scss:87` (mượn ảnh `frame5`) · `metalslug/2026-h5-commander/assets/main/main.scss:104-106` (main trỏ sheet của section) · khối chép: `omg3q/2026-sinh-nhat-9/assets/Frame2/Frame2.scss:49` = `Frame3/Frame3.scss:46` = `Frame4/Frame4.scss:78`.

### R-CDN-19 · MUST · `.MS__pc`/`.MS__mb` khai 1 lần
CSS lib 1.3.0 **không có** luật hiển thị cho `.MS__pc`/`.MS__mb` (chỉ có `.MS__mb-1..10` là margin-bottom); JS lib chỉ
`remove()` bản thừa lúc boot (`libraryMainsite/prod-source/1.3.1/assets/main/main-1.3.1.js:8-26`). Mỗi campaign khai
đúng 1 lần ở `main.scss` bằng `@include mobile`, không khai lại ở section. `documentsClass.txt` ghi cặp này như
tiện ích sẵn của lib — sai với lib hiện hành. **Bẫy:** lib coi là mobile khi `max-width: 768px` **và**
`orientation: portrait`; mixin `mobile` của project chỉ có `max-width` (vd `ddtank/2026-chengdu-tournament/webpack.config.js:217`)
⇒ đọc code thấy điện thoại xoay ngang ≤768px mất cả hai bản (chưa đo trên máy thật) — gặp thì báo, đừng tự đổi mixin.
```scss
// ✅ main/main.scss — duy nhất
.MS__pc { display: block !important; }
.MS__mb { display: none !important; }
@include mobile {
  .MS__pc { display: none !important; }
  .MS__mb { display: block !important; }
}
```
Dẫn chứng: `cfl/2026-offline-tournament/assets/main/main.scss:58-69` · `tqht/2026-trung-thu-menh-hon/assets/main/main.scss:4-14` · `ddtank/2026-chengdu-tournament/assets/main/main.scss:7-20`.

### R-CDN-20 · MUST · Tải ảnh
`<img>` dưới màn đầu dùng `MJ__lazyload` + `data-src`: lib chạy lozad trên `.MS__lazyload, .MJ__lazyload`
(`main-1.3.1.js:84`) **sau** khi đã `remove()` bản PC/MB thừa, nên chỉ bản còn lại được tải. Cặp `MS__pc`/`MS__mb`
để `src` trần thì trình duyệt đã tải cả hai trước khi lib kịp xoá. Ảnh màn đầu (nền/hero Frame1) giữ `src`
(+ `fetchpriority="high"`). Không trộn `loading="lazy"` native trong cùng campaign.
```twig
{# ❌ section dưới màn đầu, trình duyệt tải cả hai bản #}
<img class="reward-panel MS__pc" src="assets/reward/images/panel-pc.jpg" alt="">
<img class="reward-panel MS__mb" src="assets/reward/images/panel-mb.jpg" alt="">

{# ✅ #}
<img class="reward-panel MS__pc MJ__lazyload" data-src="assets/reward/images/panel-pc.jpg" alt="">
<img class="reward-panel MS__mb MJ__lazyload" data-src="assets/reward/images/panel-mb.jpg" alt="">
```
Dẫn chứng ✅: `gnmobinew/2026-trung-thu/assets/Frame2/Frame2.html.twig:8` · `ddtank/2026-chengdu-tournament/assets/Frame1/Frame1.html.twig:13` (hero giữ `src` + `fetchpriority`). ❌: `tqht/2026-trung-thu-menh-hon/assets/vote/vote.html.twig:3` · `mwly/2026-dang-nhap-nhan-qua/assets/footer/footer.html.twig:3-4` · `gpn/2026-he-ruc-ro/assets/Frame3/Frame3.html.twig:3` · trộn native: `omg3q/2026-sinh-nhat-9/assets/Frame2/Frame2.html.twig:3`.

### R-CDN-21 · SHOULD · Định dạng ảnh
Ảnh không cần trong suốt lưu `.jpg` (q≈80) hoặc `.webp` ngay tại nguồn; PNG chỉ cho ảnh có alpha thật. Lý do:
`build-pro` không nén (chỉ `build-optimize` nén, R-CDN-11), và optimize chọn webp/gốc theo tổng dung lượng cả bộ ⇒
đuôi có thể lật sau khi đã bàn giao (R-STR-7). Kiểm alpha:
`python3 -c "from PIL import Image; import sys; im=Image.open(sys.argv[1]); print(im.getchannel('A').getextrema() if 'A' in im.getbands() else 'no-alpha')" <file>`
ra `(255, 255)` hoặc `no-alpha` là ảnh đục.

Dẫn chứng ❌: `tqht/2026-trung-thu-menh-hon/assets/vongquay/images/bg-pc.png` (3,9MB, 2000×1608, alpha toàn 255) · `cfl/2026-offline-tournament/assets/frame1/images/banner.png` (892KB, alpha toàn 255) · `cfl/2026-offline-tournament/assets/frame2/images/event-banner.png` (991KB, RGB không alpha). ✅: `zsm/2026-dua-co-hoi-h5/assets/zsm-ld-duahoi/images/background-frame-1.webp`.

### R-CDN-22 · SHOULD · Bám màn hình trong vùng đã scale
Nav đáy, drawer, float bám màn hình nằm trong `#MS__wrapper` đã bị scale: `top`/`height` dùng
`var(--sr-device-height)` — lib ghi `calc(100vh * 1/<tỉ lệ scale>)` vào `:root` (`libraryMainsite-1.3.0.js`,
`deviceHeightStyleVar`), tức chiều cao màn quy về px design. `100vh`/`bottom: 0` bên trong vùng scale ra sai vị trí.
Lib chỉ ghi khối style này **1 lần** (bỏ qua nếu `#deviceHeightStyleVar` đã có) ⇒ tỉ lệ đổi sau resize thì biến giữ tỉ lệ cũ.
```scss
// ❌
.bottom-bar { position: fixed; bottom: 0; }
// ✅ mép trái + rộng đủ canvas, chỉ kéo ngược lên đúng chiều cao của thanh
.bottom-bar { position: absolute; left: 0; width: 100%; top: var(--sr-device-height); transform: translateY(-100%); }
```
Dẫn chứng: `ddtank/2026-chengdu-tournament/assets/navigation/navigation.scss:122` · `cfl/2026-offline-tournament/assets/header/scss/_drawer.scss:17` · `lan/2026-trung-thu/assets/main/main.scss:118`.

### R-CDN-23 · SHOULD · Hiệu ứng CSS cho N phần tử
N phần tử cùng hiệu ứng: **1** `@keyframes`, tham số từng phần tử truyền qua CSS var (`--dur`, `--delay`) hoặc
`animation-delay` âm để lệch pha ngay khung đầu; dữ liệu phần tử để trong SCSS list + `@each` (R-LAY-8). Vẫn chỉ
animate `transform`/`opacity` (R-ANIM-2) và có `prefers-reduced-motion` (R-ANIM-5).

### R-CDN-24 · MUST · Domain CDN: chỉ `cdn-mainsite`
User chốt 30/9/2026: `global-mainsite.mto.zing.vn` không dùng nữa. Campaign mới, section mới, clone-reskin: mọi URL
tuyệt đối (link `libraryMainsite` trong `index.html.twig`, `url:` trong `main/html/configProduction.html.twig`,
asset, ảnh) dùng `https://cdn-mainsite-aka.vnggames.com/`. Clone từ landing cũ mang theo domain cũ ⇒ đổi ngay sau clone.

- Bẫy phiên bản (đo 30/9/2026): `cdn-mainsite` có `libraryMainsite` 1.1.0 · 1.1.1 · 1.3.0 · 1.3.1, **KHÔNG có 1.1.2**
  (404). Clone từ landing dùng 1.1.2 thì đổi domain thôi là vỡ trang — nâng lên bản pin trong `base-structure.md`
  (hiện 1.3.0) rồi build + chạy thử, đừng giữ 1.1.2.
- Landing cũ đang chạy: không quét đổi hàng loạt. Đụng file nào thì đổi file đó; phần còn lại ghi mục 7 Nợ.
- Cổng: `node ~/VNG/agent-auto/tools/landing-parity.mjs <campaign>` in `🔴 R-CDN-24 … file:line` (không soát `dist/`),
  `--strict` trả exit 1.
```scss
// ❌ mỗi chấm sáng 1 bản keyframes giống hệt, chỉ khác thời lượng
@keyframes pulse-a { 50% { opacity: 0.4; } }
@keyframes pulse-b { 50% { opacity: 0.4; } }
.dot-a { animation: pulse-a 2s infinite; }
.dot-b { animation: pulse-b 2.5s infinite; }

// ✅ 1 keyframes, nhịp và độ lệch pha truyền bằng biến
@keyframes pulse { 50% { opacity: 0.4; } }
.dot { animation: pulse var(--pulse-dur, 2s) ease-in-out infinite; animation-delay: var(--pulse-shift, 0s); }
.dot--b { --pulse-dur: 2.5s; --pulse-shift: -1s; }
```
Dẫn chứng: `ddtank/2026-chengdu-tournament/assets/Frame2/Frame2.scss:193,227` · `lan/2026-trung-thu/assets/Frame1/Frame1.scss:62,73` · `lan/2026-trung-thu/assets/Frame7/Frame7.scss:174-175` (tham số từ SCSS list).

## Sprite (webpack-spritesmith) — R-SPR-*

R-CDN-6 chỉ cấm sửa file sinh ra. Mục này nói **cách dùng**. Đọc trước khi thêm hoặc sửa bất kỳ ảnh UI nào.

**Facts (kiểm 2026-08-19, bổ sung 23/9):** repo có **≥4 thế hệ cấu hình sprite**, không có mẫu dùng chung — `cfl/2026-hanh-trinh-cua-fox`
tìm entry theo 2 đường (`assets/<item>/<item>.sprite.scss` hoặc `assets/<item>/scss/sprite.entry.scss`,
`webpack.config.js:44-52`); `libraryMainsite/prod-source/1.3.1` sinh thẳng ra `scss/sprite.scss`
(`webpack.config.js:95`); `gno/2026-request-landing-convert` chỉ sinh lại sprite khi chạy kèm
`--env sprites=true` (`webpack.config.js:40,131`); thế hệ thứ 4 **tách sheet PC/MB** — `images/pc/sprite/` và
`images/mobile/sprite/` ra 2 sheet, 2 bộ biến (`ddtank/2026-chengdu-tournament/webpack.config.js:112-145`, cùng kiểu ở
`gpn/2026-he-ruc-ro`, `nghichthuyhan/2026-affiliate-2`) — ảnh PC/MB giống nhau vẫn chỉ để 1 bản (R-SPR-8). `sprite.png` (**2.755 file**) và `sprite.generated.scss`
(**1.254 file**) tuy là artifact build nhưng **đang bị git track**. Hai cách tiêu thụ cùng tồn tại:
`@include sprite($tên)` trong SCSS, và class `MS__sprite-<tên>` trên Twig (**741 file Twig**, sinh từ **876**
file `*.sprite.scss`).

| ID | Sev | Luật |
|---|---|---|
| **R-SPR-1** | MUST | **Đọc `webpack.config.js` của CHÍNH project trước khi động vào sprite.** Config quyết định: thư mục PNG nguồn, tên file SCSS sinh ra, `cssImageRef`, `glob` (`*.png` hay `*.{jpg,png}`), `padding`, và các chốt bỏ qua (`if (item !== 'main')`, guard `hasPng`, `enableSprites`). Bê mẫu campaign khác sang → hoặc build đỏ `Undefined variable`, hoặc **sprite không bao giờ sinh lại mà build vẫn xanh**. `dist/` đã commit có thể là tàn dư build cũ — KHÔNG dùng `dist/` làm bằng chứng cơ chế hiện hành. |
| **R-SPR-2** | MUST | **Campaign MỚI theo mẫu `cfl/2026-hanh-trinh-cua-fox`** (entry sprite riêng + `sprite.generated.scss`). Campaign cũ đang dùng cấu hình đời trước: **đụng tới đâu migrate tới đó**, không đi dọn hàng loạt (user chốt 19/8/2026). |
| **R-SPR-3** | MUST | **Sửa sprite = sửa PNG nguồn rồi build lại.** Cấm sửa tay `sprite.generated.scss` / `sprite.png`: chúng bị git track nên sửa tay *có vẻ* ăn, nhưng build kế tiếp ghi đè sạch và diff thì bẩn. |
| **R-SPR-4** | MUST | **Thư mục sprite nguồn phải phẳng, chỉ chứa PNG đã cắt sạch.** `glob: '*.png'` KHÔNG đệ quy → PNG nằm trong thư mục con bị bỏ qua **âm thầm** (không biến, không class, chỉ vỡ lúc chạy). Cấm để file trung gian (`*-psd.png`, `*-merged.png`) trong đó — chúng vẫn bị gộp vào atlas, làm phình sheet của cả section. |
| **R-SPR-5** | MUST | **Dùng sprite bằng `@include sprite($tên-biến)`. CẤM gõ `background-position` số cứng, CẤM `url()` trỏ thẳng PNG lẻ trong `images/sprite/`.** Toạ độ gõ tay chết ở lần build kế tiếp vì spritesmith xếp lại atlas. Ca có thật đang nằm trong repo: `products/dt3q/landing/2026-sinh-nhat-7-ai/assets/dt3q-ld-sinhnhat-loichuc/dt3q-ld-sinhnhat-loichuc.scss:390` gõ `-408px -212px`, trong khi `scss/sprite.generated.scss` **không có ô nào ở toạ độ đó** (ô `btn-heart` thật ở `527/137`) — icon đang cắt trúng vùng giữa các ô. Trỏ `url()` thẳng ảnh lẻ (123 dòng SCSS) hoặc `<img src="…/images/sprite/…">` (179 thẻ Twig) còn làm production **ship trùng**: vừa atlas vừa nguyên thư mục ảnh rời. |
| **R-SPR-6** | SHOULD | **Code cũ gắn class `MS__sprite-<tên>` trên Twig thì GIỮ NGUYÊN** — 741 file đang chạy như vậy, và `MS__*` là hợp đồng lib (R-CDN-9). Code **mới** viết `@include` trong SCSS cho thống nhất. Đừng đổi qua lại giữa hai cách trong cùng một section. |
| **R-SPR-7** | MUST | **`@include sprite()` set đúng 4 thứ: image, position, width, height.** Đừng viết lại `width`/`height` cạnh nó — số trong biến mới là số đúng sau mỗi lần build lại. Nó KHÔNG set `display`, KHÔNG set `content`: dùng trên `::before`/`::after` thì phải tự thêm, thiếu là phần tử cao 0, không thấy gì mà build vẫn xanh. |
| **R-SPR-8** | SHOULD | **Đổi trạng thái bằng ảnh khác, không dịch `background-position`**: cắt `<tên>-hov.png` / `<tên>-active.png` rồi `&:hover { @include sprite($<tên>-hov); }`; không có ảnh riêng thì gắn class `MS__hover` của lib. **Ảnh mobile: chỉ cắt `-mb.png` khi design vẽ KHÁC THẬT** (khác bố cục/nội dung); cùng một ảnh chỉ khác cỡ thì `transform: scale()`, đừng đẻ thêm file vào atlas (user chốt 19/8/2026). |
| **R-SPR-10** | SHOULD | **`@import` file generated ở đâu thì theo convention của project, đừng trộn hai kiểu trong cùng campaign.** Hai kiểu đều đang chạy thật: import trong **file entry** (`*.sprite.scss` / `scss/sprite.entry.scss`) để sprite thành chunk riêng — `cfl/2026-hanh-trinh-cua-fox` (4 file entry, chỉ 2 chỗ ngoài là `libraryMainsite-t-popup/scss/base.scss` và 1 section); hoặc import thẳng dòng 2 của mọi `<item>.scss` để vào bundle chính — `community/skin-2026-new` (18 file). Mở 1-2 section sẵn có của project xem họ làm kiểu nào rồi làm theo. |
| **R-SPR-9** | MUST | **Section không có PNG nào: giữ file stub** khai `$spritesheet-sprites: ()` + `@mixin sprite($sprite) {}` để entry không lỗi build (mẫu `products/ttlm/landing/2026-huynh-de-tai-ngo/assets/Footer/scss/sprite.generated.scss`). **Bẫy phải nhớ:** stub rỗng **nuốt im lặng** mọi `@include sprite()` — không ảnh nào ra mà build vẫn xanh. Nên: giữ nguyên dòng comment giải thích trong stub, và khi thêm PNG đầu tiên vào section đó thì **xoá stub** cho webpack sinh file thật. |
| **R-SPR-11** | SHOULD | **Sprite chỉ cho UI nhỏ** (nút, icon, badge, khung nhỏ). Ảnh art lớn (ngưỡng gợi ý: cạnh ≳400px hoặc file >200KB — rương, nhân vật, item minh hoạ) để ảnh rời trong `images/`: atlas không lazyload được (R-CDN-20), không nén riêng được, và 1 ảnh lớn kéo nặng cả sheet của section. Ca thật: `nghichthuyhan/2026-affiliate-2/assets/Frame1/images/mobile/sprite/F1-treasure-chest.png` 767×1103 (3,4MB) ⇒ `Frame1/images/mobile/sprite.png` 2,0MB · `ghoststory/2026-2nd-anniverary/assets/frame3/images/sprite/f3-item1..3.png` 347×953 (144-183KB mỗi file) ⇒ `frame3/images/sprite.png` 503KB. |
| **R-SPR-12** | MUST | **Twig dùng class `MS__sprite-*` ⇒ bọc `@include ms-sprites(…)` trong `#<sectionId> { }`.** Mọi sprite entry gộp vào **1** file `<name>-sprite.css` (`lan/2026-trung-thu/webpack.config.js:81`) trong khi tên PNG trùng giữa các section là chuyện thường (`btn.png` ở 5 section của `omg3q/2026-sinh-nhat-9`; `icon-home.png` ở cả `bottomnav` lẫn `header` của `cfl/2026-offline-tournament`) ⇒ khai global là class ăn nhầm toạ độ sheet của section khác, build vẫn xanh. ✅ `lan/2026-trung-thu/assets/Frame1/scss/sprite.entry.scss:18-19` (đo thật `.MS__sprite-arrow-left` từng bị khai 3 lần) · `ddtank/2026-chengdu-tournament/assets/Frame2/Frame2.sprite.scss:30`. Đang global (lỗi tiềm ẩn, twig chưa gọi class trùng): `omg3q/2026-sinh-nhat-9/assets/Frame2/scss/sprite.entry.scss:18` · `cfl/2026-offline-tournament/assets/header/header.sprite.scss:32` + `bottomnav/bottomnav.sprite.scss:25`. |

**Cách làm đúng, ba bước:** ① bỏ PNG đã cắt vào đúng thư mục sprite nguồn mà `webpack.config.js` khai
· ② `npm run build-dev` để sinh lại `sprite.generated.scss` · ③ trong SCSS: `@import` file generated rồi
`@include sprite($tên-file-png)`, chỉ tự viết thêm `position/left/top` và phần trang trí.

## Luật cũ vẫn bị vi phạm lặp lại (không đẻ luật mới — quét 23/9/2026)
- **R-SPR-5** — `url()`/`<img>` trỏ thẳng `images/sprite/`: `cfl/2026-offline-tournament/assets/frame5/frame5.scss:170` ·
  `ghoststory/2026-2nd-anniverary/assets/navigaion/navigaion.html.twig:9` · `metalslug/2026-h5-commander/assets/main/main.scss:104-106` (kèm `background-position` gõ tay).
- **R-SPR-8** — PNG PC/MB trùng byte vẫn nằm 2 sheet: `nghichthuyhan/2026-affiliate-2/assets/Frame1/images/{pc,mobile}/sprite/F1-silver-note.png`.
  Hover tự gõ `filter: brightness(1.08…1.15)` thay vì `MS__hover` (lib: `brightness(120%)`, `libraryMainsite/prod-source/1.3.1/assets/main/scss/ms.scss:1-3`):
  `ghoststory/2026-2nd-anniverary/assets/navigaion/navigaion.scss:43-44` · `pwm/2026-v34-ani/assets/navigaion/navigaion.scss:88`.
- **R-SPR-4 + R-SPR-9** — `_ph.png` 1×1 bỏ vào thư mục sprite để qua chốt `hasPng` (ảnh giả vào atlas) thay cho stub:
  `gpn/2026-he-ruc-ro/assets/Frame1/images/pc/sprite/_ph.png` · `ddtank/2026-chengdu-tournament/assets/Frame2/images/pc/sprite/_ph.png`.
- **R-ST-4** — `.off`/`.received` chỉ tô xám, vẫn bấm được: `ghoststory/2026-2nd-anniverary/assets/frame1/frame1.scss:160,170` (`pointer-events: auto`) ·
  `tqht/2026-trung-thu-menh-hon/assets/diemdanh/diemdanh.scss:94-99`. Mức xám lấy theo lib (`libraryMainsite/prod-source/1.3.1/assets/main/scss/ms.scss:5-15`: `MS__off` grayscale(1), `MS__received` grayscale(0.7)).
- **R-CDN-4 + R-CDN-5** — toạ độ `%`, `@media` tay: `taydu2/2026-tam-gioi-ky-ngo/assets/vxphl-ld-25-a-header/vxphl-ld-25-a-header.scss:43-44` ·
  `omg3q/2026-sinh-nhat-9/assets/Intro/Intro.scss:111` · `cfl/2026-offline-tournament/assets/main/scss/_base.scss:37` · `zsm/2026-request-landing-convert/assets/footer/footer.scss:77`.
- **R-CDN-10** — 4/4 campaign H5 đọc được đều lệch bộ `maxWidthMB: '0'` + `scaleWidthMB: 0`: `jx1m/2026-tinh-quang-chi-da/config.js:13,18` ·
  `zsm/2026-dua-co-hoi-h5/config.js:10,13,16` · `taydu2/2026-tam-gioi-ky-ngo/config.js:11,13` · `metalslug/2026-h5-commander/config.js:11,14`. Sửa khi chạm, đo 1 view ngang 1920×1080 trước và sau.
- **R-CDN-13** — clone kéo cả kho font: `taydu2/2026-tam-gioi-ky-ngo/assets/main/fonts/` 9/16 file không ai tham chiếu (`GS3_VongXuyen_Regular.ttf` 13,4MB).
- **R-ANIM-2** — animate `filter`/`drop-shadow` vô hạn: `jx1m/2026-tinh-quang-chi-da/assets/Frame1/Frame1.scss:3-5` · `gpn/2026-he-ruc-ro/assets/Frame3/Frame3.scss:69-71`.
  ✅ glow là lớp riêng chỉ đổi `opacity`/`transform`: `mwly/2026-dang-nhap-nhan-qua/assets/diemdanh/diemdanh.sprite.scss:58-75`.
- **R-ANIM-5** — loop trang trí thiếu `prefers-reduced-motion`: `ddtank/2026-chengdu-tournament/assets/Frame2/Frame2.scss:193` (cả file 0 khối). ✅ `lan/2026-trung-thu/assets/Frame7/Frame7.scss:324`.
- **R-CS-1** — comment SCSS nhiều dòng chép số đo/lịch sử: `cfl/2026-offline-tournament/assets/main/scss/_base.scss:25-36` · `lan/2026-trung-thu/assets/Frame1/scss/sprite.entry.scss:15-17`.

## Quan hệ với các luật khác
- Cấu trúc campaign/section/trang (id section, class vai trò, đặt tên khi clone, iframe, layout nhiều trang, list Twig, ghim đuôi ảnh, tài liệu, `<body class>`): [`landing-structure.md`](landing-structure.md) — R-STR-*.
- Popup: [`popup-library.md`](popup-library.md) — R-POP-*.
- Đưa HTML sang `gt-promotion-template` / `new-mainsite`: [`html-handoff.md`](html-handoff.md) — R-HO-*.
- Hook platform `pm__`: [`pm-contract.md`](pm-contract.md) — R-PM-*.
- JS riêng của campaign (nối engine R-CDN-8, `MJ__*`, popup, observer, mock, namespace): [`landing-js.md`](landing-js.md) — R-JS-*.
- Cách viết code (comment, phòng thủ, trừu tượng): [`code-style.md`](code-style.md) — R-CS-*.
- Commit: repo này đẩy lên git VNG → theo skill `/commit` (Conventional Commits `(<type>): <mô tả>` + `Co-Authored-By`),
  KHÔNG dùng `[leaf-folder]`. Chi tiết ở mục "Commit" cuối [`code-style.md`](code-style.md).
