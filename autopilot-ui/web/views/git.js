import { esc } from '../lib.js';
import { skeleton, note, errNote } from './_kit.js';

const MAX_COMMITS = 80;
const REPO_TONES = ['run', 'ok', 'warn', 'crit', 'mute'];

const monthLabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(0, 4)}`;

const MARKUP = `<div class="page-pad gt">
  <header class="vw-head">
    <div><h1>Git</h1><div class="vw-sub mono" id="gtSub">&nbsp;</div></div>
    <nav class="tabs gt-months" id="gtMonths"></nav>
  </header>
  <div class="vw-kpis" id="gtKpis">${skeleton(2)}</div>
  <div class="gt-grid">
    <div class="gt-main">
      <section class="vw-card"><h2><i class="ph ph-chart-bar"></i>Commit theo ngày <span class="mono" id="gtMerge"></span></h2><div id="gtChart">${skeleton(4)}</div><div class="gt-repos" id="gtRepos"></div></section>
      <section id="gtList">${skeleton(10)}</section>
    </div>
    <aside class="vw-card gt-promo"><h2><i class="ph ph-package"></i>gt-promotion <span class="mono" id="gtPromoCount"></span></h2><div id="gtPromo">${skeleton(6)}</div></aside>
  </div>
</div>`;

export function mount(el, ctx) {
  el.innerHTML = MARKUP;
  const $ = (s) => el.querySelector(s);
  let month = null;
  let loading = false;

  async function loadGit() {
    loading = true;
    el.classList.add('gt-loading');
    $('#gtSub').textContent = 'Đang đọc git log, tháng nhiều commit có thể mất vài giây...';
    let data;
    try {
      data = await ctx.api(`git${month ? `?month=${encodeURIComponent(month)}` : ''}`);
    } catch (e) {
      loading = false;
      el.classList.remove('gt-loading');
      $('#gtSub').textContent = '';
      $('#gtKpis').innerHTML = '';
      $('#gtChart').innerHTML = errNote(e);
      return ($('#gtList').innerHTML = '');
    }
    if (month === null && !data.commits.length && data.months[1]) {
      month = data.months[1];
      return loadGit();
    }
    month = data.month;
    loading = false;
    el.classList.remove('gt-loading');
    render(data);
  }

  function render(data) {
    const { commits } = data;
    $('#gtSub').textContent = `${data.author} · ${commits.length} commit ${monthLabel(data.month)} · ${data.cached ? 'từ cache' : 'vừa đọc git'}`;
    $('#gtMonths').innerHTML = data.months.map((m) => `<button class="tab ${m === data.month ? 'on' : ''}" data-month="${m}">${monthLabel(m)}</button>`).join('');
    const byRepo = {};
    for (const c of commits) byRepo[c.repo] = (byRepo[c.repo] ?? 0) + 1;
    const repos = Object.entries(byRepo).sort((a, b) => b[1] - a[1]);
    const tone = Object.fromEntries(repos.map(([r], i) => [r, REPO_TONES[i % REPO_TONES.length]]));
    const added = commits.reduce((n, c) => n + (c.added ?? 0), 0);
    const removed = commits.reduce((n, c) => n + (c.removed ?? 0), 0);
    const activeDays = new Set(commits.map((c) => c.date.slice(0, 10))).size;
    $('#gtKpis').innerHTML = [
      ['ph-git-commit', 'Commit', commits.length, 'ok'],
      ['ph-calendar-check', 'Ngày có commit', `${activeDays}/${data.daysInMonth}`, 'run'],
      ['ph-plus-minus', 'Dòng thêm / bớt', `<span class="gt-plus">+${added}</span> <span class="gt-minus">-${removed}</span>`, 'warn'],
      ['ph-folders', 'Repo', repos.length, 'mute'],
    ].map(([icon, label, value, t], i) => `<div class="vw-kpi t-${t} vw-in" style="--i:${i}"><span class="lbl"><i class="ph ${icon}"></i>${label}</span><b class="mono">${value}</b></div>`).join('');
    $('#gtMerge').textContent = data.mergeCount ? `${data.mergeCount} merge không tính` : '';
    renderChart(data, tone);
    $('#gtRepos').innerHTML = repos.map(([r, n]) => `<span class="gt-repo t-${tone[r]}"><i></i>${esc(r)} <b class="mono">${n}</b></span>`).join('');
    $('#gtList').innerHTML = commits.length
      ? `<ul class="gt-commits">${commits.slice(0, MAX_COMMITS).map((c, i) => `<li class="vw-in" style="--i:${i}">
          <span class="gt-repo t-${tone[c.repo]}"><i></i>${esc(c.repo)}</span><span class="mono d">${esc(c.date)}</span><span class="mono h">${esc(c.hash)}</span>
          <span class="s">${esc(c.subject)}</span>${c.stat ? `<span class="mono st">${esc(c.stat)}</span>` : ''}</li>`).join('')}</ul>
        ${commits.length > MAX_COMMITS ? note('ph-info', `Hiện ${MAX_COMMITS}/${commits.length} commit mới nhất.`) : ''}`
      : note('ph-git-commit', 'Không có commit nào của bạn trong tháng này.');
  }

  function renderChart(data, tone) {
    const days = Array.from({ length: data.daysInMonth }, (_, i) => ({ day: i + 1, byRepo: {} }));
    for (const c of data.commits) {
      const d = days[Number(c.date.slice(8, 10)) - 1];
      d.byRepo[c.repo] = (d.byRepo[c.repo] ?? 0) + 1;
    }
    const totals = days.map((d) => Object.values(d.byRepo).reduce((a, b) => a + b, 0));
    const max = Math.max(1, ...totals);
    $('#gtChart').innerHTML = `<div class="gt-bars" style="--days:${data.daysInMonth}">${days.map((d, i) => {
      const weekday = new Date(`${data.month}-${String(d.day).padStart(2, '0')}T00:00:00`).getDay();
      return `<div class="gt-col ${weekday === 0 || weekday === 6 ? 'we' : ''}" title="${d.day}/${data.month.slice(5)}: ${totals[i]} commit">
        <div class="gt-stack" style="--h:${(totals[i] / max) * 100}%; --i:${i}">${Object.entries(d.byRepo).map(([r, n]) => `<i class="t-${tone[r]}" style="flex:${n}"></i>`).join('')}</div>
        <span class="mono">${d.day}</span></div>`;
    }).join('')}</div>`;
  }

  async function loadPromo() {
    let data;
    try {
      data = await ctx.api('promotion');
    } catch (e) {
      return ($('#gtPromo').innerHTML = errNote(e));
    }
    if (!data.root) return ($('#gtPromo').innerHTML = note('ph-gear', 'Chưa cấu hình repo gt-promotion-template.'));
    $('#gtPromoCount').textContent = data.items.length || '';
    $('#gtPromo').innerHTML = data.items.length
      ? `<ul class="gt-promolist">${data.items.map((it, i) => `<li class="vw-in" style="--i:${i}">
          <div><button class="vw-key" data-ticket="${esc(it.key)}">${esc(it.key)}</button><span class="mono f" title="${esc(it.folder)}">${esc(it.folder)}</span></div>
          ${it.last ? `<p>${esc(it.last.subject)}</p><small class="mono">${esc(it.last.date)} · ${esc(it.last.author)} · ${esc(it.last.hash)}</small>` : '<small>Chưa có commit nào đụng folder này.</small>'}</li>`).join('')}</ul>`
      : note('ph-package', 'Chưa task nào gắn folder gt-promotion.');
  }

  el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-month]');
    if (m && !loading) {
      month = m.dataset.month;
      return loadGit();
    }
    const ticket = e.target.closest('[data-ticket]');
    if (ticket) ctx.go('tasks', ticket.dataset.ticket);
  });

  loadGit();
  loadPromo();
}
