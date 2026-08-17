/**
 * Timeline mốc (Gantt ngang) — mỗi task 1 hàng, các mốc đặt đúng ngày trên trục.
 * Chỉ có nghĩa khi cột đủ rộng, nên đây là nội dung "trả tiền" cho việc mở rộng cột trái.
 *
 * Nhãn trục + vạch tuần dùng CHUNG một hàm `pct()` và đều đặt absolute theo %, nên nhãn
 * luôn thẳng cột với vạch và với chấm mốc. (Bản trước vẽ trục bằng 28 ô flex nên nhãn nằm
 * giữa ô, không trùng vạch nào → nhìn lệch.)
 */
import { escapeHtml, daysUntil, severityByDays, toISODate, shortDate } from '@core/format.mjs';
import { MILESTONE_LABEL, PHASE, DIM_PHASES, KEY_MILESTONE_IDS } from '@core/constants.mjs';
import { layoutMarks, rowClass } from '@core/marks.mjs';
import { icon } from '@core/icons';

const DAYS_BEFORE = 3;
const DAYS_TOTAL = 28;
/** Ngày cuối trục cách hôm nay bao xa — mốc xa hơn thế bị ghim mép phải (mark `off`) */
const MAX_DAYS = DAYS_TOTAL - DAYS_BEFORE - 1;
/** Mốc nằm quá phải thì nhãn phải đổ về bên trái, không thì bị cắt ở mép track */
const LABEL_FLIP_PCT = 74;
/** 2 mốc gần nhau hơn ngưỡng này thì chỉ mốc đầu được hiện nhãn (tránh chữ chồng chữ) */
const LABEL_MIN_GAP_PCT = 10;
/** Nhãn mốc ngoài khung dài hơn hẳn (kèm ngày + "+n" + mũi tên) nên vùng cấm của nó rộng hơn.
 *  16 chứ không phải 25 như bản cũ: vùng cấm giờ tính MỘT PHÍA (chỉ bên trái chấm, đúng hướng
 *  nhãn đổ) nên nó phải xấp xỉ bề rộng CHỮ THẬT, không phải nửa vùng đối xứng. */
const LABEL_OFF_GAP_PCT = 16;

/** Trục ngày: từ (hôm nay - 3) đến +24 ngày */
function buildAxis(todayISO) {
  const start = new Date(todayISO + 'T00:00:00');
  start.setDate(start.getDate() - DAYS_BEFORE);
  const days = [];
  for (let i = 0; i < DAYS_TOTAL; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);
    days.push({ iso, dom: d.getDate(), mon: d.getMonth() + 1, dow: d.getDay(), isToday: iso === todayISO });
  }
  return days;
}

export function ganttTimeline(issues, todayISO) {
  if (!issues.length) return '<span class="empty-note">Chưa có task nào để vẽ timeline.</span>';

  const days = buildAxis(todayISO);
  const pct = (iso) => {
    const idx = days.findIndex((d) => d.iso === iso);
    return idx < 0 ? null : ((idx + 0.5) / DAYS_TOTAL) * 100;
  };

  // Mốc trục: mỗi thứ Hai + hôm nay → vừa đủ để định vị, không rối như 28 nhãn
  const ticks = days.filter((d) => d.dow === 1 || d.isToday);
  const gridlines = ticks
    .map((d) => `<span class="ggrid ${d.isToday ? 'now' : ''}" style="left:${pct(d.iso)}%"></span>`)
    .join('');
  const axisLabels = ticks
    .map(
      (d) =>
        `<span class="gtick ${d.isToday ? 'now' : ''}" style="left:${pct(d.iso)}%">${
          d.isToday ? 'hôm nay' : d.dom + '/' + d.mon
        }</span>`
    )
    .join('');

  const rows = issues
    .map(([key, issue]) => {
      const phase = PHASE[issue.phase] || { label: issue.phase, sev: 'wait', icon: 'dot' };

      // Tách thành hàm thuần `layoutMarks` (core/marks.mjs) để test được: gantt.js import icon
      // .svg qua webpack nên node:test không nạp được file này.
      const marks = layoutMarks(issue.milestones, {
        pctOf: pct,
        daysUntilOf: (date) => daysUntil(date, todayISO),
        keyIds: KEY_MILESTONE_IDS,
        minGapPct: LABEL_MIN_GAP_PCT,
        offGapPct: LABEL_OFF_GAP_PCT,
        maxDays: MAX_DAYS,
        flipPct: LABEL_FLIP_PCT,
      });

      const markHtml = marks
        .map((m) => {
          const sev = m.days < 0 ? 'wait' : severityByDays(m.days);
          const label = MILESTONE_LABEL[m.name] || m.name;
          const cls = [
            'gmark',
            m.name === 'html' ? 'key' : '',
            m.flip && !m.off ? 'flip' : '',
            m.showLabel ? '' : 'nolabel',
            m.off ? 'off' : '',
          ]
            .filter(Boolean)
            .join(' ');
          // Mốc ngoài khung ghim mép phải: nhãn phải mang NGÀY, không thì chấm ở mép đọc thành
          // "mốc đúng hôm cuối trục".
          const text = m.off ? `${label} ${shortDate(m.date)}${m.moreOff ? ` +${m.moreOff}` : ''} →` : label;
          return `<span class="${cls}" style="left:${m.left}%;--sev:var(--${sev})"
                    title="${escapeHtml(label)} ${m.date} (${m.days < 0 ? 'đã qua' : 'còn ' + m.days + 'd'})${
                      m.off ? ' — ngoài khung 28 ngày' : ''
                    }${
                      m.alsoNames
                        ? ' · trùng ngày: ' + m.alsoNames.map((n) => MILESTONE_LABEL[n] || n).join(', ')
                        : ''
                    }">
                    <i></i><b>${escapeHtml(text)}</b></span>`;
        })
        .join('');

      // Dải phủ từ mốc đầu → mốc cuối để thấy độ dài công việc
      const span =
        marks.length > 1
          ? `<span class="gspan" style="left:${marks[0].left}%;width:${marks[marks.length - 1].left - marks[0].left}%"></span>`
          : '';

      // Xong FE rồi thì mốc còn lại là của BE/QC → vẽ mờ, để mắt bắt đúng hàng còn phải làm
      // (rowClass tách sang core/marks.mjs để test được — xem giải thích ở đó)
      const cls = rowClass(issue.phase, DIM_PHASES);
      const dim = cls.includes('dim');

      return `<div class="${cls}"${dim ? ' title="Phần FE đã xong — mốc còn lại là việc của BE/QC"' : ''}>
        <div class="glabel">
          <span class="gkey">${escapeHtml(key)}</span>
          <span class="gphase" style="color:var(--${phase.sev})" title="${escapeHtml(phase.label)}">${icon(
            phase.icon || 'dot'
          )}${escapeHtml(phase.label)}</span>
        </div>
        <div class="gtrack"><span class="gpast" style="width:${pct(todayISO)}%"></span>${gridlines}${span}${markHtml}<span class="gnow" style="left:${pct(
          todayISO
        )}%"></span></div>
      </div>`;
    })
    .join('');

  return `<div class="gantt">
    <div class="grow ghead"><div class="glabel"></div><div class="gaxis">${axisLabels}</div></div>
    ${rows}
  </div>`;
}
