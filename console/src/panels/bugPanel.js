import $ from 'jquery';
import { api } from '@core/api';
import { escapeHtml, shortDate } from '@core/format.mjs';
import { icon } from '@core/icons';

const JIRA = 'https://vnggames.atlassian.net';

let ctx = { terminals: null };

const day = (iso) => shortDate(String(iso || '').slice(0, 10));

const held = (h) => (h === null ? '' : h < 1 ? 'vừa xong' : h < 24 ? `treo ${h}h` : `treo ${Math.floor(h / 24)} ngày`);

const keyChips = (keys) =>
  (keys || [])
    .map(
      (k) =>
        `<a class="kchip open" href="${JIRA}/browse/${escapeHtml(k)}" target="_blank" rel="noopener">${escapeHtml(k)}</a>`,
    )
    .join('') || '<span class="kchip">chưa gắn ticket</span>';

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
        scan.fresh ? `${scan.fresh} bug mới` : '',
        scan.changed ? `${scan.changed} đổi` : '',
        (scan.reopened || []).length ? `QC mở lại #${scan.reopened.join(', #')}` : '',
        scan.notMine ? `${scan.notMine} không của mình` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : 'chưa ghi nhận lượt quét nào — có từ lượt bugwatch kế tiếp';
  return `<div class="mrow">
    <div class="h">
      <span class="ym">${escapeHtml(s.title)}</span>
      ${keyChips(s.keys)}
      <span class="badges">
        ${s.state === 'retired' ? '<span class="badge">đã nghỉ theo dõi</span>' : ''}
        ${s.state === 'not-buglist' ? '<span class="badge">không phải buglist</span>' : ''}
        ${s.pendingCount ? `<span class="badge doing">${s.pendingCount} chờ duyệt</span>` : ''}
        ${s.seenCount ? `<span class="badge">${s.seenCount} bug đã nạp nền</span>` : ''}
      </span>
    </div>
    <div class="bugfoot">${escapeHtml(moves)}${s.lastChangeAt ? ` · QC động ${day(s.lastChangeAt)}` : ''}</div>
  </div>`;
}

export function initBugPanel({ terminals }) {
  ctx.terminals = terminals;
  $('#bug-pending').on('click', '[data-bugwrite]', () => ctx.terminals.type('/daily bugwrite'));
}

export async function loadBugs() {
  let data;
  try {
    data = await api.bugs();
  } catch {
    $('#bug-pending').html('<span class="empty-note">Không đọc được hàng bug.</span>');
    return;
  }

  const { counts, pending, sheets, watching, oldestHeldHours } = data;
  $('#bug-count').text(counts.total ? `(${counts.total})` : '');
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

  $('#bug-sheets').html(sheets.map(sheetRow).join('') || '<span class="empty-note">Watchlist trống.</span>');
}
