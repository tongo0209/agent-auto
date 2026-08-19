# Chuẩn code cdn-source cho toàn bộ bộ skill — thiết kế

**Ngày:** 19/8/2026 · **Trạng thái:** đã thực thi trong cùng ngày

## Vấn đề

`/code-developer` (và các skill dùng chung team agent) sinh code không nhất quán với chuẩn `cdn-source`:
có lúc bê pattern thế hệ cũ (`src-setup`, `dndPromotion`) vào campaign thế hệ mới, có lúc tự dựng markup
popup thay vì dùng thư viện popup đã có. Hệ quả: hiệu năng và cơ chế scale sai, code mỗi campaign một kiểu,
khó bảo trì.

**Nguyên nhân gốc:** nguồn duy nhất mô tả chuẩn là `~/.claude/knowledge/code-developer/` — đó là **ảnh chụp
code hiện có**, không phải luật. Ảnh chụp chứa cả campaign làm ẩu, nên agent chọn nhầm vẫn thấy "đúng
knowledge". `SKILL.md` của code-developer chỉ trỏ `rules/code-style.md`; không nhắc popup, không nhắc thế hệ
code, không nhắc `/check-promotion`.

## Quyết định (user chốt 19/8/2026)

| # | Quyết định | Phương án bị loại |
|---|---|---|
| 1 | **Luật cứng có mã** trong `agent-auto/rules/`; mode `learn` chỉ được ĐỀ XUẤT, không ghi đè | Golden project cố định · Giữ cơ chế tự học |
| 2 | Thực thi bằng **brief + knowledge**, KHÔNG viết script guard mới | Cổng máy chấm (`cdn-guard.mjs`) — user không muốn thêm script |
| 3 | **3 file luật** tách theo chủ đề, knowledge cũ hạ cấp thành chi tiết/ví dụ | 1 file gộp · đặt luật trong `cdn-source` |
| 4 | `R-CS-1` **nới** từ zero-comment → comment 1 dòng, đúng **3 loại** | Giữ zero comment · thêm loại "mốc section" · thêm tóm tắt đầu hàm |
| 5 | Popup: dựng trong `cdn-source` bằng `libraryMainsite-t-popup`, **ghép hook `pm__`** khi bàn giao | Hai luồng tách biệt · dựng từ `ai-template-kit` trước |
| 6 | `/check-promotion` thành **cổng bắt buộc tự động** cuối luồng code promotion | Chỉ nhắc · giữ opt-in |
| 7 | Commit: repo git VNG theo skill `/commit` (Conventional), repo nội bộ giữ `[leaf-folder]` | Một format khắp nơi · sửa skill commit theo `[leaf-folder]` |

## Kiến trúc

```
agent-auto/rules/                    ← LUẬT (thắng mọi nguồn khác)
├── cdn-source-standard.md   R-CDN-1..14   thế hệ code, config.js, px/mixin, engine gameplay, build
├── popup-library.md         R-POP-1..9    2 hệ popup, extends base.html.twig, cổng check-promotion
├── html-handoff.md          R-HO-1..11    HTML rời cdn-source: CDN tuyệt đối, MODULE_CONTENT, 2 thư mục
├── code-style.md            R-CS-1..7     (R-CS-1 sửa) + mục Commit 2 hệ
└── pm-contract.md, repo-*.md            (đã có)

~/.claude/knowledge/code-developer/   ← ẢNH CHỤP: chi tiết, ví dụ, bằng chứng. Mâu thuẫn → rules thắng.
```

**Đường truyền luật:** rules → `CLAUDE.md` (bảng routing) → SKILL.md từng skill → brief subagent.
Không copy nội dung luật vào brief; chỉ trỏ đường dẫn đầy đủ.

## Nội dung luật (tóm tắt)

- **R-CDN-1** chốt thế hệ trước khi viết: `assets/index.html.twig` + `folderUse[]` = assets-flat (189 campaign);
  `src/setup/js/_promotion.js` = legacy (121 thư mục `src/setup/`). Cấm trộn.
- **R-CDN-2** dựng mới chỉ clone assets-flat. **R-CDN-4/5** px tuyệt đối + cấm `@media` tay.
  **R-CDN-8** không tự viết engine gameplay. **R-CDN-14** thấy repo lệch chuẩn thì báo, không nhân bản.
- **R-POP-1..3** grep module có sẵn trước, popup mới phải `{% extends '../base.html.twig' %}`, giữ bộ class
  `MS__popup`/`MS__opacity`/`MJ__close-popup`. **R-POP-7** cổng `/check-promotion` trước khi báo xong.
- **R-HO-1..3** HTML bàn giao lấy từ `dist/`, URL CDN tuyệt đối, giữ `<% MODULE_CONTENT %>` (chỉ bản
  `Promotion/`) và khung `#MS__wrapper`/`MS__layer-loading`/`layer-rotate`.
- **R-CS-1** (sửa) comment tối đa 1 dòng, đúng 3 loại: hợp đồng platform · hack · logic bí ẩn.

## Cổng popup tự động — cách giải mâu thuẫn

`check-promotion` có luật "skill KHÔNG tự đoán loại promotion, user tự nhập". Cổng tự động vẫn giữ luật đó:
skill gọi (code-developer / bug-fixer) suy loại từ ticket/design/`prodTemplate`, **hỏi user 1 câu nếu không
chắc**, rồi truyền loại vào. Người chốt loại vẫn là user. `bug-fixer-lite` (skill độc lập, không gọi skill
khác) thay bằng đọc thẳng file checklist trong `ai-template-check-skill/reference/`.

**Không sửa gì trong `gt-promotion-template`** (user chốt 19/8: repo dùng chung của team). Bản sửa thử vào
`ai-template-check-skill/SKILL.md` đã revert, repo sạch. Toàn bộ cổng nằm ở phía skill gọi.

## Phạm vi đã áp

| Nhóm | File |
|---|---|
| Luật | 3 file mới + `code-style.md` |
| Điều phối | `CLAUDE.md` (bảng routing, R-CS-1, commit), `cdn-source/CLAUDE.md` |
| Sinh code | `code-developer/SKILL.md` + `references/chuan-cdn-source.md` (mới), agent `frontend-developer`, `design-analyst`, `design-checker` |
| Fix bug | `bug-fixer/SKILL.md`, `bug-fixer-lite/SKILL.md`, agent `bug-analyst`, `bug-lane` |
| Kiểm tra | `ui-check`, `code-audit`, `website-audit`, `check-design` |
| Dọn code | `clean-code` |
| Điều phối ngày | `daily` (brief code-developer + phase deliver theo R-HO) |
| Knowledge | `cdn-source-conventions.md`, `base-structure.md` (cả bản `~/.claude` lẫn `promptAgent/knowledge`) |

**Slide (chốt 19/8 sau 4 vòng sửa):** KHÔNG có slide riêng cho bộ luật. Deck `sdlc-daily` chỉ thêm một
dải `.band` vào slide "Bước 03 · Dựng": *popup, co giãn PC/mobile, vòng quay, mốc thưởng — library dùng
chung có sẵn hết; ba vai chỉ code phần riêng của campaign*. **Mã luật R-CDN/R-POP/R-HO không lên slide** —
người xem không thuộc mã, thấy mã chỉ rối; mã để trong tài liệu, ai cần thì tra. Ba bản slide riêng
trước đó đều bị bác: bản 1 nhồi câu dài vào ô mono (`.ins > b`, font 31px) làm vỡ layout; bản 2-3 bị chê
"văn quá AI" (ẩn dụ tự chế "ảnh chụp code") và "không nói luật làm gì".

## Bổ sung cùng ngày — sprite (R-SPR-1..9)

Chủ repo báo: agent viết sprite sai cơ chế. Đúng — luật cũ chỉ có R-CDN-6 ("đừng sửa file generated"),
không hề nói cách DÙNG. Khảo sát 4 góc + tự kiểm lại bằng lệnh:

- Repo có **≥3 thế hệ cấu hình sprite**, không mẫu chung → R-SPR-1 bắt đọc `webpack.config.js` của chính project.
- `sprite.png` (2.755 file) và `sprite.generated.scss` (1.254 file) **bị git track** dù là artifact build →
  sửa tay *có vẻ* ăn nhưng build sau ghi đè (R-SPR-3).
- **Bug thật đang nằm trong repo**: `dt3q/2026-sinh-nhat-7-ai/.../dt3q-ld-sinhnhat-loichuc.scss:390` gõ tay
  `background-position: -408px -212px`, generated không có ô nào ở toạ độ đó (ô `btn-heart` ở `527/137`) →
  ví dụ minh hoạ cho R-SPR-5.
- 123 dòng SCSS + 179 thẻ Twig trỏ thẳng PNG lẻ trong `images/sprite/` → production ship trùng cả atlas lẫn ảnh rời.
- **741 file Twig dùng class `MS__sprite-*`** (sinh từ 876 file `*.sprite.scss`) — cách gắn class là phổ biến
  nhất repo. User chọn "code mới chỉ dùng `@include`", nên R-SPR-6 chốt: code mới `@include`, code cũ để yên.

Bốn quyết định của chủ repo: campaign mới theo mẫu `fox`, đụng tới đâu migrate tới đó · code mới chỉ
`@include` · section rỗng giữ stub `@mixin sprite($sprite) {}` (kèm cảnh báo stub nuốt im lặng `@include`) ·
chỉ cắt `-mb.png` khi design vẽ khác thật.

## Rủi ro đã biết

- **Không có cổng máy.** User chọn brief-only; R-CS-1 từng chứng minh luật văn xuôi bị trôi trong phiên dài,
  phải có `guard-style.sh` mới giữ được. Bù bằng: mã luật ngắn dễ trích, cổng tự soát trong template Tổng kết
  (`Lệch chuẩn đã thấy`, `Cổng popup`). Nếu vẫn trôi → cân nhắc thêm `tools/cdn-guard.mjs` sau.
- **Hook `guard-style.sh` thoáng hơn R-CS-1 mới** (tha jsdoc, tha khối comment dài). Đã ghi cảnh báo
  "hook im ≠ đạt" trong `code-style.md` và `CLAUDE.md`.
- **`libraryMainsite` 1.3.1 trong repo không sạch** (`libraryMainsite-t-popup.js` lẫn player DB của fantasy
  team). Luật lấy 1.3.1 làm nguồn **cấu trúc** popup, còn bản chạy thật trên CDN vẫn là 1.3.0.
