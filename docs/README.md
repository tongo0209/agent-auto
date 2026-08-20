# Chỉ mục tài liệu agent-auto

Vì sao có file này: 18/8/2026 soát lại thấy 9/18 spec đang mô tả hệ thống ở trạng thái đã bị thay,
và `docs/plans/` có 4 plan đã thực thi xong mà 191 ô checklist vẫn để trống — đọc vào tưởng chưa làm.
Không có chỗ nào nói "cái nào còn hiệu lực" nên ai đọc cũng phải tự dò.

**Luật giữ file này đúng:** thêm spec mới → cùng lượt đó đánh dấu spec bị nó thay, ở cả bảng dưới
lẫn dòng `> ⚠️` ngay dưới tiêu đề spec cũ. Spec là tài liệu LỊCH SỬ, không xoá; cái sai thì đóng dấu.
Riêng khối **chép lại nội dung file khác** (`schema/vocab.json`, schema `metrics.jsonl`, danh sách mã
luật) thì xoá và thay bằng 1 dòng trỏ nguồn — chép là chắc chắn lệch.

## Tài liệu người dùng (đi kèm bản public)

| File | Nội dung |
|---|---|
| [`install.md`](install.md) | Phụ thuộc, MCP, bảng `config.json`, 4 ca `settings.json`, radar nền, gỡ cài, lỗi thường gặp |
| [`skills.md`](skills.md) | 11 skill + mode, 5 agent, 4 hook |
| [`architecture.md`](architecture.md) | Cấu trúc repo, cái gì vào git, cổng chất lượng, guardrail, ranh giới an toàn |

Ba file trên **có** trong bản public; `specs/`, `present/` và chính file index này thì **không**
(xem `publish/manifest.txt`). Quy trình xuất bản: [`../publish/README.md`](../publish/README.md).

## Spec

| Spec | Nói về | Trạng thái |
|---|---|---|
| `2026-08-20-public-export-readme-design.md` | Xuất bản công khai (repo mới history trắng) + README cài macOS/Windows | ✅ hiệu lực |
| `2026-08-19-cdn-source-standard-design.md` | Chuẩn code `cdn-source` cho cả bộ skill — 3 file luật mới trong `rules/`, sửa `R-CS-1`, cổng `/check-promotion` | ✅ hiệu lực |
| `2026-08-18-bug-verify-console-design.md` | Bug đã fix → báo user, user verify, ghi ngược sheet | ✅ hiệu lực |
| `2026-08-17-bug-radar-design.md` | Radar theo dõi buglist QC sau bàn giao | ✅ hiệu lực |
| `2026-08-13-radar-auto-design.md` | Radar nền tự chạy bằng launchd | ✅ hiệu lực — bản chuẩn về nhịp radar |
| `2026-08-13-check-design-gap-design.md` | `/check-design` soát design đã đủ chưa | ✅ hiệu lực |
| `2026-08-12-carry-over-debt-design.md` | Sổ nợ đọng xuyên ngày | ✅ hiệu lực |
| `2026-08-10-jira-handoff-write-design.md` | Đánh Done Jira khi đã bàn giao | ✅ hiệu lực |
| `2026-08-03-agent-auto-upgrade-design.md` | Hợp đồng dữ liệu + 5 hệ con | ⚠️ một phần — khối `vocab` chép lại đã bỏ, đọc `schema/vocab.json` |
| `2026-08-01-01-console-workspace-design.md` | Console thành nơi làm việc (hệ ②) | ✅ hiệu lực |
| `2026-08-01-02-daily-automation-design.md` | Tự động hoá `/daily` (hệ ①) | ❌ bị thay bởi `2026-08-13-radar-auto-design.md` |
| `2026-08-01-03-fe-quality-gate-design.md` | Gate chất lượng output FE (hệ ③) | ⚠️ một phần — `GET /api/gate/:key` đã gỡ 18/8 |
| `2026-08-01-04-learning-loop-design.md` | Vòng học & dự báo (hệ ④) | ❌ tiền đề hết đúng — schema thật ở `console/server/lib/learn.js` |
| `2026-08-01-05-ticket-cockpit-design.md` | Drawer một-ticket-một-chỗ (hệ ⑤) | ✅ hiệu lực |
| `2026-07-31-console-ui-refresh-design.md` | Làm lại giao diện console | ⚠️ một phần — bảng "Hiện trạng" là lỗi đã fix; nay 5 tab |
| `2026-07-31-daily-console-design.md` | Console web local bọc terminal | ❌ khai console chỉ đọc — thực tế console CÓ ghi |
| `2026-07-31-design-autodownload-scaffold-design.md` | Tự tải design từ SharePoint | ✅ hiệu lực — bản chuẩn (nhánh scaffoldPSD đã bỏ) |
| `2026-07-31-git-ticket-linking-design.md` | Nối git ↔ ticket, suy phase + effort | ❌ format `metrics.jsonl` đã lệch — đọc `console/server/lib/learn.js` |
| `2026-07-30-daily-v2-lifecycle-design.md` | Vòng đời task v2 | ❌ 7 phase + emoji — bản thật `schema/vocab.json` có 9 phase, không emoji |
| `2026-07-30-daily-orchestrator-design.md` | Bản thiết kế đầu của `/daily` | ❌ bị thay bởi `2026-08-13-radar-auto-design.md`; lệnh cấm cron đã bị đo thật bác bỏ |

## Slide

`present/*.src.html` là **nguồn**, sửa ở đó rồi publish kèm `url` để giữ nguyên link artifact.
`agent-auto.html` là bản build (222 KB, phần lớn là font base64) — đừng sửa tay.

## docs/plans

Đã bỏ 18/8/2026. Cả 4 plan đều đã thực thi xong và mọi quyết định đắt giá đã nằm trong spec hoặc
trong code kèm comment "vì sao"; giữ lại chỉ gây hiểu nhầm là việc chưa làm. Cần đọc lại:
`git log --diff-filter=D --oneline -- docs/plans/` để tìm commit đã xoá, rồi
`git show <commit>^:docs/plans/<tên file>`. (KHÔNG dùng `git show HEAD:` — sau commit xoá thì
`HEAD` không còn file, lệnh báo `path does not exist`.)
