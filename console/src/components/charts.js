/**
 * Chart thuần HTML/CSS — trả về HTML string, không tự chèn DOM.
 * Palette 2 series (--s1 #279A8B, --s2 #B67F35) đã qua validator dataviz trên nền tối:
 * lightness band / chroma / CVD ΔE 11.6 / normal-vision ΔE 19.9 / contrast — ALL PASS.
 * Quy ước: gap 2px giữa các segment, bo 4px ở đầu dữ liệu, nhãn/số dùng màu chữ (không màu series).
 */
import { escapeHtml, shortMonth } from '@core/format.mjs';

/** Stacked bar theo tháng: xong FE (s1) + đang làm/chờ (s2) */
export function monthStackedBars(months, maxBars = 8) {
  if (!months.length) return '<span class="empty-note">Chưa có dữ liệu tháng.</span>';
  const asc = [...months].reverse().slice(-maxBars);
  const max = Math.max(...asc.map((m) => m.total), 1);

  return asc
    .map((m) => {
      const hDoing = Math.round((m.doing / max) * 100);
      const hDone = Math.round((m.done / max) * 100);
      return `<div class="mcol">
        <div class="mval">${m.total}</div>
        <div class="mstack">
          ${m.doing ? `<div class="mseg top" data-series="2" style="height:${hDoing}%" title="${m.doing} đang làm / chờ"></div>` : ''}
          ${m.done ? `<div class="mseg ${m.doing ? '' : 'top'}" data-series="1" style="height:${hDone}%" title="${m.done} xong FE"></div>` : ''}
        </div>
        <div class="mlab">${shortMonth(m.month)}</div>
      </div>`;
    })
    .join('');
}

/** Bar 1 series: commit từng NGÀY trong một tháng (không legend — tiêu đề đã nói rõ series) */
export function commitBarsByMonth(commits, month, daysInMonth, mergeCount = 0) {
  const byDay = {};
  commits.forEach((c) => {
    const day = c.date.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });

  const series = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${month}-${String(day).padStart(2, '0')}`;
    series.push({ day, iso, n: byDay[iso] || 0 });
  }
  const max = Math.max(...series.map((s) => s.n), 1);
  const activeDays = series.filter((s) => s.n).length;

  const bars = series
    .map(
      (s) =>
        `<div class="gbar ${s.n ? '' : 'zero'}" style="height:${s.n ? Math.max(6, (s.n / max) * 100) : 2}%" title="${s.iso}: ${s.n} commit"></div>`
    )
    .join('');

  const axis = `<span>01</span>
    <span>${commits.length} commit · ${activeDays}/${daysInMonth} ngày có làm · cao nhất ${max}/ngày${
      mergeCount ? ` · ${mergeCount} merge không tính` : ''
    }</span>
    <span>${daysInMonth}</span>`;

  return { bars, axis, max, activeDays };
}

/** Cặp thanh ước lượng (s2) vs thực tế (s1) cho từng bản ghi metrics */
export function estimateVsActual(records, maxRows = 14) {
  if (!records.length) {
    return '<span class="empty-note">Chưa có metrics — <code>/daily wrap</code> sẽ ghi sau mỗi ngày làm việc.</span>';
  }
  const rows = records.slice(-maxRows);
  const max = Math.max(...rows.flatMap((r) => [r.estimate || 0, r.actualMachine || 0]), 1);

  const body = rows
    .map(
      (r) => `<div class="mrow-metric">
        <div class="mlab left">${escapeHtml(r.key)} · ${escapeHtml(r.lane || '')}</div>
        <div class="mbar-row">
          <div class="mseg bar" data-series="2" style="width:${((r.estimate || 0) / max) * 100}%"></div>
          <span class="mlab">ước ${escapeHtml(r.estimate ?? '—')}</span>
        </div>
        <div class="mbar-row">
          <div class="mseg bar" data-series="1" style="width:${((r.actualMachine || 0) / max) * 100}%"></div>
          <span class="mlab">thực ${escapeHtml(r.actualMachine ?? '—')}</span>
        </div>
      </div>`
    )
    .join('');

  return `<div class="chartbox">${body}
    <div class="legend">
      <span class="lg"><i data-series="2"></i>Ước lượng</span>
      <span class="lg"><i data-series="1"></i>Thực tế (máy chạy)</span>
    </div></div>`;
}
