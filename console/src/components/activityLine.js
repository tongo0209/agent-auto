import { escapeHtml } from '@core/format.mjs';
import { icon } from '@core/icons';

/** Số lớn cho dễ đọc: 5146 → 5.1k */
function compact(n) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);
}

/**
 * Ô "Effort" của một dòng task trong bảng.
 * Ô này là lý do phải nối ticket ↔ folder: nó nói task đã được làm bao nhiêu THẬT,
 * thay vì tin vào note do người gõ.
 */
export function effortCell(act) {
  if (!act) return '<span class="dash">—</span>';

  if (!act.linked) {
    return `<button type="button" class="minibtn" data-link-key="${escapeHtml(act.key)}"
      title="Chưa gắn folder — bấm để gõ /daily link vào terminal">${icon('link')}<span>gắn</span></button>`;
  }

  if (act.pathMissing) {
    return `<span class="eff bad" title="Folder đã gắn không còn tồn tại — chạy /daily để dò lại">${icon(
      'warn'
    )}<span>mất folder</span></span>`;
  }

  if (!act.commits) {
    return '<span class="dash" title="Đã gắn folder · chưa có commit nào">chưa commit</span>';
  }

  // Ô hẹp nên chỉ hiện commit + dòng THÊM; số dòng xoá nằm ở tooltip và trong modal
  // (nhồi cả +/− vào ô làm số bị cắt mất — mất chính xác thì thà không hiện).
  const last = act.lastCommit;
  return `<button type="button" class="eff" data-act-key="${escapeHtml(act.key)}"
    title="${act.commits} commit · ${act.activeDays} ngày làm · +${act.sourceAdded} −${act.sourceRemoved} dòng code${
      last ? ' · commit cuối ' + escapeHtml(last.date) : ''
    } — bấm xem toàn bộ commit của ticket">
    ${icon('commit')}<b>${act.commits}</b><span class="plus">+${compact(act.sourceAdded)}</span></button>`;
}

/** Nội dung modal: toàn bộ commit của một ticket */
export function activityDetail(act) {
  const head = `${act.commits} commit · ${act.activeDays} ngày làm · +${act.sourceAdded} −${act.sourceRemoved} dòng code
${(act.paths || []).map((p) => `  ${p.repo}: ${p.path}`).join('\n')}
(chỉ tính file code viết tay — bỏ dist/, ảnh, lock; bỏ merge commit)

`;
  const body = act.commitList
    .map(
      (c) =>
        `${c.date}  ${c.hash}  [${c.repo}]\n` +
        `  +${c.sourceAdded} −${c.sourceRemoved} trên ${c.sourceFiles}/${c.rawFiles} file\n` +
        `  ${c.subject}\n`
    )
    .join('\n');
  return head + body;
}
