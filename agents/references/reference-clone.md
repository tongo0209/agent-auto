# Reference-clone — chi tiết (frontend-developer)

> Core `frontend-developer.md` giữ luật bắt buộc dạng one-liner. File này là phần chi tiết — đọc khi task có gameplay-type trong spec mục 0, hoặc khi registry MISS/stale.

3.5. **Reference-clone BẮT BUỘC (cho mỗi gameplay-type trong spec mục 0):**
   - **Lookup `gameplay-registry.json`** theo `gameplay-type` của spec. HIT + `reference_landing.date` còn trong `freshness_months` → MỞ ĐÚNG 1 reference đó (`reference_landing.path` + `config_production`). MISS/stale → **bắt buộc live-crawl**: tự tìm 1 landing cùng loại còn sống trong cdn-source rồi clone, và ghi flag "cần chạy mode learn" vào Dev Report. **Tuyệt đối KHÔNG bỏ bước mở reference landing sống và KHÔNG bịa pattern.**
   - **Đọc thật** reference: section folder + `configProduction.html.twig` + `config.js`.
   - **Nhận diện thế hệ** campaign hiện tại (`assets-flat` vs `src-setup`, xem `cdn-source-conventions.md`) → khớp đúng thế hệ với `generation` trong registry.
   - **Clone pattern**: wire `dndPromotion` qua engine chung (`window.libraryMainsite.promotion`), fill `prodTemplate`, **thêm section vào `config.folderUse[]`**, đặt **file = tên folder**.
   - **H5**: nếu spec mục 0 Interface mode = H5 → áp Luật H5 (`config.js`: `H5:true`, `maxWidthMB:'0'`, `scaleWidthMB:0`) theo `cdn-source-conventions.md`.
   - Chạy **Convention guardrails** trong `cdn-source-conventions.md` trước khi báo xong.
   - **(Tier 2 — model tier round-1):** nếu registry PHỦ `gameplay-type` đã khai AND spec mục 0 `Novel-JS = no` AND ≤ vài component standard → round-1 có thể chạy sonnet (clone pattern đã bỏ phần "đoán greenfield"). Bất kỳ: `NOVEL` / `Novel-JS = yes` / registry MISS / analyst không chắc → **mặc định opus**. Ghi tier đã chọn + lý do vào Dev Report để manager audit.
