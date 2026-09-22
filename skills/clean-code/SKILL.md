---
name: clean-code
description: >
  Dọn code đã viết cho gọn theo luật R-CS-* — gỡ comment thừa, làm phẳng trừu tượng chỉ dùng
  1 lần, gộp CSS lặp, đặt tên cho magic number — rồi build verify để chắc không đổi hành vi.
  Dùng khi user nhắc: "code rườm quá", "dọn lại code", "clean code", "nhiều comment quá",
  "gọn lại giúp tôi", "code khó đọc", "junior đọc không hiểu", hoặc sau khi guard-style.sh
  cảnh báo dồn nhiều lần; và là pha tối ưu của landing mới (R-PM-11 bước 6). Mặc định dọn DIFF
  chưa commit; `full <path>` dọn cả folder. Trong cdn-source dọn thêm JS/SCSS theo R-JS-*/R-CDN-*,
  đọc file dự án trước, ghi phần chưa dọn vào mục Nợ; landing cũ chỉ dọn vùng đang chạm.
  KHÔNG đổi hành vi, KHÔNG đụng hợp đồng pm__/id/data-*, KHÔNG commit, KHÔNG push.
---

# /clean-code — dọn code đã lỡ viết rườm

Skill này **sửa code**, khác `/code-audit` (chỉ báo cáo, không sửa).
Dùng skill này thay vì `/simplify` built-in: `/simplify` **không biết luật `pm__`** — nó có thể gộp
selector hoặc đổi tên class làm chết nút trên production.

## Modes
| Lệnh | Phạm vi |
|---|---|
| `/clean-code` | Diff chưa commit + commit chưa push của repo hiện tại (mặc định) |
| `/clean-code full <path>` | Toàn bộ file code trong `<path>` |
| `/clean-code <file...>` | Đúng những file được liệt kê |

## Ràng buộc CỨNG — vi phạm là hỏng production, không phải hỏng thẩm mỹ

1. **KHÔNG đổi hành vi.** Chỉ dọn hình thức code. Thấy bug trong lúc dọn → **ghi ra báo cáo, không sửa**
   (sửa bug là việc của `/bug-fixer` hoặc `systematic-debugging`, trộn vào đây thì diff không review được).
2. **KHÔNG đụng hợp đồng platform.** `pm__…`, `id` đặc biệt, `data-*`, `name`/`type`/`for` của input:
   cấm đổi tên, cấm xoá, cấm gộp selector làm mất class. Đọc `~/VNG/agent-auto/rules/pm-contract.md`
   (R-PM-1..4) TRƯỚC khi chạm bất kỳ file nào có `pm__`.
3. **KHÔNG commit, KHÔNG push.** Dọn xong để user tự review diff.
4. **KHÔNG dọn** `node_modules/`, `dist/`, `build/`, `vendor/`, `*.min.*`, `webpack.config.*`, file sinh tự động.
5. **Landing cũ chỉ dọn vùng đang chạm** (spec D6). Landing cũ = thư mục campaign đã có ở `HEAD`
   (`git ls-tree HEAD -- <campaignDir>` không rỗng); landing mới = chưa có, hoặc đang ở pha tối ưu của task dựng mới.
   Landing cũ: chỉ file/section nằm trong diff; thấy mà không chạm → mục 7 *Nợ kỹ thuật* (bước 6), không sửa.
   `full <path>` trên landing cũ chỉ chạy khi user gõ rõ.

## Việc được làm (đúng 5 nhóm — 1-4 theo `~/VNG/agent-auto/rules/code-style.md`, 5 theo chuẩn landing)

| Nhóm | Làm gì | Luật |
|---|---|---|
| **Comment** | Gỡ comment mô tả lại code, banner `// =====`, JSDoc nhiều dòng, comment mốc section. **Giữ** 3 loại (rút còn 1 dòng ngắn nếu đang dài dòng): hợp đồng platform `pm__`/`MS__`/`MJ__`/`data-*` · hack/workaround trình duyệt–thư viện · logic bí ẩn (công thức, thứ tự bắt buộc, ràng buộc backend). Comment dài hơn đoạn code nó tả → rút gọn. Nghi ngờ → giữ và liệt kê ra báo cáo để user quyết. | R-CS-1 |
| **Phòng thủ thừa** | Gỡ `try-catch` bọc DOM query, `if (!el) return`, `?.` cho thứ luôn tồn tại. **Chỉ gỡ khi đã xác minh** element/field có trong markup cùng file hoặc luôn có trong response. Không xác minh được → giữ nguyên. | R-CS-2 |
| **Trừu tượng 1-lần-dùng** | Inline hàm/biến trung gian/util chỉ có đúng 1 chỗ gọi. Grep toàn repo trước khi inline — có ≥2 chỗ dùng thì GIỮ. | R-CS-3 |
| **Lặp & tên** | Gộp selector CSS trùng thuộc tính, thay thứ viết tay bằng mixin/class repo đã có, magic number → hằng có tên. | R-CS-4, R-CS-5 |
| **Chuẩn landing `cdn-source`** | Chỉ với file thuộc `cdn-source/products/**`: dò dấu hiệu ở bảng dưới, **Dọn** mục an toàn, còn lại ghi **Nợ**. | R-JS-*, R-CDN-*, R-SPR-*, R-LAY-1 |

Không tự thêm tính năng, không đổi kiến trúc, không refactor ngoài 5 nhóm trên.

Trong `cdn-source`: dọn xong vẫn phải đúng `~/VNG/agent-auto/rules/cdn-source-standard.md` (R-CDN-*),
`landing-js.md` (R-JS-*) và `popup-library.md` (R-POP-*) — **KHÔNG** được "gọn hoá" bằng cách thay
`@include mobile/pc` bằng `@media`, đổi px sang rem/%, gộp popup `extends base.html.twig` thành markup phẳng,
hay xoá class `MS__`/`MJ__` "thừa". Thấy code lệch chuẩn ngoài 5 nhóm → **liệt kê ra báo cáo kèm mã luật** và
ghi mục 7 Nợ, không tự sửa.

### Nhóm 5 — chuẩn landing `cdn-source` (JS/SCSS)
Đọc `~/VNG/agent-auto/rules/landing-js.md` + `cdn-source-standard.md` trước. **Dọn** = chuyển về ✅ mà hành vi
giữ nguyên (cùng giá trị, cùng thứ tự chạy). **Nợ** = chuyển sẽ đổi hành vi/thời điểm chạy, hoặc là bug — không sửa,
ghi báo cáo + mục 7. Dò nhanh trong phạm vi:
```
grep -rnE 'timeWait: *[0-9]|class Core|new Core\(|let globalCount|allowScrollTrigger|className\.match\(|innerWidth *<= *768|userAgent|orientationchange|setInterval\(|\.off\(.resize|promotion3\.js|MJPromotion|typeof (prodTemplate|dndPromotion)' <phạm vi JS>
grep -rnE '@media|background-position: *-?[0-9]|images/sprite/' <phạm vi SCSS>
```

| Dấu hiệu | Luật | Xử lý |
|---|---|---|
| `timeWait: <số>` | R-JS-2 | **Dọn** khi số bằng đúng phép tính từ hằng animation (đặt hằng, viết thành biểu thức). Lệch → bug timing → Nợ |
| `class Core`, `new Core().wait`, `let globalCount` | R-JS-2 | **Dọn** sang `wait()` + vòng `for`, giữ đúng số bước và ms |
| chờ `window.$` bằng `setInterval`, `if (!$) return`, `typeof prodTemplate/dndPromotion` | R-CDN-7, R-CS-2 | **Dọn** sau khi xác minh `assets/index.html.twig` nạp lib đồng bộ trước `{{name}}.js` và biến có trong `configProduction.html.twig` |
| 2 hàm chỉ khác mảng dữ liệu; khối giống hệt ở ≥2 frame | R-JS-10, R-JS-11, R-CS-3 | **Dọn**: 1 hàm nhận dữ liệu làm tham số; khối chung về `main/`, gọi qua namespace |
| biến/global không ai đọc (grep cả campaign + twig + HTML bàn giao ở mục 2 file dự án) | R-JS-11 | **Dọn** (xoá). Còn chỗ đọc ngoài JS → Nợ |
| `className.match(`, `classList).find(` để lấy dữ liệu | R-JS-9 | **Dọn** khi twig cùng section nằm trong phạm vi (thêm `data-<mã>-*`, đọc `dataset`); không thì Nợ |
| `el: {` thiếu key, `informContent` không khoá `#popup_inform` | R-JS-1 | bug → Nợ |
| `$(document).on(` cho nút mang `MJ__*` | R-JS-3 | handler chết → Nợ |
| bộ `showPopup`/`closePopup` riêng, `Object.values(popups).some` | R-JS-4 | Nợ |
| `setInterval(` dò DOM, `dispatchEvent(new Event('resize'))` rải ở frame, `.off('resize')` | R-JS-5, R-JS-6 | Nợ |
| nút gọi API/engine không có cờ bận, hoặc cờ không chặn | R-JS-7 | bug → Nợ |
| cờ mock gõ tay, FE tự gắn `.received` sau claim | R-JS-8 | Nợ |
| `innerWidth <= 768`, `userAgent`, reload khi `orientationchange`, ngôn ngữ từ class `body`/`?locale=` | R-JS-12, R-JS-13 | Nợ |
| `promotion3.js`, `class MJPromotion`, vòng quay tự viết | R-CDN-8 | Nợ |
| SCSS `@media` tay | R-CDN-5 | **Dọn** khi điều kiện trùng thân mixin `mobile`/`pc` trong `additionalData` của `webpack.config.js`; khác → Nợ |
| SCSS `width`/`height` viết lại cạnh `@include sprite()` | R-SPR-7 | **Dọn** khi bằng đúng số trong biến sprite; khác → Nợ |
| SCSS `background-position` số cứng, `url()` trỏ PNG lẻ trong `images/sprite/` | R-SPR-5 | Nợ (phải build lại atlas, đổi hình) |
| list gắn toạ độ từng item | R-LAY-1 | `node ~/VNG/agent-auto/tools/layout-gate.mjs <path>` → Nợ |

## Quy trình

0. **File dự án (file thuộc campaign cdn-source hoặc HTML bàn giao của nó).**
   `node ~/VNG/agent-auto/tools/project-note.mjs path <campaignDir|file>` → in đường dẫn file dự án; đọc mục 3
   (sơ đồ file), 4 (bản đồ hook), 7 (nợ đã ghi) TRƯỚC khi đọc code. Stderr `chưa có file` →
   `project-note init <campaignDir>`. Exit 1 (không thuộc campaign nào) → bỏ bước 0 và bước 6.
   Chốt luôn landing mới hay cũ (ràng buộc 5).
1. **Xác định phạm vi.** Mặc định: `git status --short` + `git diff --stat` + `git log origin/<branch>..HEAD --name-only`.
   Không phải git repo → hỏi user đường dẫn.
2. **Chốt baseline.** Ghi lại: số file, tổng dòng, số dòng comment (`grep -cE '^\s*(//|/\*|\*|<!--|\{#)'`).
   **Chụp danh sách tên `pm__`** vào `/tmp/pm-before.txt` (lệnh ở bước 5) — bắt buộc, đây là thứ duy nhất
   chứng minh được không mất hook platform khi file chưa commit.
   Có build → chạy build TRƯỚC khi dọn, lưu kết quả làm mốc so sánh. **Build đã fail từ trước khi dọn**
   → dừng, báo user: không có mốc thì không chứng minh được "dọn xong vẫn chạy".
3. **Đọc luật.** `rules/code-style.md`; file nào có `pm__` thì đọc thêm `rules/pm-contract.md`; file thuộc
   cdn-source thì đọc thêm `rules/landing-js.md` + `rules/cdn-source-standard.md` (nhóm 5).
4. **Dọn từng file**, theo thứ tự 5 nhóm trên. File >300 dòng thì dọn theo khối, không rewrite cả file.
5. **Verify — bắt buộc, không được bỏ:**
   - Build lại (`npm run build` hoặc lệnh của repo). Build fail → **revert file vừa dọn**, báo user, dừng.
   - `git diff` đọc lại chính diff của mình: có dòng nào đổi hành vi không?
   - **Cổng `pm__` — so TẬP HỢP TÊN, không so dòng.** Với từng file đã sửa:
     ```
     diff <(git show HEAD:<file> | grep -oE 'pm__[a-zA-Z0-9_-]+' | sort -u) \
          <(grep -oE 'pm__[a-zA-Z0-9_-]+' <file> | sort -u)
     ```
     Phải RỖNG. Mất tên nào = R-PM-1 MUST, revert ngay.
     **File chưa commit / không có git / mode `full`** → `git show HEAD:` không có gì để so.
     Khi đó ở **bước 2 (baseline)** phải chụp trước danh sách tên, rồi so lại sau khi dọn:
     ```
     # bước 2, TRƯỚC khi dọn:
     grep -rhoE 'pm__[a-zA-Z0-9_-]+' <phạm vi> | sort -u > /tmp/pm-before.txt
     # bước 5, SAU khi dọn:
     grep -rhoE 'pm__[a-zA-Z0-9_-]+' <phạm vi> | sort -u | diff /tmp/pm-before.txt -
     ```
     Không chụp được baseline ⇒ **không được dọn file có `pm__`** — báo user, bỏ qua file đó.
     ⚠️ KHÔNG dùng `git diff | grep '^-.*pm__'` — cổng đó **báo động giả**: mọi lần định dạng lại một
     dòng có chứa `pm__` (inline biến, lồng `&.active`) đều làm nó kêu dù không tên nào mất.
     Đo thật 16/8/2026 trên fixture: 2 báo đỏ, cả 2 đều oan.
   - File có `pm__` → `node ~/VNG/agent-auto/tools/pm-gate.mjs <file>` cả TRƯỚC khi dọn (lúc chốt baseline bước 2)
     lẫn sau khi dọn: 🔴 sau mà trước không có = revert file đó (gate so với `HEAD`, nên 🔴 từ diff dở của user đã có ở lần trước).
   - Repo cdn-source có UI → gợi ý user chạy `/ui-check`, không tự chạy.
6. **Ghi file dự án** (có file từ bước 0):
   - Mọi mục **Nợ** của nhóm 5 + phần thấy mà không chạm (landing cũ) + bug thấy lúc dọn → thêm tay vào
     `## 7. Nợ kỹ thuật`, mỗi dòng `- [ ] <MÃ LUẬT> <việc> (<file:line>)`, bỏ dòng đã có. Lỗi `pm-gate` có sẵn:
     `pm-gate <file> --json > <scratch>/gate.json` rồi `project-note debt <campaignDir> --from <scratch>/gate.json`.
   - `project-note refresh <campaignDir>` (dọn làm lệch dòng ở mục 4) rồi
     `project-note log <campaignDir> "clean-code · <đã dọn gì> · chưa commit"`.
7. **Báo cáo** (mẫu dưới). Không paste lại code — user tự xem diff.

## Mẫu báo cáo

```
## /clean-code — <phạm vi>

Trước: <n> file · <n> dòng · <n> dòng comment
Sau:   <n> file · <n> dòng · <n> dòng comment   (−<n>%)

Đã dọn
- <file>: gỡ <n> comment mô tả lại code (R-CS-1), inline <n> hàm 1-lần-dùng (R-CS-3)
- <file>: gộp <n> selector trùng (R-CS-4)

Giữ lại có chủ ý
- <file:line>: comment hack Safari iOS <16 — R-CS-1 ngoại lệ (b)
- <file:line>: `if (!el) return` — element render theo điều kiện, không xác minh được là luôn có

Phát hiện KHÔNG sửa (ngoài phạm vi skill)
- <file:line>: <mô tả bug / nợ kỹ thuật> → nên xử lý bằng <đường ray nào>

File dự án <đường dẫn>  (landing mới|cũ)
- mục 7 Nợ: +<n> dòng (<MÃ LUẬT>…) · refresh ✅ · log ✅

Verify
- ⏱ build: <lệnh> → <kết quả thật>
- cổng `pm__` (so TẬP HỢP TÊN, bước 5): `diff <(git show HEAD:<file> | grep -oE 'pm__[a-zA-Z0-9_-]+' | sort -u) <(grep -oE 'pm__[a-zA-Z0-9_-]+' <file> | sort -u)` → rỗng ✅
- Chưa commit, chưa push — user tự review diff.
```

## Cổng nghiệm thu cuối (R-CS-7)
Trước khi báo xong, tự đọc lại đoạn đã dọn bằng con mắt intern/fresher: đọc **một lượt từ trên xuống,
không nhảy file** — có hiểu nó làm gì không? Không đạt thì làm phẳng thêm hoặc đổi tên cho rõ.
**Cấm chữa bằng cách thêm comment** — đó là đúng cái vấn đề skill này sinh ra để dọn.
