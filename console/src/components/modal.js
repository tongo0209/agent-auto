import $ from 'jquery';
import { escapeHtml } from '@core/format.mjs';

/** Modal xem văn bản (brief / board markdown) — dùng <dialog> native */
export function initModal() {
  $('#modal-close').on('click', () => document.getElementById('text-modal').close());
}

export async function showText(title, loader) {
  const $body = $('#modal-body');
  $('#modal-title').text(title);
  $body.removeClass('diff').text('Đang tải…');
  document.getElementById('text-modal').showModal();
  try {
    $body.text(await loader());
  } catch (err) {
    $body.text('Không tải được: ' + (err.responseText || err.message || err.statusText));
  }
}

/**
 * Modal xem diff — tô màu theo dòng.
 * Phải escape TRƯỚC khi bọc thẻ: nội dung diff là code người khác viết, có cả `<script>`.
 */
export async function showDiff(title, loader) {
  const $body = $('#modal-body');
  $('#modal-title').text(title);
  $body.addClass('diff').text('Đang tải…');
  document.getElementById('text-modal').showModal();
  try {
    const text = await loader();
    $body.html(
      text
        .split('\n')
        .map((line) => {
          const cls = /^\+\+\+|^---/.test(line)
            ? 'dh'
            : line.startsWith('+')
              ? 'da'
              : line.startsWith('-')
                ? 'dd'
                : line.startsWith('@@')
                  ? 'dr'
                  : line.startsWith('diff ') || line.startsWith('index ')
                    ? 'dh'
                    : '';
          return `<span class="dl ${cls}">${escapeHtml(line) || ' '}</span>`;
        })
        .join('\n')
    );
  } catch (err) {
    $body.removeClass('diff').text('Không tải được: ' + (err.responseText || err.message || err.statusText));
  }
}
