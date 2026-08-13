# Radar nền tự chạy — thiết kế

Ngày: 2026-08-13 · Trạng thái: chờ duyệt · Liên quan: `skills/daily` mode `delta`

## 1. Vấn đề

`/daily delta` là radar quét thay đổi Jira + gt-promotion, chạy <1 phút. Hiện muốn chạy nền
phải: mở console → mở tab terminal mới → bấm nút `claude` → bấm nút `radar 30m` (gõ hộ
`/loop 30m /daily delta`). Tức mỗi phiên làm việc phải click lại từ đầu, và radar chết theo
tab. User muốn radar sống **cả ngày làm việc 8h–18h, kể cả khi chưa mở Claude Code**.

## 2. Bằng chứng đo được (13/8) — giả định cũ đã sai

Thiết kế cũ cấm cron hệ thống. Câu cấm nằm ở 2 chỗ và cùng dựa trên MỘT giả định chưa từng
được đo:

- `~/.claude/skills/daily/SKILL.md:93` — *"KHÔNG dùng cron hệ thống: connector Jira/SharePoint
  auth theo phiên tương tác nên phiên nền không có token → quét ra trắng và tưởng là 'không có
  gì mới'"*
- `console/src/core/constants.mjs:139-140` — cùng nội dung, làm lý do cho nút `radar 30m`

Đo thật hôm nay, 2 lượt:

| Phép đo | Lệnh | Kết quả |
|---|---|---|
| Phiên nền còn token Jira? | `claude -p "…searchJiraIssuesUsingJql…"` | **OK GW-720**, 16.6s |
| Phiên nền gọi được skill? | `claude -p "/daily status" --output-format json` | **Ra báo cáo đầy đủ**, 47.0s |

⇒ Giả định "phiên nền không có token" **sai**. Cron/launchd là đường khả thi, và là đường
ngắn nhất tới yêu cầu. Hai ghi chú trên phải sửa lại kèm bằng chứng, nếu không lần sau lại có
người (kể cả AI) đọc và tự cấm mình.

## 3. Phạm vi

**Làm:** đồng hồ launchd + script 1 lượt (`radar-tick.mjs`) + sổ `history/radar.jsonl` +
notification + dòng trạng thái radar trong console + sửa 2 ghi chú sai + bài học.

**KHÔNG làm (phi mục tiêu):**
- Không đẻ logic quét mới. Mọi luật (JQL, pull gt-promotion, refresh `months.json`, ghi
  state/board) ở nguyên trong skill `daily`. Radar chỉ là **cái tay bấm**.
- Không đụng luồng hiển thị delta của console: thanh "N thay đổi" đã đọc thẳng
  `history/issues.jsonl` + `phases.jsonl` mà `/daily delta` vẫn ghi — radar chạy là nó tự tươi.
- Không ghi ngược Jira, không commit/push (giữ nguyên luật của skill `daily`).
- Không chạy mode nặng (`/daily` trọn luồng, `code-developer`) ở phiên nền.

## 4. Kiến trúc

| File | Vai trò |
|---|---|
| `~/Library/LaunchAgents/com.tont.agent-auto.radar.plist` | Đồng hồ. `StartInterval 1800` + `RunAtLoad`. **Không** dùng `StartCalendarInterval` (110 dòng cho 8–18h × T2–T6) — để script tự chặn giờ, dễ đọc và test được |
| `tools/radar-tick.mjs` | Bộ não 1 lượt: 3 cổng chặn → gọi `claude -p` → so trước/sau → ghi sổ → báo |
| `tools/radar-tick.test.mjs` | Test thuần cho các hàm cổng (nếp `node --test` sẵn có) |
| `config.json` → khoá `radar` | Công tắc + tham số giờ, để đổi mà không sửa code |
| `history/radar.jsonl` | Sổ cái mỗi lượt |
| `console/server/routes/radar.js` | `GET /api/radar` — đọc sổ, trả trạng thái |
| `console/src/panels/todayPanel.js` | 1 dòng trạng thái radar cạnh thanh delta |
| `console/src/core/constants.mjs` | Nút `radar 30m` → công tắc bật/tắt + gỡ ghi chú sai |
| `~/.claude/skills/daily/SKILL.md:93` | Gỡ câu cấm cron, thay bằng bằng chứng mục 2 |
| `knowledge/lessons.md` | Bài học: giả định chưa đo mà thành luật cấm |

### Một lượt tick

```
launchd (mỗi 60', và ngay khi login/thức máy)
 └─ node tools/radar-tick.mjs
     ① Cổng GIỜ    config.radar.enabled + T2–T6 + 08:00–18:00
                   → ngoài khung: exit 0, KHÔNG ghi sổ (tránh 300 dòng rác/ngày)
     ② Cổng LOCK   .locks/radar.lock còn sống <15' → bỏ lượt (ghi sổ skipped=locked)
     ③ Cổng NGƯỜI  state.json / board hôm nay đổi <3' → bỏ lượt (skipped=human)
     ④ chụp "trước": hash state.json + số dòng issues.jsonl, phases.jsonl
     ⑤ claude -p "/daily delta" --allowedTools <whitelist> --output-format json (timeout 5')
     ⑥ chụp "sau" → suy ra changed
     ⑦ ghi 1 dòng history/radar.jsonl
     ⑧ changed → notification macOS (osascript, dùng lại nếp console/server/lib/notify.js)
     ⑨ nhả lock (kể cả khi lỗi — try/finally)
```

### Ba cổng chặn (hàm thuần, test được)

```js
shouldRunNow(date, cfg)   // ① → true/false
lockState(lockPath, now)  // ② → 'free' | 'busy' | 'stale'
humanBusy(paths, now)     // ③ → true nếu file nào đó đổi < graceMs
```

`config.json` thêm:

```json
"radar": { "enabled": true, "days": [1,2,3,4,5], "hours": [8, 18],
           "graceMin": 3, "lockStaleMin": 15, "timeoutMin": 5 }
```

Công tắc bật/tắt = sửa `radar.enabled` (console ghi được ngay, không cần `launchctl`).
`launchctl` chỉ dùng khi gỡ hẳn.

### Cổng ③ — vì sao né-theo-dấu-vết chứ không lock thật

Lock thật giữa radar và phiên bạn gõ tay đòi sửa skill `daily` bắt nó xin lock trước mỗi lần
ghi — thêm ma sát vào đường chạy chính, mà đường đó là đường dùng nhiều nhất. Chọn né theo
mtime vì `state.json` đã có backup mỗi lần ghi (`.backups/state`, hiện 29 bản) nên kịch bản
xấu nhất là **hồi lại được**, không phải mất dữ liệu. Đổi lại: cửa sổ tranh chấp vẫn tồn tại
về lý thuyết (phiên tay đọc lúc T, ghi lúc T+5'). Chấp nhận, và ghi rõ ở đây để sau này ai đọc
biết đó là lựa chọn có ý thức chứ không phải sót.

## 5. Lệnh headless và whitelist quyền

```
claude -p "/daily delta" \
  --allowedTools "Skill,Read,Write,Edit,ToolSearch,Glob,Grep,\
Bash(git:*),Bash(node:*),Bash(cp:*),Bash(mkdir:*),Bash(ls:*),Bash(cat:*),Bash(date:*),\
mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql,\
mcp__claude_ai_Atlassian__getJiraIssue,\
mcp__claude_ai_Atlassian__getAccessibleAtlassianResources" \
  --output-format json
```

- `Skill` **bắt buộc** có trong whitelist — đây là tool nạp `/daily`.
- Phiên nền không có ai bấm "Allow", nên tool ngoài whitelist làm tick chết câm. Vì vậy mọi
  lần bị từ chối phải vào sổ (`err`) để nới đúng cái thiếu, thay vì mở toang.
- Không dùng `--dangerously-skip-permissions` (user đã chốt).
- `--output-format json` để lấy `is_error`, `duration_ms`, `total_cost_usd` ghi sổ.
- `cwd` = `/Users/lap17727/VNG/agent-auto`.

## 6. Xử lý lỗi

| Hỏng | Radar làm gì |
|---|---|
| `claude -p` lỗi / timeout 5' | Ghi `ok:false`, **không** báo ngay. 3 tick liên tiếp hỏng (~1h30) → 1 notification |
| Hết hạn đăng nhập Claude | Báo NGAY — đây đúng ca "quét trắng mà tưởng không có gì mới" |
| Không VPN / gitlab nội bộ chết | Skill đã có nếp "pull fail → báo 1 dòng, đi tiếp"; vẫn quét Jira. Radar ghi vào sổ |
| Máy ngủ / chưa login | launchd bỏ nhịp, tỉnh dậy chạy 1 lượt. Không dồn nhịp |
| Tick trước chưa xong | Cổng ② bỏ lượt, không chồng phiên |
| Tool bị từ chối quyền | Vào `err`, báo sau 3 lần lặp để còn nới whitelist |

## 7. Quan sát

`history/radar.jsonl`, mỗi lượt 1 dòng:

```json
{"at":"2026-08-13T14:07:03+07:00","ok":true,"skipped":null,"ms":47018,
 "changed":true,"newRows":{"issues":3,"phases":1},"costUsd":0.12,"err":null}
```

`GET /api/radar` → `{ enabled, last, lastChangedAt, failStreak }`. Console tab "Hôm nay" hiện
1 dòng cạnh thanh delta: *"Radar 14:07 · OK · 0 thay đổi"*, chuyển đỏ khi `failStreak ≥ 3`
hoặc lượt cuối quá 90' **mà thời điểm đang xem nằm trong khung giờ chạy**. Không có vế sau thì
dòng này đỏ suốt đêm và cả cuối tuần — lúc đó radar im là đúng thiết kế, báo đỏ là báo sai.
Ngoài khung giờ hiển thị *"Radar · ngoài giờ (08–18 T2–T6)"*; `enabled:false` hiển thị *"Radar · tắt"*.

Lý do bắt buộc có dòng này: không có nó thì **"im vì yên" và "im vì chết" trông giống hệt
nhau**. Đây đúng cái bẫy đã trả giá 6/8 với `months.json` (console vẽ số cũ, user mất tin).

## 8. Bằng chứng trước khi gọi là xong

Test thuần (`node --test`, nếp sẵn có):

| Cổng | Ca phải đúng |
|---|---|
| Giờ | CN/T7 → không · 7:59 không · 8:00 có · 18:00 có · 18:01 không · `enabled:false` → không |
| Lock | không lock → chạy · lock 2' trước → bỏ · lock 20' trước (chết treo) → chạy + gỡ lock |
| Người | `state.json` đổi 1' trước → bỏ · 10' trước → chạy |
| So trước/sau | `issues.jsonl` +3 dòng → `changed:true` · không đổi → `changed:false` |

Nghiệm thu thật (không được thay bằng suy luận):
1. Chạy 1 tick tay giữa giờ → `radar.jsonl` có dòng, `state`/`board` đổi đúng
2. Chạy 1 tick ngoài giờ (giả bằng config) → không chạy, không ghi sổ
3. `launchctl bootstrap` → đợi **đúng 1 nhịp thật** → sổ có dòng do launchd sinh ra
4. Chỉ sau bước 3 mới được báo xong

## 9. Rollout và tắt khẩn

- Ngày đầu: bật, theo dõi `radar.jsonl` hết 1 ngày làm việc trước khi tin.
- Tắt nhanh: `config.radar.enabled = false` (nút console) — tick vẫn nổ nhưng thoát ngay.
- Gỡ hẳn: `launchctl bootout gui/$UID/com.tont.agent-auto.radar`.
- `.locks/` thêm vào `.gitignore`.

## 10. Rủi ro — kết quả sau khi dựng thật (13/8)

1. **SSH key dưới launchd — ĐÃ ĐÓNG, không phải vấn đề.** Lượt launchd 11:54 chạy `/daily
   delta` trọn vẹn, log board ghi `git pull` gt-promotion *"Already up to date"*.
2. **Bẫy thật lại nằm ở `node` — ĐÃ VÁ.** Nhịp launchd đầu tiên chết ngay ở dyld
   (`last exit reason = OS_REASON_DYLD`, sổ radar trắng trơn): `zsh -lc` là login shell nên
   KHÔNG nạp `.zshrc`, mất nvm, nhặt phải `/opt/homebrew/bin/node` 25.6.0 đã vỡ
   `libllhttp.9.3.dylib`. Cả `node` lẫn `claude` đều nằm dưới `~/.nvm` ⇒ plist phải tự
   `. "$NVM_DIR/nvm.sh"` (không hardcode số version, để nvm nâng bản vẫn chạy).
   Bài học chung: **launchd im lặng ≠ launchd chạy** — phải đợi 1 nhịp thật rồi đọc sổ.
3. **Chi phí — đo thật, cần user quyết.** Một lượt tốn **$0.98–1.04** (131s và 111s). Nhịp 30'
   trong 08–18h ≈ 21 lượt ⇒ **~$20/ngày**. Nút vặn đã dựng sẵn (`config.radar.model`) nhưng
   đo ra không đáng dùng: `sonnet` rẻ 32% (**$0.71**) mà **bỏ luôn bước ghi log board** (lượt
   11:58 `ok:true` nhưng board dừng ở 11:54) — radar rẻ mà vô hình thì phản tác dụng. Vì phần
   tốn là khối lượng đọc file chứ không phải model, **lever thật là nhịp**: 60' ≈ $10/ngày,
   4 lượt/ngày (9/11/14/16h) ≈ $4/ngày. Đổi nhịp = sửa `StartInterval` trong plist rồi
   `tools/radar-install.sh install`.
4. **Cửa sổ tranh chấp ghi** với phiên gõ tay — xem mục 4, đã chấp nhận có ý thức.
