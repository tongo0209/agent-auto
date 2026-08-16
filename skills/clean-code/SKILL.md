---
name: clean-code
description: >
  Dọn code đã viết cho gọn theo luật R-CS-* — gỡ comment thừa, làm phẳng trừu tượng chỉ dùng
  1 lần, gộp CSS lặp, đặt tên cho magic number — rồi build verify để chắc không đổi hành vi.
  Dùng khi user nhắc: "code rườm quá", "dọn lại code", "clean code", "nhiều comment quá",
  "gọn lại giúp tôi", "code khó đọc", "junior đọc không hiểu", hoặc sau khi guard-style.sh
  cảnh báo dồn nhiều lần. Mặc định dọn DIFF chưa commit; `full <path>` dọn cả folder.
  KHÔNG đổi hành vi, KHÔNG đụng hợp đồng pm__/id/data-*, KHÔNG commit, KHÔNG push.
---

# /clean-code — dọn code đã lỡ viết rườm

Skill này **sửa code**, khác `/code-audit` (chỉ báo cáo, không sửa).
Dùng skill này thay vì `/simplify` built-in: `/simplify` **không biết luật `pm__`** — nó có thể gộp
selector hoặc đổi tên class làm chết nút trên production.

## Modes
| Lệnh | Phạm vi |
|---|---|
| `/clean-code` | Diff chưa commit + commit chưa push của repo hiện tại (mặc định) |
| `/clean-code full <path>` | Toàn bộ file code trong `<path>` |
| `/clean-code <file...>` | Đúng những file được liệt kê |

## Ràng buộc CỨNG — vi phạm là hỏng production, không phải hỏng thẩm mỹ

1. **KHÔNG đổi hành vi.** Chỉ dọn hình thức code. Thấy bug trong lúc dọn → **ghi ra báo cáo, không sửa**
   (sửa bug là việc của `/bug-fixer` hoặc `systematic-debugging`, trộn vào đây thì diff không review được).
2. **KHÔNG đụng hợp đồng platform.** `pm__…`, `id` đặc biệt, `data-*`, `name`/`type`/`for` của input:
   cấm đổi tên, cấm xoá, cấm gộp selector làm mất class. Đọc `~/VNG/agent-auto/rules/pm-contract.md`
   (R-PM-1..4) TRƯỚC khi chạm bất kỳ file nào có `pm__`.
3. **KHÔNG commit, KHÔNG push.** Dọn xong để user tự review diff.
4. **KHÔNG dọn** `node_modules/`, `dist/`, `build/`, `vendor/`, `*.min.*`, `webpack.config.*`, file sinh tự động.

## Việc được làm (đúng 4 nhóm, theo `~/VNG/agent-auto/rules/code-style.md`)

| Nhóm | Làm gì | Luật |
|---|---|---|
| **Comment** | Gỡ mọi comment mô tả lại code. **Giữ** 2 loại: hợp đồng `pm__`, hack/workaround trình duyệt–thư viện. Nghi ngờ → giữ và liệt kê ra báo cáo để user quyết. | R-CS-1 |
| **Phòng thủ thừa** | Gỡ `try-catch` bọc DOM query, `if (!el) return`, `?.` cho thứ luôn tồn tại. **Chỉ gỡ khi đã xác minh** element/field có trong markup cùng file hoặc luôn có trong response. Không xác minh được → giữ nguyên. | R-CS-2 |
| **Trừu tượng 1-lần-dùng** | Inline hàm/biến trung gian/util chỉ có đúng 1 chỗ gọi. Grep toàn repo trước khi inline — có ≥2 chỗ dùng thì GIỮ. | R-CS-3 |
| **Lặp & tên** | Gộp selector CSS trùng thuộc tính, thay thứ viết tay bằng mixin/class repo đã có, magic number → hằng có tên. | R-CS-4, R-CS-5 |

Không tự thêm tính năng, không đổi kiến trúc, không refactor ngoài 4 nhóm trên.

## Quy trình

1. **Xác định phạm vi.** Mặc định: `git status --short` + `git diff --stat` + `git log origin/<branch>..HEAD --name-only`.
   Không phải git repo → hỏi user đường dẫn.
2. **Chốt baseline.** Ghi lại: số file, tổng dòng, số dòng comment (`grep -cE '^\s*(//|/\*|\*|<!--|\{#)'`).
   **Chụp danh sách tên `pm__`** vào `/tmp/pm-before.txt` (lệnh ở bước 5) — bắt buộc, đây là thứ duy nhất
   chứng minh được không mất hook platform khi file chưa commit.
   Có build → chạy build TRƯỚC khi dọn, lưu kết quả làm mốc so sánh. **Build đã fail từ trước khi dọn**
   → dừng, báo user: không có mốc thì không chứng minh được "dọn xong vẫn chạy".
3. **Đọc luật.** `rules/code-style.md`; file nào có `pm__` thì đọc thêm `rules/pm-contract.md`.
4. **Dọn từng file**, theo thứ tự 4 nhóm trên. File >300 dòng thì dọn theo khối, không rewrite cả file.
5. **Verify — bắt buộc, không được bỏ:**
   - Build lại (`npm run build` hoặc lệnh của repo). Build fail → **revert file vừa dọn**, báo user, dừng.
   - `git diff` đọc lại chính diff của mình: có dòng nào đổi hành vi không?
   - **Cổng `pm__` — so TẬP HỢP TÊN, không so dòng.** Với từng file đã sửa:
     ```
     diff <(git show HEAD:<file> | grep -oE 'pm__[a-zA-Z0-9_-]+' | sort -u) \
          <(grep -oE 'pm__[a-zA-Z0-9_-]+' <file> | sort -u)
     ```
     Phải RỖNG. Mất tên nào = R-PM-1 MUST, revert ngay.
     **File chưa commit / không có git / mode `full`** → `git show HEAD:` không có gì để so.
     Khi đó ở **bước 2 (baseline)** phải chụp trước danh sách tên, rồi so lại sau khi dọn:
     ```
     # bước 2, TRƯỚC khi dọn:
     grep -rhoE 'pm__[a-zA-Z0-9_-]+' <phạm vi> | sort -u > /tmp/pm-before.txt
     # bước 5, SAU khi dọn:
     grep -rhoE 'pm__[a-zA-Z0-9_-]+' <phạm vi> | sort -u | diff /tmp/pm-before.txt -
     ```
     Không chụp được baseline ⇒ **không được dọn file có `pm__`** — báo user, bỏ qua file đó.
     ⚠️ KHÔNG dùng `git diff | grep '^-.*pm__'` — cổng đó **báo động giả**: mọi lần định dạng lại một
     dòng có chứa `pm__` (inline biến, lồng `&.active`) đều làm nó kêu dù không tên nào mất.
     Đo thật 16/8/2026 trên fixture: 2 báo đỏ, cả 2 đều oan.
   - Repo cdn-source có UI → gợi ý user chạy `/ui-check`, không tự chạy.
6. **Báo cáo** (mẫu dưới). Không paste lại code — user tự xem diff.

## Mẫu báo cáo

```
## /clean-code — <phạm vi>

Trước: <n> file · <n> dòng · <n> dòng comment
Sau:   <n> file · <n> dòng · <n> dòng comment   (−<n>%)

Đã dọn
- <file>: gỡ <n> comment mô tả lại code (R-CS-1), inline <n> hàm 1-lần-dùng (R-CS-3)
- <file>: gộp <n> selector trùng (R-CS-4)

Giữ lại có chủ ý
- <file:line>: comment hack Safari iOS <16 — R-CS-1 ngoại lệ (b)
- <file:line>: `if (!el) return` — element render theo điều kiện, không xác minh được là luôn có

Phát hiện KHÔNG sửa (ngoài phạm vi skill)
- <file:line>: <mô tả bug / nợ kỹ thuật> → nên xử lý bằng <đường ray nào>

Verify
- ⏱ build: <lệnh> → <kết quả thật>
- `git diff | grep '^-.*pm__'` → rỗng ✅
- Chưa commit, chưa push — user tự review diff.
```

## Cổng nghiệm thu cuối (R-CS-7)
Trước khi báo xong, tự đọc lại đoạn đã dọn bằng con mắt intern/fresher: đọc **một lượt từ trên xuống,
không nhảy file** — có hiểu nó làm gì không? Không đạt thì làm phẳng thêm hoặc đổi tên cho rõ.
**Cấm chữa bằng cách thêm comment** — đó là đúng cái vấn đề skill này sinh ra để dọn.
