# Design Auto-download + Scaffold — Implementation Plan

> ⚠ **Revision 2026-07-31 (sau khi implement):** user quyết định BỎ đường scaffoldPSD/cắt ảnh
> từ PSD — mọi chỗ trong plan này nhắc `psd`/`fallback-clone`/doctor đã lỗi thời; bản chốt chỉ
> còn `Scaffold: clone · nguồn <abs> · đích <abs>`. Xem spec (đã cập nhật) làm chuẩn.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa 2 skill (`daily`, `code-developer`) để: design giao xong → tự tải về máy (2 nấc, idempotent) → scaffold khung campaign (scaffoldPSD ưu tiên / clone fallback) → code khung UI → user chỉ còn xử lý ảnh tay.

**Architecture:** Chỉ sửa prose 2 file SKILL.md — `/daily` lo tải design + chọn nguồn khung + điều phối; `code-developer` nhận dòng args `Scaffold:` opt-in trong mode `full` và thực thi cơ học trước analyst. Không code mới, không skill mới.

**Tech Stack:** Markdown skill files. Spec gốc: `/Users/lap17727/VNG/agent-auto/docs/specs/2026-07-31-design-autodownload-scaffold-design.md`.

## Global Constraints

- KHÔNG git commit/push (2 file ngoài repo; luật global: không tự commit).
- Giữ nguyên số cổng hỏi của /daily (2: duyệt kế hoạch + first-run JQL) — mọi lựa chọn mới đi qua lượt duyệt sẵn có.
- Giữ luật phase: chỉ TIẾN khi có bằng chứng thật; `ready` CHỈ khi ảnh thật trong `design/`.
- Văn phong skill: tiếng Việt, imperative, nén — khớp giọng file hiện có.
- Verify không chạy được máy thật (browser download) → ghi rõ "chưa verify" trong tổng kết.

---

### Task 1: daily SKILL.md — Bước 2: tải design tự động + idempotent

**Files:**
- Modify: `/Users/lap17727/.claude/skills/daily/SKILL.md:100-107` (bullet "Dò design qua SharePoint")

**Interfaces:**
- Produces: schema `state.issues[KEY].design = {downloadedAt, sourceFile, sourceModified, files:{previews,psd}}` (Task 2 và Task 4 tham chiếu); quy ước folder `tasks/<KEY>/design/_raw/`.

- [ ] **Step 1: Edit — thay đoạn cuối bullet SharePoint + chèn block tải tự động**

old_string (nguyên văn trong file):

```
  `sharepoint_folder_search` KHÔNG thấy folder chưa từng mở — miss thì ghi link gốc +
  📎 "mở tay 1 lần (mở xong search sẽ index)". Zip/psd không tải được qua MCP → user tải tay
  vào `tasks/<KEY>/design/`; ảnh rời tải được thì lưu luôn.
```

new_string:

```
  `sharepoint_folder_search` KHÔNG thấy folder chưa từng mở — miss thì ghi link gốc +
  📎 "mở tay 1 lần (mở xong search sẽ index)". Ảnh rời MCP tải được → lưu thẳng
  `tasks/<KEY>/design/`. Zip/psd MCP KHÔNG tải được → chạy TẢI TỰ ĐỘNG 2 nấc (dưới).
- **TẢI DESIGN TỰ ĐỘNG (zip/psd — idempotent, state là cache, đĩa là sự thật):**
  - **Chốt skip TRƯỚC:** `state.issues[KEY].design.downloadedAt` có VÀ `tasks/<KEY>/design/`
    còn file thật → BỎ QUA tải (không mở browser, không quét Downloads), board 1 dòng
    "design đã có local". State có mà folder rỗng/mất → tải lại. `lastModifiedDateTime`
    mới > `design.sourceModified` đã lưu → designer up BẢN MỚI: tải lại vào `design/_raw/v2/`,
    ⚠️ "design đổi bản sau khi đã tải" ĐẦU báo cáo, KHÔNG tự xoá bản cũ.
  - **Nấc 1 — browser đã login:** ưu tiên Claude in Chrome (browser mặc định của user — cùng
    cơ chế bug-fixer-lite ghi sheet); browserpilot chỉ khi profile đã login SharePoint.
    Mở `webUrl` → bấm Download → poll `~/Downloads` (khớp tên file + mtime mới;
    `.crdownload`/`.part` = đang tải, chờ tiếp; timeout 90s). Fail bất kỳ bước → nấc 2,
    KHÔNG retry vòng, KHÔNG chặn pipeline. Browser CHỈ thao tác Download (read-only).
  - **Nấc 2 — dò `~/Downloads`:** tìm file khớp tên đã thấy qua SharePoint search (khớp
    chính xác trước, fuzzy tên event bỏ dấu sau) mtime ≤7 ngày → nhặt luôn, không hỏi.
    Không thấy → "Cần bạn: tải tay — tải xong CỨ ĐỂ TRONG Downloads, lần /daily kế tôi
    tự nhặt" (user khỏi giải nén/move).
  - **Có file (chung 2 nấc):** move vào `tasks/<KEY>/design/_raw/` → giải nén
    (`unzip -O UTF-8` — tên file có dấu; zip lồng zip → giải thêm đúng 1 cấp) → ảnh preview
    (jpg/png/webp) đưa lên `design/` (trùng tên → giữ bản mới hơn), PSD/AI giữ `_raw/` +
    liệt kê tên vào brief → VERIFY đếm file thật rồi mới ghi brief + board ("đã tải & giải
    nén: N ảnh preview, K PSD") → ghi `state.issues[KEY].design =
    {downloadedAt, sourceFile, sourceModified, files:{previews,psd}}`. KHÔNG xoá gì khác
    trong `~/Downloads`.
  - `phase → ready` CHỈ khi có ảnh thật trong `design/` (mới "thấy trên SharePoint" chưa đủ).
```

- [ ] **Step 2: Verify** — `grep -c "TẢI DESIGN TỰ ĐỘNG" ~/.claude/skills/daily/SKILL.md` → `1`; grep "user tải tay" chỉ còn ở ngữ cảnh mới (nấc 2).

### Task 2: daily SKILL.md — Bước 3/4/6: chọn khung nguồn + điều phối scaffold + state schema

**Files:**
- Modify: `/Users/lap17727/.claude/skills/daily/SKILL.md:151-159` (Bước 3), `:163-174` (Bước 4), `:199-201` (Bước 6.1)

**Interfaces:**
- Consumes: `state.design` (Task 1).
- Produces: dòng args `Scaffold: <psd|clone> · nguồn <abs> · đích <abs> [· fallback-clone <abs>]` — Task 3 (code-developer) parse đúng format này.

- [ ] **Step 1: Edit Bước 3** — sau đoạn "Đường ray theo bảng routing global: …; mơ hồ → cần-user-quyết." chèn:

```
**Task dựng MỚI (chưa có entry cdn-source trong `paths`) + design đã local → thêm cột
`Khung nguồn` vào bảng duyệt:**
- `design/_raw/` có PSD **và** scaffoldPSD doctor pass → `PSD → scaffoldPSD`; ngược lại →
  `clone <campaign gần nhất cùng game>` (folder `products/<game>/landing/*` có commit mới
  nhất: `git log -1 --format=%ct -- <folder>`, lấy max).
- Kèm **slug đích** đề xuất `<năm>-<tên-event-bỏ-dấu>` — slug thật hay LỆCH tên ticket,
  user đổi ngay trong lượt duyệt (KHÔNG thêm cổng hỏi).
- scaffoldPSD = `<repos.cdn-source>/products/tontagent/scaffoldPSD` — tool cắt ảnh theo
  layer PSD + sinh trọn khung campaign; doctor: `node bin/launcher.js doctor`
  (tool chưa build → coi như fail → đường clone).
```

- [ ] **Step 2: Edit Bước 4** — sau bullet "Gọi `/code-developer <mode>` qua tool Skill…" chèn:

```
- **Task có `Khung nguồn` đã duyệt:** args code-developer full thêm dòng
  `Scaffold: <psd|clone> · nguồn <abs path> · đích <repos.cdn-source>/products/<game>/landing/<slug>`
  (đường psd → kèm `· fallback-clone <abs path campaign nguồn>`). Scaffold xong (folder đích
  tồn tại) → ghi `state.issues[KEY].paths` += entry cdn-source + `pathsConfirmed: true`;
  board chép danh sách "ảnh chờ user xử lý tay" từ report code-developer. Phase giữ `coding`;
  user thả ảnh thật vào `assets/*/images/` xong → lần /daily sau thấy images đổi
  (git status/mtime) → đề xuất `/code-developer fix` khớp asset thật.
```

- [ ] **Step 3: Edit Bước 6.1** — old: `per key {lastSeenUpdated, status, phase, milestones, lastAction, note}` → new: `per key {lastSeenUpdated, status, phase, milestones, lastAction, note, design?, paths?}` (design = marker tải; paths = từ Bước 2b/scaffold).

- [ ] **Step 4: Verify** — grep "Khung nguồn" → 2 chỗ (Bước 3 + 4); grep "fallback-clone" → 1.

### Task 3: code-developer SKILL.md — section Scaffold khung (mode full, opt-in)

**Files:**
- Modify: `/Users/lap17727/.claude/skills/code-developer/SKILL.md` — chèn section mới NGAY SAU khối chú thích của bảng "## Các mode" (sau dòng `** Quy tắc mode compare…`, trước `## Chọn model theo độ khó`).

**Interfaces:**
- Consumes: dòng args `Scaffold: <psd|clone> · nguồn <abs> · đích <abs> [· fallback-clone <abs>]` (Task 2).

- [ ] **Step 1: Edit — chèn section**

```
## Scaffold khung campaign (mode `full` — CHỈ khi args có dòng `Scaffold:`)

Args: `Scaffold: <psd|clone> · nguồn <abs path> · đích <abs path> [· fallback-clone <abs path>]`.
Manager tự làm (cơ học, 0 subagent), chạy TRƯỚC Bước 0.5. Không có dòng `Scaffold:` → bỏ qua.

**Idempotent:** folder đích ĐÃ TỒN TẠI → SKIP scaffold (báo 1 dòng), đi thẳng pipeline.

**Đường `psd` (nguồn = folder tool scaffoldPSD):**
1. `node bin/launcher.js doctor` fail → thử `npm install && npm run build` đúng 1 lần; vẫn
   fail → chuyển đường `clone` với `fallback-clone` (không có fallback-clone → bỏ scaffold,
   báo 1 dòng, pipeline chạy tiếp KHÔNG khung).
2. Copy PSD (PC + MB nếu có twin) từ `tasks/<KEY>/design/_raw/` → `scaffold/<slug>/input/`;
   fonts trong design zip → `scaffold/<slug>/fonts/`.
3. `npm run scaffold <slug>` → kiểm `output/` đủ `package.json` + `assets/`.
4. Move `output/*` → folder đích + `npm install` tại đích.
5. Đọc `report.md` + `meta.json.warnings` của output → ghi danh sách layer skip/collide
   vào state.md + Tổng kết (= danh sách "ảnh user xử lý tay").
6. Fail giữa chừng → dọn `scaffold/<slug>/` rồi xử như bước 1 (không để nửa vời).

**Đường `clone` (nguồn = campaign gần nhất cùng game):**
1. `rsync -a` nguồn → đích, exclude: `node_modules/ dist/ .claude/ .vscode/ report.md
   html-validation-report.txt .image-optimize-cache.json .DS_Store meta.json`.
2. Đổi slug cũ → mới trong `config.js`, `package.json`, `index.html`, `assets/**/*.twig`.
   Verify: grep slug cũ trong file text = 0 kết quả.
3. `npm install` tại đích. GIỮ ảnh campaign nguồn làm placeholder — build sống ngay.

**2 luật cho pipeline sau scaffold:**
- Dev vòng 1 (chỉ đường `clone`): ảnh spec cần mà chưa có thật → tạo placeholder PNG 1 màu
  ĐÚNG KÍCH THƯỚC theo spec (tên theo design); cuối vòng xoá ảnh nguồn không còn reference.
- Tổng kết + state.md liệt kê **ảnh chờ user xử lý tay** (psd: layer skip/collide theo
  report.md; clone: toàn bộ placeholder — tên + kích thước + vị trí). CẤM claim "xong UI"
  khi còn placeholder.

An toàn: KHÔNG commit/push; KHÔNG clone đè folder tồn tại; chỉ ghi trong repo local.
```

- [ ] **Step 2: Verify** — grep "Scaffold khung campaign" → 1; section nằm trước "## Chọn model theo độ khó".

### Task 4: Verify chéo + dry-run + cập nhật README agent-auto

**Files:**
- Read: cả 2 SKILL.md toàn văn sau sửa
- Modify: `/Users/lap17727/VNG/agent-auto/README.md` (1-2 dòng mô tả tính năng mới trong bảng cấu trúc / Ranh giới)

- [ ] **Step 1: Đọc lại 2 skill kiểm mâu thuẫn**: (a) /daily vẫn đúng 2 cổng hỏi; (b) luật phase không bị mâu thuẫn (ready = ảnh local); (c) format dòng `Scaffold:` khớp y hệt 2 phía; (d) mode `prep` hưởng luôn khâu tải (Bước 2 nằm trong prep).
- [ ] **Step 2: Dry-run giấy 2 kịch bản**: GW-660 (folder `2026-rung-ky-bi` ĐÃ tồn tại → bảng duyệt không đề xuất scaffold vì `paths` đã có entry cdn-source; nếu vẫn gọi → code-developer SKIP idempotent). Task mới giả định GW-654 (chưa folder, design chưa local → CHƯA đề xuất scaffold — đúng điều kiện "design đã local").
- [ ] **Step 3: README agent-auto** — thêm vào mục "Dùng hàng ngày" 1 dòng: design đã giao → /daily tự tải (browser/Downloads) + scaffold khung qua code-developer; tham chiếu spec.
- [ ] **Step 4: Tổng kết trung thực** — liệt kê phần CHƯA verify được (browser download thật, scaffoldPSD chưa build trên máy) + cách nghiệm thu lần /daily kế.
