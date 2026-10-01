import $ from 'jquery';
import { api } from '@core/api';
import { toast } from '@components/toast';

/** Ô "thêm dòng vào board": section 'Log' thì server tự lấy giờ thật, không gõ tay */
export function bindBoardAppend(formSelector, section, boardDate) {
  $(formSelector).on('submit', async (e) => {
    e.preventDefault();
    const $input = $(e.currentTarget).find('input');
    const $btn = $(e.currentTarget).find('button');
    const text = String($input.val() || '').trim();
    if (!text) return;
    $btn.prop('disabled', true);
    try {
      const out = await api.boardAppend({ date: boardDate(), section, text });
      $input.val('').attr('placeholder', 'đã ghi: ' + out.line);
    } catch (err) {
      toast('Không ghi được board: ' + (err.responseJSON?.error || 'lỗi không rõ'));
    } finally {
      $btn.prop('disabled', false);
    }
  });
}
