# Design DNA — bóc style từ ảnh/site tham chiếu (khi KHÔNG có design PSD)

Dùng khi PM/user đưa **reference** ("làm giống site/ảnh này") thay vì file design. Chưng cất từ
`~/VNG/vendor/design-dna/` (zanwei/design-dna) — schema đầy đủ ở `vendor/design-dna/references/schema.md`,
chỉ đọc khi cần field hiếm.

## Phân vai (khác bản gốc — bản gốc cho 1 agent làm hết)

- **Manager**: nếu reference là URL → chụp ảnh trang qua browser MCP (PC 1920 + mobile 768, đủ các section)
  rồi giao ảnh cho analyst. Analyst KHÔNG có web access.
- **design-analyst (bạn)**: bóc DNA từ ảnh → ghi vào spec (Phase 2 dưới đây).
- **frontend-developer**: áp DNA khi code (Phase 3) — DNA là nguồn token/định hướng, mọi luật R-CDN/R-POP/R-ANIM
  vẫn THẮNG (không sinh HTML standalone trong cdn-source, không thêm lib ngoài R-ANIM-1).

## Phase 2 — Bóc DNA từ ảnh tham chiếu (việc của analyst)

Với mỗi ảnh reference đã Read, bóc theo 3 chiều:

1. **design_system** (đo được): palette (primary theo diện tích, accent theo CTA, thang neutral từ nền nhạt nhất
   tới chữ đậm nhất), typography (họ font theo đặc điểm hình học, tỉ lệ heading/body), spacing (mật độ, nhịp
   section), layout (grid, max-width, đối xứng), shape (radius so với chiều cao element), elevation (shadow).
2. **design_style** (cảm nhận): mood/personality, mức trang trí, triết lý whitespace, archetype (game-fantasy,
   editorial, brutalist…).
3. **visual_effects** (thấy nhưng CSS thuần không tả hết): particle, parallax, glow, gradient động, 3D, cursor
   effect… Ghi mô tả + độ nặng; effect không có trong reference → bỏ, không bịa.

Quy tắc chung khi bóc: giá trị ước lượng đánh dấu `(~)` như mọi spec; nhiều reference mâu thuẫn → lấy pattern
trội, ghi chú variant; KHÔNG để field trống — không nhìn ra thì ghi "(không thể hiện trong ảnh)".

## Output — nằm TRONG spec, không tách file

Giữ hợp đồng "analyst chỉ Write spec `.md`": DNA đặt trong spec ngay sau mục 3 (Design tokens) dưới dạng khối:

```markdown
### 3b. Design DNA (từ reference)
> Nguồn: <đường dẫn ảnh reference>
\```json
{ "design_system": {…}, "design_style": {…}, "visual_effects": {…} }
\```
```

Effect trong `visual_effects` cần animation → đồng thời điền bảng **Motion** ở mục 5 của spec (theo R-ANIM-6).

## Phase 3 — Áp DNA khi code (việc của dev, ghi đây để analyst biết giới hạn)

- Token trong `design_system` → biến SCSS/token của project, KHÔNG hardcode rải rác.
- `visual_effects` chọn công nghệ theo R-ANIM-1 (CSS → Lottie → GSAP); effect đòi lib mới (three, shader…) →
  dependency mới, user quyết.
- Asset lấy từ nguồn thật nếu user cấp URL/file — không vẽ lại xấp xỉ.
