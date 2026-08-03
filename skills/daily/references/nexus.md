# Tra cứu: nối ticket ↔ folder qua nexusId, suy phase từ git, ghi metrics

Cắt nguyên văn từ `SKILL.md` (gọn hoá lần nâng cấp 2026-08-03). `SKILL.md` giữ lại 1 dòng luật
"Git chỉ NÂNG phase, không HẠ"; chi tiết đoán nexusId/fuzzy folder, bảng suy phase, và cách đếm
metrics nằm ở đây.

## Bước 2b — Nối git ↔ ticket (nền tảng của phase thật + metrics)

Mỗi ticket cần biết nó "sống" ở folder nào. Lưu `state.issues[KEY].paths` =
`[{repo, path}]` + `pathsConfirmed`. Ticket đã có `pathsConfirmed: true` → BỎ QUA, không đoán lại.

**Đoán, theo thứ tự:**

1. **Neo chắc theo nexusId** — `ls <gt-promotion>/*/ | grep -- "-<nexusId>$"`. Trúng → nhận luôn
   (không hỏi). Đã kiểm thật: GW-660 nexusId 56985 ⇒ `A49-CFL/h5rungkybi-56985`.
2. **Fuzzy cdn-source** — bỏ dấu tên event trong summary → tách token (`Rừng Thu Kỳ Bí` →
   `rung thu ky bi`) → so với `ls products/*/landing/ products/*/mainsite products/*/skin-*`;
   điểm = số token trùng trong tên folder. Hợp lệ khi ≥2 token.
   ⚠ Slug thật hay LỆCH tên ticket (`2026-rung-ky-bi` thiếu chữ "thu") → đừng khớp tuyệt đối.
3. Một ứng viên điểm cao nhất VÀ cao hơn hạng nhì → tự nhận, ghi 1 dòng board.
   Bằng điểm / không có ứng viên → đưa vào **bảng duyệt kế hoạch Bước 3** để user chọn
   (KHÔNG thêm cổng hỏi mới; user chọn "không có" cũng ghi `pathsConfirmed: true` để khỏi hỏi lại).

**Suy phase từ commit thật** (`git -C <repo> log --author=<gitAuthor> --no-merges --since=7.days --oneline -- <path>`):

| Điều kiện | Phase |
|---|---|
| Có commit ≤7 ngày trong path cdn-source | tối thiểu `coding` |
| Có commit trong path gt-promotion (`…/mainsite/`) | `deliver` |
| Không commit + chưa có design | giữ `waiting-design` |
| Phase hiện tại ∈ {wait-test, bugfix, done-fe} | **KHÔNG hạ** về coding |

Git chỉ NÂNG phase, không HẠ — một commit sửa vặt sau khi giao QC không được làm task nhảy lùi.

**Ghi metrics** (thay cho việc gõ tay — đây là lý do `metrics.jsonl` sẽ tự đầy): với mỗi ticket
có `paths`, đếm bằng `--numstat` rồi append `knowledge/metrics.jsonl`:
`{"date","key","month","phase","estimate","commits","activeDays","sourceAdded","sourceRemoved"}`
(dedupe theo `key`+`date`; `estimate` lấy từ `state.issues[key].estimate` nếu có, không thì `null`).

⚠ **Chỉ đếm FILE CODE VIẾT TAY**: giữ đuôi `js|jsx|mjs|cjs|ts|tsx|vue|svelte|scss|sass|less|css|twig|html|json|md|yml|yaml|php|py|sh`;
bỏ `dist/`, `node_modules/`, `package-lock.json`, `*.min.*`, và mọi file ảnh/binary.
**KHÔNG loại theo folder `assets/`** — repo này để SOURCE trong `assets/` (`assets/frame1/frame1.js|scss|twig`);
loại `assets/` là xoá sạch code viết tay. Đo thật: commit khởi tạo campaign = 120 file/+13.707 dòng
nếu tính hết, nhưng chỉ **45 file code/+5.146 dòng** là việc thật.
