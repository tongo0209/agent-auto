# rules/ — luật có mã, có severity

`MUST` = chặn (không đạt thì không được báo xong) · `SHOULD` = cảnh báo.

Bản này chỉ đi kèm **`code-style.md`** (`R-CS-1..7`) — luật code áp cho mọi repo, mọi ngôn ngữ, và
là cùng nguồn luật với hook `guard-style.sh` cùng skill `/clean-code`.

## Các file rules khác không đi kèm

Nhiều skill và agent trong repo này có trỏ tới những file luật riêng của từng nền tảng:
`pm-contract.md`, `popup-library.md`, `html-handoff.md`, `cdn-source-standard.md`,
`repo-*.md`. Đó là **đặc tả nội bộ của tổ chức đã xây bộ này**, không phát hành kèm.

Thiếu chúng thì skill vẫn chạy; chỉ mất đúng cổng kiểm tương ứng — agent sẽ không biết đọc luật
nền tảng trước khi sửa file. Muốn dùng đầy đủ thì có hai đường:

1. **Xin bản nội bộ** (nếu bạn ở trong tổ chức đó) rồi đặt vào đúng thư mục `rules/` này —
   `tools/install-skills.sh` tự sinh lại bảng trong `~/.claude/CLAUDE.md` theo **file có thật**,
   nên thêm file vào là bảng có dòng đó, không cần sửa gì thêm.
2. **Tự viết luật của bạn.** Giữ đúng khuôn: mỗi luật một mã (`R-<NHÓM>-<số>`), một severity
   (`MUST`/`SHOULD`), một câu nói rõ hậu quả khi vi phạm. Rồi khai vào `templates/rules-index.tsv`
   (cột 1 = đường dẫn file, cột 2 = "chạm tới cái gì", cột 3 = "đọc file nào") và chạy lại
   installer. Chi tiết cách khai + cách thêm cả một khối luật riêng:
   [`../templates/README.md`](../templates/README.md).

Khuôn có mã như vậy để khi báo lỗi thì **trích mã luật** thay vì diễn giải lại, và khi giao việc
cho subagent thì chỉ cần trỏ file.
