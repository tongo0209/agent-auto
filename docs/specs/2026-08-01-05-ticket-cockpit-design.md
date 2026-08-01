# Drawer "một ticket, một chỗ" + so design ↔ dist (hệ con ⑤)

Ngày: 2026-08-01 · Trạng thái: đã làm + đã verify

## Vấn đề

Muốn biết đủ về MỘT ticket phải mở 4 chỗ khác nhau: modal brief · Finder cho `designs/<KEY>`
(GW-654 có **25 ảnh**) · badge gate (chỉ có số đếm, không có finding) · modal commit. Việc chính
của user — dựng UI khớp design — thì phải mở 2 cửa sổ rồi tự canh mắt, và board đang phải viết
tay hướng dẫn `cd … && npx http-server dist -p 4899`.

## Phạm vi

| Làm | Không làm |
|---|---|
| Drawer 1 ticket: mốc · hành động · gallery design · findings gate · commit · file | Sửa dữ liệu ticket từ drawer (state vẫn do `/daily` ghi) |
| Lightbox + **so ảnh design ↔ `dist/` thật cạnh nhau**, cuộn đồng bộ | Đo pixel tự động / diff ảnh bằng thuật toán |
| Console TỰ CHẠY `fe-gate` và serve `dist/` (đều chỉ-đọc) | Console tự chạy `/code-developer`, commit, push (chỉ gõ hộ) |
| Ghi nhanh 1 dòng vào `## Cần bạn` / `## Log` | Sửa/xoá dòng đã có (chỉ tick xong/chưa) |

## Kiến trúc

### Server

```
GET  /api/ticket/:key      → { issue, images[], gate(findings đầy đủ), activity, files, dist }
GET  /api/design/:key/:name → ảnh design (chỉ trong designs/<KEY>, chỉ đuôi ảnh)
GET  /preview/:key/*        → serve dist/ thật của ticket (chỉ đọc, kẹp trong dist)
POST /api/gate/run/:key     → chạy tools/fe-gate.mjs trên dist rồi trả báo cáo
POST /api/board/append      → thêm dòng vào "Cần bạn"/"Log"
```

- `lib/ticket.js` gom 1 lần: mở panel mà gọi 5 API thì panel nhấp nháy từng phần.
- Ảnh design **chỉ lấy cấp 1** của `designs/<KEY>/` — không đệ quy vào `_raw/` (zip/PSD gốc,
  riêng GW-654 là 3.3GB).
- `dist/` suy từ `state.issues[key].paths` (entry cdn-source) + kiểm tra tồn tại. Không có →
  nút preview/gate biến thành ghi chú "build trước", không phải nút chết.
- **Giờ của dòng log do SERVER lấy** (`date` của máy), client không gửi giờ → chặn tận gốc lỗi
  ghi literal `HH:MM` (đã sai 3 board liền): không ai gõ giờ nữa thì không ai gõ sai được.
- `fe-gate` exit code 1 = gate FAIL (kết quả nghiệp vụ) → vẫn trả 200 kèm báo cáo; chỉ code khác
  0/1 hoặc timeout mới là lỗi hệ thống.

### Frontend

`src/panels/ticketPanel.js` — drawer overlay **toàn màn** (không nhét trong cột trái: khu so sánh
cần cả bề rộng cửa sổ, nhét vào cột 1100px thì mỗi bên còn ~500px, so ảnh thành vô nghĩa).

Khu so sánh:
- Ảnh design bên trái (width 100%), `dist/` bên phải trong iframe **cùng origin** (`/preview/...`)
  nên đọc/ghi được scroll của nó.
- **Khổ iframe theo loại ảnh**: tên file khớp `_MB/_mobile` → 768px, còn lại → 1920px, rồi
  `transform: scale(paneW / khổ)`. Để iframe `width:100%` là trang chạy nhánh layout khác với
  ảnh đang so — nhìn đâu cũng thấy "lệch" mà chẳng lệch gì.
- Cuộn đồng bộ theo **tỉ lệ** (không theo px): ảnh design và trang thật cao khác nhau. Có nút tắt.

## Bài học đã trả giá trong lần này

- **Class `pane` bị trùng**: 2 khung lightbox đặt `class="pane"` — trùng `.pane { display: none }`
  của pane tab trong `tabs.css` → khung 0×0, `scale` ra 0%, iframe không có layout. Đổi thành
  `.lpane` + id `lp-design`/`lp-dist`. Bài học chung: tên class trong file mới phải tra lại toàn
  bộ `styles/` trước khi dùng từ chung như `pane`, `row`, `head`.
- **Đo sai chỗ vẫn ra "PASS"**: vòng trước đo clipping ở `.ractions` (tab Review) mà quên `.c-act`
  của bảng task → nút bị cắt vẫn báo sạch. Nay tập đo phải gồm **mọi `td` của `.ttable`**.

## Kiểm chứng (đã chạy)

| Cái gì | Kết quả thật |
|---|---|
| `/api/ticket/GW-654` | 25 ảnh · gate PASS 0 ERROR/14 WARN · 14 findings · dist + previewUrl |
| Chặn traversal ảnh design | `..%2f..%2fconfig.json` → 404 · key lạ → 404 · ảnh thật → 200 (2.4MB) |
| Chặn traversal preview | `%2e%2e%2f`, `..%2f`, `--path-as-is` → **403** cả 3 dạng |
| Chạy gate qua API | `ok:true · pass:true · quét 2 css/1 html/11 @font-face/134 ref` |
| Ghi board | Log nhận **giờ thật 15:59** (khớp `date`), newline bị làm phẳng → không chèn được markdown lậu; board trả về y nguyên sau test |
| So design ↔ dist (ảnh MB) | iframe 768px · scale 123% · 0 ảnh vỡ · cuộn đồng bộ 0.3→0.30, 0.7→0.69, 1→1 · tắt đồng bộ thì dist đứng yên |
| Drawer 1920 / 768 | rộng 1180/722 · gallery 5/4 cột · **0 ô bị cắt · 0 nút wrap · 0 tràn ngang** · 0 lỗi console |
| Esc | đóng lightbox trước, lần 2 mới đóng drawer |
