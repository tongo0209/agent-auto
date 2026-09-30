# rules/ — luật có mã, có severity

`MUST` = chặn (không đạt thì không được báo xong) · `SHOULD` = cảnh báo. Báo lỗi thì **trích mã
luật** thay vì diễn giải lại; giao subagent thì trỏ file, khỏi copy cả luật.

| File | Mã | Áp khi chạm tới |
|---|---|---|
| `code-style.md` | `R-CS-1..7` | **mọi repo, mọi ngôn ngữ** — cùng nguồn luật với hook `guard-style.sh` và `/clean-code` |
| `pm-contract.md` | `R-PM-1..12`, mã cổng `PG-*` | file có class hợp đồng platform — kèm `pm-kit-overrides.tsv` (chỗ kit lệch production, R-PM-9) |
| `cdn-source-standard.md` | `R-CDN-1..25`, `R-SPR-1..12` | repo assets/landing — thế hệ build, px tuyệt đối, SCSS/font/ảnh, sprite |
| `landing-js.md` | `R-JS-1..13` | JS riêng của landing trong repo assets — nối engine, `MJ__*`, popup, observer, mock |
| `landing-structure.md` | `R-STR-1..9` | cấu trúc campaign trong repo assets — section, tên khi clone, trang phụ, layout nhiều trang, bàn giao lại bản build |
| `layout-standard.md` | `R-LAY-1..8` | dựng list/danh sách — absolute vs flex/grid, gap, scroll |
| `promo-states.md` | `R-ST-1..8` | ô nhận thưởng — đủ 3 trạng thái off/active/received |
| `popup-library.md` | `R-POP-1..9` | popup bất kỳ (popup là design system, không phải markup rời) |
| `html-handoff.md` | `R-HO-1..11` | đưa HTML sang repo bàn giao |
| `repo-new-mainsite.md` | `R-TWIG-1..7` | `.twig` trong repo mainsite |
| `repo-vportal2view.md` | `R-VP2-1..6` | `.twig` trong repo portal |
| `repo-gt-promotion.md` | `R-GTP-1..6` | repo template chiến dịch |
| `animation.md` | `R-ANIM-1..7` | effect/animation bất kỳ (CSS/Lottie/GSAP) — viết mới hoặc fix bug QC |
| `git-workflow.md` | `R-GIT-1..6` | commit / push / tạo MR — 2 hệ format, luồng nhánh `cdn-source` |
| `guardrails.md` | `G-*` | bị hook chặn — mẫu deny/ask, hợp đồng state, ngưỡng context |
| `agent-evidence.md` | `R-EV-1..7` | báo cáo bất kỳ của agent/subagent — số liệu, trạng thái, verdict |

Bảng trong `~/.claude/CLAUDE.md` **sinh lại từ `templates/rules-index.tsv`** và chỉ in dòng nào có
file thật ở đây — thêm/bớt file rồi chạy lại `tools/install-skills.sh` là bảng khớp lại.

Bản public KHÔNG mang 9 file đặc tả nội bộ (`pm-contract`, `cdn-source-standard`, `landing-js`, `landing-structure`,
`popup-library`, `html-handoff`, 3 file `repo-*`) cùng `pm-kit-overrides.tsv` — phát riêng (nhóm RA trong `publish/manifest.txt`).
