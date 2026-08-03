import js from '@eslint/js';

/**
 * Flat config, cố tình HẸP: đợt này chỉ bắt lỗi thật (biến chết, `==`), KHÔNG format lại code cũ
 * — format toàn bộ sẽ tạo diff rác che mất thay đổi có nghĩa.
 */
const browser = {
  window: 'readonly', document: 'readonly', localStorage: 'readonly', navigator: 'readonly',
  Notification: 'readonly', WebSocket: 'readonly', fetch: 'readonly', location: 'readonly',
  URLSearchParams: 'readonly', requestAnimationFrame: 'readonly', console: 'readonly',
  setTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', clearTimeout: 'readonly',
};
const node = {
  require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly',
  Buffer: 'readonly', console: 'readonly', setTimeout: 'readonly', setInterval: 'readonly',
  URL: 'readonly', fetch: 'readonly',
};

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'src/**/*.mjs'],
    // ecmaVersion 2025 (không phải 2024 như bản nháp ban đầu): src/core/constants.mjs dùng
    // import attributes (`with { type: 'json' }`) — cú pháp ES2025, parser 2024 báo lỗi
    // "Unexpected token with". Đây là parsing error thật, không phải chỗ nới rule.
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: browser },
    rules: { eqeqeq: 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['server/**/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'commonjs', globals: node },
    rules: { eqeqeq: 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['server/**/*.test.mjs', 'src/**/*.test.mjs'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: node },
  },
  {
    // webpack.config.js nằm ở gốc console/, không khớp glob src/** hay server/** ở trên nên
    // rơi vào block js.configs.recommended mặc định (không có globals) → no-undef với
    // require/module/__dirname. File này là CommonJS Node thật, khai globals Node cho nó.
    files: ['webpack.config.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'commonjs', globals: node },
  },
];
