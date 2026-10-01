import $ from 'jquery';

const SHOW_MS = 6000;
let timer = null;

/** Báo lỗi/kết quả không chặn thao tác — thay window.alert (alert khoá cả trang, kể cả terminal) */
export function toast(text, level = 'crit') {
  let $box = $('#toast');
  if (!$box.length) $box = $('<div id="toast" class="toast" role="status" aria-live="polite"></div>').appendTo('body');
  $box.attr('class', 'toast show ' + level).text(text);
  clearTimeout(timer);
  timer = setTimeout(() => $box.removeClass('show'), SHOW_MS);
}
