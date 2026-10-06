# `/code-developer full` — làm TRỌN task (design → bàn giao → hỏi push/release)

User chốt 6/10/2026: "báo làm trọn task" = chạy hết 7 pha dưới, không dừng giữa chừng chờ nhắc.
Điểm dừng hỏi user chỉ còn: điểm dừng BẮT BUỘC của SKILL.md (thiếu input, câu hỏi mở của spec, FAIL sau cap vòng…)
và **đúng 1 câu cuối** ở pha 7. Pha nào bỏ qua phải ghi lý do vào Tổng kết — im lặng bỏ = chưa xong.

| Pha | Việc | Lệnh / skill | Ra |
|---|---|---|---|
| 1 Lấy design | Jira → link SharePoint/Figma/PSD; tải FULL nguồn (memory "đủ phải đo theo nguồn") | `/daily` (references tải SharePoint) · link figma.com | `designs/<KEY>/` |
| 2 Check design | Đủ màn × locale × PC/MB chưa, chữ ẩn trong layer, font đã cài, trạng thái ô quà/popup thiếu | `/check-design` | danh sách thiếu → hỏi 1 lần nếu chặn code |
| 3 Cắt hình | PSD → `/psd-cut`; Figma → `/figma-cut`. Toạ độ từ `coords.json`, cấm cắt tay | skill tương ứng | `_auto-export/<slug>/assets/` |
| 4 Dựng UI | Promotion: `project-note` + khoá gameplay (R-PM-11) TRƯỚC dòng code đầu. Rồi analyst → dev → checker (≤2 vòng) như SKILL.md | pipeline `full` | campaign build được |
| 5 Đuôi chất lượng | Chạy hết bảng dưới, tự sửa tới sạch | — | bằng chứng từng cổng |
| 6 Bàn giao + commit | Theo loại landing (bảng dưới), tự commit cả 2 repo, báo lại hash | — | commit đã ghi |
| 7 Hỏi 1 lần | push cdn-source + push repo bàn giao + release (nếu có) — gộp 1 AskUserQuestion | AskUserQuestion | — |

## Pha 5 — đuôi chất lượng (tự chạy, không chờ user gọi)

Thứ tự là có chủ ý: sửa trước, tối ưu sau, đo lại trên bản tối ưu (memory "verify phải trên bản build-optimize").

1. `npm run build-dev` sạch → `fe-gate.mjs dist` (SKILL.md mục fe-gate).
2. `/ui-check` mọi trang trong `generateFile` × PC 1920×1080 + MB 768×1024 (H5 chỉ PC); lệch vị trí → `--autofix`.
3. Soát bẫy R-CDN-26..30 bằng mắt + đo: flex-shrink con sprite, grep selector `&` trong `dist/*.css`,
   tooltip/popover từng mục `rect.right <= innerWidth` PC+MB, placeholder VN không dấu ở en/cn/th + cmap font,
   nút play/slide video mở `.fancybox__iframe`. Bảng hover/focus/active/click (memory "kiểm đủ hover/focus/action").
4. Campaign mới/clone: `landing-parity.mjs <campaign>`.
5. Promotion: `pm-gate.mjs <file>` từng file `pm__` + `/check-promotion <loại> <file>` (R-PM-6 MUST) + QA kit (R-PM-10).
6. `/website-audit` → sửa luôn blocker + HIGH (font woff2 subset, ảnh nặng, meta, link gãy).
7. `/clean-code full <campaign>` (landing mới) — landing cũ chỉ vùng đã chạm.
8. `npm run build-pro` (hoặc `build-optimize` theo `package.json`) → chạy lại 1, 2, `pm-gate --page .` trên bản này.
9. `project-note refresh` + `log`.

Cổng nào FAIL mà không tự sửa được → ghi vào "Việc còn mở", vẫn đi tiếp pha 6 nhưng CẤM chữ "xong" cho cổng đó.

## Pha 6 — bàn giao theo loại landing

Đọc `config.js` + file dự án để biết loại; không rõ → hỏi (điểm dừng 1).

| Loại | Đích | Cách làm | Luật |
|---|---|---|---|
| **Promotion** (có `pm__`) | `gt-promotion-template/<game>/<request>/mainsite/` | mỗi `dist/<f>.html`: `mk-handoff-html.py --src dist/<f>.html --cdn https://cdn-mainsite-aka.vnggames.com/<campaign path>/dist/ --out mainsite/<tên>.html` → `prettier --print-width 200 --use-tabs --write` → `rsync -a --delete --exclude '*.html' --exclude '*.map' dist/ mainsite/assets/` → `check-handoff-sync.py --folder <game>/<request>` | R-HO-1..12 · KHÔNG đụng `Promotion/` |
| **Mainsite thuần → new-mainsite** | twig trong `new-mainsite` | theo `rules/repo-new-mainsite.md` | R-TWIG-1..7 · không có php ⇒ cấm claim verify runtime |
| **Mainsite thuần → vportal2view** | twig trong `vportal2view` (nhánh `master`) | theo `rules/repo-vportal2view.md`; không tạo thư mục chỉ chứa thư mục con | R-VP2-1..6 |

Commit (user chốt "tự commit, báo lại"):
- `cdn-source`: `git pull origin master` (divergent ⇒ `--no-rebase --no-edit`) rồi
  `git add -- <paths> && git commit --only -m "(<type>): …" -- <paths>` — cùng 1 lệnh, chỉ path của campaign (R-GIT-5).
- Repo bàn giao: chỉ path vừa ghi ở trên, format `/commit`. Báo lại hash + `git show --stat HEAD | tail -5` của từng repo.

## Pha 7 — đúng 1 câu hỏi cuối

Một AskUserQuestion, multiSelect, các lựa chọn có trong việc này:
- Push `cdn-source` (`git mr` → dừng ở tạo MR) · Push repo bàn giao (gt-promotion `develop` / new-mainsite / vportal2view)
- Release CMS vportal (chỉ vportal2view): release TỪNG FILE, tick checkbox rồi mới bấm, `1` của server không phải
  bằng chứng — đo URL real sau release (memory "CMS vportal release từng file"); cache thì clear trên `cms.vportal.vng.vn`.

User không chọn gì → dừng ở commit local, ghi vào Tổng kết. Hook `G-GIT-2`/`G-DEPLOY-1` hỏi thêm là bình thường, không lách.

## Tổng kết thêm cho mode full trọn gói

Thêm vào template SKILL.md 2 dòng:
- **Pha đã chạy:** `1✓ 2✓ 3✓ 4✓(2 vòng) 5✓ 6✓ 7 chờ user` — pha bỏ qua ghi `✗ <lý do>`.
- **Bàn giao:** đích + commit hash từng repo + kết quả `check-handoff-sync` / "chưa push".
