# cdn-source — chuẩn code landing/skin + R-CDN-*

`/Users/lap17727/VNG/git-vng/cdn-source` · monorepo landing page & mainsite skin VNGGames.
Đọc file này **trước khi** viết dòng code đầu tiên trong repo đó — kể cả sửa vặt.

**Vì sao có file này:** knowledge `~/.claude/knowledge/code-developer/` là **ảnh chụp** code hiện có, nó mô tả
"đang có gì", không phán "phải theo cái nào". Khi campaign cũ và campaign mới cùng nằm trong ảnh chụp, agent
chọn nhầm thế hệ cũ mà vẫn thấy "đúng knowledge" — ra code chậm, sai cơ chế scale, sai engine gameplay.
File này là **luật**: khi luật và ảnh chụp đá nhau, luật thắng.

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
| **R-CDN-3** | MUST | **`config.js` là single source of truth.** Thêm section = tạo folder + file **trùng tên folder** (`frame1/frame1.{html.twig,scss,js}`) + thêm tên vào `folderUse[]`. Thêm page = thêm `generateFile[]`. Thả folder vào `assets/` mà quên `folderUse[]` → webpack bỏ qua âm thầm, build vẫn xanh. `main` luôn đứng đầu `folderUse`. File JS rỗng 0 byte vẫn phải giữ. |
| **R-CDN-4** | MUST | **px tuyệt đối + absolute.** Phần tử trong section dùng `position:absolute` và px tuyệt đối — libraryMainsite scale cả `#MS__wrapper`. Dùng `rem`/`%`/`flex` để căn giữa toàn cục là chống lại hệ scale. |
| **R-CDN-5** | MUST | **Cấm viết `@media` tay.** Responsive CHỈ qua mixin global `@include mobile` / `@include pc` (inject bằng sass `additionalData`). Thân mixin phụ thuộc `$maxWidthMB` và **khác nhau theo project** — đọc `additionalData` trong `webpack.config.js` trước khi dùng. Hand-roll `@media` phá hợp đồng H5. |
| **R-CDN-6** | MUST | **Không sửa `*generated.scss`** (vd `scss/sprite.generated.scss`) — webpack-spritesmith sinh lại mỗi lần build. Sửa sprite = sửa PNG nguồn trong `images/sprite/`. Cách DÙNG sprite: xem mục **R-SPR-*** cuối file. |
| **R-CDN-7** | MUST | **jQuery / Swiper / `window.libraryMainsite` là global CDN.** Cấm `npm install`, cấm `import`, cấm bundle chúng. JS section giả định `$`/`Swiper`/`window.libraryMainsite` đã tồn tại. |
| **R-CDN-8** | MUST | **Không tự viết engine gameplay.** Vòng quay / gacha / mốc thưởng / đổi quà / điểm danh đã có: `window.libraryMainsite.promotion` (assets-flat) hoặc `dndPromotion` (`src/setup/js/_promotion.js`, legacy). Section chỉ cấp config + `animResult`/callback. Tra `~/.claude/knowledge/code-developer/gameplay-registry.json` trước khi code gameplay — cấm đoán, cấm né bằng cách tự viết lại. |
| **R-CDN-9** | MUST | **Prefix là hợp đồng.** `MS__*` = layout/style của libraryMainsite, `MJ__*` = hook hành vi JS của lib. Cấm bịa `MS__`/`MJ__` mới, cấm đổi tên, **giữ nguyên cả typo** (`MJ__toogleActive`). |
| **R-CDN-10** | MUST | **H5 (webview ngang)**: `config.js` đặt `H5: true`, `maxWidthMB: '0'`, `scaleWidthMB: 0`; KHÔNG thêm breakpoint mobile (mixin `mobile` không khớp là đúng thiết kế). Kiểm 1 view ngang 1920×1080, không đổi viewport. |
| **R-CDN-11** | MUST | **Verify = `npm run build-dev`** one-shot, đọc stdout/stderr, `ERROR in` hoặc exit ≠ 0 thì fix tới khi sạch. CẤM `npm run dev` để verify (watch — treo phiên). Build production: đọc `scripts` trong `package.json` của **từng** project (`build-pro` vs `build-optimize` khác nhau). Project track `dist/` (vd `community/skin-2026-new`): `build-dev` xoá `dist/optimized/**` + fonts → khôi phục `git checkout -- dist/`. |
| **R-CDN-12** | SHOULD | Thụt lề: Twig = **TAB**, SCSS = **2 space**. Tên section kebab-case theo mã chiến dịch hoặc vai trò (`frame1`, `footer`, `vxphl-ld-25-a-header`). |
| **R-CDN-13** | MUST | **Rác kế thừa ≠ chuẩn.** Campaign clone thường còn popup/ảnh/`_promotion-v2.js` của chiến dịch cũ không dùng. Không lấy chúng làm mẫu, không mang sang campaign mới. Ngược lại: `prodTemplate` trong `configProduction.html.twig` và engine promotion là **đồ sống**, không phải rác. |
| **R-CDN-14** | MUST | **Campaign hiện tại làm sai luật này thì báo, đừng bắt chước.** Thấy code trong repo lệch R-CDN-* → nói ra ở phần tổng kết (file:line), sửa nếu nằm trong phạm vi task, KHÔNG im lặng nhân bản cái sai sang chỗ mới. |

## Sprite (webpack-spritesmith) — R-SPR-*

R-CDN-6 chỉ cấm sửa file sinh ra. Mục này nói **cách dùng**. Đọc trước khi thêm hoặc sửa bất kỳ ảnh UI nào.

**Facts (kiểm 2026-08-19):** repo có **≥3 thế hệ cấu hình sprite**, không có mẫu dùng chung — `cfl/2026-hanh-trinh-cua-fox`
tìm entry theo 2 đường (`assets/<item>/<item>.sprite.scss` hoặc `assets/<item>/scss/sprite.entry.scss`,
`webpack.config.js:44-52`); `libraryMainsite/prod-source/1.3.1` sinh thẳng ra `scss/sprite.scss`
(`webpack.config.js:95`); `gno/2026-request-landing-convert` chỉ sinh lại sprite khi chạy kèm
`--env sprites=true` (`webpack.config.js:40,131`). `sprite.png` (**2.755 file**) và `sprite.generated.scss`
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

**Cách làm đúng, ba bước:** ① bỏ PNG đã cắt vào đúng thư mục sprite nguồn mà `webpack.config.js` khai
· ② `npm run build-dev` để sinh lại `sprite.generated.scss` · ③ trong SCSS: `@import` file generated rồi
`@include sprite($tên-file-png)`, chỉ tự viết thêm `position/left/top` và phần trang trí.

## Quan hệ với các luật khác
- Popup: [`popup-library.md`](popup-library.md) — R-POP-*.
- Đưa HTML sang `gt-promotion-template` / `new-mainsite`: [`html-handoff.md`](html-handoff.md) — R-HO-*.
- Hook platform `pm__`: [`pm-contract.md`](pm-contract.md) — R-PM-*.
- Cách viết code (comment, phòng thủ, trừu tượng): [`code-style.md`](code-style.md) — R-CS-*.
- Commit: repo này đẩy lên git VNG → theo skill `/commit` (Conventional Commits `(<type>): <mô tả>` + `Co-Authored-By`),
  KHÔNG dùng `[leaf-folder]`. Chi tiết ở mục "Commit" cuối [`code-style.md`](code-style.md).
