import $ from 'jquery';
import { api } from '@core/api';
import {
  PHASE,
  ACTIVE_PHASES,
  OFF_MY_PLATE_PHASES,
  GONE_PHASES,
  DONE_PHASES,
  MANUAL_FINISH_PHASES,
  MILESTONE_LABEL,
  DESIGN_STATUS,
  designDeliveredNotLocal,
  JIRA_SITE,
} from '@core/constants.mjs';
import { icon } from '@core/icons';
import { escapeHtml, inlineMd, shortDate, severityByDays, nextMilestone, isLate, daysUntil } from '@core/format.mjs';
import { groupTasks } from '@core/grouping.mjs';
import { keepOnTimeline } from '@core/marks.mjs';
import { showText } from '@components/modal';
import { openTicket } from '@panels/ticketPanel';
import { ganttTimeline } from '@components/gantt';
import { effortCell, activityDetail } from '@components/activityLine';
import { bindBoardAppend } from '@components/boardAppend';
import { toast } from '@components/toast';

const ACTIVITY_REFRESH_MS = 30000;
/** Log board thiếu giờ thật: skill phải lấy `date +%H:%M`, không được ghi placeholder */
const NO_TIME_RE = /^HH:MM\b/;
let filterText = '';
/**
 * Nhóm đóng sẵn user đã bấm mở: label → true nghĩa là NGƯỜI DÙNG đã mở nó ra.
 * Giữ ngoài render vì bảng vẽ lại mỗi 3s (poll state) — không nhớ thì nhóm tự đóng
 * lại giữa lúc đang đọc (đã dính: bấm mở, 3 giây sau tự thu lại).
 */
const expandedGroups = {};
let ctx = { terminals: null, config: {}, paths: {}, assets: {}, boardDate: null };
let activityMap = {}; // key → bản ghi hoạt động git (nạp riêng, chậm hơn poll state)
let gateMap = {}; // key → kết quả fe-gate lần cuối
let pushMap = {}; // key → { dirty, unpushed } từ /api/review
let forecastMap = {}; // key → { date, samples } | null — dự báo ngày xong phase hiện tại, từ /api/learn
/** Số nút nhiều nhất trên 1 hàng của lượt render đang chạy → suy bề rộng cột Actions */
let lastActionCount = 0;

export function initOverviewPanel({ terminals, refresh }) {
  ctx.terminals = terminals;
  ctx.refresh = refresh;
  bindBoardAppend('#log-add', 'Log', () => ctx.boardDate || ctx.today);

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

  $(document)
    .on('click', (e) => {
      if (!$(e.target).closest('#finish-menu, [data-finish]').length) closeFinishMenu();
    })
    .on('keydown', (e) => e.key === 'Escape' && closeFinishMenu())
    .on('click', '#finish-menu [data-to]', function () {
      const $menu = $('#finish-menu');
      finishTicket(String($menu.data('key')), String($(this).data('to')), String($menu.data('phase')));
    });
  $('.left').on('scroll', closeFinishMenu);

  // Hành động trong bảng — bind 1 lần, không bind lại mỗi lần render
  $('#tasks')
    .on('click', '[data-finish]', function () {
      openFinishMenu(this);
    })
    .on('click', '[data-reopen]', function () {
      reopenTicket(String($(this).data('reopen')));
    })
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

  loadActivity();
  setInterval(loadActivity, ACTIVITY_REFRESH_MS);
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

/** Tab "Tổng quan": dải mốc · timeline · bảng task · log */
export function renderOverview(data) {
  const today = data.today;
  const site = data.config?.siteUrl || JIRA_SITE;
  // Không lọc phase: bảng giữ cả `closed`/`reassigned` (nhóm thu gọn cuối) để còn đường tra lại
  const issues = Object.entries(data.state?.issues || {});

  ctx = {
    ...ctx,
    config: data.config || {},
    paths: data.paths || {},
    assets: data.assets || {},
    boardDate: data.board?.boardDate || null,
    issues,
    today,
    site,
  };

  $('#today').text(today);
  $('#jira-link').attr('href', site + '/issues/?jql=' + encodeURIComponent(data.config?.jql || 'assignee = currentUser()'));
  if (data.config?.dashboardUrl) $('#dash-link').attr('href', data.config.dashboardUrl);

  renderDeadlineWarning(data.week || []);
  // Timeline: ticket ĐÃ XONG phần mình vẫn có hàng (vẽ mờ) chừng nào còn mốc tương lai — FE xong
  // không phải hết việc, Test/Release của BE/QC mới là lúc bug quay lại và cần canh. Hết mốc
  // tương lai thì bỏ hẳn hàng. Ticket ĐÃ CHUYỂN NGƯỜI thì không vẽ: việc không còn bên mình.
  // Luật đầy đủ ở keepOnTimeline (core/marks.mjs).
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

  $('#board-date').text(ctx.boardDate || '');
  renderLog(data.board?.log || []);
  $('#metrics-foot').text('metrics: ' + (data.metricsCount || 0) + ' bản ghi');
}

function renderDeadlineWarning(week) {
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
    MANUAL_FINISH_PHASES.includes(issue.phase)
      ? `<button type="button" class="iconbtn" data-finish="${escapeHtml(key)}" data-phase="${escapeHtml(issue.phase)}"
           title="Báo ${escapeHtml(key)} đã xong / đã đóng — rời nhóm &quot;${escapeHtml(phase.label)}&quot;">${icon('done')}</button>`
      : '',
    issue.manualFinish
      ? `<button type="button" class="iconbtn" data-reopen="${escapeHtml(key)}"
           title="Hoàn tác: trả ${escapeHtml(key)} về &quot;${escapeHtml(PHASE[issue.manualFinish.from]?.label || issue.manualFinish.from)}&quot;">${icon('undo')}</button>`
      : '',
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
  return `<span class="gt ok" title="Sạch và đã đẩy lên remote">${icon('check')}sạch</span>`;
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
    // Không lọc mà vẫn 0 dòng = chưa đọc được state, KHÁC hẳn "lọc không khớp" — nói đúng
    // cái nào thì user mới biết phải gõ /daily hay chỉ cần xoá ô lọc.
    $('#tasks').html(
      filterText
        ? '<span class="empty-note">Không có task nào khớp.</span>'
        : '<span class="empty-note">Chưa đọc được task nào — server console chưa chạy, hoặc hôm nay chưa chạy <code>/daily</code>.</span>'
    );
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
      <th class="c-gate">Gate</th><th class="c-push">Push</th><th class="c-effort" title="Số commit · số dòng code đã thêm — bấm ô để xem từng commit">Commit</th>
      <th class="c-act">Mở</th>
    </tr></thead><tbody>${body}</tbody></table>`
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

function closeFinishMenu() {
  $('#finish-menu').remove();
}

function openFinishMenu(btn) {
  const key = String($(btn).data('finish'));
  closeFinishMenu();
  const rect = btn.getBoundingClientRect();
  $(`<div id="finish-menu" class="finishmenu" role="menu"></div>`)
    .data({ key, phase: String($(btn).data('phase')) })
    .html(
      `<div class="fmhead">${escapeHtml(key)} — báo đã xong</div>
       <button type="button" role="menuitem" data-to="done-fe">${icon('done')}<span><b>Xong FE</b>
         <small>Rời nhóm chờ test / fix bug · vẫn hiện mờ trên timeline tới mốc release</small></span></button>
       <button type="button" role="menuitem" data-to="closed">${icon('closed')}<span><b>Đóng hẳn</b>
         <small>Ticket đã xong toàn bộ · thôi mọi cảnh báo và mốc</small></span></button>`
    )
    .css({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    .appendTo('body');
}

async function finishTicket(key, to, expectPhase) {
  closeFinishMenu();
  try {
    await api.finishTicket(key, to, expectPhase);
    toast(`${key} → ${PHASE[to].label}`, 'ok', { label: 'hoàn tác', run: () => reopenTicket(key) });
  } catch (err) {
    toast('Không ghi được: ' + (err.responseJSON?.error || 'lỗi không rõ'));
  }
  ctx.refresh();
}

async function reopenTicket(key) {
  try {
    const out = await api.reopenTicket(key);
    toast(`${key} đã trả về "${PHASE[out.to]?.label || out.to}"`, 'ok');
  } catch (err) {
    toast('Không hoàn tác được: ' + (err.responseJSON?.error || 'lỗi không rõ'));
  }
  ctx.refresh();
}

async function openPath(app, root, sub) {
  if (!root) {
    toast('Chưa cấu hình đường dẫn cho hành động này (kiểm tra config.json).');
    return;
  }
  try {
    await api.open(app, sub ? root + '/' + sub : root);
  } catch (err) {
    toast('Không mở được: ' + (err.responseJSON?.error || err.statusText || 'lỗi không rõ'));
  }
}
