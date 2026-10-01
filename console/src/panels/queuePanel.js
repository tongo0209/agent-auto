import $ from 'jquery';
import { api } from '@core/api';
import { icon } from '@core/icons';
import { escapeHtml, inlineMd, shortDate, daysUntil } from '@core/format.mjs';
import { openTicket } from '@panels/ticketPanel';
import { bindBoardAppend } from '@components/boardAppend';

const QUEUE_REFRESH_MS = 15000;
const ACTION_LABEL = {
  ticket: 'mở ticket',
  fixbug: 'fix bug',
  bugs: 'duyệt bug',
  review: 'xem review',
  doctor: '/daily doctor',
  copy: 'chép tin nhắn',
};
const CHECK_KINDS = ['need-check', 'debt-check'];

let ctx = { terminals: null, paths: {}, boardDate: null, today: null };
let onNotify = () => {};
let itemsById = new Map();
let lastCritSignature = null;
/** Dòng đang mở hết chữ — giữ ngoài DOM vì hàng đợi vẽ lại mỗi 15s */
const openRows = new Set();
let showLooseDebt = false;
let lastQueue = null;

export function initQueuePanel({ terminals, notify }) {
  ctx.terminals = terminals;
  onNotify = notify;
  bindBoardAppend('#need-add', 'Cần bạn', () => ctx.boardDate || ctx.today);

  $('#pane-today')
    .on('click', '[data-qtext]', function () {
      const id = String($(this).closest('[data-qid]').data('qid'));
      if (openRows.has(id)) openRows.delete(id);
      else openRows.add(id);
      $(this).closest('li').toggleClass('open', openRows.has(id));
    })
    .on('click', '[data-qticket]', function () {
      openTicket(String($(this).data('qticket')), ctx.paths);
    })
    .on('click', '[data-qact]', function () {
      runAction(itemOf(this), $(this));
    })
    .on('click', '[data-qcheck]', function () {
      checkBoardLine(itemOf(this), $(this));
    })
    .on('change', '[data-qsnooze]', function () {
      const choice = String($(this).val());
      if (choice) snooze(itemOf(this), choice);
    })
    .on('click', '[data-qunsnooze]', function () {
      snooze(itemOf(this), null);
    })
    .on('click', '[data-qloose]', () => {
      showLooseDebt = !showLooseDebt;
      renderQueue(lastQueue);
    });

  loadQueue();
  setInterval(loadQueue, QUEUE_REFRESH_MS);
}

/** Poll state 3s đưa vào đường dẫn + ngày board — drawer ticket và ô "thêm việc" cần */
export function setQueueContext(data) {
  ctx = { ...ctx, paths: data.paths || {}, boardDate: data.board?.boardDate || null, today: data.today };
}

export async function loadQueue() {
  let q;
  try {
    q = await api.queue();
  } catch {
    return; // server tắt — giữ hàng đợi cũ, dòng radar phía trên đã báo mất kết nối
  }
  // Đang mở menu hoãn thì không vẽ đè, kẻo mất lựa chọn giữa chừng
  if ($(document.activeElement).is('#pane-today select')) return;
  renderQueue(q);
}

const itemOf = (el) => itemsById.get(String($(el).closest('[data-qid]').data('qid')));

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function runAction(item, $btn) {
  const { action } = item;
  if (action.kind === 'ticket') openTicket(action.key, ctx.paths);
  // Gõ sẵn, không Enter: fix bug chạm sheet chung với QC, user tự bấm chạy
  if (action.kind === 'fixbug') ctx.terminals.typeDraft('/bug-fixer-lite ' + action.sheetUrl);
  if (action.kind === 'bugs') $('.tab[data-tab="bugs"]').trigger('click');
  if (action.kind === 'review') $('.tab[data-tab="review"]').trigger('click');
  if (action.kind === 'doctor') ctx.terminals.type('/daily doctor');
  if (action.kind === 'copy') {
    navigator.clipboard.writeText(action.message).then(
      () => $btn.html(icon('check') + ' đã chép'),
      () => window.prompt('Chép tay tin nhắn này:', action.message)
    );
  }
}

async function checkBoardLine(item, $btn) {
  const { date, index, text } = item.action;
  $btn.prop('disabled', true);
  try {
    await api.boardCheck({ date, index, done: true, expectText: text });
    $btn.attr('aria-checked', 'true').html(icon('box-on'));
    $btn.closest('li').addClass('done');
  } catch (err) {
    const msg = err.responseJSON?.error || 'không ghi được board ' + date;
    window.alert(msg + (err.status === 409 ? '\n\nBoard vừa bị sửa — hàng đợi sẽ tự nạp lại.' : ''));
  } finally {
    $btn.prop('disabled', false);
    loadQueue();
  }
}

async function snooze(item, choice) {
  const until = choice === null ? null : choice === 'due' ? item.due : addDays(ctx.today, Number(choice));
  try {
    await api.queueSnooze({ id: item.id, until, level: item.level, text: item.text });
  } catch (err) {
    window.alert('Không lưu được hoãn: ' + (err.responseJSON?.error || 'lỗi không rõ'));
  }
  $(document.activeElement).trigger('blur');
  loadQueue();
}

function dueLabel(due) {
  if (!due) return '';
  const days = daysUntil(due, ctx.today);
  return `<span class="qdue" title="Mốc kế ${escapeHtml(due)}">${days ? `còn ${days}d` : 'hôm nay'}</span>`;
}

function snoozeMenu(item) {
  const toDue = item.due && item.due > ctx.today ? `<option value="due">tới mốc ${shortDate(item.due)}</option>` : '';
  return `<select class="qsnooze" data-qsnooze aria-label="Hoãn dòng này" title="Hoãn — ẩn tới hạn, lên crit thì tự hiện lại">
      <option value="">hoãn…</option><option value="1">1 ngày</option><option value="3">3 ngày</option>${toDue}</select>`;
}

function row(item, { snoozed = false } = {}) {
  const isCheck = CHECK_KINDS.includes(item.action.kind);
  const lead = isCheck
    ? `<button type="button" class="needbox" role="checkbox" aria-checked="false" data-qcheck
         title="Đánh dấu xong — ghi thẳng vào board ${escapeHtml(item.action.date)}">${icon('box-off')}</button>`
    : icon(item.level === 'crit' ? 'warn' : 'wait');
  const key =
    item.key && !item.text.includes(item.key)
      ? `<button type="button" class="qkey" data-qticket="${escapeHtml(item.key)}" title="Mở ticket">${escapeHtml(item.key)}</button>`
      : '';
  const age = item.source === 'debt' ? `<span class="debtage">${shortDate(item.date)} · ${item.staleDays}d</span>` : '';
  const text = isCheck ? inlineMd(item.text) : escapeHtml(item.text);
  const actionIcon = item.action.kind === 'copy' ? icon('copy') + ' ' : '';
  const actionButton = isCheck
    ? ''
    : `<button type="button" class="abtn" data-qact>${actionIcon}${ACTION_LABEL[item.action.kind]}</button>`;
  const tail = snoozed
    ? `<span class="qdue">tới ${shortDate(item.snoozedUntil)}</span>
       <button type="button" class="abtn" data-qunsnooze>bỏ hoãn</button>`
    : dueLabel(item.due) + actionButton + snoozeMenu(item);
  return `<li class="qrow ${escapeHtml(item.level)}${openRows.has(item.id) ? ' open' : ''}" data-qid="${escapeHtml(item.id)}">
      ${lead}${key}${age}<span class="qtext" data-qtext title="Bấm để xem/thu gọn cả dòng">${text}</span>${tail}</li>`;
}

function debtRows(debt) {
  const withTicket = debt.filter((i) => !i.loose).map((i) => row(i));
  const loose = debt.filter((i) => i.loose);
  if (!loose.length) return withTicket.join('');
  const toggle = `<li class="qrow"><button type="button" class="abtn" data-qloose>${showLooseDebt ? 'ẩn' : 'hiện'} ${
    loose.length
  } việc không gắn ticket</button></li>`;
  return [...withTicket, toggle, ...(showLooseDebt ? loose.map((i) => row(i)) : [])].join('');
}

function renderQueue(q) {
  lastQueue = q;
  itemsById = new Map([...q.now, ...q.waiting, ...q.debt, ...q.snoozed].map((i) => [i.id, i]));
  ctx.today = q.today;

  $('#queue-now').html(
    q.now.map((i) => row(i)).join('') ||
      `<li class="qrow empty">${icon('goal')}<span>Hết việc phải làm ngay — xem nhóm chờ hoặc nợ cũ bên dưới.</span></li>`
  );
  $('#queue-now-count').text(q.now.length ? `(${q.now.length})` : '');
  $('#today-count').text(q.now.length ? `(${q.now.length})` : '');

  const fill = (name, list, html) => {
    $(`#queue-${name}-box`).toggle(list.length > 0);
    $(`#queue-${name}-count`).text(`(${list.length})`);
    $(`#queue-${name}`).html(html);
  };
  fill('waiting', q.waiting, q.waiting.map((i) => row(i)).join(''));
  fill('debt', q.debt, debtRows(q.debt));
  fill('snoozed', q.snoozed, q.snoozed.map((i) => row(i, { snoozed: true })).join(''));

  const crit = q.now.filter((i) => i.level === 'crit');
  const sig = crit.map((i) => i.id).join('|');
  if (lastCritSignature !== null && sig && sig !== lastCritSignature)
    onNotify('Cảnh báo gấp', crit.map((i) => `${i.key}: ${i.text}`).join('\n'));
  lastCritSignature = sig;
}
