# knowledge/video — chữ đã chắt ra từ video

Chỉ **chữ** sống ở đây. Nguyên liệu nặng (video, frame, contact sheet) nằm trong
`designs/<KEY>/_auto-video/<slug>/` và bị `.gitignore` chặn — tải/bóc lại được, không cần lưu.

```
<slug>/
  notes.md         ← AI viết MỘT lần sau khi đọc digest, sau đó chỉ đọc lại file này
  motion-spec.md   ← số đo animation (nếu có), dán thẳng vào code
```

Vì sao tách: một video 12 phút tốn ~28k token để nghiền lần đầu, nhưng `notes.md` chỉ ~2k.
Lần sau hỏi lại "cái kỹ thuật trong video GSAP hôm nọ" thì đọc `notes.md`, **không bóc lại**.

Mẫu `notes.md` — đúng 5 mục, không thêm:

```markdown
# <tên video> — <nguồn>

## Ý chính
## Kỹ thuật dùng được
## Code rút ra
## Bẫy tác giả nhắc
## Mốc cần xem lại
```
