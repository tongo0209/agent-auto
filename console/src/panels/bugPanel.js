import $ from 'jquery';
import { api } from '@core/api';
import { escapeHtml, shortDate } from '@core/format.mjs';
import { icon } from '@core/icons';
import { JIRA_SITE } from '@core/constants.mjs';

let ctx = { terminals: null };

const day = (iso) => shortDate(String(iso || '').slice(0, 10));

const held = (h) => (h === null ? '' : h < 1 ? 'vừa xong' : h < 24 ? `treo ${h}h` : `treo ${Math.floor(h / 24)} ngày`);

const keyChips = (keys) =>
  (keys || [])
    .map(
      (k) =>
        `<a class="kchip open" href="${JIRA_SITE}/browse/${escapeHtml(k)}" target="_blank" rel="noopener">${escapeHtml(k)}</a>`,
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

const BUCKET_LABEL = { mine: 'của mình', unknown: 'chưa rõ của ai', 'not-mine': 'của người khác' };
const BUCKET_TONE = { mine: 'warn', unknown: 'doing', 'not-mine': '' };

function openCard(row) {
  return `<div class="bugrow ${row.stale ? '' : row.bucket === 'mine' ? 'warn' : ''}">
    <div class="h">
      ${icon(row.bucket === 'mine' ? 'bug' : 'question')}
      <strong>#${escapeHtml(row.bugId)}</strong>
      <span class="badge ${BUCKET_TONE[row.bucket]}">${BUCKET_LABEL[row.bucket] || row.bucket}</span>
      ${row.status === 'cho-confirm' ? '<span class="badge done">đã sửa, chờ QC confirm</span>' : ''}
      ${row.stale ? '<span class="badge">số liệu cũ — chờ lượt quét mới</span>' : ''}
      ${row.type ? `<span class="badge">${escapeHtml(row.type)}</span>` : ''}
      ${row.sheetUrl ? `<a class="bchip" href="${escapeHtml(row.sheetUrl)}" target="_blank" rel="noopener">${icon('sheet')}sheet</a>` : ''}
    </div>
    ${row.desc ? `<div class="bugdesc">${escapeHtml(row.desc)}</div>` : ''}
    <div class="bugfoot">${escapeHtml(row.sheetTitle)}${row.assignee ? ` · assignee ${escapeHtml(row.assignee)}` : ''}${row.openAt ? ` · đọc ${day(row.openAt)}` : ''}</div>
  </div>`;
}

function ticketGroup(g) {
  const counts = [g.chuaFix && `${g.chuaFix} chưa fix`, g.choConfirm && `${g.choConfirm} chờ QC confirm`]
    .filter(Boolean)
    .join(' · ');
  return `<div class="buggroup">
    <div class="grouphead">
      ${g.keys.length ? keyChips(g.keys) : '<span class="badge">chưa gắn ticket</span>'}
      ${g.summary ? `<span class="ym">${escapeHtml(g.summary)}</span>` : ''}
      ${g.phase ? `<span class="badge">${escapeHtml(g.phase)}</span>` : ''}
      <span class="badge ${g.chuaFix ? 'warn' : 'done'}">${counts}</span>
    </div>
    ${g.rows.map(openCard).join('')}
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
        s.choConfirmCount ? `${s.choConfirmCount} chờ QC confirm` : '',
        scan.fresh ? `${scan.fresh} bug mới lượt trước` : '',
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
        : `<button type="button" class="btn small" data-watch="${escapeHtml(s.sheetId)}" data-on="${s.state === 'following' ? '0' : '1'}">${
            s.state === 'following' ? 'thôi theo dõi' : 'bật theo dõi'
          }</button>`
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
      ? `${open.counts.chuaFix} chưa fix · ${open.counts.choConfirm} đã sửa chờ QC confirm` +
        (open.counts.stale ? ` · ${open.counts.stale} đọc từ lượt cũ, chưa chắc còn đúng` : '')
      : watching
        ? 'Các buglist đang theo dõi không còn bug nào treo.'
        : 'Chưa bật theo dõi buglist nào — bấm "bật theo dõi" ở bảng dưới.',
  );
  $('#bug-open').html(
    open.counts.total
      ? open.groups.map(ticketGroup).join('')
      : '<span class="empty-note">Không có bug nào treo.</span>',
  );
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
