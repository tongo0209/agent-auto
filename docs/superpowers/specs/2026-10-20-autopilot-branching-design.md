# Autopilot — lựa chọn ở từng stage (rẽ nhánh trong 1 run)

Ngày: 2026-10-20 · Trạng thái: chờ user duyệt spec · Nhánh: `autopilot-lab`

## 1. Vì sao

User thấy autopilot "chỉ đi 1 luồng dài, không có lựa chọn ở từng mốc". Hiện trạng đo được:

- 7 luồng trong `flows/*.json` đều là chuỗi thẳng; rẽ duy nhất là vòng lặp tự động (`loop.back`) và `onReject`.
- 3 mốc chờ người (`approve-plan`, `design-gap`, `approve-result`) chỉ có Duyệt / Trả về + ghi chú; API nhận 7 action (`autopilot-ui/api.mjs:96`).
- Router tự chọn luồng, luật `when` tự bỏ stage — user không chỉnh được trước khi chạy.
- Đợt thử 7 luồng 20/10: 6/7 run dừng sớm (plan fail, fetch-design fail, clone fail, budget) và chỉ có Chạy tiếp / Huỷ.

Ảnh tham chiếu lưu ở `docs/notes/autopilot-refs/`: ảnh 1 (pipeline + biên nhận) cũng là đường thẳng có vòng lặp có trần; ảnh 2 (wave board) là điều phối **nhiều task** có phụ thuộc — một subsystem khác.

**User chốt:** làm rẽ nhánh trong 1 run trước (spec này); wave board là spec riêng làm sau.

## 2. Mục tiêu và ràng buộc

| Mục tiêu | Đo bằng |
|---|---|
| Có lựa chọn ở mọi stage | Bấm ô stage bất kỳ trên pipeline thấy các hành động hợp lệ lúc đó |
| Chỉnh luồng trước khi chạy | Màn xem trước: đổi luồng, tắt stage, đặt điểm dừng |
| Agent đưa phương án | `approve-plan` hiện 2–3 phương án A/B/C để chọn khi việc có nhiều cách |
| Gỡ được khi hỏng | Run `stopped` có Chạy lại / Bỏ qua / Quay về / Mở trong Claude |

**Giữ nguyên:** mặc định vẫn tự chạy một mạch (mục tiêu "bớt trông phiên" của spec gốc); chỉ dừng ở điểm dừng user đặt, mốc duyệt sẵn có, hoặc khi hỏng.

**Không làm:** wave board / nhiều task song song; nhóm biên nhận Cycle/Build như ảnh 1; nhảy tới stage phía trước bằng `goto`; luồng dạng đồ thị khai báo nhánh trong JSON (phương án B đã loại).

## 3. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Bộ hành động chung ở engine, không viết lại 7 file luồng | Phủ "lựa chọn ở mọi stage" với 1 chỗ code; flow JSON giữ nguyên |
| D2 | Gate được bỏ qua nhưng **bắt buộc lý do**, biên nhận đỏ, cảnh báo ở `approve-result` | Giữ tinh thần "gate chặn bug lọt QC" mà không khoá cứng user |
| D3 | `goto` chỉ lùi về stage đã đi qua | Nhảy tới đã có `skip` từng bước; tránh tới stage thiếu đầu vào |
| D4 | Console đi qua CLI (`actionArgs` → `autopilot <lệnh>`) | 1 chỗ kiểm luật; bấm được thì gõ được |
| D5 | Server tính `actions` hợp lệ, UI chỉ vẽ | Nút console không lệch với thứ CLI chấp nhận |

## 4. Engine (`tools/lib/autopilot/engine.mjs`, `driver.mjs`)

### 4.1 Trường mới trên run

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `plan.disabled` | `string[]` | Stage user tắt lúc bắt đầu. Đi qua ⇒ biên nhận `{verdict:'skipped', note:'tắt từ đầu'}` + `skipReason` nếu là gate — cùng cách luật `when` đánh dấu skipped (412d573) |
| `plan.breakpoints` | `string[]` | Stage cần dừng **sau khi chạy xong**: run ⇒ `paused`, `stopReason: 'breakpoint:<stage>'`, kết quả stage giữ nguyên, `stage` đã trỏ sang stage kế |
| `choice` | `{ id:'A'\|'B'\|'C', title, note? } \| null` | Phương án user chọn ở `approve-plan`; `stageVars` đưa vào prompt `implement` |
| `gateSkipped` | `{ stage, reason, at }[]` | Mọi gate bị bỏ (tắt từ đầu hoặc `skip`) |

`createRun` nhận thêm `disabled = []`, `breakpoints = []`; validate: tên stage phải có trong flow, tắt gate phải kèm `skipReason`.

### 4.2 Event mới

Áp lên run `paused` hoặc `stopped` (kể cả `interrupted`); run `running` ⇒ từ chối.

| Event | Hành vi | Từ chối khi |
|---|---|---|
| `retry` `{note?}` | `stage` giữ nguyên, `loops[stage]=0`, status `running`, `rejectNote=note` | — |
| `goto` `{stage, note}` | `stage=target`, reset `loops` của mọi stage từ target trở đi, `rejectNote=note`, status `running` | target chưa có biên nhận (chưa đi qua) hoặc là stage hiện tại |
| `skip` `{reason?}` | Ghi biên nhận `skipped-by-user`, đi tiếp như `advance` | stage là gate (`kind:'gate'` hoặc id `ui-check`) mà không có `reason`; stage là `pause` (dùng approve) |
| `pick` `{option, note?}` | Ghi `choice`, rồi như `approve` | stage không phải `approve-plan`; plan không có phương án; `option` không có trong plan |

`isGateLike(stage) = stage.kind === 'gate' || stage.id === 'ui-check'` — 1 hàm dùng chung cho engine, CLI, `actions`.

### 4.3 Driver

- Trước khi chạy stage: `stage.id ∈ plan.disabled` ⇒ `applyEvent({type:'skip', reason, receipt})` rồi `continue`.
- Sau khi stage `pass`/`approve`/`skip` mà `stage.id ∈ plan.breakpoints` ⇒ `halt` với `breakpoint:<id>`, status `paused`.
- `approve-result`: nếu `gateSkipped.length` ⇒ `announce` ghi rõ số cổng đã bỏ.

### 4.4 Phương án ở bước plan

- `flows/prompts/plan.md`: thêm mục bắt buộc `## Phương án` — 2–3 dòng `### A · <tên>` + cách làm + đánh đổi; chỉ 1 cách hợp lý ⇒ ghi `### A · <tên>` duy nhất (không bịa lựa chọn).
- `plan-review.md`: soát phần phương án (có đánh đổi thật, không trùng nhau).
- Hàm thuần `parseOptions(planMd) → [{id,title,body}]` trong `format.mjs`; `implement.md` thêm biến `{{choice}}`.

## 5. CLI + API

### 5.1 CLI (`tools/autopilot.mjs`)

```
autopilot route <KEY|link> --json                 # luồng + lý do + stage[{id,kind,gateLike,when,predicted}]
autopilot run   <KEY|link> [--flow X] [--skip a,b] [--skip-reason "…"] [--break c,d]
autopilot retry <KEY> [--note "…"]
autopilot goto  <KEY> <stage> --note "…"
autopilot skip  <KEY> [--reason "…"]              # gate: bắt buộc
autopilot pick  <KEY> <A|B|C> [--note "…"]
autopilot break <KEY> <stage> [--off]
```

- `predicted` của `when`: `'run' | 'skip' | 'unknown'` (luật phụ thuộc file chưa sửa ⇒ `unknown`).
- Lệnh lựa chọn: kiểm điều kiện qua cùng hàm `allowedActions` (5.3) ⇒ sai thì `die` mã ≠ 0 kèm lý do; đúng ⇒ `applyEvent` rồi `continueRun` dưới lock `run` (`tools/autopilot.mjs:75`).
- `break` chỉnh `plan.breakpoints` trên run mọi trạng thái trừ `done`; không chạy tiếp run.

### 5.2 API (`autopilot-ui/api.mjs`, `server.mjs`)

- `actionArgs`: whitelist thêm `retry`, `goto`, `skip`, `pick`, `break`; kiểm `stage` `/^[a-z][a-z-]*$/`, `option` `/^[ABC]$/`; `run` nhận `skip`, `skipReason`, `breaks`.
- `GET /api/autopilot/preview?input=…[&flow=…]` ⇒ `route --json`. Chỉ đọc, không vướng cổng 403.
- Mọi lệnh ghi vẫn sau `AUTOPILOT_LAB_WRITES`.

### 5.3 Dữ liệu cho UI

Run trả về thêm:
- `actions`: `allowedActions(run, flow)` — mảng `{type, stage?, needsReason?}`, hàm thuần trong `engine.mjs`, CLI và API cùng gọi.
- `options`: `parseOptions(plan.md)` khi stage là `approve-plan`.

## 6. UI (`autopilot-ui/web/views/autopilot.js`, `views.css`)

Mọi nút sinh từ `run.actions`; hành động không hợp lệ thì không hiện.

### 6.1 Xem trước khi chạy
Palette nhận input ⇒ gọi `preview` ⇒ tấm Xem trước:
- Luồng + lý do router, ô chọn đổi luồng (gọi lại `preview` với `flow`).
- Chuỗi stage ngang cùng kiểu ô pipeline; mỗi ô: công tắc bật/tắt, 📍 dừng sau bước này. Tắt gate ⇒ ô lý do, thiếu thì nút Chạy khoá. `predicted:'skip'` ⇒ ô mờ "tự bỏ nếu không đụng UI/pm".
- **Chạy** (Enter) — không chỉnh gì thì Enter thẳng như hiện nay.

### 6.2 Menu trên ô pipeline
Bấm ô ⇒ menu nhỏ dưới ô:
- Ô đã qua: *Quay về đây…* (ô ghi chú bắt buộc) ⇒ `goto`.
- Ô hiện tại khi dừng/hỏng: *Chạy lại* · *Bỏ qua* (gate ⇒ ô lý do) · *Mở trong Claude*.
- Ô phía trước: bật/tắt 📍 ⇒ `break`.

Ký hiệu: 📍 điểm dừng; viền đỏ nét đứt + "bỏ qua · <lý do>" cho stage user bỏ; nhãn vòng `×2` đổi thành "vòng 2/3" (trần từ `loop.max`); dòng chú thích màu dưới pipeline: xong · đang chạy · chờ bạn · dừng · bỏ qua.

### 6.3 Dock theo tình huống

| Tình huống | Nội dung |
|---|---|
| `approve-plan` có ≥2 phương án | Thẻ A/B/C (tên, cách làm 1–2 dòng, đánh đổi) + **Chọn A** (phím `1`/`2`/`3`) · *Trả về* (`R`) |
| `approve-plan` 1 phương án | *Duyệt* (`A`) · *Trả về* (`R`) như cũ |
| Run hỏng | Lý do dịch sang câu đọc được (`loop-exhausted:gates` ⇒ "hết vòng sửa ở gates (3/3)") + *Chạy lại* · *Bỏ qua* · *Quay về…* · *Mở trong Claude* · *Huỷ run* |
| Dừng ở 📍 | "Dừng theo 📍 sau <stage>" + *Chạy tiếp* · *Chạy lại <stage>* (= `goto <stage>`, vì `stage` đã trỏ sang bước kế) · *Quay về…* |
| `approve-result` có `gateSkipped` | Dải đỏ liệt kê gate + lý do; nút đổi thành "Duyệt dù đã bỏ N cổng" |

Bảng dịch `stopReason` → câu: 1 map trong `autopilot.js`, mã lạ thì hiện nguyên mã.

## 7. Lỗi và biên

- Lệnh lựa chọn khi run đang `running` ⇒ từ chối "run đang chạy — Dừng ngay trước".
- `goto`/`retry` trên stage `keepSession` (`implement`): phiên mới, không `--resume` (code đã đổi, tránh context cũ lệch).
- `pick` rồi `goto plan` ⇒ `choice` xoá về `null` (plan mới, phương án mới).
- Tắt hết stage `claude` ⇒ `preview` cảnh báo nhưng không chặn.
- Run cũ không có `plan`/`choice`/`gateSkipped` ⇒ đọc như mảng rỗng / `null` (không migrate file).

## 8. Kiểm thử

| File | Ca |
|---|---|
| `engine.test.mjs` | `retry`/`goto`/`skip`/`pick` trên paused + stopped; từ chối khi running; `goto` tới stage chưa qua; skip gate thiếu lý do; skip stage pause; `pick` sai stage/không có phương án; `goto` reset loops từ target; `goto plan` xoá `choice`; `allowedActions` từng trạng thái |
| `driver.test.mjs` | stage trong `disabled` ra biên nhận skipped + `gateSkipped`; breakpoint dừng đúng sau stage với `stopReason` đúng; run cũ thiếu trường mới chạy bình thường |
| `format.test.mjs` | `parseOptions`: 3 phương án, 1 phương án, không có mục |
| `tools/autopilot.test.mjs` | CLI thật trên run giả: `route --json`, `run --skip --break`, 4 lệnh lựa chọn đúng/sai, mã thoát |
| `api.test.mjs` | `actionArgs` action mới: hợp lệ, sai mẫu, thiếu lý do; `preview` trả JSON |
| Playwright 1920×1080 + 768×1024 | Xem trước, menu 3 loại ô, thẻ phương án + phím 1/2/3, run hỏng, dải gate bị bỏ, POST bị 403 khi tắt `AUTOPILOT_LAB_WRITES` |

Suite chốt: `node --test --test-timeout=20000 --test-force-exit autopilot-ui/*.test.mjs tools/autopilot.test.mjs tools/lib/autopilot/*.test.mjs`.

## 9. Sau spec này

Wave board (ảnh 2): 1 việc lớn chẻ thành item có phụ thuộc, chạy theo đợt, critical path — spec riêng, dựng trên `actions`/`plan` của spec này.
