# Fan-out song song — LUẬT CHUNG (áp cho analyst / dev / checker)

> Tách từ SKILL.md 2026-08-06. Manager đọc file này TRƯỚC khi định chạy song song bất cứ vai nào.

Sự thật phải nắm: **fan-out KHÔNG giảm token — nó TĂNG token.** Mỗi lane nạp lại knowledge (~29 KB) + sysprompt (~34 KB) ≈ **16k token/lane**, cộng ~6.7s dispatch. Nó chỉ mua **wall-clock**. Việc nhỏ hơn ngưỡng đó thì chạy song song là lỗ thuần.

| Vai | Cap lane | Điều kiện BẬT |
|---|:---:|---|
| `design-analyst` | **3** | ≥3 vùng độc lập (PC / MB / popup, hoặc ≥3 ảnh section rời nhau) |
| `frontend-developer` | **3** | cụm file **không giao nhau**, không cụm nào đụng file dùng chung |
| `design-checker` | **2** | ≥2 vùng verify riêng được — **cap thấp hơn vì browser là 1 process DUY NHẤT** |

**Luật bắt buộc khi fan-out:**

1. **Model tier per-lane** — lane **nặng nhất** giữ model mặc định phiên (opus); **mọi lane còn lại `sonnet`**. Chạy N lane opus song song là chỗ đắt nhất có thể mắc.
2. **Cân lane theo KHỐI LƯỢNG**, không chia đều số lượng: analyst theo số ảnh + độ phức tạp vùng; dev theo số file + độ khó; checker theo số mục cần verify. **Chênh > 2× → gộp lại còn ít lane hơn.** Đo thật: 2 lane lệch 63m40s vs 32m29s ⇒ wall-clock bị lane dài chặn, phần lợi mất sạch.
3. **⚠ Browser contention — checker song song:** manager **BẮT BUỘC** ghi dòng `đang chạy SONG SONG với checker khác` vào prompt MỌI lane. Thiếu dòng này, checker sẽ `session reset` và **giết browser của lane kia** (chung 1 instance) — recovery ≈ 474s. Có dòng này checker mới dùng `session new_tab isolated`.
4. **CẤM fan-out** khi: <3 vùng (checker: <2) · vùng chia sẻ file dùng chung (`libraryMainsite`, `main/`) · tổng việc nhỏ hơn chi phí dispatch.
5. **Flail-stop:** lane nào quá **~10 phút** chưa về → KHÔNG giao thêm vòng cho nó; chốt bằng kết quả các lane đã có + báo user phần thiếu. Không grind, không re-dispatch vô hạn.
6. **1 build chung** sau khi mọi lane dev xong — cấm mỗi lane build riêng.
7. Ghi vào `state.md`: số lane · cách chia · model từng lane. Để lần sau biết cách chia nào hiệu quả.

## Dev split song song — phần riêng của vai dev

Áp LUẬT CHUNG ở trên (cap 3, cân lane, tier per-lane, flail-stop, 1 build chung). Thêm 3 điểm chỉ dev mới có:

1. Mỗi dev nhận phạm vi cụm của mình + chỉ thị **CẤM đụng file ngoài cụm**; ghi Dev Report riêng `<ctx>/reports/<slug>-dev-<n>-<cụm>.md`.
2. Build chung do manager chạy, hoặc giao 1 dev chạy build tổng + **gộp artifact Self-smoke** của mọi cụm vào một khối.
3. Xung đột lộ ra giữa chừng (2 dev cùng đụng 1 file) → DỪNG cụm sau, gộp về 1 dev, báo user 1 dòng.
