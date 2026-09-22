# rules/ — luật có mã, có severity

`MUST` = chặn (không đạt thì không được báo xong) · `SHOULD` = cảnh báo. Báo lỗi thì **trích mã
luật** thay vì diễn giải lại; giao subagent thì trỏ file, khỏi copy cả luật.

| File | Mã | Áp khi chạm tới |
|---|---|---|
| `code-style.md` | `R-CS-1..7` | **mọi repo, mọi ngôn ngữ** — cùng nguồn luật với hook `guard-style.sh` và `/clean-code` |
| `pm-contract.md` | `R-PM-1..6` | file có class hợp đồng platform |
| `cdn-source-standard.md` | `R-CDN-1..14`, `R-SPR-1..9` | repo assets/landing — thế hệ build, px tuyệt đối, sprite |
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

Bản public chỉ mang `code-style.md`; 7 file còn lại là đặc tả nội bộ, phát riêng
(xem `publish/manifest.txt`).
