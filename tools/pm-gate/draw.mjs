// PG-DRAW (kit luật 6): trang có pm__rut phải khai prodTemplate trước lib — đọc HTML thô vì scan.mjs làm trống ruột <script>.
import vm from 'node:vm';

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const DECLARES_PROD_TEMPLATE = /\b(var|let|const)\s+prodTemplate\s*=/;
const MODULE_TYPE = /\btype\s*=\s*["']?module\b/;
const LIB_SRC = /\bsrc\s*=\s*["'][^"']*libraryMainsite-[^"']*\.js/;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const LAST_COMMENT = /<!--((?:(?!-->)[\s\S])*)-->\s*$/;
const IN_PROMOTION_DIR = /(^|\/)Promotion\//;
const ITEMS_META = new Set(['length', 'type']);

const UNDECLARED = /^(\w+) is not defined$/;
const MAX_PLATFORM_GLOBALS = 10;

// const cấp trên cùng không thành thuộc tính của context vm ⇒ gán qua globalThis để đọc ra.
// Biến platform chèn lúc chạy (mainProgramUrl) ⇒ gán undefined, chạy lại trên context mới vì context cũ đã khai dở `const`.
function evaluate(body) {
  const platformGlobals = {};
  for (let attempt = 0; attempt <= MAX_PLATFORM_GLOBALS; attempt++) {
    const context = { window: {}, ...platformGlobals };
    try {
      vm.runInNewContext(`${body}\n;globalThis.__prodTemplate = prodTemplate;`, context, { timeout: 100 });
      return { config: context.__prodTemplate };
    } catch (error) {
      const missing = UNDECLARED.exec(error.message)?.[1];
      if (!missing || missing === 'prodTemplate') return { error };
      platformGlobals[missing] = undefined;
    }
  }
  return { error: new Error(`quá ${MAX_PLATFORM_GLOBALS} biến chưa khai`) };
}

const indexesWith = (els, has) => els.flatMap((el, i) => (has(el) ? [i] : []));

export function checkDraw({ els, contract, fullDocument, raw, file, add }) {
  if (!fullDocument || contract.gameplay === 'payment' || IN_PROMOTION_DIR.test(file)) return;
  if (!els.some((el) => el.classes.includes('pm__rut'))) return;

  // Kit có comment nhắc `<script> libraryMainsite`: xoá comment giữ nguyên độ dài để index khớp raw.
  const code = raw.replace(HTML_COMMENT, (comment) => ' '.repeat(comment.length));
  const scripts = [...code.matchAll(SCRIPT)];
  const block = scripts.find(([, , body]) => DECLARES_PROD_TEMPLATE.test(body));
  if (!block) return add('PG-DRAW', 'prodTemplate', 'trang có pm__rut thiếu khối `prodTemplate` — dán từ components/fe-draw/config-production.html (kit luật 6)');
  const [, attrs, body] = block;
  if (MODULE_TYPE.test(attrs)) return add('PG-DRAW', 'prodTemplate', '`prodTemplate` khai trong <script type="module"> — lib đọc tên trần `typeof prodTemplate` nên không thấy');
  const lib = scripts.find(([, libAttrs]) => LIB_SRC.test(libAttrs));
  if (lib && lib.index < block.index) add('PG-DRAW', 'prodTemplate', 'khối `prodTemplate` đứng sau <script libraryMainsite-*.js> — phải khai trước khi lib nạp');
  if (!LAST_COMMENT.exec(raw.slice(0, block.index))?.[1].includes('BACKEND:')) {
    add('PG-DRAW', 'BACKEND:', 'thiếu comment `<!-- BACKEND: … -->` ngay trước khối `prodTemplate` (chỉ khoảng trắng xen giữa)');
  }

  const spoints = indexesWith(els, (el) => el.classes.includes('spoint'));
  if (!spoints.length) add('PG-DRAW', 'spoint', 'không phần tử nào mang class `spoint` — lib (el.cp mặc định .spoint) không đọc được số lượt; kit đòi `class="pm__point spoint"` (bundle truyền el.cp riêng như revelation 62896 vẫn chạy, thêm spoint vô hại)');
  else if (!spoints.some((i) => els[i].classes.includes('pm__point'))) {
    add('PG-DRAW', 'spoint', '`spoint` và `pm__point` nằm khác thẻ — kit đòi cùng thẻ `class="pm__point spoint"`', spoints, { soft: true });
  }

  const { config, error } = evaluate(body);
  if (error?.message === 'prodTemplate is not defined') return add('PG-DRAW', 'prodTemplate', '`prodTemplate` không khai ở cấp trên cùng của <script> — lib không đọc được');
  if (error) return add('PG-DRAW', 'prodTemplate', `không đọc được khối \`prodTemplate\` (${error.message}) — soát tay names/items/data-item`, [], { soft: true });
  if (!Object.keys(config ?? {}).length) {
    return add('PG-DRAW', 'prodTemplate', 'khối `prodTemplate` rỗng — kit luật 6 đòi FE điền items/names theo components/fe-draw/config-production.html');
  }

  const names = config.names ?? {};
  if (!names.en) add('PG-DRAW', 'names.en', 'thiếu `names.en` — lib 1.3.2 bắt buộc');
  const bodyIndex = els.findIndex((el) => el.tag === 'body');
  const bodyClass = els[bodyIndex]?.attrs.get('class');
  if (!names[bodyClass]) {
    const key = bodyClass || '<body không class>';
    add('PG-DRAW', `names.${key}`, `thiếu \`names["${key}"]\` — lib tra tên quà theo nguyên class của <body>, body chỉ nên mang class ngôn ngữ`, bodyIndex >= 0 ? [bodyIndex] : []);
  }

  const items = config.items ?? {};
  const giftValues = Object.entries(items).filter(([key]) => !ITEMS_META.has(key)).map(([, value]) => value);
  if (!items.type || items.length !== giftValues.length) {
    add('PG-DRAW', 'items', `\`items\` phải có \`type\` và \`length\` = số mã quà (${giftValues.length}), đang là ${items.length}`);
  }

  const giftCells = indexesWith(els, (el) => el.attrs.has('data-item'));
  if (!giftCells.length) return add('PG-DRAW', 'data-item', 'không ô quà nào mang `data-item` — hiệu ứng rút không biết dừng ở ô nào', [], { soft: true });
  // Hiệu ứng mẫu so getAttribute('data-item') với String(indexImg) ⇒ items khai số vẫn khớp.
  const giftKeys = giftValues.map(String);
  const stray = giftCells.filter((i) => !giftKeys.includes(els[i].attrs.get('data-item')));
  // 🟡: production có data-item mang nghĩa riêng (JX1M 59399 đánh số ô), gate không biết trang dùng hiệu ứng nào.
  if (stray.length) add('PG-DRAW', 'data-item', `\`data-item\` không thuộc giá trị \`prodTemplate.items\` (${giftKeys.join(', ')}) — hiệu ứng mẫu kit sẽ dừng sai ô`, stray, { soft: true });
}
