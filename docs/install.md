# Cài đặt chi tiết

Bản 5 bước ngắn ở [README](../README.md). File này là phần tra cứu: thiếu cái gì thì gãy ở đâu,
bảng `config.json` đầy đủ, 4 ca của `settings.json`, radar nền, và cách gỡ cài.

## Phụ thuộc — thiếu thì gãy ở đâu

| Cần | Vì sao | Thiếu thì |
|---|---|---|
| **Claude Code bản CLI** | skill + hook là cơ chế của Claude Code | panel VS Code không nạp toolset Chrome ⇒ bước ghi ngược sheet của `/bug-fixer-lite` fail |
| **Node.js ≥ 18** | console, `state-doctor`, statusline, các tool đo | installer báo ngay dòng "chưa có node"; bỏ qua luôn bước ghi hook |
| **Python 3 + `psd-tools`** | `/check-design` dump cây layer PSD/PSB trước khi dám kết luận "thiếu design" | `/check-design` gãy ở bước dump: `ModuleNotFoundError: psd_tools` — không phải lỗi design |
| **Đã clone sẵn repo code** | `config.repos` phải trỏ vào chúng | `/daily doctor` báo `W7 repos[...] không có trên đĩa`; không suy được phase từ commit |
| **Quyền vào folder design** của designer | có quyền mới search/tải được | `/daily` báo chưa tải được design, không chết |
| **Browser mặc định đã login SSO** | nhánh tải design dùng session sẵn có của bạn | tải về tab trắng, rơi xuống fallback "mở tay" |
| `cd console && npm install` | `npm start` = `build && serve`, **không** tự install | webpack chết ngay lệnh đầu, thông báo không nói gì về nguyên nhân |

## MCP / extension nào phải nối

Chỉ **Atlassian** là bắt buộc. Còn lại thiếu thì mất đúng một nhánh, không chết cả skill.

| Kết nối | Bật thế nào | Ai gọi tới | Thiếu thì |
|---|---|---|---|
| **Atlassian** | `/mcp` → authenticate | `/daily` quét Jira · `/check-design` đọc description + comment · radar nền | `/daily` chết ngay bước quét |
| **Microsoft 365** | `/mcp` → authenticate | dò design trên SharePoint/OneDrive | mất nấc "design đã giao chưa" tự động; vẫn còn nhánh bóc link trong ticket |
| **Google Drive** | `/mcp` → authenticate | radar đọc buglist Google Sheets, quét design host Drive | 2 nhánh này **im lặng không báo** — radar vẫn chạy nhưng không thấy gì |
| **Claude in Chrome** | `/chrome` → *Enabled by default*, 1 lần cho mọi phiên | tải cả folder design · ghi ngược sheet QC | phải tải design tay; `/bug-fixer-lite` không ghi được sheet |
| **Playwright MCP** *(chọn 1 trong 2)* | `claude mcp add playwright -- npx @playwright/mcp@latest` | `/ui-check` — mỗi action 1 call | thiếu cả 2 thì `/ui-check` không chạy được lớp browser |
| **browserpilot** *(chọn 1 trong 2)* | MCP local, phải build 1 lần rồi `claude mcp add` | `/ui-check` bản gốc: 1 call chạy cả script | như trên |

Extension Chrome ghép theo **account Claude** — 1 profile browser cho 1 account. Edge trên macOS
chưa hiện trong danh sách chọn.

## `config.json` — từng trường

`install-skills.sh` copy `config.example.json` → `config.json`. File này **không vào git**, mỗi máy
một bản. Ba trường đầu là **bắt buộc**; để nguyên `<...>` thì `/daily doctor` báo `E10` chứ không
báo xanh giả.

| Trường | Lấy ở đâu | Để nguyên mẫu thì sao |
|---|---|---|
| `cloudId` | hỏi Claude *"cho tôi cloudId Jira"* (cần MCP Atlassian) | `E10`, không quét được Jira |
| `gitAuthor` | `git config user.email` của chính bạn | `E10`, tab "Git của tôi" + metrics đếm nhầm commit người khác |
| `repos.*` | đường dẫn **tuyệt đối** tới repo đã clone. Key là **tên logic**, đặt gì cũng được miễn khớp với chỗ skill nhắc | `E10` (còn `<...>`) hoặc `W7` (trỏ chỗ không tồn tại) |
| `siteUrl` | host Jira của bạn — chỉ để dựng link ticket | link ticket sai host |
| `jql` | mặc định `assignee = currentUser() AND statusCategory != Done`; sửa nếu bạn theo project khác | không sao |
| `jqlConfirmed` | để `false` — lần chạy đầu `/daily` hỏi xác nhận JQL 1 lần rồi tự set `true` | không sao |
| `jqlRecentDone` | nhánh quét 2: ticket đã đóng ở mốc HTML nhưng còn mốc test/release phía sau | không sao |
| `gameMap` | `nexusId` (3 ký tự đầu tên folder chiến dịch) → mã sản phẩm. Bản mẫu để rỗng, gặp cái mới thì bổ sung | ticket của sản phẩm lạ không nối được với folder |
| `bugSheets` | để `{}` — `/daily` tự bóc link sheet trong comment Jira | không sao |
| `dashboardUrl` | để trống lần đầu; publish dashboard xong thì dán URL vào đây | mỗi lần chạy đẻ một URL mới |
| `radar.*` | chỉ đụng khi bật radar nền. `tickEveryMin` phải khớp `StartInterval` trong `tools/radar-agent.plist`; `everyMin` là nhịp lượt ĐẦY ĐỦ (console suy ngưỡng "radar chết" = 2,5 nhịp từ số này) | radar không chạy, hoặc console tưởng radar chết |
| `bugRadar.*` | radar buglist hậu bàn giao. `autoFix` mặc định `false` — bật lên thì radar tự gọi `/bug-fixer-lite` khi qua đủ 4 cổng sở hữu. `coolAfterHours` giãn nhịp sheet nguội · `maxSheetReadsPerTick` trần đọc sheet/lượt · `freshFirstScanHours` mốc coi sheet là "nóng" | để nguyên là chạy đúng thiết kế; `enabled: false` tắt hẳn nhánh này |
| `janitor.*` | dọn rác nặng, ghép trong radar 1 lượt/ngày. Chỉ tự xoá thứ **tải lại được** | `enabled: false` thì `designs/_raw/` phình dần |
| `notify` · `adhocCounter` | để nguyên | không sao |

Dữ liệu công việc của bạn không nằm trong `config.json` mà sinh dần khi dùng: `state.json`,
`boards/`, `tasks/`, `designs/`, `history/`. Cặp ticket ↔ folder code do `/daily` hỏi 1 lần rồi
nhớ, hoặc gắn thẳng bằng `/daily link <KEY> <repo> <path>`.

## Hook trong `settings.json` — 4 ca

`settings.json` là file của **bạn**, có thể đã có hook khác. Script tự phân loại rồi chỉ ghi ở ca
chắc chắn an toàn, và chỉ khi có `--write-hooks`:

| Ca | Script làm gì |
|---|---|
| chưa có file / chưa có hook nào | ghi 4 hook + `statusLine`, backup 1 lần ra `settings.json.bak-before-agent-auto` |
| đã có hook của agent-auto trỏ đúng repo | báo xanh, không đụng |
| đã có hook của **thứ khác** | **không đụng**, in khối JSON để bạn gộp tay |
| file không phải JSON hợp lệ | **không đụng**, yêu cầu sửa tay trước |

Đường dẫn bash trong hook lấy từ `command -v bash` nên đúng cả macOS (`/bin/bash`) và Git Bash
trên Windows. Kiểm hook chạy được: `bash hooks/guard-bash.test.sh` (phải `pass` hết, `0 fail`).

`~/.claude/CLAUDE.md` (luật chung: routing việc → skill, code style, git, verify) sinh từ
`templates/CLAUDE.md`. Đã có file riêng thì installer **không đè** — xem phần cần dán bằng:

```bash
bash tools/install-skills.sh --print-claude-md
```

Bảng `rules/` trong đó chỉ in dòng nào có **file thật** trong `rules/`, nên bản không mang đủ
rules sẽ không trỏ vào hư không.

## Radar nền (chỉ macOS)

```bash
bash tools/radar-install.sh install|uninstall|status|kick
```

`tools/radar-agent.plist` ghi cứng đường dẫn máy người tạo — **sửa 4 dòng path** trước khi cài,
nếu không `launchd` `cd` vào thư mục không tồn tại rồi **chết âm thầm** (`launchctl print` vẫn thấy
job, chỉ khác `last exit`). `radar-install.sh` chặn trước: đếm đủ 4 dòng path và thử `node`/`claude`
trong đúng login shell mà launchd sẽ dùng.

Tắt tạm thì đặt `config.radar.enabled = false`, đừng gỡ job.

## Gỡ cài

```bash
rm ~/.claude/skills/<tên>            # chỉ là symlink, xoá không mất gì trong repo
rm ~/.claude/hooks/guard-*.sh
rm ~/.claude/agents/*.md
```

Rồi bỏ khối `hooks` + `statusLine` trong `~/.claude/settings.json` (hoặc khôi phục từ
`settings.json.bak-before-agent-auto`). Dữ liệu của bạn nằm trong repo (`state.json`, `boards/`,
`tasks/`) — xoá repo là xoá luôn, cân nhắc backup trước.

## Lỗi thường gặp

| Hiện tượng | Nguyên nhân |
|---|---|
| Gõ `/daily` không thấy skill | chưa mở **phiên mới** sau khi cài (skill nạp lúc khởi động) |
| `git pull` không cập nhật skill | `~/.claude/skills/*` là thư mục thật chứ không phải symlink — trên Windows do chưa bật Developer Mode / `MSYS=winsymlinks:nativestrict` |
| `/daily doctor` báo `E10` | `config.json` còn placeholder `<...>` |
| `/daily doctor` báo `W7` | `repos.*` trỏ đường dẫn không tồn tại trên máy |
| Console chết ngay lệnh đầu | chưa `npm install` trong `console/` |
| `npm install` chết ở `node-pty` | macOS: `xcode-select --install`; Windows: Visual Studio Build Tools (C++) |
| Radar cài rồi mà không chạy | `radar-agent.plist` còn trỏ đường dẫn máy khác, hoặc `config.radar.enabled = false` |
