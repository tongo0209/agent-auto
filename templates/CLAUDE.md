# Luật chung mọi project

<!-- Bản mẫu của agent-auto. tools/install-skills.sh điền <AGENT_AUTO> và sinh lại
     bảng rules từ templates/rules-index.tsv. Sửa luật thì sửa file này rồi chạy lại installer. -->

## Ngôn ngữ
- Mặc định giao tiếp với user **bằng tiếng Việt** — báo cáo, câu hỏi, tổng kết, cảnh báo, mô tả việc đang làm — kể cả khi user nhắn bằng tiếng Anh (trừ khi user yêu cầu ngôn ngữ khác).

## Routing theo loại việc
| Loại việc | Đường ray |
|---|---|
| Sửa vặt frontend (≤2 file, chỗ sửa đã rõ, không component/logic mới) | Làm THẲNG trong phiên — không qua skill, vẫn verify build thật |
| Dựng UI từ ảnh design | `/code-developer full` |
| Sửa UI có sẵn cho khớp ảnh design | `/code-developer fix` |
| Sửa/thêm tính năng frontend (có/không ảnh) | `/code-developer code` |
| So code với design | `/code-developer compare` |
| Tính năng tooling/script/server (không UI) | skill `test-driven-development` + `verification-before-completion` |
| Bug bất kỳ | skill `systematic-debugging` trước khi đề xuất fix |
| Buglist QC trên Google Sheets | `/bug-fixer` |
| Audit/tối ưu website trước khi lên production (validation, performance, ảnh, font, SEO) | `/website-audit` |
| Code đã viết bị rườm (comment thừa, trừu tượng 1-lần-dùng, CSS lặp) | `/clean-code` — dọn + build verify |

## Rules có ID (đọc theo nhu cầu — KHÔNG nạp sẵn)
Chi tiết + mã luật ở `<AGENT_AUTO>/rules/`. `MUST` = chặn, `SHOULD` = cảnh báo. Báo lỗi thì **trích mã luật** (`R-CS-1 MUST`) thay vì diễn giải lại; giao subagent thì trỏ file, khỏi copy cả luật.
<!-- RULES-TABLE -->

## Code style — clean, ngắn, junior đọc là hiểu (R-CS-*)
- **R-CS-1 MUST · Comment tối giản, 1 dòng, đúng 3 loại.** Được comment khi thuộc: (a) hợp đồng platform (class/`id`/`data-*` mà JS platform đọc — xem `rules/`); (b) hack/workaround trình duyệt–thư viện; (c) logic bí ẩn (công thức, thứ tự bắt buộc, ràng buộc backend). Tối đa 1 dòng ngắn tiếng Việt. Cấm: mô tả lại code, banner `// =====`, JSDoc nhiều dòng, comment mốc section, comment dài hơn code nó tả.
- **R-CS-2 MUST · Không phòng thủ thừa.** Không `try-catch` bọc DOM query, không `if (!el) return`, không `?.` rải khắp — trừ khi thật sự có thể vắng theo điều kiện render/response.
- **R-CS-3 MUST · Rule of two.** Không tách hàm/biến trung gian/util/config cho thứ dùng 1 lần. Trừu tượng chỉ ra đời khi có ≥2 chỗ dùng THẬT.
- **R-CS-4 MUST · Grep trước khi viết.** Mixin/class/biến/helper repo đã có thì dùng lại, cấm viết lại.
- **R-CS-5 MUST · Tên thay comment.** Magic number → hằng có tên. Cần comment mới hiểu tên → đổi tên, đừng thêm comment.
- **R-CS-6 SHOULD** · Không tự thêm state/tính năng/breakpoint/biến dự phòng ngoài yêu cầu.
- **R-CS-7 MUST · Cổng nghiệm thu junior.** Trước khi báo xong: intern/fresher đọc một lượt từ trên xuống, KHÔNG nhảy file, có hiểu không? Không đạt → làm phẳng code + đổi tên, **cấm chữa bằng cách thêm comment**.
- Dọn code đã lỡ viết rườm: `/clean-code` (dọn + build verify) · soi báo cáo không sửa: `/code-audit`.
- Giao subagent viết code → brief phải trỏ `rules/code-style.md` **và** (nếu chạm cdn-source) `rules/cdn-source-standard.md` + `rules/popup-library.md`, (nếu bàn giao) `rules/html-handoff.md`; không skill/agent nào tự biết luật này.

## Guardrails cơ học (hook, không phải lời khuyên)
`~/.claude/hooks/guard-bash.sh` chặn ngay ở tầng harness — **deny**: `rm -rf /`, `curl|sh`, đọc secret (`.env`, key, `~/.ssh`, `~/.aws`), force-push nhánh chung, drop database/table · **ask**: `git commit`/`git push`, `git reset --hard`/`clean -fd`/`stash drop`, script deploy (`mergeDevToMain.sh`…), `rm` nhắm `designs/`·`state.json`·`boards/`. Bị chặn thì đọc mã luật `G-*` rồi đổi cách làm — KHÔNG tìm đường lách. `.env.test` (Symfony) vẫn đọc được. Self-test: `bash ~/.claude/hooks/guard-bash.test.sh`.
`~/.claude/hooks/guard-state.sh` (PostToolUse `Write|Edit|Bash`) — `state.json` của agent-auto đổi `mtime` thì chạy `state-doctor` ngay, trả ERROR về để sửa TRONG LƯỢT (đừng để trôi sang phiên sau). Field console đọc là hợp đồng: thiếu `summary` = board mất title, không crash nên không ai biết. Self-test: `bash ~/.claude/hooks/guard-state.test.sh`.
`~/.claude/hooks/guard-style.sh` (PostToolUse `Write|Edit`) — đếm comment trong **đoạn vừa ghi** (không soi cả file), trừ whitelist (tiền tố hợp đồng platform, hack, tên trình duyệt, `eslint-disable`, `@ts-`, license); dư >2 dòng thì in `file:line` từng dòng vi phạm. KHÔNG chặn ghi, chỉ báo — nhận cảnh báo thì gỡ ngay trong lượt đó, đừng để dồn. Hook chỉ đo được `R-CS-1`; `R-CS-2..7` là tự giác. **Hook THOÁNG HƠN luật** (tha jsdoc + khối comment dài) — hook im ≠ đạt R-CS-1. Self-test: `bash ~/.claude/hooks/guard-style.test.sh`.

## Git an toàn
- `git commit`: **tự làm được, KHÔNG phải hỏi** (14/8/2026 user gỡ cổng; hook `G-GIT-2` cũng đã bỏ chặn để `/commit` và commit nhanh chạy trơn). Lý do: commit local còn amend/reset/revert được, hỏi từng lần chỉ ngắt luồng. Đổi lại vẫn phải: gom đúng phạm vi project đang làm, và BÁO LẠI đã commit những gì.
- `git push`: **KHÔNG BAO GIỜ tự làm** — hỏi user TỪNG lần. Đây mới là bước đi ra ngoài (người khác pull về, CI/CD chạy). Hook `G-GIT-2` vẫn giữ `ask`.
- **Commit format (chốt 19/8/2026 — 2 hệ, không lẫn):**
  - Repo đẩy lên **git VNG** (`cdn-source`, `gt-promotion-template`, `new-mainsite`, `vportal2view`): theo skill `/commit` — Conventional Commits `(<type>): <mô tả>` + footer `Co-Authored-By`. CI/CD VNG bắt format này. KHÔNG dùng `[leaf-folder]` ở đây.
  - Repo **nội bộ** (`agent-auto`, `promptAgent`, tool cá nhân): `[<leaf-folder>] <English subject>` + trailer Co-Authored-By.
  - `gt-promotion-template` / `new-mainsite`: KHÔNG commit hộ user (R-GTP-2, R-TWIG-4) — chỉ đưa `git diff --stat`.

## Verify trung thực
- Mọi claim "xong/pass" phải có lệnh đã chạy thật + output. Chưa chạy → nói rõ "chưa verify".
- Test targeted trong vòng red→green; full suite chỉ 1 lần chốt. Báo ⏱ tách máy chạy vs chờ user.

## Tinh gọn context (mọi project)
- Mục tiêu: phiên dài hơi hơn, token giảm, **chất lượng không đổi**. Context được gửi lại MỖI lượt → 1 lần nạp thừa bị nhân với số lượt còn lại. Nạp đúng đủ, không nạp cho chắc.
- Read: Grep/Glob định vị trước, rồi Read theo `offset`/`limit`. Read cả file chỉ khi <300 dòng hoặc thật sự cần toàn bộ.
- Bash: siết đầu ra — `| tail -30`, `| grep -E 'error|fail|warn'`, test dùng reporter gọn. KHÔNG dump nguyên log build/test/`npm ci`.
- Subagent (đòn chính của làn `full`): brief phải ghi rõ "trả ≤20 dòng, chỉ kết luận + `file:line`" — CẤM trả nguyên nội dung file đã đọc.
- Ảnh design: mỗi lần mở lại là vision tokens mới, không nén được. Spec đã bóc xong thì làm việc trên spec, không mở lại ảnh.
- KHÔNG Read lại file vừa Edit để "verify" — Edit sai thì đã báo lỗi ngay.
- Báo cáo user: kết luận trước, không thuật lại từng bước, không paste lại code vừa sửa (user tự xem diff).
- Việc mới không liên quan việc đang làm → nhắc user `/clear`, đừng kéo context cũ theo.
- **Trần chất lượng:** tinh gọn là cắt phần dư, KHÔNG cắt bằng chứng. Cổng verify cuối chạy lệnh raw và đọc output thật. Khi xung đột, mục "Verify trung thực" THẮNG mục này.

## Quy ước giao diện team (mọi repo frontend)
- PC = 1920×1080, mobile = 768×1024; PC → mobile reload đúng 1 lần; H5 chỉ kiểm ngang 1920×1080.
- Sau browser test: đóng/reset browser session, báo kết quả + thời gian.
