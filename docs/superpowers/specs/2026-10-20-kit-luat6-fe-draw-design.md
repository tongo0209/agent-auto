# Hấp thụ luật 6 của ai-template-kit (rút thăm phía FE) — thiết kế

Ngày: 2026-10-20 · Nguồn: commit kit `ccc2ddbe` (gt-promotion-template, 20/10/2026) · Duyệt: user, 3 lượt trong phiên

## 1. Mục tiêu

Kit thêm **luật 6 — có `pm__rut` là phải có `prodTemplate`** (AI-GUIDE §3, AI-RULES Lucky Draw §6, template
`gameplays/luckydraw-gift-exchange/components/fe-draw/`). Đây là lần đầu kit quy định cả phần JS/cấu hình phía FE.
agent-auto phải chuẩn hoá theo nó ở 3 chỗ:

- **Đầu vào:** file dự án ghi bảng quà trước khi code.
- **Cổng:** `pm-gate` bắt được trang có `pm__rut` mà thiếu hoặc sai cấu hình rút thăm.
- **Đầu ra:** bản bàn giao `mainsite/` giữ khối `prodTemplate`. Folder `Promotion/` **không thuộc phạm vi** (user chốt 20/10/2026: chỉ quan tâm `mainsite/` đúng chuẩn, không đụng `Promotion/`).

Thành công khi:
- `pm-gate` chặn được trang Lucky có `pm__rut` mà thiếu `prodTemplate`, thiếu `spoint`, thiếu `names.en`, hoặc khối `prodTemplate` rỗng; `data-item` lệch `items` được báo 🟡.
- Luật trong `rules/` không còn chỗ nào mâu thuẫn với kit, ngoài các chỗ "production thắng kit" có dẫn chứng.

## 2. Kết quả soát toàn kit (bằng chứng)

| Mục | Kết luận |
|---|---|
| `pm-gate` chạy trên `MASTER-luckydraw-gift-exchange.html` / `MASTER-payment.html` | Chỉ báo placeholder kit cố ý để lại (`PG-ANY`, `-N`/`-*`, `data-milestone` rỗng). Không lệch hook |
| `skills/check-promotion` so với `ai-template-check-skill` | Bản agent-auto là bản mở rộng có chủ đích (id kit + production, chạy bằng script). Kit không đổi phần này từ 3/8 |
| `rules/pm-contract.md` R-PM-7 | Ghi "5 luật bất biến AI-GUIDE §3"; kit giờ có 6 → lỗi thời |
| Luật 6 | Chưa có cổng/luật nào trong agent-auto bắt |

Đối chiếu luật 6 với lib `libraryMainsite-1.3.2.js` và 62 file `mainsite/*.html` có `pm__rut` trong gt-promotion-template (đo 20/10/2026):

| Kit đòi | Lib 1.3.2 | Production | Quyết định |
|---|---|---|---|
| Có khối `prodTemplate` | `defaultSettings(){const e="undefined"==typeof prodTemplate?{}:prodTemplate…` | 57/62 | 🔴 |
| Khai bằng `var` | Đọc tên trần → `const` ở cấp trên cùng của script cổ điển vẫn thấy | 55 `const`, 2 `var` | Production thắng: nhận `var`/`const`/`let` cấp trên cùng; chặn `type="module"` và khai trong hàm |
| `pm__point spoint` trên cùng 1 thẻ | `el:{cp:".spoint"…}` mặc định | 34 cùng thẻ, 46 có `spoint` | Không có `spoint` = 🔴; khác thẻ = 🟡 |
| `names.en` + key = class `<body>` | `${r.en?`…${r[i("body").attr("class")][e.indexWord]}`:""}` | — | 🔴 |
| `data-item` trên ô quà | Chỉ hiệu ứng mẫu của kit dùng | 5/62 (JX1M 59399 dùng `data-item` đánh số ô theo nghĩa riêng) | Không có = 🟡; lệch `items` = 🟡 (sửa sau đo 20/10: 🔴 ban đầu chặn nhầm JX1M; so theo chuỗi vì ZSM 58018 khai `items` số) |
| Comment `BACKEND:` trên khối | — | 2/62 | 🔴 ở file bàn giao, 🟡 trong cdn-source |
| `timeWait` dạng getter | `$.extend` nông → `settings.config` chung object; gán lại trong `animResult` cũng chạy | — | Nhận cả hai, task mới ưu tiên getter |

Ghi nhận: `454-TNTQC2/landing-sinhnhat-62857/Promotion/index.html` thiếu `prodTemplate` (bản `mainsite/` có, dòng 1204).
User chốt: `Promotion/` ngoài phạm vi, không sửa, không soát.

## 3. Thiết kế

### 3.1. Cổng `PG-DRAW` (`tools/pm-gate/draw.mjs`)

- Xuất `checkDraw(html, els, ctx)`. `runChecks` (`tools/pm-gate/checks.mjs`) nhận thêm HTML thô rồi gọi nó.
  Lý do: `scan.mjs` làm trống ruột `<script>` trước khi quét.
- Chạy khi: `fullDocument` (cùng điều kiện `PG-REQ`) **và** trang có phần tử mang `pm__rut` **và** gameplay ≠ `payment` **và** đường dẫn file không nằm trong thư mục `Promotion/` của gt-promotion-template.
  Partial Twig thì bỏ qua; `--page` trên `dist/` soát vì `configProduction.html.twig` được include lúc build.
- Đọc khối: tìm `<script>` không có `type="module"`, khai `var|const|let prodTemplate =` ở cấp trên cùng.
  Cắt object literal (đếm ngoặc, bỏ qua chuỗi/comment), đánh giá bằng `node:vm` trong context rỗng (`baseURL` undefined, timeout ngắn).

| Soát | Mức |
|---|---|
| Không có khối `prodTemplate` | 🔴 |
| Khai trong `<script type="module">` hoặc không ở cấp trên cùng | 🔴 |
| Khối đứng sau `<script src=…libraryMainsite-*.js>` | 🔴 |
| `vm` không đánh giá được object | 🟡 "soát tay" — bỏ các soát nội dung bên dưới |
| Khối rỗng `prodTemplate = {}` (TLBBVNG 62834/62835/62837: engine do platform khởi tạo) | 🔴, 1 lỗi duy nhất — không tách thành names/items |
| Thiếu `names.en` | 🔴 |
| Thiếu `names[<class của body>]` | 🔴 |
| `items` thiếu `length`/`type`, hoặc `length` ≠ số mã quà | 🔴 |
| Không phần tử nào có class `spoint` | 🔴 |
| `spoint` và `pm__point` ở 2 thẻ khác nhau | 🟡 |
| Có `data-item` mà giá trị (so theo chuỗi) không thuộc giá trị của `items` | 🟡 |
| Không có `data-item` nào | 🟡 |
| Không có comment chứa `BACKEND:` ngay trước khối `<script>` (chỉ cho phép khoảng trắng xen giữa) | 🔴 file bàn giao / `hooks-at: source`; 🟡 file trong campaign cdn-source có `hooks-at: handoff` — cùng logic hạ mức của `PG-REQ` |

- Bổ sung sau đo thật 20/10 (Task 2):
  - Biến platform chèn lúc chạy (`url: mainProgramUrl`, 15/62 file) → `vm` gán `undefined` rồi chạy lại trên context mới (tối đa 10 biến), không rơi vào 🟡 "soát tay".
  - `spoint` soát trước `vm` (chỉ dựa DOM).
  - `tools/pm-gate/scan.mjs`: comment HTML chứa `<script>` (MASTER Lucky dòng 511) từng mở khối raw và nuốt phần tử tới `</script>` kế tiếp → giờ khớp comment trước.
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
| `rules/pm-kit-overrides.tsv` | 1 dòng `*  prodTemplate  -  known  <dẫn chứng 54/57 mainsite khai const + lib typeof>  no`. Ghi thêm vào `docs/notes/2026-09-23-kit-vs-production.md` (R-PM-9) |

### 3.3. Bàn giao — `rules/html-handoff.md` R-HO-13 MUST

Trang có `pm__rut` thì `mainsite/<file>.html` phải có khối `prodTemplate` cùng comment `BACKEND:`, và bàn giao với `debug.status: true`.
`Promotion/` không soát, không sửa (user chốt 20/10/2026).
Nêu rõ: `handoff-drift` bỏ qua `<script>`, nên phần này do `PG-DRAW` soát qua R-HO-7 (chạy `pm-gate` trên từng file `mainsite/`).

Hệ quả user đã biết và chấp nhận: R-HO-7 dùng `--baseline none` cả với landing cũ, nên bàn giao lại landing quay cũ sẽ phải thêm comment `BACKEND:` / vá `names.en` (sửa 1 dòng, vô hại).

### 3.4. File dự án (đầu vào)

Không sửa code `project-note` (tiêu đề mục là hợp đồng với `lib/project-lock.mjs`). R-PM-11 bước 3 ghi:
gameplay Lucky có `pm__rut` ⇒ trước khi code, thêm vào mục *5. Quyết định & hằng số* bảng
`mã | data-item | tên theo locale · nguồn (thể lệ/PM) · ngày`. Đây là nguồn duy nhất để điền `items`/`names`.

## 4. Kiểm thử

- `tools/pm-gate.test.mjs` thêm fixture: 1 trang đạt (không lỗi `PG-DRAW`), 1 trang cho mỗi dòng 🔴 ở bảng 3.1, 1 trang `const` (phải đạt), 1 trang `type="module"` (🔴), 1 trang payment có `pm__rut` (không chạy `PG-DRAW`), 1 trang nằm dưới `Promotion/` (không chạy `PG-DRAW`).
- Chạy thật:
  - `454-TNTQC2/landing-sinhnhat-62857/mainsite/index.html`: không có 🔴 `PG-DRAW`.
  - `…/Promotion/index.html`: không chạy `PG-DRAW` (ngoài phạm vi).
  - 1 bàn giao dùng `const`: không bị chặn vì `const`.
- Đo lại các file `mainsite/` có `pm__rut`: in phân bố mã `PG-DRAW` để xác nhận mức chặn khớp bảng production ở mục 2. Lệch lớn thì quay lại thiết kế.
- Full suite `node --test tools/` chạy 1 lần cuối.

## 5. Ngoài phạm vi

- Không sửa landing đã bàn giao (R-PM-13).
- Không soát, không sửa folder `Promotion/` (user chốt 20/10/2026).
- Không sửa kit (của team promotion; lệch ghi vào note báo team).
- Không đụng `/check-promotion`, `handoff-drift`, code `project-note`.

## 6. Hai vòng review độc lập (20/10, sau commit d0eabfe)

Mỗi phát hiện có ca test riêng trong `tools/pm-gate.test.mjs` (78, 88–102), viết đỏ trước rồi mới sửa.

| Phát hiện | Sửa |
|---|---|
| `node:vm` không phải sandbox: khối thoát ra ghi được file; Promise lặp vô tận làm treo gate (và hook guard-pm) | Khối chạy trong `node --permission` con (chặn file, mạng, tiến trình con), `env: {}`, chặn `process.kill`, vm `microtaskMode: 'afterEvaluate'`, spawn timeout 5s. node < 22 → 🟡 nói rõ chưa soát nội dung |
| Bỏ qua `Promotion/` phân biệt hoa thường, gõ đường dẫn tương đối thì lọt | Trong gt-promotion-template chỉ soát file dưới `mainsite/` (không phân biệt hoa thường, đường dẫn resolve); ngoài đó giữ bỏ qua `Promotion/` vì `promotion/` của cdn-source là source |
| Comment Twig `{# #}`, chuỗi `<!--` trong JS, thuộc tính có `>`, `type="text/template"`, `<script src>`/`nomodule`, lib `defer` | Một regex tách comment HTML/Twig và `<script>` theo thứ tự; chỉ khối thân chạy được mới tính; lib `defer` không tính thứ tự; `{# #}` giữa `BACKEND:` và khối không tính là chen |
| Biến ngoài (`$`, `mainProgramUrl`) | Stub mang tên biến; `names`/`items` dính stub → 🟡 "lấy từ biến ngoài", không lọt im; stub cộng chuỗi được (gno 4 tuổi) |
| `scan.mjs`: `{# … <template> … #}` nuốt phần tử phía sau (có từ trước) | `RAW_TEXT` khớp `{# #}` trước. So 2113 file thật: khác 3 file, cả 3 là sửa đúng |

Đối chứng sau sửa: 107 file `pm__rut` gt-promotion (63 mainsite, thêm `658-KTO/…/Mainsite/` viết hoa mà phép đo cũ sót) — 0 file ngoài mainsite bị PG-DRAW; 325 trang cdn-source — PG-DRAW giống hệt bản HEAD (844/844 dòng).

Review vòng 3 (trên 141ff0a): không bug nào ăn vào file thật (63 mainsite + 339 trang cdn-source). Vá rẻ 4 điểm, có test 103–105: đường dẫn qua symlink → `realpathSync`; `// const prodTemplate` hay chuỗi trong script khác (có thật ở ballistic, sofi preregister) không tính là khai báo; `<style>/<textarea>/<template>` là raw; node thiếu `--permission` (22.0–22.12) → 🟡 nói rõ. Để lại, ghi nhận: stub không mô phỏng `typeof`/`window.X`/spread/so sánh nên các nhánh đó có thể ra 🔴 thay vì 🟡 — corpus hiện 0 khối dùng cho names/items. Test chạy 111/0 trên node 22.23, 24.21, 25.9; gt-promotion và cdn-source quét lại giống hệt.
