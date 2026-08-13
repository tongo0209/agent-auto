# `/check-design` — soát design đã giao có ĐỦ so với yêu cầu chưa

> Spec 2026-08-13 · brainstorm với user (tont) · trạng thái: chốt để lập plan

## Vấn đề

`/daily` đã theo dõi design ở **tầng file**: 5 mức `designStatus` (`đã-giao-đã-tải` ·
`đã-giao-tải-một-phần` · `đã-giao-chưa-tải` · `đã-giao-chờ-link` · `chưa-có-link`) + coverage
`sp-coverage`. Nhưng **không ai soát tầng nội dung**: design tải về đủ file rồi, mà có đủ MÀN,
đủ TRẠNG THÁI, đủ BIẾN THỂ mà yêu cầu đòi hay không thì phải người đọc tự phát hiện.

Ca thật đã trả giá — `tasks/GW-713/brief.md` tự nó để ngỏ:

> "Frame 2/4 popup: design content popup nằm đâu? (3 preview không thấy rõ popup content — soi PSD/PSB khi dựng)"

Câu hỏi đó nằm im trong brief tới lúc dựng mới lòi ra. Nếu soát sớm thì đã đòi PM từ ngày 3/8.

## Mục tiêu

Một lệnh `/check-design <KEY>` trả lời: **design hiện có ĐỦ để dựng chưa, thiếu đúng cái gì.**
Kết quả phục vụ 4 việc (user chốt cả 4):

1. Soạn sẵn danh sách đòi PM/designer (copy là gửi được).
2. Quyết định code được phần nào ngay, phần nào phải chờ.
3. Làm bằng chứng có mốc thời gian khi task trễ.
4. Xếp thứ tự cắt ảnh / dựng màn.

## Phạm vi

- **Trong phạm vi**: mọi task GW có design (landing promotion, subweb, mainsite).
- **Ngoài phạm vi**: đánh giá design đẹp/xấu; so code với design (đã có `design-checker`);
  tải design (đã có bộ `sp-*` của `/daily`); ghi ngược Jira.

## Quyết định đóng gói

**Skill riêng** `check-design`, đặt trong `agent-auto/skills/check-design/`, symlink vào
`~/.claude/skills/check-design` (cùng mẫu `bug-fixer` / `code-developer` / `website-audit` đang
dùng). Lý do chọn thay vì nhét mode vào `daily`:

- `skills/daily/SKILL.md` đã 324 dòng cực đặc, nạp toàn bộ ở mọi phiên `/daily`; thêm luật đọc
  ảnh/PSD vào đó là chất tải nặng lên file đang gánh nhiều nhất.
- Gõ tay được cho 1 ticket lẻ, không phải chạy cả luồng ngày.
- `agent-auto` giữ vai trò **kho dữ liệu + console**: skill ĐỌC/GHI vào đó (`state.json`,
  `tasks/<KEY>/`, `designs/<KEY>/`) chứ không chứa logic.

Việc đọc ảnh nặng (ảnh 2000×5300, cây layer PSB 237MB) được **đẩy xuống subagent** khi ticket
nhiều màn, phiên chính chỉ nhận bảng kết luận — tránh nổ context.

## Giao diện lệnh

```
/check-design <KEY>          # mặc định: nông → tự soi sâu những item chưa chắc
/check-design <KEY> --fast   # chỉ tầng file + đối chiếu nông, không mở PSD (dùng khi cần nhanh)
/check-design <KEY> --ask    # chỉ in block copy gửi PM của lần chạy gần nhất, không soát lại
/check-design                # không truyền KEY: soát mọi ticket đang ở phase waiting-design/ready
```

Mặc định (không cờ) là **nông trước, sâu khi nghi ngờ** — đúng lựa chọn user đã chốt: không
dump PSB 237MB nếu ảnh preview đã trả lời được.

## Đơn vị đối chiếu

Skill làm việc trên **hạng mục yêu cầu** (requirement item), không phải trên "ảnh".

```jsonc
{
  "id": "frame4-popup",                    // slug ổn định giữa các lần chạy
  "label": "Popup content của menu frame 4",
  "kind": "màn",                           // màn | biến-thể | trạng-thái | asset | file-nguồn
  "source": {                              // NGUỒN đòi nó — bắt buộc, không có nguồn thì không phải item rổ 1
    "from": "docx",                        // brief | docx | jira-desc | jira-comment
    "ref": "note_dev_landing.docx",
    "quote": "mỗi menu mở popup content; animation zoom-in-out"
  },
  "milestone": "html",                     // mốc liên quan (nếu suy được), để tính trễ
  "verdict": "THIẾU",                      // ĐỦ | THIẾU | CHƯA-CHẮC | KHÔNG-ÁP-DỤNG
  "evidence": {                            // bằng chứng cho verdict — BẮT BUỘC, không có thì verdict tối đa là CHƯA-CHẮC
    "looked": ["SUBWEB-VLTT_PC.jpg", "SUBWEB VLTT_PC.psb (layer tree)"],
    "found": null,                         // vd "SUBWEB-VLTT_PC.jpg y≈2400–3100" hoặc "layer /Frame4/popup"
    "blockedBy": null                      // vd "PSB promotion chưa tải xong"
  },
  "firstSeenMissing": "2026-08-13"         // để tính "thiếu sang ngày thứ N" ở lần chạy sau
}
```

### 4 mức kết luận

| Mức | Nghĩa | Bằng chứng bắt buộc |
|---|---|---|
| `ĐỦ` | thấy trong design | tên file + vùng (`y≈2400–3100`) hoặc đường dẫn layer PSD |
| `THIẾU` | nguồn đòi, design không có | danh sách **đã soi những gì** (JPG nào, PSD nào đã dump layer) |
| `CHƯA-CHẮC` | chưa soi đủ để dám kết luận | nêu rõ còn kẹt ở đâu (`blockedBy`) |
| `KHÔNG-ÁP-DỤNG` | PM đã trả lời / hạng mục bị bỏ | link comment hoặc dòng ghi chú |

### Luật hai rổ (chống báo thiếu oan)

Skill có checklist quen thuộc của nghề (bản mobile, hover/active, popup content, ảnh share/meta,
favicon, font, trạng thái rỗng/lỗi…). Checklist đó **KHÔNG được sinh ra mục THIẾU**:

- **Rổ 1 — THIẾU thật**: chỉ những item có `source` (nguồn thật sự đòi). Chỉ rổ này mới được
  gọi là thiếu, mới được đếm vào trễ mốc.
- **Rổ 2 — nguồn không nói, nên hỏi**: sinh từ checklist. Ghi dưới nhãn "câu hỏi cho PM",
  không bao giờ ghi là thiếu.

Căn cứ: bài học `du-phai-do-theo-nguon-khong-tu-dinh-nghia` — "đủ" phải đo theo nguồn, cấm tự
định nghĩa tập kiểm.

### Luật "không tin cái không thấy"

Một item chỉ được ghi `THIẾU` sau khi đã làm ĐỦ 2 việc:

1. Nhìn hết ảnh preview (`.jpg/.png/.webp`) trong `designs/<KEY>/` (kể cả `_src/`), và
2. Dump cây layer các PSD/PSB liên quan bằng `agent-auto/tools/psd-tree.py`, không thấy layer
   /group nào khớp.

Chưa làm được (2) — PSB chưa tải xong, file quá lớn, `psd-tools` đọc không nổi — thì mức tối đa
là `CHƯA-CHẮC`. Căn cứ: GW-713 popup rất có thể nằm trong layer ẩn của PSB 237MB mà 3 ảnh JPG
preview không thể hiện.

## Luồng chạy (5 bước)

### Bước 1 — Dựng danh sách yêu cầu

Đọc theo thứ tự, **nguồn chi tiết/mới hơn thắng** (đúng luật `/daily` đang áp cho `milestones`):

1. `tasks/<KEY>/brief.md` — mục "Việc", bảng "Timeline", mục "Việc còn mở".
2. File note PM trong `designs/<KEY>/` (`*.txt` đã convert từ docx, `_docs/`, `*.xlsx`).
3. Jira `description` + toàn bộ `comment` (MCP Atlassian `getJiraIssue`).

Lệch nhau ⇒ nguồn thắng ghi đè, **và cập nhật ngược `brief.md`** ngay (không chỉ nêu trong báo
cáo — lỗi đã trả giá với `milestones`: chép vào brief mà để state cũ thì console vẫn cảnh báo
theo số sai).

Chưa có `brief.md` ⇒ vẫn chạy với 2 nguồn còn lại, ghi rõ "chưa prep, danh sách có thể sót".

### Bước 2 — Kiểm kê design đang có (tầng file)

Đọc `designs/<KEY>/sp-manifest.json` + chạy `sp-coverage`. Ra 3 con số: file đã tải / file
nguồn có mà chưa tải / file nguồn mới hơn bản local. Tầng này gộp vào cùng báo cáo (user chốt
báo cáo 3 tầng trong một chỗ xem).

### Bước 3 — Đối chiếu nông (rẻ trước)

Nhìn ảnh preview + tên file, gán `ĐỦ` cho cái thấy rõ. Ảnh dài phải **cắt lát trước khi đọc**:
`scripts/img-slice.py` cắt theo chiều dọc thành lát ≤1500px và hạ bề rộng xuống ~900px — đọc
thẳng ảnh 2000×5300 vừa tốn context vừa mờ chi tiết.

### Bước 4 — Soi sâu có chọn lọc

Chỉ item **chưa** đạt `ĐỦ` mới đi tiếp: dump cây layer PSD/PSB liên quan (`tools/psd-tree.py`),
tìm layer/group khớp theo từ khóa của item (tên frame, "popup", "mobile", "hover"...).

Ticket có > 6 item cần soi sâu, hoặc tổng dung lượng ảnh > ~50MB ⇒ đẩy bước 3+4 xuống subagent
(một subagent cho một nhóm màn), phiên chính chỉ nhận JSON kết luận.

### Bước 5 — Kết luận, xuất, ghi ngược

Xem mục "Đầu ra".

## Đầu ra

1. **Bảng terminal** — gom theo màn/frame, hai rổ tách bạch, kèm 1 dòng tóm tắt đầu báo cáo
   (`ĐỦ 12 · THIẾU 3 · CHƯA-CHẮC 2 · hỏi thêm 4`) và **kết luận code được chưa**.
2. **Block copy gửi PM** — tiếng Việt, mỗi dòng: cần gì · cho màn nào · trích đúng câu nguồn đòi
   nó · mốc liên quan.
3. **`tasks/<KEY>/design-gap.md`** (người đọc) + **`tasks/<KEY>/design-gap.json`** (máy đọc,
   giữ lịch sử các lần chạy dạng mảng `runs[]`).
4. **Ghi ngược**:
   - `state.issues[KEY].design.gaps = {checkedAt, depth, counts:{ok,missing,unsure,ask}, top:[...]}`
   - mục `## Việc còn mở` trong `brief.md` (thay thế phần do skill quản, đánh dấu bằng mốc
     `<!-- check-design:begin -->` … `<!-- check-design:end -->` để không đè tay người viết).
5. **Thứ tự dựng**: 2 nhóm — "code được ngay" (mọi item của màn đó `ĐỦ`) và "phải chờ".

### DELTA giữa các lần chạy

Chạy lần 2 trở đi: so với `runs[]` gần nhất → báo mục nào PM đã bổ sung (`THIẾU → ĐỦ`), mục nào
**vẫn thiếu sang ngày thứ N** (tính từ `firstSeenMissing`), mục nào mới phát sinh do nguồn đổi.
Đây là phần làm bằng chứng khi trễ mốc.

## Ràng buộc hệ thống

- **Không tự đổi `phase`** — quyền đó vẫn của `/daily` theo luật bằng chứng sẵn có. Skill chỉ
  ghi `design.gaps` và cảnh báo.
- **Không `git commit` / `git push`** (luật global).
- **Không ghi ngược Jira**.
- `state-doctor.mjs` phải vẫn **exit 0** sau khi thêm `design.gaps`; nếu doctor cần biết field
  mới thì bổ sung luật kiểm cho nó (`gaps.counts` là số, `checkedAt` ISO) — không để field lạ
  trôi nổi không ai validate.
- Không thêm dependency mới: dùng `psd-tools` (đã có, cho `psd-tree.py`), Pillow (đi kèm
  psd-tools) cho cắt ảnh, Node built-in cho phần JSON/state.

## Móc vào `/daily`

Sau khi skill chạy được độc lập, `daily` gọi nó ở 2 chỗ (sửa `skills/daily/SKILL.md`, thêm
~10 dòng, không chép logic):

1. **`/daily prep <KEY>`** — ngay sau khi tải design xong.
2. **Cổng `ready → coding`** — trước khi giao `/code-developer`; có item `THIẾU` thuộc màn sắp
   dựng thì nêu cảnh báo trong bảng duyệt kế hoạch (**cảnh báo, không chặn** — user vẫn có
   quyền dựng phần đủ trước).

## Kiểm chứng

Chạy thật, không claim suông:

1. **GW-713** — ca có đáp án: soát trên bộ design ngày 3/8 phải bắt ra popup content frame 2/4
   ở mức `THIẾU` hoặc `CHƯA-CHẮC` (đáp án thực tế: user tự code popup ngày 4/8, commit
   `d080ccc08` "sửa frame2/frame4 + popup base").
2. **GW-525** — task đang làm; đối chiếu kết quả với 3 việc treo đã biết (mây vật cản, giờ
   06:00 vs 10:00, câu VN Frame7).
3. `node tools/state-doctor.mjs` exit 0 sau khi ghi `design.gaps`.
4. Test cho `img-slice.py` và phần dựng danh sách yêu cầu (mẫu `tools/fe-gate.test.mjs`).

Tiêu chí đạt: cả 2 ticket ra kết luận khớp sự thật đã biết, **không có mục nào bị báo THIẾU oan**
(mọi mục THIẾU đều truy được ra câu nguồn đòi nó).
