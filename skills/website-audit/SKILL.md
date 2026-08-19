---
name: website-audit
description: >
  Dùng khi cần kiểm tra/audit/tối ưu website TRƯỚC KHI đưa lên production — hoặc khi user nhắc:
  "pre-production", "production readiness", "check website", "tối ưu website", "optimize hình ảnh",
  "tối ưu font", "kiểm tra SEO", "meta tags", "Lighthouse", "Core Web Vitals", "page speed",
  "web chậm", "validate HTML", "broken link", "sitemap", "robots.txt". Áp dụng cho static output
  (dist/build/out), source repo frontend (build rồi audit), hoặc URL đang chạy. LUÔN dùng skill này
  thay vì tự nghĩ checklist — audit "chay" sẽ bỏ sót các mục vắng mặt (canonical, OG, JSON-LD,
  robots.txt, sitemap, preload font) và dùng kiến thức tool đã lỗi thời.
---

# Website Audit — kiểm tra & tối ưu trước production

## Nguyên tắc cốt lõi
**Máy quét trước → mắt đọc sau → đo thật để chốt.** Không tự nghĩ checklist từ trí nhớ:
trí nhớ chỉ thấy cái SAI đang hiện hữu, không thấy cái ĐÚNG bị VẮNG MẶT (test thực tế: 3/3 agent
không có skill đều sót JSON-LD; 2/3 sót robots.txt/sitemap/canonical/OG).

**Luôn quét đủ 6 mảng** — validation, performance, images, fonts, SEO, runtime — kể cả khi user
chỉ hỏi 1 mảng ("optimize ảnh giúp mình"). Blocker ở mảng khác (vd `noindex` bỏ quên) vẫn phải báo:
user sắp lên production, không biết ≠ không sao.

## Bước 0 — Xác định target
| Target | Cách xử lý |
|---|---|
| Source repo (có package.json) | Build trước (`npm run build`), audit thư mục output; chạy thêm `npx knip` tìm dep/file thừa |
| Thư mục static (HTML sẵn) | Audit thẳng |
| Chỉ có URL đang chạy | Bỏ Bước 1 dạng-dir, thay bằng: `curl` HTML các trang chính để check thủ công theo checklist script + Lighthouse ở Bước 3 |

## Bước 1 — Quét máy (BẮT BUỘC, chạy cả 2, không được bỏ vì "site nhỏ")
```bash
node <skill-dir>/scripts/check-html.mjs <site-dir>    # HTML/SEO/validation + absence checks
node <skill-dir>/scripts/scan-assets.mjs <site-dir>   # ảnh/font/JS/CSS nặng + lệnh fix sẵn
```
Exit code 1 = có CRITICAL = **production blocker**. Thêm `--json` khi cần parse.
Muốn validate HTML chuẩn sâu hơn: `npx html-validate '<dir>/**/*.html'`.

## Bước 2 — Mắt đọc (những gì máy không bắt được)
- **JS runtime lỗi**: đọc file JS — biến/hàm chưa định nghĩa, typo (`analytcs`), API gọi sai env.
- **Dead code**: script/lib được load nhưng grep không thấy nơi nào dùng → đề xuất xóa hẳn (không chỉ defer).
- **Chất lượng nội dung meta**: máy chỉ đo độ dài — title/description/alt phải CÓ NGHĨA, có brand + từ khóa.
- **Leftover staging**: URL dev/staging hardcode, console.log, comment TODO, tracking ID test.
- **Lệch chuẩn cdn-source / bàn giao** (chỉ khi target là landing VNGGames — luật: `~/VNG/agent-auto/rules/html-handoff.md`, `rules/popup-library.md`, `rules/cdn-source-standard.md`):
  path tương đối hoặc URL localhost trong HTML bàn giao (**R-HO-1** — 404 thật trên production, không phải góp ý);
  mất `<% MODULE_CONTENT %>` ở bản `Promotion/` (**R-HO-2** — trang trống);
  thiếu `#MS__wrapper` / `MS__layer-loading` / `layer-rotate` (**R-HO-3**);
  version `libraryMainsite` trong `<link>`/`preload`/`<script>` không khớp nhau (**R-HO-4**);
  popup thiếu `MJ__close-popup` (**R-POP-2** — nút đóng chết). Mỗi mục ghi mã luật + file:line.

## Bước 3 — Đo thật (khi có thể chạy site; nếu không được, ghi rõ "chưa đo runtime")
```bash
python3 -m http.server 8080 -d <site-dir> &   # hoặc npx serve
npx lighthouse http://localhost:8080 --chrome-flags="--headless=new" \
  --output=json --output=html --output-path=./lh-mobile --quiet   # mobile = default
# lần 2 với --preset=desktop
npx linkinator http://localhost:8080 --recurse                    # broken links kể cả external
```
- Bắt **console errors** ở PC 1920×1080 và mobile 768×1024 (chuẩn team): mở browser (Playwright/browserpilot), hoặc dùng audit `errors-in-console` trong JSON Lighthouse của cả 2 form factor — đủ tương đương, khỏi dựng browser riêng. Xong PHẢI tắt server + đóng browser session, báo ⏱ thời gian.
- Ngưỡng & lệnh chuẩn 2026 (Lighthouse 13 đã bỏ PWA, INP≤200ms...): đọc `references/tools-2026.md`.

## Bước 4 — Báo cáo
```
## 🔍 Audit <site> — <ngày>
⛔ PRODUCTION BLOCKERS (phải fix trước khi deploy)
| # | Vấn đề | File | Fix |
🔴 HIGH / 🟡 MEDIUM / ⚪ LOW  (bảng như trên, kèm lệnh fix cụ thể)
📊 Đo lường: Lighthouse mobile/desktop scores, tổng page weight trước→sau (ước tính)
✅ Đã kiểm nhưng OK: (liệt kê ngắn — chứng minh đã sweep đủ 6 mảng)
```
Blocker mặc định: meta `noindex`/robots `Disallow: /` sót lại, link/ảnh gãy, JS lỗi làm hỏng chức năng chính, ảnh/font >1MB, tổng tài nguyên >3MB.

**Audit ≠ fix.** Chỉ sửa khi user yêu cầu. Khi được yêu cầu fix: sửa theo thứ tự severity, verify build thật, chạy lại 2 script đến khi sạch CRITICAL (kèm output làm bằng chứng — theo luật verify trung thực).

## Sai lầm thường gặp (đã có agent mắc thật)
| Cám dỗ | Thực tế |
|---|---|
| "User chỉ hỏi ảnh/font, bỏ qua SEO" | Test cho thấy sót blocker `noindex`. Luôn chạy đủ 2 script — 5 giây |
| "Site nhỏ, nhìn code là thấy hết" | 3/3 agent nhìn-code đều sót JSON-LD, favicon, sitemap |
| Khuyên `@squoosh/cli`, `broken-link-checker` | Đã bỏ hoang. Dùng sharp-cli / linkinator (xem references) |
| Bắt lỗi thiếu FAQ/HowTo schema | Google đã BỎ các rich result này — không còn là finding |
| Đòi hỏi llms.txt | Google từ chối hỗ trợ, adoption ~10% — chỉ là optional |
| Parse audit ID Lighthouse cũ (`uses-rel-preload`...) | v13 đã xóa — dùng categories + insights |
| "Không chạy được browser nên bỏ Bước 3" | Vẫn chạy Bước 1-2, và GHI RÕ trong báo cáo phần chưa đo được |
