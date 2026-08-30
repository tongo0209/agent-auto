# Design: Skill `/video-digest` — bóc tách video bằng script, AI chỉ vào ở bước cuối

**Ngày:** 2026-08-30 · **Trạng thái:** Đã duyệt (user chốt Cách A, rồi `/goal làm full đi`)

## Mục tiêu

Đọc video mà không đốt token. Video là **nguyên liệu thô**, không phải thứ để model nhìn:
script tải về + nghiền thành text/số rẻ tiền, AI chỉ đọc bản đã nghiền.

Đo trên một screencast 12 phút:

| Cách | Token |
|---|---|
| Ném video thô cho model | ~34 triệu (bất khả thi) |
| Digest (transcript + OCR + motion spec + 2 filmstrip) | ~28k, **một lần** |
| Lần sau đọc lại `notes.md` | ~2k |

Nguyên tắc nền: **hình → biến thành SỐ, số là text**. Model nhìn hoạt ảnh chỉ nói được
"trượt từ trái, hơi nảy"; script đo được "dịch 320px trong 640ms, khớp
`cubic-bezier(.34,1.56,.64,1)`" — vừa rẻ hơn vừa chính xác hơn, và dán thẳng vào code được.

## Quyết định đã chốt với user

| Câu hỏi | Chốt |
|---|---|
| Kiến trúc | **Cách A** — một động cơ, một bản trung gian `digest/`, nhiều "kính đọc" (lens) |
| Phạm vi loại video | Cả 4 (animation · feedback QC · tutorial/thao tác · học nghề) — chung động cơ, khác lens |
| Nguồn đầu vào | Cả 4 (file local · Drive/SharePoint · YouTube · web đang chạy) — quy về 1 hợp đồng: file local |
| YouTube | **Mặc định KHÔNG tải video** — lấy metadata + chapters + phụ đề + description trước |
| Nơi đổ digest nặng | `designs/<KEY>/_auto-video/<slug>/` — ngoài git |
| Nơi lưu chữ đã chắt | `knowledge/video/<slug>/` — vào git |
| `bug-list` có ghi Google Sheet không | **Không** — chỉ xuất file đúng format `/bug-fixer-lite` ăn được; ghi sheet là việc của skill đó |
| Thứ tự làm | Động cơ trước, rồi cả 4 lens (user: "tất cả luôn") |

## Kiến trúc

```
NGUỒN            ĐỘNG CƠ (thuần script, 0 token)                    KÍNH ĐỌC
─────            ────────────────────────────────                   ────────
file local  ┐                                                   ┌→ motion-spec  (script)
YouTube URL ├→ ingest → probe → sample → text → motion → digest/ ├→ bug-list     (script)
Drive file  ┤                                                   ├→ step-list    (script)
web URL     ┘                                                   └→ study-notes  (script + AI 1 lượt)
```

Đặt tại `~/VNG/agent-auto/skills/video-digest/`, bám khuôn `/psd-cut`: `run.sh` là cửa chính,
mỗi script một chặng, mỗi script có `.test.py` kèm bên, cổng kiểm cơ học chặn rác.

### Năm chặng động cơ

Mỗi chặng chạy độc lập được (`--only <chặng>`), đầu ra chặng trước là đầu vào chặng sau.

| Chặng | Làm gì | Đẻ ra |
|---|---|---|
| `ingest` | adapter theo nguồn; YouTube lấy metadata/chapters/phụ đề/description trước khi nghĩ tới tải video | `source.json`, `video.mp4` (nếu cần) |
| `probe` | `ffprobe`: fps, khổ, thời lượng, có tiếng; điểm scene từng frame; `freezedetect`, `blackdetect` | `probe.json`, `signals/scene.csv`, `signals/events.csv` |
| `sample` | `mpdecimate` bỏ frame trùng, tên file = mốc giây; contact sheet | `frames/t0012.480.png`, `frames.csv`, `sheets/sheet-NN.png` |
| `text` | phụ đề → md có mốc; OCR frame; gộp cụm code tăng dần thành snippet | `text/subs.md`, `text/onscreen.csv`, `snippets/` |
| `motion` | dò vùng biến động bằng phương sai theo thời gian; bám quỹ đạo; cắt nhịp | `motion/regions.json`, `motion/track-r1.csv`, `motion/beats.csv` |

**Mẹo OCR quyết định độ chính xác** (từ ~70% lên ~95% với code trên nền tối):
phóng 3× bằng lanczos → `negate` (editor toàn dark theme) → `tesseract --psm 6
-c preserve_interword_spaces=1`.

**Dedupe code phải làm trên TEXT, không trên pixel.** Gõ code là text tăng dần đơn điệu,
frame sau chứa frame trước; giữ frame cuối của mỗi đoạn tăng trưởng (trước khi scroll/xoá/đổi
file) → 720 frame lấy mẫu còn ~12 snapshot hoàn chỉnh.

**Đường tắt phải thử trước khi OCR:** `yt-dlp --write-description --write-comments`. Video dạy
code phần lớn có link GitHub/CodePen trong mô tả hoặc comment ghim → `git clone` cho code chính
xác 100%, khỏi OCR.

### Nơi đổ ra — tách nặng/nhẹ

```
designs/<KEY>/_auto-video/<slug>/   ← digest NẶNG (video, frame, sheet): ngoài git
knowledge/video/<slug>/             ← chỉ notes.md + motion-spec.md (chữ): vào git
```

Nguyên liệu nặng không bao giờ vào git; chỉ chữ đã chắt ra mới lưu lâu dài.

## Hợp đồng `digest/`

**Luật cứng: lens chỉ được đọc `digest/`, cấm mở lại `video.mp4`.** Ràng buộc này khiến digest
thiếu trường là lộ ra ngay lúc viết lens, thay vì lens âm thầm đi đường vòng.

`digest.json`:

```json
{
  "schema": 1,
  "slug": "pm-feedback-hero-2026-08-30",
  "source":  { "kind": "local", "path": "...", "sha256": "...", "url": null },
  "media":   { "fps": 30, "w": 1920, "h": 1080, "duration": 47.2, "has_audio": true },
  "classify": {
    "guess": "motion",
    "scores": { "motion": 0.71, "screencast": 0.12, "walkthrough": 0.09, "talking": 0.08 },
    "signals": { "text_density": 0.04, "scene_cuts": 3, "motion_energy": 0.68, "subs": false }
  },
  "beats": [ { "i": 3, "t0": 2.14, "t1": 2.78, "regions": ["r1", "r2"] } ],
  "artifacts": { "frames": "frames.csv", "subs": null, "onscreen": "text/onscreen.csv" }
}
```

Tự phân loại bằng 4 tín hiệu cơ học, không AI: mật độ chữ (OCR thử 5 frame), số lần cắt cảnh,
năng lượng chuyển động, có phụ đề không. Kết quả **chỉ để chọn lens mặc định**; luôn ép tay
được bằng `--lens`.

`beats.csv` là xương sống: mọi thứ neo theo mốc giây, nên lens nào cũng chỉ ngược được vào
frame và transcript tại đúng thời điểm.

## Bốn kính đọc

| Lens | Đọc gì | Đẻ ra | Cần AI? |
|---|---|---|---|
| `motion-spec` | `track-*.csv` + `beats.csv` | bảng duration/delay/stagger/bezier dán vào GSAP | **Không** — toán fit thuần |
| `bug-list` | `beats` + `onscreen.csv` + `subs.md` + frame chứng | danh sách lỗi có mốc giây + ảnh chứng, format `/bug-fixer-lite` | **Không** |
| `step-list` | cắt cảnh + OCR chữ theo màn | danh sách bước có mốc giây | **Không** |
| `study-notes` | toàn bộ, rút gọn | `notes.md` vào `knowledge/video/` | **Có — đúng 1 lượt/video** |

Ba lens đầu **0 token tuyệt đối**, chạy lại bao nhiêu lần cũng miễn phí.

Chạy nhiều lens trên cùng digest được: clip PM vừa chỉ lỗi vừa kèm "animation mong muốn kiểu
này" → `--lens bug-list,motion-spec`, bóc một lần dùng hai đường.

### Fit easing — và luật không nói dối

`motion-spec` chuẩn hoá quỹ đạo về `progress(t) ∈ [0,1]` rồi thử một rổ ứng viên
(`linear`, `ease`, `ease-in/out`, các bezier thông dụng, overshoot/spring), chọn RMSE nhỏ nhất.

**RMSE > 0.03 → ghi `unfit` kèm trỏ filmstrip, CẤM xuất bezier.** Thà báo "không khớp easing
chuẩn, xem `beat3.png`" còn hơn bịa một con số cho đẹp báo cáo.

## Cổng kiểm cơ học

Chặn rác ngay tại chỗ sinh ra, thay vì để lens nhận dữ liệu hỏng.

| Mã | Cổng | Hỏng thì |
|---|---|---|
| `G-VD-1` | binary có mặt (`ffmpeg`/`ffprobe` luôn; `tesseract` khi OCR; `yt-dlp` khi nguồn URL) | dừng, in lệnh `brew install` cần chạy |
| `G-VD-2` | decode được: ≥1 video stream, `duration > 0` | dừng |
| `G-VD-3` | dedupe ra 0 frame | dừng. **Vượt trần thì lấy thưa + cảnh báo, không dừng** — screencast dày thao tác vẫn có thể còn nhiều frame thật, chặn cứng là chặn nhầm việc hợp lệ |
| `G-VD-4` | OCR không rỗng bất thường: ≥90% frame ra rỗng trong khi mật độ cạnh cao | cảnh báo, ghi vào `digest.json`, không dừng |
| `G-VD-5` | vùng motion ổn định: region phải sống ≥3 frame liên tiếp mới được ghi nhận | loại region nhiễu |
| `G-VD-6` | easing trung thực: RMSE > 0.03 → `unfit` | không xuất bezier |
| `G-VD-7` | lens không đụng video gốc | test chặn |

## CLI

```bash
bash run.sh <nguồn> [--lens a,b] [--key GW-760] [--deep] [--only <chặng>] [--out DIR]
```

| Cờ | Nghĩa |
|---|---|
| `<nguồn>` | đường dẫn file, URL YouTube, hoặc URL trang web |
| `--lens` | ép lens, mặc định theo `classify.guess`; nhận nhiều lens ngăn bằng dấu phẩy |
| `--key` | mã task Jira → đổ vào `designs/<KEY>/_auto-video/<slug>/`; **không có `--key` thì đổ vào `designs/_inbox-video/<slug>/`** |
| `--deep` | với YouTube: tải video thật để bóc hình (mặc định chỉ lấy phụ đề) |
| `--only` | chạy đúng một chặng, để gỡ lỗi |
| `--out` | ép thẳng thư mục digest, bỏ qua quy tắc `--key` |

## Chiến lược test

Cốt lõi: **ground truth tự sinh**. `fakevideo.py` dựng video mà ta biết trước đáp án, rồi
assert động cơ khôi phục đúng — verify thật, không "nhìn thấy có vẻ đúng".

| Test | Ground truth | Ngưỡng |
|---|---|---|
| `easing.test.py` | quỹ đạo sinh từ bezier đã biết | fit đúng lại bezier đó, RMSE < 0.01 |
| `vd_motion.test.py` | ô vuông dịch 320px trong 640ms, bezier biết trước | duration sai ≤ 1 frame; bezier RMSE < 0.03 |
| `vd_sample.test.py` | video 10s đứng yên 9s | dedupe còn ≤ 3 frame |
| `vd_probe.test.py` | video có 3 lần cắt cảnh dựng sẵn | phát hiện đúng 3, mốc sai ≤ 1 frame |
| `vd_text.test.py` | frame render chữ biết trước (nền tối) | OCR khớp ≥90% ký tự |
| `lens_*.test.py` | digest giả viết tay | xuất đúng format; **không mở `video.mp4`** (`G-VD-7`) |

Lối viết bám `psd-cut`: script assertion gom `FAIL`, chạy thẳng `python3 <file>.test.py`,
không framework.

## Yêu cầu máy

```bash
brew install ffmpeg tesseract tesseract-lang yt-dlp
```

Python: `numpy` + `PIL` (đã có sẵn trên `python3` hệ thống — 2.0.2 / 11.3.0).
Không dùng `opencv`/`pyscenedetect`: filter của `ffmpeg` làm gần hết, nhẹ hơn nhiều.

## Không làm (YAGNI)

- **Không** ghi ngược Google Sheet — `/bug-fixer-lite` đã làm.
- **Không** nhận diện giọng nói ở bản đầu; nếu cần, `whisper.cpp` chạy local (0 token API), nối sau.
- **Không** bám con trỏ chuột bằng template matching — danh sách bước từ cắt cảnh + OCR đã đủ.
- **Không** làm adapter Drive/SharePoint có auth ở bản đầu: user tải tay rồi đưa file local.
- **Không** tự động chạy sau mỗi task; skill này **opt-in**, chỉ chạy khi được gọi.
