# Design v2: /daily — Luồng lớn dài hạn (vòng đời task + tuần + học + intake + delta)

**Ngày:** 2026-07-30 · **Trạng thái:** Đã duyệt · Kế thừa spec v1 (`2026-07-30-daily-orchestrator-design.md`)

## Quyết định đã chốt với user (vòng brainstorm 2)

| Câu hỏi | Chốt |
|---|---|
| Ưu tiên | A (vòng đời) → F (tuần/capacity) → C/D/E. **Bỏ B** (tự gửi báo cáo Teams/Outlook) |
| Giao HTML cho promotion | KHÔNG phải mọi task — chỉ task có kênh promotion. Nhận diện bằng folder `gt-promotion-template/<game>/<slug>-<nexusId>/` (quy ước user đang dùng, đã thấy thật: `A49-CFL/h5rungkybi-56985/mainsite/index.html`, commit tont 30/7). Landing thuần mainsite bỏ qua phase giao. |
| Nguồn buglist | (1) sheet cố định per-game → lưu `config.bugSheets` hỏi 1 lần nhớ mãi; (2) link sheets trong comment Jira → quét mỗi lần chạy |

## A. Vòng đời task — phase per ticket trong state.json

`🕐 waiting-design → 📐 ready → 💻 coding → 📦 deliver → 🧪 wait-test → 🐛 bugfix → ✅ done-fe`
(`deliver` chỉ áp cho task có kênh promotion; task thuần mainsite nhảy coding → wait-test)

Dò phase mỗi lần /daily chạy:
- Design giao chưa: SharePoint search (v1) hoặc file trong `tasks/<KEY>/design/` → waiting-design → ready.
- Kênh promotion: tồn tại folder `<gtPromotionRoot>/<game>/<slug>-<nexusId>/` → task có phase deliver.
  Sau code xong: chép output HTML vào `<folder>/mainsite/`, user review + TỰ push.
- Động tĩnh promotion: đầu phiên `git pull` gt-promotion (timeout 60s, fail thì báo + đi tiếp);
  commit mới đụng folder task đang theo dõi → báo "promotion vừa cập nhật X" + xem diff tóm tắt.
- Buglist: link sheets trong comment Jira mới HOẶC user báo đợt mới trên sheet cố định → phase bugfix,
  soạn lệnh `/bug-fixer-lite <sheet> <project>` (CLI).
- Trễ mốc: phase thực tế chậm hơn mốc timeline (đã bóc từ ticket, lưu `state.issues[key].milestones`)
  → cảnh báo ⏰ đầu báo cáo.

## F. `/daily week` — kế hoạch tuần + capacity

Gom mọi mốc 14 ngày tới từ state → bảng tuần; cảnh báo DỒN MỐC khi ≥2 mốc HTML cách nhau <3 ngày;
gợi ý thứ tự bắt đầu (mốc gần + effort lớn trước). Dashboard thêm dải "Tuần này" trên cùng.

## C. Vòng học — `knowledge/metrics.jsonl`

`wrap` ghi mỗi task xong 1 dòng JSON: `{key, type, lane, estimate, actualMachine, actualWait, fixRounds, issues[], date}`.
`plan` đọc metrics cũ cùng loại để ước lượng. Knowledge chuyên môn code vẫn thuộc code-developer learn.

## D. `/daily add <link|text>` — intake ngoài Jira

Link nexus/sheet/text dán → tạo `tasks/ADHOC-<n>/brief.md` + dòng board + phân loại như thường.
ADHOC cũng có phase như ticket Jira. Board = MỘT chỗ nhìn mọi việc.

## E. `/daily delta` — radar trong ngày

Quét siêu nhẹ: (1) JQL `updated >= -4h` trên các key đang theo dõi + key mới; (2) `git log` mới
gt-promotion. CHỈ báo thay đổi + cập nhật board, không code, không hỏi. Dùng kèm `/loop 30m /daily delta`.

## Config mở rộng

```json
{
  "bugSheets": {},          // per game/project, hỏi 1 lần khi gặp
  "adhocCounter": 0
}
```
(Đường dẫn gt-promotion dùng key có sẵn `repos.gt-promotion-template` — không thêm key mới.)

## Không làm (YAGNI)

Tự gửi Teams/Outlook · tự push git · ghi ngược Jira · cron nền · webhook.

## Nghiệm thu

- A: lần /daily kế tiếp báo đúng phase 4 ticket hiện có (GW-660 coding, GW-654/477 chờ xác nhận design, GW-525 waiting-design) + phát hiện commit promotion mới khi có.
- F: /daily week ra bảng có cảnh báo dồn mốc 3/8+5/8.
- D: /daily add 1 link tạo được ADHOC task.
- E: /daily delta chạy <1 phút, chỉ báo thay đổi.
