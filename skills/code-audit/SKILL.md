---
name: code-audit
description: Dùng khi cần review SOURCE trước khi xin merge request / push / giao QC, hoặc khi user hỏi "code này ổn chưa", "tại sao lại code như thế", "đã tối ưu chưa", "soi giúp tôi trước khi merge", "có trùng lặp gì không", "chỗ này viết vậy có vấn đề gì". Hai mode - mặc định soi DIFF (uncommitted + commit chưa push), `full [path]` soi cả project/folder. Soi 5 trục - hợp đồng platform (pm__/id/data-*/field form), trùng lặp & tái sử dụng, đúng-sai khi chạy thật, dễ bảo trì, và code-style R-CS-* (comment thừa, phòng thủ thừa, trừu tượng 1-lần-dùng, cổng junior). Báo cáo 2 tầng - hiểu trước, phán sau. KHÔNG sửa code, KHÔNG commit/push. KHÔNG dùng cho output đã build (đó là /website-audit) hay so code với design (đó là /ui-check).
---

# code-audit — review source trước khi xin merge request

Trả lời đúng hai câu: **chỗ này tại sao lại code như thế** và **đã tối ưu chưa**.

## Ba luật không được phá

1. **Mọi issue phải có kịch bản hỏng.** Viết được "user làm X → hỏng Y" hoặc "sau này sửa Z → vỡ W" thì mới là issue. Không viết được → xuống rổ ⚪ GỢI Ý hoặc bỏ hẳn. Không bao giờ đưa cái "trông không đẹp" lên rổ 🔴/🟡.
2. **Không sửa code.** Skill này chỉ báo cáo. Muốn sửa thì user gọi `/code-developer` hoặc `/bug-fixer-lite` sau.
3. **Không `git commit`, không `git push`, không `git checkout`.** Chỉ đọc: `git diff`, `git show`, `git merge-base`, `git ls-files`.
4. **Lệch chuẩn là issue có kịch bản hỏng, không phải "trông không đẹp".** Trong `cdn-source` soi thêm theo
   `~/VNG/agent-auto/rules/cdn-source-standard.md` (R-CDN-*), `popup-library.md` (R-POP-*),
   `html-handoff.md` (R-HO-*) — mỗi phát hiện ghi **mã luật + file:line + hậu quả thật**:
   `@media` viết tay (vỡ hợp đồng H5 khi `$maxWidthMB=0` — R-CDN-5) · popup tự chế mất `MJ__close-popup`
   (nút đóng chết — R-POP-2) · pattern legacy `src-setup` trong campaign assets-flat (engine gameplay sai — R-CDN-1)
   · rem/%/flex-center chống hệ scale (lệch trên máy khác — R-CDN-4) · sửa `*generated.scss` (mất sau build — R-CDN-6)
   · path tương đối trong HTML bàn giao (404 trên production — R-HO-1).
   Luật R-CS-1 bản 19/8/2026 = comment tối giản 1 dòng đúng 3 loại (không còn "zero comment").

## Luồng 5 bước

Tạo 1 task cho mỗi bước rồi làm tuần tự.

### Bước 1 — Chốt mode và vùng soi

| User gõ | Mode | Vùng soi |
|---|---|---|
| `/code-audit` | diff (mặc định) | file đã sửa so với branch gốc + file chưa track |
| `/code-audit full` | full | cả repo hiện tại |
| `/code-audit full <path>` | full | đúng folder đó |
| `/code-audit <path/file>` | diff giới hạn | chỉ file/folder đó, vẫn so với base |

Mode diff — lấy danh sách file (chạy tại repo root):

```bash
cd "$(git rev-parse --show-toplevel)"
BASE=$(git merge-base HEAD origin/HEAD 2>/dev/null \
    || git merge-base HEAD origin/main 2>/dev/null \
    || git merge-base HEAD origin/master 2>/dev/null \
    || git merge-base HEAD origin/develop 2>/dev/null)
echo "base = ${BASE:-KHÔNG CÓ REMOTE, xem ghi chú bên dưới}"
{ git diff --name-only --diff-filter=d "${BASE:-HEAD}"; git ls-files --others --exclude-standard; } | sort -u
```

Không giải được base (repo không remote, hoặc branch mồ côi): nói rõ với user là **đang so với `HEAD`**, nên phần "hook mất so với base" chỉ thấy được thay đổi chưa commit. Đừng im lặng bỏ qua.

Vùng soi rỗng (không có file frontend nào đổi): báo "không có gì để soi" rồi dừng. Không tự nhảy sang mode full.

### Bước 2 — Chạy lớp script

```bash
# mode diff
printf '%s\n' <danh-sách-file> > /tmp/ca-files.txt
node <skill>/scripts/scan.js --files @/tmp/ca-files.txt --base auto --json --out /tmp/ca-facts.json

# mode full
node <skill>/scripts/scan.js --dir <path> --base auto --json --out /tmp/ca-facts.json
```

Dùng thư mục scratchpad của phiên thay cho `/tmp` nếu có. Bỏ `--json` để xem bản in gọn cho người đọc.

Đọc `/tmp/ca-facts.json`: `profile.packs` (rule pack cần nạp), `summary.byCheck` (đếm), `facts[]` (từng sự kiện có `file:line`).

**Facts là SỰ KIỆN, chưa phải issue.** Script không biết ý định. Việc biến fact thành issue là ở bước 5.

### Bước 3 — Nạp rule pack

Theo `profile.packs`:

| Pack | Đọc file |
|---|---|
| `landing-promotion` | `references/pm-contract.md` — **bắt buộc**, đây là loại lỗi làm chết nút |
| `mainsite-twig` | `references/mainsite-twig.md` |
| `frontend` (luôn có) | `references/frontend-checklist.md` |
| `code-style` (luôn có) | `~/VNG/agent-auto/rules/code-style.md` — R-CS-1..7: comment tối đa 1 dòng, đúng 3 loại (hợp đồng platform · hack · logic bí ẩn) · không phòng thủ thừa · rule of two · tên thay comment · cổng nghiệm thu junior |

Đọc thêm `CLAUDE.md` / `README.md` / `.editorconfig` của repo đang soi để biết convention tại chỗ. Convention của repo **thắng** ý kiến chung: repo đang dùng kiểu khác thì đó không phải issue.

### Bước 4 — Đọc code, viết Phần A

Đọc **thật** các file trong vùng soi (`Read`), không suy từ facts. Với mode diff, đọc cả `git diff` để biết cái gì vừa đổi.

Phần A trả lời, mỗi mục 1-3 câu:

- **Chỗ này làm gì** — luồng chính, dữ liệu đi đâu.
- **Bị ràng buộc gì** — hook platform, template dùng chung, file legacy, API cố định, breakpoint team (PC 1920×1080, mobile 768×1024).
- **Vì sao có thể đã viết như vậy** — tìm lý do chính đáng TRƯỚC khi phê. Nếu tìm được lý do (ví dụ `!important` để đè CSS platform), ghi rõ; đó là câu trả lời cho "tại sao lại code như thế".

Phần A là cái neo: **issue nào ở Phần B không trỏ được vào một mục của Phần A thì phải bỏ**, vì đó là dấu hiệu bạn đang phê thứ mình chưa hiểu.

### Bước 5 — Chuyển fact thành issue

Với mỗi fact, làm đúng cột giữa trước khi phán. Fact không qua được cửa này thì **không lên báo cáo**.

| Fact | Phải kiểm tra thêm gì | Thành issue khi |
|---|---|---|
| `PM_HOOK_REMOVED` / `PM_HOOK_RENAMED` | Xem `git diff` chỗ đó. Có phải cố ý bỏ khối tính năng? | Hook mất/đổi mà khối tính năng vẫn còn → 🔴 nút chết |
| `PM_SEPARATOR_TRAP` | So với hook cùng loại trong repo/base xem cái nào đúng | Luôn báo, tối thiểu 🟡; đè lên 🔴 nếu hook mới không có ở base |
| `FIELD_CONTRACT_CHANGED` / `FIELD_REMOVED` | `name`/`type`/`id` là hợp đồng với JS platform | Đổi/mất mà không có yêu cầu đổi → 🔴 platform không nhận field |
| `ANY_PLACEHOLDER` | Không cần kiểm tra gì | Luôn 🔴 — `<any>` chưa thay là chưa build được |
| `DUPLICATE_ID`, `LABEL_FOR_ORPHAN` | Đọc markup quanh đó | Gần như luôn 🔴/🟡: id trùng làm JS bắt sai node, `for` trượt làm click label không focus |
| `FIELD_NO_NAME` | Xem `confidence` trong fact: `high` = nằm trong form hợp đồng (`form` ghi tên form), `low` = form tìm kiếm / ngoài form / file partial | `high` → 🔴 submit không mang dữ liệu. `low` → đọc code xác nhận, phần lớn là bình thường (JS đọc bằng selector) |
| `DUP_BLOCK`, `SELECTOR_REDEFINED` | Đọc cả 2-3 chỗ. Giống nhau tình cờ hay cùng một ý? | Cùng một ý → 🟡 "sửa 1 chỗ sót chỗ kia". Tình cờ → bỏ |
| `IMPORTANT`, `Z_INDEX` | Có đang đè CSS platform / thư viện ngoài không? | Có lý do chính đáng → ghi ở Phần A, KHÔNG thành issue. Đè CSS của chính mình → 🟡 |
| `FIXED_WIDTH` | Có media query phủ lại ở 768 không? | Không có → 🔴 vỡ layout mobile. Có → bỏ |
| `UNGUARDED_DOM` | Node đó luôn tồn tại trong markup, hay nằm trong popup render sau? | Render động / có điều kiện → 🔴 crash JS chết cả trang. Node cố định → bỏ |
| `INNERHTML_DYNAMIC` | Dữ liệu từ API/user hay chuỗi nội bộ? | Từ API/user không escape → 🔴 XSS |
| `LISTENER_BALANCE`, `TIMEOUT_DELAY` | Element có bị render lại nhiều lần? Timeout đang chờ DOM? | Bind lặp → 🟡 gọi API 2-3 lần/click. Chờ DOM bằng timeout → 🟡 máy chậm là trượt |
| `FILE_LARGE`, `DEEP_NESTING`, `COMMENTED_CODE`, `DEBUG_LEFTOVER`, `TODO_MARKER`, `INLINE_STYLE`, `INLINE_HANDLER` | — | Mặc định ⚪. Lên 🟡 chỉ khi viết được kịch bản cụ thể |
| `CLASS_MAYBE_UNUSED` | **Phải grep cả repo** (kể cả file ngoài vùng soi, file Twig, JS platform) trước khi nói "chết" | Grep sạch mới ⚪ "ứng viên xóa". Không bao giờ 🔴/🟡 |
| `HARDCODED_URL`, `STORAGE_KEY` | Có biến/config sẵn trong repo không? | Có sẵn mà không dùng → 🟡 (đổi domain là sót). Không có → ⚪ |
| `MEDIA_QUERIES` | So với quy ước team: PC 1920×1080, mobile 768×1024 | Thiếu breakpoint 768 mà layout có kích thước cứng → 🔴 |

Ngoài facts, tự soi thêm những thứ script **không thấy được** — xem `references/frontend-checklist.md`: logic sai, thiếu edge case (list rỗng, API lỗi, double-click), state sai, sai lệch với convention repo, chỗ đáng dùng lại component/mixin có sẵn.

**Trục code-style (R-CS-*)** — soi trên phần code MỚI trong vùng soi, mặc định ⚪, lên 🟡 khi dày đặc:
- `R-CS-1` comment mô tả lại code (không phải hợp đồng `pm__`, không phải hack trình duyệt). Đếm được:
  `git diff | grep -cE '^\+[[:space:]]*(//|/\*|\*|<!--|\{#)'`. Dày → 🟡 "diff khó review, nhiễu tín hiệu".
- `R-CS-2` `try-catch` bọc DOM query, `if (!el) return` cho node cố định → trùng trục `UNGUARDED_DOM` ở
  chiều ngược: node **cố định** mà vẫn guard là dư, node **render động** mà không guard mới là 🔴.
- `R-CS-3` hàm/util/biến trung gian chỉ 1 chỗ gọi (grep đếm được) → 🟡 "phải nhảy nhiều chỗ mới hiểu 1 việc".
- `R-CS-7` cổng junior: người mới đọc một lượt, không nhảy file, có hiểu không? Không đạt → nêu ở Phần B
  kèm đề xuất **làm phẳng / đổi tên**, KHÔNG đề xuất thêm comment.
Trục này **chỉ báo, không sửa** — muốn dọn thì `/clean-code`.

### Bước 6 — Phân mức

- 🔴 **CHẶN MR** — hỏng ngay khi chạy thật: mất hook platform, logic sai, vỡ layout 1920/768, XSS, JS crash.
- 🟡 **NÊN SỬA** — hỏng ở tương lai: trùng lặp nên fix 1 chỗ sót 1 chỗ, phụ thuộc ngầm, bind lặp.
- ⚪ **GỢI Ý** — không có kịch bản hỏng. Gom cuối, mỗi cái 1 dòng, không diễn giải.

Kiểm lại trước khi xuất: mỗi issue 🔴/🟡 có đủ `file:line` + kịch bản hỏng + đề xuất sửa + trỏ về mục nào của Phần A? Thiếu 1 trong 4 → hạ xuống ⚪ hoặc bỏ.

### Bước 7 — Xuất báo cáo

Theo mẫu `references/report-template.md`. Ghi file markdown vào **scratchpad của phiên** rồi in đường dẫn; chỉ ghi vào trong repo khi user yêu cầu (khi đó dùng `<repo>/.code-audit/` và nhắc user thêm vào `.gitignore`).

In ra terminal bản gọn: 1 dòng tổng kết + toàn bộ 🔴 + tiêu đề 🟡 + số lượng ⚪.

Có báo cáo cũ cùng chỗ: so thêm 1 mục ngắn "đã sửa / còn / mới phát sinh".

## Cờ đỏ — đang tự lừa mình

| Ý nghĩ | Thực tế |
|---|---|
| "Facts nhiều rồi, khỏi đọc code" | Facts không biết ý định. Không đọc code thì mọi issue đều là đoán. |
| "Cứ liệt kê hết cho đầy đủ" | Báo cáo 40 dòng vặt = user ngừng đọc = bỏ sót cái 🔴 thật. |
| "`!important` là xấu" | Trong landing đè CSS platform thì đó là giải pháp đúng. |
| "Class này không thấy dùng, xóa đi" | JS platform và Twig ngoài vùng soi có thể đang dùng. Chưa grep cả repo thì chưa được nói. |
| "Sửa luôn cho nhanh" | Skill này không sửa code. |
| "Chưa chắc nhưng cứ báo 🔴 cho an toàn" | 🔴 sai một lần là lần sau user không tin cả báo cáo. Không chắc → 🟡 kèm câu hỏi, hoặc ⚪. |
| "Repo này viết sai convention" | Convention của repo thắng. Không đồng ý thì ghi ⚪, không phải 🔴. |

## Không thuộc phạm vi

Ảnh nặng / font / SEO / Lighthouse → `/website-audit`. Code vs ảnh design → `/ui-check`. Đủ popup theo loại promotion → `/check-promotion`. Bug QC đã báo → `/bug-fixer-lite`.
