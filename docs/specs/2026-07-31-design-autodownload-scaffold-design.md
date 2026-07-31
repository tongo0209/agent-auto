# Design: Tự tải design + scaffold khung campaign (mở rộng /daily + code-developer)

**Ngày:** 2026-07-31 · **Trạng thái:** đã duyệt hướng (user), chờ implement
**Phạm vi sửa:** `~/.claude/skills/daily/SKILL.md` + `~/.claude/skills/code-developer/SKILL.md` (không đẻ skill mới)

## Vấn đề

Luồng hiện tại kẹt 2 chỗ tay giữa "design đã giao" và "bắt đầu code":

1. `/daily` dò được design đã giao qua SharePoint search, nhưng **MCP không tải được zip/psd**
   → thành việc tay "Cần bạn: tải zip + giải nén vào `tasks/<KEY>/design/`".
2. Khung source campaign trong cdn-source rất chuẩn hoá (mỗi campaign cùng bộ
   `assets/{main,frame1,libraryMainsite-t-popup}` + webpack/config/package.json) nhưng
   **user vẫn clone khung bằng tay** từ campaign trước (ví dụ thật: `2026-rung-ky-bi`
   clone từ khung như `2026-giai-ma-mat-thu`).

Mục tiêu: design giao xong → máy tự tải về + tự dựng khung + code luôn khung UI với
placeholder → user chỉ còn việc cắt hình từ PSD thả vào.

## Quyết định đã chốt với user (2026-07-31)

| Câu hỏi | Chốt |
| --- | --- |
| Cách tải design | **Cả hai, có fallback**: browser tự động trước → dò `~/Downloads` sau |
| Nguồn khung scaffold | **CHỈ clone campaign gần nhất cùng game** (user duyệt nguồn trong bảng kế hoạch). Tool scaffoldPSD có được phát hiện khi khảo sát nhưng **user quyết định 2026-07-31: KHÔNG đụng scaffold cắt ảnh từ PSD** — chỉ tải về + xử lý file trong zip để dựng UI |
| Điểm dừng pipeline | **Scaffold + code luôn khung UI** bằng ảnh preview, placeholder đúng kích thước |
| Vị trí tính năng | **/daily tải design · code-developer scaffold+code** — không skill mới |
| Chống duplicate | **State là cache, đĩa là sự thật** — có marker + kiểm đĩa mới skip |

## Phần A — /daily tự tải design (mở rộng Bước 2 + mode `prep`)

Trigger: giữ nguyên — SharePoint search thấy design ĐÃ GIAO (tên file + `lastModifiedDateTime` ≥ mốc Design).

### Nấc 1 — browser tự động

- Điều kiện: phiên có toolset điều khiển browser **đã login SharePoint**. Ưu tiên
  **Claude in Chrome** (browser mặc định của user — cùng cơ chế bug-fixer-lite ghi sheet);
  browserpilot chỉ khi profile persistent đã login.
- Thao tác: mở `webUrl` file → bấm Download → poll `~/Downloads` chờ file xuất hiện
  (khớp tên + mtime mới; `.crdownload`/`.part` = đang tải, chờ tiếp; timeout 90s).
- Fail bất kỳ bước nào → rơi xuống nấc 2. **KHÔNG retry vòng, KHÔNG chặn pipeline**
  (học bài `list_connected_browsers` của bug-fixer-lite: budget gọi cứng, hết là thôi).

### Nấc 2 — dò `~/Downloads`

- Quét file khớp **tên file đã thấy qua SharePoint search** (ưu tiên khớp chính xác,
  fallback fuzzy tên event bỏ dấu) có mtime ≤ 7 ngày → nhặt luôn, không hỏi.
- Không thấy → dòng "Cần bạn" như cũ nhưng đổi hướng dẫn: *"tải xong cứ để nguyên trong
  Downloads — lần /daily kế tiếp tôi tự nhặt"* (user hết việc giải nén/move).

### Sau khi có file (chung 2 nấc)

1. Move vào `designs/<KEY>/_raw/` (kho design tập trung `AGENT_AUTO/designs/` — quyết định user 2026-07-31) → giải nén (`unzip -O UTF-8` — tên file có dấu;
   zip lồng zip → giải tiếp đúng 1 cấp).
2. Phân loại: ảnh preview (jpg/png/webp) đưa lên `designs/<KEY>/`; PSD/AI giữ `_raw/` + liệt kê
   tên vào brief (user biết có gì chờ cắt).
3. Verify thật mới claim: đếm file, ghi brief + board — "đã tải & giải nén: N ảnh preview, K PSD".
4. `phase → ready` CHỈ khi có ảnh thật trong `designs/<KEY>/` (luật "phase tiến khi có bằng chứng" giữ nguyên).

### An toàn

- Browser chỉ thao tác Download (read-only với SharePoint).
- Không xoá gì trong `~/Downloads` ngoài move đúng file đã nhận diện.
- `designs/<KEY>/` đã có nội dung → merge, không ghi đè file trùng tên cũ hơn.

## Phần A+ — Idempotent (chống chạy lại duplicate)

Ghi vào `state.issues[KEY].design`:

```json
"design": {
  "downloadedAt": "2026-07-31T09:15:00+07:00",
  "sourceFile": "CFL_Rừng Thu Kỳ Bí.zip",
  "sourceModified": "2026-07-27T10:22:00Z",
  "files": { "previews": 12, "psd": 3 },
  "manifest": { "<tên file>": { "modified": "...", "sha": "..." } }
}
```

`manifest` (bổ sung 2026-07-31) chỉ dùng khi nguồn là **folder nhiều file rời**: lần sau
CHỈ tải file có modified mới hơn entry / chưa có entry — không tải lại cả folder. Nguồn
**zip** = 1 khối → bản mới tải nguyên zip (1 file), selective nằm ở khâu SO CŨ↔MỚI sau
giải nén.

Luật skip đầu Bước 2 (check rẻ trước):

1. `design.downloadedAt` có **VÀ** `designs/<KEY>/` còn file thật → BỎ QUA toàn bộ
   khâu tải (không mở browser, không quét Downloads); board ghi 1 dòng "design đã có local".
2. State có nhưng folder rỗng/mất (đĩa thắng state) → tải lại.
3. **Design có bản mới** (cùng link — SharePoint đè file, so được vì search chạy mỗi lần):
   `lastModifiedDateTime` > `sourceModified` đã lưu → tải lại vào `designs/<KEY>/_raw/v2/`
   (v3, v4…) rồi **SO BẢN CŨ ↔ MỚI** (bổ sung 2026-07-31): so từng file theo TÊN + hash
   bytes (`shasum`) + kích thước ảnh (`sips`) → phân loại ĐỔI / MỚI / XOÁ / giữ nguyên;
   backup bản đang dùng vào `_raw/prev-<ngày>/` → promote v2 lên `designs/<KEY>/` (kho
   luôn là bản mới nhất, bản cũ không mất); bảng diff ghi brief + board + ⚠️ ĐẦU báo cáo.
   Task đã coding → đề xuất `/code-developer compare` (ảnh ĐỔI) hoặc `code`/`fix` (chỉ
   thêm ảnh MỚI) trong kế hoạch; xử lý xong cập nhật `sourceModified` để thôi cảnh báo.

## Phần B — Scaffold khung + code khung UI

### B0. Ghi chú khảo sát: tool scaffoldPSD (NGOÀI SCOPE — quyết định user 2026-07-31)

Khi khảo sát có phát hiện `cdn-source/products/tontagent/scaffoldPSD/` (@tont/extract-psd)
— tool cắt ảnh theo layer PSD + sinh trọn khung campaign (campaign thật `2026-giai-ma-mat-thu`
từng dựng bằng nó). **User quyết định KHÔNG đưa vào luồng này**: không đụng scaffold/cắt ảnh
từ PSD — chỉ cần tải design về, xử lý file bên trong (ảnh preview) để dựng giao diện.
Ghi lại đây làm tư liệu, không phải việc.

### B1. /daily chọn nguồn + điều phối (Bước 3 + 4)

- Điều kiện áp dụng: task dựng MỚI (chưa có folder trong cdn-source — `state.paths` chưa có
  entry cdn-source) và design đã có local.
- **Suy `<game>` theo thứ tự bằng chứng** (bổ sung 2026-07-31 — tag ticket không đáng tin:
  GW-660 tag `[CFM]` nhưng folder thật `products/cfl/`): (1) token game trong tên folder cha
  gt-promotion đã neo nexusId (`A49-CFL` → `cfl`) khớp `ls products/`; (2) tag summary
  lowercase khớp đúng 1 folder; (3) `paths` ticket cùng tag trong state; (4) không chắc →
  vẫn đề xuất + đánh dấu "❓ game đoán" trong bảng duyệt cho user sửa. Đích =
  `products/<game>/<landing|mainsite>/<slug>` hiển thị ĐẦY ĐỦ trong bảng duyệt. LUẬT CỨNG:
  folder game phải TỒN TẠI sẵn — không bao giờ tự tạo game mới (code-developer có guard
  tương ứng: folder cha đích không tồn tại → DỪNG scaffold, không mkdir).
- Chọn **campaign nguồn** = folder commit gần nhất cùng game:
  `git log -1 --format=%ct -- <folder>` từng folder `products/<game>/landing/`, lấy max.
- Đề xuất **slug đích**: `<năm>-<tên-event-bỏ-dấu>` (ví dụ `2026-rung-thu-ky-bi`) — slug
  thật hay lệch tên ticket nên user đổi được.
- Trình trong **bảng duyệt kế hoạch sẵn có** (cột mới "Khung nguồn": `clone <campaign
  nguồn>` kèm slug đích) — KHÔNG thêm cổng hỏi. User đổi nguồn/slug ngay trong lượt duyệt.
- Sau duyệt: gọi `/code-developer full` với args thêm dòng:
  `Scaffold: clone · nguồn <abs path campaign nguồn> · đích <abs path đích>`.
- Ghi `state.issues[KEY].paths` += entry cdn-source mới + `pathsConfirmed: true` sau khi
  scaffold xong (folder là bằng chứng).

### B2. code-developer thực thi (mode `full`, opt-in khi args có dòng `Scaffold:`)

Bước cơ học manager tự làm TRƯỚC analyst (không subagent).
**Idempotent:** folder đích đã tồn tại → SKIP scaffold (ghi 1 dòng), đi thẳng pipeline.

**Clone khung từ campaign gần nhất:**

1. Clone: `rsync -a` nguồn → đích, **exclude** `node_modules/ dist/ .claude/ .vscode/
   .browserpilot/ report.md html-validation-report.txt .image-optimize-cache.json
   .DS_Store meta.json` (giữ `package-lock.json` — deps y hệt nguồn, `npm ci` nhanh).
2. Đổi slug: grep chuỗi slug cũ trong `config.js`, `package.json`, `index.html`,
   `assets/**/*.twig` → thay slug mới. Verify: grep slug cũ = 0 kết quả trong file text.
3. `npm install` (cần cho build verify các vòng sau).
4. **GIỮ ảnh campaign nguồn làm placeholder** — build sống ngay từ phút đầu; markup/scss
   nguồn giữ nguyên làm nền cho dev sửa theo spec.

Sau đó pipeline `full` chạy như thiết kế sẵn (analyst → dev → checker ≤2 vòng), thêm 3 luật:

- **CONVENTION CDN-SOURCE LÀ LUẬT** (yêu cầu user 2026-07-31 — mục đích là maintain về
  sau): giữ nguyên cấu trúc khung clone (mỗi section = `assets/<section>/` đủ bộ
  `.html.twig/.js/.scss/.sprite.scss/images//scss/`; section mới theo pattern `frameN` +
  khai `folderUse` trong `config.js`; component chung qua `libraryMainsite-*`; token chung
  trong `assets/main/`). CẤM đổi layout folder / sửa webpack ngoài chỗ khai slug / thêm
  framework-dependency. Cách viết khớp campaign nguồn + knowledge `base/` của
  code-developer. Vì dev/checker không đọc SKILL.md → manager PHẢI chép luật này + path
  campaign nguồn vào prompt giao việc.
- **Dev vòng 1**: ảnh spec cần mà chưa có thật → tạo placeholder ĐÚNG KÍCH THƯỚC theo spec
  (PNG 1 màu, tên file theo design, đúng `assets/<section>/images/`); cuối vòng xoá ảnh
  nguồn không còn được reference.
- **Bàn giao**: board liệt kê **toàn bộ ảnh placeholder chờ user cắt** (tên file + kích
  thước + vị trí). Tổng kết ghi rõ "⚠ N ảnh chờ xử lý tay".

### B3. Điểm dừng & vòng sau

- Kết thúc lượt: phase giữ `coding`; board "Cần bạn: xử lý N ảnh theo danh sách, thả vào
  `assets/*/images/`". KHÔNG claim xong UI.
- User thả hình thật xong → lần `/daily` sau phát hiện images đổi (mtime/git status)
  → đề xuất `/code-developer fix` khớp asset thật (đường ray có sẵn).

## Ranh giới an toàn (giữ nguyên luật hệ thống)

- KHÔNG commit/push — scaffold chỉ tạo file local, user review diff tự đẩy.
- KHÔNG ghi gì lên Jira/SharePoint (browser chỉ Download).
- Không clone đè folder tồn tại; không xoá bản design cũ khi có v2.
- Cổng hỏi giữ nguyên: mọi lựa chọn (nguồn khung, slug) đi qua lượt duyệt kế hoạch duy nhất.

## Ngoài phạm vi (YAGNI)

- KHÔNG cắt hình từ PSD, KHÔNG đụng tool scaffoldPSD (quyết định user 2026-07-31) — toàn bộ
  ảnh thật là việc tay của user (cần mắt design).
- KHÔNG scaffold cho task sửa UI có sẵn (`fix`/`code`) — chỉ dựng mới.
- KHÔNG đụng gt-promotion-template trong lượt scaffold (deliver là phase sau, luồng sẵn có).
- KHÔNG làm template chuẩn riêng — nguồn luôn là campaign thật gần nhất.

## Test/verify khi implement

- Sửa SKILL.md xong: đọc lại toàn văn 2 skill kiểm mâu thuẫn (đặc biệt: số cổng hỏi,
  luật phase, mode `prep`).
- Dry-run kịch bản GW-660 (đã có folder → phải SKIP clone) + kịch bản giả lập task mới
  (chọn nguồn, slug, bảng duyệt).
- Khâu browser-download chưa verify được máy thật cho tới lần chạy /daily kế → ghi chú
  "chưa verify" trong tổng kết implement, nghiệm thu ở lần chạy thật đầu tiên (như
  bug-fixer-lite từng làm với đường ghi Chrome).
