import $ from 'jquery';
import { api } from '@core/api';
import { escapeHtml, shortDate } from '@core/format.mjs';
import { icon } from '@core/icons';
import { monthStackedBars } from '@components/charts';
import { JIRA_SITE } from '@core/constants.mjs';

let showAll = false; // mặc định 3 tháng gần nhất (backend quyết), bấm để xem hết

/**
 * Tab "Theo tháng": task Jira nhóm theo THÁNG CỦA DUE DATE (mốc kế hoạch),
 * trạng thái done lấy real theo status hiện tại của ticket.
 */
export function initMonthsPanel() {
  $('#month-toggle').on('click', () => {
    showAll = !showAll;
    loadMonths();
  });
}

export async function loadMonths() {
  let data;
  try {
    data = await api.months(showAll ? 'all' : null);
  } catch {
    $('#month-chart').html('<span class="empty-note">Không đọc được dữ liệu tháng.</span>');
    return;
  }

  const { months, generatedAt, source, totalMonths } = data;

  $('#month-src').text(
    source === 'jira'
      ? `real từ Jira · snapshot ${generatedAt || '—'}`
      : 'tạm dựng từ state — chạy /daily để lấy snapshot Jira'
  );

  const hidden = (totalMonths || months.length) - months.length;
  $('#month-toggle')
    .toggle(Boolean(hidden) || showAll)
    .text(showAll ? 'Chỉ 3 tháng gần nhất' : `Xem tất cả ${totalMonths} tháng`);

  $('#month-chart').html(monthStackedBars(months));
  $('#month-list').html(
    months
      .map(
        (m) => `<div class="mrow">
          <div class="h">
            <span class="ym">${escapeHtml(m.month)}</span>
            <span class="mlab">${m.total} task</span>
            <span class="badges">
              ${m.done ? `<span class="badge done">${m.done} xong</span>` : ''}
              ${m.doing ? `<span class="badge doing">${m.doing} đang/chờ</span>` : ''}
            </span>
          </div>
          <div class="keys">${m.issues
            .map(
              (i) =>
                `<a class="kchip ${i.done ? 'ok' : 'open'}" href="${JIRA_SITE}/browse/${escapeHtml(i.key)}" target="_blank" rel="noopener"
                   title="${escapeHtml(i.summary || '')} — ${escapeHtml(i.status || '')} · due ${escapeHtml(i.duedate || '')}"
                   >${icon(i.done ? 'check' : 'dot')}<span>${escapeHtml(i.key)}</span>${
                     i.duedate ? `<em>${shortDate(i.duedate)}</em>` : ''
                   }</a>`
            )
            .join('')}</div>
        </div>`
      )
      .join('') || '<span class="empty-note">Chưa có tháng nào được ghi nhận.</span>'
  );
}
