const { daysBetween } = require('./fsutil');
const { HTML_TODO_PHASES, LATE_EXEMPT_PHASES, KEY_MILESTONE_IDS, MILESTONE_BY_ID, isOffMyPlate } = require('./vocab');

/**
 * Cảnh báo chủ động — server tự soi state, không chờ user mở trang đọc bảng.
 *
 * Ca thật (1/8): GW-660 mốc HTML 3/8 còn 2 ngày, vẫn nằm `coding · chờ duyệt` từ 31/7.
 * KPI có ô "mốc sắp tới" nhưng phải mở trang mới thấy, và không phân biệt được
 * "đang chạy gấp" với "đứng yên mấy ngày" — cái thứ hai mới là dấu hiệu sớm.
 *
 * Vá 3/8 (ca GW-556): 2 khiếm khuyết ở đúng chức năng lõi — cảnh báo mốc.
 *   (a) Gate cũ dùng `htmlTodo` (= HTML_TODO_PHASES: waiting-design/ready/coding) để cho
 *       phép sinh cảnh báo mốc. Nhưng vocab lại CỐ Ý coi `deliver` KHÔNG được miễn trễ mốc
 *       (không có cờ lateExempt) — ticket đang `deliver` mà quá mốc vẫn là trễ theo đúng
 *       nghĩa nghiệp vụ, nhưng gate cũ loại nó ra nên server im, notifyTick() không bắn gì.
 *       Sửa: gate = "phase KHÔNG được miễn trễ" (`!LATE_EXEMPT_PHASES.includes(phase)`),
 *       khớp đúng ý đồ vocab thay vì tự bịa danh sách phase riêng.
 *   (b) Vòng mốc cũ CHỈ đọc `ms.html`. Ticket có kênh promotion dùng mốc `deliver` làm mốc
 *       giao HTML (không có key `html` trong milestones) → GW-556 (`coding`, mốc `deliver`
 *       07/8 còn 4 ngày, mốc GẦN NHẤT trong cả hệ) bị `buildAlerts()` trả `[]` hoàn toàn.
 *       Sửa: duyệt mọi mốc có cờ `key` trong vocab (`KEY_MILESTONE_IDS` — hiện là `html` và
 *       `deliver`), lấy mốc GẦN NHẤT (ưu tiên mốc gấp nhất: quá hạn nhiều nhất hoặc còn ít
 *       ngày nhất) làm mốc cảnh báo, và gọi đúng TÊN mốc đó trong text (MILESTONE_BY_ID) thay
 *       vì hardcode chữ "HTML" — giờ mốc cảnh báo có thể là `deliver` ("Giao HTML") thay `html`.
 *       Giữ nguyên 3 mã `html-overdue`/`html-urgent`/`html-near` (không đổi tên mã) vì
 *       `history/notified.jsonl` dùng `code` làm khoá chống spam 12h — đổi mã sẽ làm mọi
 *       cảnh báo đang "đã nhắc" bật lại coi như mới.
 *
 * Vá 12/8 — LẦN THỨ BA cùng lớp lỗi, và lần này là đổi một quyết định cũ có chủ ý:
 *   (c) Luật cũ cố tình loại `duedate` khỏi vòng mốc ("mốc hành chính"), có test khoá lại. Lý do
 *       gốc vẫn đúng và được giữ nguyên: `duedate` Jira có thể lệch mốc thật viết trong
 *       description (GW-610 — duedate 29/7 nhưng mốc HTML 30/7; description mới là chuẩn).
 *       Nhưng luật cũ đi quá xa: nó cũng im khi `duedate` là mốc DUY NHẤT ticket có. Đo thật
 *       12/8: GW-720 `{duedate: 13/8}` phase `waiting-design` — due NGÀY MAI, "việc gấp nhất
 *       hôm nay" theo board — và GW-525 (due 14/8, `coding`) đều cho `buildAlerts()` trả `[]`.
 *       `server/index.js` bắn notification từ đúng mảng này ⇒ `notified.jsonl` im 2 ngày liền,
 *       đúng 2 ngày chứa mốc gấp nhất. Sửa: mốc key THẮNG khi có; không có mốc key nào thì mới
 *       lấy `duedate`. Mã giữ nguyên, tên mốc trong text tự lấy từ vocab nên hiện "Due Jira".
 *   (d) Thêm mã `debt-dropped`: nợ "Cần bạn" ở board cũ mà hôm nay không ai nhắc lại
 *       (lib/debt.js). Gộp 1 alert/ticket để không spam, và đi chung đường notification sẵn có.
 */

const STALE_DAYS = 2;

const label = (key, text) => ({ key, text });

/**
 * @param state   state.json
 * @param today   'YYYY-MM-DD'
 * @param activity map key → bản ghi từ lib/activity (có thể thiếu; chỉ dùng cho "đứng yên")
 * @param debt     kết quả lib/debt.js::buildDebt (có thể thiếu → không sinh alert nợ)
 */
function buildAlerts(state, today, activity = {}, debt = null) {
  const out = [];

  for (const [key, issue] of Object.entries(state.issues || {})) {
    // Không còn việc của mình thì im — phase THÔI là không đủ (xem vocab::isOffMyPlate):
    // status Jira đã đóng, hoặc đã có người nhận khác, cũng phải im.
    if (isOffMyPlate(issue)) continue;
    const ms = issue.milestones || {};
    const htmlTodo = HTML_TODO_PHASES.includes(issue.phase);
    // Gate cảnh báo mốc: "phase KHÔNG được miễn trễ mốc" — KHÔNG dùng htmlTodo nữa vì
    // htmlTodo loại `deliver` ra, mà vocab lại cố ý coi `deliver` là phase phải chịu trễ mốc.
    const lateExempt = LATE_EXEMPT_PHASES.includes(issue.phase);

    // 1+2. Mốc "giao hàng" (cờ `key` trong vocab — `html` cho ticket thường, `deliver` cho
    // ticket có kênh promotion): lấy mốc GẦN NHẤT (gấp nhất) mà ticket đang mang, không
    // hardcode `ms.html` — ca GW-556 chỉ có `deliver`, không có `html`.
    if (!lateExempt) {
      const keyIds = KEY_MILESTONE_IDS.filter((id) => ms[id]);
      // Không có mốc key nào → `duedate` là mốc DUY NHẤT biết được, dùng nó thay vì im (ca
      // GW-720/GW-525 ngày 12/8). Có mốc key thì duedate không được lấn (ca GW-610).
      const candidates = keyIds.length ? keyIds : ms.duedate ? ['duedate'] : [];
      const nearest = candidates
        .map((id) => ({ id, d: daysBetween(today, ms[id]) }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearest) {
        const d = nearest.d;
        const msLabel = MILESTONE_BY_ID[nearest.id]?.label || nearest.id;
        if (d < 0)
          out.push({ ...label(key, `quá mốc ${msLabel} ${Math.abs(d)} ngày mà phase vẫn "${issue.phase}"`), level: 'crit', code: 'html-overdue' });
        else if (d <= 2)
          out.push({ ...label(key, `mốc ${msLabel} còn ${d} ngày, phase vẫn "${issue.phase}" — chạy ngay`), level: 'crit', code: 'html-urgent' });
        else if (d <= 4)
          out.push({ ...label(key, `mốc ${msLabel} còn ${d} ngày, phase "${issue.phase}"`), level: 'warn', code: 'html-near' });
      }
    }

    // 3. Mốc khác đã qua mà chưa tới đích (design đã qua nhưng vẫn chờ design…)
    for (const [name, date] of Object.entries(ms)) {
      if (name === 'html') continue;
      const d = daysBetween(today, date);
      if (d >= 0) continue;
      if (name === 'design' && issue.phase === 'waiting-design')
        out.push({ ...label(key, `mốc design đã qua ${Math.abs(d)} ngày mà vẫn chờ design — hỏi designer`), level: 'crit', code: 'design-overdue' });
    }

    // 4. Đứng yên: đang code mà không có commit mới
    const act = activity[key];
    if (issue.phase === 'coding' && act && act.linked) {
      if (!act.lastCommit) {
        out.push({ ...label(key, 'đang code nhưng CHƯA có commit nào trong folder đã gắn'), level: 'warn', code: 'no-commit' });
      } else {
        const last = String(act.lastCommit.date).slice(0, 10);
        const idle = daysBetween(last, today);
        if (idle >= STALE_DAYS)
          out.push({ ...label(key, `đứng yên ${idle} ngày (commit cuối ${last}) mà phase vẫn "đang code"`), level: 'warn', code: 'stale' });
      }
    }

    // 5. Design đã giao mà chưa tải về — chặn cả luồng, dễ bị bỏ quên
    if (issue.design?.status === 'đã-giao-chưa-tải' && htmlTodo)
      out.push({ ...label(key, 'design đã giao nhưng chưa tải về local'), level: 'warn', code: 'design-not-downloaded' });
  }

  // 6. Nợ "Cần bạn" ở board cũ mà hôm nay không ai nhắc lại (lib/debt.js).
  // Vòng RIÊNG, không nằm trong vòng state.issues ở trên: nợ vẫn phải được nhắc khi ticket
  // chưa/không còn trong `state.json` — im vì state thiếu là đúng kiểu lỗi đang vá.
  // `key: null` = mục không quy được cho ticket nào → chỉ hiện trong khối UI, không nhắc.
  // `offMyPlate` (từ debt.js) + `isOffMyPlate` (đọc thẳng state) — kiểm 2 lớp vì debt.js chỉ
  // biết `phase`, còn status Jira/`assigneeNow` nằm ở state.
  const debtGroups = (debt?.groups || []).filter(
    (g) => g.key && !g.offMyPlate && !isOffMyPlate((state.issues || {})[g.key])
  );
  // GOM 1 DÒNG cho TOÀN BỘ nợ, thay vì 1 dòng/ticket.
  // Ca thật 13/8: dải cảnh báo có 5 dòng đỏ nợ (GW-477 16 việc/9 board, GW-525 6 việc, …) đè hết
  // mốc deadline thật xuống dưới — đúng thứ mà dải này sinh ra để làm nổi lên. Nợ là việc TỒN,
  // không phải việc GẤP: 1 dòng `warn` là đủ để không quên, chi tiết đã có khối "Nợ đọng" ngay dưới.
  if (debtGroups.length) {
    const itemCount = debtGroups.reduce((s, g) => s + (g.items || []).length, 0);
    const boardCount = new Set(debtGroups.flatMap((g) => (g.items || []).map((i) => i.date))).size;
    const oldest = debtGroups.map((g) => g.oldestDate).sort()[0];
    const stale = Math.max(...debtGroups.map((g) => g.staleDays));
    const keys = debtGroups.map((g) => g.key).join(', ');
    out.push({
      ...label('', `${itemCount} việc "Cần bạn" còn nợ · ${boardCount} board · cũ nhất ${oldest} (${stale} ngày) — ${keys}`),
      level: 'warn',
      code: 'debt-dropped',
    });
  }

  const rank = { crit: 0, warn: 1 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.key.localeCompare(b.key));
}

module.exports = { buildAlerts };
