import { esc } from '../lib.js';
import { inlineMd, markdown, skeleton, note, errNote, pill } from './_kit.js';

const NEED = 'Cần bạn';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isBullet = (line) => line.trim().startsWith('-');
const isChecklist = (line) => /^\s*-\s*\[[ xX]\]/.test(line);
const plainText = (s) => s.replace(/^\s*-\s*(\[[ xX]\]\s*)?/, '').replace(/~~/g, '').replace(/\s+/g, ' ').trim();

// Cùng cách đếm index với server/lib/needyou.js, lệch là tick nhầm mục
function parseNeed(lines) {
  const items = [];
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!isBullet(lines[i])) continue;
    let end = i;
    while (end + 1 < lines.length && !isBullet(lines[end + 1]) && lines[end + 1].trim()) end++;
    const raw = lines.slice(i, end + 1).join(' ');
    items.push(isChecklist(lines[i])
      ? { index: index++, done: /^\s*-\s*\[[xX]\]/.test(lines[i]), text: plainText(raw) }
      : { stray: true, text: plainText(raw) });
    i = end;
  }
  return items;
}

function splitSections(md) {
  const sections = [{ title: null, lines: [] }];
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith('## ')) sections.push({ title: line.slice(3).trim(), lines: [] });
    else sections.at(-1).lines.push(line);
  }
  return sections;
}

const MARKUP = `<div class="page-pad bd">
  <header class="vw-head">
    <div><h1>Board</h1><div class="vw-sub mono" id="bdSub">&nbsp;</div></div>
    <div class="vw-tools"><button class="btn ghost vw-sm" id="bdReload"><i class="ph ph-arrows-clockwise"></i>Làm mới</button></div>
  </header>
  <div class="bd-grid">
    <nav class="bd-dates" id="bdDates" aria-label="Chọn ngày">${skeleton(10)}</nav>
    <article class="bd-doc" id="bdDoc">${skeleton(12)}</article>
  </div>
</div>`;

export function mount(el, ctx) {
  el.innerHTML = MARKUP;
  const $ = (s) => el.querySelector(s);
  let dates = [];
  let date = DATE_RE.test(ctx.param ?? '') ? ctx.param : null;
  let needItems = [];

  async function loadList() {
    try {
      const { boards } = await ctx.api('boards');
      dates = boards.filter((b) => DATE_RE.test(b));
      const chats = boards.length - dates.length;
      $('#bdSub').textContent = `${dates.length} board ngày${chats ? ` · ${chats} board chat (API chưa mở đọc)` : ''}`;
    } catch (e) {
      $('#bdDates').innerHTML = errNote(e);
      return ($('#bdDoc').innerHTML = '');
    }
    if (!dates.length) {
      $('#bdDates').innerHTML = '';
      return ($('#bdDoc').innerHTML = note('ph-notebook', 'Chưa có board nào. Chạy <code>/daily</code> để tạo board hôm nay.'));
    }
    date ??= dates[0];
    renderDates();
    loadBoard();
  }

  function renderDates() {
    const byMonth = {};
    for (const d of dates) (byMonth[d.slice(0, 7)] ??= []).push(d);
    $('#bdDates').innerHTML = Object.entries(byMonth).map(([m, list]) => `<div class="bd-month"><h3 class="mono">T${Number(m.slice(5))}/${m.slice(0, 4)}</h3>
      ${list.map((d) => `<button class="bd-date ${d === date ? 'on' : ''}" data-date="${d}"><span class="mono">${d.slice(8)}</span><small>${new Date(`${d}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short' })}</small></button>`).join('')}</div>`).join('');
  }

  async function loadBoard() {
    const current = date;
    history.replaceState(null, '', `#/board/${current}`);
    $('#bdDoc').innerHTML = skeleton(12);
    let md;
    try {
      md = await ctx.api(`board/${current}`);
    } catch (e) {
      return ($('#bdDoc').innerHTML = errNote(e));
    }
    if (current !== date) return;
    renderBoard(md);
  }

  function needSection(lines) {
    needItems = parseNeed(lines);
    const done = needItems.filter((i) => i.done).length;
    const total = needItems.filter((i) => !i.stray).length;
    return `<section class="bd-sec bd-need"><h2><i class="ph ph-hand-pointing"></i>${NEED}<span class="mono">${done}/${total} xong</span></h2>
      ${needItems.length ? `<ul>${needItems.map((it, n) => (it.stray
        ? `<li class="stray vw-in" style="--i:${n}"><span class="bd-box"><i class="ph ph-minus"></i></span><span>${inlineMd(it.text)} ${pill('warn', 'không phải checklist')}</span></li>`
        : `<li class="vw-in ${it.done ? 'done' : ''}" style="--i:${n}"><button class="bd-box" data-check="${it.index}" role="checkbox" aria-checked="${it.done}" title="${it.done ? 'Bỏ gạch' : 'Đánh dấu xong'}"><i class="ph${it.done ? '-fill' : ''} ph-check-square"></i></button><span>${inlineMd(it.text)}</span></li>`)).join('')}</ul>` : note('ph-check-circle', 'Mục Cần bạn đang trống.')}
      <form class="vw-add" data-section="${NEED}"><input placeholder="Thêm việc cần bạn" aria-label="Thêm việc Cần bạn" maxlength="500"><button class="btn vw-sm"><i class="ph ph-plus"></i>Thêm</button></form></section>`;
  }

  function renderBoard(md) {
    const sections = splitSections(md);
    const html = sections.map((s) => {
      if (s.title === NEED) return needSection(s.lines);
      const body = markdown(s.lines.join('\n'));
      if (s.title === null) return body ? `<div class="md">${body}</div>` : '';
      const extra = s.title === 'Log' ? `<form class="vw-add" data-section="Log"><input placeholder="Ghi log, server tự gắn giờ" aria-label="Ghi log" maxlength="500"><button class="btn vw-sm"><i class="ph ph-plus"></i>Ghi</button></form>` : '';
      return `<section class="bd-sec"><h2>${inlineMd(s.title)}</h2><div class="md">${body || '<p class="bd-empty">Trống.</p>'}</div>${extra}</section>`;
    }).join('');
    $('#bdDoc').innerHTML = `<div class="bd-paper">${html}</div>`;
    if (!sections.some((s) => s.title === NEED)) $('.bd-paper').insertAdjacentHTML('beforeend', needSection([]));
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const d = t.closest('[data-date]');
    if (d) {
      date = d.dataset.date;
      renderDates();
      return loadBoard();
    }
    if (t.closest('#bdReload')) return loadList();
    const box = t.closest('[data-check]');
    if (box) {
      const item = needItems.find((i) => i.index === Number(box.dataset.check));
      box.disabled = true;
      try {
        await ctx.api('board/check', { method: 'POST', body: { date, index: item.index, done: !item.done, expectText: item.text } });
        ctx.toast(item.done ? 'Đã bỏ gạch' : 'Đã gạch xong');
      } catch (err) {
        ctx.toast(`Không ghi được board: ${err.message}`, true);
      }
      loadBoard();
    }
  });

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('input');
    const text = input.value.trim();
    if (!text) return input.focus();
    form.querySelector('button').disabled = true;
    try {
      const out = await ctx.api('board/append', { method: 'POST', body: { date, section: form.dataset.section, text } });
      ctx.toast(`Đã ghi: ${out.line}`);
      loadBoard();
    } catch (err) {
      ctx.toast(`Không ghi được board: ${err.message}`, true);
      form.querySelector('button').disabled = false;
    }
  });

  loadList();
}
