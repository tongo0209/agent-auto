# Nghiệm thu autopilot — chạy thật đợt đầu (20/10/2026)

Spec: `docs/superpowers/specs/2026-10-20-autopilot-design.md` §13. Chạy bằng `node tools/autopilot.mjs run <KEY>`, router tự chọn luồng.

## Hai ticket thật, tới mốc duyệt plan đầu tiên

| Ticket | Luồng (router) | Stage đã chạy | Lượt claude | Turns | Phút máy | $ | Campaign bị sửa? |
|---|---|---|---|---|---|---|---|
| GW-912 NTH Mã Mây Khai Vận | `landing-fix` (hasDesign · campaignExists) | plan r1 → plan-review r1 **revise, 3 blocking** → plan r2 → plan-review r2 pass | 4 | 56 | 8 | 4.49 | Không (`git status` sạch) |
| GW-882 Total Football skin | `landing-fix` (hasDesign · campaignExists) | plan r1 → plan-review r1 pass | 2 | 29 | 3 | 1.88 | Không |

Vòng review có ích thật: plan-review vòng 1 của GW-912 bắt 3 lỗi mà plan bỏ sót. Đó là bẫy kit §6.2 (lib xoá `#rewardContainer` rồi đổ lại markup, nên chỗ code định ghi sẽ bị đè), nút x10 bị cứng `.off` nên không bấm được, và kỳ vọng verify x10 không làm được với mock đang có. Plan vòng 2 đã sửa cả 3.

Trong lúc chạy không cần người trông. Run dừng đúng ở `approve-plan`, có noti macOS, statusline hiện `🤖 GW-912 giữ 2026-ma-may-khai-van +1` và trang autopilot hiện plan, receipts cùng nút Duyệt/Trả về.

## So với baseline (`docs/notes/wall-baseline-2026-09-23.json`, 14 ngày)

| | `/code-developer` gõ tay (baseline) | autopilot (đến mốc plan) |
|---|---|---|
| Thời gian máy / run | median 53 phút (cả task) | 3–8 phút (chỉ plan + review) |
| Chờ người trong lúc chạy | ~31 phút/run | 0 (chỉ chờ ở mốc duyệt) |
| Turns / run | 66.5 | 29–56 |
| $ / run | baseline không đo | 1.88–4.49 |

**Chưa kết luận được về chi phí cả vòng.** Hai run mới đi tới mốc plan. Tiêu chí §13 (đắt hơn quá 1.5× mà không giảm vòng fix hay bug lọt QC thì phải báo user) chỉ đo được khi run đi hết `approve-result → commit`. Khi đó cập nhật bảng này.

## Lỗi chỉ lộ ra khi chạy thật / review, đã sửa

- Tiêu đề plan đã có sẵn `(feat):`, nên commit message bị lặp thành `(fix): (feat): …`. Đã sửa ở commit 17c9d53.
- Run thứ 2 trên cùng campaign ghi đè quyền giữ của run trước. Giờ bị từ chối (f56b4de).
- Phát hiện từ review độc lập, đã sửa ở e4aed6d:
  - landing-new không commit gì vì file chưa track; đã chuyển sang `git status -z -uall`.
  - Budget phút tính luôn thời gian chờ duyệt.
  - Hai process có thể cùng chạy một run.
  - Lệnh abort bị process nền ghi đè.
  - Campaign mà intake mới biết giữa chừng không được giữ.
  - Stage ném lỗi làm run kẹt ở `running`.

## Việc tiếp

- Duyệt hoặc trả về plan GW-912 và GW-882 ở http://127.0.0.1:4800 (`node autopilot-ui/server.mjs`).
- Sau khi chạy hết vòng, điền cột chi phí cả task + số vòng fix + bug QC lọt vào bảng trên.
