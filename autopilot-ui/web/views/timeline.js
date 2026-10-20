import { esc } from '../lib.js';
import { PHASE, phaseOf, MILESTONE, daysUntil, shortDate, toneByDays, realMilestones, nextMilestone, settler, skeleton, note, errNote, pill } from './_kit.js';

const DAYS_AHEAD = 28;
const DAY_COUNT = DAYS_AHEAD + 1;
const WEEK_DAYS = 7;
const REFRESH_MS = 20000;
const HIDDEN = ['reassigned', 'closed'];
const DONE_FE = 'done-fe';
const KEY_MARKS = ['html', 'deliver'];
const PHASE_ORDER = ['waiting-design', 'ready', 'coding', 'bugfix', 'deliver', 'wait-test', DONE_FE];
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MODE_KEY = 'lc.mode';

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'board' ? 'board' : 'timeline';
  } catch {
    return 'timeline';
  }
}

const MARKUP = `<div class="page-pad lc">
  <header class="vw-head">
    <div><h1>Lịch</h1><div class="vw-sub mono" id="lcSub">&nbsp;</div></div>
    <div class="vw-tools">
      <div class="lc-seg" role="tablist">
        <button data-mode="timeline" role="tab"><i class="ph ph-chart-bar-horizontal"></i>Timeline</button>
        <button data-mode="board" role="tab"><i class="ph ph-kanban"></i>Board</button>
      </div>
      <button class="btn ghost vw-sm" data-sync-jira title="Mở tab claude chạy /daily delta — quét thay đổi trên Jira, board tự cập nhật khi xong"><i class="ph ph-cloud-arrow-down"></i>Đồng bộ Jira</button>
      <button class="btn ghost vw-sm" id="lcReload"><i class="ph ph-arrows-clockwise"></i>Làm mới</button>
    </div>
  </header>
  <div id="lcBody">${skeleton(10)}</div>
</div>`;

export function mount(el, ctx) {
  el.innerHTML = MARKUP;
  const $ = (s) => el.querySelector(s);
  const settle = settler(el.firstElementChild);
  let mode = loadMode();
  let st = null;
  let stateError = null;
  let forecasts = {};

  async function load() {
    const [state, learn] = await Promise.allSettled([ctx.api('state'), ctx.api('learn')]);
    if (state.status === 'fulfilled') [st, stateError] = [state.value, null];
    else stateError = state.reason;
    if (learn.status === 'fulfilled') forecasts = learn.value.forecasts ?? {};
    render();
    if (st) settle();
  }

  const futureMilestones = (issue) => realMilestones(issue).filter(([, date]) => daysUntil(date, st.today) >= 0);
  const phaseRank = (phase) => (PHASE_ORDER.includes(phase) ? PHASE_ORDER.indexOf(phase) : PHASE_ORDER.length);
  const soonest = (issue) => nextMilestone(issue, st.today)?.days ?? Infinity;
  const byLifecycle = (a, b) => phaseRank(a[1].phase) - phaseRank(b[1].phase) || soonest(a[1]) - soonest(b[1]);

  function onCalendar([key, issue]) {
    if (HIDDEN.includes(issue.phase)) return false;
    if (futureMilestones(issue).length) return true;
    if (issue.phase === DONE_FE) return false;
    return !realMilestones(issue).length || Boolean(forecastOf(key, issue));
  }

  function taskGroups() {
    const issues = st.state.issues ?? {};
    const kept = Object.entries(issues).filter(onCalendar);
    const keptKeys = new Set(kept.map(([k]) => k));
    const taskKeys = new Set(kept.map(([key, i]) => (issues[i.parent] ? i.parent : key)));
    return [...taskKeys]
      .map((key) => ({
        top: [key, issues[key]],
        subs: kept.filter(([, i]) => i.parent === key).sort(byLifecycle),
        context: !keptKeys.has(key),
      }))
      .sort((a, b) => byLifecycle(a.top, b.top));
  }

  function forecastOf(key, issue) {
    const fc = forecasts[key];
    if (!fc || issue.phase === DONE_FE || fc.date < st.today) return null;
    const next = nextMilestone(issue, st.today);
    return { ...fc, late: Boolean(next && fc.date > next.date) };
  }

  function rowLabel(key, issue, isSub) {
    const phase = phaseOf(issue.phase);
    const fc = forecastOf(key, issue);
    return `<span class="lc-name">${isSub ? '<i class="ph ph-arrow-elbow-down-right lc-subicon"></i>' : ''}<b class="mono">${esc(key)}</b>${pill(phase.tone, `<i class="ph ${phase.icon}"></i>${esc(phase.label)}`)}</span>
      <span class="lc-sum" title="${esc(issue.summary ?? '')}">${esc(issue.summary || '--')}</span>
      ${fc?.late ? `<span class="lc-fcnote t-crit" title="Dự báo từ lead time thật, ${fc.samples} mẫu"><i class="ph ph-crystal-ball"></i>dự báo xong phase ${shortDate(fc.date)}, trễ hơn mốc kế</span>` : ''}`;
  }

  function rowTrack(key, issue) {
    const byDay = new Map();
    for (const [name, date] of futureMilestones(issue).sort((x, y) => x[1].localeCompare(y[1]))) {
      const col = daysUntil(date, st.today);
      const peer = byDay.get(col);
      if (!peer) byDay.set(col, { col, date, name, names: [name] });
      else {
        peer.names.push(name);
        if (KEY_MARKS.includes(name)) peer.name = name;
      }
    }
    const marks = [...byDay.values()];
    const fc = forecastOf(key, issue);
    const fcCol = fc ? daysUntil(fc.date, st.today) : DAY_COUNT;
    const fcMark = fcCol < DAY_COUNT ? `<span class="lc-fc ${fc.late ? 't-crit' : 't-run'}" style="grid-column:${fcCol + 2}" title="Dự báo xong phase ${shortDate(fc.date)} (${fc.samples} mẫu)"></span>` : '';
    if (!marks.length) return fcMark || '<span class="lc-empty" style="grid-column:2 / span 8">chưa có mốc</span>';
    const visible = marks.filter((m) => m.col < DAY_COUNT);
    const ahead = marks.filter((m) => m.col >= DAY_COUNT);
    const first = marks[0].col;
    const last = Math.min(marks.at(-1).col, DAY_COUNT - 1);
    const tone = phaseOf(issue.phase).tone;
    const bar = first <= last ? `<span class="lc-bar t-${tone} ${ahead.length ? 'cut-r' : ''}" style="grid-column:${first + 2} / ${last + 3}; --span:${last - first + 1}"></span>` : '';
    let prev = null;
    const dots = visible.map((m) => {
      m.up = Boolean(prev && m.col - prev.col <= 1 && !prev.up);
      prev = m;
      const label = MILESTONE[m.name] ?? m.name;
      const others = m.names.filter((n) => n !== m.name).map((n) => MILESTONE[n] ?? n);
      return `<span class="lc-mk t-${toneByDays(m.col)} ${KEY_MARKS.includes(m.name) ? 'key' : ''} ${m.up ? 'up' : ''} ${m.col ? '' : 'edge'}" style="grid-column:${m.col + 2}" title="${esc(`${[label, ...others].join(' + ')} ${shortDate(m.date)}, ${m.col ? `còn ${m.col} ngày` : 'hôm nay'}`)}"><b>${esc(label)}${others.length ? ` +${others.length}` : ''}</b></span>`;
    }).join('');
    const aheadChip = ahead.length ? `<span class="lc-off" style="grid-column:-5 / -1" title="${esc(ahead.map((m) => `${MILESTONE[m.name] ?? m.name} ${shortDate(m.date)}`).join(', '))}">${esc(MILESTONE[ahead[0].name] ?? ahead[0].name)} ${shortDate(ahead[0].date)}${ahead.length > 1 ? ` +${ahead.length - 1}` : ''}<i class="ph ph-arrow-right"></i></span>` : '';
    return bar + fcMark + dots + aheadChip;
  }

  function renderTimeline() {
    const entries = taskGroups().flatMap((g) => [{ entry: g.top, context: g.context }, ...g.subs.map((entry) => ({ entry, isSub: true }))]);
    if (!entries.length) return note('ph-calendar-blank', 'Không có ticket nào còn mốc phía trước.');
    const days = Array.from({ length: DAY_COUNT }, (_, i) => {
      const d = new Date(`${addDays(st.today, i)}T00:00:00`);
      return { dom: d.getDate(), month: d.getMonth() + 1, dow: d.getDay(), weekend: d.getDay() % 6 === 0, today: i === 0 };
    });
    const dayCls = (d) => `${d.weekend ? 'we' : ''} ${d.today ? 'now' : ''} ${d.dow === 1 ? 'mon' : ''}`;
    const head = `<div class="lc-row lc-head" style="grid-row:1"><span class="lc-label lc-corner">Ticket</span>${days.map((d, i) => `<span class="lc-day ${dayCls(d)}" style="grid-column:${i + 2}">
      <em>${i === 0 || d.dom === 1 ? `Th${d.month}` : ''}</em><small>${d.today ? 'Hôm nay' : WEEKDAY[d.dow]}</small><b class="mono">${d.dom}</b></span>`).join('')}</div>`;
    const cols = days.map((d, i) => `<span class="lc-col ${dayCls(d)}" style="grid-column:${i + 2}"></span>`).join('');
    const rows = entries.map(({ entry: [key, issue], context, isSub }, i) => `<div class="lc-row vw-in ${issue.phase === DONE_FE || context ? 'dim' : ''} ${context ? 'ctx' : ''} ${isSub ? 'sub' : ''}" style="grid-row:${i + 2}; --i:${i}" data-key="${esc(key)}" tabindex="0" role="button" aria-label="Mở ${esc(key)}">
        <span class="lc-label">${rowLabel(key, issue, isSub)}</span>${context ? '' : rowTrack(key, issue)}</div>`).join('');
    const legend = `<div class="lc-legend">
      <span><i class="lc-lg key"></i>HTML / Giao HTML</span><span><i class="lc-lg"></i>Mốc khác</span><span><i class="lc-lg fc"></i>Dự báo xong phase</span>
      <span class="t-crit"><i class="lc-lg sw"></i>≤ 4 ngày</span><span class="t-warn"><i class="lc-lg sw"></i>≤ 8 ngày</span><span class="t-ok"><i class="lc-lg sw"></i>xa hơn</span>
      <span><i class="lc-lg bar"></i>Thanh màu theo phase</span></div>`;
    return `${legend}<div class="lc-frame"><div class="lc-grid" style="--days:${DAY_COUNT}; grid-template-rows:repeat(${entries.length + 1}, auto)">${cols}${head}${rows}</div></div>`;
  }

  function boardCard([key, issue], i, role = '') {
    const next = nextMilestone(issue, st.today);
    const fc = forecastOf(key, issue);
    const due = next ? pill(toneByDays(next.days), `${esc(MILESTONE[next.name] ?? next.name)} ${shortDate(next.date)} · ${next.days ? `${next.days}d` : 'hôm nay'}`) : '<span class="tk-none">chưa có mốc</span>';
    const phase = phaseOf(issue.phase);
    const tag = role === 'sub' ? `<small class="mono">bổ sung của ${esc(issue.parent)}</small>${pill(phase.tone, esc(phase.label))}` : role === 'ctx' ? '<small>task chính</small>' : '';
    return `<div class="lc-card vw-in ${role}" style="--i:${i}" data-key="${esc(key)}" tabindex="0" role="button" aria-label="Mở ${esc(key)}">
      <span class="lc-name"><b class="mono">${esc(key)}</b>${tag}</span>
      <span class="lc-csum">${esc(issue.summary || '--')}</span>
      <span class="lc-cmeta">${due}${fc ? `<span class="lc-fcnote ${fc.late ? 't-crit' : 't-mute'}" title="${fc.samples} mẫu"><i class="ph ph-crystal-ball"></i>${shortDate(fc.date)}</span>` : ''}</span></div>`;
  }

  function renderBoard() {
    const groups = taskGroups();
    const laneOf = (g) => [g.top, ...g.subs].map(([, i]) => i.phase).find((p) => PHASE_ORDER.includes(p));
    let n = 0;
    const cardsOf = (g) => boardCard(g.top, n++, g.context ? 'ctx' : '') + g.subs.map((e) => boardCard(e, n++, 'sub')).join('');
    return `<div class="lc-frame"><div class="lc-board">${PHASE_ORDER.map((id) => {
      const items = groups.filter((g) => laneOf(g) === id);
      return `<section class="lc-lane t-${PHASE[id].tone}"><h2><i class="ph ${PHASE[id].icon}"></i>${esc(PHASE[id].label)}<span class="mono">${items.length}</span></h2>
        <div class="lc-cards">${items.length ? items.map(cardsOf).join('') : '<span class="lc-blank">Trống</span>'}</div></section>`;
    }).join('')}</div></div>`;
  }

  function render() {
    el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    if (stateError && !st) return ($('#lcBody').innerHTML = errNote(stateError));
    if (!st) return;
    const inWeek = Object.values(st.state.issues ?? {})
      .filter((i) => !HIDDEN.includes(i.phase))
      .flatMap((i) => realMilestones(i))
      .filter(([, date]) => daysUntil(date, st.today) >= 0 && daysUntil(date, st.today) < WEEK_DAYS).length;
    $('#lcSub').textContent = `Hôm nay ${shortDate(st.today)} · lịch tới ${shortDate(addDays(st.today, DAYS_AHEAD))} · ${inWeek} mốc trong 7 ngày tới`;
    $('#lcBody').innerHTML = mode === 'board' ? renderBoard() : renderTimeline();
  }

  el.addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      mode = modeBtn.dataset.mode;
      try {
        localStorage.setItem(MODE_KEY, mode);
      } catch {}
      return render();
    }
    if (e.target.closest('#lcReload')) return load();
    const item = e.target.closest('[data-key]');
    if (item) ctx.go('tasks', item.dataset.key);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-key]')) ctx.go('tasks', e.target.dataset.key);
  });

  load();
  const timer = setInterval(load, REFRESH_MS);
  return () => clearInterval(timer);
}
