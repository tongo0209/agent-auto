# Rule pack: frontend chung — phần chỉ đọc code mới thấy

Script không thấy được những thứ dưới đây. Đây là phần bạn phải tự soi sau khi đọc code.
Mỗi mục kèm **kịch bản hỏng mẫu** — không dựng được kịch bản tương tự thì mục đó không thành issue.

## Trục 1 — Đúng/sai khi chạy thật

| Soi gì | Kịch bản hỏng mẫu |
|---|---|
| List rỗng / API trả `null` | API trả `{items: null}` → `items.length` ném lỗi → cả trang trắng |
| Double-click nút submit | User bấm nhanh 2 lần → gọi API 2 lần → nhận quà 2 lần hoặc lỗi duplicate |
| Trạng thái chờ | Bấm nhận quà, mạng chậm 3s, không có trạng thái loading → user bấm tiếp |
| API lỗi (4xx/5xx) | Không có nhánh `catch` → popup không hiện, user không biết chuyện gì |
| Số/chuỗi lẫn nhau | So `'10' > '9'` ra `false` → sai thứ tự bảng xếp hạng |
| Timezone / mốc thời gian | So thời gian bằng chuỗi local → sự kiện mở sai giờ |
| Điều kiện lồng ngược | Đảo `&&`/`||`, thiếu `else` → nhánh không bao giờ chạy |
| Rò rỉ listener | Popup mở/đóng 5 lần, mỗi lần bind thêm → click 1 lần gọi API 5 lần |
| Đọc DOM trước khi có | Query node của popup lúc popup chưa render → `null` → JS chết |
| Escape dữ liệu server | Tên người chơi chứa `<img onerror>` nối vào `innerHTML` → XSS |

## Trục 2 — Trùng lặp & tái sử dụng

| Soi gì | Kịch bản hỏng mẫu |
|---|---|
| Viết lại cái repo đã có | Có mixin `@include btn-primary` nhưng tự viết lại 20 dòng → đổi màu brand phải sửa 2 chỗ, sót 1 |
| Copy block giữa các trang | 3 landing cùng copy khối popup → sửa nội dung 2 chỗ, chỗ thứ 3 sai |
| Cùng logic 2 dạng | Format tiền viết ở JS và ở template → hiển thị lệch nhau |
| Hằng số rải rác | Cùng URL/domain/key ở 4 file → đổi domain sót 1 file, đúng chỗ đó lỗi |
| Đặt tên lệch convention | Repo dùng `promo__block`, chỗ mới dùng `promoBlock` → grep không ra, người sau code trùng |

## Trục 3 — Dễ bảo trì

| Soi gì | Kịch bản hỏng mẫu |
|---|---|
| Phụ thuộc ngầm vào thứ tự DOM | CSS `:nth-child(3)` để nhắm 1 item → thêm item ở đầu là lệch hết |
| Phụ thuộc ngầm vào thứ tự file | JS chạy trước khi CSS/DOM sẵn, đang hên vì mạng nhanh → deploy CDN chậm là trượt |
| z-index leo thang | Popup mới cần `99999` để nổi lên → popup sau nữa cần bao nhiêu? |
| Số bí ẩn | `top: 137px` không rõ vì sao → người sau đổi header 10px không biết phải bù ở đâu |
| Đè CSS của chính mình | File A đặt, file B đè bằng `!important` → sửa A không có tác dụng, mất buổi debug |
| File quá to | 1 file 1200 dòng lo 5 việc → mỗi lần sửa phải đọc lại cả file, dễ đụng chỗ khác |
| Code chết còn nằm đó | Hàm cũ không ai gọi → người sau sửa nhầm vào đó, tưởng đã fix |

## Trục 4 — Responsive theo quy ước team

PC 1920×1080, mobile 768×1024. H5 chỉ kiểm ngang 1920×1080.

| Soi gì | Kịch bản hỏng mẫu |
|---|---|
| Kích thước cứng không có breakpoint phủ | `width: 1920px` không có `@media (max-width: 768px)` → mobile tràn ngang |
| Chữ dài không có chỗ xuống dòng | Tên người chơi 20 ký tự trong ô cố định → tràn/cắt chữ |
| Ảnh không giới hạn | Không `max-width: 100%` → ảnh đẩy layout ngang trên mobile |
| Chỉ có breakpoint lạ | Chỉ `@media (max-width: 640px)` → khoảng 641-768 không ai phủ, đúng khổ QC test |
| Vùng bấm nhỏ trên mobile | Nút cao 24px → khó bấm, QC báo "bấm không được" |

## Thứ tự đọc khi soi một file

1. Nó nhận dữ liệu từ đâu, đẩy đi đâu (đọc trước phần logic).
2. Có hook platform / template dùng chung không (không được đụng tên).
3. Nhánh lỗi có được xử lý không.
4. Cái gì ở đây đã tồn tại chỗ khác trong repo.
5. Người sau đổi một thứ ở gần (thêm item, đổi header, đổi domain) thì chỗ này có vỡ không.
