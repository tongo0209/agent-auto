import $ from 'jquery';
import { api } from '@core/api';
import { escapeHtml, shortDate } from '@core/format.mjs';
import { icon } from '@core/icons';
import { JIRA_SITE } from '@core/constants.mjs';
import { filterSheets } from '../../server/lib/bugsearch.js';

let ctx = { terminals: null };
let sheetsCache = [];
let openRowsCache = [];
let expandedSheet = null;
let filterText = '';
let subTab = 'following';
try {
  subTab = localStorage.getItem('bug-subtab') || subTab;
} catch {
  // trình duyệt chặn localStorage (chế độ riêng tư) — vẫn chạy, chỉ không nhớ tab
}

const day = (iso) => shortDate(String(iso || '').slice(0, 10));

const held = (h) => (h === null ? '' : h < 1 ? 'vừa xong' : h < 24 ? `treo ${h}h` : `treo ${Math.floor(h / 24)} ngày`);

const keyChips = (keys) =>
  (keys || [])
    .map((k) =>
      k.startsWith('ADHOC-')
        ? `<span class="kchip">${escapeHtml(k)}</span>`
        : `<a class="kchip open" href="${JIRA_SITE}/browse/${escapeHtml(k)}" target="_blank" rel="noopener">${escapeHtml(k)}</a>`,
    )
    .join('') || '<span class="kchip">task ngoài Jira</span>';

function bugCard(row, verified) {
  const age = held(row.heldHours);
  return `<div class="bugrow ${verified ? 'ok' : 'warn'}">
    <div class="h">
      ${icon(verified ? 'check' : 'warn')}
      <strong>#${escapeHtml(row.bugId)}</strong>
      ${keyChips(row.keys)}
      ${age ? `<span class="badge ${row.heldHours >= 24 ? 'doing' : ''}">${age}</span>` : ''}
      ${row.sheetUrl ? `<a class="bchip" href="${escapeHtml(row.sheetUrl)}" target="_blank" rel="noopener">${icon('sheet')}sheet</a>` : ''}
    </div>
    ${row.desc ? `<div class="bugdesc">${escapeHtml(row.desc)}</div>` : ''}
    ${row.note ? `<div class="bugnote">${icon('commit')}${escapeHtml(row.note)}</div>` : ''}
    ${
      verified
        ? ''
        : `<div class="bugwhy">${icon('question')}<b>Chưa verify được:</b> ${escapeHtml(row.whyLabel || 'dòng xếp hàng trước khi có cơ chế chấm điểm')}${
            row.verifyHint ? ` — <em>${escapeHtml(row.verifyHint)}</em>` : ''
          }</div>`
    }
    <div class="bugfoot">${escapeHtml(row.sheetTitle)}${row.queuedAt ? ` · xếp hàng ${day(row.queuedAt)}` : ''}</div>
  </div>`;
}

const FIX_LABEL = {
  'da-fix-chua-ghi-sheet': 'đã fix · chưa ghi sheet',
  'da-ghi-sheet': 'đã ghi sheet · chờ QC',
};

const BUCKET_LABEL = { mine: 'của mình', unknown: 'chưa rõ của ai', 'not-mine': 'của người khác' };
const BUCKET_TONE = { mine: 'warn', unknown: 'doing', 'not-mine': '' };

function openCard(row) {
  return `<div class="bugrow ${row.stale ? '' : row.bucket === 'mine' ? 'warn' : ''}">
    <div class="h">
      ${icon(row.bucket === 'mine' ? 'bug' : 'question')}
      <strong>#${escapeHtml(row.bugId)}</strong>
      <span class="badge ${BUCKET_TONE[row.bucket]}">${BUCKET_LABEL[row.bucket] || row.bucket}</span>
      ${row.status === 'cho-confirm' ? '<span class="badge done">đã sửa, chờ QC confirm</span>' : ''}
      ${FIX_LABEL[row.fixState] ? `<span class="badge fix-${row.fixState}">${FIX_LABEL[row.fixState]}</span>` : ''}
      ${row.stale ? '<span class="badge">số liệu cũ — chờ lượt quét mới</span>' : ''}
      ${row.type ? `<span class="badge">${escapeHtml(row.type)}</span>` : ''}
      ${row.sheetUrl ? `<a class="bchip" href="${escapeHtml(row.sheetUrl)}" target="_blank" rel="noopener">${icon('sheet')}sheet</a>` : ''}
    </div>
    ${row.desc ? `<div class="bugdesc">${escapeHtml(row.desc)}</div>` : ''}
    <div class="bugfoot">${escapeHtml(row.sheetTitle)}${row.assignee ? ` · assignee ${escapeHtml(row.assignee)}` : ''}${row.openAt ? ` · đọc ${day(row.openAt)}` : ''}</div>
  </div>`;
}

function group(title, rows, verified) {
  if (!rows.length) return '';
  return `<div class="buggroup">
    <div class="grouphead">${title} <span class="badge ${verified ? 'done' : 'doing'}">${rows.length}</span></div>
    ${rows.map((r) => bugCard(r, verified)).join('')}
  </div>`;
}

function sheetRow(s) {
  const scan = s.lastScan;
  const moves = scan
    ? [
        s.chuaFixCount ? `${s.chuaFixCount} chưa fix` : '',
        s.daFixCount ? `${s.daFixCount} đã fix — chưa ghi sheet` : '',
        s.daGhiCount ? `${s.daGhiCount} đã ghi sheet, chờ QC` : '',
        s.choConfirmCount ? `${s.choConfirmCount} trong đó chờ QC confirm` : '',
        scan.fresh ? `${scan.fresh} bug mới lượt trước` : '',
        scan.changed ? `${scan.changed} đổi` : '',
        (scan.reopened || []).length ? `QC mở lại #${scan.reopened.join(', #')}` : '',
        scan.notMine ? `${scan.notMine} không của mình` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : 'chưa ghi nhận lượt quét nào — có từ lượt bugwatch kế tiếp';
  return `<div class="mrow bug-${s.group}">
    <div class="h" data-sheet="${escapeHtml(s.sheetId)}">
      <span class="ym">${escapeHtml(s.title)}</span>
      ${keyChips(s.keys)}
      <span class="badges">
        ${s.state === 'retired' ? '<span class="badge">đã qua mốc release</span>' : ''}
        ${s.state === 'off' ? `<span class="badge">chưa theo dõi${s.unfollowReason ? ` — ${escapeHtml(s.unfollowReason)}` : ''}</span>` : ''}
        ${s.state === 'not-buglist' ? '<span class="badge">không phải buglist</span>' : ''}
        ${s.pendingCount ? `<span class="badge doing">${s.pendingCount} chờ duyệt</span>` : ''}
        ${s.seenCount ? `<span class="badge">${s.seenCount} bug đã nạp nền</span>` : ''}
      </span>
    </div>
    <div class="bugfoot">${escapeHtml(moves)}${s.lastChangeAt ? ` · QC động ${day(s.lastChangeAt)}` : ''}</div>
    ${
      s.state === 'not-buglist'
        ? ''
        : `<div class="bugsheetacts">
            <button type="button" class="btn small ${s.state === 'following' ? 'ghost' : 'primary'}" data-watch="${escapeHtml(s.sheetId)}" data-on="${s.state === 'following' ? '0' : '1'}">${
              s.state === 'following' ? 'thôi theo dõi' : 'bật theo dõi'
            }</button>
            <button type="button" class="btn small" data-bugfix="${escapeHtml(s.url || '')}" ${s.url ? '' : 'disabled'}>${icon('term')}fix bug</button>
            <button type="button" class="btn small ${s.daFixCount ? 'primary' : ''}" data-bugwrite>${icon('term')}ghi kết quả lên sheet${s.daFixCount ? ` (${s.daFixCount})` : ''}</button>
          </div>`
    }
    ${
      expandedSheet === s.sheetId
        ? `<div class="bugopenlist">${
            openRowsCache.filter((r) => r.sheetId === s.sheetId).map(openCard).join('') ||
            '<span class="empty-note">Không có bug đang mở trong lượt quét gần nhất.</span>'
          }</div>`
        : ''
    }
  </div>`;
}

export function initBugPanel({ terminals }) {
  ctx.terminals = terminals;
  $('#bug-pending').on('click', '[data-bugwrite]', () => ctx.terminals.type('/daily bugwrite'));
  $('#bug-sheets').on('click', '[data-watch]', async (e) => {
    const btn = $(e.currentTarget);
    btn.prop('disabled', true);
    await api.bugWatch(btn.attr('data-watch'), btn.attr('data-on') === '1');
    await loadBugs();
  });
  $('#bug-sheets').on('click', '[data-bugfix]', (e) =>
    ctx.terminals.type(`/bug-fixer-lite ${e.currentTarget.getAttribute('data-bugfix')}`),
  );
  $('#bug-sheets').on('click', '[data-bugwrite]', () => ctx.terminals.type('/daily bugwrite'));
  $('#bug-sheets').on('input', '#bug-filter', function () {
    filterText = String($(this).val() || '');
    $('#bug-filter-clear').toggle(Boolean(filterText));
    $('#bug-sheetlist').html(sheetSections());
  });
  $('#bug-sheets').on('click', '[data-sheet]', function () {
    const sheetId = String($(this).data('sheet'));
    expandedSheet = expandedSheet === sheetId ? null : sheetId;
    $('#bug-sheetlist').html(sheetSections());
  });
  $('#bug-sheets').on('click', '[data-bugtab]', function () {
    subTab = String($(this).data('bugtab'));
    try {
      localStorage.setItem('bug-subtab', subTab);
    } catch {
      // không ghi được thì thôi, tab vẫn đổi trong phiên này
    }
    $('#bug-sheetlist').html(sheetSections());
  });
  $('#bug-sheets').on('click', '#bug-filter-clear', () => {
    filterText = '';
    $('#bug-filter').val('');
    $('#bug-filter-clear').hide();
    $('#bug-sheetlist').html(sheetSections());
  });
}

const SUB_TABS = [
  ['following', 'Đang theo dõi'],
  ['off', 'Chưa theo dõi'],
  ['closed', 'Task đã đóng'],
];

function sheetSections() {
  const shown = filterSheets(sheetsCache, filterText);
  const tabs = SUB_TABS.map(
    ([group, label]) =>
      `<button type="button" class="bugtab bug-${group} ${group === subTab ? 'on' : ''}" data-bugtab="${group}">${label} <span class="badge">${shown.filter((s) => s.group === group).length}</span></button>`,
  ).join('');
  const rows = shown.filter((s) => s.group === subTab);
  const body = rows.length
    ? rows.map(sheetRow).join('')
    : `<span class="empty-note">${filterText ? 'Không có kết quả ở khu này — thử khu khác.' : 'Khu này đang trống.'}</span>`;
  return `<div class="bugtabs">${tabs}</div>${body}`;
}

export async function loadBugs() {
  let data;
  try {
    data = await api.bugs();
  } catch {
    $('#bug-pending').html('<span class="empty-note">Không đọc được hàng bug.</span>');
    return;
  }

  const { counts, pending, sheets, watching, oldestHeldHours, open } = data;
  const todo = open.counts.total + counts.total;
  $('#bug-count').text(todo ? `(${todo})` : '');
  $('#bug-opennote').text(
    open.counts.total
      ? `${open.counts.chuaFix} chưa fix · ${open.counts.daFix} đã fix chưa ghi sheet · ${open.counts.choConfirm} chờ QC confirm` +
        (open.counts.stale ? ` · ${open.counts.stale} đọc từ lượt cũ, chưa chắc còn đúng` : '')
      : watching
        ? 'Các buglist đang theo dõi không còn bug nào treo.'
        : 'Chưa bật theo dõi buglist nào — bấm "bật theo dõi" ở bảng dưới.',
  );
  openRowsCache = open.rows;
  $('#bug-open').empty();
  $('#bug-watchnote').text(`${watching} sheet đang theo dõi · ${sheets.length} sheet trong sổ`);

  $('#bug-pending').html(
    counts.total
      ? `<div class="bugsum ${counts.unverified ? 'warn' : ''}">${icon('bug')} ${counts.verified} bug đã fix + verify chờ bạn gật · ${counts.unverified} bug đã sửa CHƯA verify được${
          oldestHeldHours >= 24 ? ` · dòng lâu nhất treo ${Math.floor(oldestHeldHours / 24)} ngày` : ''
        } <button type="button" class="btn small" data-bugwrite>gõ /daily bugwrite</button></div>
        ${group('Đã verify — gật là ghi Done', pending.verified, true)}
        ${group('Chưa verify được — cần mắt bạn', pending.unverified, false)}`
      : '<span class="empty-note">Không có bug nào chờ bạn duyệt.</span>',
  );

  sheetsCache = sheets;
  // Ô lọc chỉ dựng 1 lần: loadBugs chạy lại mỗi 15s, vẽ lại input là mất chữ user đang gõ
  if (!$('#bug-filter').length) {
    $('#bug-sheets').html(
      `<div class="bugorder-note">Thứ tự: "fix bug" gõ /bug-fixer-lite → tự verify → "ghi kết quả lên sheet" gõ /daily bugwrite mới ghi lên sheet.</div>
      <span class="searchbox bugsearch">
        <span class="searchicon">${icon('search')}</span>
        <input type="search" id="bug-filter" placeholder="lọc theo mã task / tên buglist…" aria-label="Lọc buglist">
        <button type="button" class="clearx" id="bug-filter-clear" title="Xoá lọc" aria-label="Xoá lọc">${icon('close')}</button>
      </span>
      <div id="bug-sheetlist"></div>`,
    );
  }
  $('#bug-sheetlist').html(sheetSections());
}
