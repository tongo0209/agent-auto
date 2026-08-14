# agent-auto — nhà của bộ điều phối `/daily`

Skill **và** dữ liệu vận hành của `/daily`. Skill nằm ngay trong repo (`skills/`);
`~/.claude/skills/…` chỉ là symlink trỏ vào đây, nên `git pull` là có bản skill mới.

## Yêu cầu trước khi cài

| Cần | Vì sao | Thiếu thì gãy ở đâu |
|---|---|---|
| **Claude Code** (CLI, không phải VS Code panel) | skill + hook đều là cơ chế của Claude Code | panel không nạp toolset Chrome ⇒ bước ghi sheet của `/bug-fixer-lite` fail |
| **Node.js** | console, `state-doctor`, script SharePoint | installer báo ngay dòng "chưa có node" |
| **Kết nối Atlassian MCP** — gõ `/mcp` trong Claude Code rồi authenticate | `/daily` quét Jira qua MCP, không qua API token | `/daily` chết ở bước quét, không có thông báo gợi ý |
| **Đã clone sẵn các repo code** (`cdn-source`, `new-mainsite`…) | `config.repos` phải trỏ vào chúng | `/daily doctor` báo `W7 repos[...] không có trên đĩa` |
| **Quyền SharePoint** của designer | nấc tải design tự động | `/daily` báo chưa tải được design, không chết |
| `cd console && npm install` (chỉ khi dùng console) | `npm start` = `build && serve`, **không** tự install | webpack chết ngay lệnh đầu, thông báo không nói gì về nguyên nhân |
| Sửa tay 4 dòng đường dẫn trong `tools/radar-agent.plist` (chỉ khi muốn radar nền) | plist ghi cứng đường dẫn máy người tạo, `radar-install.sh` copy nguyên xi | launchd `cd` vào thư mục không tồn tại rồi **chết âm thầm**. `radar-install.sh` giờ chặn trước và in ra 4 dòng cần sửa |

Không có Atlassian MCP / SharePoint thì phần lớn `/daily` vẫn chạy (board, phase, gate, console) —
chỉ mất nhánh quét Jira và tải design.

## Cài đặt (member mới)

Bản phát hành đi kèm **cdn-source** — đã pull cdn-source là có sẵn, không cần clone gì thêm:

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

Sau đó còn 3 việc (script in ra sẵn, kèm trạng thái hiện tại của máy bạn):

1. **Sửa `config.json`** — `repos` phải là đường dẫn thật trên máy bạn, `cloudId` + `gitAuthor`
   của bạn. Cứ để nguyên placeholder là `/daily doctor` báo `E10`, không báo xanh giả.
2. **Bật hook guardrail** — chạy lại kèm `--write-hooks` để script ghi hộ vào `settings.json`
   (giữ nguyên key cũ, backup ra `settings.json.bak-before-agent-auto`). Nó chỉ ghi khi
   **chắc chắn an toàn**: chưa có file, hoặc có file mà chưa khai `PreToolUse`. Đã có hook của
   thứ khác thì script không đụng, chỉ in khối JSON để bạn gộp tay.
   Kiểm bằng `bash hooks/guard-bash.test.sh` (phải `56 pass · 0 fail`).
3. **Mở phiên Claude Code mới** (skill chỉ nạp lúc khởi động) rồi gõ `/daily doctor` —
   phải ra **0 ERROR** thì mới thật sự xong.

### Cái gì vào git, cái gì không

Repo là **công cụ dùng chung**; board/task/state là việc của **riêng từng dev** — track chúng thì
mỗi lần hai người chạy `/daily` là đụng nhau trên cùng file.

| Vào git | Không vào git (`.gitignore`) |
|---|---|
| `skills/` · `hooks/` · `rules/` · `tools/` · `console/` · `schema/` · `docs/` | `state.json` · `config.json` · `dashboard.html` |
| `knowledge/lessons.md` — bài học chung, đáng để cả team đọc | `boards/` · `tasks/` · `history/` · `knowledge/gates/` · `knowledge/metrics.jsonl` |
| `*.example.json` — bản mẫu để script sinh file thật | `designs/` (5.1GB, tải lại từ SharePoint được) |

Các thư mục dữ liệu vẫn còn sau khi clone nhờ `.gitkeep`, chỉ là rỗng.

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

### Skill trong repo này

| Skill | Vì sao ở đây |
|---|---|
| `/daily` | bộ điều phối chính — đọc/ghi `config.json`, `state.json`, `boards/`, `tasks/` |
| `/check-design` | soát design đủ chưa — ghi `tasks/<KEY>/design-gap.md`, `state.issues[].design` |
| `/ui-check` | check output `dist/` — Bước 0a gọi `tools/fe-gate.mjs` của repo này |

`hooks/` là 2 guard PreToolUse (`guard-bash.sh` chặn lệnh nguy hiểm, `guard-read.sh` chặn đọc
secret) + test của chúng. Chúng bảo vệ chính `boards/` · `state.json` · `designs/` nên đi kèm repo.

### Skill ngoài repo (`/daily` có gọi tới)

| Skill | Repo | `/daily` dùng thế nào |
|---|---|---|
| `/code-developer` | `promptAgent/` | **gọi thật** qua tool Skill (SKILL.md:262) — thiếu là bước giao việc code gãy |
| `/bug-fixer-lite` | `cdn-source/products/tontagent/` | chỉ **soạn lệnh ra board** (SKILL.md:274) — thiếu vẫn không sao, user tự chạy sau |

Cài 2 skill này theo README của repo tương ứng. Phần quét Jira · suy phase · dò design ·
ghi board · `/daily plan|week|status|doctor` **không phụ thuộc** hai skill trên.
`/daily` chưa có nhánh xử lý riêng cho ca thiếu skill — mất `/code-developer` thì lỗi nổi lên ở
tầng tool, chưa được nuốt gọn thành cảnh báo.

## Daily Console — web local bọc terminal claude

```bash
cd ~/VNG/agent-auto/console
npm install                                # lần đầu thôi — `npm start` KHÔNG tự install
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
Nút **radar 30m** mở tab riêng rồi gõ `/loop 30m /daily delta` — chạy nền mà vẫn trong phiên CLI
nên auth connector còn nguyên (cron hệ thống thì không).

**Phải** = **terminal thật** (nhiều tab, mỗi tab 1 shell): bấm `▶ claude` khởi động Claude Code
ngay trong web; các nút `/daily`, `plan`, `week`, `delta`, `wrap`, `status` chỉ GÕ HỘ lệnh vào
tab đang mở (bấm `▶ claude` trước). Mở nhiều tab để chạy song song (vd tab 1 code, tab 2
bug-fixer-lite). Mọi cổng duyệt, auth Jira/SharePoint, skill nguyên vẹn vì bản chất vẫn là CLI.
Console **chỉ đọc** dữ liệu agent-auto. Chi tiết source & cách thêm tính năng: [console/README.md](console/README.md).

## Dùng hàng ngày

```
/daily              # sáng: quét Jira + phase + promotion → duyệt 1 lần → chạy → board + dashboard
/daily plan         # chỉ quét + trình kế hoạch, KHÔNG thực thi (dry-run)
/daily week         # kế hoạch tuần 14 ngày + cảnh báo dồn deadline
/daily prep GW-xxx  # chuẩn bị sâu 1 ticket (brief + dò design), không code
/daily add <link>   # nhận việc ngoài Jira (nexus/sheet/text) thành task ADHOC
/daily delta        # radar quét nhanh thay đổi — dùng kèm: /loop 30m /daily delta
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
| `skills/` | 3 skill `/daily` · `/check-design` · `/ui-check`. `~/.claude/skills/*` chỉ là symlink trỏ vào đây → sửa skill = sửa file trong repo, commit được. |
| `hooks/` | 2 guard `PreToolUse` + test. Cũng symlink sang `~/.claude/hooks/`. |
| `tools/install-skills.sh` | Cài 1 lệnh cho máy mới: symlink skill + hook, seed `config.json`/`state.json`. `--check` để xem trước. |
| `tools/sync-to-cdn.sh` | Phát hành bản mới sang `cdn-source/products/tontagent/agent-auto/`. |
| `config.json` | cloudId + JQL Jira, đường dẫn các repo. **Không vào git** (mỗi máy một bản) — mẫu ở `config.example.json`. `jqlConfirmed: false` → lần chạy đầu sẽ hỏi xác nhận 1 lần. |
| `state.json` | Ticket đã thấy lần trước → lần sau chỉ xử lý MỚI/ĐỔI/CÒN DỞ. **Không vào git** — mẫu ở `state.example.json`. |
| `schema/vocab.json` | **Nguồn vốn từ duy nhất** — phase · loại mốc · trạng thái design. Skill ghi phase đúng `id` trong file này, console (`server/lib/vocab.js`) đọc chính file này — không còn 3 nơi khai riêng (skill prose · `constants.js` · `phases.js`) như trước 2026-08-03. |
| `tools/state-doctor.mjs` | Validator CHỈ ĐỌC: `state.json` có đúng hợp đồng vocab không (7 luật ERROR E1-E7 + 5 luật WARN W1-W5). `tools/state-doctor.test.mjs` = 20 ca. |
| `boards/YYYY-MM-DD.md` | Board mỗi ngày: trạng thái từng task, log, mục "Cần bạn". |
| `tasks/<JIRA-KEY>/` | `brief.md` bóc từ ticket. |
| `designs/<JIRA-KEY>/` | Kho design tập trung: ảnh dùng được + `_raw/` (zip/PSD gốc) — /daily tự tải về đây. |
| `history/issues.jsonl` | Mỗi lần `/daily` quét Jira append 1 dòng/ticket → nguồn thống kê **theo tháng**. |
| `history/phases.jsonl` | 1 dòng mỗi lần phase 1 ticket đổi (skill ghi kèm lý do; console tự ghi khi quan sát thấy) → nguồn **lead time thật**. |
| `knowledge/metrics.jsonl` | Console tự ghi 1 dòng/ngày/ticket **đo từ git**; `wrap` chỉ thêm nhận xét. |
| `knowledge/lessons.md` | Bài học liên-dự-án — `fe-gate` fail tự append block nháp; code-developer đọc trước khi giao dev. |
| `knowledge/gates/<KEY>.json` | Báo cáo `fe-gate` lần cuối của ticket → badge trong tab Review. |
| `tools/fe-gate.mjs` | **Gate chất lượng**: bắt thứ được khai báo mà không tồn tại (font/ảnh 404, `dist/` cũ hơn source). `tools/fe-gate.test.mjs` = self-test 18 ca. |
| `.backups/` | Bản sao quay vòng trước mỗi lần ghi board/state (30 bản). Không vào git. |
| `dashboard.html` | Nguồn dashboard artifact (1 URL cố định, mỗi lần chạy redeploy). |
| `console/` | Web local (webpack + jQuery + xterm) — xem README riêng trong đó. |
| `docs/specs/` | Design doc của chính hệ thống này. |
| `rules/` | **Luật có mã + severity** (`MUST` chặn / `SHOULD` cảnh báo) cho 4 repo trong `config.json` — `pm-contract.md` (R-PM-*) · `repo-new-mainsite.md` (R-TWIG-*) · `repo-vportal2view.md` (R-VP2-*) · `repo-gt-promotion.md` (R-GTP-*); `cdn-source` đã có `CLAUDE.md` riêng. Global CLAUDE.md chỉ TRỎ tới đây, không copy luật → 1 nguồn duy nhất như `schema/vocab.json`. |

## Gate chất lượng trước khi báo xong FE

```bash
node tools/fe-gate.mjs <dist> --design designs/<KEY> --json knowledge/gates/<KEY>.json --lessons knowledge/lessons.md
node tools/fe-gate.test.mjs      # self-test: 18 ca, chứng minh gate bắt được lỗi thật
```

Bắt loại lỗi mà build + console browser + design-checker **đều trượt**: thứ khai báo mà không tồn
tại. Ca gốc GW-654 — clone khung cũ nên thiếu 8 font design mới, build 0 error, 2 checker PASS,
browser fallback im lặng. Exit ≠ 0 = còn ERROR ⇒ `code-developer` không được dùng chữ "xong".

## Guardrails cơ học (hook — 2026-08-13)

Luật văn xuôi thì agent có thể quên; hook thì không. 2 hook `PreToolUse` sống trong repo ở
`hooks/`, `~/.claude/hooks/` chỉ là symlink do `tools/install-skills.sh` tạo (luật secret dùng
chung qua `lib-secret-paths.sh`, không lặp 2 nơi):

```bash
bash hooks/guard-bash.test.sh   # 56 ca — matcher Bash
bash hooks/guard-read.test.sh   # 17 ca — matcher Read|Grep
```

Cài xong nhớ dán khối `hooks` vào `~/.claude/settings.json` — installer in ra sẵn, nó **không**
tự sửa settings của bạn.

- **deny**: `rm -rf /`·`$HOME` · `curl|sh` · đọc secret (`.env`, `id_rsa`, `~/.ssh`, `~/.aws`, `*.pem`) ·
  force-push nhánh chung · `DROP TABLE`/`doctrine:database:drop`.
- **ask**: `git commit`/`push` (đúng luật hỏi-từng-lần) · `git reset --hard`/`clean -fd`/`stash drop`
  (xoá diff chưa review) · script deploy repo team · `rm` nhắm `designs/`·`state.json`·`boards/`.
- Cố ý KHÔNG chặn: `.env.test` (Symfony commit file này), `rm -rf node_modules|dist`, `ls|grep '^\.env'` —
  chặn oan là làm luồng tệ hơn, nên mỗi test có cả nhóm ca "phải ALLOW".
- Overhead đo thật: **6,5 ms/lệnh Bash · 4,9 ms/Read** (tool call vốn tốn hàng trăm ms).
- `permissions.deny` dạng `Read(**/…)` trong user-settings **không** khớp path tuyệt đối (test 13/8) →
  đó là lý do dùng hook chứ không dùng deny rule.

## Ranh giới an toàn

- Skill KHÔNG commit/push, KHÔNG ghi gì lên Jira — user review diff và tự đẩy.
- `agent-auto` đã `git init` (chưa commit lần nào — commit đầu tiên do bạn quyết). `designs/` và
  `.backups/` không vào git: 5.1GB, tải lại được từ SharePoint.
- Buglist QC: skill chỉ soạn lệnh `/bug-fixer-lite`, user dán sang terminal CLI
  (VS Code panel không có toolset Chrome để ghi sheet).
- gt-promotion-template nằm ngoài luồng `/daily`.
