# Popup — dùng thư viện có sẵn + R-POP-*

Đọc trước khi dựng / sửa **bất kỳ popup nào** trong landing VNGGames.

**Vì sao có file này:** tồn tại **hai** thư viện popup cho hai chặng khác nhau của cùng một trang. Không biết
điều đó thì agent tự viết markup popup từ đầu — mất hook đóng/mở của lib, mất hook hành vi platform, và mỗi
campaign lại một kiểu. Popup là **design system**, không phải chỗ sáng tác.

## Facts (kiểm 2026-08-19, có bằng chứng)

| | Hệ A — dựng trong cdn-source | Hệ B — bàn giao platform |
|---|---|---|
| Ở đâu | `cdn-source/products/<game>/…/assets/libraryMainsite-t-popup/` (copy vào **từng campaign**, đăng ký trong `folderUse`) | `gt-promotion-template/standard-html-templates/ai-template-kit/` |
| Định dạng | Twig + SCSS + JS | HTML thuần (skeleton) |
| Ngôn ngữ hợp đồng | `MS__*` (layout lib) + `MJ__*` (hook JS lib) | `pm__*` / `id` / `data-*` (hook JS platform) |
| Khung | `html/base.html.twig` → `{% extends %}` | `MASTER-<gameplay>.html` → copy khối |
| Nguồn template mới nhất trong repo | `products/libraryMainsite/prod-source/1.3.1/assets/libraryMainsite-t-popup/` (14 module) | `ai-template-kit/gameplays/<gameplay>/MASTER-*.html` (hiện có `luckydraw-gift-exchange`, `payment`) + `components/common/popups/` (login, profile, selectrole, history, inform) |
| Campaign tham chiếu sạch | `products/cfl/landing/2026-hanh-trinh-cua-fox/assets/libraryMainsite-t-popup/` | các request trong `gt-promotion-template/<mã-game>/` |

**Quan hệ hai hệ (user chốt 19/8/2026):** popup **dựng trong cdn-source bằng hệ A**; khi bàn giao thì HTML đã
build mang thêm hook `pm__` của hệ B. Hai hệ class **cùng tồn tại trên một thẻ** — `MS__`/`MJ__` lo layout &
đóng-mở, `pm__` lo hành vi platform. Không phải chọn một bỏ một.

Khung `base.html.twig` (bản 1.3.1, giữ nguyên cấu trúc này):

```twig
<section id="{{ sectionId }}" class="base {{ sectionId }} MS__popup {{ status }}">
	<div class="MS__opacity MJ__close-popup"></div>
	<div class="MS__box box">
		<a href="#" class="btn-close MS__popup-close MJ__close-popup MS__hover"></a>
		<img src="assets/libraryMainsite-t-popup/images/bg.png"/>
		<div class="MS__content content MS__Roboto_Medium">
			{% block content %}{{ data|raw }}{% endblock %}
		</div>
	</div>
</section>
```

Module có sẵn (1.3.1): `popup_login` · `popup_register` · `popup_pre_register` · `popup_condition` ·
`popup_confirm` · `popup_inform` · `popup_reward` · `popup_doithuong` · `popup_history` · `popup_getlist` ·
`popup_bxh` · `popup_input` · `popup_rule` · `popup_builder` · thư mục `condition/`.
(Campaign `cfl/2026-hanh-trinh-cua-fox` có thêm `popup_locked`, `popup_over`, `popup_start`.)

## Luật

| ID | Sev | Luật |
|---|---|---|
| **R-POP-1** | MUST | **Grep module có sẵn trước khi tạo popup mới.** Design đòi popup nào → tìm module tương ứng trong `libraryMainsite-t-popup/html/module/` của campaign, rồi tới bản `prod-source/1.3.1`. Có sẵn thì **dùng lại**, chỉ sửa nội dung `{% block content %}` + SCSS. Tự viết lại popup đã có = vi phạm (R-CS-4 cũng cấm). |
| **R-POP-2** | MUST | **Popup mới phải `{% extends '../base.html.twig' %}`** + `{% set sectionId = 'popup_<tên>' %}`. Cấm dựng `<section class="popup">` tự chế: mất `MS__popup`/`MS__opacity`/`MJ__close-popup` là mất cơ chế đóng-mở của lib, không phải lỗi CSS. |
| **R-POP-3** | MUST | **Giữ nguyên bộ class hợp đồng** trong `base`: `MS__popup`, `MS__opacity`, `MS__box`, `MS__content`, `MS__popup-close`, `MJ__close-popup`, `MS__hover`. Được **thêm** class riêng cạnh chúng; **không** thay thế, không đổi thứ tự lồng nhau. |
| **R-POP-4** | MUST | **Đăng ký đủ 2 chỗ**: `{% include './libraryMainsite-t-popup/libraryMainsite-t-popup.html.twig' %}` trong `assets/index.html.twig`, và `libraryMainsite-t-popup` nằm trong `config.folderUse[]`. Popup mới phải được `include` trong `libraryMainsite-t-popup.html.twig`. Thiếu 1 chỗ → popup không render mà build vẫn xanh. |
| **R-POP-5** | MUST | **Không mang rác campaign cũ.** Khi clone `libraryMainsite-t-popup` từ campaign khác: chỉ `include` popup thật dùng, xoá ảnh reward/nội dung của chiến dịch cũ. Đừng để popup thừa nằm trong bundle rồi bảo "có sẵn thế". |
| **R-POP-6** | MUST | **Trang bàn giao platform: popup phải mang hook `pm__`** theo `ai-template-kit` — bắt đầu từ `MASTER-<gameplay>.html`, giữ nguyên `pm__…`/`id`/`data-*`/`name`/`type`/`for`, thay hết `<any>` bằng tag thật. Chi tiết: [`html-handoff.md`](html-handoff.md), [`pm-contract.md`](pm-contract.md). Bẫy chết người: `pm__btn-claim` (gạch NGANG, Lucky Draw) vs `pm__btn_claim` (gạch DƯỚI, Payment). |
| **R-POP-7** | MUST | **Cổng soát popup trước khi báo xong.** Trang có gameplay promotion → chạy `/check-promotion <loại> <file>` và trình bảng Pass/Fail. Loại promotion suy từ ticket/design/`prodTemplate`; **không chắc thì hỏi user đúng 1 câu** rồi mới chạy (skill `check-promotion` không tự đoán loại — người chốt loại là user). Còn mục Fail = **chưa xong**, không được báo hoàn thành. **Cổng nằm ở phía skill GỌI** (`/code-developer`, `/bug-fixer`, `/ui-check`) — `gt-promotion-template` là repo dùng chung của team, KHÔNG sửa skill `check-promotion` trong đó. Skill độc lập không gọi skill khác (`bug-fixer-lite`) thì đọc thẳng checklist `gt-promotion-template/standard-html-templates/ai-template-check-skill/reference/<loại>.md`. |
| **R-POP-8** | MUST | **Đủ popup theo checklist, không bịa popup ngoài design.** Checklist đòi popup mà design không có → **hỏi PM/user**, ghi vào phần "Cần quyết định"; tuyệt đối không tự sáng tác giao diện popup thiếu. |
| **R-POP-9** | SHOULD | Nội dung popup động (danh sách quà, lịch sử, BXH) đổ bằng engine của lib (`window.libraryMainsite.promotion`, `MJ__*` hook) — xem R-CDN-8. Không tự fetch/render lại bằng JS riêng. |

## Quan hệ với các luật khác
- Cấu trúc campaign, thế hệ code, build: [`cdn-source-standard.md`](cdn-source-standard.md) — R-CDN-*.
- Đưa HTML sang platform: [`html-handoff.md`](html-handoff.md) — R-HO-*.
- Hook `pm__`: [`pm-contract.md`](pm-contract.md) — R-PM-*.
