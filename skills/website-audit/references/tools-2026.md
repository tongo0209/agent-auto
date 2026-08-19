# Tools & ngưỡng chuẩn (đã verify 07/2026 — nguồn: web.dev, Google Search Central, npm registry)

## Core Web Vitals (ngưỡng "good", đo p75 field data)
| Metric | Good | Poor | Ghi chú |
|---|---|---|---|
| LCP | ≤ 2.5s | > 4s | Blog SEO nói "Google hạ xuống 2.0s" là SAI — web.dev vẫn ghi 2.5s |
| INP | ≤ 200ms | > 500ms | INP đã thay FID từ 03/2024; lab (Lighthouse) không đo được INP — dùng TBT làm proxy |
| CLS | ≤ 0.1 | > 0.25 | |

## Lighthouse 13 (hiện tại; yêu cầu Node ≥ 22)
- Categories còn lại: `performance, accessibility, best-practices, seo` — **PWA đã bị xóa từ v12**.
- v13 **xóa nhiều audit ID cũ** (`uses-rel-preload`, `offscreen-images`, `no-document-write`, `third-party-facades`...) thay bằng "performance insights" — đừng parse các ID cũ.
- Chạy chuẩn (mobile là MẶC ĐỊNH — mô phỏng Moto G, slow 4G):
```bash
npx lighthouse http://localhost:8080 --chrome-flags="--headless=new" \
  --output=json --output=html --output-path=./lh-mobile \
  --only-categories=performance,accessibility,best-practices,seo --quiet
# Desktop thêm: --preset=desktop
```
- Gate đề xuất: Performance ≥ 90 (desktop) / ≥ 80 (mobile), Accessibility ≥ 90, SEO ≥ 95.

## Hình ảnh
- Support 2026: WebP ~97%, AVIF ~95% — mọi browser lớn đều hỗ trợ cả hai. Ưu tiên AVIF (nhỏ hơn WebP 15-25%) cho ảnh photo, fallback `<picture>` chỉ cần khi phải hỗ trợ browser rất cũ.
- Ảnh LCP: `fetchpriority="high"`, KHÔNG BAO GIỜ `loading="lazy"`. Ảnh dưới fold: `loading="lazy"`. Mọi ảnh: width/height (chống CLS) + `srcset`/`sizes` cho responsive.
- Tools còn sống: `sharp-cli` (chính), `cwebp`, `avifenc`. **`@squoosh/cli` ĐÃ BỎ HOANG từ 2023 — đừng khuyên dùng.**
```bash
npx sharp-cli resize 1920 -i hero.png -o ./opt/            # resize
npx sharp-cli -i hero.png -o hero.avif -f avif -q 60       # convert
```

## Font
- Chỉ ship **WOFF2**. TTF/OTF/EOT/WOFF trên production = lỗi.
- `font-display: swap` (cân bằng) hoặc `optional` (perf/CLS tốt nhất). Giảm CLS khi swap: fallback font metric-matched bằng `size-adjust`/`ascent-override` (tool: Fontaine, Capsize).
- Subset tiếng Việt (fonttools — active; glyphhanger — active):
```bash
pip install fonttools brotli
pyftsubset font.ttf --unicodes="U+0000-00FF,U+0102-0103,U+0110-0111,U+1EA0-1EF9,U+20AB" \
  --flavor=woff2 --output-file=font.woff2   # Latin + đủ dấu tiếng Việt + ₫
```
- Preload 1-2 font above-the-fold: `<link rel="preload" as="font" type="font/woff2" crossorigin>`. Google Fonts: `display=swap`, tối đa 2-3 weights, `preconnect` tới fonts.gstatic.com.

## SEO technical
- Title ~50-60 ký tự, meta description ~150-160 (Google cắt theo PIXEL, không có limit chính thức).
- JSON-LD types đáng dùng: `Organization`, `WebSite`, `BreadcrumbList`, `Product`(+AggregateRating), `Article`, `Event`, `VideoObject`, `VideoGame` (landing game).
- **ĐÃ CHẾT — đừng bắt lỗi thiếu:** HowTo rich results (bỏ 2023), FAQ rich results (giới hạn 2023, bỏ hẳn 2026), Book Actions/Course Info/Claim Review/Estimated Salary/Learning Video/Special Announcement/Vehicle Listing (bỏ 06/2025).
- `llms.txt`: Google TỪ CHỐI hỗ trợ, adoption ~10%, AI bot hầu như không fetch — chỉ ghi "optional", không phải finding.
- Đáng check 2026: chính sách AI crawlers trong robots.txt (GPTBot, ClaudeBot, Google-Extended, PerplexityBot) — cần quyết định allow/block có chủ đích.
- OG image chuẩn 1200×630; Twitter/X: `summary_large_image`.

## Validation & links (chạy được qua npx)
```bash
npx html-validate 'dist/**/*.html'      # thuần Node, nhanh, hợp CI
npx vnu --skip-non-html --errors-only dist/   # chuẩn W3C chính chủ (cần Java)
npx linkinator http://localhost:8080 --recurse --format csv   # link checker (cả URL lẫn ./dist)
```
- `lychee` (Rust) nhanh nhất nhưng KHÔNG cài được qua npx (gói npm tên "lychee" là thứ khác!) — `brew install lychee`.
- `broken-link-checker` (npm) chết từ 2022 — đừng dùng.

## Source repo (chưa build)
- `npx knip` — tìm file/dependency/export không dùng (thay depcheck/ts-prune đã ngưng phát triển).
- Bundle: `npx source-map-explorer dist/**/*.js` (cần sourcemap), hoặc theo bundler: `@next/bundle-analyzer`, `vite-bundle-visualizer`, `webpack-bundle-analyzer`.
- Unused CSS/JS runtime: Chrome DevTools → Coverage panel (tự động hóa: Playwright `page.coverage.startJSCoverage()`).
