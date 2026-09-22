# Luật chung mọi project (global — bộ promptAgent)

## Ngôn ngữ
Giao tiếp với user **bằng tiếng Việt** — báo cáo, câu hỏi, tổng kết, cảnh báo, mô tả việc đang làm — kể cả khi user nhắn tiếng Anh (trừ khi user đòi ngôn ngữ khác).

## Routing theo loại việc
| Loại việc | Đường ray |
|---|---|
| Sửa vặt frontend (≤2 file, chỗ sửa đã rõ, không component/logic mới) | Làm THẲNG trong phiên — không qua skill, vẫn verify build thật |
| Có `.psd`/`.psb` chưa bóc (chưa có `_auto-export/<slug>/assets/`) | `/psd-cut` TRƯỚC — asset + toạ độ từ `coords.json`, KHÔNG cắt tay/`sips` |
| Design là **Figma** (link `figma.com`) chưa bóc | `/figma-cut` TRƯỚC (KHÔNG phải `/psd-cut`) — toạ độ từ `coords.json`, text vùng data-bind lấy `textLive`. Token ở `~/.config/figma-cut/token` |
| Có video phải "đọc" (feedback QC, animation, tutorial) | `/video-digest` TRƯỚC. CẤM ném frame thô vào model (1 clip 12 phút ≈ 34 triệu vision token) |
| Dựng UI từ ảnh design | `/code-developer full` |
| Sửa UI có sẵn cho khớp design | `/code-developer fix` |
| Sửa/thêm tính năng frontend | `/code-developer code` |
| So code với design | `/code-developer compare` |
| Tooling/script/server (không UI) | skill `test-driven-development` + `verification-before-completion` |
| Bug bất kỳ | skill `systematic-debugging` trước khi đề xuất fix |
| Buglist QC (Sheets / Excel Online / doc / pdf / chat) | `/bug-fixer-lite` |
| Audit website trước production | `/website-audit` |
| Code rườm (comment thừa, trừu tượng 1-lần-dùng, CSS lặp) | `/clean-code` |

## Rules có mã (đọc theo nhu cầu — KHÔNG nạp sẵn)
Chi tiết ở `<AGENT_AUTO>/rules/`. `MUST` = chặn, `SHOULD` = cảnh báo. Báo lỗi thì **trích mã luật** (`R-PM-3 MUST`) thay vì diễn giải lại; giao subagent thì trỏ file, khỏi copy cả luật.

<!-- RULES-TABLE -->

## Code style (R-CS-1..7 — `rules/code-style.md`)
Comment tối giản 1 dòng đúng 3 loại · không phòng thủ thừa · rule of two · grep trước khi viết · tên thay comment · không tự thêm ngoài yêu cầu · cổng nghiệm thu junior.

Cổng cuối trước khi báo xong (**R-CS-7**): intern đọc một lượt từ trên xuống, KHÔNG nhảy file, có hiểu không? Không đạt → làm phẳng code + đổi tên, **cấm chữa bằng cách thêm comment**.

Giao subagent viết code → brief phải trỏ `rules/code-style.md` **và** (nếu chạm cdn-source) `rules/cdn-source-standard.md` + `rules/popup-library.md`, (nếu bàn giao) `rules/html-handoff.md`.

## Git (R-GIT-1..6 — `rules/git-workflow.md`)
- `git commit`: **tự làm được, KHÔNG hỏi** — nhưng gom đúng phạm vi project đang làm và BÁO LẠI đã commit gì.
- `git push`: **KHÔNG BAO GIỜ tự làm** — hỏi user TỪNG lần.
- 2 hệ format không lẫn: repo git VNG theo `/commit` (Conventional Commits) · repo nội bộ `[<leaf-folder>] <English subject>`.
- `cdn-source`: trước MỌI commit tự `git pull --autostash origin master`; user kêu "push" mới chạy `git mr`, dừng ở tạo MR.
- `gt-promotion-template` / `new-mainsite`: KHÔNG commit hộ user — chỉ đưa `git diff --stat`.

## Guardrails cơ học (`rules/guardrails.md`)
Hook chặn ở tầng harness, không phải lời khuyên: `guard-bash` (deny lệnh huỷ hoại + đọc credential, ask git/deploy/`rm` vùng dữ liệu) · `guard-state` (state.json đổi mtime ⇒ `state-doctor` NGAY, sửa trong lượt) · `guard-style` (đếm comment đoạn vừa ghi; **hook im ≠ đạt R-CS-1**) · `token-watch` (context vượt ngưỡng ⇒ nhắc `/clear`).

Bị chặn thì đọc mã `G-*` rồi đổi cách làm — **KHÔNG tìm đường lách**.

## Verify trung thực
- Mọi claim "xong/pass" phải có lệnh đã chạy thật + output. Chưa chạy → nói rõ "chưa verify".
- Test targeted trong vòng red→green; full suite chỉ 1 lần chốt. Báo ⏱ tách máy chạy vs chờ user.

## Tinh gọn context (mọi project)
Context gửi lại **MỖI lượt** → 1 lần nạp thừa bị nhân với số lượt còn lại, và chi phí tăng theo **bình phương** độ dài phiên. Nạp đúng đủ, không nạp cho chắc.
- Read: Grep/Glob định vị trước rồi Read theo `offset`/`limit`. Read cả file chỉ khi <300 dòng.
- Bash: siết đầu ra — `| tail -30`, `| grep -E 'error|fail|warn'`. KHÔNG dump nguyên log build/test.
- Subagent: brief ghi rõ "trả ≤20 dòng, chỉ kết luận + `file:line`" — CẤM trả nguyên nội dung file đã đọc.
- Ảnh design: mỗi lần mở lại là vision token mới, không nén được. Spec bóc xong thì làm trên spec.
- KHÔNG Read lại file vừa Edit để "verify" — Edit sai thì đã báo lỗi ngay.
- Báo cáo user: kết luận trước, không thuật lại từng bước, không paste lại code vừa sửa.
- **Xong một pha lớn, hoặc `token-watch` kêu → nhắc user `/clear`.** Đừng kéo context cũ sang việc mới.
- **Trần chất lượng:** tinh gọn là cắt phần dư, KHÔNG cắt bằng chứng. Khi xung đột, "Verify trung thực" THẮNG mục này.

## Quy ước giao diện team (mọi repo frontend)
PC = 1920×1080, mobile = 768×1024; PC → mobile reload đúng 1 lần; H5 chỉ kiểm ngang 1920×1080. Sau browser test: đóng/reset session, báo kết quả + thời gian.
