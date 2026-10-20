// PG-DRAW (kit luật 6): trang có pm__rut phải khai prodTemplate trước lib — đọc HTML thô vì scan.mjs làm trống ruột <script>.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

// Khớp comment trước: `<script>` nằm trong comment (MASTER Lucky dòng 511) không mở khối; `<!--` trong chuỗi JS không thành comment.
const TAGS = /<!--[\s\S]*?-->|{#[\s\S]*?#}|<script\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/script\s*>|<(style|textarea|template)\b[^>]*>[\s\S]*?<\/\3\s*>/gi;
// Đầu câu lệnh: `// const prodTemplate` hay chuỗi "let prodTemplate" (ballistic, sofi preregister) không tính.
const DECLARES_PROD_TEMPLATE = /(?:^|[;{}]|\*\/)[ \t]*(var|let|const)\s+prodTemplate\s*=/m;
const TYPE = /(?:^|\s)type\s*=\s*["']?([^"'\s>]*)/i;
const CLASSIC_TYPE = /^((text|application)\/(java|ecma)script)?$/i;
const DEFER = /(?:^|\s)defer\b/i;
// Thân <script src> và <script nomodule> trình duyệt không chạy.
const BODY_SKIPPED = /(?:^|\s)(?:src\s*=|nomodule\b)/i;
const LIB_SRC = /(?:^|\s)src\s*=\s*["'][^"']*libraryMainsite-[^"']*\.js/;
const GT_PROMOTION_DIR = /(^|\/)gt-promotion-template\//;
const MAINSITE_DIR = /(^|\/)mainsite\//i;
const PROMOTION_DIR = /(^|\/)Promotion\//;
const ITEMS_META = new Set(['length', 'type']);
const CHILD_TIMEOUT_MS = 5000;
const EXTERNAL = '__pm_gate_external__:';
const EXTERNAL_NAMES = new RegExp(`${EXTERNAL}([\\w$]+)`, 'g');

// User chốt 20/10: gt-promotion chỉ soát mainsite/; ngoài đó (cdn-source) promotion/ là source nên vẫn soát.
const outOfScope = (file) => {
  const path = existsSync(file) ? realpathSync(file) : resolve(file);
  return GT_PROMOTION_DIR.test(path) ? !MAINSITE_DIR.test(path) : PROMOTION_DIR.test(path);
};

// Chạy trong node --permission (vm không phải sandbox): khối HTML không đọc/ghi file, không mạng, không treo gate.
function evaluateInChild(external) {
  process.kill = () => {
    throw new Error('process.kill bị chặn');
  };
  const vm = require('node:vm');
  const body = require('node:fs').readFileSync(0, 'utf8');
  const UNDECLARED = /^([\w$]+) is not defined$/;
  // Biến platform chèn lúc chạy (mainProgramUrl, $): stub gọi/đọc gì cũng ra chính nó, ghi ra tên biến để gate không coi là giá trị thật.
  const stubNames = new Map();
  const stubFor = (name) => {
    const asText = () => external + name;
    const stub = new Proxy(function () {}, { get: (target, key) => (key === Symbol.toPrimitive ? asText : stub), apply: () => stub, construct: () => stub });
    stubNames.set(stub, name);
    return stub;
  };
  const platformGlobals = {};
  const serialize = (key, value) => (stubNames.has(value) ? external + stubNames.get(value) : typeof value === 'function' ? '[fn]' : value);
  const answer = (result) => process.stdout.write(JSON.stringify(result, serialize));
  for (let attempt = 0; attempt <= 10; attempt++) {
    // const cấp trên cùng không thành thuộc tính của context ⇒ gán qua globalThis; context mới mỗi lần vì context cũ đã khai dở `const`.
    const context = { window: {}, ...platformGlobals };
    try {
      vm.runInNewContext(`${body}\n;globalThis.__prodTemplate = prodTemplate;`, context, { timeout: 100, microtaskMode: 'afterEvaluate' });
      return answer({ config: context.__prodTemplate ?? null });
    } catch (error) {
      const missing = UNDECLARED.exec(error.message)?.[1];
      if (!missing || missing === 'prodTemplate') return answer({ error: error.message });
      platformGlobals[missing] = stubFor(missing);
    }
  }
  answer({ error: 'quá 10 biến chưa khai' });
}

function childFailure(child) {
  if (child.error?.code === 'ETIMEDOUT') return `chạy quá ${CHILD_TIMEOUT_MS}ms`;
  if (child.error?.code === 'ENOBUFS') return 'khối in ra quá nhiều';
  return child.stderr.trim().split('\n').at(-1) || `tiến trình dừng (exit ${child.status ?? child.signal}) trước khi trả kết quả`;
}

function evaluate(body) {
  const child = spawnSync(process.execPath, ['--permission', '-e', `(${evaluateInChild})(${JSON.stringify(EXTERNAL)})`], { input: body, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, env: {} });
  if (child.stderr.includes('bad option: --permission')) {
    return { error: `node ${process.versions.node} chưa có cờ --permission — PG-DRAW chưa soát names/items/data-item, nâng node ≥ 22.13 rồi chạy lại` };
  }
  try {
    return JSON.parse(child.stdout);
  } catch {
    return { error: childFailure(child) };
  }
}

const indexesWith = (els, has) => els.flatMap((el, i) => (has(el) ? [i] : []));

export function checkDraw({ els, contract, fullDocument, raw, file, add }) {
  if (!fullDocument || contract.gameplay === 'payment' || outOfScope(file)) return;
  if (!els.some((el) => el.classes.includes('pm__rut'))) return;

  const tags = [...raw.matchAll(TAGS)];
  const scripts = tags.filter(([, attrs]) => attrs !== undefined).map((tag) => ({ tag, attrs: tag[1], body: tag[2], type: TYPE.exec(tag[1])?.[1] ?? '' }));
  const declaring = scripts.filter(({ body }) => DECLARES_PROD_TEMPLATE.test(body));
  const block = declaring.find(({ type, attrs }) => CLASSIC_TYPE.test(type) && !BODY_SKIPPED.test(attrs));
  if (!block) {
    if (declaring.some(({ type }) => type.toLowerCase() === 'module')) return add('PG-DRAW', 'prodTemplate', '`prodTemplate` khai trong <script type="module"> — lib đọc tên trần `typeof prodTemplate` nên không thấy');
    return add('PG-DRAW', 'prodTemplate', 'trang có pm__rut thiếu khối `prodTemplate` — dán từ components/fe-draw/config-production.html (kit luật 6)');
  }
  const lib = scripts.find(({ attrs }) => LIB_SRC.test(attrs) && !DEFER.test(attrs));
  if (lib && lib.tag.index < block.tag.index) add('PG-DRAW', 'prodTemplate', 'khối `prodTemplate` đứng sau <script libraryMainsite-*.js> — phải khai trước khi lib nạp');
  // {# #} biến mất khi render ⇒ không tính là chen giữa.
  const before = tags.slice(0, tags.indexOf(block.tag)).filter(([text]) => !text.startsWith('{#')).at(-1);
  const gap = before ? raw.slice(before.index + before[0].length, block.tag.index).replace(/{#[\s\S]*?#}/g, '') : '';
  const adjacent = before && !gap.trim();
  if (!adjacent || !before[0].startsWith('<!--') || !before[0].includes('BACKEND:')) {
    add('PG-DRAW', 'BACKEND:', 'thiếu comment `<!-- BACKEND: … -->` ngay trước khối `prodTemplate` (chỉ khoảng trắng xen giữa)');
  }

  const spoints = indexesWith(els, (el) => el.classes.includes('spoint'));
  if (!spoints.length) add('PG-DRAW', 'spoint', 'không phần tử nào mang class `spoint` — lib (el.cp mặc định .spoint) không đọc được số lượt; kit đòi `class="pm__point spoint"` (bundle truyền el.cp riêng như revelation 62896 vẫn chạy, thêm spoint vô hại)');
  else if (!spoints.some((i) => els[i].classes.includes('pm__point'))) {
    add('PG-DRAW', 'spoint', '`spoint` và `pm__point` nằm khác thẻ — kit đòi cùng thẻ `class="pm__point spoint"`', spoints, { soft: true });
  }

  const { config, error } = evaluate(block.body);
  if (error === 'prodTemplate is not defined') return add('PG-DRAW', 'prodTemplate', '`prodTemplate` không khai ở cấp trên cùng của <script> — lib không đọc được');
  if (error) return add('PG-DRAW', 'prodTemplate', `không đọc được khối \`prodTemplate\` (${error}) — soát tay names/items/data-item`, [], { soft: true });
  const external = [...new Set([...JSON.stringify(typeof config === 'string' ? config : [config?.names, config?.items]).matchAll(EXTERNAL_NAMES)].map(([, name]) => name))];
  if (external.length) {
    return add('PG-DRAW', 'prodTemplate', `names/items lấy từ biến ngoài khối (${external.join(', ')}) — gate không đọc được giá trị, soát tay names/items/data-item`, [], { soft: true });
  }
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
