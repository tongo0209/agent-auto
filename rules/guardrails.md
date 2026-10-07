# G-* · Guardrails cơ học (hook, không phải lời khuyên)

Hook chặn ở **tầng harness**, trước khi lệnh chạy. Bị chặn thì đọc mã luật `G-*` rồi **đổi cách làm — KHÔNG tìm đường lách**.

## `guard-bash.sh` (PreToolUse `Bash`)

| Mức | Mẫu bị bắt |
|---|---|
| **deny** | `rm -rf /` · `curl` pipe vào shell · đọc/copy file credential · force-push nhánh chung · drop database/table · `G-GIT-4`: `--autostash` / `commit --amend` trong `cdn-source` |
| **ask** | `git push` · `git reset --hard` / `clean -fd` / `stash drop` · script deploy (`mergeDevToMain.sh`…) · `rm` nhắm `designs/` · `state.json` · `boards/` |

File cấu hình test của Symfony vẫn đọc được. Self-test: `bash ~/.claude/hooks/guard-bash.test.sh`.

`G-SECRET-1` và `G-GIT-4` xét **từng phân đoạn lệnh** (tách theo `; & | ( )` ngoài quote, bỏ thân heredoc): chỉ phân đoạn mở đầu bằng verb đọc (`cat`/`head`/`cp`/`source`…, hoặc `xargs cat`) mới bị soi path secret. Ở `grep`/`sed`/`awk`, chuỗi trong quote coi là pattern. Vì vậy heredoc ghi `.gitignore`, `--env-file=.env.local`, `process.env` hay file `.env.*.example` không còn bị chặn (7/10/2026: phát lại 161 ca chặn thật thì 128 ca hết chặn oan, 33 ca còn lại đều là đọc credential thật).

Chờ một điều kiện (build xong, server lên, file xuất hiện): dùng `Monitor` với vòng `until`, hoặc `run_in_background`. Harness chặn `sleep N; cat …` ngay, và agent đã lặp lỗi này khoảng 42 lần trong 21 ngày.

## `guard-state.sh` (PostToolUse `Write|Edit|Bash`)

`state.json` của agent-auto đổi `mtime` ⇒ chạy `state-doctor` ngay, trả ERROR về để **sửa TRONG LƯỢT** (đừng để trôi sang phiên sau).

Field console đọc là **hợp đồng**: thiếu `summary` = board mất title — không crash nên không ai biết. Self-test: `bash ~/.claude/hooks/guard-state.test.sh`.

## `guard-style.sh` (PostToolUse `Write|Edit`)

Đếm comment trong **đoạn vừa ghi** (không soi cả file), trừ whitelist (`pm__`, hack, tên trình duyệt, `eslint-disable`, `@ts-`, license). Dư >2 dòng thì in `file:line` từng dòng vi phạm.

KHÔNG chặn ghi, chỉ báo — **nhận cảnh báo thì gỡ ngay trong lượt đó**, đừng để dồn.

⚠️ Hook chỉ đo được `R-CS-1`; `R-CS-2..7` là tự giác. **Hook THOÁNG HƠN luật** (tha jsdoc + khối comment dài) ⇒ **hook im ≠ đạt R-CS-1**. Self-test: `bash ~/.claude/hooks/guard-style.test.sh`.

## `guard-pm.sh` (PostToolUse `Write|Edit`)

Ghi xong file `.html`/`.htm`/`.twig` **có `pm__`** (trừ `node_modules`/`vendor`/`.min.`/`dist`) → chạy
`node "$AGENT_AUTO/tools/pm-gate.mjs" <file>` (`AGENT_AUTO` tính từ vị trí thật của hook, fallback `~/VNG/agent-auto`).
Gameplay đọc từ file dự án; baseline mặc định `HEAD` nên sửa landing cũ chỉ chặn lỗi MỚI (R-PM-8).

| Gate trả | Hook làm |
|---|---|
| exit 1 (có 🔴) | in nguyên output gate ra stderr + **exit 2 = chặn**, ghi `GUARD_LOG`, model đọc được, sửa trong lượt |
| exit 1 vì `PG-GAME` "chưa khoá gameplay" | file mới → chặn như trên. File đã có ở `HEAD` (landing cũ) → nhắc khoá qua `additionalContext`, exit 0. Cả hai: làm bước khoá R-PM-11 (`project-note lock`) trước khi sửa tiếp, **không** truyền `--gameplay` đoán mò |
| exit 0 có 🟡 | đưa nguyên output vào context model qua `additionalContext` (stderr ở exit 0 model không thấy), exit 0 — không chặn, vẫn phải soát tay |
| exit 2 (lỗi dùng: cờ sai, thiếu kit…) | đưa `[guard-pm] pm-gate lỗi dùng — …` vào `additionalContext`, exit 0 — không chặn nhưng **không im** |

Im lặng chỉ khi: file không có `pm__` · đuôi/thư mục bị loại trừ ở trên · máy không có `node`/không thấy `pm-gate.mjs` · gate sạch.
⚠️ Hook chỉ soát **file vừa ghi**: file partial (không `<body`) không chạy `PG-REQ`/`PG-REF` ⇒ hook im ≠ trang đủ hook — sau build vẫn phải `pm-gate --page <campaignDir>`. Ghi file bằng Bash (`sed`, heredoc) **không qua hook** — tự chạy gate.
Bị báo thì sửa rồi chạy lại `node ~/VNG/agent-auto/tools/pm-gate.mjs <file>`, **đừng đổi tên hook cho qua cổng**. Mã lỗi `PG-*`: `pm-contract.md`.
Self-test: `bash ~/.claude/hooks/guard-pm.test.sh` (dùng `HOME` + `GUARD_LOG` tạm, không ghi `~/.claude/hooks/guard.log` thật).

## `token-watch.sh` (UserPromptSubmit)

Đọc `transcript_path` từ stdin, tính context của lượt gần nhất. Vượt ngưỡng (mặc định 200.000 token) thì chèn nhắc chốt việc dở ra file — phiên tự compact ở `autoCompactWindow: 300000` (`~/.claude/settings.json`, đặt 30/9/2026 thay cho nhắc `/clear`). Model opus[1m] không đặt window thì chỉ compact gần 1M, nên phiên leo 500–700k.

Vì sao cần — đo thật 22/9/2026 trên 1.792 phiên / 95.943 lượt:

- Context gửi lại **mỗi lượt** ⇒ chi phí tăng theo bình phương độ dài phiên.
- 1 phiên landing 424 lượt leo `72k → 385k` token, **không compact lần nào**, tốn 103,5M token. Cùng khối lượng việc chia 3 phiên chỉ tốn ~52M (**−46%**).
- Baseline mỗi phiên là 68–73k token trước khi user gõ chữ đầu tiên ⇒ 6,7 tỷ token/tháng chỉ để gửi lại phần cố định (35% khối lượng, ~24% chi phí quy đổi).

Ngưỡng đổi bằng biến môi trường `CLAUDE_CTX_WARN`. Self-test: `bash ~/.claude/hooks/token-watch.test.sh`.
Đo lịch sử: `node ~/VNG/agent-auto/tools/token-scan.mjs` (token) · `node ~/VNG/agent-auto/tools/wall-scan.mjs [--skill <tên>]` (thời gian thật theo skill).

## `limit-failover.sh` (StopFailure `rate_limit|billing_error`)

Không phải guard: chỉ có tác dụng khi phiên chạy qua lệnh `ca` (`tools/claude-failover.sh`). Team đang dùng hết limit ⇒ hook ghi cờ `~/.cache/claude-failover/pending.<pid wrapper>` + mốc `<team>.last`, báo notification, tắt phiên (`pkill -TERM -a` — thiếu `-a` thì macOS bỏ qua tiến trình tổ tiên, phiên không chết). Wrapper thấy cờ ⇒ `--resume <session>` bằng team kia kèm lời nhắn làm tiếp. Team kia cũng vừa hết limit trong 5 giờ ⇒ dừng, in lệnh mở lại tay.

Team A = `~/.claude` (chạy KHÔNG set `CLAUDE_CONFIG_DIR`, kẻo mất login), team B = `~/.claude-teamB` (symlink chung luật/skill/hook/`projects`). Statusline hiện `⚡A`/`⚡B` + % limit 5h/7d, ≥ 90% đổi 🔴. `claude` trần ⇒ hook im. Self-test: `bash ~/.claude/hooks/limit-failover.test.sh` · `bash ~/VNG/agent-auto/tools/claude-failover.test.sh`.
