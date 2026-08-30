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

## 8. Ngưỡng phân loại phải ĐO rồi mới đặt (30/8/2026)

Bộ phân loại đầu tiên chấm một clip **toàn chữ, đứng yên** thành `motion` 0.35 — vì nó cộng
"điểm thưởng" 0.3 cho `density < 0.15`, mà thang density mới (mật độ cạnh) chỉ chạy trong
khoảng 0.002–0.031, không bao giờ chạm 0.15.

**Số đo thật:** màn chữ `density 0.031 / energy 0.0022`; animation `density 0.002 / energy 0.018`.
Cách nhau 15× và 8× — thừa sức phân biệt, chỉ là ngưỡng đặt sai chỗ.

**Chữa:** chấm theo TỈ LỆ so với ngưỡng đo được (`density/DENSITY_TEXT`), bỏ hết điểm thưởng
tuỳ tiện. Đổi thang đo mà không đo lại ngưỡng là công thức để sai âm thầm.

## 9. Đừng để phỏng đoán điều khiển việc chạy chặng nào (30/8/2026)

`vd_run` từng bỏ qua OCR khi `guess == "motion"`. Hệ quả dây chuyền: đoán sai loại video ⇒
không OCR ⇒ `step-list` in ra "chưa chạy OCR" dù người dùng gọi đúng lens đó.

**Chữa:** chạy chặng nào là do **lens yêu cầu**, không do phỏng đoán. Phỏng đoán chỉ được phép
làm đúng một việc: chọn lens MẶC ĐỊNH khi người dùng không chỉ định.

## 10. Cắt cảnh đo bằng TỈ LỆ pixel đổi, và phải loại khỏi năng lượng chuyển động

Độ lệch trung bình không phân biệt được "đổi cả màn" với "một phần tử to chạy qua". Dùng
`tỉ lệ pixel đổi > 12%` mới đúng nghĩa cắt cảnh.

Và phải **loại frame cut ra khỏi `motion_energy`** — nếu không, video nhiều cảnh nào cũng bị
chấm là lắm chuyển động, `walkthrough` không bao giờ thắng nổi `motion`.

## 11. yt-dlp: dùng API Python, và tách lượt (30/8/2026)

Ba cái bẫy gặp liên tiếp khi bóc YouTube:

1. **`pip install --user` để script ngoài PATH** ⇒ `shutil.which("yt-dlp")` không thấy dù module
   `yt_dlp` import được. Dùng API Python là hết chuyện.
2. **YouTube từ chối player client mặc định** — `ERROR: The page needs to be reloaded`. Client
   `android` qua được; để cả chuỗi `android → ios → tv → web_safari` cho chắc.
3. **Một thứ tiếng phụ đề hỏng làm chết cả lượt ingest.** Gặp `HTTP 429` khi thử `vi` là mất
   luôn metadata. Phải tách 3 lượt độc lập: metadata · phụ đề (thử từng tiếng, hỏng thì bỏ qua)
   · video. Metadata là thứ luôn phải lấy được.

Ngoài ra `--convert-subs srt` cần ffmpeg — không có thì đọc thẳng `.vtt`, nhớ regex mốc giây
phải nhận cả dạng thiếu giờ `MM:SS.mmm` mà video ngắn hay dùng.
