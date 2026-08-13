# Checklist rổ 2 — những thứ hay thiếu, NHƯNG chỉ được thành CÂU HỎI

> ⚠ **Mọi mục trong file này KHÔNG BAO GIỜ được ghi là THIẾU.** Chúng chỉ sinh ra câu hỏi cho
> PM/designer (`asks[]`). Chỉ hạng mục trích được đúng câu nguồn đòi nó (`source.quote`) mới
> được vào rổ THIẾU.
>
> Vì sao gắt vậy: "đủ" phải đo theo nguồn. Lấy checklist của mình làm chuẩn rồi báo thiếu là
> báo oan designer — và một lần báo oan là mất niềm tin vào cả bản báo cáo.
>
> Cách dùng: quét checklist, mục nào nguồn KHÔNG nhắc mà theo kinh nghiệm sẽ cần khi dựng thì
> đưa vào `asks[]` với `why` ngắn gọn. Mục nào nguồn CÓ nhắc thì nó đã là item rổ 1 rồi, đừng
> lặp lại ở đây.

## Mọi task có giao diện

- **Bản mobile** (768) ứng với bản PC (1920) — và ngược lại; hoặc ghi rõ "dùng chung, co giãn".
- **Trạng thái nút / menu**: thường · hover · active/selected · disabled · loading.
- **Popup nội dung**: mỗi chỗ "bấm mở popup" phải có design ruột popup, không chỉ có nút.
- **Trạng thái dữ liệu**: rỗng (chưa có gì) · lỗi · đang tải · hết hạn / đã kết thúc.
- **Ảnh share mạng xã hội** (OG image) + meta description + title.
- **Favicon**.
- **Font**: có file font thật chưa, hay design chỉ có ảnh chữ? (font thiếu là lỗi im lặng —
  browser fallback không báo gì; xem `tools/fe-gate.mjs`)
- **Ảnh nền lặp / cạnh nối** cho màn hình cao hơn design (design 5300px, màn 1440p kéo dài).

## Landing promotion (file có class `pm__`)

- Popup **thể lệ / điều khoản**.
- Popup **đăng nhập** (hoặc trạng thái chưa đăng nhập của khối chính).
- Popup **xác nhận** trước khi đổi/nhận quà.
- Popup **thành công** / **thất bại** (kèm mã lỗi thường gặp: hết quà, hết lượt, sai điều kiện).
- Trạng thái **hết quà / hết lượt / ngoài thời gian sự kiện**.
- **Form nhập**: trạng thái lỗi validate của từng field.
- Bảng **lịch sử nhận quà** (nếu loại promotion có).

## Subweb / mainsite

- **Header** (kể cả trạng thái sticky khi cuộn) và **footer**.
- **Menu nhiều cấp**: cấp 2/cấp 3, trạng thái đang ở trang hiện tại.
- **Trang con** mà menu trỏ tới — có design riêng hay dùng chung layout?
- **Phân trang** / nút "xem thêm".
- **Bảng xếp hạng**: hàng top khác biệt? trạng thái chưa có dữ liệu?
- **Slider/carousel**: chỉ báo (dot/thumb), nút prev-next, trạng thái slide đang chọn.

## Câu hỏi hay quên hỏi

- Ảnh trong design là **ảnh thật** hay **ảnh mẫu** (placeholder chờ nội dung thật)?
- Có **video** không, ai cấp file / link?
- Chữ trong design đã là **nội dung chốt** chưa, hay còn lorem/chờ duyệt?
- Ngôn ngữ: có bản **tiếng Anh** không?
