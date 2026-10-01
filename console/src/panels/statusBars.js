import $ from 'jquery';
import { api } from '@core/api';
import { icon } from '@core/icons';
import { escapeHtml } from '@core/format.mjs';

const REFRESH_MS = 60000;
/** Mốc "đã xem" của dòng delta — lưu localStorage (sống qua reload), lần đầu mặc định 12h trước */
const SEEN_KEY = 'daily-console:lastSeenAt';
const DELTA_LABEL = { status: 'status Jira', phase: 'phase', milestone: 'mốc', duedate: 'duedate' };

/** 2 dải đầu cột trái, ngoài mọi tab: "có gì mới" (tin tức) + radar nền còn sống không */
export function initStatusBars() {
  // Dòng "có gì mới": bấm mở/thu danh sách; bấm "đánh dấu đã xem" mới ghi lại mốc localStorage.
  // Bind 1 lần ở đây (không bind lại mỗi lần loadDelta() vẽ lại #delta-bar).
  $('#delta-bar').on('click', '[data-delta-open]', () => $('.deltalist').attr('hidden', (i, v) => (v ? null : 'hidden')));
  $('#delta-list').on('click', '[data-delta-seen]', () => {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
    loadDelta();
  });

  // Công tắc radar nền: ghi config.radar.enabled qua server (không đụng launchctl từ web).
  // Bind 1 lần, không bind lại mỗi lần loadRadar() vẽ lại #radar-bar.
  $('#radar-bar').on('click', '[data-radar-toggle]', async function () {
    const on = Boolean(Number($(this).data('radar-toggle')));
    $(this).prop('disabled', true);
    try {
      await api.radarToggle(on);
    } finally {
      loadRadar();
    }
  });

  loadDelta();
  loadRadar();
  setInterval(loadDelta, REFRESH_MS);
  setInterval(loadRadar, REFRESH_MS);
}

/** Tin tức "có gì đổi" (history/*.jsonl), tách khỏi hàng đợi việc; lỗi thì im, không lây */
async function loadDelta() {
  const since = localStorage.getItem(SEEN_KEY) || new Date(Date.now() - 12 * 3600e3).toISOString();
  // Không cần khởi tạo `[]`: nhánh catch return ngay, nên tới dòng dùng `items` bên dưới
  // chắc chắn đã được gán trong try.
  let items;
  try {
    ({ items } = await api.delta(since));
  } catch {
    return;
  }
  const n = items.reduce((s, i) => s + i.changes.length, 0);
  if (!n) {
    $('#delta-bar, #delta-list').empty();
    return;
  }
  // Giờ ĐỊA PHƯƠNG, không phải cắt chuỗi ISO: `since` là ISO UTC, `slice(11,16)` in ra giờ UTC
  // nên ở +07:00 nó lệch 7 tiếng — đã thấy thật trên màn hình ("từ 19:21" trong khi máy 14:21,
  // đọc thành 7 giờ tối). Mốc "đã xem" sai giờ thì cả dòng delta mất nghĩa.
  const time = new Date(since).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const detail = items
    .map(
      (i) =>
        `${escapeHtml(i.key)}: ${i.changes
          // `milestone` có thêm `name` (mốc nào đổi) — không in tên mốc thì 3 mốc đổi trông y hệt nhau
          .map(
            (c) =>
              `${DELTA_LABEL[c.type] || c.type}${c.name ? ' ' + escapeHtml(c.name) : ''} ` +
              `${escapeHtml(c.from ?? '—')} → ${escapeHtml(c.to ?? '—')}`
          )
          .join(' · ')}`
    )
    .join('<br>');
  const wasOpen = $('.deltalist').length && !$('.deltalist').attr('hidden');
  $('#delta-bar').html(
    `<button type="button" class="deltabar" data-delta-open title="Thay đổi Jira/phase từ lần bạn đánh dấu đã xem">${icon(
      'radar'
    )}<span><b>${n} thay đổi</b> từ ${escapeHtml(time)}</span></button>`
  );
  $('#delta-list').html(
    `<div class="deltalist"${wasOpen ? '' : ' hidden'}>${detail}
       <button type="button" class="btn ghost small" data-delta-seen>đánh dấu đã xem</button></div>`
  );
}

const hhmm = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

const RADAR_TEXT = {
  off: () => 'Radar nền · tắt',
  'off-hours': () => 'Radar nền · ngoài giờ (08–18, T2–T6)',
  ok: (s) => `Radar ${hhmm(s.last?.at)} · OK · ${s.last?.changed ? 'có thay đổi' : '0 thay đổi'}`,
  dead: (s) => `Radar KHÔNG chạy${s.last ? ' từ ' + hhmm(s.last.at) : ''}`,
};

/**
 * Vì sao dòng này tồn tại: không có nó thì "im vì yên" và "im vì chết" trông GIỐNG HỆT nhau.
 * Đúng cái bẫy đã trả giá 6/8 với months.json — console vẽ số cũ, user mất tin vào cả trang.
 */
async function loadRadar() {
  let s;
  try {
    s = await api.radar();
  } catch {
    // Server tắt: nói thẳng ra, vì mọi số trên trang lúc này là bản cũ đọc từ lần poll trước
    return void $('#radar-bar').html(
      `<div class="radarbar dead">${icon('radar')}<span>Không nối được server console — số trên trang là bản cũ</span></div>`
    );
  }
  $('#radar-bar').html(
    `<div class="radarbar ${s.level}">${icon('radar')}<span>${escapeHtml(RADAR_TEXT[s.level](s))}</span>
       <button type="button" class="btn ghost small" data-radar-toggle="${s.enabled ? 0 : 1}">${
         s.enabled ? 'tắt' : 'bật'
       }</button></div>`
  );
}
