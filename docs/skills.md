# 11 skill + 5 agent

Gọi bằng `/<tên skill>` trong Claude Code. Skill nạp lúc khởi động phiên, nên cài xong phải mở
phiên mới.

## Điều phối

| Skill | Mode | Làm gì |
|---|---|---|
| `/daily` | *(mặc định)* | Quét Jira → bóc design đã giao → suy phase từ commit thật → trình kế hoạch duyệt 1 lần → chạy → cập nhật board + console |
| | `plan` | Chỉ quét + trình kế hoạch, KHÔNG thực thi |
| | `week` | Kế hoạch 14 ngày + cảnh báo dồn deadline |
| | `prep <KEY>` | Chuẩn bị sâu 1 ticket (brief + dò design), không code |
| | `add <link>` | Nhận việc ngoài Jira thành task ADHOC |
| | `link <KEY> <repo> <path>` | Gắn ticket với folder làm việc — nền của phase thật + metrics |
| | `delta` | Radar quét nhanh thay đổi Jira + folder chiến dịch |
| | `bugwatch` / `bugwrite` | Radar buglist hậu bàn giao / xả hàng đợi ghi ngược sheet |
| | `wrap` | Chốt ngày, soạn standup, ghi metrics |
| | `status` / `doctor` | Xem board hôm nay / chạy `state-doctor` và tự sửa cái sửa được |

Vòng đời phase mỗi ticket: `🕐 chờ-design → 📐 sẵn-sàng → 💻 đang-code → 📦 giao-HTML →
🧪 chờ-test → 🐛 fix-bug → ✅ xong-FE`.

## Code frontend

| Skill | Mode | Làm gì |
|---|---|---|
| `/code-developer` | `quick` | ≤4 file, chỗ sửa đã rõ — manager tự sửa, 0 subagent |
| | `mid` | Việc vừa, không tín hiệu đỏ — 1 dev + manager verify |
| | `full` | Trọn team agent: analyst → dev → checker |
| | `code` / `fix` / `check` / `design` / `compare` / `batch` / `learn` | Từng chặng riêng |
| `/clean-code` | *(mặc định)* | Dọn **diff chưa commit** theo `rules/code-style.md` rồi build verify |
| | `full <path>` | Dọn cả folder |
| `/code-audit` | *(mặc định)* | Soi **diff** (uncommitted + commit chưa push) trên 5 trục |
| | `full [path]` | Soi cả project |
| `/commit` | | Conventional Commits + footer co-author |

## Kiểm chất lượng

| Skill | Làm gì | Chạy trên |
|---|---|---|
| `/check-design` | Design đã giao có đủ để dựng chưa — đủ file nguồn, đủ màn, đủ trạng thái; xuất block đòi PM | ảnh + PSD đã tải về |
| `/ui-check` | Ảnh 404, chữ bị cắt, tràn ngang, lệch design | **output đã build** (`dist/`), qua browser thật |
| `/check-promotion` | HTML landing đã đủ popup và cấu trúc popup theo loại chiến dịch | file HTML |
| `/website-audit` | Validation, performance, ảnh, font, SEO, sitemap, robots | static output / source repo / URL đang chạy |

## Buglist QC

| Skill | Mode | Làm gì |
|---|---|---|
| `/bug-fixer` | `auto` *(mặc định)* | Dán link là tự fix bug của mình theo ma trận Vùng × Bug Type, báo bug asset, ghi Done — không chặn luồng |
| | `turbo` | Cùng tiêu chí, song song cả 3 chặng, chấp nhận tốn token |
| | `full` / `triage` / `fix` / `report` | Trọn luồng có cổng duyệt / chỉ lọc / chỉ fix / chỉ ghi ngược |
| `/bug-fixer-lite` | *(mặc định)* | Bản gọn, chạy 1 lệnh: triage ngay, fix song song theo cụm file không giao nhau, 1 build, 1 lượt verify, ghi ngược sheet qua extension Chrome |
| | `turbo` / `report` | Lift cap song song / chạy lại riêng bước ghi sheet |

`/bug-fixer-lite` phải chạy trong **phiên CLI** — panel VS Code không nạp toolset Chrome nên bước
ghi sheet fail.

## 5 agent

Skill ở trên tự gọi, bạn không gọi trực tiếp. Installer symlink `agents/*.md` vào `~/.claude/agents/`.

| Agent | Vai trò | Được ai gọi |
|---|---|---|
| `design-analyst` | Ảnh design → Design Spec có cấu trúc. Không viết code | `/code-developer` |
| `frontend-developer` | Spec → code, tự verify bằng lint/type-check | `/code-developer` |
| `design-checker` | So code với spec/ảnh, báo sai lệch kèm `file:line`. Không sửa code | `/code-developer`, `/bug-fixer` |
| `bug-analyst` | Điều tra từng bug bằng cách đọc code thật → bug-board | `/bug-fixer` |
| `bug-lane` | Nhận 1 cụm bug, điều tra + tự fix trong 1 context | `/bug-fixer-lite` |

## 4 hook guardrail

Không phải skill — chạy tự động ở tầng harness, xem [architecture.md](architecture.md#guardrails-cơ-học).

| Hook | Khi nào | Làm gì |
|---|---|---|
| `guard-bash.sh` | PreToolUse `Bash` | chặn lệnh phá hoại, hỏi trước với lệnh đi ra ngoài |
| `guard-read.sh` | PreToolUse `Read\|Grep` | chặn đọc file secret |
| `guard-style.sh` | PostToolUse `Write\|Edit` | cảnh báo comment thừa trong đoạn vừa ghi (R-CS-1) |
| `guard-state.sh` | PostToolUse `Write\|Edit\|Bash` | `state.json` đổi thì chạy `state-doctor` ngay |
