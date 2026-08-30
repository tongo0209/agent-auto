---
name: video-digest
description: Bóc video thành text/số rẻ tiền bằng script, AI chỉ đọc bản đã nghiền — thay cho việc ném frame thô vào model. Dùng khi user gõ /video-digest, hoặc nói "bóc video", "phân tích video", "lấy animation từ video này", "video QC gửi", "học video youtube này", "làm giống clip này". Xử lý 4 loại: animation mong muốn → motion spec (duration/easing/stagger đo bằng pixel) · video feedback QC → buglist nháp có mốc giây · tutorial/thao tác → danh sách bước · video học nghề → notes tích luỹ. RIÊNG MÁY NÀY — không share, không vào git.
---

# /video-digest — bóc video bằng script, AI vào sau cùng

> 🇻🇳 Giao tiếp với user bằng TIẾNG VIỆT. Skill này là ĐỒ RIÊNG của user.

Video là **nguyên liệu thô**, không phải thứ để model nhìn. Một screencast 12 phút ném thẳng
vào model là ~34 triệu vision token; qua digest còn ~28k **một lần**, lần sau đọc `notes.md`
còn ~2k.

Nguyên tắc nền: **hình → biến thành SỐ, số là text.** Model nhìn hoạt ảnh chỉ nói được "trượt
từ trái, hơi nảy"; script đo được `dịch 320px / 640ms / cubic-bezier(.22,1,.36,1)` — vừa rẻ
hơn vừa chính xác hơn, và dán thẳng vào code được.

## Đường dẫn

- Script: `~/VNG/agent-auto/skills/video-digest/scripts/` (`run.sh` là cửa chính)
- Bài học đã trả giá: `references/lessons.md` — ĐỌC khi gặp số đo lạ, trước khi đoán
- Digest nặng: `designs/<KEY>/_auto-video/<slug>/` (ngoài git) — không `--key` thì `designs/_inbox-video/`
- Chữ đã chắt: `knowledge/video/<slug>/notes.md` (vào git)
- Thiết kế: `docs/specs/2026-08-30-video-digest-design.md`
- Yêu cầu máy: `ffmpeg` · `tesseract` (OCR) · `yt-dlp` (nguồn URL) · numpy + PIL

## Cách gọi

```bash
bash run.sh <file|url> [--lens a,b] [--key GW-760] [--deep] [--out DIR]
```

| Lệnh | Làm gì |
|---|---|
| `/video-digest clip.mp4` | tự phân loại rồi chọn lens phù hợp |
| `/video-digest clip.mp4 --lens motion-spec` | ép đo animation |
| `/video-digest <url> ` | YouTube: **chỉ lấy phụ đề/chapters/description**, không tải video |
| `/video-digest <url> --deep` | tải video thật để bóc hình |
| `/video-digest clip.mp4 --lens bug-list,motion-spec` | clip lai: bóc 1 lần, đọc 2 đường |

## Bốn kính đọc

| Lens | Cho loại video | Đẻ ra | Token |
|---|---|---|---|
| `motion-spec` | animation mong muốn | duration/delay/stagger/bezier dán vào GSAP/CSS | **0** |
| `bug-list` | feedback QC | mốc giây + lời người quay + chữ trên màn + frame chứng | **0** |
| `step-list` | tutorial/thao tác | danh sách bước có mốc giây | **0** |
| `study-notes` | học nghề | `out/study-notes.md` để AI viết `notes.md` | 1 lượt |

Chỉ `study-notes` cần AI, và đúng một lần cho mỗi video.

## Luật khi dùng kết quả

1. **`unfit` là câu trả lời hợp lệ.** Lens ghi `unfit` nghĩa là quỹ đạo không khớp easing chuẩn
   nào — mở `sheets/` nhìn rồi tự quyết. **Cấm** lấy đại một bezier cho báo cáo đẹp.
2. **Thời lượng "thấy được" ngắn hơn thời lượng thật** với easing giảm tốc mạnh: mấy frame cuối
   dịch dưới 1px. Cột `dur_ms` đã là số ĐÃ FIT, dùng số đó; `dur_seen_ms` chỉ để tham khảo.
3. **`bug-list` không phán bug** — nó gom bằng chứng. Đọc rồi tự viết mô tả, xong đưa sang
   `/bug-fixer-lite`; skill này KHÔNG ghi Google Sheet.
4. **Đừng mở lại frame khi đã có text.** Có `onscreen.csv`/`subs.csv` thì đọc text; chỉ mở
   `sheets/` khi thật sự cần nhìn bố cục.
5. Video dạy code: **luôn xem `source/*.description` trước** — thường có link GitHub/CodePen,
   `git clone` cho code chính xác 100%, khỏi OCR.

## Cổng kiểm cơ học

| Mã | Chặn gì |
|---|---|
| `G-VD-1` | thiếu binary → in đúng lệnh `brew install`, dừng |
| `G-VD-2` | video không decode được / thời lượng 0 → dừng |
| `G-VD-3` | dedupe ra 0 frame hoặc vượt trần → dừng |
| `G-VD-4` | OCR rỗng gần hết mà ảnh nhiều chi tiết → cảnh báo vào `digest.json` |
| `G-VD-5` | vùng chuyển động sống < 3 frame → loại, coi là nhiễu |
| `G-VD-6` | RMSE > 0.03 → `unfit`, cấm xuất bezier |
| `G-VD-7` | lens chỉ đọc `digest/`, không đụng video gốc → test chặn |

## Test

```bash
bash scripts/test.sh
```

Cốt lõi là **ground truth tự sinh**: `fakevideo.py` dựng clip biết trước đáp án (dịch bao nhiêu
px, bao lâu, easing gì) rồi assert động cơ khôi phục đúng — không có chuyện "nhìn có vẻ đúng".
