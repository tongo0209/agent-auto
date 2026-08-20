# rules/ — luật có mã, có severity

`MUST` = chặn (không đạt thì không được báo xong) · `SHOULD` = cảnh báo. Báo lỗi thì **trích mã
luật** thay vì diễn giải lại; giao subagent thì trỏ file, khỏi copy cả luật.

| File | Mã | Áp khi chạm tới |
|---|---|---|
| `code-style.md` | `R-CS-1..7` | **mọi repo, mọi ngôn ngữ** — cùng nguồn luật với hook `guard-style.sh` và `/clean-code` |
| `pm-contract.md` | `R-PM-1..6` | file có class hợp đồng platform |
| `cdn-source-standard.md` | `R-CDN-1..14`, `R-SPR-1..9` | repo assets/landing — thế hệ build, px tuyệt đối, sprite |
| `popup-library.md` | `R-POP-1..9` | popup bất kỳ (popup là design system, không phải markup rời) |
| `html-handoff.md` | `R-HO-1..11` | đưa HTML sang repo bàn giao |
| `repo-new-mainsite.md` | `R-TWIG-1..7` | `.twig` trong repo mainsite |
| `repo-vportal2view.md` | `R-VP2-1..6` | `.twig` trong repo portal |
| `repo-gt-promotion.md` | `R-GTP-1..6` | repo template chiến dịch |

Bảng trong `~/.claude/CLAUDE.md` **sinh lại từ `templates/rules-index.tsv`** và chỉ in dòng nào có
file thật ở đây — thêm/bớt file rồi chạy lại `tools/install-skills.sh` là bảng khớp lại.

Bản public chỉ mang `code-style.md`; 7 file còn lại là đặc tả nội bộ, phát riêng
(xem `publish/manifest.txt`).
