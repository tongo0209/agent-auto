/**
 * Bộ icon — chỗ DUY NHẤT biết icon nào lấy từ file nào.
 *
 * Vì sao lucide + string SVG: panel render bằng HTML string (jQuery), nên icon phải là
 * string dán được vào giữa template. Webpack rule `asset/source` (webpack.config.js) đưa
 * file .svg vào bundle nguyên văn.
 *
 * Mọi icon giữ `stroke="currentColor"` → TỰ ăn màu chữ bên cạnh (severity, muted, accent…),
 * nên không bao giờ phải truyền màu vào icon. Kích thước theo `1em` của chỗ đặt (xem .ic).
 *
 * Thêm icon: thêm 1 dòng import + 1 entry vào RAW với TÊN NGHIỆP VỤ (không phải tên file lucide)
 * — đổi hình chỉ sửa ở đây, panel không biết tên file.
 */
import wait from 'lucide-static/icons/clock-4.svg';
import ready from 'lucide-static/icons/ruler.svg';
import coding from 'lucide-static/icons/code-xml.svg';
import deliver from 'lucide-static/icons/package.svg';
import test from 'lucide-static/icons/flask-conical.svg';
import bug from 'lucide-static/icons/bug.svg';
import done from 'lucide-static/icons/circle-check.svg';
import closed from 'lucide-static/icons/circle-slash-2.svg';
import handoff from 'lucide-static/icons/arrow-right-left.svg';
import caret from 'lucide-static/icons/chevron-right.svg';
import designLocal from 'lucide-static/icons/image.svg';
import designDownload from 'lucide-static/icons/download.svg';
import brief from 'lucide-static/icons/file-text.svg';
import folder from 'lucide-static/icons/folder-open.svg';
import commit from 'lucide-static/icons/git-commit-horizontal.svg';
import warn from 'lucide-static/icons/triangle-alert.svg';
import ext from 'lucide-static/icons/external-link.svg';
import search from 'lucide-static/icons/search.svg';
import term from 'lucide-static/icons/terminal.svg';
import link from 'lucide-static/icons/link-2.svg';
import play from 'lucide-static/icons/play.svg';
import close from 'lucide-static/icons/x.svg';
import check from 'lucide-static/icons/check.svg';
import dot from 'lucide-static/icons/circle.svg';
import goal from 'lucide-static/icons/circle-check-big.svg';
import calendar from 'lucide-static/icons/calendar-days.svg';
import diff from 'lucide-static/icons/git-compare.svg';
import push from 'lucide-static/icons/cloud-upload.svg';
import radar from 'lucide-static/icons/radar.svg';
import trend from 'lucide-static/icons/trending-up.svg';
import boxOff from 'lucide-static/icons/square.svg';
import boxOn from 'lucide-static/icons/square-check-big.svg';
import sheet from 'lucide-static/icons/file-spreadsheet.svg';
import question from 'lucide-static/icons/circle-help.svg';
import gate from 'lucide-static/icons/shield-check.svg';
import lesson from 'lucide-static/icons/lightbulb.svg';

const RAW = {
  wait,
  ready,
  coding,
  deliver,
  test,
  bug,
  done,
  closed,
  handoff,
  caret,
  'design-local': designLocal,
  'design-download': designDownload,
  brief,
  folder,
  commit,
  warn,
  ext,
  search,
  term,
  link,
  play,
  close,
  check,
  dot,
  goal,
  calendar,
  diff,
  push,
  radar,
  trend,
  'box-off': boxOff,
  'box-on': boxOn,
  sheet,
  question,
  gate,
  lesson,
};

const CLS_SLOT = '__ICON_CLASS__';

/** Bỏ license comment + width/height cứng, hạ stroke-width, chừa 1 chỗ để gắn class */
function normalize(svg) {
  const cleaned = String(svg)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+(?:width|height)="[^"]*"/g, '')
    .replace(/stroke-width="[^"]*"/, 'stroke-width="1.75"')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.includes('class="')
    ? cleaned.replace(/class="[^"]*"/, CLS_SLOT)
    : cleaned.replace('<svg', '<svg ' + CLS_SLOT);
}

const CACHE = Object.fromEntries(Object.entries(RAW).map(([name, svg]) => [name, normalize(svg)]));

/**
 * `icon('coding')` → string SVG đã gắn class .ic (+ class phụ nếu truyền).
 * Tên chưa khai báo → trả '' (không phá layout, không throw giữa lúc render).
 */
export function icon(name, cls = '') {
  const svg = CACHE[name];
  if (!svg) return '';
  return svg.replace(CLS_SLOT, `class="ic${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"`);
}
