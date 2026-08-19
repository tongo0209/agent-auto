# Mode `learn` — quy trình đầy đủ

> Core `SKILL.md` giữ tóm tắt + 2 ràng buộc không được bỏ. Đọc file này khi thực sự chạy mode `learn`.
> ⚠ Knowledge đã tách: base structure nay nằm ở `base/<NN>-<tên>.md` + mục lục `base-structure.md`, bài học nằm ở `entries/` + `INDEX.md`.

## Mode `learn` — học lại base structure

Base structure của user **sống** — đổi theo thời gian và theo dự án. Tài liệu `base-structure.md` (trong knowledge toàn cục) là ảnh chụp; mode này làm mới nó.

0. **Ranh giới:** mode này chỉ ghi vào `~/.claude/knowledge/code-developer/`. **CẤM sửa `~/VNG/agent-auto/rules/`** (R-CDN-*, R-POP-*, R-HO-*) — knowledge là ảnh chụp, rules là luật. Phát hiện code mới nhất làm khác luật → in khối cho user duyệt, không tự đổi:
   ```
   ## Đề xuất sửa luật (user duyệt)
   - R-CDN-<n>: luật nói <X>, code mới nhất làm <Y> — bằng chứng <file:line>. Đổi luật? (y/n)
   ```
1. **Repo nguồn**: mặc định `/Users/lap17727/VNG/git-vng/cdn-source` (user có thể đưa repo khác trong args). *(Sửa 19/8/2026: đường dẫn cũ `/Users/tongo/VNG/cdn-pen/cdn-source` không còn tồn tại trên máy này.)*
2. **Lọc đúng code của user** — đây là ràng buộc quan trọng nhất:
   ```bash
   git log --author="tont@vng.com.vn" --since="3 months ago" --name-only --pretty=format:
   ```
   Nhóm theo `products/<game>/<khu-vực>`, chọn 4–6 khu vực source nhiều thay đổi nhất + mới nhất (loại `dist/`, asset thuần, file build). Code của author khác KHÔNG dùng làm base — chỉ tham khảo khi base thiếu hẳn một pattern, và phải gắn nhãn `[THAM KHẢO NGOÀI]`.
   - **Ngoại lệ engine dùng chung:** khi quét gameplay engine cross-cutting (promotion/dndPromotion, vòng quay, mốc thưởng, đổi quà, điểm danh), **KHÔNG áp filter `--author` / `3 tháng`** — engine này nằm rải nhiều product/nhiều tác giả/cũ. Quét repo-wide để không drop.
   - **Refresh `gameplay-registry.json`:** sau khi học, cập nhật `reference_landing.path/commit/date` cho mỗi type (và thêm type mới nếu phát hiện). CHỈ cập nhật con trỏ reference + ngày; KHÔNG ghi đè phần `contract`/`visual_signature` curated.
   - **Re-learn trigger:** thêm "entry registry quá `freshness_months` (2 tháng) hoặc dev báo stale" vào điều kiện chạy lại learn.
3. **Phân tích song song**: giao mỗi khu vực cho một agent (Explore/general-purpose) trích xuất: cấu trúc thư mục, build pipeline, template, SCSS, JS pattern, shared modules, i18n/assets, thói quen đặc trưng.
4. **Tổng hợp** vào `~/.claude/knowledge/code-developer/base-structure.md` với nhãn:
   - `[STABLE]` — nhất quán giữa các project → agent PHẢI theo
   - `[VARIES]` — khác nhau theo project → theo project hiện tại
   - `[NEWEST]` — chỉ ở project mới nhất → hướng tiến hóa, ưu tiên khi tạo mới
   So với bản cũ: mục nào đổi → ghi chú `(đổi từ X → Y, <ngày>)`.
5. **Báo user**: tóm tắt diff so với lần học trước.

Khi nào nhắc user chạy `learn`: dev/checker báo trong report rằng code thực tế mới nhất mâu thuẫn base-structure.md, hoặc lần học gần nhất đã > 2 tháng, hoặc entry `gameplay-registry.json` quá `freshness_months` (2 tháng) hoặc dev báo stale.
