# R-CS-* · Code style: clean, ngắn, junior đọc là hiểu

Áp cho MỌI code tôi viết ra ở mọi repo (`.js .ts .jsx .tsx .vue .scss .css .html .twig`).
`MUST` = vi phạm là chặn, không được báo xong. `SHOULD` = nên, lệch thì phải nói rõ lý do.

**Vì sao có file này:** mặc định của model là giải thích nhiều cho an toàn — comment mô tả lại code,
bọc phòng thủ cho ca không xảy ra, tách hàm cho thứ dùng 1 lần. Không có luật kéo lại thì mỗi file
sinh ra dài gấp đôi mức cần, người sau đọc phải nhảy 3 chỗ mới hiểu 1 việc.

| ID | Sev | Luật |
|---|---|---|
| **R-CS-1** | MUST | **Zero comment.** Đúng 2 ngoại lệ được viết comment: (a) **hợp đồng platform** — `pm__…`/`id` đặc biệt/`data-*`, ghi để người sau không đổi tên; (b) **hack/workaround** — quirk trình duyệt, bug thư viện, thứ mà đọc code không đoán ra lý do. Comment mô tả lại việc code đang làm (`// gán sự kiện click`, `// loop qua items`) = vi phạm. |
| **R-CS-2** | MUST | **Không phòng thủ thừa.** Không `try-catch` bọc DOM query, không `if (!el) return`, không `?.` rải khắp — trừ khi element/field **thật sự có thể vắng** theo điều kiện render hoặc theo response API. Viết "cho chắc" làm code dài gấp đôi và giấu mất chỗ hỏng thật. |
| **R-CS-3** | MUST | **Rule of two.** Không tách hàm / biến trung gian / util / file config cho thứ chỉ dùng **1 lần**. Trừu tượng chỉ ra đời khi đã có **≥2 chỗ dùng thật** — không phải "biết đâu sau này cần". |
| **R-CS-4** | MUST | **Grep trước khi viết.** Mixin, class tiện ích, biến SCSS, helper repo đã có → dùng lại. Cấm viết lại thứ đã tồn tại trong repo. |
| **R-CS-5** | MUST | **Tên thay comment.** Magic number → hằng có tên (`const VISIBLE_DAYS = 3`, không phải `const d = 3 // số ngày`). Biến/hàm/class đặt tên tự nói ra việc nó làm. Cần comment để hiểu tên → đổi tên, đừng thêm comment. |
| **R-CS-6** | SHOULD | Không thêm state / tính năng / breakpoint / biến dự phòng ngoài yêu cầu. Không ai đòi loading state, error state, animation thì không tự thêm. |
| **R-CS-7** | MUST | **Cổng nghiệm thu junior.** Trước khi báo xong: người mới (intern/fresher) đọc đoạn vừa viết **một lượt từ trên xuống, không nhảy file**, có hiểu nó làm gì không? Không đạt → **làm phẳng code, đổi tên cho rõ** — KHÔNG được sửa bằng cách thêm comment. |

## Ví dụ ❌/✅

**R-CS-1 — comment**
```js
// ❌ mô tả lại code
// Lấy element nút claim
const btn = document.querySelector('.pm__btn-claim');
// Gán sự kiện click
btn.addEventListener('click', handleClaim);

// ✅ chỉ 2 loại này được tồn tại
// pm__btn-claim: hook JS platform, đổi tên = nút chết
// Safari iOS <16 không fire click trên <label>, phải bind vào input
```

**R-CS-2 — phòng thủ**
```js
// ❌ element luôn có trong markup mình vừa viết
const box = document.querySelector('.popup');
if (!box) return;
try { box.classList.add('active'); } catch (e) {}

// ✅
document.querySelector('.popup').classList.add('active');
```

**R-CS-3 — trừu tượng 1-lần-dùng**
```js
// ❌ phải nhảy 2 chỗ mới biết nó mở popup
const getPopup = () => document.querySelector('.pm__popup-claim');
const openPopup = (el) => el.classList.add('active');
openPopup(getPopup());

// ✅ đọc 1 dòng là xong
document.querySelector('.pm__popup-claim').classList.add('active');
```

**R-CS-5 — tên thay comment**
```scss
// ❌
$d: 3; // số ngày hiển thị
.item:nth-child(-n + 3) { display: block; }

// ✅
$visible-days: 3;
.item:nth-child(-n + #{$visible-days}) { display: block; }
```

## Quan hệ với các luật khác
- Ngoại lệ comment (a) của `R-CS-1` chính là để phục vụ [`pm-contract.md`](pm-contract.md) — `R-PM-1` cấm đổi tên `pm__…`,
  nên một dòng comment đánh dấu hook platform là **được khuyến khích**, không phải vi phạm.
  Trong `cdn-source`, `MJ__*` (hook hành vi lib) và `MS__*` (style lib) **cũng là hợp đồng** — comment đánh dấu
  chúng nằm cùng ngoại lệ (a). Ca kinh điển phải ghi chú: `MJ__toogleActive` sai chính tả nhưng **cấm sửa**.
- **`cdn-source/CLAUDE.md` ghi "Comment giải thích 'tại sao' bằng tiếng Việt"** — đọc dòng đó là
  **ngoại lệ (b) của R-CS-1**, KHÔNG phải giấy phép comment tự do. "Tại sao" hợp lệ = lý do mà đọc code
  không suy ra được (hack trình duyệt, hợp đồng lib, magic number lấy từ design). "Tại sao" kiểu
  `// gán sự kiện click để mở popup` vẫn là vi phạm R-CS-1 vì code đã nói ra rồi.
  Lưu ý `/code-audit` có luật "convention repo THẮNG ý kiến chung" — R-CS-* không phải ý kiến chung,
  nó là luật của user; chỉ nhường khi repo quy định NGƯỢC LẠI một cách rõ ràng, không phải khi repo im lặng.
- `R-CS-3` và `R-CS-6` KHÔNG được viện ra để bỏ bớt phạm vi user yêu cầu. Cắt phần dư ≠ cắt việc.

## Thực thi cơ học
`~/.claude/hooks/guard-style.sh` (PostToolUse trên `Write|Edit`) đếm comment trong **đoạn vừa ghi**,
trừ whitelist (`pm__`, hack, tên trình duyệt, `eslint-disable`, `@ts-`, license), dư quá ngưỡng thì
in thẳng `file:line` các dòng vi phạm để gỡ ngay. Hook chỉ đo được `R-CS-1` — `R-CS-2..7` là trách
nhiệm tự giác + `/clean-code` + `/code-audit`.
Self-test: `bash ~/.claude/hooks/guard-style.test.sh`.
