# agent-auto — nhà của bộ điều phối `/daily`

Skill **và** dữ liệu vận hành của `/daily`. Skill nằm ngay trong repo (`skills/`);
`~/.claude/skills/…` chỉ là symlink trỏ vào đây, nên `git pull` là có bản skill mới.

## Yêu cầu trước khi cài

| Cần | Vì sao | Thiếu thì gãy ở đâu |
|---|---|---|
| **Claude Code** (CLI, không phải VS Code panel) | skill + hook đều là cơ chế của Claude Code | panel không nạp toolset Chrome ⇒ bước ghi sheet của `/bug-fixer-lite` fail |
| **Node.js** | console, `state-doctor`, script SharePoint | installer báo ngay dòng "chưa có node" |
| **Python 3 + `pip install psd-tools`** | `/check-design` bắt buộc dump cây layer PSD/PSB trước khi dám kết luận "thiếu design" (`tools/psd-tree.py`) | `/check-design` gãy ở bước dump — `ModuleNotFoundError: psd_tools`, không phải lỗi design |
| **MCP + extension browser** — xem bảng ["MCP nào phải kết nối"](#mcp--extension-nào-phải-kết-nối) ngay dưới (chỉ Atlassian là bắt buộc) | quét Jira · dò/tải design · `/ui-check` | tuỳ cái, xem cột cuối bảng đó |
| **Đã clone sẵn các repo code** (`cdn-source`, `new-mainsite`…) | `config.repos` phải trỏ vào chúng | `/daily doctor` báo `W7 repos[...] không có trên đĩa` |
| **Quyền SharePoint** của designer (folder design được share cho bạn) | có quyền mới search/tải được | `/daily` báo chưa tải được design, không chết |
| **Browser mặc định là Edge/Chrome đã login SSO** | nấc tải design `open -a <browser> <direct-url>` dùng session sẵn có của bạn | tải về tab trắng / rơi xuống fallback "mở tay", không chết |
| `cd console && npm install` (chỉ khi dùng console) | `npm start` = `build && serve`, **không** tự install | webpack chết ngay lệnh đầu, thông báo không nói gì về nguyên nhân |
| Sửa tay 4 dòng đường dẫn trong `tools/radar-agent.plist` (chỉ khi muốn radar nền) | plist ghi cứng đường dẫn máy người tạo, `radar-install.sh` copy nguyên xi | launchd `cd` vào thư mục không tồn tại rồi **chết âm thầm**. `radar-install.sh` chặn trước: đếm đủ 4 dòng path + thử node/claude trong đúng login shell mà launchd sẽ dùng |

**Tự chuẩn bị trước — không script nào kiểm hộ được:** account Jira đã được add vào project GW
(`vnggames.atlassian.net`) · quyền SharePoint vào folder design của designer · Claude Code bản đủ
mới (skill + hook + `claude -p` headless) và ngân sách token cho radar (~$1/lượt).

Không có Atlassian MCP / SharePoint thì phần lớn `/daily` vẫn chạy (board, phase, gate, console) —
chỉ mất nhánh quét Jira và tải design.

### MCP / extension nào phải kết nối

Chỉ **Atlassian** là bắt buộc; những cái còn lại thiếu thì mất đúng một nhánh, không chết cả skill.
Riêng phần browser cho `/ui-check`: **chọn 1 trong 2** — Playwright MCP (cài 1 lệnh, không cần
build) hoặc browserpilot (phải build, nhưng ít call hơn hẳn). Có sẵn Playwright thì dùng luôn,
đừng cài thêm.

| Kết nối | Bật thế nào | Skill nào gọi tới | Thiếu thì |
|---|---|---|---|
| **Atlassian** (connector) | `/mcp` → authenticate | `/daily` quét Jira (`searchJiraIssuesUsingJql` · `getJiraIssue`) · `/check-design` đọc description + toàn bộ comment · `tools/radar-tick.mjs` | `/daily` chết ngay bước quét, không có thông báo gợi ý |
| **Microsoft 365** (connector) | `/mcp` → authenticate | dò design trên SharePoint/OneDrive (`sharepoint_search` · `sharepoint_folder_search`) | mất nấc "design đã giao chưa" tự động — vẫn còn nhánh bóc link trong ticket |
| **Google Drive** (connector) | `/mcp` → authenticate | radar nền đọc buglist Google Sheets (`tools/bug-radar.mjs`) + quét design host Drive (`/daily delta` bước 5) | bug-radar và nhánh Drive của designwatch **chết im lặng** — radar vẫn chạy nhưng không thấy gì |
| **Claude in Chrome** (extension) | `/chrome` → chọn *Enabled by default* đúng 1 lần, mọi phiên sau tự nối. ⚠ ghép theo **account Claude** — 1 profile browser/1 account; Edge trên macOS chưa hiện trong danh sách | tải **cả folder** design 4 bước (`skills/daily/scripts/sp-scan.js` · `sp-fetch.js` chạy qua `javascript_tool`) · `/bug-fixer-lite` ghi ngược sheet QC | phải tải design tay; `/bug-fixer-lite` không ghi được sheet (VS Code panel cũng vướng chỗ này) |
| **Playwright MCP** — *cách nhanh, chọn 1 trong 2* | `claude mcp add playwright -- npx @playwright/mcp@latest` (không phải build gì) | `/ui-check` chạy theo bảng đổi tool ở mục *"Máy không có browserpilot? — fallback Playwright MCP"* trong `skills/ui-check/SKILL.md` — mỗi action 1 call | thiếu cả 2 thì `/ui-check` không chạy được Lớp 1 |
| **browserpilot** (MCP local, repo anh em trong cdn-source) — *cách gọn call, chọn 1 trong 2* | `cd <cdn-source>/products/tontagent/browserpilot && npm install && npm run build` rồi `claude mcp add browserpilot -- node $(pwd)/dist/index.js` — `dist/` **không vào git** nên bắt buộc build 1 lần | `/ui-check` bản gốc: mở `dist/`, đổi viewport PC↔mobile, chạy nguyên script Lớp 1 1 call, đọc 404/console | như trên |

## Cài đặt (member mới)

Bản phát hành đi kèm **cdn-source** (`products/tontagent/`): agent-auto (từ 19/8 đã gồm đủ
`/code-developer`, `/bug-fixer`, `/code-audit`, `/website-audit`, `/commit` + 4 agent),
browserpilot, bug-fixer-lite. Đã pull cdn-source là chạy được phần dưới:

```bash
bash <cdn-source>/products/tontagent/agent-auto/tools/install-skills.sh
```

Hoặc clone repo agent-auto riêng, nếu bạn muốn tách khỏi cdn-source:

```bash
git clone <url> ~/VNG/agent-auto      # clone chỗ nào cũng được, script tự dò
bash ~/VNG/agent-auto/tools/install-skills.sh
```

Chọn **một** trong hai và dùng nhất quán: thư mục chứa `tools/install-skills.sh` chính là
`AGENT_AUTO` — nơi `/daily` ghi `boards/`, `tasks/`, `state.json` của bạn. Cài cả hai thì symlink
`~/.claude/skills/*` chỉ trỏ được vào bản chạy sau cùng, dữ liệu bên kia thành mồ côi.

Script symlink `skills/` + `hooks/` vào `~/.claude/`, rồi tạo `config.json` + `state.json` từ
bản `.example.json`. Nó **không xoá gì** và **không sửa `settings.json`** của bạn — gặp thư mục
thật trùng tên thì đổi tên `.bak-<n>` rồi mới link. Chạy `--check` để xem trước, không đụng gì.

Sau đó còn 5 việc — installer in sẵn danh sách này (đúng thứ tự, kèm trạng thái máy bạn):

1. **Kết nối MCP** (gõ `/mcp`): **Atlassian** (bắt buộc — `/daily` quét Jira) · **Google Drive**
   (radar đọc buglist sheet + design host Drive) · Microsoft 365 (dò SharePoint). Làm TRƯỚC —
   bước 2 cần MCP để lấy cloudId.
2. **Sửa `config.json`** — đúng 3 chỗ: `cloudId` (hỏi Claude *"cho tôi cloudId Jira"* — nó gọi
   MCP vừa auth), `gitAuthor` (= `git config user.email`), `repos` (đường dẫn tuyệt đối trên máy
   bạn). Để nguyên placeholder là `/daily doctor` báo `E10`, không báo xanh giả.
3. **Bật hook + statusline** — chạy lại kèm `--write-hooks`: script ghi hộ `settings.json`
   (backup 1 lần ra `settings.json.bak-before-agent-auto`, kèm luôn key `statusLine`). Nó chỉ
   ghi khi **chắc chắn an toàn**: chưa có hook nào (soi cả `PreToolUse` lẫn `PostToolUse`);
   đã có hook của thứ khác thì không đụng, chỉ in khối JSON để bạn gộp tay.
   Kiểm bằng `bash hooks/guard-bash.test.sh` (phải `58 pass · 0 fail`) — xem cả 4 hook ở mục
   ["Guardrails cơ học"](#guardrails-cơ-học-hook).
4. **Trỏ `~/.claude/CLAUDE.md` vào `rules/`** — installer in sẵn **khối markdown dán được**
   (đường dẫn đã điền), chỉ việc dán vào cuối file. Thiếu bước này thì `rules/` nằm im: agent
   không biết đọc `R-PM-*`, `R-TWIG-*`… trước khi sửa file. (Bản global CLAUDE.md đầy đủ —
   routing loại việc, luật `pm__`, git/verify — hiện do người bảo trì cấp; khối rules là phần
   tối thiểu phải có.)
5. **Mở phiên Claude Code mới** (skill chỉ nạp lúc khởi động) rồi gõ `/daily doctor` —
   phải ra **0 ERROR** thì mới thật sự xong.

### Cấu hình cá nhân — `config.json`

`install-skills.sh` copy `config.example.json` → `config.json` (file này **không vào git**, mỗi máy
một bản). Ba trường đầu bảng là **bắt buộc**; để nguyên placeholder `<...>` thì `/daily doctor` báo
`E10` chứ không báo xanh giả.

| Trường | Lấy ở đâu | Để nguyên mẫu thì sao |
|---|---|---|
| `cloudId` | hỏi Claude *"cho tôi cloudId Jira"* — nó gọi MCP `getAccessibleAtlassianResources` | `E10`, `/daily` không quét được Jira |
| `gitAuthor` | `git config user.email` của chính bạn | `E10`, tab "Git của tôi" + metrics effort đếm nhầm commit người khác |
| `repos.*` | đường dẫn **tuyệt đối** tới repo đã clone trên máy bạn | `E10` (còn `<...>`) hoặc `W7` (trỏ chỗ không tồn tại) → `/daily` không suy được phase từ commit |
| `jql` | mặc định `assignee = currentUser() AND statusCategory != Done` — dùng được ngay, sửa nếu bạn theo project khác | không sao |
| `jqlConfirmed` | để `false` — lần chạy đầu `/daily` hỏi xác nhận JQL đúng 1 lần rồi tự set `true` | không sao |
| `jqlRecentDone` | nhánh quét 2: ticket đã đóng ở mốc HTML nhưng còn mốc test/release | không sao |
| `siteUrl` | `https://vnggames.atlassian.net` — chỉ để dựng link ticket | link ticket sai host |
| `gameMap` | nexusId (3 ký tự đầu tên folder gt-promotion) → mã game; **dùng chung cả team**, gặp game mới thì bổ sung rồi commit `config.example.json` | ticket của game lạ không nối được với folder gt-promotion |
| `bugSheets` | để `{}` — `/daily` tự bóc link sheet trong comment Jira; điền tay khi game có sheet cố định | không sao |
| `dashboardUrl` | để trống lần đầu; publish dashboard xong thì **dán URL artifact vào đây** (skill đọc trường này để redeploy đúng 1 URL, chưa tự ghi ngược) | mỗi lần chạy đẻ một URL dashboard mới |
| `notify` · `adhocCounter` | để nguyên | không sao |
| `radar.*` | chỉ đụng khi bật radar nền (`tools/radar-install.sh`); `tickEveryMin` phải khớp `StartInterval` trong `tools/radar-agent.plist`, `everyMin` là nhịp lượt ĐẦY ĐỦ (console suy ngưỡng "radar chết" = 2,5 nhịp từ số này) | radar không chạy / console tưởng radar chết |
| `bugRadar.*` | radar buglist hậu bàn giao. **`autoFix` mặc định `false`** (đổi 19/8 — bật SAU khi đã cài `bug-fixer-lite`, installer có kiểm): bật lên thì thấy bug mới của mình, qua đủ 4 cổng sở hữu là radar **tự gọi `/bug-fixer-lite` sửa**, không hỏi. `coolAfterHours: 3` (sheet nguội thì giãn nhịp) · `maxSheetReadsPerTick: 3` (trần đọc sheet mỗi lượt, chống nổ token) · `freshFirstScanHours: 24` (sheet mới hơn ngần này mới coi là nóng; sheet cũ chỉ nạp làm nền, KHÔNG nã lại cả list) | để nguyên là chạy đúng như thiết kế; `enabled: false` thì tắt hẳn nhánh này |
| `janitor.*` | dọn rác nặng, chạy ghép trong `radar-tick` (1 lượt/ngày). `donePhases` + `graceDays: 7` = ticket xong bao lâu thì được dọn · `heavyDirs` (`_raw`/`_src`) · `cacheKeepDays: 14` · `backupsKeepPerFamily: 10` · `archiveKeepDays: 30` với `archiveAutoDelete: false` (hết hạn thì chỉ BÁO). Chỉ tự xoá thứ **tải lại được** (có `sp-manifest.json` hoặc `designLink`) | để nguyên là an toàn; `enabled: false` thì `designs/_raw/` phình dần |

**Dữ liệu riêng của bạn** không nằm trong `config.json` mà sinh dần khi dùng: `state.json`
(ticket đã thấy, phase, mốc, `paths` nối ticket ↔ folder code, `design`, `bugSheets`) ·
`boards/` · `tasks/` · `designs/` · `history/`. Cặp ticket ↔ folder làm việc do `/daily` **hỏi 1
lần rồi nhớ**, hoặc gắn thẳng bằng `/daily link GW-xxx <repo> <path>`.

Kiểm cả cụm bằng `/daily doctor` — **0 ERROR** mới là cài xong. Đổi máy/đổi chỗ clone repo thì chỉ
cần sửa lại `repos.*` rồi chạy lại doctor.

**Đọc tới đây là đủ để DÙNG.** Phần dưới là tài liệu tra cứu (cấu trúc repo, tool, guardrails) —
không phải bước cài.

### Cái gì vào git, cái gì không

Repo là **công cụ dùng chung**; board/task/state là việc của **riêng từng dev** — track chúng thì
mỗi lần hai người chạy `/daily` là đụng nhau trên cùng file.

| Vào git | Không vào git (`.gitignore`) |
|---|---|
| `skills/` · `hooks/` · `rules/` · `tools/` · `console/` · `schema/` · `docs/` | `state.json` · `config.json` · `dashboard.html` |
| `knowledge/lessons.md` — bài học chung, đáng để cả team đọc | `boards/` · `tasks/` · `history/` · `knowledge/gates/` · `knowledge/metrics.jsonl` |
| `*.example.json` — bản mẫu để script sinh file thật | `designs/` (rất nặng, tải lại từ SharePoint được) |

Các thư mục dữ liệu vẫn còn sau khi clone nhờ `.gitkeep`, chỉ là rỗng.

### Skill trong repo này

| Skill | Vì sao ở đây |
|---|---|
| `/daily` | bộ điều phối chính — đọc/ghi `config.json`, `state.json`, `boards/`, `tasks/` |
| `/check-design` | soát design đủ chưa — ghi `tasks/<KEY>/design-gap.md`, `state.issues[].design` |
| `/ui-check` | check output `dist/` — Bước 0a gọi `tools/fe-gate.mjs` của repo này |
| `/clean-code` | dọn code theo `rules/code-style.md` (R-CS-*) — cùng nguồn luật với hook `guard-style.sh` trong repo này |
| `/code-developer` | manager dựng UI (analyst → dev → checker) — `/daily` Bước 4 gọi thật; kèm 4 agent trong `agents/` |
| `/bug-fixer` | manager xử lý buglist bản full — routing global trỏ buglist QC vào đây |
| `/code-audit` | soi source trước merge/push — không sửa code |
| `/website-audit` | audit trước production (validation, ảnh, font, SEO) — bảng lệnh Bước 04 |
| `/commit` | chuẩn commit VNG (Conventional Commits + co-author) — bảng lệnh Bước 05 |

5 skill dưới + `agents/` copy về từ bản gốc cá nhân 19/8/2026 — **bản trong repo này là bản
team dùng** (installer symlink từ đây); bản gốc trên máy người bảo trì giữ nguyên làm nơi thử
nghiệm, sửa cho team thì sửa Ở ĐÂY.

`hooks/` là 4 guard + test của chúng: `guard-bash.sh` (PreToolUse, chặn lệnh nguy hiểm) ·
`guard-read.sh` (PreToolUse, chặn đọc secret) · `guard-style.sh` (PostToolUse `Write|Edit`, đếm
comment thừa theo R-CS-1) · `guard-state.sh` (PostToolUse `Write|Edit|Bash`, chạy `state-doctor`
ngay sau mỗi lần `state.json` đổi). Chúng bảo vệ chính `boards/` · `state.json` · `designs/` nên đi kèm repo.

### Skill ngoài repo (`/daily` có gọi tới)

| Skill | Repo | `/daily` dùng thế nào |
|---|---|---|
| `/bug-fixer-lite` | `cdn-source/products/tontagent/` — cài theo README ở đó | **soạn lệnh ra board** (mục *"Bước 3 — Phân loại + trình kế hoạch"*), và được radar buglist gọi thật ở mục *"Bug-radar"* khi qua đủ 4 cổng sở hữu |
| `/check-promotion` | `gt-promotion-template/standard-html-templates/ai-template-check-skill` (repo git team) | bảng lệnh Bước 04 — soát popup theo 39 loại promotion trước khi giao QA |

`install-skills.sh --check` kiểm hộ bug-fixer-lite (mục "Liên kết ngoài repo"). Phần quét Jira · suy phase · dò design ·
ghi board · `/daily plan|week|status|doctor` **không phụ thuộc** hai skill trên.
`/daily` chưa có nhánh xử lý riêng cho ca thiếu skill — mất `/code-developer` thì lỗi nổi lên ở
tầng tool, chưa được nuốt gọn thành cảnh báo.

## Daily Console — web local bọc terminal claude

```bash
cd ~/VNG/agent-auto/console
npm install                                # lần đầu thôi — `npm start` KHÔNG tự install
                                           # máy sạch cần Xcode CLT cho node-pty: xcode-select --install
npm start                                  # rồi mở http://127.0.0.1:4747
```

Phải `cd console` trước (gốc `agent-auto/` không có `package.json`). Cổng 4747 bận thì server
tự nhảy 4748/4749/… — xem cổng thật ở dòng `Daily Console  http://…` lúc khởi động.

**Trái** = cockpit 4 tab, tự refresh 3s. Trên cùng (ngoài mọi tab): **dải cảnh báo** — mốc giao hàng
còn ≤2 ngày mà phase chưa tới, quá mốc, task `coding` đứng yên ≥2 ngày, design đã giao chưa tải,
**nợ "Cần bạn" ở board cũ mà hôm nay không ai nhắc lại**. Ticket không có mốc `html`/`deliver` thì
lấy `duedate` làm mốc cảnh báo (trước 12/8 những ticket này im hoàn toàn — xem console/README).

| Tab | Nội dung |
|---|---|
| Hôm nay | KPI · mốc 14 ngày + cảnh báo dồn deadline · timeline Gantt · bảng task theo phase (`Gate`/`Push` + nút designs · questions · buglist · gt-promotion) · **Cần bạn tick được + ô ghi nhanh** · **Nợ đọng từ board cũ** (gom mọi mục chưa tick ở board cũ mà ticket vắng board hôm nay; tick ghi thẳng vào board GỐC) · log board (tô vàng dòng còn `HH:MM`, ghi log mới thì **giờ do server lấy**) |
| **Bấm tên task** | **Drawer 1 ticket**: mốc · nút `dev full`/`dev fix`/`check` (gõ hộ) · **chạy `fe-gate`** (console tự chạy) · **mở preview `dist/`** · **gallery ảnh design** + lightbox · **so ảnh design ↔ dist cạnh nhau** (khổ 1920 hoặc 768 theo tên ảnh, cuộn đồng bộ) · findings gate đầy đủ · commit · brief/questions |
| Review | Theo ticket: file chưa commit (bấm ra **diff có màu**) + **commit chưa push** + badge `fe-gate`. Nút **gõ hộ commit/push** — gõ vào terminal và KHÔNG Enter, bạn tự bấm |
| Theo tháng | Khối lượng task Jira từng tháng · board cũ · gt-promotion · metrics · **lead time từng phase** (dưới 3 mẫu thì in "chưa đủ dữ liệu", không bịa) · **bài học** |
| Git của tôi | CHỈ commit của bạn, mọi repo — bar theo ngày, tổng theo repo, list commit kèm shortstat |

Console **ghi** đúng 4 chỗ: board (tick "Cần bạn" qua `/api/board/check` — board hôm nay **hoặc
board cũ** khi đóng nợ đọng, và thêm dòng mới vào "Cần bạn"/"Log" qua `/api/board/append` — ô ghi
nhanh) · `knowledge/metrics.jsonl` (đo từ
git, 1 dòng/ngày/ticket) · `history/phases.jsonl` (khi thấy phase đổi) · `tasks/<KEY>/handoff.md`
(tick việc bàn giao khi ticket sang phase `reassigned`). Mọi chỗ khác chỉ đọc.
Mỗi lần ghi đều snapshot vào `.backups/` (giữ 30 bản). Console **không bao giờ** commit/push.
Nút **radar** trên toolbar chỉ **quét TAY 1 lượt ngay** trong tab đang mở (gõ hộ `/daily delta`).
Radar **nền** không nằm ở console: nó là job launchd cài bằng `tools/radar-install.sh`, mỗi nhịp
chạy `tools/radar-tick.mjs`. Đo thật 13/8 cho thấy phiên nền `claude -p` **vẫn còn token** connector
Jira (`docs/specs/2026-08-13-radar-auto-design.md` mục 2), nên câu cấm cron/launchd cũ đã bị bác bỏ.
Dải radar trên console chỉ hiển thị trạng thái + công tắc `config.radar.enabled` (không đụng
`launchctl` từ web).

**Phải** = **terminal thật** (nhiều tab, mỗi tab 1 shell): bấm `▶ claude` khởi động Claude Code
ngay trong web; các nút `/daily`, `plan`, `week`, `delta`, `wrap`, `status` chỉ GÕ HỘ lệnh vào
tab đang mở (bấm `▶ claude` trước). Mở nhiều tab để chạy song song (vd tab 1 code, tab 2
bug-fixer-lite). Mọi cổng duyệt, auth Jira/SharePoint, skill nguyên vẹn vì bản chất vẫn là CLI.
Ngoài 4 chỗ ghi kể trên, console **chỉ đọc** dữ liệu agent-auto.
Chi tiết source & cách thêm tính năng: [console/README.md](console/README.md).

## Dùng hàng ngày

```
/daily              # sáng: quét Jira + phase + promotion → duyệt 1 lần → chạy → board + dashboard
/daily plan         # chỉ quét + trình kế hoạch, KHÔNG thực thi (dry-run)
/daily week         # kế hoạch tuần 14 ngày + cảnh báo dồn deadline
/daily prep GW-xxx  # chuẩn bị sâu 1 ticket (brief + dò design), không code
/daily add <link>   # nhận việc ngoài Jira (nexus/sheet/text) thành task ADHOC
/daily link GW-xxx [repo path]   # gắn ticket với folder làm việc (nền của phase thật + metrics)
/daily delta        # radar quét nhanh thay đổi Jira + gt-promotion (radar nền tự gọi mode này)
/daily bugwatch     # radar buglist hậu bàn giao: soi sheet QC, bug mới thì kiểm 4 cổng sở hữu rồi tự fix
/daily bugwrite     # BẮT BUỘC để xả hàng đợi ghi ngược sheet: cổng duyệt rồi ghi Done lên sheet QC (cần phiên CLI có Chrome)
/daily wrap         # chiều: chốt ngày, soạn standup, ghi metrics
/daily status       # xem nhanh board hôm nay, không quét Jira
/daily doctor       # chạy state-doctor, tự sửa cái sửa được, báo cái không — không quét Jira
```

Vòng đời phase mỗi ticket: `🕐 chờ-design → 📐 sẵn-sàng → 💻 đang-code → 📦 giao-HTML
(chỉ task có folder gt-promotion) → 🧪 chờ-test → 🐛 fix-bug → ✅ xong-FE`.

Design đã giao → `/daily` **tự tải về** kho tập trung `designs/<KEY>/` (browser đã login → fallback
dò `~/Downloads`; idempotent qua `state.design`) rồi đề xuất **scaffold khung campaign**
trong bảng duyệt (clone campaign gần nhất cùng game — code-developer thực thi; KHÔNG cắt
ảnh từ PSD, ảnh thật user tự cắt). Spec: `docs/specs/2026-07-31-design-autodownload-scaffold-design.md`.

## Cấu trúc

| File/folder | Vai trò |
|---|---|
| `skills/` | 4 skill `/daily` · `/check-design` · `/ui-check` · `/clean-code`. `~/.claude/skills/*` chỉ là symlink trỏ vào đây → sửa skill = sửa file trong repo, commit được. |
| `hooks/` | 4 guard + test: `guard-bash.sh`·`guard-read.sh` (`PreToolUse`) + `guard-style.sh` (`PostToolUse` `Write\|Edit`) + `guard-state.sh` (`PostToolUse` `Write\|Edit\|Bash`, gác `state.json`). Cũng symlink sang `~/.claude/hooks/`. |
| `tools/install-skills.sh` | Cài 1 lệnh cho máy mới: symlink skill + hook, seed `config.json`/`state.json`. `--check` để xem trước. |
| `tools/sync-to-cdn.sh` | Phát hành bản mới sang `cdn-source/products/tontagent/agent-auto/`. |
| `config.json` | cloudId + JQL Jira, đường dẫn các repo. **Không vào git** (mỗi máy một bản) — mẫu ở `config.example.json`. `jqlConfirmed: false` → lần chạy đầu sẽ hỏi xác nhận 1 lần. |
| `state.json` | Ticket đã thấy lần trước → lần sau chỉ xử lý MỚI/ĐỔI/CÒN DỞ. **Không vào git** — mẫu ở `state.example.json`. |
| `schema/vocab.json` | **Nguồn vốn từ duy nhất** — phase · loại mốc · trạng thái design. Skill ghi phase đúng `id` trong file này, console (`server/lib/vocab.js`) đọc chính file này — không còn 3 nơi khai riêng (skill prose · `constants.js` · `phases.js`) như trước 2026-08-03. |
| `tools/state-doctor.mjs` | Validator CHỈ ĐỌC: `state.json` có đúng hợp đồng vocab không (11 luật ERROR E1-E11 — `E10` là cổng cài đặt, soi `config.json`; `E11` bắt thiếu `summary` vì console render title thành "—" — + 9 luật WARN W1-W9, trong đó `W8`/`W9` soi bug-radar: sheet buglist chưa gắn ticket nào, và hàng đợi ghi ngược sheet chưa xả). `tools/state-doctor.test.mjs` = 31 ca. |
| `boards/YYYY-MM-DD.md` | Board mỗi ngày: trạng thái từng task, log, mục "Cần bạn". |
| `tasks/<JIRA-KEY>/` | `brief.md` bóc từ ticket. |
| `designs/<JIRA-KEY>/` | Kho design tập trung: ảnh dùng được + `_raw/` (zip/PSD gốc) — /daily tự tải về đây. |
| `history/issues.jsonl` | Mỗi lần `/daily` quét Jira append 1 dòng/ticket → nguồn thống kê **theo tháng**. |
| `history/phases.jsonl` | 1 dòng mỗi lần phase 1 ticket đổi (skill ghi kèm lý do; console tự ghi khi quan sát thấy) → nguồn **lead time thật**. |
| `knowledge/metrics.jsonl` | Console tự ghi 1 dòng/ngày/ticket **đo từ git**; `wrap` chỉ thêm nhận xét. |
| `knowledge/lessons.md` | Bài học liên-dự-án — `fe-gate` fail tự append block nháp; code-developer đọc trước khi giao dev. |
| `knowledge/gates/<KEY>.json` | Báo cáo `fe-gate` lần cuối của ticket → badge trong tab Review. |
| `tools/fe-gate.mjs` | **Gate chất lượng**: bắt thứ được khai báo mà không tồn tại (font/ảnh 404, `dist/` cũ hơn source). `tools/fe-gate.test.mjs` = self-test 18 ca. |
| `.backups/` | Bản sao quay vòng trước mỗi lần ghi board/state. `janitor` giữ 10 bản mới nhất mỗi họ, xoá phần cũ hơn. Không vào git. |
| `dashboard.html` | Nguồn dashboard artifact (1 URL cố định, mỗi lần chạy redeploy). |
| `tools/build-dashboard.mjs` | Sinh khối `DATA` của `dashboard.html` **từ `state.json`** — trước 3/8 khối này viết tay nên tự lệch với state. Có test đi kèm. |
| `tools/psd-tree.py` | Dump cây layer PSD/PSB (kind, bbox, blend, mask…) — `/check-design` gọi ở bước soát tầng FILE. Cần `psd-tools`. |
| `tools/sp-diff.mjs` | So 2 manifest SharePoint cũ ↔ mới để biết designer sửa/thêm/xoá file gì. |
| `tools/bug-radar.mjs` | **OPT-IN từ 18/8: buglist mới chỉ vào sổ, KHÔNG tự theo dõi** — bật từng cái bằng nút tab Bug hoặc `node tools/bug-radar.mjs watch <sheetId>`. Phần **thuần tính toán** của radar buglist hậu bàn giao: bug nào mới, bug nào của mình, lượt này có đáng gọi `claude` không, hàng đợi ghi ngược sheet. Tách khỏi skill để máy quyết định + máy kiểm được. `tools/bug-radar.test.mjs` = 78 ca. |
| `tools/radar-tick.mjs` | **Một lượt radar nền**: gọi `/daily delta` trong phiên headless (`claude -p`), ghép luôn 1 lượt `janitor`/ngày, ghi sổ `history/radar.jsonl`. `tools/radar-tick.test.mjs` = 28 ca. |
| `tools/radar-install.sh` | Cài/gỡ radar nền qua launchd (`install\|uninstall\|status\|kick`). Chặn trước nếu `radar-agent.plist` còn trỏ đường dẫn máy khác — nếu không launchd `cd` sai chỗ rồi **chết âm thầm**. Tắt tạm thì sửa `config.radar.enabled=false`, đừng gỡ job. |
| `tools/statusline.mjs` | Statusline cho mọi phiên Claude Code: cảnh báo mốc + số bug chờ duyệt hiện ngay trên thanh trạng thái, khỏi mở console. Chỉ đọc `state.json` bằng hàm thuần — **không** gọi git/mạng vì chạy lại mỗi lần harness vẽ thanh. Bật: `--write-hooks` của installer tự ghi key `statusLine`. |
| `tools/baked-text-guard.py` | Bắt lỗi **chữ lồng chữ**: text vừa bake trong ảnh vừa render bằng HTML (ca GW-760). Build PASS, console sạch, checker qua — chỉ mắt người mới thấy. Dùng: `--job <job.json> --dist <dist>`. |
| `tools/janitor.mjs` | **Dọn rác tự động** (1 lượt/ngày, ghép trong `radar-tick`): xoá `_raw/`+`_src/` của ticket đã xong, quay vòng `.backups/`, dọn `.cache/` quá hạn. Chỉ tự xoá thứ **tải lại được** (có `sp-manifest.json` hoặc `designLink`); thứ mất là mất luôn thì chỉ BÁO. Sổ hoàn tác `.janitor-log.jsonl`. Xem trước: `node tools/janitor.mjs --dry`. `tools/janitor.test.mjs` = 49 ca. |
| `console/` | Web local (webpack + jQuery + xterm) — xem README riêng trong đó. |
| `docs/specs/` | Design doc của chính hệ thống này. |
| `rules/` | **Luật có mã + severity** (`MUST` chặn / `SHOULD` cảnh báo). Theo repo: `pm-contract.md` (R-PM-*, mọi file có class `pm__`) · `repo-new-mainsite.md` (R-TWIG-*) · `repo-vportal2view.md` (R-VP2-*) · `repo-gt-promotion.md` (R-GTP-*) · `cdn-source-standard.md` (R-CDN-*, chuẩn code landing/skin — thắng cả `cdn-source/CLAUDE.md` lẫn knowledge snapshot). Theo chủ đề: `popup-library.md` (R-POP-*, popup là design system) · `html-handoff.md` (R-HO-*, HTML rời cdn-source sang gt-promotion/new-mainsite). **Không theo repo cụ thể**: `code-style.md` (R-CS-1..7) — áp cho mọi repo, mọi ngôn ngữ, cùng nguồn luật với hook `guard-style.sh` và skill `/clean-code`. Global CLAUDE.md **trỏ** tới đây và chỉ được nhắc lại bản RÚT GỌN của R-CS-* (đủ để agent không phải mở file cho việc nhỏ); mọi luật khác thì chỉ trỏ, chi tiết + ví dụ ❌/✅ nằm ở đây — file này là nguồn phán quyết khi 2 bản lệch nhau. |

### Phát hành bản mới sang cdn-source (người bảo trì)

```bash
bash tools/sync-to-cdn.sh --dry-run   # xem sẽ đổi gì
bash tools/sync-to-cdn.sh             # ghi thật, rồi commit tay bên cdn-source
```

**Danh sách** file lấy từ `git ls-files` (nên `state.json`, `config.json`, `boards/`, `designs/`,
`node_modules/` không có đường lọt sang), nhưng **nội dung** lấy từ worktree — bản đầu dùng
`git checkout-index` và đó là lỗi: file đã `git add` rồi sửa tiếp (`AM`) sẽ sang cdn-source ở bản
cũ hơn cái đang chạy. So sánh bằng `--checksum`, không theo mtime, nên `--dry-run` chỉ kêu khi
nội dung thật sự khác.

File **chưa `git add`** thì không phát hành được — script in cảnh báo đếm rõ số file. Đừng bỏ qua
dòng đó: 14/8 nó bắt được 23 file console chưa track, thiếu chúng thì console **chết ngay lúc
khởi động** (`MODULE_NOT_FOUND` ở 6 module, 11 chỗ import) mà `git status` nhìn qua vẫn thấy sạch.

Script không commit/push. Sửa skill thì sửa ở repo agent-auto rồi sync, đừng sửa thẳng bản trong
cdn-source (lần sync sau `rsync --delete` sẽ ghi đè mất).

## Gate chất lượng trước khi báo xong FE

```bash
node tools/fe-gate.mjs <dist> --design designs/<KEY> --json knowledge/gates/<KEY>.json --lessons knowledge/lessons.md
node tools/fe-gate.test.mjs      # self-test: 18 ca, chứng minh gate bắt được lỗi thật
```

Bắt loại lỗi mà build + console browser + design-checker **đều trượt**: thứ khai báo mà không tồn
tại. Ca gốc GW-654 — clone khung cũ nên thiếu 8 font design mới, build 0 error, 2 checker PASS,
browser fallback im lặng. Exit ≠ 0 = còn ERROR ⇒ `code-developer` không được dùng chữ "xong".

## Guardrails cơ học (hook)

Luật văn xuôi thì agent có thể quên; hook thì không. **4 hook** sống trong repo ở `hooks/`,
`~/.claude/hooks/` chỉ là symlink do `tools/install-skills.sh` tạo (luật secret dùng chung qua
`lib-secret-paths.sh`, không lặp 2 nơi):

```bash
bash hooks/guard-bash.test.sh    # 58 ca — PreToolUse, matcher Bash
bash hooks/guard-read.test.sh    # 17 ca — PreToolUse, matcher Read|Grep
bash hooks/guard-style.test.sh   # 28 ca — PostToolUse, matcher Write|Edit
bash hooks/guard-state.test.sh   # 5 ca  — PostToolUse, matcher Write|Edit|Bash
```

Bật trong `settings.json` bằng `install-skills.sh --write-hooks` (ghi hộ ca an toàn, backup 1
lần, kèm statusline); settings đã có hook của thứ khác thì installer chỉ in khối JSON để gộp tay.

- **deny** (`guard-bash.sh`): `rm -rf /`·`$HOME` · `curl|sh` · force-push nhánh chung ·
  `DROP TABLE`/`doctrine:database:drop`. `guard-read.sh` deny đọc secret (`.env`, `id_rsa`,
  `~/.ssh`, `~/.aws`, `*.pem`) trên cả `Read` lẫn `Grep`.
- **ask**: `git push` (`G-GIT-2` — bước đi ra ngoài, hỏi từng lần) · `git reset --hard`/`clean -fd`/
  `stash drop` (xoá diff chưa review) · script deploy repo team · `rm` nhắm `designs/`·`state.json`·
  `boards/`. Riêng `git commit` **đã gỡ khỏi cổng ask** (14/8/2026 — commit local còn
  amend/reset/revert được, hỏi từng lần chỉ ngắt luồng).
- **cảnh báo, không chặn** (`guard-style.sh`, PostToolUse `Write|Edit`): đếm comment thừa trong
  **đoạn vừa ghi** (không soi cả file) theo R-CS-1, chỉ file code frontend (`.js/.mjs/.ts/.vue/
  .scss/.css/.html/.twig`…), bỏ `dist/`·`node_modules/`. Dư >2 dòng thì in `file:line` từng dòng
  vi phạm cho model tự gỡ. Whitelist 2 tầng: `pm__`/`eslint-disable`/`@ts-`/hack tự thân được tha;
  tên trình duyệt chỉ được tha khi dòng có thêm dấu hiệu vấn đề thật (số phiên bản, `<`/`>`,
  "không/bug/lỗi/fix"). Hook chỉ đo được R-CS-1; R-CS-2..7 vẫn là tự giác.
- **cảnh báo, không chặn** (`guard-state.sh`, PostToolUse `Write|Edit|Bash`): so `mtime` của
  `state.json`, đổi thì chạy `state-doctor` và trả danh sách ERROR về cho model sửa ngay trong
  lượt. Bám cả `Bash` vì state.json bị ghi bằng python/jq nhiều như bằng `Edit`; `mtime` chưa đổi
  thì không nạp node nên gần như không tốn gì. Sinh ra sau 19/8/2026: GW-779 thiếu `summary`,
  console render title thành "—" và USER là người phát hiện bằng mắt.
- Cố ý KHÔNG chặn: `.env.test` (Symfony commit file này), `rm -rf node_modules|dist`, `ls|grep '^\.env'` —
  chặn oan là làm luồng tệ hơn, nên mỗi test có cả nhóm ca "phải ALLOW".
- Overhead đo thật: **6,5 ms/lệnh Bash · 4,9 ms/Read** (tool call vốn tốn hàng trăm ms).
- `permissions.deny` dạng `Read(**/…)` trong user-settings **không** khớp path tuyệt đối (test 13/8) →
  đó là lý do dùng hook chứ không dùng deny rule.

## Ranh giới an toàn

- Skill KHÔNG commit/push, KHÔNG ghi gì lên Jira — user review diff và tự đẩy.
- `designs/` và `.backups/` không vào git: rất nặng, mà tải lại được từ SharePoint.
- Buglist QC: skill chỉ soạn lệnh `/bug-fixer-lite`, user dán sang terminal CLI
  (VS Code panel không có toolset Chrome để ghi sheet).
- gt-promotion-template nằm ngoài luồng `/daily`.
