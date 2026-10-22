# Stage design-compare — {{KEY}} (vòng {{round}})

So bản build `{{campaignDir}}/dist` với ảnh design bằng MẮT, từng dải phủ kín trang. KHÔNG sửa code. Đây là Lớp 2 mà ui-check không làm — số đo xanh không thay được việc nhìn.

1. **Ảnh design tổng**: theo mục Nguồn của `{{runDir}}/design-spec.md`; không có spec thì ảnh tổng trong `~/VNG/agent-auto/designs/{{KEY}}/` (`_src/*.png`, preview của `_auto-export/*`). Cần 1 ảnh PC, 1 ảnh MB nếu design có MB.
2. **Chụp build** (serve `dist` như ui-check, browserpilot `run_script`): mỗi viewport `setViewportSize` → `goto` → gán `data-src`/`data-bg` cho ảnh lazy → cuộn hết trang → về đầu, chờ ≥2 giây → kiểm 0 ảnh vỡ đang hiển thị và JS đã chạy (đồng hồ khác `00:00:00`, list đã đổ) → `screenshot({fullPage:true})`. Ảnh chụp có ảnh vỡ hoặc số chưa chạy thì CHỤP LẠI, không kết luận là lỗi build (GW-905: chụp sớm ra 3 lỗi giả). vào `{{runDir}}/design-compare/r{{round}}/`: `pc.png` (1920×1080, `index.html`), `mb.png` (768×1024), `h5.png` (1920, `index-h5.html` nếu có — so với design PC). Cùng lượt chạy dò style: mọi `a`/`button` có chữ mà `textDecorationLine` ≠ `none`.
3. **Ghép**: `python3 ~/VNG/agent-auto/tools/design-compare.py --design <ảnh design> --shot <ảnh chụp> --out {{runDir}}/design-compare/r{{round}}/crops --width <bề rộng viewport: 1920 hoặc 768> [--layout side cho MB]`. Luôn truyền `--width`: ảnh fullPage có thể rộng hơn viewport (wrapper chưa scale), thiếu nó là design thu sai tỉ lệ, dải nào cũng lệch.
4. **Mở TỪNG ảnh ghép bằng Read** (design trên/trái, build dưới/phải) — không bỏ dải nào, `diff` cao chỉ để nhìn kỹ hơn. Soát mỗi dải:
   - chữ: cỡ, độ đậm, ngắt dòng, màu, gạch chân / viền thừa
   - phần tử thiếu hoặc thừa: thanh cuộn, icon, tag, nút, khung
   - lớp đè: ảnh hay dải trang trí che chữ / tiêu đề
   - vị trí, kích thước lệch thấy rõ
   - dữ liệu demo phi thực tế: đếm ngược quá 99 giờ, mọi món cùng một số, chữ giữ chỗ
   - trạng thái vẽ khác design: làm mờ, dấu tick, màu nút
5. Lệch mà spec/plan ghi rõ là quyết định (trạng thái chưa đăng nhập, câu Q đã chốt, R-ST dựng thêm trạng thái) → advisory kèm chỗ ghi. Còn lại → blocking, mỗi dòng: `<ảnh ghép> · <vùng> · design … / build … · selector nếu biết`.

Verdict: `revise` khi có blocking. Khối `autopilot-verdict` BẮT BUỘC có `"evidence": [đường dẫn tuyệt đối mọi ảnh ghép đã mở]` — `pass` mà thiếu ảnh hoặc ảnh chưa được Read thì engine dừng run.
