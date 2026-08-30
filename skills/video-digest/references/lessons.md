# Bài học đã trả giá — /video-digest

Đọc file này khi gặp số đo lạ, TRƯỚC khi đoán hoặc chỉnh ngưỡng.

## 1. Thời lượng thật KHÔNG nằm trong pixel (30/8/2026)

`easeOutQuint` 640ms @25fps: 4 frame cuối dịch tổng cộng **0.01px**. Đo chuyển động thấy được
chỉ ra 480ms, và fit ra `easeOutQuart` — sai cả hai.

**Chữa:** fit ĐỒNG THỜI `(thời lượng, easing)` thay vì đo thời lượng rồi mới fit. Hình dạng
đoạn đầu đủ để suy ngược tổng thời lượng. Chỉ được kéo dài trong phần clip mà phần tử đã đứng
yên (`rest_after`) — không suy diễn ra ngoài dữ liệu quan sát được.

**Hệ quả cho hợp đồng:** `find_beats` trả `t1_seen`/`dur_seen_ms` (thấy được), `beat_spec` trả
`t1`/`dur_ms` (đã fit). Đừng lẫn hai cái.

## 2. Nền phải ước lượng ở MỨC VÙNG, không per-pixel

Ý tưởng đầu: nền = median theo thời gian của từng pixel. Chết với easing giảm tốc: phần tử nằm
ở vị trí cuối quá nửa số frame ⇒ median tại đó = màu phần tử ⇒ mask mất luôn phần tử ở đoạn cuối.

**Chữa:** median gộp toàn bộ pixel × frame trong vùng (một số duy nhất). Phần tử chỉ chiếm
~20% diện tích vùng nên median luôn ra nền, bất kể nó đứng lâu ở đâu.

**Giới hạn còn lại:** nền có gradient/hoạ tiết thì mask nhiễu hơn. Trọng tâm vẫn thường đúng,
nhưng nếu `rmse` cao bất thường mà nhìn clip thấy chuyển động rõ → nghi nền không phẳng.

## 3. OCR code: phóng to + đảo màu quan trọng hơn mọi tham số khác

Nền tối (editor dark theme) làm tesseract rớt thảm. Thứ tự đúng: **grayscale → đảo màu nếu
mean < 128 → phóng 3× lanczos → `--psm 6`**. Đưa độ chính xác từ ~70% lên ~95%.

## 4. Dedupe code phải làm trên TEXT, không trên pixel

Gõ code là text tăng dần đơn điệu. Dedupe pixel giữ lại hàng trăm frame gần giống nhau.
Dedupe theo tăng trưởng text (giữ frame cuối mỗi cụm) đưa 720 frame còn ~12 snapshot.

Ngưỡng `_grew`: giữ ≥60% số dòng cũ thì coi là cùng cụm. Thấp hơn → gộp nhầm 2 file khác nhau;
cao hơn → cắt vụn khi tác giả xoá vài dòng giữa chừng.

## 5. `setpts` phá mốc giây

Filter `mpdecimate,setpts=N/FRAME_RATE/TB` đánh số lại timestamp thành đều tăm tắp ⇒ **mất
thông tin frame gốc nằm ở giây nào**. Bỏ `setpts`, chỉ `mpdecimate` + `showinfo` + `-vsync vfr`,
rồi parse `pts_time:` từ stderr để đặt tên file.

## 6. Máy này chặn ghcr.io ⇒ đừng trông vào brew (30/8/2026)

`brew install ffmpeg` chết ở `curl: (28) Failed to connect to ghcr.io port 443` — bottle của
Homebrew nằm trên ghcr.io, và mạng công ty chặn cả `ghcr.io` lẫn `github.com`. PyPI thì thông.

**Đường đi được:** `pip install --user av` — wheel PyAV có sẵn thư viện FFmpeg bên trong.
Hoá ra lại tốt hơn CLI: timestamp lấy thẳng từ container, bỏ được cả `showinfo` lẫn `lavfi`.

**Bẫy phụ:** `brew install ... | tail -5` trả về mã thoát của `tail`, **không** phải của brew —
lệnh hỏng mà báo exit 0. Muốn biết brew có chạy được không thì đừng nối pipe, hoặc dùng
`PIPESTATUS`.

## 7. Lấy thưa frame bằng mốc giây phải có EPS (30/8/2026)

`if t < nxt: continue` với `nxt = t + 1/fps` làm rơi oan **5/28 frame**: sai số số thực khiến
`0.24000000000000002 < 0.24000000000000004`. Hậu quả không lộ ra dưới dạng crash — chỉ là
easing đo ra 560ms/`unfit` thay vì 640ms/`easeOutQuint`.

**Chữa:** so với `nxt - step*1e-3`. Bài học chung: mọi so sánh mốc giây trong pipeline này
phải có dung sai, đừng bao giờ so bằng hoặc so nhỏ hơn trần trụi.
