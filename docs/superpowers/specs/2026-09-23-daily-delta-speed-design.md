# /daily delta nhanh hơn mà không mất bước

Ngày: 2026-09-23 · Dự án con 1 của đợt tăng tốc (sau `wall-scan`, spec `2026-09-23-wall-scan-design.md`).

## Vì sao chọn delta trước

`wall-scan --days 14`: `daily` 15h máy chạy, 111 lần gọi thì 96 là `/daily delta` do radar (launchd) gọi.
`history/radar.jsonl` từ 9/9: 83 lượt delta, **trung vị 255s, p90 368s, $1,96/lượt** (tổng 6,1h, $162) —
skill ghi mục tiêu "<1 phút". 94% lượt model của daily chạy `xhigh`, 14,4s/lượt, ~27 lượt/lần.

Việc của delta gần như toàn cơ học (git, so mốc giờ, đếm ngày) và mỗi bước kèm một bẫy đã trả giá
(`fetch` trước `log`, `--date=format-local`, cấm bọc `timeout`, so file con không so folder, mốc 48h).

**Bằng chứng rủi ro chất lượng**: `config.json` ghi "đo 13/8 sonnet rẻ 32% nhưng BỎ bước ghi log board
⇒ không dùng". Hạ model/effort mà không có cổng kiểm đủ bước = lặp lại lỗi đó.

## Ba thay đổi

### 1. `tools/delta-scan.mjs` — làm sẵn phần cơ học, in JSON gọn

Chạy 1 lệnh, thay cho các lượt model tự gõ git/so giờ:

- `jqlSince`: `state.lastRun` lùi 30 phút, format `yyyy-MM-dd HH:mm` giờ local. Thiếu `lastRun` → `null` + `jqlFallback: "-4h"`.
- `repos[<tên>]`: `gt-promotion-template` chạy `pull --ff-only`, repo còn lại `fetch --quiet`; rồi `log --since=<lastRun lùi 30'> --all --date=format-local:...`. Lỗi pull/fetch → `error` ghi vào repo đó, vẫn `log` phần local và đánh dấu `stale: true` (không chặn).
- `byTicket[KEY]`: commit có file nằm trong `state.issues[KEY].paths` (khớp `repo` + tiền tố `path`) → `{repo, hash, date, author, subject, files}`. Commit không khớp ticket nào chỉ đếm `untracked` theo repo.
- `monthsStale`: `history/months.json` có `generatedAt` ≠ hôm nay (local).
- `designScanDue`: ticket phase ∈ {`waiting-design`, `ready`, `coding`, `deliver`}, `design.status = đã-giao-đã-tải`, có `design.manifest` (dấu hiệu nguồn là FOLDER SharePoint — `design.host` thực tế gần như luôn trống, đo 23/25 ticket), `design.lastScanAt ?? downloadedAt` quá 48h và chưa `scanDue`.
- `driveCheck`: ticket cùng dải phase có `design.link` chứa `drive.google.com` → `{key, link, sourceModified}`; model gọi `get_file_metadata` so **từng file con** (`design.files` chỉ là số đếm `{psd: 3, …}`, không có id file).

Không ghi `state.json`/board (model vẫn là người ghi, qua đúng các cổng `guard-state`/`state-merge` đang có).
Git không bọc `timeout` shell; mỗi lệnh git dùng `timeout` của `execFileSync` (60s).

### 2. `skills/daily/SKILL.md` mode `delta` dùng kết quả script

Bước đầu của delta: `node tools/delta-scan.mjs` → dùng JSON cho bước (2)(2b)(5) và biết (4) có cần refresh không.
Model còn làm: (1) JQL với `jqlSince`, (3) bóc link sheet trong comment, (4) query snapshot khi `monthsStale`,
Drive metadata cho `driveCheck`, suy phase từ `byTicket` (luật "git chỉ NÂNG phase"), ghi state + board.
Các cảnh báo bẫy git ở bước (2)/(2b) thu về 1 dòng trỏ script (bẫy đã khoá trong code + test) — giữ nguyên
ca GW-805 về `lastRun` vì đó là luật của model (không đóng dấu khi JQL hỏng).

### 3. `radar-tick`: cổng đủ bước + nút effort

- **Cổng đủ bước** (chạy mọi lượt delta, bất kể model/effort): sau lượt claude, ghi vào dòng radar
  `steps = { board, lastRun, months }` — `board`: `boards/<hôm nay>.md` có mtime sau lúc bắt đầu lượt;
  `lastRun`: `state.lastRun` đổi so với trước lượt; `months`: `months.json` có `generatedAt` = hôm nay.
  Thiếu bước → `stepsMissing: [...]`, và báo như lượt hỏng (đếm vào `failStreak`) để không im lặng.
- **Nút effort**: `config.radar.effort` → `claude -p ... --effort <mức>`; trống = mặc định phiên (giữ hành vi cũ).
  Dòng radar ghi thêm `effort` để so trước/sau ngay trên `radar.jsonl`.

## Nghiệm thu

- Test đỏ→xanh cho `delta-scan` (repo git giả trong tmp: commit trong/ngoài `paths`, giờ `+0000` in đúng giờ local,
  `lastRun` vắng, mốc 48h, `monthsStale`) và cho `radar-tick` (`buildArgs` có `--effort`, `stepCheck`).
- Chạy thật `node tools/delta-scan.mjs` trên máy: JSON hợp lệ, thời gian < 20s.
- Chạy thật 1 lượt `node tools/radar-tick.mjs --force` với `effort` giữ mặc định, sau đó 1 lượt `radar.effort = "medium"`:
  cả hai phải `steps` đủ 3 bước. Chỉ khi lượt medium đủ bước mới để `medium` làm mặc định; thiếu bước → trả về trống, ghi lý do vào `_note`.
- So `ms` + `costUsd` hai lượt với trung vị 255s / $1,96.

## Ngoài phạm vi

`bugwatch` (13 lượt, trung vị 527s) và `bug-fixer-lite` là dự án con kế — dùng cùng khuôn (script cơ học + cổng đủ bước + effort theo pha).
7 lượt radar hỏng `duration_api_ms: 0` từ 9/9 không thuộc tốc độ, ghi nhận để điều tra riêng.
