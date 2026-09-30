# R-JS-* · JS vùng tự do của landing (cdn-source)

Áp cho JS **riêng của campaign** trong `cdn-source` (thế hệ assets-flat, R-CDN-1): nối engine, hiệu ứng,
popup, tab, thanh tiến độ, mock. Hợp đồng `pm__`/`id`/`data-*` của platform KHÔNG nằm ở đây — đó là
[`pm-contract.md`](pm-contract.md) (R-PM-*). `MUST` = chặn · `SHOULD` = lệch thì nói rõ lý do.

**Vì sao có file này:** quét 26 campaign 2026 của user (23/9/2026) thấy cùng một việc được viết 3-4 kiểu,
có kiểu tốt, có kiểu sinh bug (bấm 2 lần gọi API 2 lần, timeWait lệch animation, handler không bao giờ
chạy). Kiểu tốt thành luật; kiểu chưa tốt ghi ❌ cũ / ✅ chuẩn để khỏi bị chép tiếp khi clone.
Đoạn code dưới là mẫu tự viết, KHÔNG phải code campaign.

**Landing cũ:** đụng tới đâu chuyển tới đó (spec D6, như R-SPR-2); phần thấy mà không chạm → mục
*7. Nợ kỹ thuật* của file dự án (`project-note path <campaign>`). Landing mới: đúng ngay từ đầu.

**Dẫn chứng** viết `<game>/<slug>/<file>:<dòng>` = `products/<game>/landing/<slug>/<file>` trong cdn-source.

## Facts về lib (đọc `libraryMainsite/dev-source/1.1.2/library-test/libraryMainsite-1.3.0.js`, 23/9/2026)

| Việc | Thực tế | Hệ quả |
|---|---|---|
| Engine gộp settings | `$.extend(defaultSettings(), e)` — gộp **nông** | truyền `el` thiếu key là mất cả key mặc định |
| Số lượt | `this.cp = parseInt($(el.cp).html())` — đọc **1 lần** lúc khởi tạo | engine không tự trừ `.spoint` trên màn |
| `informContent` mặc định | `.pm__inform-text` — không giới hạn trong popup | HTML bàn giao có nhiều `.pm__inform-text` ⇒ ghi lỗi vào mọi chỗ |
| `MJ__close-popup`, `MJ__toogleActive`, `MJ__openIframe` | bind thẳng lên phần tử, handler `return false` | click không lan lên `document` |
| Thiết bị | lib gắn `data-device-type` + `data-scale-ratio` lên `body` lúc scale | JS đọc cờ này, không tự đoán |
| Config runtime | `varMS` (`H5`, `scaleWidthPC/MB`) khai trong `main/html/configProduction.html.twig` | điều kiện theo loại trang đọc từ `varMS` |
| Ngôn ngữ | tên quà `names[$("body").attr("class")][indexWord]` và câu hết lượt `notEnoughCp[$("body").attr("class")]` (khoá `en` `vn` `id` `cn` `th`) — tra theo **nguyên chuỗi class của `<body>`**; lib không dùng `<html lang>` để chọn ngôn ngữ | JS đọc ngôn ngữ cùng nguồn đó (R-JS-13); body chỉ mang 1 mã (R-STR-9) |

## API dùng chung từ 1.3.2 (dự án mới — R-CDN-24; `cdn-source` `780e066b7`)
Có sẵn thì DÙNG, không tự viết lại (đo 30/9/2026: mỗi thứ dưới đây đang bị chép tay ở 20–52 campaign).

| Cần | Gọi | Thay cho |
|---|---|---|
| Nối engine promotion | `window.libraryMainsite.promotion` — `url/debug/directory/items/names` tự lấy từ `window.prodTemplate` nếu không truyền; option `offClass` (mặc định `MS__off`), `messages: { notEnoughCp, network, missingType }` | chép `promotion3.js` · chép tay `url: prodTemplate.url, …` |
| Quay ô sáng dần tới ô đích | `libraryMainsite.gridSpin($items, targetIndex, { activeClass='active', loops=2, stepMs=80, finalStepMs=210, holdMs=300, randomSteps=0 })` → Promise ra `targetIndex`; `.duration` gán `timeWait` (R-JS-2). `targetIndex` đếm từ 0 | `LOOP_DELAY` / `animationRandom` / `calculateAnimationTime` |
| Chờ | `await libraryMainsite.wait(ms)` | class `Core.wait` tự viết |
| Chờ vendor sẵn | `await libraryMainsite.ready('swiper'\|'fancybox'\|'lodash')` — vendor chưa bật trong `varMS.bundles` thì reject kèm hướng dẫn | vòng `typeof Swiper === 'undefined'` + `setTimeout` |
| Lớp phủ "xoay ngang máy" (trang KHÔNG H5) | `varMS.rotateOverlay: true` — mặc định tắt; lib tự chèn `.rotate-phone` nếu trang chưa có | `checkRotateScreen` + `.layer-rotate` tự viết |

Lưu ý: không truyền `url` mà `prodTemplate.url` có giá trị ⇒ engine POST tới đó (1.3.1 để `""`). `prodTemplate.textNotEnough` có giá trị thì vẫn thắng `messages.notEnoughCp`.

## Luật

| ID | Sev | Luật (chi tiết + ví dụ ở mục dưới) |
|---|---|---|
| **R-JS-1** | MUST | Nối engine promotion: `el` đủ 6 key, `informContent` khoá trong `#popup_inform`, tự trừ `.spoint` trong `callback` |
| **R-JS-2** | MUST | Animation chọn quà: `timeWait` là biểu thức từ hằng animation; 1 mẫu `wait` + vòng `for`, không chép `class Core` |
| **R-JS-3** | MUST | Phần tử mang `MJ__*`: cấm chờ click lan lên `document` — nghe ở pha capture hoặc bind thẳng |
| **R-JS-4** | MUST | Popup mở/đóng qua `MJ__toogleActive`/`MJ__close-popup`; mở bằng JS = 1 helper trong `main/`; cấm bộ quản lý popup riêng |
| **R-JS-5** | MUST | Phản ứng với thứ BE/lib ghi vào DOM: `render()` + `MutationObserver`, cấm `setInterval` dò |
| **R-JS-6** | MUST | Tính lại scale khi DOM đổi: 1 observer trong `main/` bắn `resize`; cấm `$(window).off('resize')` |
| **R-JS-7** | MUST | Nút gọi API/engine: cờ bận bật ngay lúc bấm, nhả ở cả nhánh lỗi, có hẹn giờ dự phòng tên hằng |
| **R-JS-8** | MUST | Mock chỉ chạy khi hook BE vắng (suy từ chính hook); bản giao không giả lập trạng thái BE |
| **R-JS-9** | MUST | Dữ liệu/hành vi riêng đi qua `data-<mã campaign>-*` + `dataset`; class chỉ để style |
| **R-JS-10** | SHOULD | Thanh tiến độ mốc: ngưỡng nằm trên DOM, 1 hàm nội suy dùng chung PC/MB |
| **R-JS-11** | SHOULD | Mỗi campaign 1 global namespace; helper dùng ≥2 frame đặt ở `main/` |
| **R-JS-12** | SHOULD | Thiết bị/hướng màn: đọc `body[data-device-type]` + `varMS`, không đoán bằng 768/UA |
| **R-JS-13** | SHOULD | Ngôn ngữ đọc từ class của `<body>` — cùng nguồn lib tra tên quà; 1 lần trong `main/`, cấm nguồn thứ 2 (`<html lang>`, `?locale=`) |

### R-JS-1 · MUST · Nối engine promotion
`el` luôn khai đủ `cp, action, reward, inform, informContent, rewardContainer`. `informContent` luôn là
`#popup_inform .pm__inform-text`. Cần hiện lượt còn lại thì trong `callback` gọi `prodTemplate.fnPromotion()`
rồi trừ `.spoint` theo số quà vừa nhận, cập nhật mọi node `.spoint` (PC lẫn MB). `base` dưới = các field
`url/debug/directory/items/names` lấy từ `prodTemplate`.
```js
// ❌ gộp nông: el mất action/reward/inform…, lỗi ghi vào mọi .pm__inform-text, lượt trên màn đứng yên
promotion({ ...base, el: { cp: '.spoint' } });

// ✅
let drawnCount = 0;
window.libraryMainsite.promotion({
  ...base,
  el: {
    cp: '.spoint',
    action: '.pm__rut',
    reward: '#popup_reward',
    inform: '#popup_inform',
    informContent: '#popup_inform .pm__inform-text',
    rewardContainer: '#rewardContainer',
  },
  animResult(listPrize) { drawnCount = listPrize.length; },
  callback() {
    prodTemplate.fnPromotion();
    const $spoint = $('.spoint');
    $spoint.text(Number($spoint.first().text()) - drawnCount);
  },
});
```
Dẫn chứng: `ddtank/2026-chengdu-tournament/assets/Frame2/Frame2.js:92-143` (đủ 6 key, khoá `informContent`, trừ theo `listPrize.length`) · `jx1m/2026-tinh-quang-chi-da/assets/Frame1/Frame1.js:25-42` (đủ key, trừ `.spoint`) · `gpn/2026-he-ruc-ro/assets/Frame4/Frame4.js:81` (khoá `informContent`).

### R-JS-2 · MUST · Animation chọn quà khớp engine
`timeWait` (engine chờ bao lâu mới mở popup) phải là **biểu thức từ hằng animation có tên** — cấm số trần.
Thời lượng phụ thuộc ô trúng thì giữ object `config` và gán lại `config.timeWait` trong `animResult`
(engine giữ tham chiếu `config` nhờ gộp nông). Nháy ô quà dùng 1 mẫu: `wait()` + vòng `for` có số bước là hằng;
không chép `class Core` (mỗi bước `new Core()` làm `clearTimeout` bên trong vô tác dụng), không biến đếm
dùng chung giữa các lượt.
```js
// ❌ 1700 không liên hệ gì với 10 bước × 150ms; instance mới mỗi bước; biến đếm sống qua các lượt
let remaining;
async function roll() { await new Timer().wait(150); remaining--; if (remaining) roll(); }
config: { timeWait: 1700 },

// ✅
const STEP_MS = 150;
const ROLL_STEPS = 10;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function rollTo(targetIndex) {
  for (let step = 0; step < ROLL_STEPS; step++) {
    highlight(step % items.length);
    await wait(STEP_MS);
  }
  highlight(targetIndex);
}
config: { timeWait: ROLL_STEPS * STEP_MS },
```
Dẫn chứng ❌: `nghichthuyhan/2026-affiliate-2/assets/Frame1/Frame1.js:5-15,22,43,54` · `kto/2026-sinh-nhat-thang3/assets/kto-26-sinhnhat3tuoi-vongquay/kto-26-sinhnhat3tuoi-vongquay.js:1-13,72,83`. ✅: `jx1m/2026-tinh-quang-chi-da/assets/Frame1/Frame1.js:37` (`FLY_MS + FLARE_MS`) · `gnmobinew/2026-trung-thu/assets/Frame3/Frame3.js:84-97` (gán lại trong `animResult`) · `tqht/2026-trung-thu-menh-hon/assets/vongquay/vongquay.js:46-51`.

### R-JS-3 · MUST · Phần tử mang `MJ__*` không chờ click lan lên
Handler của lib `return false` (= `preventDefault` + `stopPropagation`) nên `$(document).on('click', sel, …)`
trên nút có `MJ__close-popup`/`MJ__toogleActive`/`MJ__openIframe` — hoặc class platform gắn thêm vào nút —
**không bao giờ chạy**. Nghe ở pha capture (chạy trước lib) hoặc bind thẳng lên nút (cùng phần tử vẫn chạy
đủ). Cần đọc class sau khi lib bật/tắt xong thì chờ 1 `requestAnimationFrame`.
```js
// ❌ nút "Nhận" cũng mang MJ__close-popup ⇒ handler này chết im lặng
$(document).on('click', '[data-xx-claim]', claim);

// ✅
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-xx-claim]')) claim();
}, true);
$('.MJ__toogleActive').on('click', () => requestAnimationFrame(syncTabs));
```
Dẫn chứng: `lan/2026-trung-thu/assets/main/_state.js:609-643` (capture) · `ddtank/2026-chengdu-tournament/assets/Frame2/Frame2.js:16-21` (bind thẳng `MJ__openIframe`) · `gno/2026-request-landing-convert/assets/popup/popup.js:157-180` (rAF). ❌: `gpn/2026-request-landing-convert/assets/popup/popup.js:235` và `gnmobinew/2026-request-landing-convert/assets/popup/popup.js:179` (nhánh gắn ở `document` cho `closest('.MJ__close-popup')` không bao giờ chạy).

### R-JS-4 · MUST · Mở/đóng popup
Mở từ HTML: `MJ__toogleActive[data-target]`; đóng: `MJ__close-popup`. Mở từ JS: **1** helper `openPopup(id)`
ở `main/` (đóng `.MS__popup.active` khác rồi thêm `active`), mọi frame gọi lại nó. Cấm bộ quản lý popup riêng
chạy song song lib (focus, khoá cuộn, `activePopup` tự giữ). Cấm chặn cả file kiểu "thiếu 1 popup là thoát"
— chỉ kiểm popup thật sự có thể vắng theo điều kiện render (R-CS-2).
```js
// ❌
const ruleEl = $('#popup_rule')[0];
const rewardEl = $('#popup_reward')[0];
if (!ruleEl || !rewardEl) return;
function show(popupEl) { current = popupEl; document.body.style.overflow = 'hidden'; /* … */ }

// ✅ main/main.js
function openPopup(id) {
  $('.MS__popup.active').removeClass('active');
  $(id).addClass('active');
}
```
Dẫn chứng ✅: `lan/2026-trung-thu/assets/main/_state.js:647-656`. ❌: `gno/2026-request-landing-convert/assets/popup/popup.js:19,75-110` · `gpn/2026-request-landing-convert/assets/popup/popup.js:17`.

### R-JS-5 · MUST · Phản ứng với thứ BE/lib ghi vào DOM
Dữ liệu BE bơm vào node `pm__` (điểm, km, ngày) → 1 hàm `render()` thuần (đọc DOM → set class/style), gọi lúc
load + `MutationObserver(render)` trên node đó `{ childList, characterData, subtree }`. Chạy code khi popup
mở/đóng (lib không có sự kiện) → theo dõi `attributeFilter: ['class']` trên chính `.MS__popup`, không gắn vào
nút mở (popup mở được từ `MJ__toogleActive`, engine, BE). `render()` ghi ngược vào node đang theo dõi → so với
giá trị cũ trước khi ghi để chặn vòng lặp. Cấm `setInterval` dò.
```js
// ❌
setInterval(() => updateBar(Number($('.pm__point').text())), 500);

// ✅
const pointNode = document.querySelector('.pm__point');
const renderBar = () => updateBar(Number(pointNode.textContent));
renderBar();
new MutationObserver(renderBar).observe(pointNode, { childList: true, characterData: true, subtree: true });

const rewardPopup = document.querySelector('#popup_reward');
new MutationObserver(() => rewardPopup.classList.contains('active') && onRewardOpen())
  .observe(rewardPopup, { attributes: true, attributeFilter: ['class'] });
```
Dẫn chứng: `zsm/2026-dua-co-hoi-h5/assets/zsm-ld-duahoi/zsm-ld-duahoi.js:49-64` · `gnmobinew/2026-trung-thu/assets/Frame2/Frame2.js:2-13` · `omg3q/2026-sinh-nhat-9/assets/Frame2/Frame2.js:228-236` (chặn vòng lặp) · popup: `lan/2026-trung-thu/assets/main/_state.js:455-491`, `omg3q/2026-sinh-nhat-9/assets/Frame4/Frame4.js:38-44`.

### R-JS-6 · MUST · Tính lại scale khi DOM đổi
Lib chỉ tính lại chiều cao `#MS__wrapper` khi có sự kiện `resize`. **Một** hàm trong `main/`: theo dõi
`#MS__wrapper` `{ childList, subtree, characterData }`, gom vào 1 `requestAnimationFrame`, bắn
`window.dispatchEvent(new Event('resize'))`. KHÔNG theo dõi `attributes` trần (lib ghi `style` lên wrapper ⇒
lặp vô hạn); cần bắt đổi class/src thì `attributeFilter` hẹp + so kích thước cũ. Frame đổi tab/màn chỉ đổi DOM,
observer tự bắt — không rải `dispatchEvent` ở từng frame. Cấm `$(window).off('resize')` (gỡ luôn handler của lib).
```js
// ❌ rải ở frame, và xoá handler resize của người khác
setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
$(window).off('resize').on('resize', fixLayout);

// ✅ main/main.js
let rescaleQueued = false;
new MutationObserver(() => {
  if (rescaleQueued) return;
  rescaleQueued = true;
  requestAnimationFrame(() => {
    rescaleQueued = false;
    window.dispatchEvent(new Event('resize'));
  });
}).observe(document.querySelector('#MS__wrapper'), { childList: true, subtree: true, characterData: true });
```
Dẫn chứng ✅: `jxm/2026-vo-lam-tinh-tu/assets/main/main.js:24-59` · `ddtank/2026-chengdu-tournament/assets/main/main.js:18-86` (attributeFilter + chặn lặp + ảnh load). ❌: `cfl/2026-offline-tournament/assets/main/main.js:186-196` = `assets/frame3/frame3.js:159-166` (chép 2 lần) · `kto/2026-sinh-nhat-thang3/assets/kto-26-sinhnhat3tuoi-navigation/kto-26-sinhnhat3tuoi-navigation.js:30-33` · `lan/2026-trung-thu/assets/main/main.js:52-54` (`off('resize')`).

### R-JS-7 · MUST · Khoá thao tác khi gọi API/engine
Mọi nút gọi API hoặc engine: 1 cờ bận **bật ngay lúc bấm**, kiểm ở đầu handler, nhả ở cả nhánh thành công
lẫn lỗi (`finally`, hoặc trong `callback` của engine), kèm hẹn giờ dự phòng đặt tên hằng (engine có thể không
gọi lại). Song song gắn `.off` lên nút để CSS chặn bấm (R-ST-4).
```js
// ❌ cờ chỉ để log, bấm 2 lần là gọi API 2 lần
let isSpinning = false;
$btn.on('click', () => { isSpinning = true; claim(); });

// ✅
const CLAIM_FAILSAFE_MS = 8000;
let claimBusy = false;
function releaseClaim() { claimBusy = false; $btn.removeClass('off'); }
$btn.on('click', async () => {
  if (claimBusy) return;
  claimBusy = true;
  $btn.addClass('off');
  const failsafe = setTimeout(releaseClaim, CLAIM_FAILSAFE_MS);
  try { await claim(); } finally { clearTimeout(failsafe); releaseClaim(); }
});
```
Dẫn chứng ✅: `lan/2026-trung-thu/assets/main/_state.js:331,363-392` · `cfl/2026-rung-ky-bi/assets/frame1/frame1.js:1133-1180` (khoá tới khi animation xong VÀ BE xác nhận) · `jx1m/2026-tinh-quang-chi-da/assets/Frame1/Frame1.js:8,52-58` (hẹn giờ dự phòng). ❌: `ttlm/2026-giang-ho-hoi-tu/assets/Frame1/Frame1.js:46,87-89,98-103`.

### R-JS-8 · MUST · Mock chỉ khi thiếu hook BE
Mock/demo chỉ chạy khi hook BE **thật sự vắng**, suy từ chính hook (`typeof window.startActionClaim`, URL API
trong config có chưa) — cấm cờ boolean gõ tay. Ưu tiên tách `<item>.demo.js` và chỉ nạp theo cờ build
(`DEMO=1`), bản giao chỉ còn JS UI. Mock không ghi trạng thái thật, và bản giao **không tự gắn `.received`/đổi
ảnh "đã nhận"** sau claim — trạng thái đó do BE ghi vào DOM (đọc theo R-JS-5).
```js
// ❌
if (!window.__hasBackend) fakeDraw();
$item.removeClass('active').addClass('received');

// ✅
const hasBackendClaim = typeof window.startActionClaim === 'function';
const claim = hasBackendClaim ? () => window.startActionClaim() : mockClaim;
```
Dẫn chứng ✅: `cfl/2026-offline-tournament/webpack.config.js:15-47` (`DEMO=1` nạp `*.demo.js`) · `lan/2026-trung-thu/assets/main/_state.js:322-326,353-371` · `cfl/2026-hanh-trinh-cua-fox/assets/vxphl-ld-25-a-header/vxphl-ld-25-a-header.js:40,108-116`. ❌: `tlbb/2026-thienlongtambao/assets/Frame1/Frame1.js:72-77` · `gno/2026-request-landing-convert/assets/popup/popup.js:196-237` + `gpn/2026-request-landing-convert/assets/popup/popup.js:183-197` (tự gắn `.received`).

### R-JS-9 · MUST · Dữ liệu/hành vi riêng qua `data-<mã>-*`
Hook hành vi riêng của campaign dùng `data-<mã campaign>-*` (vd `data-tt-tab`), đọc bằng `dataset`. Class chỉ
để style — cấm suy dữ liệu từ class bằng regex/vị trí class. Không bịa `MS__`/`MJ__` (R-CDN-9); không đụng
`data-*` của platform (`data-value`, `data-milestone`, `data-target`…). Nhiều tab/state: 1 object state + 1
`render()` set class, 1 listener trên container gần nhất (trừ phần tử `MJ__*` — R-JS-3).
```js
// ❌
const frame = Number(item.className.match(/tab-(\d+)/)[1]);

// ✅ <button class="menu-item" data-xx-frame="2">
const frame = Number(item.dataset.xxFrame);
$tabs.on('click', '[data-xx-tab]', function () { state.tab = this.dataset.xxTab; render(); });
```
Dẫn chứng ✅: `zsm/2026-dua-co-hoi-h5/assets/zsm-ld-duahoi/zsm-ld-duahoi.js:1-15` · `tqht/2026-trung-thu-menh-hon/assets/feature/feature.js:2-15` · `lan/2026-trung-thu/assets/main/_state.js:414-452,494-560`. ❌: `kto/2026-sinh-nhat-thang3/assets/kto-26-sinhnhat3tuoi-navigation/kto-26-sinhnhat3tuoi-navigation.js:10-11` · `kto/2026-sinh-nhat-thang3/assets/kto-26-sinhnhat3tuoi-vongquay/kto-26-sinhnhat3tuoi-vongquay.js:28-41` · `metalslug/2026-h5-commander/assets/vxphl-ld-25-a-header/vxphl-ld-25-a-header.js:19-45`.

### R-JS-10 · SHOULD · Thanh tiến độ mốc
Ngưỡng nằm trên chính mốc (`data-need`), vị trí mốc do SCSS dựng (R-LAY-8) và JS đo lại từ DOM. JS chỉ có
**1** hàm nội suy từng đoạn, PC/MB dùng chung — không gõ mảng ngưỡng/% trong JS, không 2 hàm chỉ khác mảng.
```js
// ❌ ngưỡng + % gõ tay (trùng với mốc đã vẽ), 2 bản PC/MB
const STOPS_PC = [[0, 0], [100, 20], [300, 45]];
const STOPS_MB = [[0, 0], [100, 25], [300, 50]];

// ✅ <li class="mark" data-need="100">
function fillPercent(value, marks, track) {
  const stops = [{ need: 0, at: 0 }, ...marks.map((mark) => ({
    need: Number(mark.dataset.need), at: (mark.offsetLeft / track.offsetWidth) * 100,
  }))];
  const next = stops.findIndex((stop) => value < stop.need);
  if (next === -1) return 100;
  const prev = stops[next - 1];
  return prev.at + ((value - prev.need) / (stops[next].need - prev.need)) * (stops[next].at - prev.at);
}
```
Dẫn chứng ❌: `omg3q/2026-sinh-nhat-9/assets/Frame2/Frame2.js:140-181` · `cfl/2026-offline-tournament/assets/frame3/frame3.js:18-25`. ✅: `zsm/2026-dua-co-hoi-h5/assets/zsm-ld-duahoi/zsm-ld-duahoi.js:21-35`.

### R-JS-11 · SHOULD · 1 namespace, helper chung ở `main/`
Mỗi campaign tối đa **1** global (mã campaign viết hoa, vd `window.OT`); frame gắn namespace con; biến nội bộ để
trong closure. Helper dùng ≥2 frame (R-CS-3) đặt ở `main/` và gọi qua namespace — `main` chạy trước mọi frame vì
đứng đầu `folderUse` (R-CDN-3). Clone campaign thì xoá biến chết mang theo (vd `let allowScrollTrigger` không ai đọc).
```js
// ❌ mỗi frame thả 1 hàm ra window, 2 frame chép cùng 1 khối
window.updateBar = updateBar;
window.spinTo = spinTo;

// ✅ main/main.js
window.XX = { openPopup, fillPercent };
// frame2/frame2.js
XX.frame2 = { refresh };
XX.openPopup('#popup_rule');
```
Dẫn chứng ✅: `cfl/2026-offline-tournament/assets/main/main.js:265-275` + `assets/frame2/frame2.js:5` · `lan/2026-trung-thu/assets/main/_state.js:2,6`. ❌: `omg3q/2026-sinh-nhat-9/assets/Frame2/Frame2.js:226` · `tlbb/2026-thienlongtambao/assets/Frame1/Frame1.js:68` · `jx1m/2026-tinh-quang-chi-da/assets/main/main.js:27,33` = `metalslug/2026-h5-commander/assets/main/main.js:1-58` (chép nguyên khối).

### R-JS-12 · SHOULD · Thiết bị và hướng màn theo lib/config
Mobile hay PC: `document.body.dataset.deviceType === 'mobile'` (lib gắn lúc scale, đọc sau `load`) — cùng nguồn
với cơ chế scale. Cần ngưỡng px thì 1 hằng lấy theo `maxWidthMB` của `config.js`, không gõ `768` rải rác, không
regex User-Agent, không coi "màn dọc" là mobile. Lớp nhắc xoay màn: 1 hàm trong `main/`, điều kiện suy từ
`varMS` (trang `H5` ⇒ màn dọc thì nhắc xoay; landing thường ⇒ không). Chỉ reload khi đổi hướng nếu lib thật sự
không tự scale lại được — ghi lý do 1 dòng (R-CS-1 b).
```js
// ❌
const isMobile = window.innerWidth <= 768 || /iPhone|Android/i.test(navigator.userAgent);
window.addEventListener('orientationchange', () => location.reload());

// ✅
const isMobile = () => document.body.dataset.deviceType === 'mobile';
const needsRotate = () => varMS.H5 && matchMedia('(orientation: portrait)').matches;
```
Dẫn chứng ❌: `omg3q/2026-sinh-nhat-9/assets/main/main.js:31` · `tqht/2026-trung-thu-menh-hon/assets/vongquay/vongquay.js:26` · `pwm/2026-v34-ani/assets/main/main.js:1-15` (UA) · `ghoststory/2026-2nd-anniverary/assets/frame1/frame1.js:9` (dọc = mobile) · `jxm/2026-vo-lam-tinh-tu/assets/main/main.js:7-22` ngược logic với `pwm/2026-v34-ani/assets/main/main.js:41-58` · `jx1m/2026-tinh-quang-chi-da/assets/main/main.js:60-62` (reload mọi lần xoay). ✅ nguồn cờ: `zsm/2026-dua-co-hoi-h5/assets/zsm-ld-duahoi/zsm-ld-duahoi.js:91`, `taydu2/2026-tam-gioi-ky-ngo/assets/main/main.js:3` (đọc `data-scale-ratio` của `body`).

### R-JS-13 · SHOULD · Ngôn ngữ đọc từ class `<body>` — cùng nguồn với lib
Lib tra tên quà và câu báo theo nguyên chuỗi class của `<body>` (Facts). JS của campaign đọc **đúng nguồn đó**:
`document.body.className` **1 lần** trong `main/`, mọi frame dùng lại. Body chỉ mang 1 mã locate (R-STR-9) nên
không cần tách chuỗi. Cấm nguồn thứ 2: `<html lang>` (đo 23/9 trên twig 2026: 270/352 thẻ `<html>` để `lang="en"`
bất kể trang nào; mã `vi` còn khác khoá `vn` của lib), class của `<html>`, `?locale=`. Hai nguồn lệch nhau là UI một
thứ tiếng, tên quà của lib một thứ tiếng. `<html lang>` vẫn đặt đúng cho SEO/trình đọc màn hình, chỉ là JS không đọc.
Campaign cũ đang đọc `<html lang>` → chuyển khi chạm, chưa chạm thì ghi mục 7 Nợ; ngôn ngữ do BE chuyển bằng query
thì ghi nguồn đó vào mục 5 file dự án.
```js
// ❌
const lang = document.documentElement.lang;           // "en" ở cả trang th
const lang = document.documentElement.classList[0];
const lang = params.get('locale');

// ✅ main/main.js — cùng khoá lib: vn | en | th | id | cn
XX.lang = document.body.className;
```
Dẫn chứng ✅ nguồn: lib `libraryMainsite/prod-source/1.3.0/dist/libraryMainsite-1.3.0.js` (`notEnoughCp[i("body").attr("class")]`) · body đúng mã: `jxm/2026-vo-lam-tinh-tu-bh/assets/index.html.twig:10`, `lan/2026-trung-thu/assets/index-th.html.twig:61`. ❌: `dream/2026-landing-tet/assets/index-th.html.twig:2` (`lang="en" class="th"`) + `vxphl-ld-25-a-milestone/vxphl-ld-25-a-milestone.js:40-50` (dò class `<html>`) · `lan/2026-trung-thu/assets/main/_state.js:10-17` (đọc `<html lang>`, phải tự quy `vi`/`vn`) · `ghoststory/2026-2nd-anniverary/assets/frame2/frame2.js:5` (`?locale=`) · `ghoststory/2026-bingo-h5/assets/Frame1/Frame1.js:51` (phải tách chuỗi vì body mang thêm `h5frame`). `vi` ≠ `vn`: `jx1m/2026-tinh-quang-chi-da/assets/index.html.twig:2,20` (`lang="vi"`, body `vn` — markup đúng cả hai, JS nào đọc `lang` ở đây là trượt khoá lib).

## Luật cũ vẫn bị vi phạm lặp lại (không đẻ luật mới)
- **R-CDN-8** — chép engine riêng (`main/promotion3.js`, `class MJPromotion`, `import md5`) hoặc tự viết vòng quay:
  `taydu2/2026-tam-gioi-ky-ngo/assets/vxphl-ld-25-a-header/vxphl-ld-25-a-header.js:1,7` · `metalslug/2026-h5-commander/assets/main/promotion3.js`
  · `tlbb/2026-thienlongtambao/assets/Frame1/Frame1.js:27-65`.
- **R-CDN-7 + R-CS-2** — chờ `window.$` bằng `setInterval`, `var $ = window.$ || window.jQuery; if (!$) return`,
  `typeof prodTemplate === 'undefined'`: `cfl/2026-offline-tournament/assets/main/main.js:280-294` (lib nạp đồng bộ ở
  `assets/index.html.twig:57-58`) · `ddtank/2026-chengdu-tournament/assets/Frame2/Frame2.js:55-57`. Biến BE bơm vào
  (`prodTemplate`, `sPoint`, `pointLevel`…) khai mặc định trong `configProduction.html.twig` rồi JS dùng thẳng.
- **R-CS-3** — khối giống nhau chép giữa các frame/campaign: xem R-JS-6, R-JS-11.

## Quan hệ với các luật khác
- Hook platform: [`pm-contract.md`](pm-contract.md) — R-PM-*. Thế hệ build, engine, prefix: [`cdn-source-standard.md`](cdn-source-standard.md) — R-CDN-*.
- Cấu trúc section/trang, `<body class>`, đặt tên khi clone: [`landing-structure.md`](landing-structure.md) — R-STR-*.
- Popup markup: [`popup-library.md`](popup-library.md) — R-POP-*. Trạng thái ô quà: [`promo-states.md`](promo-states.md) — R-ST-*.
- Timing/easing hiệu ứng: [`animation.md`](animation.md) — R-ANIM-*. Cách viết code: [`code-style.md`](code-style.md) — R-CS-*.
- Dọn code theo file này: `/clean-code` (nhóm 5).
