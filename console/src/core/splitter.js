import $ from 'jquery';

/**
 * `:v2` — đổi khoá 1 lần để mặc định mới ăn được trên máy đã từng kéo splitter
 * (giá trị localStorage cũ luôn thắng DEFAULT_RATIO).
 */
const STORAGE_KEY = 'daily-console:left-width:v2';
const MIN_LEFT = 380;
const MIN_RIGHT = 420;
/**
 * 0.57 thay cho 0.46 (2026-08-01, đo thật ở màn 1920):
 * trái 883px → terminal 129 cols · trái 1100px → **102 cols**  · 1200px → 89 · 1300px → 76.
 * Claude Code đọc thoải mái ở ~100 cols (sàn ~80, dưới đó bảng/diff của nó wrap xấu),
 * nên 129 cols là dư — trả 217px đó cho cột trái để có chỗ cho cột Gate + Push.
 */
const DEFAULT_RATIO = 0.57;

/**
 * Thanh kéo giữa cột thông tin và cột terminal.
 * Ghi width vào biến CSS --left-w của .shell + localStorage (nhớ giữa các lần mở).
 */
export function initSplitter({ onResize }) {
  const $shell = $('.shell');
  const $gutter = $('#gutter');

  const clamp = (px) => Math.max(MIN_LEFT, Math.min(px, window.innerWidth - MIN_RIGHT));
  const apply = (px) => $shell.css('--left-w', clamp(px) + 'px');

  const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  apply(Number.isFinite(saved) ? saved : window.innerWidth * DEFAULT_RATIO);

  let dragging = false;

  $gutter.on('mousedown', (e) => {
    dragging = true;
    e.preventDefault();
    $('body').addClass('dragging');
  });

  $(document).on('mousemove', (e) => {
    if (!dragging) return;
    apply(e.clientX);
  });

  $(document).on('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    $('body').removeClass('dragging');
    localStorage.setItem(STORAGE_KEY, parseInt($shell.css('--left-w'), 10));
    onResize && onResize();
  });

  // Kéo bằng bàn phím cho ai không dùng chuột
  $gutter.on('keydown', (e) => {
    const step = e.shiftKey ? 60 : 20;
    const current = parseInt($shell.css('--left-w'), 10) || window.innerWidth * DEFAULT_RATIO;
    if (e.key === 'ArrowLeft') apply(current - step);
    else if (e.key === 'ArrowRight') apply(current + step);
    else return;
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, parseInt($shell.css('--left-w'), 10));
    onResize && onResize();
  });

  // Double-click = về mặc định
  $gutter.on('dblclick', () => {
    apply(window.innerWidth * DEFAULT_RATIO);
    localStorage.setItem(STORAGE_KEY, parseInt($shell.css('--left-w'), 10));
    onResize && onResize();
  });

  $(window).on('resize', () => {
    apply(parseInt($shell.css('--left-w'), 10));
    onResize && onResize();
  });
}
