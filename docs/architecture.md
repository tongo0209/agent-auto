# Cấu trúc & nguyên tắc

## Cái gì vào git, cái gì không

Repo là **công cụ dùng chung**; board/task/state là việc của **riêng từng người** — track chúng thì
hai người chạy `/daily` là đụng nhau trên cùng file.

| Vào git | Không vào git |
|---|---|
| `skills/` · `agents/` · `hooks/` · `rules/` · `tools/` · `console/` · `schema/` · `templates/` · `docs/` | `state.json` · `config.json` · `dashboard.html` |
| `knowledge/lessons.md` — bài học chung, đáng để cả team đọc | `boards/` · `tasks/` · `history/` · `knowledge/gates/` · `knowledge/metrics.jsonl` |
| `*.example.json` — bản mẫu để script sinh file thật | `designs/` (rất nặng, tải lại được) · `.backups/` · `.cache/` |

Các thư mục dữ liệu vẫn còn sau khi clone nhờ `.gitkeep`, chỉ là rỗng.

## Cấu trúc

| File/folder | Vai trò |
|---|---|
| `skills/` | 11 skill. `~/.claude/skills/*` chỉ là symlink trỏ vào đây → sửa skill = sửa file trong repo, commit được |
| `agents/` | 5 định nghĩa agent + `references/` (playbook dùng chung) |
| `hooks/` | 4 guard + self-test của chúng; luật secret dùng chung qua `lib-secret-paths.sh` |
| `rules/code-style.md` | Luật code có mã `R-CS-1..7` — cùng nguồn luật với hook `guard-style.sh` và `/clean-code` |
| `templates/CLAUDE.md` | Bản mẫu luật chung, installer điền đường dẫn rồi ghi ra `~/.claude/CLAUDE.md` |
| `schema/vocab.json` | **Nguồn vốn từ duy nhất** — phase, loại mốc, trạng thái design. Skill và console đọc cùng file này |
| `config.json` | cloudId + JQL + đường dẫn repo. Không vào git; mẫu ở `config.example.json` |
| `state.json` | Ticket đã thấy lần trước → lần sau chỉ xử lý MỚI/ĐỔI/CÒN DỞ. Không vào git |
| `boards/YYYY-MM-DD.md` | Board mỗi ngày: trạng thái từng task, log, mục "Cần bạn" |
| `tasks/<KEY>/` | `brief.md` bóc từ ticket, `design-gap.md`, `handoff.md` |
| `designs/<KEY>/` | Kho design tập trung: ảnh dùng được + `_raw/` (zip/PSD gốc) |
| `history/issues.jsonl` | 1 dòng/ticket mỗi lần quét → nguồn thống kê theo tháng |
| `history/phases.jsonl` | 1 dòng mỗi lần phase đổi → nguồn lead time thật |
| `knowledge/metrics.jsonl` | Console tự ghi 1 dòng/ngày/ticket, **đo từ git** |
| `knowledge/lessons.md` | Bài học liên-dự-án; `fe-gate` fail thì tự append block nháp |
| `console/` | Web local (webpack + jQuery + xterm) — README riêng ở trong |

### Tool

| Tool | Làm gì | Self-test |
|---|---|---|
| `tools/install-skills.sh` | Cài 1 lệnh: symlink skill/hook/agent, seed config, ghi hook + statusline, dựng `CLAUDE.md` | `--check` |
| `tools/state-doctor.mjs` | Validator CHỈ ĐỌC `state.json`: 11 luật ERROR (`E10` = cổng cài đặt, `E11` = thiếu `summary` làm console mất title) + 9 luật WARN | 31 ca |
| `tools/fe-gate.mjs` | **Gate chất lượng**: bắt thứ được khai báo mà không tồn tại (font/ảnh 404, `dist/` cũ hơn source) | 18 ca |
| `tools/bug-radar.mjs` | Phần thuần tính toán của radar buglist: bug nào mới, của ai, lượt này có đáng gọi `claude` không | 78 ca |
| `tools/radar-tick.mjs` | Một lượt radar nền: gọi `/daily delta` trong phiên headless, ghép 1 lượt janitor/ngày | 28 ca |
| `tools/janitor.mjs` | Dọn rác nặng. Chỉ tự xoá thứ **tải lại được**; thứ mất là mất luôn thì chỉ BÁO. Sổ hoàn tác `.janitor-log.jsonl`, xem trước bằng `--dry` | 49 ca |
| `tools/statusline.mjs` | Cảnh báo mốc + số bug chờ duyệt ngay trên thanh trạng thái. Hàm thuần, **không** gọi git/mạng | có |
| `tools/build-dashboard.mjs` | Sinh khối `DATA` của `dashboard.html` **từ `state.json`** | có |
| `tools/psd-tree.py` | Dump cây layer PSD/PSB — `/check-design` gọi ở bước soát tầng file | — |
| `tools/baked-text-guard.py` | Bắt lỗi **chữ lồng chữ**: text vừa bake trong ảnh vừa render bằng HTML. Build PASS, console sạch, checker qua — chỉ mắt người mới thấy | — |
| `tools/sp-diff.mjs` | So 2 manifest cũ ↔ mới để biết designer sửa/thêm/xoá file gì | — |

## Cổng chất lượng trước khi báo xong

```bash
node tools/fe-gate.mjs <dist> --design designs/<KEY> --json knowledge/gates/<KEY>.json --lessons knowledge/lessons.md
node tools/fe-gate.test.mjs
```

Nó bắt loại lỗi mà build, console browser và design-checker **đều trượt**: thứ được khai báo mà
không tồn tại. Ca gốc: clone khung cũ nên thiếu 8 font của design mới — build 0 error, 2 checker
PASS, browser fallback im lặng. Exit ≠ 0 = còn ERROR ⇒ không được dùng chữ "xong".

## Guardrails cơ học

Luật văn xuôi thì agent có thể quên; hook thì không.

```bash
bash hooks/guard-bash.test.sh    # PreToolUse, matcher Bash
bash hooks/guard-read.test.sh    # PreToolUse, matcher Read|Grep
bash hooks/guard-style.test.sh   # PostToolUse, matcher Write|Edit
bash hooks/guard-state.test.sh   # PostToolUse, matcher Write|Edit|Bash
```

- **deny** — `rm -rf /` và `$HOME` · `curl | sh` · force-push nhánh chung · câu lệnh xoá bảng/DB ·
  đọc secret (`.env`, `id_rsa`, `~/.ssh`, `~/.aws`, `*.pem`) trên cả `Read` lẫn `Grep`.
- **ask** — `git push` (bước đi ra ngoài, hỏi từng lần) · `git reset --hard` / `clean -fd` /
  `stash drop` (xoá diff chưa review) · script deploy · `rm` nhắm `designs/`, `state.json`, `boards/`.
  Riêng `git commit` **không** chặn: commit local còn amend/reset/revert được, hỏi từng lần chỉ ngắt luồng.
- **cảnh báo, không chặn** — `guard-style.sh` đếm comment thừa trong **đoạn vừa ghi** (không soi cả
  file) theo `R-CS-1`, chỉ file code frontend, bỏ `dist/` và `node_modules/`. Whitelist 2 tầng:
  `pm__`/`eslint-disable`/`@ts-` được tha; tên trình duyệt chỉ được tha khi dòng có dấu hiệu vấn đề
  thật. Hook chỉ đo được `R-CS-1`, các luật còn lại là tự giác.
- **cảnh báo, không chặn** — `guard-state.sh` so `mtime` của `state.json`, đổi thì chạy `state-doctor`
  và trả ERROR về cho model sửa **ngay trong lượt**. Bám cả `Bash` vì `state.json` bị ghi bằng
  python/jq nhiều như bằng `Edit`; `mtime` chưa đổi thì không nạp node nên gần như không tốn gì.
- Cố ý **không** chặn: `.env.test`, `rm -rf node_modules|dist`, `ls | grep '^\.env'` — chặn oan làm
  luồng tệ hơn, nên mỗi test có cả nhóm ca "phải ALLOW".
- Overhead đo thật: **6,5 ms/lệnh Bash · 4,9 ms/Read** (một tool call vốn tốn hàng trăm ms).
- `permissions.deny` dạng `Read(**/…)` trong user-settings **không** khớp path tuyệt đối — đó là lý
  do dùng hook chứ không dùng deny rule.

## Ranh giới an toàn

- Skill **không** commit, **không** push, **không** ghi gì lên Jira — user review diff và tự đẩy.
- Console chỉ ghi 4 chỗ: board (tick "Cần bạn" và thêm dòng mới), `knowledge/metrics.jsonl`,
  `history/phases.jsonl`, `tasks/<KEY>/handoff.md`. Mọi chỗ khác **chỉ đọc**. Mỗi lần ghi đều
  snapshot vào `.backups/` (giữ 30 bản).
- `designs/` và `.backups/` không vào git: rất nặng, mà tải lại được từ nguồn.
