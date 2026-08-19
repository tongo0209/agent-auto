---
name: ui-check
description: >
  Dùng SAU khi đã code + build xong trong repo cdn-source (landing/skin VNGGames) để kiểm tra
  output build cuối (dist/) có lỗi giao diện hoặc lệch design không — hoặc khi user nhắc:
  "check UI", "check giao diện", "kiểm tra dist", "ảnh vỡ", "ảnh 404", "chữ bị cắt",
  "tràn ngang", "lệch design", "so output với design", "kiểm tra trước khi giao QC".
  Chạy trên OUTPUT đã build qua browser thật, không phải đọc source chay. Skill này OPT-IN —
  chỉ chạy khi được gọi, không tự động sau mỗi build.
---

# UI Check — kiểm tra output build trước khi giao

## Nguyên tắc cốt lõi

**Build-pass ≠ khớp design** (bài học projectx5). Máy quét deterministic trước (Lớp 1 —
không cần ảnh design), mắt so design sau (Lớp 2 — chỉ khi có ảnh baseline).
**Report-first: phát hiện ≠ sửa** — skill này là trọng tài, không phải thợ sửa.

## The Iron Rules

```
1. OPT-IN — chỉ chạy khi user gọi. Không tự kích hoạt sau build thường.
2. Report mặc định — KHÔNG tự fix. Fix CHỈ khi user gọi kèm --fix, và chỉ case không nhập nhằng.
3. Fix (nếu có) luôn ở SOURCE rồi rebuild — TUYỆT ĐỐI không vá trực tiếp dist/.
4. Build one-shot `npm run build-dev` — CẤM `npm run dev` (watch treo phiên).
5. browserpilot headless:false. Kết thúc = `session reset` + kill server nền + báo ⏱.
6. Đọc waiver TRƯỚC khi báo lỗi — lệch chủ ý user đã duyệt không phải bug.
7. Chấm cả CHUẨN, không chỉ lệch design — R-CDN-* / R-POP-* / R-HO-*, mỗi lệch ghi mã luật.
```

**Trục chuẩn (thêm vào report, không thay các lớp check hiện có).** Luật: `~/VNG/agent-auto/rules/cdn-source-standard.md`,
`popup-library.md`, `html-handoff.md`. Bốn thứ nhìn được từ output build:
- **Popup**: markup popup thiếu `MS__popup`/`MS__opacity`/`MJ__close-popup`/`MS__box` → popup tự chế, không extends base (R-POP-2, R-POP-3).
- **Responsive**: `@media` xuất hiện trong CSS build mà không đến từ mixin `mobile`/`pc` → R-CDN-5.
- **Scale**: kích thước/toạ độ dùng `rem`/`%` cho phần tử trong section thay vì px tuyệt đối → R-CDN-4.
- **Bàn giao**: file HTML trong `gt-promotion-template` còn path tương đối, mất `<% MODULE_CONTENT %>`, hoặc thiếu `#MS__wrapper`/`MS__layer-loading`/`layer-rotate` → R-HO-1..3.

Trang có gameplay promotion → nhắc user chạy `/check-promotion <loại> <file>` (R-POP-7) và ghi vào phần Giới hạn nếu chưa chạy.

## Bước 0a — Chạy `fe-gate` TRƯỚC khi mở browser

```bash
node ~/VNG/agent-auto/tools/fe-gate.mjs <dist> [--design ~/VNG/agent-auto/designs/<KEY>]
```

< 1s, tất định, bắt hết ảnh 404 + font trỏ file không tồn tại + `dist/` cũ hơn source. Đừng dùng
browser để đi tìm ảnh 404: chậm hơn và **vẫn bỏ sót** — CSS trỏ font không tồn tại thì browser
fallback im lặng, ảnh chụp trông vẫn "đúng" (ca GW-654: 2 checker PASS trong khi thiếu 8 font).

Gate ERROR → sửa trước, chưa cần mở browser. Gate PASS → sang bước 0 và check HIỂN THỊ (việc mà
gate tĩnh không làm được: tràn ngang, chữ bị cắt, lệch design).

## Bước 0 — Đọc config.js của campaign

`config.js` cho ma trận check, đừng đoán:

| Field | Suy ra |
|---|---|
| `generateFile` | Danh sách trang phải check (vd `["index","index-en","index-th"]` = 3 locale) |
| `H5: true` | CHỈ check 1 viewport 1920×1080 (webview ngang), bỏ mobile |
| `folderUse` | Section kỳ vọng có mặt — đối chiếu với `sections` trong report script |

User chỉ định locale/trang cụ thể → chỉ check phần đó. Project track `dist/`
(vd `community/skin-2026-new`) → nhắc user dist sẽ đổi sau build-dev, khôi phục bằng
`git checkout -- dist/` nếu cần.

## Workflow

1. **Build**: `npm run build-dev` one-shot, đọc stdout — `ERROR in` hoặc exit ≠ 0 thì báo,
   dừng (không check UI trên build hỏng).
2. **Serve dist**: check port trống trước (`lsof -nP -iTCP:<port> -sTCP:LISTEN`), port bận thì
   ĐỔI port khác — KHÔNG kill process lạ. Rồi:
   `npx --yes http-server dist -p <port> -s` (chạy nền). `curl` 1 URL đặc trưng của campaign
   để chắc đang serve ĐÚNG dist (đã gặp thực tế: port cũ còn server của project khác).
3. **Lớp 1 — deterministic, mỗi trang × mỗi viewport**:
   - `session set` headless:false, viewport PC 1920×1080, base_url.
   - MỘT `run_steps`: `goto` → `wait_for #MS__wrapper` → `expect_visible` section đầu → `wait 1500`.
   - `run_script` với NGUYÊN VĂN thân file `scripts/layer1-checks.js` (script tự scroll
     kích lazyload + chờ fonts — đừng cắt bớt đoạn nào).
   - Chuyển mobile: `set_viewport 768×1024` + `then_reload:true` (đúng 1 reload theo quy ước)
     → chạy lại script. H5 thì bỏ bước này.
   - Trang locale tiếp theo: `goto` URL mới, lặp lại.
   - Cuối mỗi trang: `read_signals since:last_run level:all` — nguồn DUY NHẤT cho 404/console.
     Report DOM sạch mà chưa đọc signals = CHƯA XONG (404 nằm ở network, không nằm trong DOM).
4. **Lớp 2 — so design (CHỈ khi có ảnh baseline)**: giao agent `design-checker` với URL đang
   serve + đường dẫn ảnh design, theo nhánh có-baseline của agent đó (screenshot ↔ ảnh design
   từng section). Không có ảnh → ghi rõ "chỉ check Lớp 1, chưa so design" — KHÔNG đi tìm ảnh
   trên ổ đĩa, KHÔNG so bằng trí nhớ.
5. **Report + dọn dẹp**: kill server nền, `session reset`, báo kết quả + ⏱.

## Máy không có browserpilot? — fallback Playwright MCP

Recipe trên viết cho browserpilot. Máy chỉ có Playwright MCP (`mcp__playwright__browser_*`)
→ GIỮ NGUYÊN mục tiêu từng bước, đổi tool (mỗi action 1 call, chấp nhận nhiều call hơn):

| Việc | browserpilot | Playwright MCP |
|---|---|---|
| Mở trang / reload | `run_steps[{goto}]` | `browser_navigate` |
| Đổi viewport PC↔mobile | `set_viewport` + `then_reload` | `browser_resize` → `browser_navigate` lại |
| Chạy script Lớp 1 | `run_script` (nguyên file) | `browser_evaluate` — chạy LẦN LƯỢT 3 khối `page.evaluate(...)` trong file, mỗi khối lấy đúng phần hàm bên trong |
| 404 / console | `read_signals` | `browser_network_requests` (lọc status ≥ 400) + `browser_console_messages` (lọc error) |

Không có browser MCP nào → dừng ở check tĩnh (build output + grep path), ghi rõ
"chưa check runtime". Không có agent `design-checker` (chưa cài promptAgent) → Lớp 2
tự so inline theo cùng nguyên tắc: CHỈ khi có ảnh baseline thật, screenshot ↔ ảnh từng section.
(Fallback Playwright mapping theo design-checker đã dùng ổn định; bản thân skill này mới
test end-to-end trên browserpilot.)

## Quick reference — các check Lớp 1 (scripts/layer1-checks.js)

| Check | Nghĩa | Mức |
|---|---|---|
| `img-broken` | `<img>` có src nhưng naturalWidth=0 (404/hỏng) | 🔴 |
| `img-lazy-not-loaded` | data-src còn nguyên sau khi đã scroll hết trang | 🔴 |
| `section-empty` | Con trực tiếp `#MS__wrapper` height < 2px mà không display:none | 🔴 |
| `text-clipped` | overflow hidden + scrollHeight vượt, hoặc nowrap + scrollWidth vượt (tolerance 4px) | 🔴 |
| `h-overflow` | scrollWidth > viewport; nếu html/body overflow-x:hidden → 🟡 (có thể decor bleed chủ ý) | 🔴/🟡 |
| `font-error` | document.fonts có font status=error | 🔴 |
| `lib-not-pruned` | Cả .MS__pc lẫn .MS__mb còn trong DOM → nghi lib init fail | 🟡 |
| `lib-pruned-wrong-side` | Lib giữ nhầm nhánh so với viewport: PC (>768px) chỉ còn .MS__mb, hoặc mobile chỉ còn .MS__pc | 🔴 |
| `read_signals` | 404 network + uncaught console error (không phải check của script, lấy từ signals) | 🔴 |

Phân loại report: 🔴 lỗi thật (kèm dẫn chứng selector + src) / 🟡 nghi ngờ cần mắt người /
⚪ waiver. Waiver đọc từ `.claude/knowledge/waivers.md` của campaign nếu có.

## Đường dẫn hỏng — chẩn đoán, không đoán

404 ở dist chỉ là TRIỆU CHỨNG. Với mỗi path hỏng, làm đủ chuỗi:
path 404 → grep source tìm reference (`file:line`) → tìm file tồn tại gần giống nhất →
phân loại nguyên nhân → đề xuất fix cụ thể trong report.

| Nguyên nhân | Fix ở đâu |
|---|---|
| Typo trong Twig/SCSS | Source (reference) |
| File có trong assets nhưng không vào dist | webpack config (`folderUse`, CopyPlugin) — không phải path |
| Xóa chủ ý (`DELETE_UNUSED_IMAGES`, chưa có art) | Không phải bug — ghi nhận |
| Backend/CDN inject lúc runtime | False positive local — ghi chú, bỏ qua |

`--fix` chỉ được: sửa reference trong source khi có ĐÚNG 1 ứng viên rõ ràng (sai case,
sai đuôi png/webp, rename có match hiển nhiên) → rebuild → chạy lại check để confirm →
liệt kê từng chỗ sửa. KHÔNG rename/xóa file asset, KHÔNG sửa khi ≥2 ứng viên, KHÔNG đụng
file user tự đặt vào project.

## Common mistakes

| Sai lầm | Thực tế |
|---|---|
| Kết luận PASS khi issues=[] mà quên read_signals | 404 asset không hiện trong DOM report — đã chứng minh bằng fault injection |
| Cắt đoạn scroll/fonts.ready khỏi script "cho nhanh" | Lazyload chưa kích = false img-lazy-not-loaded; font chưa load = false text-clipped |
| Serve nhầm dist project khác (port cũ còn sống) | Đã gặp thật port 8123 — luôn lsof + curl trước |
| h-overflow 🟡 auto báo lỗi đỏ | overflow-x:hidden có thể là decor bleed chủ ý — cần mắt người |
| Lớp 1 "đo" lệch design từ live DOM | Lớp 1 không có chuẩn design để so — so design là việc Lớp 2 với baseline thật |
| Check trên build cũ | Luôn build-dev lại trước — dist stale = kết quả vô nghĩa |

## Giới hạn trung thực

Lớp 1 bắt lỗi máy-đo-được (ảnh vỡ, chữ cắt, section trống, 404). Lớp 2 bắt lệch tầm trung
trở lên (thiếu/sai vị trí rõ, sai ảnh, sai màu rõ). Lệch tinh 1–3px và cảm quan spacing vẫn
cần mắt người — skill là CỔNG CHẶN LỖI TO trước QC, không thay QC. Report phải ghi rõ phạm vi
đã check (trang × viewport × lớp nào).

## Đã test (bằng chứng)

2026-07-10, trên `lan/landing/2026-that-tich` (3 locale, 7 section): trang sạch → 0 false
positive ở cả PC 1920×1080 lẫn mobile 768×1024 + TH; tiêm lỗi (img src hỏng + text bị nén
overflow hidden) → detector bắt đúng 2/2, 404 hiện trong read_signals; negative control
không báo oan phần tử nào khác.
