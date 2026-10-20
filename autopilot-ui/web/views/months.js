import { esc } from '../lib.js';
import { JIRA, shortDate, skeleton, note, errNote } from './_kit.js';

const monthLabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(0, 4)}`;

const MARKUP = `<div class="page-pad mo">
  <header class="vw-head">
    <div><h1>Theo tháng</h1><div class="vw-sub mono" id="moSub">&nbsp;</div></div>
    <div class="vw-tools"><button class="btn ghost vw-sm" id="moToggle" hidden></button></div>
  </header>
  <div class="vw-kpis" id="moKpis">${skeleton(2)}</div>
  <section class="vw-card mo-chartcard"><h2><i class="ph ph-chart-bar"></i>Task theo tháng của due date<span class="mono"><i class="mo-lg ok"></i>xong <i class="mo-lg doing"></i>đang hoặc chờ</span></h2><div id="moChart">${skeleton(4)}</div></section>
  <div id="moList">${skeleton(8)}</div>
</div>`;

export function mount(el, ctx) {
  el.innerHTML = MARKUP;
  const $ = (s) => el.querySelector(s);
  let showAll = false;

  async function load() {
    let data;
    try {
      data = await ctx.api(`months${showAll ? '?limit=all' : ''}`);
    } catch (e) {
      $('#moKpis').innerHTML = '';
      $('#moChart').innerHTML = errNote(e);
      return ($('#moList').innerHTML = '');
    }
    render(data);
  }

  function render({ months, generatedAt, source, totalMonths }) {
    $('#moSub').textContent = source === 'jira' ? `Real từ Jira · snapshot ${generatedAt ?? '--'}` : 'Tạm dựng từ state, chạy /daily để lấy snapshot Jira';
    const hidden = (totalMonths ?? months.length) - months.length;
    $('#moToggle').hidden = !hidden && !showAll;
    $('#moToggle').innerHTML = showAll ? '<i class="ph ph-arrows-in-line-horizontal"></i>Chỉ 3 tháng gần nhất' : `<i class="ph ph-arrows-out-line-horizontal"></i>Xem tất cả ${totalMonths} tháng`;
    const total = months.reduce((n, m) => n + m.total, 0);
    const done = months.reduce((n, m) => n + m.done, 0);
    $('#moKpis').innerHTML = [
      ['ph-stack', 'Task', total, 'run'],
      ['ph-check-circle', 'Đã xong', done, 'ok'],
      ['ph-hourglass', 'Đang hoặc chờ', total - done, 'warn'],
      ['ph-percent', 'Tỉ lệ xong', total ? `${Math.round((done / total) * 100)}%` : '--', 'mute'],
    ].map(([icon, label, value, t], i) => `<div class="vw-kpi t-${t} vw-in" style="--i:${i}"><span class="lbl"><i class="ph ${icon}"></i>${label}</span><b class="mono">${value}</b></div>`).join('');
    if (!months.length) {
      $('#moChart').innerHTML = '';
      return ($('#moList').innerHTML = note('ph-calendar-x', 'Chưa có tháng nào được ghi nhận.'));
    }
    const max = Math.max(1, ...months.map((m) => m.total));
    $('#moChart').innerHTML = `<div class="mo-bars">${months.slice().reverse().map((m, i) => `<div class="mo-col" title="${monthLabel(m.month)}: ${m.done} xong, ${m.doing} đang hoặc chờ">
      <b class="mono">${m.total}</b>
      <div class="mo-stack" style="--h:${(m.total / max) * 100}%; --i:${i}"><i class="doing" style="flex:${m.doing}"></i><i class="ok" style="flex:${m.done}"></i></div>
      <span class="mono">${monthLabel(m.month)}</span></div>`).join('')}</div>`;
    $('#moList').innerHTML = months.map((m, i) => `<section class="mo-month vw-in" style="--i:${i}">
      <h2><span class="mono">${monthLabel(m.month)}</span><span class="mo-count">${m.total} task</span>
        <span class="mo-progress" title="${m.done}/${m.total} xong"><i style="width:${m.total ? (m.done / m.total) * 100 : 0}%"></i></span>
        <span class="mono mo-frac">${m.done}/${m.total}</span></h2>
      <div class="mo-issues">${m.issues.map((it) => `<a class="mo-issue ${it.done ? 'done' : ''}" href="${JIRA}/browse/${esc(it.key)}" target="_blank" rel="noopener" title="${esc(it.summary ?? '')}">
        <i class="ph${it.done ? '-fill' : ''} ${it.done ? 'ph-check-circle' : 'ph-circle-dashed'}"></i><b class="mono">${esc(it.key)}</b><span class="t">${esc(it.summary ?? '')}</span>
        <span class="mono s">${esc(it.status ?? '')}${it.duedate ? ` · ${shortDate(it.duedate)}` : ''}</span></a>`).join('')}</div>
    </section>`).join('');
  }

  $('#moToggle').addEventListener('click', () => {
    showAll = !showAll;
    load();
  });

  load();
}
