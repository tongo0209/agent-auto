# Chạy thử trọn luồng chuẩn promotion — code lại GW-745 và so với bản cũ

Ngày: 2026-09-24 · Trạng thái: user đã duyệt thiết kế (brainstorming) · Commit: không push

## 1. Câu hỏi phải trả lời (kèm bằng chứng)

1. Quy trình chuẩn promotion mới (spec `2026-09-23-promotion-standard-enforcement-design.md`) có chạy
   trọn từ khoá gameplay tới **HTML bàn giao chuẩn** không, gãy ở đâu.
2. Bản code theo quy trình mới có tốt hơn bản cũ không.

Lỗ đã thấy trước khi chạy (phải kiểm chứng, không được coi là kết luận):

| # | Lỗ nghi | Dẫn chứng |
|---|---|---|
| L1 | `projects/` trống — chưa landing nào đi qua cửa vào R-PM-11 | `ls projects/` chỉ `.gitkeep` |
| L2 | Không có pha bàn giao trong `/code-developer`: `hooks-at` mặc định `handoff` nhưng không skill/agent nào sinh HTML bàn giao; `mk-handoff-html.py` chỉ được `rules/` nhắc | `grep -rl mk-handoff-html skills agents` 0 kết quả |
| L3 | Brief dev trong `code-developer` còn ghi `R-CDN-1..14` trong khi luật đã tới R-CDN-23 + R-SPR + R-JS + R-STR | `skills/code-developer/SKILL.md:24,182` |

## 2. Đối tượng

GW-745 — 3 landing convert Bomber: GNM (`gnmobinew`), GunPow (`gpn`), COS (`ovensmash`), cùng path
`products/<game>/landing/2026-request-landing-convert`. Loại promotion đã chốt lần trước: STT 22 mời bạn
bè nhận quà, mẫu `zsm`; khung clone `products/gno/landing/2026-request-landing-convert`.

## 3. Cách ly

- Worktree riêng của cdn-source: `~/VNG/git-vng/cdn-source-gw745-rerun`, nhánh cục bộ `exp/gw745-rerun`
  tách từ `tont` HEAD `6234e8fa8` (= master + 28 commit chưa merge; master không có gì tont thiếu). Commit trong nhánh được, **không merge master, không push**. Xong thì user quyết giữ/xoá.
- 3 campaign bomber trong worktree bị **xoá rồi dựng lại** từ khung gno như lần đầu.
- HTML bàn giao bản mới ghi vào `tasks/GW-745/rerun/handoff/` (gitignore theo `tasks/`), **không** ghi vào
  `gt-promotion-template`.
- File dự án `projects/<game>/<slug>.md` tạo mới qua `project-note init` (gitignore sẵn).

## 4. Chạy mù

Phiên code (manager + subagent) chỉ được đọc: `tasks/GW-745/brief.md`, `designs/GW-745/**` (asset đã bóc
ở `_auto-export`, không cắt lại), Jira GW-745, khung gno, mẫu zsm, `rules/`, `knowledge/lessons.md`, kit.
**Cấm đọc** 3 campaign bomber ở checkout chính, `dist2/` cũ, và thư mục bàn giao
`gt-promotion-template/622-Bomber-VNG/**`. Brief subagent ghi rõ danh sách cấm này.

## 5. Thứ tự

1. GNM một mình → gom lỗ quy trình.
2. GunPow rồi COS (không song song: dùng chung worktree, cùng `node_modules` gno).
- Luồng gãy ⇒ **ghi vào `tasks/GW-745/rerun/process-gaps.md` (bước · triệu chứng · `file:line` skill/rule),
  gỡ tay để chạy tiếp, KHÔNG vá skill/rule giữa chừng** — vá giữa chừng thì 3 landing không cùng quy trình.
- Mỗi landing đi đủ: `project-note path/init` → khoá (`lock`, `hooks-at`) → `/code-developer full` →
  pha tối ưu (`/clean-code`) → build → sinh HTML bàn giao (`mk-handoff-html.py`) → `pm-gate --page` +
  `pm-gate <file bàn giao>` → `layout-gate` → `landing-parity` → `fe-gate` → `/check-promotion 22` →
  `/ui-check` → `project-note refresh` + `log`.

## 6. Mốc so sánh

| Mốc | Là gì | Lấy ở đâu |
|---|---|---|
| v1 | bản bàn giao đầu 8/9 | cdn-source `a39c8fbf8` (`git worktree`/`git show` chỉ ở pha chấm, sau khi code xong) |
| vFinal | bản đã qua QC | cdn-source HEAD master + `promotion/index-<g>.html` ở gt-promotion |
| mới | bản chạy thử | worktree `exp/gw745-rerun` + `tasks/GW-745/rerun/handoff/` |

Pha chấm chỉ bắt đầu sau khi cả 3 landing mới đã build xong — lúc đó mới được mở bản cũ.

## 7. Thước đo (mỗi landing × 3 mốc)

| Trục | Đo bằng |
|---|---|
| Hợp đồng `pm__` | `pm-gate --page <dist>` + `pm-gate <HTML bàn giao>` — số 🔴/🟡 theo mã PG-* |
| Chuẩn vùng tự do | `layout-gate`, `landing-parity` (ref gno/zsm), `fe-gate`; grep đếm `@media` tay, `background-position` gõ tay, `setInterval` |
| Bug QC thật | Danh sách bug bản cũ đã dính: commit `(fix)` trên 3 path từ 8/9 tới 24/9 + `state.json issues.GW-745.bugsFromUser` + board 21/9. Mỗi bug soi trên bản mới: tránh được / vẫn dính / không áp dụng, có bằng chứng `file:line` hoặc ảnh |
| Giao diện | `/ui-check` trên dist, PC 1920×1080, MB 768×1024 (COS thiết kế 750) |
| Chi phí | thời gian máy chạy vs chờ user, token (`wall-scan`), số lần user can thiệp |
| Quy trình | `process-gaps.md` — mỗi lỗ có bước, triệu chứng, `file:line` |

Chấm "tốt hơn" = không kém vFinal ở hợp đồng + giao diện, và tránh được đa số bug QC của v1.
Thước đo nào không chạy được thì ghi "chưa đo" kèm lý do, không suy đoán.

## 8. Đầu ra

- `tasks/GW-745/rerun/report.md` — bảng điểm 3 landing × 3 mốc, danh sách bug QC tránh/dính, lỗ quy trình,
  mục `Bằng chứng:` theo R-EV.
- Spec vá quy trình (pha bàn giao + các lỗ tìm được) viết **sau**, ở phiên riêng.

## 9. Ranh giới

- Không commit/push `gt-promotion-template`, không đụng master cdn-source, không push agent-auto.
- Không vá skill/rule trong lúc chạy thử (chỉ ghi lỗ).
- Browser test: đóng session sau mỗi lượt, PC → MB reload đúng 1 lần.
