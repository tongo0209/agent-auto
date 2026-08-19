# Daily Console

Web local: cockpit theo dõi task/Jira/git + **terminal claude thật** nhúng trong trang.
Không thay engine — skill, auth Jira/SharePoint, quyền repo vẫn nằm trong CLI.

## Chạy

```bash
npm install      # lần đầu thôi — `npm start` KHÔNG tự chạy bước này
npm start        # build production rồi serve → http://127.0.0.1:4747
npm run dev      # webpack watch (dev, source-map) — chạy song song với npm run serve
npm run serve    # chỉ chạy server, dùng bundle dist/ có sẵn
npm test         # test server (node:test)
npm run check    # CỔNG CHỐT DUY NHẤT trước khi báo xong: lint → test → test:tools → build → doctor
```

Phải chạy **trong `console/`** — thư mục gốc `agent-auto/` không có `package.json`.

**Cổng linh động:** ưu tiên 4747, bận thì tự nhảy 4748 → 4749 … (tối đa 10 nấc), không còn
sập vì `EADDRINUSE`. Cổng thật in ra ngay dòng `Daily Console  http://…` khi khởi động —
đọc dòng đó rồi mở đúng cổng đó. Đặt cổng ưu tiên khác: `CONSOLE_PORT=5000 npm start`.

## Cấu trúc

```
console/
├── webpack.config.js        # build: entry src/index.js → dist/, alias @core @panels @components @terminal
├── server/                  # backend Express (không có logic UI)
│   ├── index.js             # bootstrap: static dist + mount /api + attach WS /term
│   ├── lib/                  # 25 module (test .mjs nằm cạnh, ls thấy 38 file)
│   │   ├── paths.js         # MỌI đường dẫn tập trung ở đây (agent-auto, whitelist mở file)
│   │   ├── fsutil.js        # readJSON / readJSONL / todayStr / daysBetween
│   │   ├── board.js         # parse board markdown → { needYou, log } + readAllNeedYou (mọi board)
│   │   ├── needyou.js       # CHỖ DUY NHẤT biết một mục "Cần bạn" trải tới dòng nào
│   │   │                    #   (mục tràn 2-3 dòng · chỉ nhận bullet CÓ `[ ]`) — đọc & ghi trọn khối
│   │   ├── debt.js          # sổ nợ đọng xuyên ngày: mục mở ở board CŨ mà ticket vắng board hôm nay
│   │   ├── cache.js         # cache TTL in-memory (git log tháng nặng mất ~5s)
│   │   ├── activity.js      # commit của MỘT ticket theo state.paths + đo effort chỉ trên file code
│   │   ├── review.js        # git status/diff/commit-chưa-push theo ticket + chặn path ngoài repo
│   │   ├── ticket.js        # gom MỌI thứ của 1 ticket + ảnh design cấp 1 + suy dist/ từ state.paths
│   │   ├── alerts.js        # cảnh báo: mốc gấp · quá mốc · đứng yên · design chưa tải
│   │   ├── learn.js         # vòng học: quan sát phase đổi · lead time · metrics đo từ git
│   │   ├── backup.js        # snapshot quay vòng + ghi atomic + appendJSONL
│   │   ├── git.js           # git log theo author + khoảng ngày, lastTouch theo subpath
│   │   ├── vocab.js         # DẪN XUẤT từ schema/vocab.json — PHASE_IDS, OFF_MY_PLATE_PHASES,
│   │   │                    #   HTML_TODO/DONE_PHASES, LATE_EXEMPT_PHASES... (nguồn vốn từ, không tự khai lại)
│   │   ├── delta.js         # "có gì mới" — suy status/duedate/milestone/phase đổi từ 2 sổ history/*.jsonl
│   │   ├── notify.js        # nhắc mốc RA NGOÀI trang qua macOS notification (best-effort, có test hàm thuần)
│   │   ├── forecast.js      # dự báo ngày xong phase hiện tại từ lead time thật (dưới minSamples → null, không bịa)
│   │   ├── phaselog.js      # CHỖ DUY NHẤT biết đọc history/phases.jsonl cho đúng (lọc dòng TRÙNG + NO-OP
│   │   │                    #   do skill /daily và observer console cùng ghi) — delta.js + learn.js dùng chung
│   │   ├── listen.js        # listen cổng có fallback: 4747 bận thì nhảy 4748 → 4749… (không sập EADDRINUSE)
│   │   ├── ptyStore.js      # kho phiên pty sống LÂU HƠN WebSocket (neo theo sessionId, replay output đã lỡ)
│   │   ├── radar.js         # trạng thái radar nền: đọc history/radar.jsonl, phân biệt "im vì yên" vs "im vì
│   │   │                    #   chết" (deadMs); luật giờ lấy THẲNG từ tools/radar-tick.mjs, không chép lại
│   │   ├── bugs.js          # bảng bug cho console — đọc state.bugWatch mà bug-radar nền ghi (hàng chờ duyệt
│   │   │                    #   verified/unverified + trạng thái từng sheet: watching/muted/retired/not-buglist)
│   │   ├── deliver.js       # HÀM THUẦN suy "đã bàn giao chưa" từ output git (bằng chứng = file đã push lên
│   │   │                    #   gt-promotion-template); mọi lệnh git nằm ở chỗ gọi nên test không cần repo giả
│   │   ├── promoScan.js     # phần I/O của việc kiểm bàn giao: chạy git + liệt kê `<promoFolder>/mainsite/`
│   │   └── jira.js          # client Jira REST v3 CHỈ đủ để đánh Done 1 ticket — cố ý KHÔNG có hàm ghi
│   │                        #   description/comment (chốt 10/08: không đụng bài của PM)
│   ├── routes/              # 19 file
│   │   ├── state.js         # GET /api/state    → tab Hôm nay + KPI (+ cờ có designs/questions)
│   │   ├── git.js           # GET /api/git, /api/promotion
│   │   ├── months.js        # GET /api/months   → gom history/months.json theo tháng
│   │   ├── activity.js      # GET /api/activity, /api/activity/:key → hoạt động git per ticket
│   │   ├── docs.js          # GET /api/boards, /board/:date, /brief/:key, /metrics
│   │   ├── review.js        # GET /api/review, /review/diff, /gates
│   │   ├── ticket.js        # GET /api/ticket/:key, /design/:key/:name · POST /gate/run/:key
│   │   ├── preview.js       # GET /preview/:key/* → serve dist/ thật của ticket (chỉ đọc)
│   │   ├── board.js         # POST /api/board/check (tick) + /board/append (thêm dòng, giờ do server lấy)
│   │   ├── alerts.js        # GET /api/alerts
│   │   ├── learn.js         # GET /api/learn, /api/lessons
│   │   ├── doctor.js        # GET /api/doctor   → chạy tools/state-doctor.mjs (dynamic import ESM từ CJS)
│   │   ├── delta.js         # GET /api/delta?since=<ISO> → dòng "có gì mới từ HH:MM" tab Hôm nay
│   │   ├── debt.js          # GET /api/debt → nợ "Cần bạn" ở board cũ (cache 30s) + số dòng lệch section
│   │   ├── handoff.js       # GET/POST /api/handoff/:key[, /check] → checklist bàn giao phase reassigned
│   │   ├── radar.js         # GET /api/radar (trạng thái radar nền, CHỈ ĐỌC) · POST /radar/toggle
│   │   ├── bugs.js          # GET /api/bugs (hàng bug chờ duyệt, CHỈ ĐỌC) · POST /bugs/watch (bật/tắt 1 buglist)
│   │   ├── jira.js          # GET /api/jira/delivery/:key · POST /jira/done/:key → ĐÁNH DONE ticket khi đã
│   │   │                    #   bàn giao qua gt-promotion (đường DUY NHẤT console ghi ra Jira)
│   │   └── open.js          # POST /api/open    → Finder/VS Code (có whitelist)
│   └── ws/terminal.js       # WebSocket ↔ node-pty (1 WS = 1 shell thật)
└── src/                     # frontend (jQuery + xterm, bundle bằng webpack)
    ├── index.html           # template (html-webpack-plugin)
    ├── index.js             # bootstrap: khởi tạo terminal, tab, poll
    ├── core/
    │   ├── constants.mjs    # DẪN XUẤT từ schema/vocab.json (không tự khai phase) + TASK_GROUPS, COMMANDS,
    │   │                    #   POLL_MS, IDLE, JIRA_SITE (site Jira — fallback khi response chưa kèm config.siteUrl)
    │   ├── icons.js         # bộ icon lucide — chỗ DUY NHẤT biết icon nào lấy từ file nào
    │   ├── api.js           # chỗ DUY NHẤT gọi backend
    │   ├── format.mjs       # hàm thuần: escape, ngày, severity, mốc kế, isLate
    │   ├── grouping.mjs     # chia nhóm + đếm cho bảng task (hàm thuần, tách để test — chặn bug 3/8: phase lạ bị bỏ im lặng + số đếm lệch số dòng)
    │   └── marks.mjs        # đặt nhãn mốc trên trục timeline, 2 lượt ưu tiên HTML trước (tách khỏi gantt.js để test được)
    ├── terminal/TerminalManager.js   # multi-tab pty, tự reconnect, gõ hộ lệnh
    ├── core/splitter.js     # thanh kéo đổi tỉ lệ 2 cột (nhớ trong localStorage)
    ├── components/          # modal.js (showText + showDiff) · charts.js · gantt.js · activityLine.js ·
    │                        #   flashbar.js (chớp 1 dòng thông báo trong .flashbar — Review + drawer dùng chung)
    ├── panels/              # todayPanel, ticketPanel (drawer 1 ticket), reviewPanel, bugPanel, monthsPanel,
    │                        #   gitPanel, historyPanel
    └── styles/              # index.css import 16 file: tokens/base/layout/kpi/tabs/cards/table/alerts/drawer/review/bugs/gantt/charts/terminal/modal + responsive (CUỐI)
```

## Tính năng cột trái

| Tab | Có gì |
|---|---|
| Hôm nay | KPI 4 ô (chỉ ô cần chú ý mới lên màu) · **dải cảnh báo** (mốc gấp/quá mốc/đứng yên/design chưa tải/**nợ đọng rơi radar**) · dải mốc 14 ngày + cảnh báo dồn deadline · **timeline mốc 4 tuần** (Gantt) · **bảng task** nhóm theo phase (`Ticket · Việc · Phase · Mốc kế · Gate · Push · Effort · Actions`, header sticky) · **ô lọc** · **ô Effort** = hoạt động git per ticket · **Cần bạn tick được** (ghi vào board) · **Nợ đọng từ board cũ** (tick ghi vào board GỐC) · log board (tô vàng dòng còn `HH:MM`) |
| Review | Việc chờ **bạn** đẩy lên, gom theo ticket: badge `n file chưa commit` / `n commit chưa push` / `sạch · đã đẩy` · badge fe-gate (`/api/gates`, chưa chạy thì bấm để gõ lệnh) · danh sách file kèm `+/-`, bấm xem diff · nút gõ hộ `git add && commit -m "[leaf] subject" -m <trailer>` và `git push`. Console **không** commit/push: chỉ gõ vào terminal, **không** gửi Enter — số trên tab đếm ticket có việc thật |
| Bug | Bug do **bug-radar nền** fix, chờ bạn gật trước khi ghi Done lên sheet QC. Hai nhóm: *đã verify* và *chưa verify được* (kèm lý do + gợi ý cách verify), badge treo bao lâu + chip ticket + link sheet. Dưới là **buglist đang theo dõi**: động tĩnh lượt quét cuối (bug mới/đổi/QC mở lại/không của mình) + nút bật-tắt theo dõi từng sheet (`POST /api/bugs/watch` — tắt thì lượt bugwatch thôi đọc sheet đó, mỗi lượt ~90s + token). Console **chỉ đọc**, ghi ngược sheet bằng `/daily bugwrite` (có nút gõ hộ) |
| Theo tháng | Task nhóm theo **tháng của due date**, mặc định 3 tháng gần nhất (bấm xem tất cả); dấu tick = đã chuyển Done. Nguồn: `history/months.json` (snapshot real từ Jira do `/daily` ghi). Cuối tab: **board các ngày trước · gt-promotion commit mới nhất theo task · metrics ước lượng vs thực tế** (trước là tab "Lịch sử" riêng, chỉ 3 dòng nội dung nên đứng riêng thành màn trống) |
| Git của tôi | Commit của chính bạn, **chọn theo tháng** (6 tháng gần nhất): bar từng ngày trong tháng, tổng theo repo, list commit kèm shortstat |

Kéo thanh giữa 2 cột để đổi tỉ lệ (double-click về mặc định **57%**, đổi từ 46% ngày 1/8 — đo ở
màn 1920: trái 883px cho terminal **129 cols**, mà Claude Code chỉ cần ~100; nới trái lên 1100px
thì terminal còn **102 cols** vẫn thoải mái, và mở đủ chỗ cho 2 cột `Gate`/`Push`. Khoá lưu đổi
sang `:v2` một lần để mặc định mới thắng giá trị localStorage cũ). Cột trái rộng ≥620px thì
danh sách tự dàn 2 cột, ≥920px thì 3 cột (container query, không phải viewport); <620px thì
bảng task tự bỏ 2 cột phụ (Design/Effort) thay vì cuộn ngang.

## Thêm tính năng ở đâu

| Muốn thêm | Sửa file |
|---|---|
| Nút lệnh mới trên toolbar | `src/core/constants.mjs` → `COMMANDS` |
| Endpoint API mới | `server/routes/<tên>.js` + mount trong `server/index.js` + thêm hàm vào `src/core/api.js` |
| Tab mới bên trái | `src/index.html` (nút + pane) → `src/panels/<tên>Panel.js` → khai báo trong `PANEL_LOADERS` (`src/index.js`) |
| Đổi màu / khoảng cách / cỡ chữ | `src/styles/tokens.css` (chỉ ở đây — gồm `--fs`, `--fs-sm`, `--fs-xs`, `--row-h`) |
| Chart mới | `src/components/charts.js` + style trong `src/styles/charts.css` |
| Phase mới của vòng đời | `AGENT_AUTO/schema/vocab.json` — thêm entry vào `phases[]` (server + client đều đọc từ đây qua `lib/vocab.js`, không tự khai lại). Ngoại lệ: icon vẫn phải khai riêng trong `src/core/icons.js` — vocab chỉ ghi TÊN icon (`icon: "bug"`), không phải file SVG. `tools/state-doctor.mjs` (E7) báo lỗi nếu tên icon trong vocab không tồn tại trong `icons.js`. |
| Icon mới / đổi hình icon | `src/core/icons.js`: 1 dòng `import … from 'lucide-static/icons/<tên>.svg'` + 1 entry `RAW` theo **tên nghiệp vụ**; panel chỉ gọi `icon('<tên nghiệp vụ>')` |
| Cột mới trong bảng task | `src/panels/todayPanel.js` (`taskRow` + `<thead>`) + bề rộng cột trong `src/styles/table.css` |

## Ghi chú kỹ thuật

- **Ai lên timeline** (`core/marks.mjs` → `keepOnTimeline`, cờ trong `schema/vocab.json`):
  việc trong tay luôn có hàng · `closed` (`doneMine`) VẪN có hàng, vẽ mờ, **chừng nào còn mốc
  tương lai** — FE xong không phải hết việc, Test/Release của BE/QC mới là lúc bug quay lại và
  phải canh (user chốt 6/8; ca thật GW-660 đóng 3/8 nhưng test 21/8 · release 26/8) · hết mốc
  tương lai thì rụng khỏi timeline, không để nó phình theo ticket đã đóng · `reassigned` (`gone`)
  **không vẽ hàng nào** vì việc không còn bên mình (vẫn giữ dòng trong bảng task cho việc bàn
  giao). KPI · dải mốc 14 ngày · cảnh báo vẫn lọc theo `offMyPlate` như cũ, không đổi.
- **Mốc ngoài khung 28 ngày** ghim mép phải, chấm rỗng viền đứt, nhãn kèm ngày + `→`; nhiều mốc
  ngoài khung gộp thành 1 chấm mang mốc SỚM NHẤT + `+n`. Nhãn nó dài nên chiếm vùng cấm rộng hơn
  (`LABEL_OFF_GAP_PCT`) — mốc thường nằm trong vùng đó mất nhãn, xem bằng tooltip.
- **Reload trang KHÔNG giết terminal** (từ 6/8). Phiên pty sống ở server trong `lib/ptyStore.js`,
  neo theo `sessionId` client giữ trong `localStorage` (`core`… `terminal/sessionStore.mjs`);
  WebSocket chỉ là ĐƯỜNG DÂY. Đóng socket = *rời dây* → pty chạy tiếp, nối lại đúng id thì được
  phát lại tối đa 256KB output đã lỡ rồi đi tiếp. Giết pty chỉ khi: user bấm ✕ đóng tab
  (client gửi `{type:'kill'}`), shell tự thoát, rời dây quá **6h** (sweep 10 phút/lần), hoặc
  restart server. TTL để dài có chủ ý — đóng trình duyệt không có nghĩa là bỏ việc, `/loop 30m
  /daily delta` và các lượt agent dài vẫn phải chạy tiếp.
  Verify 6/8 trên port 4748: shell PID **47604** y nguyên trước/sau reload, job nền đếm không
  đứt; tab đóng bằng ✕ thì shell 54660 chết hẳn (`ps` xác nhận cả hai chiều).
- **node-pty phải là bản `1.2.0-beta.x`** — bản 1.0.0 crash `posix_spawnp failed` trên Node 25/macOS.
- Chart dùng palette 2 series `--s1 #279A8B` / `--s2 #B67F35`, đã qua validator dataviz trên nền tối
  (lightness band, chroma floor, CVD ΔE 11.6, normal-vision ΔE 19.9, contrast — **ALL PASS**).
  Đổi màu series phải validate lại, đừng đổi bằng cảm giác.
- Console ghi vào `agent-auto/` đúng **4 chỗ** (2026-08-01, thêm chỗ thứ 4 ngày 2026-08-03,
  trước đó chỉ đọc):
  1. board — `POST /api/board/check` tick mục "Cần bạn" (`- [x] ~~…~~`) và
     `POST /api/board/append` thêm dòng mới vào "Cần bạn"/"Log" (ô ghi nhanh; giờ do server lấy).
     Từ 12/8 `check` còn nhận board **CŨ** (khối nợ đọng tick vào board gốc, ví dụ board 10/8) —
     route vốn đã nhận `date` và đã chặn path ngoài `boards/`, nên **không thêm đường ghi mới**.
     Ghi vào board gốc chứ không phải board hôm nay: đó là chỗ mục đó đang sống, ghi nơi khác thì
     lần quét sau vẫn thấy nó `- [ ]` và hỏi lại mãi;
  2. `knowledge/metrics.jsonl` — 1 dòng/ngày/ticket, đo TỪ GIT (boot + mỗi 6h, idempotent theo
     `date|key`);
  3. `history/phases.jsonl` — khi poll `/api/state` thấy phase đổi (`reason: console-observed`).
  4. `tasks/<KEY>/handoff.md` — tick việc bàn giao (`POST /api/handoff/:key/check`) khi ticket ở
     phase `reassigned` (checklist do `/daily` sinh khi phase đổi sang đó — xem `routes/handoff.js`).
  Mọi lần ghi đi qua `server/lib/backup.js`: snapshot vào `.backups/<bucket>/` (giữ 30 bản) rồi
  ghi **atomic** (tmp + rename). Console **không bao giờ** `git commit`/`push` — nút Review chỉ
  *gõ hộ* lệnh vào terminal và **không** gửi Enter.
- **Tại sao ghi metrics ở console chứ không ở skill**: cả 2 file vòng học từng phụ thuộc
  `/daily wrap` (gõ tay, cuối ngày) → sau 3 ngày chạy vẫn **0 dòng**. Dữ liệu học phải sinh ra như
  tác dụng phụ của việc đang diễn ra, không phải một bước cần ý chí.
- **Một mục "Cần bạn" là MỘT KHỐI, không phải một dòng** (`lib/needyou.js`, 12/8). Board thật viết
  mục tràn 2-3 dòng (4/5 mục board 12/8). Cả hai đường cũ đều lọc `trim().startsWith('-')` nên chỉ
  thấy dòng đầu: UI hiện mục đứt giữa câu (`…Cần bạn nói "[Tây Du VNG] Tam Tiêu`), và tick thì
  thành `- [x] ~~…Tam Tiêu~~` + dòng `Nương Nương / Update hình" …` **treo lại ngoài mục** — board
  mất nghĩa, lần sau chỉ còn thấy nửa đầu nên không tick lại đúng được. Giờ mục = bullet + mọi dòng
  tiếp theo cho tới bullet mới / **dòng trống** / `## ` khác, và `setChecked` thay trọn khối bằng
  MỘT dòng (gộp có chủ ý: `~~` bọc qua nhiều dòng tuỳ bộ render).
- **Chèn dòng mới phải chèn sau TRỌN mục cuối** (`needyou.appendToSection`, 12/8 — ca CRITICAL do
  vòng review đối kháng bắt được). Bản cũ của `/api/board/append` neo điểm chèn vào **dòng bullet**
  cuối (`if (lines[i].trim().startsWith('-')) insertAt = i + 1`); dòng tràn của mục không phải bullet
  nên bullet mới bị chèn vào GIỮA mục cuối. Sau đó `parseNeedYou` coi phần đuôi là thân của bullet
  MỚI và `setChecked` gộp trọn khối về 1 dòng ⇒ **mất dữ liệu vĩnh viễn**. Tái hiện thật: board 3/8
  từ 134 còn **128 dòng** (mất 6 dòng của GW-556); board 12/8 mục GW-477 mất nửa câu, nửa đó sang
  tên mục mới. Luật đúng: chèn sau **dòng có nội dung cuối cùng** của section — đúng cho cả
  `Cần bạn` (checklist nhiều dòng) và `Log` (log dài tràn dòng).
- **Sổ nợ đọng: cache theo DẤU VÂN mtime, không theo TTL** (`lib/board.js::readAllNeedYou`). Console
  chính là bên ghi board nên TTL luôn sai: đo thật với TTL 30s — tick xong `/api/debt` vẫn trả
  `cached=true` kèm mục vừa đóng, bấm lần hai thì 409. Dấu vân (tên + `mtimeMs` từng file) đổi ngay
  khi `writeAtomic` rename nên không ai phải nhớ gọi xoá cache, và `/api/alerts` (poll cùng nhịp)
  được lợi luôn.
- **"Board hiện tại" của sổ nợ = board hôm nay HOẶC board mới nhất** — phải khớp `readBoard()`.
  So cứng `date === today` là báo động sai, và không hiếm: 14 ngày 30/7–12/8 có **4 ngày không có
  board** (2/8 và 7–9/8, cuối tuần). Mô phỏng hôm nay 9/8: luật cũ cho 49 việc/8 ticket, luật mới
  43/6 — GW-610 và GW-660 hết bị báo oan, vì việc của chúng đang hiện ở khối "Cần bạn".
  `radarKeys` chỉ tính mục **còn mở**: mục đã tick là việc đã đóng, không phải lời nhắc; để nó giữ
  ticket trong radar thì một mục đã tick sẽ che hết mục còn mở của cùng ticket.
- **Mục "Cần bạn" chỉ tính bullet CÓ `[ ]`.** Board 11/8 để `## Cần bạn` làm heading cuối file nên
  **30 dòng Log bị ghi lọt vào** section đó dưới dạng bullet trần (board 3/8: 4 dòng). Đường đọc cũ
  nhận hết 34 dòng đó thành "việc cần bạn" — chưa ai thấy vì console cũ chỉ đọc board HÔM NAY.
  Số dòng bị bỏ được phơi ra trong `/api/debt` (`stray`) và hiện dưới khối nợ đọng: **bỏ thì bỏ ồn ào**.
- **Chống race khi ghi board**: client gửi `expectText`; server so với dòng hiện tại, lệch → **409**
  và không ghi (agent có thể đang ghi board cùng lúc). `expectText` được chuẩn hoá bằng
  `needyou.normalizeText` nên client gửi cả `~~`/marker vẫn khớp, không 409 oan.
- **Cảnh báo mốc: mốc `key` thắng, thiếu hết thì mới lấy `duedate`** (`lib/alerts.js`, 12/8 — vá
  lần thứ ba của cùng một lớp lỗi). Luật cũ cố ý loại `duedate` ("mốc hành chính") và **có test
  khoá lại**; lý do gốc vẫn đúng (GW-610: duedate Jira 29/7 nhưng mốc HTML 30/7 trong description
  mới là chuẩn) nên giữ nguyên. Nhưng luật cũ cũng im khi `duedate` là mốc DUY NHẤT ticket có:
  GW-720 `{duedate: 13/8}` phase `waiting-design` (due NGÀY MAI, "việc gấp nhất hôm nay" theo board)
  và GW-525 (due 14/8, `coding`) đều cho `/api/alerts` trả `[]` — và vì `server/index.js` bắn
  notification từ đúng mảng đó, `notified.jsonl` im 2 ngày liền, đúng 2 ngày chứa mốc gấp nhất.
  Giữ nguyên 3 mã `html-*` để `notified.jsonl` không bật lại toàn bộ; tên mốc trong text tự lấy từ
  vocab nên hiện "Due Jira".
- **Chặn đọc file tuỳ ý**: `/api/review*` chỉ nhận `repo` là **tên** khai trong `config.repos`, và
  path sau `path.resolve` phải nằm trong repo đó → ngoài whitelist trả 403 (đã test `repo=/etc`,
  `path=../../../../etc/passwd`).
- **Đặt tên class trong file style mới phải tra `styles/` trước.** Lightbox từng dùng `class="pane"`
  — trùng `.pane { display: none }` của pane tab (`tabs.css`) → khung so sánh 0×0, iframe scale 0%,
  nhìn như iframe không load. Đổi thành `.lpane`. Từ chung (`pane`, `row`, `head`) là bẫy.
- **Khu so sánh design ↔ dist**: iframe phải rộng ĐÚNG khổ của ảnh đang so (tên có `_MB` → 768px,
  còn lại 1920px) rồi mới `transform: scale(paneW/khổ)`. Để `width:100%` là trang chạy nhánh
  layout khác với ảnh → so hai thứ khác nhau. Cuộn đồng bộ theo TỈ LỆ, không theo px.
- **Phát hiện "tab vừa xong việc"** (`TerminalManager.watchIdle`): busy ≥30s rồi im ≥5s ⇒ thông báo.
  Đây là heuristic theo IM LẶNG của output, **không phải exit code** — agent lỗi cũng im như agent
  xong, nên nội dung thông báo không được nói "thành công".
- `POST /api/open` có whitelist (`~/VNG`, `agent-auto`) — đừng bỏ whitelist.
- **Cách đọc git** (`server/lib/git.js`): với mỗi repo trong `config.repos`, chạy
  `git log --author=<config.gitAuthor> --no-merges --since=<đầu tháng> --until=<đầu tháng sau>
  --date=format:'%Y-%m-%d %H:%M' --pretty='%h|%ad|%s' --shortstat` trên **branch đang checkout**,
  rồi gộp 4 repo và sắp theo ngày giảm dần.
  - `gitAuthor` phải là **EMAIL** (vd `ten@vng.com.vn`): git khớp cả name lẫn email, nên email bắt
    được mọi tên máy — repo này có cả `tont` và `tont-mac` cùng email, mỗi tên ~50% commit.
    Đặt tên máy (`tont`) sẽ vẫn chạy nhưng phụ thuộc chuỗi tên, dễ hụt khi thêm máy mới.
  - `--no-merges`: merge commit ("Merge branch 'master' of gitlab…") chiếm ~15% và không phải
    việc thật. Số merge bị loại vẫn được đếm riêng (`mergeCount`) và ghi rõ trên trục chart —
    loại bỏ nhưng không im lặng.
  - Chỉ thấy commit trên branch hiện tại; commit ở branch khác chưa checkout sẽ không hiện.
- **Đo effort per ticket** (`server/lib/activity.js`): dựa vào `state.issues[key].paths`
  (skill `/daily` gắn, console chỉ đọc). Chỉ tính **file code viết tay** — whitelist đuôi
  `js/ts/scss/css/twig/html/json/md/yml/php/py/sh…`, bỏ `dist/`, `node_modules/`, lock, `*.min.*`, ảnh.
  ⚠ **KHÔNG loại theo folder `assets/`**: repo này để SOURCE trong `assets/`
  (`assets/frame1/frame1.js|scss|twig`) — loại `assets/` là xoá sạch code viết tay (đã trả giá:
  3 commit logic hiện `+0/-0`). Đo thật: commit khởi tạo campaign = 120 file/+13.707 dòng nếu
  tính hết, nhưng chỉ **45 file code/+5.146 dòng** là việc thật.
- **`/api/git` chậm thật**: `git log --shortstat` phải diff từng commit, tháng nhiều commit lớn
  mất ~5s trên 4 repo. Đã xử lý bằng `lib/cache.js` (tháng đã qua TTL 6h, tháng hiện tại 60s →
  lần 2 còn 0.00s) + trạng thái "đang đọc git…" trên UI. Timeout git để 25s, đừng hạ về 8s.
- `responsive.css` **phải** import cuối cùng, nếu không container query bị `cards.css` ghi đè.
- **Icon = string SVG, không phải `<img>`**: webpack rule `{ test: /\.svg$/i, type: 'asset/source' }`
  đưa file lucide vào bundle nguyên văn để dán được vào HTML string mà panel render.
  `icons.js` bỏ `width/height` cứng và giữ `stroke="currentColor"` → cỡ theo `1em`, màu theo
  `color` của chỗ đặt (`.ic` trong `base.css`). Đừng nhúng màu vào icon.
- **Bảng task thay kanban** (2026-07-31): 8 cột kanban trong cột trái ~880px làm mỗi cột còn
  ~200px → note cắt giữa câu, hàng nút wrap 2 dòng, cột cuối bị cắt + tràn ngang. Bảng giữ
  các cột dữ liệu **cố định và chặt** (`table.css`) vì mỗi px tiết kiệm là px cho tên task;
  cột `Mốc kế` phải đủ 132px cho nhãn dài nhất `Design 08/10 · 10d`, cột `Actions` phải
  `white-space: nowrap` (wrap là dòng cao gấp đôi). Ô Effort chỉ hiện commit + dòng thêm —
  số dòng xoá ở tooltip/modal, nhồi cả +/− vào ô thì số bị cắt.
