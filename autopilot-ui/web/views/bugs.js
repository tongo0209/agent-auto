import { esc } from '../lib.js';
import { JIRA, shortDate, skeleton, note, errNote, pill, draft, settler } from './_kit.js';

const REFRESH_MS = 30000;
const TAB_KEY = 'console2.bugTab';
const HOURS_PER_DAY = 24;
const SUB_TABS = [['following', 'Đang theo dõi'], ['off', 'Chưa theo dõi'], ['closed', 'Task đã đóng']];
const BUCKET = { mine: ['warn', 'của mình'], unknown: ['run', 'chưa rõ của ai'], 'not-mine': ['mute', 'của người khác'] };
const FIX_LABEL = { 'da-fix-chua-ghi-sheet': 'đã fix, chưa ghi sheet', 'da-ghi-sheet': 'đã ghi sheet, chờ QC' };

const day = (iso) => shortDate(String(iso ?? '').slice(0, 10));
const held = (h) => (h === null || h === undefined ? '' : h < 1 ? 'vừa xong' : h < HOURS_PER_DAY ? `treo ${h}h` : `treo ${Math.floor(h / HOURS_PER_DAY)} ngày`);
const searchKey = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function filterSheets(sheets, query) {
  const q = searchKey(query);
  if (!q) return sheets;
  const hits = sheets.filter((s) => s.searchText.includes(q));
  return [...hits.filter((s) => s.searchKeys.includes(q)), ...hits.filter((s) => !s.searchKeys.includes(q))];
}

const keyChips = (keys) => (keys ?? []).map((k) => (k.startsWith('ADHOC-')
  ? `<span class="bg-chip">${esc(k)}</span>`
  : `<a class="vw-key" href="${JIRA}/browse/${esc(k)}" target="_blank" rel="noopener">${esc(k)}</a>`)).join('') || '<span class="bg-chip">ngoài Jira</span>';
const sheetLink = (url) => (url ? `<a class="bg-sheet" href="${esc(url)}" target="_blank" rel="noopener"><i class="ph ph-table"></i>sheet</a>` : '');

const MARKUP = `<div class="page-pad bg">
  <header class="vw-head">
    <div><h1>Bug</h1><div class="vw-sub mono" id="bgSub">&nbsp;</div></div>
    <div class="vw-tools"><button class="btn ghost vw-sm" id="bgReload"><i class="ph ph-arrows-clockwise"></i>Làm mới</button></div>
  </header>
  <div class="vw-kpis" id="bgKpis">${skeleton(2)}</div>
  <div id="bgOpenNote"></div>
  <section id="bgPending"></section>
  <section class="bg-sheets">
    <div class="bg-bar"><nav class="tabs" id="bgTabs"></nav>
      <label class="vw-search"><i class="ph ph-magnifying-glass"></i><input class="vw-input" id="bgFilter" placeholder="Lọc theo mã task, tên buglist" aria-label="Lọc buglist"></label></div>
    <p class="bg-order"><i class="ph ph-info"></i>Thứ tự: Fix bug chạy /bug-fixer-lite, tự verify, rồi Ghi kết quả chạy /daily bugwrite mới ghi lên sheet.</p>
    <div id="bgSheets">${skeleton(8)}</div>
  </section>
</div>`;

export function mount(el, ctx) {
  el.innerHTML = MARKUP;
  const $ = (s) => el.querySelector(s);
  let data = null;
  let tab = localStorage.getItem(TAB_KEY) ?? 'following';
  let filter = '';
  let expanded = null;

  const settle = settler(el.firstElementChild);

  async function load() {
    try {
      data = await ctx.api('bugs', { onFresh: load });
    } catch (e) {
      $('#bgKpis').innerHTML = '';
      $('#bgSheets').innerHTML = errNote(e);
      return;
    }
    render();
    settle();
  }

  function render() {
    const { counts, open, sheets, watching, oldestHeldHours } = data;
    $('#bgSub').textContent = `${watching} sheet đang theo dõi · ${sheets.length} sheet trong sổ`;
    $('#bgKpis').innerHTML = [
      ['ph-bug', 'Chưa fix', open.counts.chuaFix, open.counts.chuaFix ? 'crit' : 'ok'],
      ['ph-pencil-simple-line', 'Đã fix, chưa ghi sheet', open.counts.daFix, open.counts.daFix ? 'warn' : 'ok'],
      ['ph-hourglass', 'Chờ QC confirm', open.counts.choConfirm, 'run'],
      ['ph-hand-pointing', 'Chờ bạn duyệt', counts.total, counts.total ? 'warn' : 'ok'],
    ].map(([icon, label, value, tone], i) => `<div class="vw-kpi t-${tone} vw-in" style="--i:${i}"><span class="lbl"><i class="ph ${icon}"></i>${label}</span><b class="mono">${value}</b></div>`).join('');
    $('#bgOpenNote').innerHTML = open.counts.stale
      ? note('ph-clock-countdown', `${open.counts.stale} bug đọc từ lượt quét cũ, chưa chắc còn đúng. Chờ lượt bugwatch kế tiếp.`, 'warn')
      : watching ? '' : note('ph-eye-slash', 'Chưa theo dõi buglist nào. Bấm Bật theo dõi ở danh sách dưới.');
    $('#bgPending').innerHTML = counts.total ? `<div class="vw-card bg-pending">
      <h2><i class="ph ph-hand-pointing"></i>Chờ bạn duyệt<span class="mono">${counts.verified} đã verify · ${counts.unverified} chưa verify${oldestHeldHours >= HOURS_PER_DAY ? ` · lâu nhất ${held(oldestHeldHours)}` : ''}</span></h2>
      ${pendingGroup('Đã verify, gật là ghi Done', data.pending.verified, true)}
      ${pendingGroup('Chưa verify được, cần mắt bạn', data.pending.unverified, false)}
      <button class="btn vw-sm" data-bugwrite><i class="ph ph-terminal"></i>Ghi kết quả lên sheet</button></div>` : '';
    renderSheets();
  }

  function pendingGroup(title, rows, verified) {
    if (!rows.length) return '';
    return `<h3 class="vw-h2">${title}<span class="mono">${rows.length}</span></h3><div class="bg-list">${rows.map((r, i) => `<article class="bg-bug vw-in ${verified ? 'ok' : 'warn'}" style="--i:${i}">
      <div class="h"><i class="ph ${verified ? 'ph-check-circle' : 'ph-warning'}"></i><b class="mono">#${esc(r.bugId)}</b>${keyChips(r.keys)}${held(r.heldHours) ? pill(r.heldHours >= HOURS_PER_DAY ? 'warn' : 'mute', held(r.heldHours)) : ''}${sheetLink(r.sheetUrl)}</div>
      ${r.desc ? `<p>${esc(r.desc)}</p>` : ''}
      ${r.note ? `<p class="bg-fix"><i class="ph ph-git-commit"></i>${esc(r.note)}</p>` : ''}
      ${verified ? '' : `<p class="bg-why"><i class="ph ph-question"></i><b>Chưa verify được:</b> ${esc(r.whyLabel ?? 'dòng xếp hàng trước khi có cơ chế chấm điểm')}${r.verifyHint ? `. <em>${esc(r.verifyHint)}</em>` : ''}</p>`}
      <small>${esc(r.sheetTitle)}${r.queuedAt ? ` · xếp hàng ${day(r.queuedAt)}` : ''}</small></article>`).join('')}</div>`;
  }

  function openBug(r) {
    const [tone, label] = BUCKET[r.bucket] ?? ['mute', r.bucket];
    return `<article class="bg-bug ${r.stale ? 'stale' : ''}">
      <div class="h"><b class="mono">#${esc(r.bugId)}</b>${pill(tone, label)}${r.status === 'cho-confirm' ? pill('run', 'chờ QC confirm') : ''}${FIX_LABEL[r.fixState] ? pill('ok', FIX_LABEL[r.fixState]) : ''}${r.type ? pill('mute', esc(r.type)) : ''}${sheetLink(r.sheetUrl)}</div>
      ${r.desc ? `<p>${esc(r.desc)}</p>` : ''}
      <small>${r.assignee ? `assignee ${esc(r.assignee)}` : ''}${r.openAt ? ` · đọc ${day(r.openAt)}` : ''}${r.stale ? ' · số liệu cũ' : ''}</small></article>`;
  }

  function sheetRow(s, i) {
    const scan = s.lastScan;
    const moves = scan ? [
      s.chuaFixCount && `${s.chuaFixCount} chưa fix`,
      s.daFixCount && `${s.daFixCount} đã fix, chưa ghi sheet`,
      s.daGhiCount && `${s.daGhiCount} đã ghi sheet, chờ QC`,
      scan.fresh && `${scan.fresh} bug mới lượt trước`,
      scan.changed && `${scan.changed} đổi`,
      scan.reopened?.length && `QC mở lại #${scan.reopened.join(', #')}`,
      scan.notMine && `${scan.notMine} không của mình`,
    ].filter(Boolean).join(' · ') : 'Chưa có lượt quét nào, có từ lượt bugwatch kế tiếp.';
    const following = s.state === 'following';
    const isOpen = expanded === s.sheetId;
    const openRows = data.open.rows.filter((r) => r.sheetId === s.sheetId);
    return `<article class="bg-row vw-in ${isOpen ? 'open' : ''}" style="--i:${i}">
      <button class="bg-row-h" data-expand="${esc(s.sheetId)}" aria-expanded="${isOpen}"><i class="ph ph-caret-right"></i><b>${esc(s.title)}</b>
        ${s.pendingCount ? pill('warn', `${s.pendingCount} chờ duyệt`) : ''}${openRows.length ? pill('run', `${openRows.length} đang mở`) : ''}
        ${s.state === 'retired' ? pill('mute', 'qua mốc release') : ''}${s.state === 'not-buglist' ? pill('mute', 'không phải buglist') : ''}${s.state === 'off' && s.unfollowReason ? pill('mute', esc(s.unfollowReason)) : ''}</button>
      <div class="bg-row-meta">${keyChips(s.keys)}<span>${esc(moves)}${s.lastChangeAt ? ` · QC động ${day(s.lastChangeAt)}` : ''}</span></div>
      ${s.state === 'not-buglist' ? '' : `<div class="bg-row-acts">
        <button class="btn ${following ? 'ghost' : 'go'} vw-sm" data-watch="${esc(s.sheetId)}" data-on="${following ? 0 : 1}"><i class="ph ${following ? 'ph-eye-slash' : 'ph-eye'}"></i>${following ? 'Thôi theo dõi' : 'Bật theo dõi'}</button>
        <button class="btn vw-sm" data-fix="${esc(s.url ?? '')}" ${s.url ? '' : 'disabled'}><i class="ph ph-wrench"></i>Fix bug</button>
        <button class="btn ${s.daFixCount ? '' : 'ghost'} vw-sm" data-bugwrite><i class="ph ph-table"></i>Ghi kết quả${s.daFixCount ? ` (${s.daFixCount})` : ''}</button>
        ${sheetLink(s.url)}</div>`}
      ${isOpen ? `<div class="bg-list">${openRows.map(openBug).join('') || note('ph-check-circle', 'Không có bug đang mở trong lượt quét gần nhất.')}</div>` : ''}
    </article>`;
  }

  function renderSheets() {
    const shown = filterSheets(data.sheets, filter);
    $('#bgTabs').innerHTML = SUB_TABS.map(([id, label]) => `<button class="tab ${id === tab ? 'on' : ''}" data-tab="${id}">${label} <span class="mono">${shown.filter((s) => s.group === id).length}</span></button>`).join('');
    const rows = shown.filter((s) => s.group === tab);
    $('#bgSheets').innerHTML = rows.length ? rows.map(sheetRow).join('') : note('ph-magnifying-glass', filter ? 'Không có kết quả ở khu này, thử khu khác.' : 'Khu này đang trống.');
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('#bgReload')) return load();
    const tabBtn = t.closest('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab;
      localStorage.setItem(TAB_KEY, tab);
      return renderSheets();
    }
    const exp = t.closest('[data-expand]');
    if (exp) {
      expanded = expanded === exp.dataset.expand ? null : exp.dataset.expand;
      return renderSheets();
    }
    if (t.closest('[data-bugwrite]')) return draft(ctx, '/daily bugwrite', 'bugwrite');
    const fix = t.closest('[data-fix]');
    if (fix) return draft(ctx, `/bug-fixer-lite ${fix.dataset.fix}`, 'fix bug');
    const watch = t.closest('[data-watch]');
    if (watch) {
      watch.disabled = true;
      const watching = watch.dataset.on === '1';
      try {
        await ctx.api('bugs/watch', { method: 'POST', body: { sheetId: watch.dataset.watch, watching } });
        ctx.toast(watching ? 'Đã bật theo dõi sheet' : 'Đã thôi theo dõi sheet');
      } catch (err) {
        ctx.toast(`Không đổi được theo dõi: ${err.message}`, true);
      }
      return load();
    }
  });

  $('#bgFilter').addEventListener('input', (e) => {
    filter = e.target.value;
    if (data) renderSheets();
  });

  load();
  const timer = setInterval(load, REFRESH_MS);
  return () => clearInterval(timer);
}
