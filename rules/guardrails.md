# G-* · Guardrails cơ học (hook, không phải lời khuyên)

Hook chặn ở **tầng harness**, trước khi lệnh chạy. Bị chặn thì đọc mã luật `G-*` rồi **đổi cách làm — KHÔNG tìm đường lách**.

## `guard-bash.sh` (PreToolUse `Bash`)

| Mức | Mẫu bị bắt |
|---|---|
| **deny** | `rm -rf /` · `curl` pipe vào shell · đọc/copy file credential · force-push nhánh chung · drop database/table |
| **ask** | `git commit` / `git push` · `git reset --hard` / `clean -fd` / `stash drop` · script deploy (`mergeDevToMain.sh`…) · `rm` nhắm `designs/` · `state.json` · `boards/` |

File cấu hình test của Symfony vẫn đọc được. Self-test: `bash ~/.claude/hooks/guard-bash.test.sh`.

⚠️ `G-SECRET-1` bắt theo **chuỗi trong lệnh**, nên heredoc *viết tài liệu* có nhắc tên file credential cũng bị chặn (đã gặp 22/9/2026). Đó là false positive đúng thiết kế — xử lý bằng cách ghi file qua tool Write, KHÔNG né hook bằng cách mã hoá chuỗi.

## `guard-state.sh` (PostToolUse `Write|Edit|Bash`)

`state.json` của agent-auto đổi `mtime` ⇒ chạy `state-doctor` ngay, trả ERROR về để **sửa TRONG LƯỢT** (đừng để trôi sang phiên sau).

Field console đọc là **hợp đồng**: thiếu `summary` = board mất title — không crash nên không ai biết. Self-test: `bash ~/.claude/hooks/guard-state.test.sh`.

## `guard-style.sh` (PostToolUse `Write|Edit`)

Đếm comment trong **đoạn vừa ghi** (không soi cả file), trừ whitelist (`pm__`, hack, tên trình duyệt, `eslint-disable`, `@ts-`, license). Dư >2 dòng thì in `file:line` từng dòng vi phạm.

KHÔNG chặn ghi, chỉ báo — **nhận cảnh báo thì gỡ ngay trong lượt đó**, đừng để dồn.

⚠️ Hook chỉ đo được `R-CS-1`; `R-CS-2..7` là tự giác. **Hook THOÁNG HƠN luật** (tha jsdoc + khối comment dài) ⇒ **hook im ≠ đạt R-CS-1**. Self-test: `bash ~/.claude/hooks/guard-style.test.sh`.

## `guard-pm.sh` (PostToolUse `Write|Edit`)

Ghi xong file `.html`/`.twig` **có `pm__`** → chạy `tools/pm-gate.mjs`, đối chiếu `AI-RULES` của gameplay
trong `ai-template-kit`. Chỉ 🔴 mới lên tiếng (hook nhân đôi · đặt sai container · còn `<any>`), 🟡 im.
Im lặng cả khi: file không có `pm__` · không nhận ra gameplay (kit mới phủ 2 gameplay) · chưa pull kit.
Bị báo thì sửa rồi chạy lại `node ~/VNG/agent-auto/tools/pm-gate.mjs <file>`, **đừng đổi tên hook cho qua cổng**.
Self-test: `bash ~/.claude/hooks/guard-pm.test.sh`.

## `token-watch.sh` (UserPromptSubmit)

Đọc `transcript_path` từ stdin, tính context của lượt gần nhất. Vượt ngưỡng (mặc định 200.000 token) thì chèn nhắc cắt phiên bằng `/clear`.

Vì sao cần — đo thật 22/9/2026 trên 1.792 phiên / 95.943 lượt:

- Context gửi lại **mỗi lượt** ⇒ chi phí tăng theo bình phương độ dài phiên.
- 1 phiên landing 424 lượt leo `72k → 385k` token, **không compact lần nào**, tốn 103,5M token. Cùng khối lượng việc chia 3 phiên chỉ tốn ~52M (**−46%**).
- Baseline mỗi phiên là 68–73k token trước khi user gõ chữ đầu tiên ⇒ 6,7 tỷ token/tháng chỉ để gửi lại phần cố định (35% khối lượng, ~24% chi phí quy đổi).

Ngưỡng đổi bằng biến môi trường `CLAUDE_CTX_WARN`. Self-test: `bash ~/.claude/hooks/token-watch.test.sh`.
Đo lịch sử: `node ~/VNG/agent-auto/tools/token-scan.mjs`.
