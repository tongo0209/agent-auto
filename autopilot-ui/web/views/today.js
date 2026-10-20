import { esc } from '../lib.js';
import { inlineMd, shortDate, daysUntil, hhmm, settler, skeleton, note, errNote, pill, draft } from './_kit.js';

const REFRESH_MS = 15000;
const SEEN_KEY = 'console2.deltaSeenAt';
const DELTA_WINDOW_MS = 12 * 3600e3;
const SNOOZE_DAYS = [1, 3];
const CHECK_KINDS = ['need-check', 'debt-check'];
const LEVEL_TONE = { crit: 'crit', warn: 'warn', info: 'mute' };
const ACTION = {
  ticket: ['ph-arrow-square-out', 'Mở ticket'],
  fixbug: ['ph-wrench', 'Fix bug'],
  bugs: ['ph-bug', 'Duyệt bug'],
  review: ['ph-git-diff', 'Xem review'],
  doctor: ['ph-stethoscope', 'Chạy doctor'],
  copy: ['ph-copy', 'Chép tin nhắn'],
};
const DELTA_LABEL = { status: 'status Jira', phase: 'phase', milestone: 'mốc', duedate: 'duedate' };
const RADAR_TEXT = {
  off: () => 'Radar nền đang tắt',
  'off-hours': () => 'Radar ngoài giờ (08 đến 18, T2 đến T6)',
  ok: (r) => `Radar ${hhmm(r.last?.at)} · ${r.last?.changed ? 'có thay đổi' : 'không đổi'}`,
  dead: (r) => `Radar không chạy${r.last ? ` từ ${hhmm(r.last.at)}` : ''}`,
};
const RADAR_TONE = { off: 'mute', 'off-hours': 'run', ok: 'ok', dead: 'crit' };

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MARKUP = `<div class="page-pad td">
  <header class="vw-head">
    <div><h1>Hôm nay</h1><div class="vw-sub mono" id="tdDate">&nbsp;</div></div>
    <div class="vw-tools"><div id="tdRadar"></div>
      <button class="btn ghost vw-sm" data-sync-jira title="Mở tab claude chạy /daily delta — quét thay đổi trên Jira, board tự cập nhật khi xong"><i class="ph ph-cloud-arrow-down"></i>Đồng bộ Jira</button>
      <button class="btn ghost vw-sm" id="tdReload"><i class="ph ph-arrows-clockwise"></i>Làm mới</button></div>
  </header>
  <div class="vw-kpis" id="tdKpis">${skeleton(2)}</div>
  <div id="tdDelta"></div>
  <div class="td-grid">
    <section id="tdQueue">${skeleton(8)}</section>
    <aside class="td-side">
      <section class="vw-card"><h2><i class="ph ph-hand-pointing"></i>Cần bạn <span class="mono" id="tdBoardDate"></span></h2>
        <div id="tdNeed">${skeleton(3)}</div>
        <form class="vw-add" data-section="Cần bạn"><input placeholder="Thêm việc cần bạn" aria-label="Thêm việc Cần bạn" maxlength="500"><button class="btn vw-sm"><i class="ph ph-plus"></i>Thêm</button></form>
      </section>
      <section class="vw-card"><h2><i class="ph ph-siren"></i>Cảnh báo <span class="mono" id="tdAlertCount"></span></h2><div id="tdAlerts">${skeleton(3)}</div></section>
      <section class="vw-card"><h2><i class="ph ph-list-bullets"></i>Log board</h2>
        <form class="vw-add" data-section="Log"><input placeholder="Ghi log, server tự gắn giờ" aria-label="Ghi log" maxlength="500"><button class="btn vw-sm"><i class="ph ph-plus"></i>Ghi</button></form>
        <div id="tdLog">${skeleton(3)}</div>
      </section>
    </aside>
  </div>
</div>`;

export function mount(el, ctx) {
  el.innerHTML = MARKUP;
  const $ = (s) => el.querySelector(s);
  const openRows = new Set();
  let data = {};
  let itemsById = new Map();
  let showLoose = false;
  let deltaOpen = false;

  const seenAt = () => localStorage.getItem(SEEN_KEY) ?? new Date(Date.now() - DELTA_WINDOW_MS).toISOString();

  const settle = settler(el.firstElementChild);

  async function load() {
    const [queue, alerts, debt, radar, delta, state] = await Promise.allSettled([
      ctx.api('queue'),
      ctx.api('alerts'),
      ctx.api('debt'),
      ctx.api('radar'),
      ctx.api(`delta?since=${encodeURIComponent(seenAt())}`),
      ctx.api('state'),
    ]);
    data = { queue, alerts, debt, radar, delta, state };
    render();
    settle();
  }

  function render() {
    const { queue, alerts, debt, radar, delta, state } = data;
    $('#tdDate').textContent = state.value ? `${state.value.today} · board ${state.value.board.boardDate ?? 'chưa có'}` : '';
    renderRadar(radar);
    renderKpis();
    renderDelta(delta);
    if (!el.querySelector('#tdQueue select:focus')) renderQueue(queue);
    renderNeed(state, debt);
    renderAlerts(alerts);
    renderLog(state);
  }

  function renderRadar(r) {
    if (r.status === 'rejected') return ($('#tdRadar').innerHTML = pill('crit', '<i class="ph ph-plugs"></i>Mất kết nối server'));
    const s = r.value;
    $('#tdRadar').innerHTML = `<div class="td-radar t-${RADAR_TONE[s.level] ?? 'mute'}"><i class="ph ph-broadcast"></i><span>${esc(RADAR_TEXT[s.level]?.(s) ?? s.level)}</span>
      <button class="vw-link" data-radar="${s.enabled ? 0 : 1}">${s.enabled ? 'tắt' : 'bật'}</button></div>`;
  }

  function renderKpis() {
    const { queue, alerts, debt, delta } = data;
    const v = (r, fn) => (r.status === 'fulfilled' ? fn(r.value) : '--');
    const crit = v(alerts, (a) => a.items.filter((i) => i.level === 'crit').length);
    const tiles = [
      ['ph-lightning', 'Làm ngay', v(queue, (q) => q.now.length), v(queue, (q) => `${q.now.filter((i) => i.level === 'crit').length} gấp`), 'crit'],
      ['ph-siren', 'Cảnh báo gấp', crit, v(alerts, (a) => `${a.items.length} cảnh báo`), crit ? 'crit' : 'ok'],
      ['ph-hourglass', 'Đang chờ', v(queue, (q) => q.waiting.length), 'chờ người khác', 'run'],
      ['ph-archive-box', 'Nợ Cần bạn', v(debt, (d) => d.counts.dropped), v(debt, (d) => `${d.counts.tickets} ticket còn nợ`), 'warn'],
      ['ph-broadcast', 'Thay đổi mới', v(delta, (d) => d.items.reduce((n, i) => n + i.changes.length, 0)), `từ ${hhmm(seenAt())}`, 'run'],
    ];
    $('#tdKpis').innerHTML = tiles.map(([icon, label, value, sub, tone], i) => `<div class="vw-kpi t-${tone} vw-in" style="--i:${i}">
      <span class="lbl"><i class="ph ${icon}"></i>${label}</span><b class="mono">${value}</b><small>${esc(sub)}</small></div>`).join('');
  }

  function renderDelta(r) {
    if (r.status === 'rejected') return ($('#tdDelta').innerHTML = '');
    const items = r.value.items;
    const count = items.reduce((n, i) => n + i.changes.length, 0);
    if (!count) return ($('#tdDelta').innerHTML = '');
    const change = (c) => `${c.sub ? `<b>bổ sung ${esc(c.sub)}:</b> ` : ''}${DELTA_LABEL[c.type] ?? c.type}${c.name ? ` ${esc(c.name)}` : ''} <span class="mono">${esc(c.from ?? '--')}</span> <i class="ph ph-arrow-right"></i> <span class="mono">${esc(c.to ?? '--')}</span>`;
    $('#tdDelta').innerHTML = `<div class="td-delta ${deltaOpen ? 'open' : ''}">
      <button class="td-delta-bar" data-delta-toggle><i class="ph ph-broadcast"></i><b>${count} thay đổi</b><span>Jira và phase từ ${hhmm(seenAt())}</span><i class="ph ph-caret-down caret"></i></button>
      <div class="td-delta-list">${items.map((i, n) => `<div class="vw-in" style="--i:${n}"><button class="vw-key" data-ticket="${esc(i.key)}">${esc(i.key)}</button>${i.changes.map(change).join('<span class="dot">·</span>')}</div>`).join('')}
        <button class="btn ghost vw-sm" data-delta-seen><i class="ph ph-eye"></i>Đánh dấu đã xem</button></div></div>`;
  }

  function row(item, i, { snoozed = false } = {}) {
    const isCheck = CHECK_KINDS.includes(item.action.kind);
    const lead = isCheck
      ? `<button class="td-box" data-check role="checkbox" aria-checked="false" title="Đánh dấu xong, ghi vào board ${esc(item.action.date)}"><i class="ph ph-square"></i></button>`
      : `<span class="td-lvl t-${LEVEL_TONE[item.level] ?? 'mute'}"></span>`;
    const key = item.key && !item.text.includes(item.key) ? `<button class="vw-key" data-ticket="${esc(item.key)}">${esc(item.key)}</button>` : '';
    const text = isCheck ? inlineMd(item.text) : (item.reasons ?? [item]).map((r, n) => (n ? `<span class="more">· ${esc(r.text)}</span>` : esc(r.text))).join(' ');
    const age = item.source === 'debt' ? `<span class="td-meta mono">${shortDate(item.date)} · ${item.staleDays} ngày</span>` : '';
    const due = item.due ? `<span class="td-meta mono">${daysUntil(item.due, data.queue.value.today) ? `còn ${daysUntil(item.due, data.queue.value.today)}d` : 'hôm nay'}</span>` : '';
    const [icon, label] = ACTION[item.action.kind] ?? [];
    const act = isCheck || !label ? '' : `<button class="btn ghost vw-sm" data-act><i class="ph ${icon}"></i>${label}</button>`;
    const today = data.queue.value.today;
    const toDue = item.due && item.due > today ? `<option value="due">tới mốc ${shortDate(item.due)}</option>` : '';
    const tail = snoozed
      ? `<span class="td-meta mono">tới ${shortDate(item.snoozedUntil)}</span><button class="btn ghost vw-sm" data-unsnooze><i class="ph ph-alarm"></i>Bỏ hoãn</button>`
      : `${due}${act}<select class="vw-select" data-snooze aria-label="Hoãn dòng này"><option value="">Hoãn</option>${SNOOZE_DAYS.map((d) => `<option value="${d}">${d} ngày</option>`).join('')}${toDue}</select>`;
    return `<li class="td-row vw-in ${openRows.has(item.id) ? 'open' : ''}" data-id="${esc(item.id)}" style="--i:${i}">
      ${lead}<div class="td-text">${key}${age}<span data-expand title="Bấm để xem hết">${text}</span></div><div class="td-tail">${tail}</div></li>`;
  }

  function group(title, icon, list, html, cls = '') {
    return `<section class="td-group ${cls}"><h2><i class="ph ${icon}"></i>${title}<span class="mono">${list.length}</span></h2><ul>${html}</ul></section>`;
  }

  function renderQueue(r) {
    if (r.status === 'rejected') return ($('#tdQueue').innerHTML = errNote(r.reason));
    const q = r.value;
    itemsById = new Map([...q.now, ...q.waiting, ...q.debt, ...q.snoozed].map((i) => [i.id, i]));
    const now = q.now.length ? q.now.map((i, n) => row(i, n)).join('') : `<li>${note('ph-coffee', 'Hết việc phải làm ngay. Xem nhóm chờ hoặc nợ cũ bên dưới.')}</li>`;
    const ticketDebt = q.debt.filter((i) => !i.loose);
    const loose = q.debt.filter((i) => i.loose);
    const debt = [...ticketDebt.map((i, n) => row(i, n)),
      loose.length ? `<li class="td-more"><button class="vw-link" data-loose>${showLoose ? 'Ẩn' : 'Hiện'} ${loose.length} việc không gắn ticket</button></li>` : '',
      ...(showLoose ? loose.map((i, n) => row(i, n)) : [])].join('');
    $('#tdQueue').innerHTML = group('Làm ngay', 'ph-lightning', q.now, now, 'now')
      + (q.waiting.length ? group('Đang chờ người khác', 'ph-hourglass', q.waiting, q.waiting.map((i, n) => row(i, n)).join('')) : '')
      + (q.debt.length ? group('Nợ cũ', 'ph-archive-box', q.debt, debt) : '')
      + (q.snoozed.length ? group('Đã hoãn', 'ph-alarm', q.snoozed, q.snoozed.map((i, n) => row(i, n, { snoozed: true })).join(''), 'snoozed') : '');
  }

  function renderNeed(r, debt) {
    if (r.status === 'rejected') return ($('#tdNeed').innerHTML = errNote(r.reason));
    const { board } = r.value;
    $('#tdBoardDate').textContent = board.boardDate ?? '';
    const stray = debt.value?.stray.find((s) => s.date === board.boardDate);
    $('#tdNeed').innerHTML = (board.needYou.length
      ? `<ul class="td-need">${board.needYou.map((t, i) => {
        const done = /^~~/.test(t.trim());
        return `<li class="vw-in ${done ? 'done' : ''}" style="--i:${i}"><i class="ph${done ? '-fill' : ''} ph-check-square"></i><span>${inlineMd(t)}</span></li>`;
      }).join('')}</ul>`
      : note('ph-check-circle', 'Board hôm nay chưa có việc Cần bạn.'))
      + (stray ? note('ph-warning', `${stray.count} dòng viết lệch vào mục Cần bạn (không phải checklist), bị bỏ qua khi đếm.`, 'warn') : '');
  }

  function renderAlerts(r) {
    if (r.status === 'rejected') return ($('#tdAlerts').innerHTML = errNote(r.reason));
    const items = r.value.items;
    $('#tdAlertCount').textContent = items.length || '';
    $('#tdAlerts').innerHTML = items.length
      ? `<ul class="td-alerts">${items.map((a, i) => `<li class="vw-in" style="--i:${i}"><span class="td-lvl t-${LEVEL_TONE[a.level] ?? 'mute'}"></span>
          <div>${a.key ? `<button class="vw-key" data-ticket="${esc(a.key)}">${esc(a.key)}</button>` : ''}${esc(a.text)}</div></li>`).join('')}</ul>`
      : note('ph-shield-check', 'Không có cảnh báo nào.');
  }

  function renderLog(r) {
    if (r.status === 'rejected') return ($('#tdLog').innerHTML = errNote(r.reason));
    const log = r.value.board.log;
    $('#tdLog').innerHTML = log.length
      ? `<ol class="td-log">${log.slice().reverse().map((l, i) => {
        const [, time, text] = l.match(/^(\d\d:\d\d|HH:MM)\s*[—-]?\s*(.*)$/s) ?? [null, '', l];
        return `<li class="vw-in ${time === 'HH:MM' ? 'notime' : ''}" style="--i:${i}"><span class="mono">${esc(time || '--:--')}</span><span>${inlineMd(text)}</span></li>`;
      }).join('')}</ol>`
      : note('ph-note-blank', 'Chưa có dòng log nào.');
  }

  const itemOf = (node) => itemsById.get(node.closest('[data-id]').dataset.id);

  async function snooze(item, choice) {
    const today = data.queue.value.today;
    const until = choice === null ? null : choice === 'due' ? item.due : addDays(today, Number(choice));
    try {
      await Promise.all((item.reasons ?? [item]).map((r) => ctx.api('queue/snooze', { method: 'POST', body: { id: r.id, until, level: r.level, text: r.text } })));
      ctx.toast(until ? `Đã hoãn tới ${shortDate(until)}` : 'Đã bỏ hoãn');
    } catch (e) {
      ctx.toast(`Không lưu được hoãn: ${e.message}`, true);
    }
    document.activeElement.blur();
    load();
  }

  async function check(item, btn) {
    const { date, index, text } = item.action;
    btn.disabled = true;
    try {
      await ctx.api('board/check', { method: 'POST', body: { date, index, done: true, expectText: text } });
      btn.closest('li').classList.add('done');
      btn.innerHTML = '<i class="ph-fill ph-check-square"></i>';
      ctx.toast(`Đã gạch xong trong board ${date}`);
    } catch (e) {
      ctx.toast(`Không ghi được board ${date}: ${e.message}`, true);
    }
    load();
  }

  function runAction(item, btn) {
    const { action } = item;
    if (action.kind === 'ticket') ctx.go('tasks', action.key);
    if (action.kind === 'bugs') ctx.go('bugs');
    if (action.kind === 'review') ctx.go('review');
    if (action.kind === 'doctor') ctx.openTerminal('claude "/daily doctor"', 'doctor');
    if (action.kind === 'fixbug') draft(ctx, `/bug-fixer-lite ${action.sheetUrl}`, item.key || 'fix bug');
    if (action.kind === 'copy') {
      navigator.clipboard.writeText(action.message).then(
        () => (btn.innerHTML = '<i class="ph ph-check"></i>Đã chép'),
        () => window.prompt('Chép tay tin nhắn này:', action.message),
      );
    }
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const ticket = t.closest('[data-ticket]');
    if (ticket) return ctx.go('tasks', ticket.dataset.ticket);
    if (t.closest('[data-act]')) return runAction(itemOf(t), t.closest('[data-act]'));
    if (t.closest('[data-check]')) return check(itemOf(t), t.closest('[data-check]'));
    if (t.closest('[data-unsnooze]')) return snooze(itemOf(t), null);
    if (t.closest('[data-expand]')) {
      const id = t.closest('[data-id]').dataset.id;
      openRows.has(id) ? openRows.delete(id) : openRows.add(id);
      return t.closest('li').classList.toggle('open', openRows.has(id));
    }
    if (t.closest('[data-loose]')) {
      showLoose = !showLoose;
      return renderQueue(data.queue);
    }
    if (t.closest('[data-delta-toggle]')) {
      deltaOpen = !deltaOpen;
      return $('.td-delta').classList.toggle('open', deltaOpen);
    }
    if (t.closest('[data-delta-seen]')) {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
      deltaOpen = false;
      return load();
    }
    const radar = t.closest('[data-radar]');
    if (radar) {
      radar.disabled = true;
      try {
        await ctx.api('radar/toggle', { method: 'POST', body: { enabled: radar.dataset.radar === '1' } });
      } catch (err) {
        ctx.toast(`Không đổi được radar: ${err.message}`, true);
      }
      return load();
    }
    if (t.closest('#tdReload')) load();
  });

  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-snooze]') && e.target.value) snooze(itemOf(e.target), e.target.value);
  });

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('input');
    const text = input.value.trim();
    if (!text) return input.focus();
    form.querySelector('button').disabled = true;
    try {
      const out = await ctx.api('board/append', { method: 'POST', body: { date: data.state.value?.board.boardDate ?? undefined, section: form.dataset.section, text } });
      input.value = '';
      ctx.toast(`Đã ghi: ${out.line}`);
      load();
    } catch (err) {
      ctx.toast(`Không ghi được board: ${err.message}`, true);
    }
    form.querySelector('button').disabled = false;
  });

  load();
  const timer = setInterval(load, REFRESH_MS);
  return () => clearInterval(timer);
}
