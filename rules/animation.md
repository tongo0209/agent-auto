# Animation — CSS / Lottie / GSAP + R-ANIM-*

Đọc trước khi **viết mới hoặc fix bug** bất kỳ effect/animation nào trong landing/skin VNGGames.

**Vì sao có file này:** knowledge cũ nói "không dùng gsap" — sai. Đo thật 27/8/2026 trên cdn-source:
**64** project dùng `@lottiefiles/lottie-player` `^1.5.7` · **9** project gsap `^3.13` · **3** project gsap
`^2.1.3` (legacy, syntax `TweenMax`) · 4 project three (ngoài phạm vi file này). Không biết bản đồ đó thì
agent fix bug animation bằng cách đoán, hoặc trộn syntax hai thế hệ GSAP — bug không hết mà nút còn chết thêm.

Tài liệu nguồn khi cần API chi tiết (đọc theo nhu cầu, KHÔNG nạp sẵn):
`~/VNG/vendor/gsap-skills/skills/<gsap-core|gsap-timeline|gsap-scrolltrigger|gsap-performance|gsap-plugins|gsap-utils>/SKILL.md`
· bảng timing/easing đầy đủ: `~/VNG/vendor/motion-design-skill/skills/motion-design/reference/timing-easing-tables.md`.

## R-ANIM-1 MUST · Cây quyết định lib — đi từ nhẹ tới nặng, cấm nhảy cóc

1. **CSS thuần** (`transition`/`@keyframes`) — fade, slide, loop trang trí, hover. Mặc định cho mọi effect đơn giản.
2. **Lottie** (`lottie-player`, chuẩn team) — animation vector do designer xuất JSON. Config bằng attribute
   (`autoplay`, `loop`, `src`), KHÔNG tự viết loader/parser.
3. **GSAP** — chỉ khi cần timeline nhiều bước đồng bộ, scroll-driven, hoặc số/giá trị tween mà CSS không kham.
4. Lib khác (three, anime, pixi…) = dependency mới → dừng, báo user quyết (khớp luật CẤM thêm dependency).

## R-ANIM-2 MUST · Chỉ animate `transform` + `opacity`

- Cấm animate `top/left/width/height/margin/padding` để di chuyển/scale — gây layout thrash, chính là bug
  "effect giật/lag" QC hay báo. GSAP: dùng `x`/`y`/`scale`/`rotation` (mặc định là translate), không `left/top`.
- `will-change: transform` CHỈ đặt trên element thật sự animate — cấm rải "cho chắc".
- Bất khả kháng phải animate layout property (accordion height…) → ghi lý do vào report.

## R-ANIM-3 MUST · Chốt thế hệ GSAP trước khi viết dòng đầu tiên

- Đọc `package.json` của project: gsap `^3.x` → syntax v3 (`gsap.to()`, `gsap.timeline()`, ease dạng `"power3.out"`);
  gsap `^2.1.3` → syntax v2 (`TweenMax`, `TimelineMax`, ease dạng `Power3.easeOut`).
- **Cấm trộn**: không gọi `gsap.*` trong project v2, không bê `TweenMax` vào project v3 (tinh thần R-CDN-1).
- Project chưa có gsap mà task cần → quay lại R-ANIM-1 bước 4 (dependency mới, user quyết).

## R-ANIM-4 MUST · Vòng đời animation

- Tween/ScrollTrigger phải được `kill()` khi section ẩn hoặc đổi viewport PC↔MB — tween mồ côi vừa tốn CPU
  vừa gây bug "animation chạy sai chỗ sau khi resize".
- Nhiều element cùng effect → `stagger`, cấm nhân bản N tween với delay tay.
- Giá trị update dày (mouse-follower…) → `gsap.quickTo()`, cấm tạo tween mới mỗi event.
- `ScrollTrigger.refresh()` chỉ gọi khi layout thật sự đổi (sau load ảnh/content), debounce — không gọi mỗi resize.

## R-ANIM-5 SHOULD · Tôn trọng `prefers-reduced-motion`

Effect trang trí lớn (parallax, ambient loop, particle) nên tắt/giảm trong
`@media (prefers-reduced-motion: reduce)`. Micro-feedback (hover nút) được giữ.

## R-ANIM-6 SHOULD · Timing & easing — theo bảng, không theo cảm giác

- Hướng: **entrance = ease-out** · **exit = ease-in, ngắn hơn entrance (65–75%)** · on-screen = ease-in-out ·
  loop trang trí = sine · rotation/progress = linear.
- Duration theo tầm vóc: nút/icon 120–250ms · card/section enter 200–350ms · modal/popup 300–400ms ·
  reveal hero 600–1200ms. Landing game thiên personality Energetic/Playful → lấy cận DƯỚI các khoảng trên.
- Stagger 50–100ms/phần tử, tổng chuỗi < 500ms.
- Cần số chính xác hơn (spring, overshoot, material) → đọc bảng đầy đủ trong vendor (đường dẫn đầu file).

## R-ANIM-7 · Bảng chẩn đoán bug animation (cho vòng fix bug QC)

| QC báo | Nghi phạm theo thứ tự | Soi ở đâu |
|---|---|---|
| Effect giật / lag | animate layout property (R-ANIM-2) → quá nhiều tween đồng thời → thiếu `will-change` | DevTools Performance; grep `top:\|left:\|width:\|height:` trong tween/transition |
| Animation không chạy | lẫn thế hệ GSAP v2/v3 (R-ANIM-3) → lib chưa nạp (thứ tự script/CDN) → section thiếu `folderUse[]` | console (`gsap is not defined`/`TweenMax is not defined`); `package.json`; `config.js` |
| Lottie trắng / không hiện | path JSON 404 → `lottie-player` script chưa nạp → attribute `src` sai gốc CDN | Network tab; console |
| Chạy sai sau resize/đổi viewport | tween/ScrollTrigger không kill khi re-init (R-ANIM-4) | chỗ init JS của section; handler resize |
| Animation đúng PC sai MB | giá trị tween hardcode theo px PC, thiếu nhánh mobile | biến/config truyền vào tween; `@include mobile` |
| Effect chạy 1 lần rồi thôi | trigger gắn `once`/không reset state; ScrollTrigger thiếu `toggleActions` | config trigger |

Fix bug animation vẫn phải qua đủ luật ở trên (đặc biệt R-ANIM-2, R-ANIM-3) — vá kiểu "tăng duration cho đỡ giật" là chữa triệu chứng, không được báo Done.
