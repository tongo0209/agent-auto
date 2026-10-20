import { esc } from '../lib.js';
import { JIRA, phaseOf, MILESTONE, daysUntil, shortDate, stamp, markdown, settler, skeleton, note, errNote, pill, draft, realMilestones, toneByDays, nextMilestone, isLate } from './_kit.js';

const STATE_REFRESH_MS = 20000;
const EXTRA_REFRESH_MS = 60000;
const HEAT = ['bugfix', 'coding', 'deliver', 'ready', 'waiting-design', 'wait-test', 'done-fe', 'reassigned', 'closed'];
const GROUP_ORDER = ['Fix bug', 'Đang code', 'Giao HTML', 'Sẵn sàng', 'Chờ design', 'Chờ test', 'Phase lạ', 'Đã xong / ra khỏi tay'];
const MANUAL_FINISH = ['wait-test', 'bugfix'];
const VIEWPORT_WIDTH = { pc: 1920, mb: 768 };
const MOBILE_NAME = /(^|[_\-. ])(mb|mobile|m)([_\-. ]|$)/i;

const DONE_GROUP = 'Đã xong / ra khỏi tay';
const COLLAPSED_KEY = 'tk.collapsed';

function loadCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY)) ?? [DONE_GROUP]);
  } catch {
    return new Set([DONE_GROUP]);
  }
}

const heat = (phase) => (HEAT.includes(phase) ? HEAT.indexOf(phase) : HEAT.length);

function nest(entries) {
  const keys = new Set(entries.map(([k]) => k));
  return entries
    .filter(([, i]) => !(i.parent && keys.has(i.parent)))
    .map(([key, issue]) => {
      const subs = entries.filter(([, s]) => s.parent === key);
      const openSubs = subs.filter(([, s]) => !phaseOf(s.phase).folded);
      const shownPhase = [issue.phase, ...openSubs.map(([, s]) => s.phase)].sort((a, b) => heat(a) - heat(b))[0];
      return { key, issue, subs, shownPhase };
    });
}

const MARKUP = `<div class="page-pad tk">
  <header class="vw-head">
    <div><h1>Task</h1><div class="vw-sub mono" id="tkSub">&nbsp;</div></div>
    <div class="vw-tools">
      <label class="vw-search"><i class="ph ph-magnifying-glass"></i><input class="vw-input" id="tkFilter" placeholder="Lọc theo mã, tên, ghi chú" aria-label="Lọc task"></label>
      <button class="btn ghost vw-sm" data-fold-all="close"><i class="ph ph-arrows-in-line-vertical"></i>Thu gọn hết</button>
      <button class="btn ghost vw-sm" data-fold-all="open"><i class="ph ph-arrows-out-line-vertical"></i>Mở hết</button>
      <button class="btn ghost vw-sm" id="tkReload"><i class="ph ph-arrows-clockwise"></i>Làm mới</button>
    </div>
  </header>
  <div class="tk-cols" aria-hidden="true"><span>Ticket</span><span>Việc</span><span>Phase</span><span>Mốc kế</span><span>Gate</span><span>Push</span><span>Commit</span></div>
  <div id="tkList">${skeleton(10)}</div>
</div>
<div class="vw-veil" id="tkVeil"></div>
<aside class="tk-drawer" id="tkDrawer" aria-label="Chi tiết ticket"></aside>
<div class="vw-modal tk-lbox" id="tkLbox" role="dialog" aria-label="Ảnh design"></div>`;

export function mount(el, ctx) {
  el.innerHTML = MARKUP;
  const $ = (s) => el.querySelector(s);
  const collapsed = loadCollapsed();
  let st = null;
  let stateError = null;
  let gates = {};
  let pushes = {};
  let activity = {};
  let filter = '';
  let drawer = null;

  const settle = settler(el.firstElementChild);

  async function loadState() {
    try {
      st = await ctx.api('state');
      stateError = null;
    } catch (e) {
      stateError = e;
    }
    renderList();
    if (st) settle();
  }

  async function loadExtras() {
    const [g, r, a] = await Promise.allSettled([ctx.api('gates'), ctx.api('review'), ctx.api('activity')]);
    if (g.status === 'fulfilled') gates = Object.fromEntries(g.value.items.map((x) => [x.key, x]));
    if (r.status === 'fulfilled') pushes = Object.fromEntries(r.value.items.map((x) => [x.key, x]));
    if (a.status === 'fulfilled') activity = Object.fromEntries(a.value.items.map((x) => [x.key, x]));
    renderList();
  }

  function gateBadge(key) {
    const g = gates[key];
    if (!g) return '<span class="tk-none" title="Chưa chạy fe-gate">--</span>';
    return g.pass ? pill('ok', `<i class="ph ph-shield-check"></i>pass`, `${g.warn} warn · ${stamp(g.at)}`) : pill('crit', `<i class="ph ph-shield-warning"></i>${g.error} lỗi`, `${g.warn} warn · ${stamp(g.at)}`);
  }

  function pushBadge(key) {
    const p = pushes[key];
    if (!p) return '<span class="tk-none">--</span>';
    if (p.dirty) return pill('warn', `<i class="ph ph-pencil-simple-line"></i>${p.dirty} file`, `${p.dirty} file chưa commit`);
    if (p.unpushed) return pill('crit', `<i class="ph ph-arrow-fat-up"></i>${p.unpushed}`, `${p.unpushed} commit chưa push`);
    return pill('ok', '<i class="ph ph-check"></i>sạch', 'Sạch và đã đẩy');
  }

  function row({ key, issue, subs = [], shownPhase = issue.phase }, i, isSub = false) {
    const phase = phaseOf(shownPhase);
    const next = nextMilestone(issue, st.today);
    const late = isLate(issue, st.today);
    const due = late
      ? pill('crit', 'quá mốc HTML')
      : next
        ? `<span class="tk-due t-${toneByDays(next.days)}"><span>${MILESTONE[next.name] ?? esc(next.name)} ${shortDate(next.date)}</span><b class="mono">${next.days ? `${next.days}d` : 'hôm nay'}</b></span>`
        : `<span class="tk-none">${issue.phase === 'reassigned' ? 'mốc người nhận' : '--'}</span>`;
    const designWaiting = String(issue.design?.status ?? '').startsWith('đã-giao') && issue.design.status !== 'đã-giao-đã-tải';
    const act = activity[key];
    return `<div class="tk-row vw-in ${isSub ? 'sub' : ''} ${late ? 'late' : ''}" data-key="${esc(key)}" style="--i:${i}" tabindex="0" role="button" aria-label="Mở ${esc(key)}">
      <span class="tk-key mono">${esc(key)}${subs.length ? `<small title="${subs.length} sub-task">+${subs.length}</small>` : ''}</span>
      <span class="tk-title"><span class="t">${esc(issue.summary || '--')}</span>${issue.note ? `<span class="n">${esc(issue.note)}</span>` : ''}</span>
      <span class="tk-phase">${pill(phase.tone, `<i class="ph ${phase.icon}"></i>${esc(phase.label)}`)}${designWaiting ? `<i class="ph ph-cloud-arrow-down tk-dsg" title="Design đã giao, chưa tải đủ về local"></i>` : ''}</span>
      <span class="tk-cell">${due}</span>
      <span class="tk-cell" data-label="Gate">${gateBadge(key)}</span>
      <span class="tk-cell" data-label="Push">${pushBadge(key)}</span>
      <span class="tk-cell mono tk-commit" data-label="Commit">${act?.linked ? `${act.commits} <small>commit</small>` : '<span class="tk-none">--</span>'}</span>
    </div>`;
  }

  function renderList() {
    if (stateError && !st) return ($('#tkList').innerHTML = errNote(stateError));
    if (!st) return;
    const q = filter.trim().toLowerCase();
    const textOf = ([key, i]) => `${key} ${i.summary ?? ''} ${i.note ?? ''}`.toLowerCase();
    const rows = nest(Object.entries(st.state.issues ?? {}))
      .filter((r) => !q || [[r.key, r.issue], ...r.subs].some((e) => textOf(e).includes(q)));
    const tracked = rows.filter((r) => !phaseOf(r.shownPhase).folded).length;
    $('#tkSub').textContent = `${tracked} đang theo · ${Object.keys(st.state.issues ?? {}).length} ticket trong state · ${st.today}`;
    if (!rows.length) return ($('#tkList').innerHTML = note(q ? 'ph-magnifying-glass' : 'ph-tray', q ? 'Không có task nào khớp bộ lọc.' : 'Chưa có task nào trong state. Chạy <code>/daily</code> để quét Jira.'));
    const groups = GROUP_ORDER.map((label) => ({ label, items: rows.filter((r) => phaseOf(r.shownPhase).group === label) })).filter((g) => g.items.length);
    let n = 0;
    $('#tkList').innerHTML = groups.map((g) => {
      const folded = collapsed.has(g.label) && !q;
      const tone = phaseOf(g.items[0].shownPhase).tone;
      return `<section class="tk-group t-${tone} ${folded ? 'folded' : ''}">
        <h2><button class="tk-fold" data-fold="${esc(g.label)}" aria-expanded="${!folded}"><i class="ph ph-caret-right"></i>
          <span class="dot"></span>${esc(g.label)}<span class="mono">${g.items.length}</span>
          ${folded ? `<span class="tk-peek mono">${g.items.map((r) => esc(r.key)).join(' · ')}</span>` : ''}
          <span class="tk-fold-hint">${folded ? 'Mở' : 'Thu gọn'}</span></button></h2>
        ${folded ? '' : `<div class="tk-items">${g.items.map((r) => row(r, n++) + r.subs.map(([k, s]) => row({ key: k, issue: s }, n++, true)).join('')).join('')}</div>`}
      </section>`;
    }).join('');
  }

  function setHash(key) {
    history.replaceState(null, '', key ? `#/tasks/${encodeURIComponent(key)}` : '#/tasks');
  }

  async function openDrawer(key) {
    drawer = { key, tab: 'overview', data: null, handoff: null, delivery: null, brief: null, confirm: null, img: 0, compare: false };
    setHash(key);
    $('#tkVeil').classList.add('show');
    $('#tkDrawer').classList.add('show');
    $('#tkDrawer').innerHTML = `<div class="tk-dhead"><span class="vw-key">${esc(key)}</span><span class="grow"></span><button class="vw-x" data-close aria-label="Đóng"><i class="ph ph-x"></i></button></div><div class="tk-dbody">${skeleton(9)}</div>`;
    try {
      const [data, handoff] = await Promise.all([ctx.api(`ticket/${encodeURIComponent(key)}`), ctx.api(`handoff/${encodeURIComponent(key)}`).catch(() => ({ exists: false, items: [] }))]);
      if (drawer?.key !== key) return;
      Object.assign(drawer, { data, handoff });
    } catch (e) {
      if (drawer?.key !== key) return;
      $('#tkDrawer .tk-dbody').innerHTML = errNote(e);
      return;
    }
    renderDrawer();
    if (drawer.data.issue.promoFolder) loadDelivery();
  }

  function closeDrawer() {
    drawer = null;
    closeLightbox();
    setHash(null);
    $('#tkVeil').classList.remove('show');
    $('#tkDrawer').classList.remove('show');
  }

  async function loadDelivery() {
    const key = drawer.key;
    drawer.delivery = { loading: true };
    renderDrawer();
    let out;
    try {
      out = await ctx.api(`jira/delivery/${encodeURIComponent(key)}`);
    } catch (e) {
      out = { state: 'error', message: e.message };
    }
    if (drawer?.key !== key) return;
    drawer.delivery = out;
    renderDrawer();
  }

  const TABS = [
    ['overview', 'Tổng quan'],
    ['brief', 'Brief'],
    ['design', 'Design'],
    ['gate', 'Gate'],
    ['git', 'Git'],
    ['handoff', 'Bàn giao'],
  ];

  function renderDrawer() {
    const { key, data: d } = drawer;
    const issue = d.issue;
    const phase = phaseOf(issue.phase);
    const tabs = TABS.filter(([id]) => id !== 'handoff' || drawer.handoff.exists);
    const count = { design: d.images.length, git: d.activity?.commits, handoff: drawer.handoff.items.length };
    $('#tkDrawer').innerHTML = `
      <div class="tk-dhead">
        <a class="vw-key" href="${esc(d.site || JIRA)}/browse/${esc(key)}" target="_blank" rel="noopener" title="Mở trên Jira">${esc(key)} <i class="ph ph-arrow-up-right"></i></a>
        ${pill(phase.tone, `<i class="ph ${phase.icon}"></i>${esc(phase.label)}`)}
        <span class="tk-status mono">${esc(issue.status ?? '')}</span>
        <span class="grow"></span>
        <button class="vw-x" data-close aria-label="Đóng"><i class="ph ph-x"></i></button>
      </div>
      <div class="tk-dbody">
        <h2 class="tk-sum">${esc(issue.summary ?? key)}</h2>
        ${actionBar(d)}
        ${drawer.confirm ? confirmBox() : ''}
        ${milestoneStrip(issue)}
        <nav class="tabs">${tabs.map(([id, label]) => `<button class="tab ${drawer.tab === id ? 'on' : ''}" data-tab="${id}">${label}${count[id] ? ` <span class="mono">${count[id]}</span>` : ''}</button>`).join('')}</nav>
        <div class="tk-pane" id="tkPane">${pane()}</div>
      </div>`;
    if (drawer.tab === 'brief' && drawer.brief === null) loadBrief();
  }

  function actionBar(d) {
    const issue = d.issue;
    const preview = d.dist
      ? `<a class="btn ghost vw-sm" href="/preview/${esc(d.key)}/" target="_blank" rel="noopener"><i class="ph ph-browser"></i>Preview</a>`
      : `<span class="btn ghost vw-sm tk-off" aria-disabled="true" title="Chưa có dist/, build trước"><i class="ph ph-browser"></i>Preview</span>`;
    return `<div class="tk-actions">
      <button class="btn go vw-sm" data-run-autopilot><i class="ph-bold ph-flow-arrow"></i>Chạy autopilot</button>
      <button class="btn vw-sm" data-cli><i class="ph ph-terminal-window"></i>Mở CLI</button>
      <button class="btn vw-sm" data-gate><i class="ph ph-shield-check"></i>Chạy cổng</button>
      ${preview}
      <button class="btn ghost vw-sm" data-prep><i class="ph ph-clipboard-text"></i>Prep</button>
      ${MANUAL_FINISH.includes(issue.phase) ? `<button class="btn ghost vw-sm" data-ask="finish"><i class="ph ph-check-circle"></i>Báo xong</button>` : ''}
      ${issue.manualFinish ? `<button class="btn ghost vw-sm" data-reopen><i class="ph ph-arrow-counter-clockwise"></i>Hoàn tác về ${esc(phaseOf(issue.manualFinish.from).label)}</button>` : ''}
    </div>`;
  }

  function confirmBox() {
    if (drawer.confirm === 'finish') {
      return `<div class="tk-confirm"><b>Báo ${esc(drawer.key)} đã xong</b>
        <div class="tk-confirm-opts">
          <button class="tk-opt" data-finish="done-fe"><i class="ph ph-check-circle"></i><span><b>Xong FE</b><small>Rời nhóm chờ test hoặc fix bug, vẫn theo mốc tới release</small></span></button>
          <button class="tk-opt" data-finish="closed"><i class="ph ph-archive"></i><span><b>Đóng hẳn</b><small>Xong toàn bộ, thôi mọi cảnh báo và mốc</small></span></button>
        </div><button class="vw-link" data-ask="">Huỷ</button></div>`;
    }
    const dv = drawer.delivery;
    return `<div class="tk-confirm warn"><b>Chuyển ${esc(drawer.key)} từ ${esc(dv.jira?.status ?? '?')} sang hoàn thành trên Jira?</b>
      <p>Bằng chứng: commit <code>${esc(dv.commit ?? '')}</code> đã push vào <code>${esc(dv.promoFolder ?? '')}/mainsite</code>. Console không ghi gì vào description.</p>
      ${dv.dirty ? note('ph-warning', 'Folder còn thay đổi chưa commit hoặc chưa push, bản mới nhất chưa lên remote.', 'warn') : ''}
      <div class="tk-actions"><button class="btn go vw-sm" data-jira-done><i class="ph ph-check"></i>Đánh Done</button><button class="btn ghost vw-sm" data-ask="">Huỷ</button></div></div>`;
  }

  function milestoneStrip(issue) {
    const ms = realMilestones(issue).sort((a, b) => a[1].localeCompare(b[1]));
    if (!ms.length) return '';
    return `<ol class="tk-ms">${ms.map(([name, date], i) => {
      const days = daysUntil(date, st.today);
      const cls = days < 0 ? 'past' : days === 0 ? 'today' : `t-${toneByDays(days)}`;
      return `<li class="${cls} vw-in" style="--i:${i}"><span class="mono">${shortDate(date)}</span><b>${esc(MILESTONE[name] ?? name)}</b><small class="mono">${days < 0 ? `${-days}d trước` : days ? `còn ${days}d` : 'hôm nay'}</small></li>`;
    }).join('')}</ol>`;
  }

  function pane() {
    const d = drawer.data;
    if (drawer.tab === 'brief') return drawer.brief === null ? skeleton(8) : drawer.brief;
    if (drawer.tab === 'design') return designPane(d);
    if (drawer.tab === 'gate') return gatePane(d.gate);
    if (drawer.tab === 'git') return gitPane(d.activity);
    if (drawer.tab === 'handoff') return handoffPane();
    return overviewPane(d);
  }

  function overviewPane(d) {
    const issue = d.issue;
    const brief = `agent-auto/tasks/${d.key}/brief.md`;
    const design = `agent-auto/designs/${d.key}`;
    const repos = st.config?.repos ?? {};
    const sheet = Array.isArray(issue.bugSheets) ? issue.bugSheets[0] : null;
    const chips = [
      `<button class="tk-chip" data-open="finder" data-target="${esc(`${st.paths.tasks}/${d.key}`)}"><i class="ph ph-folder"></i>tasks/${esc(d.key)}</button>`,
      d.files.designDir ? `<button class="tk-chip" data-open="finder" data-target="${esc(`${st.paths.designs}/${d.key}`)}"><i class="ph ph-images"></i>designs/${esc(d.key)}</button>` : '',
      d.files.questions ? `<button class="tk-chip" data-open="vscode" data-target="${esc(`${st.paths.tasks}/${d.key}/questions-for-pm.md`)}"><i class="ph ph-question"></i>questions-for-pm.md</button>` : '',
      d.dist ? `<span class="tk-chip static mono" title="Folder làm việc (${esc(d.dist.repo)})"><i class="ph ph-code"></i>${esc(d.dist.sub)}</span>` : '',
      issue.promoFolder && repos['gt-promotion-template'] ? `<button class="tk-chip" data-open="vscode" data-target="${esc(`${repos['gt-promotion-template']}/${issue.promoFolder}`)}"><i class="ph ph-package"></i>${esc(issue.promoFolder)}</button>` : '',
      issue.designLink || issue.design?.link ? `<a class="tk-chip" href="${esc(issue.designLink || issue.design.link)}" target="_blank" rel="noopener"><i class="ph ph-cloud"></i>Link design gốc</a>` : '',
    ].filter(Boolean).join('');
    return `<div class="tk-ov">
      ${issue.note || issue.lastAction ? `<div class="tk-notes">${issue.note ? `<p><i class="ph ph-note"></i>${esc(issue.note)}</p>` : ''}${issue.lastAction ? `<p class="last"><i class="ph ph-clock-counter-clockwise"></i>${esc(issue.lastAction)}</p>` : ''}</div>` : ''}
      ${deliveryBlock()}
      <h3 class="vw-h2"><i class="ph ph-terminal"></i>Lệnh dev (chép và mở CLI)</h3>
      <div class="tk-actions">
        <button class="btn vw-sm" data-draft="/code-developer full ${esc(brief)} · design ${esc(design)}"><i class="ph ph-play"></i>dev full</button>
        <button class="btn vw-sm" data-draft="/code-developer fix ${esc(brief)} · design ${esc(design)}"><i class="ph ph-wrench"></i>dev fix</button>
        <button class="btn ghost vw-sm" data-draft="/code-developer check ${esc(brief)} · design ${esc(design)}"><i class="ph ph-ruler"></i>check</button>
        ${sheet ? `<button class="btn ghost vw-sm" data-draft="/bug-fixer-lite ${esc(sheet)}"><i class="ph ph-bug"></i>fix buglist</button>` : ''}
      </div>
      <h3 class="vw-h2"><i class="ph ph-folders"></i>File và folder</h3>
      <div class="tk-chips">${chips}</div>
    </div>`;
  }

  function deliveryBlock() {
    const dv = drawer.delivery;
    if (!dv || dv.state === 'n/a') return '';
    const head = '<h3 class="vw-h2"><i class="ph ph-package"></i>Bàn giao promotion</h3>';
    const recheck = '<button class="btn ghost vw-sm" data-recheck><i class="ph ph-magnifying-glass"></i>Soi lại</button>';
    if (dv.loading) return `${head}${note('ph-circle-notch vw-spin', 'Đang soi repo gt-promotion (có git fetch, vài giây)...')}`;
    if (dv.state !== 'delivered') return `${head}${note('ph-warning', esc(dv.message || 'Chưa bàn giao.'), 'warn')}<div class="tk-actions">${recheck}</div>`;
    const done = dv.jira?.statusCategory === 'done';
    const action = done
      ? pill('ok', `<i class="ph ph-check"></i>Jira đã ở ${esc(dv.jira.status)}`)
      : dv.jiraError
        ? note('ph-warning', esc(dv.jiraError), 'warn')
        : '<button class="btn vw-sm" data-ask="jira"><i class="ph ph-check-circle"></i>Đánh Done trên Jira</button>';
    return `${head}<div class="tk-deliv">
      <div>${pill('ok', '<i class="ph ph-cloud-check"></i>đã push')} <code class="mono">${esc(dv.commit ?? '')}</code> <span class="mono">${esc(stamp(dv.at))}</span></div>
      <div class="mono">${dv.url ? `<a href="${esc(dv.url)}" target="_blank" rel="noopener">${esc(dv.promoFolder)}/mainsite</a>` : esc(`${dv.promoFolder}/mainsite`)} · ${esc((dv.files ?? []).join(', '))}</div>
      ${dv.dirty ? note('ph-warning', esc(dv.message), 'warn') : ''}
      ${dv.fetched === false ? note('ph-warning', 'Không fetch được remote, đang soi bản origin cũ trên máy.', 'warn') : ''}
      <div class="tk-actions">${action}${recheck}</div></div>`;
  }

  function designPane(d) {
    if (!d.images.length) return note('ph-image-broken', `Chưa có ảnh trong <code>designs/${esc(d.key)}/</code>.`);
    return `<div class="tk-gallery">${d.images.map((im, i) => `<button class="tk-thumb vw-in" style="--i:${i}" data-img="${i}" title="${esc(im.name)}">
      <img src="${esc(im.url)}" alt="${esc(im.name)}" loading="lazy"><span>${esc(im.name.replace(/\.[a-z]+$/i, ''))}</span></button>`).join('')}</div>`;
  }

  function gatePane(gate) {
    if (!gate) return note('ph-shield', 'Chưa chạy fe-gate cho ticket này. Bấm <b>Chạy cổng</b> ở trên. Chưa chạy không có nghĩa là không lỗi.');
    const s = gate.scanned ?? {};
    return `<div class="tk-gatehead">${pill(gate.pass ? 'ok' : 'crit', `<i class="ph ph-shield-${gate.pass ? 'check' : 'warning'}"></i>${gate.pass ? 'PASS' : 'FAIL'}`)}
      <span class="mono">${gate.counts.error} ERROR · ${gate.counts.warn} WARN</span>
      <span class="mono dim">${s.css ?? 0} css · ${s.html ?? 0} html · ${s.fontFaces ?? 0} font · ${s.refs ?? 0} ref · ${esc(stamp(gate.at))}</span></div>
      ${gate.findings.length ? `<ul class="tk-findings">${gate.findings.map((f, i) => `<li class="vw-in ${f.level === 'ERROR' ? 'err' : ''}" style="--i:${i}"><b class="mono">${esc(f.check)}</b><span>${esc(f.message)}</span>${f.where ? `<code>${esc(f.where)}</code>` : ''}</li>`).join('')}</ul>` : note('ph-check-circle', 'Không có finding nào.')}`;
  }

  function gitPane(act) {
    if (!act?.linked) return note('ph-link-break', 'Ticket chưa gắn folder. Dùng <code>/daily link</code>.');
    const list = (act.commitList ?? []).slice(0, 20);
    return `<div class="tk-gitsum mono">${act.commits} commit · ${act.activeDays} ngày có việc · <span class="tk-plus">+${act.sourceAdded}</span> <span class="tk-minus">-${act.sourceRemoved}</span></div>
      ${list.length ? `<ul class="tk-commits">${list.map((c, i) => `<li class="vw-in" style="--i:${i}"><span class="mono h">${esc(c.hash)}</span><span class="mono d">${esc(c.date)}</span><span class="s">${esc(c.subject)}</span><span class="mono n">+${c.sourceAdded}/-${c.sourceRemoved}</span></li>`).join('')}</ul>` : note('ph-git-commit', 'Chưa có commit nào trong folder đã gắn.')}`;
  }

  function handoffPane() {
    const items = drawer.handoff.items;
    return `<ul class="tk-handoff">${items.map((it, i) => `<li class="vw-in ${it.done ? 'done' : ''}" style="--i:${i}"><label><input type="checkbox" data-handoff="${i}" ${it.done ? 'checked' : ''}><span>${esc(it.text)}</span></label></li>`).join('')}</ul>`;
  }

  async function loadBrief() {
    const key = drawer.key;
    let html;
    try {
      html = `<div class="md tk-brief">${markdown(await ctx.api(`brief/${encodeURIComponent(key)}`))}</div>`;
    } catch (e) {
      html = note('ph-file-x', `${esc(e.message)}. Chạy <code>/daily prep ${esc(key)}</code> để tạo brief.`);
    }
    if (drawer?.key !== key) return;
    drawer.brief = html;
    if (drawer.tab === 'brief') $('#tkPane').innerHTML = html;
  }

  async function post(path, body, okText) {
    try {
      const out = await ctx.api(path, { method: 'POST', body });
      if (okText) ctx.toast(typeof okText === 'function' ? okText(out) : okText);
      return out;
    } catch (e) {
      ctx.toast(e.message, true);
      return null;
    }
  }

  async function runGate(btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-circle-notch vw-spin"></i>Đang chạy cổng';
    const out = await post(`gate/run/${encodeURIComponent(drawer.key)}`, {}, (o) => (o.report.pass ? `Cổng PASS · ${o.report.counts.warn} warn` : `Cổng FAIL · ${o.report.counts.error} lỗi`));
    if (!out || !drawer) return renderDrawer();
    drawer.data.gate = out.report;
    drawer.tab = 'gate';
    renderDrawer();
    loadExtras();
  }

  async function finish(to) {
    const { key } = drawer;
    const out = await post(`ticket/${encodeURIComponent(key)}/finish`, { to, expectPhase: drawer.data.issue.phase }, `${key} chuyển sang ${phaseOf(to).label}`);
    if (out) openDrawer(key);
    loadState();
  }

  function openLightbox(i) {
    drawer.img = i;
    $('#tkLbox').classList.add('show');
    renderLightbox();
  }
  function closeLightbox() {
    $('#tkLbox').classList.remove('show');
    if (drawer) drawer.compare = false;
  }
  function stepImage(delta) {
    const n = drawer.data.images.length;
    drawer.img = (drawer.img + delta + n) % n;
    renderLightbox();
  }

  function renderLightbox() {
    const d = drawer.data;
    const im = d.images[drawer.img];
    const vp = MOBILE_NAME.test(im.name.replace(/\.[a-z]+$/i, '')) ? 'mb' : 'pc';
    $('#tkLbox').innerHTML = `<header><span>${esc(im.name)} · ${drawer.img + 1}/${d.images.length}</span>
        ${d.dist ? `<button class="btn ghost vw-sm ${drawer.compare ? 'on' : ''}" data-compare><i class="ph ph-columns"></i>${drawer.compare ? 'Chỉ xem design' : `So với dist ${VIEWPORT_WIDTH[vp]}px`}</button>` : ''}
        <button class="vw-x" data-step="-1" aria-label="Ảnh trước"><i class="ph ph-caret-left"></i></button>
        <button class="vw-x" data-step="1" aria-label="Ảnh sau"><i class="ph ph-caret-right"></i></button>
        <button class="vw-x" data-lclose aria-label="Đóng"><i class="ph ph-x"></i></button></header>
      <div class="body tk-stage ${drawer.compare ? 'cmp' : ''}">
        <div class="tk-lpane" id="tkDesignPane"><img src="${esc(im.url)}" alt="${esc(im.name)}"></div>
        ${drawer.compare ? `<div class="tk-lpane" id="tkDistPane"><iframe id="tkFrame" src="/preview/${esc(d.key)}/" title="dist của ${esc(d.key)}"></iframe></div>` : ''}
      </div>`;
    if (!drawer.compare) return;
    const pane = $('#tkDistPane');
    const frame = $('#tkFrame');
    const width = VIEWPORT_WIDTH[vp];
    const scale = pane.clientWidth / width;
    Object.assign(frame.style, { width: `${width}px`, height: `${Math.round(pane.clientHeight / scale)}px`, transform: `scale(${scale})` });
    $('#tkDesignPane').onscroll = (e) => {
      const ratio = e.target.scrollTop / Math.max(1, e.target.scrollHeight - e.target.clientHeight);
      const win = frame.contentWindow;
      win.scrollTo(0, ratio * Math.max(1, win.document.documentElement.scrollHeight - win.innerHeight));
    };
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const fold = t.closest('[data-fold]');
    const foldAll = t.closest('[data-fold-all]');
    if (fold || foldAll) {
      if (fold) collapsed.has(fold.dataset.fold) ? collapsed.delete(fold.dataset.fold) : collapsed.add(fold.dataset.fold);
      else if (foldAll.dataset.foldAll === 'close') GROUP_ORDER.forEach((label) => collapsed.add(label));
      else collapsed.clear();
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
      } catch {}
      return renderList();
    }
    const rowEl = t.closest('.tk-row');
    if (rowEl) return openDrawer(rowEl.dataset.key);
    if (t.closest('#tkReload')) return Promise.all([loadState(), loadExtras()]);
    if (t.closest('#tkVeil') || t.closest('[data-close]')) return closeDrawer();
    if (t.closest('[data-lclose]')) return closeLightbox();
    if (!drawer) return;
    const tab = t.closest('[data-tab]');
    if (tab) {
      drawer.tab = tab.dataset.tab;
      return renderDrawer();
    }
    const img = t.closest('[data-img]');
    if (img) return openLightbox(Number(img.dataset.img));
    const step = t.closest('[data-step]');
    if (step) return stepImage(Number(step.dataset.step));
    if (t.closest('[data-compare]')) {
      drawer.compare = !drawer.compare;
      return renderLightbox();
    }
    if (t.closest('[data-cli]')) return ctx.openTerminal('claude', drawer.key);
    if (t.closest('[data-prep]')) return ctx.openTerminal(`claude "/daily prep ${drawer.key}"`, `prep ${drawer.key}`);
    const draftBtn = t.closest('[data-draft]');
    if (draftBtn) return draft(ctx, draftBtn.dataset.draft, drawer.key);
    if (t.closest('[data-run-autopilot]')) {
      const out = await post('autopilot/run', { input: drawer.key }, 'Đã gửi autopilot, xem tiến độ ở màn Autopilot.');
      return out && ctx.go('autopilot');
    }
    const gateBtn = t.closest('[data-gate]');
    if (gateBtn) return runGate(gateBtn);
    const ask = t.closest('[data-ask]');
    if (ask) {
      drawer.confirm = ask.dataset.ask || null;
      return renderDrawer();
    }
    const fin = t.closest('[data-finish]');
    if (fin) return finish(fin.dataset.finish);
    if (t.closest('[data-reopen]')) {
      const key = drawer.key;
      const out = await post(`ticket/${encodeURIComponent(key)}/reopen`, {}, (o) => `${key} đã trả về ${phaseOf(o.to).label}`);
      if (out) openDrawer(key);
      return loadState();
    }
    if (t.closest('[data-recheck]')) return loadDelivery();
    const jiraBtn = t.closest('[data-jira-done]');
    if (jiraBtn) {
      jiraBtn.disabled = true;
      const out = await post(`jira/done/${encodeURIComponent(drawer.key)}`, { expectUpdated: drawer.delivery?.jira?.updated }, (o) => (o.already ? o.message : `Đã chuyển ${drawer.key}: ${o.from} sang ${o.status}`));
      drawer.confirm = null;
      return out ? loadDelivery() : renderDrawer();
    }
    const open = t.closest('[data-open]');
    if (open) return post('open', { app: open.dataset.open, target: open.dataset.target });
  });

  el.addEventListener('change', async (e) => {
    const box = e.target.closest('[data-handoff]');
    if (!box) return;
    const item = drawer.handoff.items[Number(box.dataset.handoff)];
    const done = box.checked;
    const expectText = done ? `- [ ] ${item.text}` : `- [x] ~~${item.text}~~`;
    box.disabled = true;
    const out = await post(`handoff/${encodeURIComponent(drawer.key)}/check`, { text: item.text, done, expectText });
    drawer.handoff = await ctx.api(`handoff/${encodeURIComponent(drawer.key)}`).catch(() => drawer.handoff);
    if (!out) box.checked = !done;
    renderDrawer();
  });

  $('#tkFilter').addEventListener('input', (e) => {
    filter = e.target.value;
    renderList();
  });

  const onKey = (e) => {
    if (e.key === 'Enter' && e.target.matches?.('.tk-row')) return openDrawer(e.target.dataset.key);
    if (!drawer) return;
    const lbox = $('#tkLbox').classList.contains('show');
    if (e.key === 'Escape') return lbox ? closeLightbox() : closeDrawer();
    if (lbox && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) stepImage(e.key === 'ArrowLeft' ? -1 : 1);
  };
  document.addEventListener('keydown', onKey);

  loadState().then(() => ctx.param && openDrawer(ctx.param));
  loadExtras();
  const stateTimer = setInterval(loadState, STATE_REFRESH_MS);
  const extraTimer = setInterval(loadExtras, EXTRA_REFRESH_MS);
  return () => {
    clearInterval(stateTimer);
    clearInterval(extraTimer);
    document.removeEventListener('keydown', onKey);
  };
}
