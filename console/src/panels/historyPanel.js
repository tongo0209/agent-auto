import $ from 'jquery';
import { api } from '@core/api';
import { escapeHtml } from '@core/format.mjs';
import { icon } from '@core/icons';
import { PHASE } from '@core/constants.mjs';
import { estimateVsActual } from '@components/charts';
import { showText } from '@components/modal';

/** Tab "Lịch sử": board các ngày trước + panel gt-promotion + metrics + vòng học */
export function initHistoryPanel() {
  $('#board-list').on('click', '[data-board]', function () {
    const date = $(this).data('board');
    showText('Board ' + date, () => api.board(date));
  });
}

export async function loadHistory() {
  await Promise.all([loadBoards(), loadPromotion(), loadMetrics(), loadLearn(), loadLessons()]);
}

const hours = (h) => (h === null ? '—' : h >= 48 ? (h / 24).toFixed(1) + ' ngày' : h.toFixed(1) + 'h');

/**
 * Vòng học: lead time thật từng phase + dự báo cho ticket đang chạy.
 *
 * Luật hiển thị: dưới `minSamples` mẫu thì in THẲNG "chưa đủ dữ liệu (n=…)" — không nội suy,
 * không bịa số. Dự báo sai còn tệ hơn không dự báo: nó làm hoãn đúng việc gấp.
 */
async function loadLearn() {
  let d;
  try {
    d = await api.learn();
  } catch {
    return;
  }
  const min = d.minSamples || 3;

  const phaseRows = (d.phases || [])
    .sort((a, b) => b.n - a.n)
    .map((p) => {
      const label = PHASE[p.phase]?.label || p.phase;
      const enough = p.n >= min;
      return `<tr>
        <td><span class="ph" style="color:var(--${PHASE[p.phase]?.sev || 'wait'})">${icon(PHASE[p.phase]?.icon || 'dot')}${escapeHtml(label)}</span></td>
        <td class="num">${p.n}</td>
        <td class="num">${enough ? escapeHtml(hours(p.medianHours)) : '<span class="thin">chưa đủ dữ liệu</span>'}</td>
        <td class="num">${enough ? escapeHtml(hours(p.p80Hours)) : ''}</td>
      </tr>`;
    })
    .join('');

  const running = (d.running || [])
    .map(
      (r) => `<div class="lrun ${r.overdue ? 'over' : ''}">
        <span class="lkey">${escapeHtml(r.key)}</span>
        <span class="lph">${escapeHtml(PHASE[r.phase]?.label || r.phase)}</span>
        <span class="lval">${escapeHtml(hours(r.hours))}</span>
        <span class="lnote">${
          r.enough
            ? escapeHtml(`median ${hours(r.medianHours)} (n=${r.n})` + (r.overdue ? ' · đang dài hơn thường lệ' : ''))
            : escapeHtml(`chưa đủ dữ liệu (n=${r.n}) — chưa dự báo`)
        }</span>
      </div>`
    )
    .join('');

  $('#learn-box').html(
    (d.sampleRows
      ? `<table class="ttable small"><thead><tr><th>Phase</th><th class="num">n</th><th class="num">median</th><th class="num">p80</th></tr></thead>
         <tbody>${phaseRows || '<tr><td colspan="4" class="thin">chưa có khoảng phase nào đóng</td></tr>'}</tbody></table>`
      : '<span class="empty-note">Chưa có dòng nào trong <code>history/phases.jsonl</code> — console sẽ tự ghi khi phase đổi.</span>') +
      (running ? `<div class="lruns">${running}</div>` : '') +
      `<div class="srcnote">nguồn: history/phases.jsonl · ${d.sampleRows || 0} dòng · ngưỡng dự báo ${min} mẫu</div>`
  );
}

/** Bài học đã gom — nguồn: fe-gate fail tự append + /daily wrap + gõ tay */
async function loadLessons() {
  // Không cần khởi tạo '': nhánh catch return ngay, nên tới dòng dùng `text` bên dưới
  // chắc chắn đã được gán trong try.
  let text;
  try {
    text = await api.lessons();
  } catch {
    return;
  }
  const blocks = text
    .split(/^## /m)
    .slice(1)
    .map((b) => {
      const [title, ...rest] = b.split('\n');
      return { title: title.trim(), body: rest.filter((l) => l.trim().startsWith('-')).map((l) => l.replace(/^-\s*/, '')) };
    });
  $('#lessons-box').html(
    blocks.length
      ? blocks
          .map(
            (b) => `<details class="lesson"><summary>${icon('lesson')}${escapeHtml(b.title)}</summary>
              <ul>${b.body.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul></details>`
          )
          .join('')
      : '<span class="empty-note">Chưa có bài học nào trong <code>knowledge/lessons.md</code>.</span>'
  );
}

async function loadBoards() {
  const today = $('#today').text();
  let boards = [];
  try {
    ({ boards } = await api.boards());
  } catch {
    // Giữ nguyên mảng rỗng đã khởi tạo — panel vẫn render (danh sách board trống), không vỡ trang
  }
  $('#board-list').html(
    boards
      .map((b) => `<button type="button" class="bchip ${b === today ? 'today' : ''}" data-board="${escapeHtml(b)}">${escapeHtml(b)}</button>`)
      .join('') || '<span class="empty-note">Chưa có board nào.</span>'
  );
}

async function loadPromotion() {
  let data;
  try {
    data = await api.promotion();
  } catch {
    return;
  }
  if (!data.root) {
    $('#promo-box').html('<span class="empty-note">Chưa cấu hình repo gt-promotion-template.</span>');
    return;
  }
  $('#promo-box').html(
    data.items
      .map(
        (it) => `<div class="commit">
          <div class="top"><span class="repo">${escapeHtml(it.key)}</span><span>${escapeHtml(it.folder)}</span></div>
          ${
            it.last
              ? `<div class="subj">${escapeHtml(it.last.subject)}</div>
                 <div class="stat">${escapeHtml(it.last.date)} · ${escapeHtml(it.last.author)} · ${escapeHtml(it.last.hash)}</div>`
              : '<div class="stat">Chưa có commit nào đụng folder này.</div>'
          }
        </div>`
      )
      .join('') || '<span class="empty-note">Chưa có task nào gắn folder gt-promotion.</span>'
  );
}

async function loadMetrics() {
  let records = [];
  try {
    ({ records } = await api.metrics());
  } catch {
    // Giữ nguyên mảng rỗng đã khởi tạo — chart vẫn vẽ được (rỗng), không vỡ trang
  }
  $('#metrics-box').html(estimateVsActual(records));
}
