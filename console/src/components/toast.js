import $ from 'jquery';

const SHOW_MS = 6000;
let timer = null;

/**
 * Báo lỗi/kết quả không chặn thao tác — thay window.alert (alert khoá cả trang, kể cả terminal).
 * `action` = { label, run } gắn 1 nút bấm (vd: hoàn tác).
 */
export function toast(text, level = 'crit', action = null) {
  let $box = $('#toast');
  if (!$box.length) $box = $('<div id="toast" class="toast" role="status" aria-live="polite"></div>').appendTo('body');
  $box.attr('class', 'toast show ' + level).text(text);
  if (action) {
    $('<button type="button" class="btn small"></button>')
      .text(action.label)
      .on('click', () => {
        $box.removeClass('show');
        action.run();
      })
      .appendTo($box);
  }
  clearTimeout(timer);
  timer = setTimeout(() => $box.removeClass('show'), SHOW_MS);
}
