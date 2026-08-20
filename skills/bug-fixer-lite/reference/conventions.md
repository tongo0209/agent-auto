# Convention codebase — Landing/Skin game VNGGames (subset cho bug-fixer-lite)

> **Đây là bản RÚT GỌN** được đóng gói (bundled) trong plugin **bug-fixer-lite** để agent **bug-lane** (fix) và **design-checker** (verify) dùng **standalone** — không phụ thuộc file knowledge ngoài plugin.
> **Nguồn gốc:** `code-developer/base-structure.md`. Chỉ giữ các mục **`[STABLE]`** (nhất quán, bắt buộc) liên quan tới **sửa & kiểm bug frontend**. Cần chi tiết đầy đủ (mục `[VARIES]`/`[NEWEST]`, ví dụ per-project) → xem file gốc nếu máy có.

---

## Stack
- **Webpack 5** — KHÔNG framework, KHÔNG TypeScript, KHÔNG Babel.
- Loaders: `twig-loader` + `sass-loader` (Dart Sass) + `webpack-spritesmith`.
- `jQuery` (3.6) và `Swiper` (8.4) là **global từ CDN libraryMainsite** — KHÔNG bundle. Code JS giả định `$`/`Swiper` đã tồn tại.

## Cấu trúc 1 campaign
- **1 section = 1 folder cùng tên**, file chính TRÙNG tên folder: `<section>/<section>.{html.twig, scss, js}`.
- `config.js` = **single source of truth** (`name` = tên bundle, `folderUse[]` = danh sách section).
- `main` luôn **đứng đầu** `folderUse`. File entry `.js` có thể RỖNG (0 byte) nhưng **vẫn giữ** để webpack quét đủ convention.

## Twig / HTML `[STABLE]`
- `index.html.twig` (trang gốc) theo thứ tự: nạp **libraryMainsite CDN** → `<link {{name}}.css>` → body `#MS__wrapper` include section (đường dẫn **tương đối** `./<section>/<section>.html.twig`) → **include popup/nav/floating TRỰC TIẾP trong `<body>`** (ngay sau `#MS__wrapper`) → `{% include configProduction %}` → `<script>` libraryMainsite + `{{name}}.js` → **`<link {{name}}-sprite.css>` NGAY TRƯỚC `</body>`** (load sau cùng).
- HtmlWebpackPlugin `inject:false` — link/script tự đặt tay trong twig.
- Indent twig = **TAB**.
- Section = `<section id="<tên-folder>">` chứa `.background` (img `.MS__pc` + `.MS__mb`) + `.content` (mọi phần tử `position:absolute`).

## SCSS `[STABLE]`
- **px tuyệt đối** cho mọi thứ (width/top/left/font-size). KHÔNG rem/em/vw/%. Lý do: libraryMainsite scale toàn `#MS__wrapper` → thiết kế ở khung pixel cố định.
- Mọi phần tử trong section `position:absolute` + `left/top/width/height` px lấy thẳng từ thiết kế.
- Responsive **CHỈ** qua 2 mixin global `@include mobile {}` / `@include pc {}` — auto có sẵn (inject qua `additionalData`). KHÔNG `@media` thủ công, KHÔNG `@import` mixin.
- Sprite: `@import "./scss/sprite.generated"`. **KHÔNG BAO GIỜ sửa file `*.generated.scss`** (plugin sinh tự động).
- Comment SCSS **tiếng Việt** (giải thích "tại sao"). Indent SCSS = **2 space**.

## Prefix class hệ thống (cố định — đừng tự định nghĩa lại)
- **`MS__`** = style/layout/scale từ libraryMainsite (`MS__pc`, `MS__mb`, `MS__box`, `MS__popup`, `MS__outer`, `MS__lazyload`, `MS__sprite-*`, `MS__<Font>`). Đừng tự viết đè.
- **`MJ__`** = hook hành vi JS từ libraryMainsite: `MJ__close-popup`, `MJ__lazyload`, `MJ__loadVideo`, `MJ__openIframe`, `MJ__toogleActive` — **GIỮ NGUYÊN cả typo** (`toogle`) vì là hook của lib.

## JS `[STABLE]`
- JS thuần, mỗi `<section>.js` là script **độc lập**, webpack chỉ concat vào `<name>.js`. **KHÔNG import/export giữa section.**
- `$` / `Swiper` global từ CDN — dùng trực tiếp, không import.
- **Guard phòng thủ**: `if (typeof Swiper === "undefined") return`, `.length === 0` return sớm, `try/catch` cho localStorage.
- Toggle state bằng class: `addClass/removeClass("active")`. Popup: `$(id).addClass("active")`.
- Comment **tiếng Việt** dày, chia khối bằng `// ===== TÊN PHẦN =====`.
- **KHÔNG `DOMContentLoaded`** — dùng `window.addEventListener("load", ...)` hoặc `$(function(){})`.

## Build / Verify
- **Verify sau khi sửa = `npm run build-dev`** (one-shot, KHÔNG watch) → đọc lỗi webpack trong output.
- Deploy = nguyên thư mục **`dist/`**.
- Bug layout/position: verify bằng **đọc CSS tĩnh trong `dist/` + số học**, KHÔNG đo live DOM.

## libraryMainsite
- Thư viện chia sẻ nạp từ **CDN VNGGames** (pin version). Cung cấp: jQuery, Swiper, fancybox; scale layout `#MS__wrapper`; lazyload; popup engine; language module; bộ class `MS__`/`MJ__`.
- Bật/tắt qua `window.varMS` (`bundles`/`modules`) khai trong `configProduction.html.twig`.
- Chia sẻ module = **COPY thư mục** hoặc CDN URL hardcode. KHÔNG npm workspace, KHÔNG symlink.
