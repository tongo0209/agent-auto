# R-EV-* · Bằng chứng trước khi báo cáo — ngừng suy đoán

> Bản nội-địa-hoá của skill `superpowers:verification-before-completion` cho **SUBAGENT** của
> agent-auto. Subagent không nạp được skill đó vì 2 lý do đo được: (a) frontmatter `tools:` của
> `agents/*.md` không có tool `Skill`; (b) file bootstrap `using-superpowers/SKILL.md` mở đầu bằng
> khối `<SUBAGENT-STOP>` — bảo subagent bỏ qua skill. Kỷ luật gốc chỉ sống ở phiên chính; agent đi
> làm thật không có gì ràng — nên phải viết lại thành luật có mã, đọc trực tiếp từ file.

Áp cho MỌI agent/subagent của agent-auto khi báo cáo về **dữ liệu thật**: state.json, sheet, file
trên đĩa, kết quả git, output build/test, giao diện đã/chưa mở browser. `MUST` = vi phạm là chặn,
không được báo xong. `SHOULD` = nên, lệch thì phải nói rõ lý do.

**Vì sao có file này:** mặc định của model là tin vào Ý ĐỊNH của lệnh vừa chạy, không tin vào TRẠNG
THÁI thật sau khi chạy — "tôi đã gọi lệnh ghi X" bị coi là tương đương "X đã đúng trên đĩa". Hai thứ
đó khác nhau: lệnh có thể fail âm thầm, ghi sai field, ghi vào file khác. Không có luật kéo lại,
agent báo "xong" bằng suy đoán, người điều phối phải tự làm lại việc verify — mất hết giá trị của
việc giao cho agent.

## Luật sắt

```
KHÔNG CLAIM "XONG/PASS/KHỚP" NẾU CHƯA CHẠY LỆNH CHỨNG MINH TRONG CHÍNH LƯỢT NÀY
```

Chưa chạy lệnh đó **trong lượt trả lời này** thì không được claim nó pass. Lần chạy trước không
tính. "Chắc là pass" không tính.

## Hàm cổng — chạy trước khi báo cáo bất kỳ trạng thái nào

```
TRƯỚC khi claim trạng thái hoặc tỏ ra hài lòng ("xong", "ổn", "pass"):

1. XÁC ĐỊNH: lệnh nào chứng minh claim này?
2. CHẠY: chạy ĐỦ lệnh đó (đầy đủ, không chạy tắt/rút gọn)
3. ĐỌC: đọc hết output, kiểm exit code, đếm số fail
4. ĐỐI CHIẾU: output có xác nhận đúng claim không?
   - KHÔNG → nói trạng thái THẬT kèm bằng chứng
   - CÓ → nói claim KÈM bằng chứng
5. LÚC ĐÓ MỚI được nói ra claim

Bỏ qua bước nào = nói dối, không phải verify.
```

| ID | Sev | Luật |
|---|---|---|
| **R-EV-1** | MUST | **Đọc ngược mới được nói số/trạng thái.** Mọi con số hoặc trạng thái về dữ liệu thật (state, sheet, file, git) chỉ được phát biểu **sau khi chạy một lệnh đọc lại, SAU thay đổi**, và phải **dán output của lệnh đọc lại đó** vào report. "Tôi đã chạy lệnh ghi X" không phải bằng chứng — chỉ output của lệnh **đọc lại** mới là. Ca thật: agent báo "đã bật 4 sheet theo dõi", đọc lại đĩa thì chỉ có 1 — lệnh ghi không ăn nhưng agent vẫn khẳng định; người điều phối chỉ phát hiện vì tự chạy lệnh đọc ngược. |
| **R-EV-2** | MUST | **Cấm "xong/khớp/đã verify/pass" cho thứ chưa chạy.** Chưa chạy thì ghi thẳng `chưa verify: <lý do>`. Nói thiếu (chưa làm) được phép; nói sai (đã làm mà chưa thật) không được phép. Ca thật: nhiều agent kết thúc bằng "đã verify" cho UI chưa từng mở browser lần nào. |
| **R-EV-3** | MUST | **Không chắc → DỪNG hỏi, cấm đoán rồi làm tiếp.** Gặp mơ hồ (thiếu context, 2 cách hiểu, không có cơ sở để chốt) → báo `BLOCKED` hoặc `NEEDS_CONTEXT` và dừng ở đó, không tự chọn một hướng rồi âm thầm tiến. Bad work (đứng đúng chỗ, báo thiếu gì) tốt hơn no work (đoán bừa, báo sai). |
| **R-EV-4** | MUST | **Cấm kết luận từ TÊN — chỉ từ nội dung/số đo.** Không suy verdict/khớp-lệch/giống-nhau từ tên file, tên class, tên section, hay cảm giác "trông giống" — phải trace về nội dung đã đọc được hoặc số đo được. Ca thật (trong repo): 2 lane compare cho ra verdict lệch nhau 3 lần vì suy từ TÊN FILE thay vì mở file đọc nội dung. |
| **R-EV-5** | MUST | **Report: kết luận trước, bằng chứng thật, không dán lại.** Mở đầu bằng kết luận, kèm `file:line` + output lệnh thật đã chạy. CẤM dán lại nội dung file đã đọc (người nhận báo cáo không cần xem lại thứ họ có thể tự đọc), CẤM thuật lại từng bước đã làm — chỉ báo cái đã tìm ra. Ca thật: report dài dòng dán lại nội dung file đã đọc, đốt token mà không thêm thông tin. |
| **R-EV-6** | MUST | **Chạm ngân sách tool-call → dừng công khai, không làm tiếp lén.** Có ngân sách tool-call cho vòng việc → chạm ngưỡng phải dừng NGAY, ghi rõ phần đã chắc + phần còn thiếu trong report. Cấm vượt ngưỡng rồi báo như thể đã làm đủ. |
| **R-EV-7** | MUST | **Sửa vì review → chạy lại đúng test phủ chỗ sửa, dán output.** Khi sửa một thứ vì reviewer/checker yêu cầu, phải tự chạy lại chính test/check phủ đúng chỗ vừa sửa và dán output vào report — không được để người review tự chạy hộ để xác nhận. |

## Bảng claim ↔ bằng chứng bắt buộc ↔ cái KHÔNG đủ

| Claim | Bằng chứng bắt buộc | KHÔNG đủ |
|---|---|---|
| `test pass` | Output test command: 0 fail, đọc hết không cắt | Lần chạy trước, "chắc là pass" |
| `đã bật theo dõi 4 sheet` | Output lệnh **đọc lại** state/config SAU khi ghi, thấy đủ 4 | Lệnh ghi trả về 200/exit 0 |
| `build sạch` | Output build: exit 0 + không warning ẩn | Linter pass (linter ≠ compiler) |
| `khớp design` | Số đo (`design-diff.py`) hoặc so nội dung DOM/CSS thật | Cảm giác "trông giống" khi nhìn lướt |
| `bug đã fix` | Test đúng triệu chứng gốc: pass sau khi sửa | Code đã đổi, tự cho là đã fix |
| `agent con đã xong` | Đọc report của agent con + tự đối chiếu (VCS diff/đĩa) | Agent con tự báo "success" |
| `đủ yêu cầu` | Rà từng dòng checklist yêu cầu, đối chiếu từng dòng | Test pass (test ≠ đủ yêu cầu) |

## Cờ đỏ — DỪNG ngay khi thấy mình đang gõ

- "chắc là", "nhiều khả năng", "có lẽ đã" đứng trước một claim trạng thái.
- Tỏ ra hài lòng ("Xong!", "Ổn rồi!", "Ngon!") TRƯỚC khi verify, không phải sau.
- Định commit/tạo report kết thúc mà chưa chạy lệnh chứng minh.
- Tin báo cáo của agent con thay vì tự đối chiếu.
- "Lần này thôi, chắc không sao" — không có ngoại lệ cho luật sắt.

## Ví dụ ❌/✅

**R-EV-1 — đọc ngược**
```
❌ "Đã set 4 sheet watched: true trong config.json."
   (không đọc lại config.json sau khi ghi — chỉ tin lệnh ghi đã chạy)

✅ "Đã ghi watched: true cho 4 sheet. Đọc lại:
   $ jq '.sheets[] | {id, watched}' config.json
   [{"id":"A","watched":true},{"id":"B","watched":false}, ...]
   → chỉ 1/4 lên watched:true, 3 sheet còn lại lệnh ghi không ăn."
```

**R-EV-2 — chưa chạy thì nói chưa verify**
```
❌ "UI đã verify khớp design."   (chưa từng mở browser)

✅ "Code đã sửa theo spec — chưa verify: chưa mở browser/build để so ảnh thật."
```

**R-EV-4 — cấm suy từ tên**
```
❌ "File tên popup-claim-v2.html trùng nội dung popup-claim.html nên bỏ file cũ."
   (chưa mở 2 file ra so nội dung)

✅ "Đọc cả 2 file: popup-claim.html có thêm block `pm__btn_claim` mà v2 không có
   → KHÔNG trùng, giữ cả 2."
```

**R-EV-5 — report gọn, có bằng chứng**
```
❌ [dán lại 80 dòng nội dung file vừa Read] + "như trên, tôi đã đọc và thấy ổn."

✅ "PASS. `tools/bug-sheet-tick.py:42` gọi đúng API tick — chạy
   `python3 tools/bug-sheet-tick.py --dry-run` ra `3 rows would be ticked`, khớp kỳ vọng."
```

## Mục `Bằng chứng:` trong report

Mọi report của agent (Dev Report, Check Report, Bug-board, partial board của lane) BẮT BUỘC có mục
`Bằng chứng:` — liệt kê từng claim quan trọng kèm lệnh đã chạy + 1-2 dòng output thật. Thiếu mục này
= report không hợp lệ, người điều phối trả lại ngay, trích `R-EV-1`/`R-EV-5 MUST` thay vì diễn giải.

## Quan hệ với các luật khác
- R-EV-* là lớp **quy trình báo cáo**, không thay [`code-style.md`](code-style.md) (R-CS-*, lớp
  **chất lượng code**) — một report có thể đạt R-EV (có bằng chứng) mà code vẫn vi phạm R-CS, và
  ngược lại. Cả hai đều phải đạt.
- R-EV-6 không mâu thuẫn "Ngân sách tool-call" đã ghi trong `skills/code-developer/SKILL.md` — đó là
  SỐ cụ thể theo từng loại việc; R-EV-6 là LUẬT chung: chạm ngưỡng nào cũng phải dừng công khai.
- R-EV-3 đồng hướng `superpowers:systematic-debugging` (điều tra trước khi sửa). R-EV-1/2/5/7 là bản
  nội-địa-hoá của `superpowers:verification-before-completion` (Iron Law + Gate Function ở trên dịch
  lại từ đó) — phiên chính đọc được skill gốc; subagent đọc file này.

## Thực thi
Không có hook cơ học cho R-EV-* (không đo được "có đọc ngược thật hay không" bằng regex) — đây là
luật tự giác, gác bằng report: manager/người điều phối đọc report thấy thiếu mục `Bằng chứng:`,
thấy "xong" mà không có output lệnh, hoặc thấy suy từ tên → trả lại NGAY, trích mã luật (`R-EV-1
MUST`) thay vì chấp nhận cho qua.
