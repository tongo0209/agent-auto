# Gate chất lượng output FE (hệ con ③)

> ⚠️ **MỘT PHẦN LỖI THỜI** — endpoint `GET /api/gate/:key` đã bị gỡ 18/8/2026 (code chết, UI lấy trọn qua `/api/gates`). Phần còn lại của spec vẫn đúng.

Ngày: 2026-08-01 · Trạng thái: đã duyệt · Thứ tự thực thi: 3/4

## Vấn đề — lỗi thiếu-vắng mà mọi lưới lọc đều trượt

GW-654 (ghi trong board 1/8): khung clone từ campaign cũ chỉ mang **2 font**, thiếu **8 font** của
design mới, trong đó `PlusJakartaSans-SemiBold` là font nhiều nhất toàn trang (373 run).

- `build` không fail (CSS trỏ font không tồn tại vẫn là CSS hợp lệ),
- console browser sạch (browser fallback **im lặng**),
- **2 design-checker vẫn PASS** (nhìn ảnh không phân biệt được font fallback gần giống).

Cùng loại: ảnh 404, font designer giao nhưng không ai dùng. Đặc điểm chung: **thứ vắng mặt**, mắt
và ảnh chụp không bắt được; chỉ so *danh sách khai báo* với *danh sách file thật* mới bắt.

## Giải pháp: script tĩnh, tất định, exit code thật

`agent-auto/tools/fe-gate.mjs` — Node thuần, không dependency mới (repo cdn-source cấm thêm dep).

```bash
node tools/fe-gate.mjs <dist-dir> [--design designs/GW-654] [--json out.json] [--strict]
```

| # | Check | Cách làm | Mức |
|---|---|---|---|
| 1 | `@font-face` trỏ file không tồn tại | bóc `src: url(...)` trong mọi `.css` của dist → resolve tương đối file css → tồn tại? | ERROR |
| 2 | `font-family` dùng mà không khai `@font-face` và không phải font hệ thống | tập font-family trong CSS − tập `@font-face` − whitelist hệ thống (`Arial`, `sans-serif`, `ui-monospace`…) | ERROR |
| 3 | Asset ref 404 | `url()` trong CSS + `src`/`srcset`/`href` ảnh trong HTML → tồn tại? (bỏ qua `http(s):`, `data:`, `#`) | ERROR |
| 4 | Font designer giao mà không dùng | `.ttf/.otf/.woff2` trong `--design` (kể cả `_raw/`) mà tên PostScript không xuất hiện trong `@font-face` nào | WARN |
| 5 | Ảnh > 500KB trong dist | `stat` | WARN |
| 6 | `dist/` không có file nào mới hơn source | mtime max(dist) < mtime max(src) ⇒ build cũ | ERROR |

Ra 2 dạng: bảng markdown cho người đọc + `--json` cho console/skill. **Exit 1 khi có ERROR** (hoặc
có WARN khi `--strict`).

## Cắm vào luồng

- `code-developer/SKILL.md`: trước khi báo "xong", manager **phải** chạy `fe-gate` và **dán output
  thật** vào báo cáo. ERROR còn tồn ⇒ không được dùng chữ "xong"; muốn bỏ qua phải ghi 1 dòng
  `GATE-OVERRIDE: <lý do>` — có dấu vết, không im lặng.
- Task landing/H5: chạy thêm `/ui-check` (browser: tràn ngang, ảnh vỡ) — gate tĩnh không thay được
  kiểm tra hiển thị, hai cái bổ nhau.
- `ui-check/SKILL.md`: thêm bước 0 "chạy fe-gate trước, đừng mở browser để tìm ảnh 404 — script
  nhanh hơn và không bỏ sót".
- Console: `GET /api/gate/:key` + `/api/gates` đọc `agent-auto/knowledge/gates/<KEY>.json` → badge
  gate trong tab Review (`✓ gate pass · 14 warn` / `✗ gate FAIL · 3 error`).
  **Sửa so với bản duyệt đầu:** báo cáo KHÔNG ghi vào `<dist>/.fe-gate.json` — `dist/` là folder
  giao hàng của repo cdn-source, thả file lạ vào đó là sớm muộn bị commit theo. Đường dẫn ra do
  `--json` quyết định, mặc định không ghi gì.

## Vì sao không dùng linter có sẵn

stylelint/htmlhint kiểm *cú pháp*, không kiểm *file có thật không* xuyên HTML→CSS→đĩa. Cái sai ở đây
hợp cú pháp hoàn toàn. Và cdn-source cấm thêm dependency vào build.

## Kiểm chứng — phải chứng minh gate không phải bù nhìn

1. Chạy trên `dist/` thật của GW-654 (`2026-affiliate-3`) và GW-477 (`2026-offline-tournament`) →
   ghi lại kết quả thật.
2. **Thử phá trên bản copy** trong scratchpad:
   - xoá 1 file `.ttf` mà CSS đang trỏ → check 1 phải ERROR;
   - thêm `font-family: KhongTonTai` vào 1 file css → check 2 phải ERROR;
   - đổi tên 1 ảnh → check 3 phải ERROR.
   Không bắt được ⇒ sửa script, không sửa kỳ vọng.
3. Đo tốc độ: phải < 5s trên campaign lớn nhất (nếu chậm hơn thì manager sẽ bỏ chạy).
