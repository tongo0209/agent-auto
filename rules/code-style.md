# R-CS-* · Code style: clean, ngắn, junior đọc là hiểu

Áp cho MỌI code tôi viết ra ở mọi repo (`.js .ts .jsx .tsx .vue .scss .css .html .twig`).
`MUST` = vi phạm là chặn, không được báo xong. `SHOULD` = nên, lệch thì phải nói rõ lý do.

**Vì sao có file này:** mặc định của model là giải thích nhiều cho an toàn — comment mô tả lại code,
bọc phòng thủ cho ca không xảy ra, tách hàm cho thứ dùng 1 lần. Không có luật kéo lại thì mỗi file
sinh ra dài gấp đôi mức cần, người sau đọc phải nhảy 3 chỗ mới hiểu 1 việc.

| ID | Sev | Luật |
|---|---|---|
| **R-CS-1** | MUST | **Comment tối giản — 1 dòng, đúng 3 loại.** Được viết comment khi và chỉ khi thuộc: (a) **hợp đồng platform** — `pm__…`/`MS__`/`MJ__`/`id` đặc biệt/`data-*`, ghi để người sau không đổi tên; (b) **hack/workaround** — quirk trình duyệt, bug thư viện; (c) **logic bí ẩn** — công thức, thứ tự bắt buộc, ràng buộc với backend/lib mà đọc code không suy ra được. Mỗi lần **tối đa 1 dòng ngắn** (~≤80 ký tự, tiếng Việt). CẤM: mô tả lại code (`// gán sự kiện click`), banner `// =====`, JSDoc nhiều dòng, comment mốc section (`// phần popup`) — file dài thì tách bằng tên hàm/biến, và comment **dài hơn đoạn code nó tả** là vi phạm dù thuộc 3 loại trên. |
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

// ❌ mốc section + banner: tách bằng tên, đừng comment
// ============ POPUP ============

// ✅ 3 loại được tồn tại, mỗi chỗ 1 dòng ngắn
// pm__btn-claim: hook platform, đổi tên = nút chết
// Safari iOS <16 không fire click trên <label>
// Backend trả point theo lượt x10, chia 10 trước khi hiện
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
  **loại (b)+(c) của R-CS-1**, KHÔNG phải giấy phép comment tự do. "Tại sao" hợp lệ = lý do mà đọc code
  không suy ra được (hack trình duyệt, hợp đồng lib, magic number lấy từ design). "Tại sao" kiểu
  `// gán sự kiện click để mở popup` vẫn là vi phạm R-CS-1 vì code đã nói ra rồi.
  Lưu ý `/code-audit` có luật "convention repo THẮNG ý kiến chung" — R-CS-* không phải ý kiến chung,
  nó là luật của user; chỉ nhường khi repo quy định NGƯỢC LẠI một cách rõ ràng, không phải khi repo im lặng.
- `R-CS-3` và `R-CS-6` KHÔNG được viện ra để bỏ bớt phạm vi user yêu cầu. Cắt phần dư ≠ cắt việc.
- Viết code trong `cdn-source` → còn phải theo [`cdn-source-standard.md`](cdn-source-standard.md) (R-CDN-*)
  và [`popup-library.md`](popup-library.md) (R-POP-*). Đưa HTML sang platform → [`html-handoff.md`](html-handoff.md) (R-HO-*).

## Commit (chốt 19/8/2026 — hết đá nhau)
- **Repo đẩy lên git VNG** (`cdn-source`, `gt-promotion-template`, `new-mainsite`, `vportal2view`): theo skill
  `/commit` — Conventional Commits `(<type>): <mô tả>` + footer `Co-Authored-By`. Đây là format CI/CD VNG bắt.
- **Repo nội bộ** (`agent-auto`, `promptAgent`, tool cá nhân): giữ `[<leaf-folder>] <English subject>` + trailer Co-Authored-By.
- `git push`: KHÔNG BAO GIỜ tự làm, hỏi user từng lần. `git commit`: tự làm được ở repo nội bộ và `cdn-source`;
  **KHÔNG commit** ở `gt-promotion-template` / `new-mainsite` (R-GTP-2, R-TWIG-4).

## Thực thi cơ học
`~/.claude/hooks/guard-style.sh` (PostToolUse trên `Write|Edit`) đếm comment trong **đoạn vừa ghi**
(KHÔNG soi cả file), chỉ với file code frontend (`.js .mjs .cjs .ts .jsx .tsx .vue .scss .css .less
.html .htm .twig`) và bỏ qua `node_modules/`, `dist/`, `build/`, `vendor/`, `coverage/`, `*.min.*`,
`webpack.config*`.
Được tha: `pm__`/`MJ__`/`MS__`, `hack`/`workaround`/`polyfill`/`quirk`, `eslint-disable`/`stylelint-disable`/
`prettier-ignore`, `@ts-`, license, jsdoc (`@param`/`@returns`/`@type`…), `psd`; comment nêu
**lý do/hệ quả** (`=>`, "vì", "nếu không", "cẩn thận"…); và khối comment
dài (trung bình ≥8 từ/dòng) — vì mô tả lại code luôn ngắn. Tên trình duyệt chỉ được tha khi dòng có
thêm dấu hiệu vấn đề thật (số phiên bản, `<`/`>`, "lỗi/bug/fix"). Code bị comment out bị gắn
`[code chết]` và **không** được độ dài cứu. Lên tiếng khi dư quá 2 dòng, HOẶC có ≥2 dòng comment mà
chúng chiếm >20% đoạn vừa ghi; in `file:line` từng dòng vi phạm (nhiều nhất 12 dòng). Hook **không chặn ghi**, chỉ báo về cho model gỡ ngay
trong lượt đó. Hook chỉ đo được `R-CS-1` — `R-CS-2..7` là trách nhiệm tự giác + `/clean-code` + `/code-audit`.
Self-test: `bash ~/.claude/hooks/guard-style.test.sh`.

**Hook THOÁNG HƠN luật — im lặng ≠ đạt.** Hook tha jsdoc và khối comment dài (≥8 từ/dòng), trong khi
`R-CS-1` bản 19/8/2026 **cấm** jsdoc nhiều dòng, banner, comment mốc section và comment dài hơn code nó tả.
Tự soát theo luật, đừng chờ hook kêu.
