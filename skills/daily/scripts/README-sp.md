# Bộ tải design SharePoint — 4 bước, chống tải sót

Dựng 2026-08-03 sau ca GW-556: ghi "đã tải design" trong khi chỉ có **8/56 file (1.28% byte)**.
Cùng lỗi đã xảy ra 31/7 ở GW-477 (sót 48 PNG state). Bộ script này biến "phải nhớ" thành "máy kiểm".

## Chạy

```bash
KEY=GW-556
DESIGN=~/VNG/agent-auto/designs/$KEY
MAN=~/Downloads/sp-manifest-$KEY.json
```

**1. Cấp session** — `open -a "Microsoft Edge" "<share link>"` một lần, rồi dùng extension
Claude in Chrome `navigate` tới một URL `/_api/…` của site đó.
⚠ Tab do `open -a` mở KHÔNG thuộc MCP tab group → phải `navigate` bằng chính extension.

**2. Quét đệ quy → manifest nguồn** — sửa `KEY`/`SITE`/`ROOT` trong `sp-scan.js`, chạy qua
`mcp__claude-in-chrome__javascript_tool`. Manifest tự tải về `~/Downloads/sp-manifest-<KEY>.json`.

**3. Tải phần còn thiếu**

```bash
node sp-coverage.mjs $MAN $DESIGN --todo     # danh sách rel path còn thiếu
```
Đổ ≤12 đường dẫn vào `TODO` của `sp-fetch.js` → chạy qua `javascript_tool`. Lặp cho tới hết.

**4. Nhặt + verify**

```bash
node sp-collect.mjs  $MAN $DESIGN            # Downloads → $DESIGN/_src/<rel>, chặn HTML/magic sai
node sp-coverage.mjs $MAN $DESIGN            # exit 0 = ĐỦ. Chỉ khi đó mới được nói "đã tải xong"
```

## Ba cái bẫy đã trả giá — đừng dẫm lại

| Bẫy | Dấu hiệu | Chốt chặn |
|---|---|---|
| `/Files` **chỉ trả 1 cấp** | feed ở folder gốc rỗng → tưởng "folder trống" | `sp-scan.js` đi đệ quy `/Folders`; folder gốc rỗng là BÌNH THƯỜNG |
| **Verify tương đối** — "tổng byte khớp listing" | PASS trong khi thiếu 48/56 file | tiêu chí đủ CHỈ là `sp-coverage.mjs` exit 0 |
| **Trần CDP 45s** | tool báo "Runtime.evaluate timed out", vài file cuối mất im lặng | ≤12 file/lần gọi; timeout **không huỷ** lệnh đã phát → chờ 10s, kiểm `~/Downloads`, rồi mới phát lại phần `--todo` còn thiếu (không sẽ tải trùng) |
| **Tab đang tải nặng thì REST cũng timeout** | `sp-scan.js` timeout dù cây chỉ vài folder | Quét TRƯỚC khi tải, hoặc đợi `~/Downloads/*.crdownload` về 0. Quét nhiều ticket thì **1 folder/lần gọi** |
| **Stall khi dồn nhiều luồng** | vài file nhỏ đứng yên hàng chục phút, file lớn vẫn chạy | giữ ≤6 file inflight; size không đổi qua 2 lần đo cách 60s = stall → `rm` file `.crdownload` đó rồi phát lại đúng file đó |
| **File CẮT nhưng Chrome vẫn FINALIZE** (không còn `.crdownload`, trông như tải xong) | `2_SelectCharacter.psd` 20.066.304 ≠ nguồn 20.571.334 · `8_Reward.psd` 16.396.288 ≠ 25.120.213 · `9_PlayAgain.psd` 4.599.808 ≠ 25.098.716 | **KHÔNG tin "hết .crdownload" = xong.** Luôn so size với manifest rồi `rm` file lệch trước khi collect. `sp-collect.mjs` bỏ qua file lệch nên nó nằm lại `~/Downloads` và làm lần sau tưởng đã có |
| **Tên file NFD trên nguồn — `.normalize("NFC")` làm 404** | không có file nào về, thay vào đó `~/Downloads/download.html` ~268KB (trang lỗi SharePoint) | REST trả tên **NFD** (`10_Share_5banner_chưaxoay.psd` = `chu` + U+031B). Dùng **nguyên văn `rel` từ manifest**, KHÔNG normalize chiều nào. Kiểm nhanh: `encodeURIComponent` phải ra `chu%CC%9Baxoay`, ra `ch%C6%B0` là đã NFC → sẽ 404 |

### Nhịp tải: 1–2 luồng, KHÔNG PHẢI 6 (đo thật 2026-08-11, GW-525 / 714MB)

Dòng "≤6 file inflight" ở trên là **trần an toàn cũ, vẫn quá cao trên máy+mạng này**. Số đo:

| Luồng | Kết quả |
|---|---|
| 1 | **840 KB/s ổn định, 0 stall, byte khớp tuyệt đối** (144.6MB/180s) |
| 2 | ~900 KB/s aggregate, sạch cả 2 lần thử (2×140MB và 60+35MB) — Edge tự serialize |
| 3 | 1 file cắt-finalize + 1 stall 60s; chỉ 1/3 file về đúng |
| 4–5 | 3/5 file đứng hẳn 200s+, 1 file cắt-finalize |

⇒ **Aggregate ~900 KB/s là trần BĂNG THÔNG, không phải trần concurrency** — dồn luồng KHÔNG
nhanh hơn, chỉ thêm stall và file cắt. Mặc định **2 luồng**; gặp bất kỳ file lệch byte thì rơi
về **1 luồng**. Ước thời gian = `tổng byte / 900KB/s` (714MB ≈ 13 phút) để biết trước có nên
báo user là việc chạy nền hay không.

## Ghi state sau khi xong

`state.issues[KEY].design`:
- `status`: `đã-giao-đã-tải` **chỉ khi** coverage exit 0; chưa đủ → `đã-giao-tải-một-phần`
- `manifest`: đường dẫn tới bản chép trong `designs/<KEY>/sp-manifest.json` (ảnh chụp **CÂY NGUỒN**,
  không phải danh sách file mình đã lấy — ghi sai chỗ này thì lần sau không bao giờ lộ ra phần thiếu)
- `coverage`: `{sourceFiles, sourceBytes, localFiles, localBytes, at}`
- `deferred`: phần cố ý hoãn + lý do → kèm 1 dòng trong khối "Cần bạn" của board
