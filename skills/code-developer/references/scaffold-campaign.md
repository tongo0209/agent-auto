# Scaffold khung campaign (mode `full` — CHỈ khi args có dòng `Scaffold:`)

> Tách từ SKILL.md 2026-08-06. Manager đọc file này khi args có dòng `Scaffold:`.

Args: `Scaffold: clone · nguồn <abs path campaign nguồn> · đích <abs path>` (+ đuôi
`· scaffold-only` khi design chưa về).
Manager tự làm (cơ học, 0 subagent), chạy TRƯỚC Bước 0.5. Không có dòng `Scaffold:` → bỏ qua.

**Đuôi `· scaffold-only`:** làm đúng mục "Clone khung" 1→3 dưới + verify build
(`npm run build-dev` compile được) rồi **DỪNG CẢ LƯỢT** — không analyst/dev/checker, bỏ qua
"3 luật cho pipeline sau scaffold" (chưa có pipeline). Báo lại: path đích · name giữ/đổi ·
build pass/fail. Ảnh campaign nguồn giữ nguyên làm placeholder chờ design về.
KHÔNG đụng tool scaffoldPSD/cắt ảnh từ PSD (quyết định user 2026-07-31) — ảnh thật user tự cắt.

**Idempotent:** folder đích ĐÃ TỒN TẠI → SKIP scaffold (báo 1 dòng), đi thẳng pipeline.
**Guard đích:** folder CHA của đích (`products/<game>/landing/` hoặc `mainsite/`) phải TỒN
TẠI sẵn — không có nghĩa là game resolve sai → DỪNG scaffold, báo 1 dòng kèm path đã kiểm,
pipeline chạy tiếp KHÔNG khung. TUYỆT ĐỐI không `mkdir` folder game mới.

**Clone khung (nguồn = campaign gần nhất cùng game):**
1. `rsync -a` nguồn → đích (rsync tự tạo folder campaign — chỉ folder campaign, xem Guard),
   exclude: `node_modules/ dist/ .claude/ .vscode/ .browserpilot/ report.md
   html-validation-report.txt .image-optimize-cache.json .DS_Store meta.json`
   (GIỮ `package-lock.json` — deps y hệt nguồn, `npm ci` nhanh và tái lập được).
2. Đổi slug: **"slug cũ" = giá trị `name` THẬT trong `config.js` nguồn** (đọc ra, đừng đoán
   từ tên folder — verify 31/7: folder `2026-chengdu-tournament` nhưng `name: "gnoth"`).
   Name dạng campaign-specific (`cfl-rung-ky-bi`) → thay bằng slug mới trong `config.js`,
   `package.json`, `index.html`, `assets/**/*.twig`; verify grep slug cũ = 0 kết quả.
   Name dạng GAME-CHUNG (`gnoth` — không chứa token campaign) → GIỮ NGUYÊN (convention của
   game đó, đổi là lệch output bundle), chỉ ghi 1 dòng board "giữ name game-chung <name>".
   **LUÔN — kể cả nhánh giữ name game-chung:** đổi ĐƯỜNG DẪN campaign nguồn
   (`products/<game>/landing/<folder-nguồn>`) → path đích trong `index.html` +
   `assets/**/*.twig` (URL CDN trỏ `dist/` — verify 31/7: chengdu còn 3 URL trong
   index.html + 1 trong configProduction.html.twig); verify grep `<folder-nguồn>` = 0.
   `package-lock.json` giữ name cũ KHÔNG sao (`npm ci` vẫn pass — verify 31/7), đừng sửa lock tay.
3. `npm install` tại đích. GIỮ ảnh campaign nguồn làm placeholder — build sống ngay
   (verify 31/7: clone chengdu → đổi slug → `npm ci` 3s → `build-dev` compile 651ms, dist/
   ra bundle tên mới).

**3 luật cho pipeline sau scaffold** (dev/checker KHÔNG đọc file này — manager PHẢI chép
luật 1 + đường dẫn campaign nguồn vào prompt giao việc, dạng: `Khung scaffold từ <abs path
nguồn> — convention cdn-source là luật: giữ cấu trúc assets/<section>/, section mới theo
pattern frameN + folderUse, component chung qua libraryMainsite-*, cấm đổi webpack/thêm
dependency; campaign nguồn là reference sống, đọc pattern trước khi viết`):
- **CONVENTION CDN-SOURCE LÀ LUẬT** (lý do tồn tại của việc clone — maintain về sau): giữ
  NGUYÊN cấu trúc khung đã clone — mỗi section = 1 folder `assets/<section>/` đủ bộ
  `<section>.html.twig + .js + .scss + .sprite.scss + images/ + scss/`; section mới đặt
  theo pattern sẵn (`frame2`, `frame3`… + khai vào `folderUse` của `config.js`); component
  dùng chung đi qua `libraryMainsite-*`; token/biến chung trong `assets/main/`. CẤM đổi
  layout folder, CẤM sửa webpack config ngoài chỗ khai slug/section, CẤM thêm
  framework/dependency mới. Cách viết trong file mới phải KHỚP campaign nguồn + knowledge
  `base/` (`base-structure.md`) — campaign nguồn chính là reference sống, dev đọc pattern
  từ đó trước khi viết; điểm nào lạ so với base → đánh dấu ⚠ như luật knowledge sẵn có.
- Dev vòng 1: ảnh spec cần mà chưa có thật → tạo placeholder PNG 1 màu ĐÚNG KÍCH THƯỚC
  theo spec (tên theo design, đặt đúng `assets/<section>/images/`); cuối vòng xoá ảnh nguồn
  không còn reference.
- Tổng kết + state.md liệt kê **toàn bộ ảnh placeholder chờ user cắt** (tên + kích thước +
  vị trí). CẤM claim "xong UI" khi còn placeholder.

An toàn: KHÔNG commit/push; KHÔNG clone đè folder tồn tại; chỉ ghi trong repo local.
