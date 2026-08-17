import $ from 'jquery';
import { api } from '@core/api';
import {
  PHASE,
  ACTIVE_PHASES,
  OFF_MY_PLATE_PHASES,
  GONE_PHASES,
  DONE_PHASES,
  MILESTONE_LABEL,
  DESIGN_STATUS,
  designDeliveredNotLocal,
} from '@core/constants.mjs';
import { icon } from '@core/icons';
import { escapeHtml, inlineMd, shortDate, severityByDays, nextMilestone, isLate, daysUntil } from '@core/format.mjs';
import { groupTasks } from '@core/grouping.mjs';
import { keepOnTimeline } from '@core/marks.mjs';
import { showText } from '@components/modal';
import { openTicket } from '@panels/ticketPanel';
import { ganttTimeline } from '@components/gantt';
import { effortCell, activityDetail } from '@components/activityLine';

const JIRA_FALLBACK = 'https://vnggames.atlassian.net';
const ACTIVITY_REFRESH_MS = 30000;
const ALERT_REFRESH_MS = 60000;
/** Mốc "đã xem" của dòng delta — lưu localStorage (sống qua reload), lần đầu mặc định 12h trước */
const SEEN_KEY = 'daily-console:lastSeenAt';
const DELTA_LABEL = { status: 'status Jira', phase: 'phase', milestone: 'mốc', duedate: 'duedate' };
/** Log board thiếu giờ thật: skill phải lấy `date +%H:%M`, không được ghi placeholder */
const NO_TIME_RE = /^HH:MM\b/;
let lastNeedSignature = null;
let lastCritSignature = null;
let filterText = '';
/**
 * Nhóm đóng sẵn user đã bấm mở: label → true nghĩa là NGƯỜI DÙNG đã mở nó ra.
 * Giữ ngoài render vì bảng vẽ lại mỗi 3s (poll state) — không nhớ thì nhóm tự đóng
 * lại giữa lúc đang đọc (đã dính: bấm mở, 3 giây sau tự thu lại).
 */
const expandedGroups = {};
let ctx = { terminals: null, config: {}, paths: {}, assets: {}, boardDate: null, needRaw: [] };
let activityMap = {}; // key → bản ghi hoạt động git (nạp riêng, chậm hơn poll state)
let gateMap = {}; // key → kết quả fe-gate lần cuối
let pushMap = {}; // key → { dirty, unpushed } từ /api/review
let forecastMap = {}; // key → { date, samples } | null — dự báo ngày xong phase hiện tại, từ /api/learn
let alerts = [];
/** Lỗi hợp đồng state.json từ /api/doctor — giữ RIÊNG khỏi `alerts`, xem loadDoctor() */
let doctorItems = [];
let onNotify = () => {};
/** Số nút nhiều nhất trên 1 hàng của lượt render đang chạy → suy bề rộng cột Actions */
let lastActionCount = 0;
let showDoneNeed = false;
/**
 * Mục "Cần bạn" đang mở rộng — phải giữ NGOÀI DOM: poll 3s render lại `#need` nên class trên
 * `<li>` bị xoá sau đúng 1 nhịp (đã dính: bấm mở, 3 giây sau tự thu lại).
 * Khoá theo NỘI DUNG chứ không theo index — board có thể chèn/xoá dòng giữa 2 nhịp poll.
 */
const openNeed = new Set();
/**
 * Cùng lý do với `openNeed`, cho khối nợ đọng: `loadDebt()` chạy theo interval và ghi đè trọn
 * `#debt`, nên class `open` đặt trực tiếp trên `<li>` sẽ bị xoá sau đúng 1 nhịp. Khoá = `date#index`
 * của mục trên board GỐC (bền hơn nội dung: cùng một việc có thể được ghi lại khác chữ mỗi ngày).
 */
const openDebt = new Set();

export function initTodayPanel({ terminals, notify }) {
  ctx.terminals = terminals;
  onNotify = notify || (() => {});

  $('#task-filter').on('input', function () {
    filterText = String($(this).val() || '').toLowerCase();
    $('#filter-clear').toggle(Boolean(filterText));
    rerenderTasks();
  });
  $('#filter-clear').on('click', () => {
    filterText = '';
    $('#task-filter').val('');
    $('#filter-clear').hide();
    rerenderTasks();
  });

  // Hành động trong bảng — bind 1 lần, không bind lại mỗi lần render
  $('#tasks')
    .on('click', '[data-fold]', function () {
      const label = String($(this).data('fold'));
      expandedGroups[label] = !expandedGroups[label];
      rerenderTasks();
    })
    // Bấm tên task = mở drawer chi tiết (brief giờ là 1 mục BÊN TRONG drawer, không phải
    // modal riêng — trước đây phải mở 4 chỗ để biết đủ về 1 ticket)
    .on('click', '[data-brief]', function () {
      openTicket(String($(this).data('brief')), ctx.paths);
    })
    .on('click', '[data-prep]', function () {
      ctx.terminals.type('/daily prep ' + $(this).data('prep'));
    })
    .on('click', '[data-open-task]', function () {
      openPath('finder', ctx.paths.tasks, String($(this).data('open-task')));
    })
    .on('click', '[data-open-design]', function () {
      openPath('finder', ctx.paths.designs, String($(this).data('open-design')));
    })
    .on('click', '[data-open-questions]', function () {
      openPath('vscode', ctx.paths.tasks, String($(this).data('open-questions')) + '/questions-for-pm.md');
    })
    .on('click', '[data-open-promo]', function () {
      openPath('vscode', (ctx.config.repos || {})['gt-promotion-template'], String($(this).data('open-promo')));
    })
    .on('click', '[data-bugsheet]', function () {
      ctx.terminals.type('/bug-fixer-lite ' + $(this).data('bugsheet'));
    })
    .on('click', '[data-act-key]', function () {
      const key = $(this).data('act-key');
      showText('Hoạt động git — ' + key, async () => activityDetail(await api.activityFor(key)));
    })
    .on('click', '[data-link-key]', function (e) {
      e.stopPropagation();
      ctx.terminals.type('/daily link ' + $(this).data('link-key'));
    })
    // Ô Gate/Push chỉ là tóm tắt — chi tiết (file, diff, commit) nằm ở tab Review
    .on('click', '[data-goto-review]', function () {
      $('.tab[data-tab="review"]').trigger('click');
    });

  // Dòng dài: bấm vào chữ để mở hết / thu lại (không mở modal cho một dòng việc)
  $('#need').on('click', '[data-need-text]', function () {
    const $li = $(this).closest('li');
    const key = String($li.data('need-key') || '');
    if (openNeed.has(key)) openNeed.delete(key);
    else openNeed.add(key);
    $li.toggleClass('open', openNeed.has(key));
  });
  $('#need-toggle').on('click', () => {
    showDoneNeed = !showDoneNeed;
    renderNeed(ctx.needRaw);
  });

  // Dòng dài trong khối nợ đọng: cùng cách mở/thu như "Cần bạn", và cũng phải giữ NGOÀI DOM
  $('#debt').on('click', '[data-need-text]', function () {
    const $li = $(this).closest('li');
    const key = String($li.data('debt-open-key') || '');
    if (openDebt.has(key)) openDebt.delete(key);
    else openDebt.add(key);
    $li.toggleClass('open', openDebt.has(key));
  });

  /**
   * Tick một mục nợ đọng — ghi vào board GỐC (board 10/8, không phải board hôm nay), vì đó là
   * chỗ mục đó đang sống; ghi nơi khác thì lần quét sau vẫn thấy nó `- [ ]` và hỏi lại mãi.
   * Dùng ĐÚNG /api/board/check sẵn có (route đã nhận `date` + đã chặn path ngoài boards/).
   */
  $('#debt').on('click', '[data-debt-date]', async function () {
    const $btn = $(this);
    const date = String($btn.data('debt-date'));
    const index = Number($btn.data('debt-index'));
    const expectText = String($btn.data('debt-text'));
    $btn.prop('disabled', true);
    try {
      await api.boardCheck({ date, index, done: true, expectText });
      $btn.attr('aria-checked', 'true').html(icon('box-on'));
      $btn.closest('li').addClass('done');
      await loadDebt(); // đếm lại + rụng khỏi danh sách
      loadAlerts(); // alert `debt-dropped` phải tắt theo, đừng để nó nhắc việc vừa đóng
    } catch (err) {
      const msg = err.responseJSON?.error || 'không ghi được board ' + date;
      window.alert(msg + (err.status === 409 ? '\n\nBoard vừa bị sửa — khối nợ đọng sẽ tự nạp lại.' : ''));
      loadDebt();
    } finally {
      $btn.prop('disabled', false);
    }
  });

  // Ghi nhanh vào board — thay cho việc mở file .md sửa tay.
  // Log: KHÔNG gõ giờ, server tự lấy `HH:MM` (chặn tận gốc lỗi ghi literal HH:MM).
  $('#need-add').on('submit', (e) => {
    e.preventDefault();
    appendBoard('Cần bạn', $('#need-input'));
  });
  $('#log-add').on('submit', (e) => {
    e.preventDefault();
    appendBoard('Log', $('#log-input'));
  });

  // Tick "Cần bạn" — chỗ DUY NHẤT console ghi vào board
  $('#need').on('click', '[data-need-index]', async function () {
    const $btn = $(this);
    const index = Number($btn.data('need-index'));
    const done = $btn.attr('aria-checked') !== 'true';
    $btn.prop('disabled', true);
    try {
      await api.boardCheck({ date: ctx.boardDate, index, done, expectText: ctx.needRaw[index] });
      $btn.attr('aria-checked', String(done));
      $btn.closest('li').toggleClass('done', done);
      $btn.html(icon(done ? 'box-on' : 'box-off'));
    } catch (err) {
      const msg = err.responseJSON?.error || 'không ghi được board';
      window.alert(
        msg + (err.status === 409 ? '\n\nBoard vừa bị sửa (agent hoặc editor) — trang sẽ tự nạp lại sau 3s.' : '')
      );
    } finally {
      $btn.prop('disabled', false);
    }
  });

  // Dòng "có gì mới": bấm mở/thu danh sách; bấm "đánh dấu đã xem" mới ghi lại mốc localStorage.
  // Bind 1 lần ở đây (không bind lại mỗi lần loadDelta() vẽ lại #delta-bar).
  $('#delta-bar')
    .on('click', '[data-delta-open]', () => $('.deltalist').attr('hidden', (i, v) => (v ? null : 'hidden')))
    .on('click', '[data-delta-seen]', () => {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
      loadDelta();
    });

  // Công tắc radar nền: ghi config.radar.enabled qua server (không đụng launchctl từ web).
  // Bind 1 lần, không bind lại mỗi lần loadRadar() vẽ lại #radar-bar.
  $('#radar-bar').on('click', '[data-radar-toggle]', async function () {
    const on = Boolean(Number($(this).data('radar-toggle')));
    $(this).prop('disabled', true);
    try {
      await api.radarToggle(on);
    } finally {
      loadRadar();
    }
  });

  loadActivity();
  setInterval(loadActivity, ACTIVITY_REFRESH_MS);
  loadAlerts();
  loadDoctor();
  loadDelta();
  loadRadar();
  loadDebt();
  setInterval(loadAlerts, ALERT_REFRESH_MS);
  setInterval(loadDoctor, ALERT_REFRESH_MS);
  setInterval(loadDelta, ALERT_REFRESH_MS);
  setInterval(loadRadar, ALERT_REFRESH_MS);
  setInterval(loadDebt, ALERT_REFRESH_MS);
}

/**
 * Dữ liệu phụ của bảng task: git activity + gate + trạng thái push.
 * Nạp riêng khỏi poll 3s vì `git log`/`git status` per-path nặng hơn đọc state (server có cache).
 */
async function loadActivity() {
  const [act, gates, review, learn] = await Promise.allSettled([
    api.activity(),
    api.gates(),
    api.review(),
    api.learn(),
  ]);
  if (act.status === 'fulfilled') activityMap = Object.fromEntries(act.value.items.map((i) => [i.key, i]));
  if (gates.status === 'fulfilled') gateMap = Object.fromEntries(gates.value.items.map((g) => [g.key, g]));
  if (review.status === 'fulfilled')
    pushMap = Object.fromEntries(review.value.items.map((i) => [i.key, { dirty: i.dirty, unpushed: i.unpushed }]));
  // /api/learn tự lọc null (chưa đủ mẫu) — giữ nguyên object, taskRow tự bỏ qua khi rỗng
  if (learn.status === 'fulfilled') forecastMap = learn.value.forecasts || {};
  rerenderTasks();
}

/** Nợ đọng xuyên ngày — nguồn riêng (/api/debt), không trộn vào /api/state */
async function loadDebt() {
  try {
    renderDebt(await api.debt());
  } catch {
    /* server tắt hoặc board đang được ghi — giữ khối cũ, lần sau tự khôi phục */
  }
}

/** Cảnh báo chủ động — server tự soi mốc/đứng yên, không chờ user đọc bảng */
async function loadAlerts() {
  try {
    ({ items: alerts } = await api.alerts());
  } catch {
    return;
  }
  renderAlerts();
}

/**
 * Lỗi hợp đồng state.json (Task 5) — loại cảnh báo NGHIÊM TRỌNG NHẤT: state.json do skill LLM
 * ghi, sai hợp đồng thì mọi con số khác trên trang (KPI, timeline, bảng task...) đều có thể
 * sai theo mà không ai biết. Vì vậy khi vẽ dải cảnh báo, các mục doctor phải đứng TRƯỚC `alerts`.
 */
async function loadDoctor() {
  try {
    const r = await api.doctor();
    const map = (list, level) =>
      (list || []).map((f) => ({
        key: f.key,
        text: `state.json sai hợp đồng (${f.code}): ${f.text}`,
        level,
        code: 'doctor-' + f.code,
      }));
    // ERROR = hợp đồng vỡ thật → mỗi lỗi 1 dòng `crit`, không gom (phải biết vỡ ở đâu).
    // WARN thì GOM 1 DÒNG: vẫn phải lên dải (4 WARN thật ngày 3/8 — thiếu file bàn giao · mốc
    // còn tranh chấp · path trỏ folder đã xoá — đều là việc đang treo), nhưng ngày 13/8 nó
    // chiếm 4/9 dòng của dải và đẩy mốc deadline thật xuống dưới. Chi tiết xem `/daily doctor`.
    // Mức `warn` KHÔNG bắn notification macOS (onNotify chỉ lấy `crit`).
    const warns = r.warns || [];
    const gomWarn = warns.length
      ? [
          {
            key: '',
            text:
              `state.json: ${warns.length} cảnh báo hợp đồng (${[...new Set(warns.map((w) => w.code))].join(', ')}` +
              `${warns.length > 1 ? ` · ${[...new Set(warns.map((w) => w.key).filter(Boolean))].join(', ')}` : ''}) — chạy /daily doctor`,
            level: 'warn',
            code: 'doctor-warns',
          },
        ]
      : [];
    doctorItems = [...map(r.errors, 'crit'), ...gomWarn];
  } catch {
    doctorItems = [];
  }
  renderAlerts();
}

/**
 * "Có gì mới từ lần bạn xem" (Task 8) — đọc history/issues.jsonl + phases.jsonl qua
 * /api/delta, so với mốc `since` lưu trong localStorage (12h trước nếu chưa từng xem).
 *
 * Khối RIÊNG `#delta-bar`, KHÔNG trộn vào `renderAlerts()`/dải `#alerts`: đây là TIN TỨC
 * ("có gì đổi"), không phải BÁO ĐỘNG ("cần làm gì") — trộn chung sẽ làm loãng ưu tiên của
 * dải cảnh báo (đã chốt ở renderAlerts, không đụng vào).
 *
 * try/catch RIÊNG, lỗi thì im lặng bỏ qua — không được lây sang loadAlerts()/loadDoctor()
 * đang chạy cùng nhịp 60s (3 hàm độc lập, 1 hàm hỏng không được kéo hàm khác chết theo).
 */
async function loadDelta() {
  const since = localStorage.getItem(SEEN_KEY) || new Date(Date.now() - 12 * 3600e3).toISOString();
  // Không cần khởi tạo `[]`: nhánh catch return ngay, nên tới dòng dùng `items` bên dưới
  // chắc chắn đã được gán trong try.
  let items;
  try {
    ({ items } = await api.delta(since));
  } catch {
    return; // im lặng bỏ qua — không được đụng #alerts hay ném lỗi ra ngoài
  }
  const n = items.reduce((s, i) => s + i.changes.length, 0);
  if (!n) return void $('#delta-bar').empty();
  // Giờ ĐỊA PHƯƠNG, không phải cắt chuỗi ISO: `since` là ISO UTC, `slice(11,16)` in ra giờ UTC
  // nên ở +07:00 nó lệch 7 tiếng — đã thấy thật trên màn hình ("từ 19:21" trong khi máy 14:21,
  // đọc thành 7 giờ tối). Mốc "đã xem" sai giờ thì cả dòng delta mất nghĩa.
  const time = new Date(since).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const detail = items
    .map(
      (i) =>
        `${escapeHtml(i.key)}: ${i.changes
          // `milestone` có thêm `name` (mốc nào đổi) — không in tên mốc thì 3 mốc đổi trông y hệt nhau
          .map(
            (c) =>
              `${DELTA_LABEL[c.type] || c.type}${c.name ? ' ' + escapeHtml(c.name) : ''} ` +
              `${escapeHtml(c.from ?? '—')} → ${escapeHtml(c.to ?? '—')}`
          )
          .join(' · ')}`
    )
    .join('<br>');
  $('#delta-bar').html(
    `<div class="deltabar" data-delta-open>${icon('radar')}<span><b>${n} thay đổi</b> từ ${escapeHtml(time)} · xem</span></div>
     <div class="deltalist" hidden>${detail}
       <button type="button" class="btn ghost small" data-delta-seen>đánh dấu đã xem</button></div>`
  );
}

const hhmm = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

const RADAR_TEXT = {
  off: () => 'Radar nền · tắt',
  'off-hours': () => 'Radar nền · ngoài giờ (08–18, T2–T6)',
  ok: (s) => `Radar ${hhmm(s.last?.at)} · OK · ${s.last?.changed ? 'có thay đổi' : '0 thay đổi'}`,
  dead: (s) => `Radar KHÔNG chạy${s.last ? ' từ ' + hhmm(s.last.at) : ''}`,
};

/**
 * Vì sao dòng này tồn tại: không có nó thì "im vì yên" và "im vì chết" trông GIỐNG HỆT nhau.
 * Đúng cái bẫy đã trả giá 6/8 với months.json — console vẽ số cũ, user mất tin vào cả trang.
 */
async function loadRadar() {
  let s;
  try {
    s = await api.radar();
  } catch {
    return; // server tắt — giữ nguyên UI cũ, không được ném lỗi ra ngoài
  }
  $('#radar-bar').html(
    `<div class="radarbar ${s.level}">${icon('radar')}<span>${escapeHtml(RADAR_TEXT[s.level](s))}</span>
       <button type="button" class="btn ghost small" data-radar-toggle="${s.enabled ? 0 : 1}">${
         s.enabled ? 'tắt' : 'bật'
       }</button></div>`
  );
}

function renderAlerts() {
  // Gộp 2 nguồn rồi SORT LẠI theo mức, không nối thô: `alerts.js` đã tự sort crit-trước-warn,
  // nhưng doctor giờ có cả 2 mức nên nối thô sẽ để một `warn` của doctor chen trước `crit` của
  // alerts — phá đúng cái thứ tự ưu tiên mà dải này tồn tại để phục vụ.
  // Cùng mức thì lỗi hợp đồng đứng trước: mọi con số khác trên trang đều dựa trên state.
  const RANK = { crit: 0, warn: 1 };
  const items = [...doctorItems, ...alerts]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (RANK[x.a.level] ?? 9) - (RANK[y.a.level] ?? 9) || x.i - y.i)
    .map((x) => x.a);
  const crit = items.filter((a) => a.level === 'crit');
  $('#alerts').html(
    items
      .map(
        (a) => `<div class="alert ${escapeHtml(a.level)}">${icon(a.level === 'crit' ? 'warn' : 'wait')}
          <span class="akey">${escapeHtml(a.key)}</span><span class="atext">${escapeHtml(a.text)}</span></div>`
      )
      .join('')
  );

  const sig = crit.map((a) => a.key + a.code).join('|');
  if (lastCritSignature !== null && sig && sig !== lastCritSignature)
    onNotify('Cảnh báo gấp', crit.map((a) => `${a.key}: ${a.text}`).join('\n'));
  lastCritSignature = sig;
}

/** Tab "Hôm nay": cảnh báo · KPI · dải mốc · timeline · bảng task · Cần bạn · log */
export function renderToday(data) {
  const today = data.today;
  const site = data.config?.siteUrl || JIRA_FALLBACK;
  // KHÔNG lọc phase ở đây nữa: bảng cần cả `closed`/`reassigned` (nhóm "Đã xong / ra khỏi tay"
  // thu gọn ở cuối) — mất dấu ticket là mất luôn đường tra lại. Chỗ nào chỉ được tính việc
  // CÒN CỦA MÌNH thì tự lọc `OFF_MY_PLATE_PHASES`: KPI (renderKpis) và timeline (dưới).
  const issues = Object.entries(data.state?.issues || {});
  const need = data.board?.needYou || [];

  ctx = {
    ...ctx,
    config: data.config || {},
    paths: data.paths || {},
    assets: data.assets || {},
    boardDate: data.board?.boardDate || null,
    needRaw: need,
    issues,
    today,
    site,
  };

  $('#today').text(today);
  $('#jira-link').attr('href', site + '/issues/?jql=' + encodeURIComponent(data.config?.jql || 'assignee = currentUser()'));
  if (data.config?.dashboardUrl) $('#dash-link').attr('href', data.config.dashboardUrl);

  renderKpis({ issues, need, today });
  renderWeek(data.week || []);
  // Timeline: ticket ĐÃ XONG phần mình vẫn có hàng (vẽ mờ) chừng nào còn mốc tương lai — FE xong
  // không phải hết việc, Test/Release của BE/QC mới là lúc bug quay lại và cần canh. Hết mốc
  // tương lai thì bỏ hẳn hàng. Ticket ĐÃ CHUYỂN NGƯỜI thì không vẽ: việc không còn bên mình.
  // Luật đầy đủ ở keepOnTimeline (core/marks.mjs). KPI + dải mốc + cảnh báo vẫn lọc OFF_MY_PLATE.
  //
  // Thứ tự hàng = mốc gần nhất tăng dần, việc CÒN TRONG TAY lên trước nhóm đã xong FE. Trước đây
  // để nguyên thứ tự `state.json` (thứ tự ticket được thêm vào) nên hàng đầu timeline là ticket
  // đã đóng, còn việc gấp nhất nằm áp chót.
  const rank = ([, i]) => (DONE_PHASES.includes(i.phase) ? 1 : 0);
  const soonest = ([, i]) => nextMilestone(i, today)?.days ?? Infinity;
  $('#gantt-box').html(
    ganttTimeline(
      issues
        .filter(([, i]) =>
          keepOnTimeline(i, {
            gonePhases: GONE_PHASES,
            donePhases: DONE_PHASES,
            daysUntilOf: (d) => daysUntil(d, today),
          })
        )
        .sort((a, b) => rank(a) - rank(b) || soonest(a) - soonest(b)),
      today
    )
  );
  rerenderTasks();
  renderNeed(need);

  $('#board-date').text(ctx.boardDate || '');
  renderLog(data.board?.log || []);
  $('#metrics-foot').text('metrics: ' + (data.metricsCount || 0) + ' bản ghi');

  const signature = need.join('|');
  if (lastNeedSignature !== null && signature !== lastNeedSignature && !document.hasFocus()) {
    document.title = '● Daily Console — có cập nhật';
  }
  lastNeedSignature = signature;
}

/**
 * KPI: chỉ ô ĐANG CẦN CHÚ Ý được lên màu (`tone`).
 * Trước đây cả 4 ô đều viền màu riêng → đọc như toàn báo động, mất hierarchy.
 */
function renderKpis({ issues, need, today }) {
  const running = issues.filter(([, i]) => ACTIVE_PHASES.includes(i.phase)).length;
  // "task mở" và "mốc sắp tới" chỉ đếm việc còn trong tay mình — ticket đã chuyển người
  // làm ô "mốc sắp tới" đỏ lên vì mốc của NGƯỜI KHÁC (ca GW-654: Due Jira 4/8).
  const mine = issues.filter(([, i]) => !OFF_MY_PLATE_PHASES.includes(i.phase));
  const nearest = mine.map(([, i]) => nextMilestone(i, today)).filter(Boolean).sort((a, b) => a.days - b.days)[0];
  const late = mine.filter(([, i]) => isLate(i, today)).length;

  const cards = [
    { n: mine.length, l: 'task mở' },
    { n: running, l: 'đang chạy' },
    {
      n: nearest ? nearest.days + 'd' : '—',
      l: 'mốc sắp tới',
      tone: nearest && nearest.days <= 4 ? 'crit' : nearest && nearest.days <= 8 ? 'warn' : '',
    },
    late
      ? { n: late, l: 'trễ mốc', tone: 'crit' }
      : { n: need.length, l: 'cần bạn', tone: need.length ? 'warn' : '' },
  ];

  $('#kpis').html(
    cards
      .map(
        (k) => `<div class="kpi${k.tone ? ' tone ' + k.tone : ''}">
          <div class="n">${escapeHtml(k.n)}</div><div class="l">${escapeHtml(k.l)}</div></div>`
      )
      .join('')
  );
}

function renderWeek(week) {
  $('#week').html(
    week
      .map(
        (w) => `<div class="wk" style="--sev:var(--${severityByDays(w.days)})">
          <div class="d">${shortDate(w.date)} · còn ${w.days}d</div>
          <div class="t">${escapeHtml(MILESTONE_LABEL[w.name] || w.name)}</div>
          <div class="m">${escapeHtml(w.key)}</div></div>`
      )
      .join('') || '<span class="empty-note">Không có mốc nào trong 14 ngày tới.</span>'
  );

  const htmlMilestones = week.filter((w) => w.name === 'html');
  let warning = '';
  for (let i = 1; i < htmlMilestones.length; i++) {
    if (htmlMilestones[i].days - htmlMilestones[i - 1].days < 3) {
      const chain = htmlMilestones.map((m) => `${m.key} (${shortDate(m.date)})`).join(' → ');
      warning = `Dồn mốc HTML: ${chain}. Ưu tiên cái gần nhất ngay.`;
      break;
    }
  }
  $('#weekwarn').html(warning ? `<div class="warnbar">${icon('warn')}<span>${escapeHtml(warning)}</span></div>` : '');
}

/** Một dòng task trong bảng */
function taskRow([key, issue], { today, site }) {
  let phase = PHASE[issue.phase] || { label: issue.phase, sev: 'wait', icon: 'dot' };
  // Ticket design ĐÃ GIAO (chỉ vướng khâu tải) không được đeo chip "chờ design" — hàng nằm
  // trong nhóm "Design đã giao · chờ tải về" mà chip lại nói "chờ design" là tự mâu thuẫn
  // ngay trên 1 dòng (feedback user 10/8, GW-627). Chip mượn nhãn/icon của design.status.
  if (issue.phase === 'waiting-design' && designDeliveredNotLocal(issue)) {
    const ds = DESIGN_STATUS[issue.design.status];
    phase = { label: `design đã giao · ${ds?.short || 'chờ tải'}`, sev: ds?.sev || 'warn', icon: ds?.icon || 'design-download' };
  }
  // Mốc của ticket đã chuyển người/đóng không còn là deadline của mình → không lên màu đếm ngược
  const offPlate = OFF_MY_PLATE_PHASES.includes(issue.phase);
  const next = offPlate ? null : nextMilestone(issue, today);
  const late = isLate(issue, today);
  const sev = late ? 'crit' : next ? severityByDays(next.days) : 'wait';
  const dueText = next
    ? `${MILESTONE_LABEL[next.name] || next.name} ${shortDate(next.date)} · ${next.days}d`
    : late
      ? 'quá mốc HTML'
      : issue.phase === 'reassigned'
        ? 'mốc của người nhận'
        : '—';

  // Dự báo chỉ có nghĩa khi việc còn trong tay mình (có `next` để so) — off-plate/không mốc
  // thì không có gì để so sánh "vượt mốc hay không".
  const fc = forecastMap[key];
  const fcHtml =
    fc && next
      ? `<span class="fc${fc.date > next.date ? ' late' : ''}" title="Dự báo từ lead time thật, ${fc.samples} mẫu">dự báo ${shortDate(fc.date)}</span>`
      : '';

  const design = DESIGN_STATUS[issue.design?.status];
  const designLink = issue.design?.link;
  const has = ctx.assets[key] || {};
  const sheet = Array.isArray(issue.bugSheets) ? issue.bugSheets[0] : null;

  /**
   * Nút phụ (`abtn2`) là nút chỉ có ở MỘT SỐ ticket — bị ẩn khi cột trái hẹp (<820px) để
   * cột Actions không cần chỗ cho trường hợp xấu nhất. Nút chính luôn có mặt.
   * Số nút thật của từng hàng được đếm ở `rerenderTasks` để đặt bề rộng cột cho ĐỦ:
   * `c-act` là `nowrap` nên hụt 1 nút là nút đó bị cắt mất (đã dính 1/8).
   */
  const buttons = [
    designLink
      ? `<a class="iconbtn abtn2" href="${escapeHtml(designLink)}" target="_blank" rel="noopener"
           title="Mở folder design trên OneDrive (chọn all → Download)">${icon('ext')}</a>`
      : '',
    has.designs
      ? `<button type="button" class="iconbtn abtn2" data-open-design="${escapeHtml(key)}"
           title="Mở designs/${escapeHtml(key)} trong Finder">${icon('design-local')}</button>`
      : '',
    has.questions
      ? `<button type="button" class="iconbtn abtn2" data-open-questions="${escapeHtml(key)}"
           title="Mở questions-for-pm.md — câu hỏi đang chờ gửi PM/designer">${icon('question')}</button>`
      : '',
    sheet
      ? `<button type="button" class="iconbtn abtn2" data-bugsheet="${escapeHtml(sheet)}"
           title="Gõ /bug-fixer-lite cho buglist của ticket này (chạy trong terminal CLI)">${icon('sheet')}</button>`
      : '',
    `<button type="button" class="iconbtn" data-prep="${escapeHtml(key)}"
       title="Gõ /daily prep ${escapeHtml(key)} vào terminal">${icon('term')}</button>`,
    `<button type="button" class="iconbtn" data-open-task="${escapeHtml(key)}"
       title="Mở folder task trong Finder">${icon('folder')}</button>`,
    issue.promoFolder
      ? `<button type="button" class="iconbtn abtn2" data-open-promo="${escapeHtml(issue.promoFolder)}"
           title="Mở folder gt-promotion trong VS Code">${icon('deliver')}</button>`
      : '',
  ].filter(Boolean);
  lastActionCount = Math.max(lastActionCount, buttons.length);
  const actions = buttons.join('');

  return `<tr class="trow${ACTIVE_PHASES.includes(issue.phase) ? ' live' : ''}${late ? ' late' : ''}" style="--sev:var(--${sev})">
    <td class="c-key"><a class="key" href="${site}/browse/${escapeHtml(key)}" target="_blank" rel="noopener"
        title="Mở ${escapeHtml(key)} trên Jira">${escapeHtml(key)}</a></td>
    <td class="c-title">
      <span class="titlerow">
        <button type="button" class="titlebtn" data-brief="${escapeHtml(key)}"
          title="${escapeHtml(issue.summary || key)} — bấm để xem brief">${escapeHtml(issue.summary || '—')}</button>
        ${
          design
            ? `<span class="dsg" style="color:var(--${design.sev})" title="${escapeHtml(design.label)}">${icon(design.icon)}</span>`
            : ''
        }
      </span>
      ${issue.note ? `<span class="rownote" title="${escapeHtml(issue.note)}">${escapeHtml(issue.note)}</span>` : ''}
    </td>
    <td class="c-phase"><span class="ph" style="color:var(--${phase.sev})">${icon(phase.icon || 'dot')}${escapeHtml(phase.label)}</span></td>
    <td class="c-due"><span class="due" style="color:var(--${sev})">${escapeHtml(dueText)}</span>${fcHtml}</td>
    <td class="c-gate">${gateCell(key)}</td>
    <td class="c-push">${pushCell(key)}</td>
    <td class="c-effort">${effortCell(activityMap[key])}</td>
    <td class="c-act">${actions}</td>
  </tr>`;
}

/**
 * Ô Gate — kết quả `fe-gate` lần cuối của ticket (nguồn `knowledge/gates/<KEY>.json`).
 * "chưa chạy" là thông tin THẬT, không phải trạng thái trống: nghĩa là chưa ai soi
 * font/asset thiếu cho ticket này, đừng đọc thành "không có lỗi".
 */
function gateCell(key) {
  const g = gateMap[key];
  if (!g)
    return `<span class="cell-none" title="Chưa chạy fe-gate cho ${escapeHtml(key)} — chưa biết có font/ảnh thiếu hay không">—</span>`;
  const when = String(g.at || '').replace('T', ' ').slice(0, 16);
  return g.pass
    ? `<span class="gt ok" title="fe-gate PASS · ${g.warn} warn · ${escapeHtml(when)}">${icon('gate')}pass${
        g.warn ? ` <i>${g.warn}w</i>` : ''
      }</span>`
    : `<span class="gt crit" title="fe-gate FAIL · ${g.error} ERROR · ${escapeHtml(when)}">${icon('gate')}${g.error} lỗi</span>`;
}

/** Ô Push — còn file chưa commit, hay commit chưa đẩy (nguồn /api/review) */
function pushCell(key) {
  const p = pushMap[key];
  if (!p) return '<span class="cell-none">—</span>';
  if (p.dirty)
    return `<button type="button" class="gt warn" data-goto-review="${escapeHtml(key)}"
      title="${p.dirty} file chưa commit — sang tab Review xem diff">${icon('commit')}${p.dirty} file</button>`;
  if (p.unpushed)
    return `<button type="button" class="gt crit" data-goto-review="${escapeHtml(key)}"
      title="${p.unpushed} commit chưa push — sang tab Review">${icon('push')}${p.unpushed}</button>`;
  return `<span class="gt ok" title="Sạch và đã đẩy lên remote">${icon('check')}</span>`;
}

/**
 * Bảng task thay kanban: nhóm theo phase bằng DÒNG NHÓM.
 * Kanban 8 cột trong cột trái ~880px làm chữ bị cắt giữa câu + tràn ngang; bảng thì
 * mọi bề rộng vẫn đọc được, và so sánh mốc/effort giữa các task dễ hơn vì cùng 1 trục dọc.
 */
function rerenderTasks() {
  const { issues = [], today, site } = ctx;

  // Nhóm + đếm dồn hết vào core/grouping.mjs (hàm thuần, có test khoá 4 bug ngày 3/8: phase
  // lạ mất im lặng, đếm tiêu đề lệch số dòng, nhóm đóng không mở khi lọc, trạng thái mở/đóng
  // không sống qua poll). Ở đây chỉ còn phần VẼ.
  const { groups, trackedTotal, trackedMatched } = groupTasks(issues, { filterText, expanded: expandedGroups });
  $('#task-count').text(trackedMatched === trackedTotal ? `(${trackedTotal})` : `(${trackedMatched}/${trackedTotal})`);

  const matchedCount = groups.reduce((n, g) => n + g.items.length, 0);
  if (!matchedCount) {
    $('#tasks').html('<span class="empty-note">Không có task nào khớp.</span>');
    return;
  }

  lastActionCount = 0; // taskRow() cộng dồn trong lượt render này

  const body = groups
    .map((g) => {
      const gphase = PHASE[g.phases[0]] || { icon: 'warn', sev: 'warn' };
      const head = g.collapsed
        ? `<tr class="grouprow foldable${g.folded ? ' folded' : ''}">
            <th colspan="8" scope="colgroup" style="--sev:var(--${gphase.sev})">
              <button type="button" class="gfold" data-fold="${escapeHtml(g.label)}"
                      aria-expanded="${g.folded ? 'false' : 'true'}"
                      title="${g.folded ? 'Mở' : 'Thu gọn'} nhóm ${escapeHtml(g.label)}">
                <span class="gcaret">${icon('caret')}</span>
                <span class="gicon">${icon(gphase.icon)}</span>
                <span class="gname">${escapeHtml(g.label)}</span>
                <span class="gcount">${g.items.length}</span>
              </button>
            </th></tr>`
        : `<tr class="grouprow"><th colspan="8" scope="colgroup" style="--sev:var(--${gphase.sev})">
            <span class="gicon">${icon(gphase.icon)}</span><span class="gname">${escapeHtml(g.label)}</span>
            <span class="gcount">${g.items.length}</span>
          </th></tr>`;

      const rows = g.items.map((entry) => taskRow(entry, { today, site })).join('');
      return head + (g.folded ? '' : rows);
    })
    .join('');

  // Bề rộng cột Actions = số nút thật của hàng nhiều nút nhất (nút 21px + margin 2px) + padding ô.
  // Đặt cứng 104px như trước là cắt mất nút khi ticket có đủ design + questions + buglist.
  const actW = Math.max(104, lastActionCount * 23 + 16);

  $('#tasks').html(
    `<table class="ttable" style="--actw:${actW}px"><thead><tr>
      <th class="c-key">Ticket</th><th class="c-title">Việc <span class="thhint">· icon = design</span></th>
      <th class="c-phase">Phase</th><th class="c-due">Mốc kế</th>
      <th class="c-gate">Gate</th><th class="c-push">Push</th><th class="c-effort">Effort</th>
      <th class="c-act"><span class="sr">Hành động</span></th>
    </tr></thead><tbody>${body}</tbody></table>`
  );
}

/**
 * "Cần bạn" = việc CHỈ BẠN LÀM ĐƯỢC, do `/daily` ghi vào section `## Cần bạn` của board
 * (review + push, gửi câu hỏi PM/designer, cắt ảnh, duyệt thứ tự…). Mục tiêu là về 0 dòng.
 *
 * Hiển thị GỌN có chủ ý: 1 dòng/mục + ellipsis (bấm vào chữ để mở hết), mục đã tick thì ẩn
 * sau nút đếm. Trước đây mỗi mục là 1 card wrap 2-4 dòng nên 9 mục chiếm gần hết màn hình —
 * danh sách việc tồn không nên to hơn bảng task.
 */
function renderNeed(need) {
  const doneCount = need.filter((n) => /^~~/.test(n.trim())).length;
  const open = need.length - doneCount;
  if (!doneCount) showDoneNeed = false; // hết mục xong thì nút biến mất, đừng để nhãn "ẩn 0"
  $('#need-count').text(need.length ? `(còn ${open})` : '');
  $('#need-toggle')
    .toggle(doneCount > 0)
    .text(showDoneNeed ? `ẩn ${doneCount} đã xong` : `hiện ${doneCount} đã xong`);

  const rows = need
    .map((n, i) => ({ text: n, i, done: /^~~/.test(n.trim()) }))
    .filter((r) => showDoneNeed || !r.done);

  const keyOf = (text) => text.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);

  $('#need').html(
    need.length
      ? rows
          .map((r) => {
            const k = keyOf(r.text);
            return `<li class="${r.done ? 'done' : ''}${openNeed.has(k) ? ' open' : ''}" data-need-key="${escapeHtml(k)}">
              <button type="button" class="needbox" role="checkbox" aria-checked="${r.done}" data-need-index="${r.i}"
                title="${r.done ? 'Bỏ tick' : 'Đánh dấu xong'} — ghi thẳng vào board">${icon(r.done ? 'box-on' : 'box-off')}</button>
              <span class="needtext" data-need-text title="Bấm để xem/thu gọn cả dòng">${inlineMd(r.text)}</span></li>`;
          })
          .join('') || `<li class="empty">${icon('goal')}<span>Hết việc đang mở — ${doneCount} mục đã xong</span></li>`
      : `<li class="empty">${icon('goal')}<span>0 mục — mục tiêu đạt được</span></li>`
  );
}

/**
 * Nợ đọng từ board CŨ — việc chưa tick mà hôm nay không ai nhắc lại.
 *
 * Vì sao cần khối này: board là sổ theo NGÀY và khối "Cần bạn" trên chỉ đọc board hôm nay, nên
 * việc cũ rụng khỏi radar. Đo thật 12/8: 5 việc GW-627 ghi ở board 10/8 (báo designer 3 lỗi
 * design · lỗi bản TH · xác nhận CDN sync · thứ tự release · review 4 file new-mainsite) không
 * xuất hiện lại ở board 11/8 hay 12/8 — mất radar 2 ngày, mà GW-627 release 15/8.
 *
 * Nhóm ticket đã đóng/chuyển người gộp cuối và FOLDED sẵn: nó là chỗ chứa nhiễu tháng 7 (GW-654
 * 11 mục, GW-556 9 mục) — cùng nếp với nhóm đóng sẵn của bảng task.
 */
function renderDebt(debt) {
  const groups = debt.groups || [];
  const live = groups.filter((g) => !g.offMyPlate);
  const gone = groups.filter((g) => g.offMyPlate);
  const n = debt.counts?.dropped || 0;

  $('#debt-box').toggle(groups.length > 0);
  $('#debt-count').text(n ? `(${n} việc · ${debt.counts.tickets} ticket)` : '');

  const row = (g, i) => `<li class="${openDebt.has(i.date + '#' + i.index) ? 'open' : ''}"
      data-debt-key="${escapeHtml(g.key || '')}" data-debt-open-key="${escapeHtml(i.date + '#' + i.index)}">
      <button type="button" class="needbox" role="checkbox" aria-checked="false"
        data-debt-date="${escapeHtml(i.date)}" data-debt-index="${i.index}" data-debt-text="${escapeHtml(i.text)}"
        title="Đánh dấu xong — ghi thẳng vào board ${escapeHtml(i.date)}">${icon('box-off')}</button>
      <span class="debtage" title="Ghi ở board ${escapeHtml(i.date)}, đã ${i.staleDays} ngày">${escapeHtml(
        shortDate(i.date)
      )} · ${i.staleDays}d</span>
      <span class="needtext" data-need-text title="Bấm để xem/thu gọn cả dòng">${inlineMd(i.text)}</span></li>`;

  const block = (g) => `<div class="debtgroup">
      <div class="debthead">${escapeHtml(g.key || 'không gắn ticket')}
        <span class="mono">${escapeHtml(String(g.phase || '—'))}</span>
        <span class="debtage">cũ nhất ${g.staleDays}d · ${g.items.length} việc</span></div>
      <ul class="need">${g.items.map((i) => row(g, i)).join('')}</ul></div>`;

  const strayNote = (debt.stray || []).length
    ? `<p class="empty-note">⚠ ${debt.stray
        .map((s) => `board ${escapeHtml(s.date)}: ${s.count} dòng`)
        .join(' · ')} nằm trong mục "Cần bạn" nhưng KHÔNG có ô tick — không tính là việc, đang bỏ qua.</p>`
    : '';

  $('#debt').html(
    (live.length ? live.map(block).join('') : '<p class="empty-note">Không còn việc nào rơi khỏi radar.</p>') +
      (gone.length
        ? `<details class="foldbox"><summary>Ticket đã đóng / chuyển người (${gone.reduce(
            (s, g) => s + g.items.length,
            0
          )} việc)</summary>${gone.map(block).join('')}</details>`
        : '') +
      strayNote
  );
}

/** Log board — dòng còn `HH:MM` là placeholder chưa thay, phải nhìn thấy được */
function renderLog(log) {
  const missing = log.filter((l) => NO_TIME_RE.test(l.trim())).length;
  $('#log').html(
    log
      .map((l) => {
        const noTime = NO_TIME_RE.test(l.trim());
        return `<li class="${noTime ? 'notime' : ''}"${
          noTime ? ' title="Log thiếu giờ thật — skill phải lấy bằng `date +%H:%M`"' : ''
        }>${inlineMd(l)}</li>`;
      })
      .join('')
  );
  $('#log-warn').html(
    missing
      ? `<div class="warnbar small">${icon('warn')}<span>${missing} dòng log ghi <code>HH:MM</code> thay vì giờ thật → mất trục thời gian cho vòng học.</span></div>`
      : ''
  );
}

/** Thêm 1 dòng vào board hôm nay; poll 3s sau đó tự hiện dòng mới (không tự render lạc nhịp) */
async function appendBoard(section, $input) {
  const text = String($input.val() || '').trim();
  if (!text) return;
  const $btn = $input.closest('form').find('button');
  $btn.prop('disabled', true);
  try {
    const out = await api.boardAppend({ date: ctx.boardDate || ctx.today, section, text });
    $input.val('');
    $input.attr('placeholder', 'đã ghi: ' + out.line);
  } catch (err) {
    window.alert('Không ghi được board: ' + (err.responseJSON?.error || 'lỗi không rõ'));
  } finally {
    $btn.prop('disabled', false);
  }
}

async function openPath(app, root, sub) {
  if (!root) {
    window.alert('Chưa cấu hình đường dẫn cho hành động này (kiểm tra config.json).');
    return;
  }
  try {
    await api.open(app, sub ? root + '/' + sub : root);
  } catch (err) {
    window.alert('Không mở được: ' + (err.responseJSON?.error || err.statusText || 'lỗi không rõ'));
  }
}
