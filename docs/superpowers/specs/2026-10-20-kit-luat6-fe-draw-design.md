# Hấp thụ luật 6 của ai-template-kit (rút thăm phía FE) — thiết kế

Ngày: 2026-10-20 · Nguồn: commit kit `ccc2ddbe` (gt-promotion-template, 20/10/2026) · Duyệt: user, 3 lượt trong phiên

## 1. Mục tiêu

Kit thêm **luật 6 — có `pm__rut` là phải có `prodTemplate`** (AI-GUIDE §3, AI-RULES Lucky Draw §6, template
`gameplays/luckydraw-gift-exchange/components/fe-draw/`). Đây là lần đầu kit quy định cả phần JS/cấu hình phía FE.
agent-auto phải chuẩn hoá theo nó ở 3 chỗ:

- **Đầu vào:** file dự án ghi bảng quà trước khi code.
- **Cổng:** `pm-gate` bắt được trang có `pm__rut` mà thiếu hoặc sai cấu hình rút thăm.
- **Đầu ra:** bản bàn giao giữ khối `prodTemplate` ở cả `Promotion/` lẫn `mainsite/`.

Thành công khi:
- `pm-gate` chặn được trang Lucky có `pm__rut` mà thiếu `prodTemplate`, thiếu `spoint`, thiếu `names.en`, hoặc `data-item` lệch `items`.
- Luật trong `rules/` không còn chỗ nào mâu thuẫn với kit, ngoài các chỗ "production thắng kit" có dẫn chứng.

## 2. Kết quả soát toàn kit (bằng chứng)

| Mục | Kết luận |
|---|---|
| `pm-gate` chạy trên `MASTER-luckydraw-gift-exchange.html` / `MASTER-payment.html` | Chỉ báo placeholder kit cố ý để lại (`PG-ANY`, `-N`/`-*`, `data-milestone` rỗng). Không lệch hook |
| `skills/check-promotion` so với `ai-template-check-skill` | Bản agent-auto là bản mở rộng có chủ đích (id kit + production, chạy bằng script). Kit không đổi phần này từ 3/8 |
| `rules/pm-contract.md` R-PM-7 | Ghi "5 luật bất biến AI-GUIDE §3"; kit giờ có 6 → lỗi thời |
| Luật 6 | Chưa có cổng/luật nào trong agent-auto bắt |

Đối chiếu luật 6 với lib `libraryMainsite-1.3.2.js` và 107 file HTML bàn giao có `pm__rut` trong gt-promotion-template:

| Kit đòi | Lib 1.3.2 | Production | Quyết định |
|---|---|---|---|
| Có khối `prodTemplate` | `defaultSettings(){const e="undefined"==typeof prodTemplate?{}:prodTemplate…` | 97/107 | 🔴 |
| Khai bằng `var` | Đọc tên trần → `const` ở cấp trên cùng của script cổ điển vẫn thấy | 95 `const`, 2 `var` | Production thắng: nhận `var`/`const`/`let` cấp trên cùng; chặn `type="module"` và khai trong hàm |
| `pm__point spoint` trên cùng 1 thẻ | `el:{cp:".spoint"…}` mặc định | 68 cùng thẻ, 81 có `spoint` | Không có `spoint` = 🔴; khác thẻ = 🟡 |
| `names.en` + key = class `<body>` | `${r.en?`…${r[i("body").attr("class")][e.indexWord]}`:""}` | — | 🔴 |
| `data-item` trên ô quà | Chỉ hiệu ứng mẫu của kit dùng | 6/107 | Không có = 🟡; có mà lệch `items` = 🔴 |
| Comment `BACKEND:` trên khối | — | 3/107 | 🔴 ở file bàn giao, 🟡 trong cdn-source |
| `timeWait` dạng getter | `$.extend` nông → `settings.config` chung object; gán lại trong `animResult` cũng chạy | — | Nhận cả hai, task mới ưu tiên getter |

Lỗi thật đã lộ: `gt-promotion-template/454-TNTQC2/landing-sinhnhat-62857` có `prodTemplate` ở `mainsite/index.html:1204`,
nhưng `Promotion/index.html` không có. Đây chính là landing mẫu kit dẫn. Nguyên nhân không bị bắt: `tools/handoff-drift.mjs:38` xoá mọi `<script>` trước khi so.
Theo R-PM-13, bản này không tự sửa, chỉ báo user.

## 3. Thiết kế

### 3.1. Cổng `PG-DRAW` (`tools/pm-gate/draw.mjs`)

- Xuất `checkDraw(html, els, ctx)`. `runChecks` (`tools/pm-gate/checks.mjs`) nhận thêm HTML thô rồi gọi nó.
  Lý do: `scan.mjs` làm trống ruột `<script>` trước khi quét.
- Chạy khi: `fullDocument` (cùng điều kiện `PG-REQ`) **và** trang có phần tử mang `pm__rut` **và** gameplay ≠ `payment`.
  Partial Twig thì bỏ qua; `--page` trên `dist/` soát vì `configProduction.html.twig` được include lúc build.
- Đọc khối: tìm `<script>` không có `type="module"`, khai `var|const|let prodTemplate =` ở cấp trên cùng.
  Cắt object literal (đếm ngoặc, bỏ qua chuỗi/comment), đánh giá bằng `node:vm` trong context rỗng (`baseURL` undefined, timeout ngắn).

| Soát | Mức |
|---|---|
| Không có khối `prodTemplate` | 🔴 |
| Khai trong `<script type="module">` hoặc không ở cấp trên cùng | 🔴 |
| Khối đứng sau `<script src=…libraryMainsite-*.js>` | 🔴 |
| `vm` không đánh giá được object | 🟡 "soát tay" — bỏ các soát nội dung bên dưới |
| Thiếu `names.en` | 🔴 |
| Thiếu `names[<class của body>]` | 🔴 |
| `items` thiếu `length`/`type`, hoặc `length` ≠ số mã quà | 🔴 |
| Không phần tử nào có class `spoint` | 🔴 |
| `spoint` và `pm__point` ở 2 thẻ khác nhau | 🟡 |
| Có `data-item` mà giá trị không thuộc giá trị của `items` | 🔴 |
| Không có `data-item` nào | 🟡 |
| Không có comment chứa `BACKEND:` ngay trước khối `<script>` (chỉ cho phép khoảng trắng xen giữa) | 🔴 file bàn giao / `hooks-at: source`; 🟡 file trong campaign cdn-source có `hooks-at: handoff` — cùng logic hạ mức của `PG-REQ` |

- Cố ý **không** soát: `debug.status` (backend đổi `false` là đúng quy trình); `el` 6 key, `timeWait`, `window.load`
  (nằm trong bundle JS, không có trong HTML — thuộc R-JS-1/R-JS-2).
- Landing cũ: `--baseline HEAD` sẵn có đẩy lỗi có từ trước vào nhóm nợ.
- Mã báo: `PG-DRAW → R-PM-7 MUST` (luật 6 của kit).

### 3.2. Luật

| File | Sửa |
|---|---|
| `rules/pm-contract.md` | R-PM-7: 5 → 6 luật AI-GUIDE §3, nêu luật 6 + trỏ `fe-draw/`. Bảng mã thêm `PG-DRAW` (🔴·🟡). R-PM-10 thêm (h): test x1 và x5/x10 ở debug, popup bật **sau** khi hiệu ứng dừng, đóng popup tắt sáng ô trúng. R-PM-11 bước 3: Lucky có `pm__rut` ⇒ ghi bảng quà vào mục 5 (xem 3.4) |
| `rules/landing-js.md` R-JS-1 | Thêm: ô lượt `pm__point spoint` cùng thẻ; khởi tạo ở `window.load`; `directory: ''` + lấy ảnh theo `src` quà đang hiển thị; `<body>` chỉ mang class ngôn ngữ (lib tra `names` theo nó). Dẫn mẫu `fe-draw/draw-animation.js` + `tn3q/landing/2026-ld-sinhnhat` |
| `rules/landing-js.md` R-JS-2 | `timeWait`: getter (kit) hoặc gán lại trong `animResult`, cả hai hợp lệ; task mới dùng getter. Ghi dẫn chứng đọc lib |
| `rules/pm-kit-overrides.tsv` | 1 dòng `*  prodTemplate  -  known  <dẫn chứng 95/107 const + lib typeof>  no`. Ghi thêm vào `docs/notes/2026-09-23-kit-vs-production.md` (R-PM-9) |

### 3.3. Bàn giao — `rules/html-handoff.md` R-HO-13 MUST

Trang có `pm__rut` thì khối `prodTemplate` cùng comment `BACKEND:` phải có ở **cả** `Promotion/` lẫn `mainsite/`, và bàn giao với `debug.status: true`.
Nêu rõ: `handoff-drift` bỏ qua `<script>`, nên phần này do `PG-DRAW` soát qua R-HO-7 (chạy `pm-gate` trên từng file bàn giao).
Dẫn chứng: ca 62857.

Hệ quả user đã biết và chấp nhận: R-HO-7 dùng `--baseline none` cả với landing cũ, nên bàn giao lại landing quay cũ sẽ phải thêm comment `BACKEND:` / vá `names.en` (sửa 1 dòng, vô hại).

### 3.4. File dự án (đầu vào)

Không sửa code `project-note` (tiêu đề mục là hợp đồng với `lib/project-lock.mjs`). R-PM-11 bước 3 ghi:
gameplay Lucky có `pm__rut` ⇒ trước khi code, thêm vào mục *5. Quyết định & hằng số* bảng
`mã | data-item | tên theo locale · nguồn (thể lệ/PM) · ngày`. Đây là nguồn duy nhất để điền `items`/`names`.

## 4. Kiểm thử

- `tools/pm-gate.test.mjs` thêm fixture: 1 trang đạt (không lỗi `PG-DRAW`), 1 trang cho mỗi dòng 🔴 ở bảng 3.1, 1 trang `const` (phải đạt), 1 trang `type="module"` (🔴), 1 trang payment có `pm__rut` (không chạy `PG-DRAW`).
- Chạy thật:
  - `454-TNTQC2/landing-sinhnhat-62857/mainsite/index.html`: không có 🔴 `PG-DRAW`.
  - `…/Promotion/index.html`: 🔴 thiếu khối.
  - 1 bàn giao dùng `const`: không bị chặn vì `const`.
- Đo lại 107 file: in phân bố mã `PG-DRAW` để xác nhận mức chặn khớp bảng production ở mục 2. Lệch lớn thì quay lại thiết kế.
- Full suite `node --test tools/` chạy 1 lần cuối.

## 5. Ngoài phạm vi

- Không sửa landing đã bàn giao (R-PM-13). Ca 62857 chỉ báo user.
- Không sửa kit (của team promotion; lệch ghi vào note báo team).
- Không đụng `/check-promotion`, `handoff-drift`, code `project-note`.
