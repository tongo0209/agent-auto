---
name: check-promotion
description: Validate file HTML landing page VNG đã đủ popup và cấu trúc popup quan trọng đúng chuẩn — dựa theo loại promotion. KHÔNG check pm__ class. Dùng khi dev code xong HTML, cần check trước khi submit QA. Gọi bằng /check-promotion <loại|STT> [file] — user tự nhập loại; thiếu loại thì skill in bảng 39 loại để user nhập STT/tên. Hỗ trợ 39 promotion type theo danh sách platform (đăng ký trước, rút thăm may mắn, đổi quà, phát code, vote, khuyến mãi nạp, mời bạn/affiliate, làm bánh, điểm danh & rút thăm, fantasy team & đặt cược, vòng quay...), map vào các file checklist trong reference/. Output là bảng Pass/Fail checklist.
---

# Skill: check-promotion

Validate file HTML landing page VNG theo loại promotion. Output bảng Pass/Fail checklist kiểm tra đủ popup và cấu trúc popup đúng chuẩn. KHÔNG check pm__ class — hợp đồng `pm__`/`id`/`data-*` soát bằng `node ~/VNG/agent-auto/tools/pm-gate.mjs <file>` (gameplay đọc từ mục Khoá của file dự án; sau build: `--page <campaignDir>`) theo `~/VNG/agent-auto/rules/pm-contract.md` R-PM-8; không dùng skill tự điền `pm__` (cấm theo R-PM-12).

## Cách gọi

```
/check-promotion <loại|STT> <file>
/check-promotion <loại|STT>           ← file tự detect từ IDE
/check-promotion                      ← thiếu loại: skill in bảng 39 loại, user nhập STT/tên rồi tiếp tục
```

`<loại>` nhận: **STT** (1-39 theo danh sách platform), **tên trên platform** (không phân biệt hoa/thường), hoặc **slug/alias**. User TỰ NHẬP loại — skill KHÔNG đoán loại từ file, KHÔNG hiện list option cho chọn (không dùng AskUserQuestion cho việc chọn loại). Thiếu loại/gõ không match → in bảng 39 loại và chờ user nhập (xem Bước 0). Phân biệt argument: token kết thúc `.html` hoặc chứa `/` → là file, còn lại → là loại. Path trong dấu nháy (có thể chứa khoảng trắng) là MỘT token file duy nhất — KHÔNG lấy chữ bên trong path (VD tên folder chứa "AFFILIATE") làm loại; loại chỉ match từ argument đứng riêng ngoài path.

## 39 promotion type (theo danh sách platform)

| STT | Tên trên platform | Slug / alias | Checklist |
|-----|-------------------|--------------|-----------|
| 1 | ĐĂNG KÝ TRƯỚC | `pre-register`, `dang-ky-truoc` | `01-dang-ky-truoc.md` |
| 2 | RÚT THĂM MAY MẮN | `lucky-draw`, `rut-tham` | `02-rut-tham-may-man.md` |
| 3 | ĐĂNG KÝ TRƯỚC & RÚT THĂM MAY MẮN | `pre-register-lucky-draw` | `01-dang-ky-truoc.md` + `02-rut-tham-may-man.md` (merge) |
| 4 | ĐỔI QUÀ | `doi-qua`, `gift-exchange` | `02-rut-tham-may-man.md` |
| 5 | RÚT THĂM MAY MẮN & ĐỔI QUÀ | `rut-tham-doi-qua` | `02-rut-tham-may-man.md` |
| 6 | PHÁT CODE | `phat-code`, `redeem-code`, `active-code`, `nhap-code` | `06-phat-code.md` |
| 7 | GỬI EMAIL/CODE | `gui-email-code` | `06-phat-code.md` (tạm) |
| 8 | PROMOTIONTYPES.SEND_EMAIL_NEXUS | `send-email-nexus` | `_popup-structure.md` (structure-only) |
| 9 | VOTE | `voting`, `vote`, `binh-chon` | `09-vote.md` |
| 10 | HOÀN TRẢ NẠP | `hoan-tra-nap` | `13-khuyen-mai-nap.md` (tạm) |
| 11 | NGƯỜI CŨ QUAY VỀ | `nguoi-cu-quay-ve`, `comeback` | `11-nguoi-cu-quay-ve.md` |
| 12 | SHOP | `shop` | `_popup-structure.md` (structure-only) |
| 13 | KHUYẾN MÃI NẠP | `payment`, `nap-tien`, `topup` | `13-khuyen-mai-nap.md` |
| 14 | ĐĂNG KÝ NHẬN QUÀ | `dang-ky-nhan-qua` | `01-dang-ky-truoc.md` (tạm) |
| 15 | CHUYỂN ĐỔI GAME | `chuyen-doi-game` | `_popup-structure.md` (structure-only) |
| 16 | THI ĐẤU | `thi-dau` | `_popup-structure.md` (structure-only) |
| 17 | BANG HỘI | `bang-hoi` | `_popup-structure.md` (structure-only) |
| 18 | CỜ TỶ PHÚ | `co-ty-phu` | `_popup-structure.md` (structure-only) |
| 19 | MAIL-METAL-SLUG | `mail-metal-slug` | `_popup-structure.md` (structure-only) |
| 20 | ĐĂNG KÝ TRƯỚC & MUA CHUNG GIẢM GIÁ | `dang-ky-truoc-mua-chung` | `01-dang-ky-truoc.md` (phần mua chung chưa có checklist) |
| 21 | ĐẶT TÊN TRƯỚC | `dat-ten-truoc` | `01-dang-ky-truoc.md` (tạm) |
| 22 | MỜI BẠN BÈ NHẬN QUÀ | `affiliate`, `moi-ban` | `22-moi-ban-be-nhan-qua.md` |
| 23 | LÀM BÁNH | `crafting`, `lam-banh`, `che-bien` | `23-lam-banh.md` |
| 24 | RÚT THĂM MAY MẮN & ĐỔI QUÀ V2 | `rut-tham-doi-qua-v2` | `02-rut-tham-may-man.md` |
| 25 | ĐĂNG KÍ THI ĐẤU | `dang-ki-thi-dau` | `_popup-structure.md` (structure-only) |
| 26 | RÚT THĂM MAY MẮN & ĐỔI QUÀ V3 | `rut-tham-doi-qua-v3` | `02-rut-tham-may-man.md` |
| 27 | ĐIỂM DANH & RÚT THĂM MAY MẮN | `checkin`, `diem-danh` | `27-diem-danh-rut-tham.md` + `02-rut-tham-may-man.md` (merge) |
| 28 | FANTASY TEAM & ĐẶT CƯỢC | `betting`, `dat-cuoc`, `ty-le-cuoc` | `28-fantasy-team-dat-cuoc.md` |
| 29 | SURVEY OR QUIZ | `survey-quiz` | `_popup-structure.md` (structure-only) |
| 30 | MỜI BẠN VÀ ĐỔI QUÀ V2 | `moi-ban-doi-qua-v2` | `22-moi-ban-be-nhan-qua.md` + `02-rut-tham-may-man.md` (merge) |
| 31 | RÚT THĂM MAY MẮN & ĐỔI QUÀ V2 (trùng tên 24) | — (gọi bằng STT 31) | `02-rut-tham-may-man.md` |
| 32 | NHẬN QUÀ THEO RANK | `nhan-qua-theo-rank` | `_popup-structure.md` (structure-only) |
| 33 | MỜI BẠN & ĐỔI QUÀ & RÚT THĂM | `moi-ban-doi-qua-rut-tham` | `22-moi-ban-be-nhan-qua.md` + `02-rut-tham-may-man.md` (merge) |
| 34 | DỰ ĐOÁN QUÀ | `du-doan`, `du-doan-qua` | `28-fantasy-team-dat-cuoc.md` |
| 35 | LOẠI BANNER | `banner` | — (banner tĩnh, không có popup flow) |
| 36 | PROMOTIONTYPES.TINDER | `tinder` | `_popup-structure.md` (structure-only) |
| 37 | PROMOTIONTYPES.AFFILIATE | `affiliate-platform` | `22-moi-ban-be-nhan-qua.md` |
| 38 | PROMOTIONTYPES.VOTE_STORY | `vote-story` | `09-vote.md` (tạm) |
| 39 | VÒNG QUAY VONG ƯU KỲ TRÂN | `spin-wheel`, `vong-quay`, `quay-so` | `39-vong-quay.md` |

**Ghi chú bảng:**
- File checklist trong `reference/` đặt tên theo format `<STT>-<slug>.md` của loại chính. File dùng chung cho nhiều loại thì đặt theo loại gốc (VD `02-rut-tham-may-man.md` dùng cho STT 2, 4, 5, 24, 26, 31 và các combo).
- **(merge)**: loại combo — load TẤT CẢ file checklist được liệt kê, gộp `required_popups` (union, dedup theo popup chính; item trùng thì gộp variant).
- **(tạm)**: chưa có checklist riêng, dùng checklist của cơ chế gần nhất.
- **`_popup-structure.md` (structure-only)** / **◐**: chưa đủ mẫu production để rút `required_popups` riêng (đo 22/9/2026: quét 4.181 template, KHÔNG nhóm popup nào đạt ≥60% xuyên suốt mọi loại ⇒ không có bộ popup bắt buộc chung để mượn). Vẫn chạy được POPUP STRUCTURE CHECK cho popup nào có mặt trong file, nhưng **KHÔNG kết luận thiếu popup** và **KHÔNG mượn `required_popups` của loại khác**. Report phải ghi rõ "loại này chưa có checklist riêng — chỉ kiểm cấu trúc".
- **—** ở cột Checklist: loại không có popup flow (chỉ STT 35 banner tĩnh) → không chạy.
- Alias `affiliate` gõ trần → hiểu là STT 22 (cùng checklist với 37 nên kết quả như nhau).
- 2 checklist phụ không gắn với type platform nào: `milestone.md` (gọi rõ `/check-promotion milestone` khi landing có milestone section) và `event.md` (generic, gọi rõ `/check-promotion su-kien`).

## Workflow

### Bước 0 — Parse arguments

Từ prompt user, extract:
1. **Loại promotion** (BẮT BUỘC — user tự nhập): match theo thứ tự ưu tiên — (a) STT 1-39, (b) tên trên platform (không phân biệt hoa/thường, chấp nhận thiếu phần "PROMOTIONTYPES." — nhưng xét SAU alias, nên `affiliate` trần ra STT 22), (c) slug/alias từ bảng trên, (d) checklist phụ: `milestone`/`moc-thuong` → `reference/milestone.md`, `event`/`su-kien` → `reference/event.md` (không tra bảng 39 loại, sang thẳng Bước 2 với file đó). Tên match trùng nhiều STT (VD "RÚT THĂM MAY MẮN & ĐỔI QUÀ V2" khớp cả 24 và 31) → lấy STT nhỏ nhất.
2. **File path** (tuỳ chọn): nếu user cung cấp path hoặc tên file.

**Nếu KHÔNG có loại trong prompt (hoặc gõ không match)**: KHÔNG tự đoán loại từ file, KHÔNG dùng AskUserQuestion để chọn loại. In NGUYÊN VĂN bảng dưới đây ra chat (đủ 39 dòng, không rút gọn) rồi DỪNG chờ user trả lời; câu trả lời của user parse lại theo rule (a)-(d) ở trên:

| STT | Loại | Checklist |
|-----|------|-----------|
| 1 | ĐĂNG KÝ TRƯỚC | ✓ |
| 2 | RÚT THĂM MAY MẮN | ✓ |
| 3 | ĐĂNG KÝ TRƯỚC & RÚT THĂM MAY MẮN | ✓ (merge) |
| 4 | ĐỔI QUÀ | ✓ |
| 5 | RÚT THĂM MAY MẮN & ĐỔI QUÀ | ✓ |
| 6 | PHÁT CODE | ✓ |
| 7 | GỬI EMAIL/CODE | ✓ (tạm) |
| 8 | PROMOTIONTYPES.SEND_EMAIL_NEXUS | ◐ structure-only |
| 9 | VOTE | ✓ |
| 10 | HOÀN TRẢ NẠP | ✓ (tạm) |
| 11 | NGƯỜI CŨ QUAY VỀ | ✓ |
| 12 | SHOP | ◐ structure-only |
| 13 | KHUYẾN MÃI NẠP | ✓ |
| 14 | ĐĂNG KÝ NHẬN QUÀ | ✓ (tạm) |
| 15 | CHUYỂN ĐỔI GAME | ◐ structure-only |
| 16 | THI ĐẤU | ◐ structure-only |
| 17 | BANG HỘI | ◐ structure-only |
| 18 | CỜ TỶ PHÚ | ◐ structure-only |
| 19 | MAIL-METAL-SLUG | ◐ structure-only |
| 20 | ĐĂNG KÝ TRƯỚC & MUA CHUNG GIẢM GIÁ | ✓ |
| 21 | ĐẶT TÊN TRƯỚC | ✓ (tạm) |
| 22 | MỜI BẠN BÈ NHẬN QUÀ | ✓ |
| 23 | LÀM BÁNH | ✓ |
| 24 | RÚT THĂM MAY MẮN & ĐỔI QUÀ V2 | ✓ |
| 25 | ĐĂNG KÍ THI ĐẤU | ◐ structure-only |
| 26 | RÚT THĂM MAY MẮN & ĐỔI QUÀ V3 | ✓ |
| 27 | ĐIỂM DANH & RÚT THĂM MAY MẮN | ✓ (merge) |
| 28 | FANTASY TEAM & ĐẶT CƯỢC | ✓ |
| 29 | SURVEY OR QUIZ | ◐ structure-only |
| 30 | MỜI BẠN VÀ ĐỔI QUÀ V2 | ✓ (merge) |
| 31 | RÚT THĂM MAY MẮN & ĐỔI QUÀ V2 | ✓ |
| 32 | NHẬN QUÀ THEO RANK | ◐ structure-only |
| 33 | MỜI BẠN & ĐỔI QUÀ & RÚT THĂM | ✓ (merge) |
| 34 | DỰ ĐOÁN QUÀ | ✓ |
| 35 | LOẠI BANNER | — |
| 36 | PROMOTIONTYPES.TINDER | ◐ structure-only |
| 37 | PROMOTIONTYPES.AFFILIATE | ✓ |
| 38 | PROMOTIONTYPES.VOTE_STORY | ✓ (tạm) |
| 39 | VÒNG QUAY VONG ƯU KỲ TRÂN | ✓ |

👉 Nhập STT (1-39) hoặc tên loại để tiếp tục. (`✓` = có checklist đầy đủ; `◐` = chỉ kiểm cấu trúc popup, chưa đủ mẫu để rút danh sách popup bắt buộc; `—` = không có popup flow.)

Ví dụ parse:
- `/check-promotion` → thiếu loại → in bảng 39 loại + chờ user nhập STT/tên
- `/check-promotion 22` → STT 22 = MỜI BẠN BÈ NHẬN QUÀ → checklist `22-moi-ban-be-nhan-qua.md`, file = detect từ IDE
- `/check-promotion vong-quay iframe_vong_quay.html` → STT 39 → `39-vong-quay.md`, file = iframe_vong_quay.html
- `/check-promotion nap-tien` → STT 13 = KHUYẾN MÃI NẠP → `13-khuyen-mai-nap.md`, file = detect từ IDE
- `/check-promotion "rút thăm may mắn & đổi quà"` → STT 5 → `02-rut-tham-may-man.md`
- `/check-promotion abcxyz` → không match → in bảng 39 loại + chờ user nhập lại
- `/check-promotion shop` → STT 12, chạy structure-only: kiểm cấu trúc popup đang có, không kết luận thiếu popup

### Bước 1 — Xác định file target

Thứ tự ưu tiên:

#### 1.1. SCAN MESSAGE HIỆN TẠI tìm tag `<ide_opened_file>`

Đọc chính xác message user vừa gửi. Tìm pattern:
```
<ide_opened_file>The user opened the file <PATH> in the IDE. ...</ide_opened_file>
```

Extract path từ tag.

#### 1.2. Quyết định file target

**Case A — Tag `<ide_opened_file>` tồn tại với path `.html`**:
- Dùng path đó làm target NGAY LẬP TỨC.

**Case B — User prompt có path/tên file `.html`** (đã extract ở Bước 0):
- Full path → dùng luôn.
- Chỉ tên file → Glob `**/<filename>` để tìm full path.

**Case C — KHÔNG có tag VÀ KHÔNG có path trong prompt**:
1. Glob `**/*.html` lấy 5 file mới modify nhất.
2. AskUserQuestion với 4 options (file top 1-4).
3. Question ngắn: `"File HTML nào cần check?"`.

#### 1.3. Verification

KHÔNG Read file HTML — script ở Bước 2 tự đọc. Path không tồn tại → script trả `THIEU_FILE` → chuyển Case C.

### Bước 2 — Chạy script (thay cho soát tay)

```bash
node ~/VNG/agent-auto/tools/check-promotion.mjs <loại user gõ> <path>
```

In NGUYÊN VĂN stdout ra chat — đó đã là report đúng format Spec ③. Script đọc bảng 39 loại ở trên + `reference/*.md` + `pm-kit-overrides.tsv` lúc chạy, gameplay payment lấy từ file dự án ⇒ sửa checklist là sửa ở `reference/`, KHÔNG sửa script. Các mục "Spec script ①-③" bên dưới là **spec script thực thi**, model KHÔNG soát tay lại.

| Kết quả | Làm gì |
|---|---|
| exit 0 / 1 | in stdout (1 = có Fail) rồi sang Bước 3 |
| `LOAI_KHONG_KHOP` | in bảng 39 loại ở Bước 0, chờ user |
| `KHONG_CO_CHECKLIST` | báo lỗi, dừng (Skip rule) |
| `THIEU_FILE` | Bước 1 Case C |

Script chỉ nhận nút submit của thẻ `a` qua class/id (`submit`, `btn`, `confirm`, `xacnhan`, `dangky`, `nhan`…) — không đọc chữ trên nút. Form bị báo thiếu submit mà dev nói có nút `<a>` chữ "Xác nhận" → mở đúng dòng đó kiểm tay, sai thì sửa regex `SUBMIT_LIKE` kèm test.

### Spec script ① — Load checklist

Tra cột **Checklist** trong bảng ở section "39 promotion type" phía trên để biết file cần load từ `reference/`. Ví dụ: STT 13 (`nap-tien`) → load `reference/13-khuyen-mai-nap.md`; STT 27 → load `reference/27-diem-danh-rut-tham.md` + `reference/02-rut-tham-may-man.md`. Checklist phụ (đã chốt ở Bước 0d): load thẳng `reference/milestone.md` hoặc `reference/event.md`, không tra bảng.

Extract từ (các) file:
- `required_popups` → danh sách popup bắt buộc (section `## required_popups`).
- Popup structure rules: các file trỏ về `reference/_popup-structure.md` (nguồn duy nhất) — **load thêm file đó**. File nào có section "Khác biệt của loại này" thì áp override đè lên bản chung (hiện có: `09-vote.md`, `13-khuyen-mai-nap.md`).

**Merge rule (loại combo, nhiều file checklist)**: gộp `required_popups` của các file — union theo popup chính (`popup_login`, `popup_register`...), item trùng nhau thì gộp danh sách variant lại. Trong output ghi rõ item đến từ checklist nào nếu chỉ có ở 1 file.

**Lưu ý**: file reference có thể chứa section `## required_pm_classes` — BỎ QUA section này, KHÔNG check pm__ class.

**Structure-only rule**: cột Checklist ghi `_popup-structure.md (structure-only)` → load MỖI `reference/_popup-structure.md`. Chạy POPUP STRUCTURE CHECK cho popup nào **có mặt** trong file, rồi:
- **KHÔNG** in mục "popup bắt buộc còn thiếu" — loại này chưa có `required_popups`, không có cơ sở để nói thiếu.
- **KHÔNG** mượn `required_popups` của loại khác (đo 22/9/2026: 4.181 template, không nhóm popup nào ≥60% xuyên loại ⇒ không tồn tại bộ chung để mượn).
- **KHÔNG** chạy Layer 1 lẫn Layer 2 (không có danh sách để so ⇒ không có cơ sở nói thiếu hay thừa) — chỉ chạy Layer 3.
- Mở đầu report ghi rõ: "⚠️ Loại `<tên>` (STT X) chưa có checklist riêng — chỉ kiểm CẤU TRÚC popup đang có. Muốn kiểm đủ popup bắt buộc thì cần ≥3 template production của loại này để rút checklist."
- Icon tổng kết tối đa ◐ (xem Spec ③) — loại này KHÔNG BAO GIỜ ra ✅.

**Skip rule**: cột Checklist là **—** (STT 35 banner tĩnh) hoặc file map không tồn tại → báo lỗi và dừng, KHÔNG tự dùng checklist loại khác.

### Spec script ② — Parse & validate HTML

Đọc toàn bộ file HTML target. Thực hiện 3 layer check:

#### Layer 1 — Popups Required

**Scan**: Tìm tất cả element container có `id` bắt đầu bằng `popup` — thường là `<section>` nhưng một số template (VD TLBB) dùng `<div id="popup_*">` bọc trong section khác. Regex: `<(?:section|div)[^>]*id="(popup[^"]*)"`.

**Id kit ≡ id production**: trước khi so, đọc `~/VNG/agent-auto/rules/pm-kit-overrides.tsv`, các dòng `kind=alias`: id cột `kit` và id cột `production` là CÙNG MỘT popup (production thắng kit). VD trang dựng từ MASTER có `popup_signIn` → khớp item `popup_login`; `popup_nhanluot_signUp` → khớp item `popup_register`. Áp cho MỌI checklist, kể cả checklist chưa liệt kê id kit trong variant.

**Match logic**: Mỗi item trong `required_popups` có thể list nhiều variant ID (cách nhau bởi "hoặc"). Item pass nếu BẤT KỲ variant nào (hoặc id alias của nó) trùng ĐÚNG TÊN với popup ID tìm được trong file — không khớp kiểu "chứa chuỗi".

Ví dụ: `popup_login (hoặc popup_dangnhap, popupDangnhap)` → pass nếu file có `popup_login` HOẶC `popup_dangnhap` HOẶC `popupDangnhap` HOẶC `popup_signIn` (alias kit).

**Ghi chú sau item quyết định mức** — đọc theo dấu, không theo con số:

| Ghi chú sau item | Mức | Popup có trong file | Popup không có |
|---|---|---|---|
| Không ghi chú, hoặc ghi chú không chứa `(optional` và không có chữ "nếu" — VD `*(75% — popup hiển thị quà nhận được)*` | bắt buộc | ✅ Pass | ❌ Fail |
| Ghi chú nghiêng có chữ "nếu" — VD `*(59% — nếu yêu cầu login)*` | có điều kiện: chỉ bắt buộc khi landing có đúng điều kiện đó | ✅ Pass | ⚠️ Warning "chỉ bắt buộc nếu <điều kiện> — dev tự xác nhận", KHÔNG tính X/Y |
| Đậm **(optional …)** | tuỳ chọn | ⏭️ Skip — không Pass/Fail, không tính thừa (Layer 2), không chạy Layer 3 | ⏭️ Skip |

`nn%` trong ghi chú là tỉ lệ corpus production lúc rút checklist (≥60% bắt buộc, 40-59% có điều kiện) — chỉ để tham khảo. VD optional: `popup_selectrole` trong `02`/`13`.

**Popup UI tự do**: `popup_rule` (mọi gameplay) và `popup_reward` (ngoài Lucky Draw — MASTER Payment không có; MASTER Lucky Draw có `popup_reward` kèm `rewardContainer`) KHÔNG phải hook bắt buộc của kit: dev tự dựng như popup UI riêng — được thêm, pm-gate không đòi. Checklist vẫn đòi vì đa số production có ⇒ dựng thẳng từ MASTER mà thiếu thì Fail là đúng (thiếu popup UI), không phải lỗi kit.

**Kết quả**: Mỗi item (trừ optional) → ✅ Pass (ghi popup ID match được), ❌ Fail, hoặc ⚠️ (item có điều kiện vắng mặt).

#### Layer 2 — Popups Extra

**So sánh**: Lấy tất cả popup ID trong file TRỪ: ID đã match ở Layer 1, variant của item **(optional)**, và **popup chuẩn kit** — id popup có trong 2 MASTER của kit (kèm id production qua alias): `popup_signIn`/`popup_login`, `popup_nhanluot_signUp`/`popup_register`, `popup_selectrole`, `popup_condition`, `popupCondition`, `popup_history`, `popup_inform`, `popup_bxh`, `popup_reward`, `popup_confirm`. Dựng theo MASTER là đúng chuẩn ⇒ popup chuẩn kit không bao giờ là thừa, kể cả khi checklist loại không liệt kê.

**Không chạy Layer 2** với loại structure-only (không có danh sách để so) và checklist phụ `milestone` (chạy kèm loại chính — popup khác trong file là của loại chính).

**Kết quả**: Mỗi popup extra → ⚠️ Warning.

#### Layer 3 — Cấu trúc Popup Quan Trọng

Chỉ check cho popup **đã tồn tại** trong file (trừ item optional). Chuẩn là `reference/_popup-structure.md` — nguồn duy nhất cho popup đăng ký, điều kiện, thông báo, kèm danh sách tên nhận diện (gồm id kit). File checklist của loại có mục "Khác biệt của loại này" thì phần đó GHI ĐÈ bản chung.

**QUAN TRỌNG**: Khi check "bên trong popup", giới hạn scope từ tag mở của element popup (`<section id="popup_xxx">` hoặc `<div id="popup_xxx">`) đến tag đóng tương ứng của nó. Không check toàn bộ file.

### Spec script ③ — Output kết quả

Print output theo format sau:

```
🎯 Target: <path>
📋 Loại: STT <X> — <TÊN TRÊN PLATFORM> (input user: <loại user gõ>) — checklist: <file(s).md>

## Popups Required
| # | Popup | Status | Ghi chú |
|---|-------|--------|---------|
| 1 | popup_login | ✅ Pass | Matched: popup_login (line XX) |
| 2 | popup_register | ❌ Fail | Không tìm thấy (variants: popup_register, popup_dangky, popupChonNV) |

## Popups Extra
| Popup | Ghi chú |
|-------|---------|
| popup_doiqua | ⚠️ Không nằm trong checklist 39-vong-quay |

(Nếu không có popup extra, ghi: "Không có popup thừa.")

## Cấu trúc Popup Quan Trọng
| Popup | Check | Status |
|-------|-------|--------|
| popup_register | form bên trong popup | ✅ Pass |
| popup_register | select[name="ServerID"] + option đầu class server-select-title | ✅ Pass |
| popup_register | select[name="CharacterID"] + option đầu class character-select-title | ❌ Fail — option đầu thiếu class character-select-title |
| popup_register | button submit | ✅ Pass |
| popup_condition | form id chứa "condition" | ✅ Pass |
| popup_condition | input | ✅ Pass |
| popup_condition | button submit | ✅ Pass |
| popup_inform | vùng chữ thông báo (`pm__inform-text` hoặc `<p>` trong content) | ✅ Pass |

(Chỉ show popup nào tồn tại trong file. Popup không tồn tại → không hiện trong bảng này.)

## Tổng kết: X/Y Passed [ICON]
❌ Thiếu: [danh sách items fail]
⚠️ Warning: [danh sách warnings — popup thừa + ServerID thiếu]
```

**Quy tắc tính X/Y ở Tổng kết:** Y = số item Layer 1 ra ✅/❌ (không tính optional và item có điều kiện vắng mặt) + tổng số structure check đã chạy (Layer 3, chỉ các popup tồn tại trong file). X = số item ✅ Pass trong đó. Warning không tính vào X/Y.

**Header cho checklist phụ** (milestone/event — không có STT): ghi `📋 Loại: Checklist phụ — <milestone|event> — checklist: <file>.md`.

**Quy tắc icon tổng kết** (xét từ trên xuống, gặp dòng nào khớp thì dừng):
- Có ít nhất 1 Fail → ❌
- Loại structure-only (◐ trong bảng 39 loại) → ◐, kèm dòng "◐ Chỉ kiểm cấu trúc — loại này chưa có checklist popup bắt buộc, CHƯA kết luận đủ popup". Loại này không bao giờ ra ✅.
- Tất cả Pass + có warning → ⚠️
- Tất cả Pass + không warning → ✅

### Bước 3 — Kết thúc

Sau khi output, KHÔNG tự sửa file. Skill này chỉ báo cáo (read-only).

Gợi ý cho user nếu có fail:
- Nếu thiếu popup → "Gợi ý: thêm popup section thủ công theo template chuẩn"

## Nguyên tắc

1. **Read-only**: Chỉ đọc và báo cáo. KHÔNG sửa file.
2. **Flexible ID matching**: Popup ID có nhiều variant giữa các game — match bất kỳ variant nào.
3. **KHÔNG check pm__ class**: skill này chỉ check popup + cấu trúc popup. Section `required_pm_classes` trong reference (nếu có) → bỏ qua. Hợp đồng `pm__` soát bằng `pm-gate` (R-PM-8 trong `~/VNG/agent-auto/rules/pm-contract.md`); không dùng skill tự điền `pm__` (R-PM-12).
4. **Popup structure scope**: Check cấu trúc bên trong đúng popup section, không phải toàn file.
5. **Warning vs Fail**: Popup thừa = Warning. Mọi mục structure check của popup_register (form, ServerID + option class, CharacterID + option class, button submit) thiếu = Fail — áp dụng cho TẤT CẢ loại promotion. Còn lại theo checklist của loại.
