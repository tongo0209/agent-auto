// Tách khỏi TerminalManager để node --test chạy được (TerminalManager đụng jQuery + xterm).
const KEY = 'console.termlayout';
const DEFAULT_LAYOUT = { mode: 'auto', fullWidth: false, zoomed: false };

export const GRID_MODES = [
  { id: 'auto', label: 'tự động' },
  { id: 'all', label: 'xem tất cả' },
  { id: '1', label: '1 ô' },
  { id: '2x2', label: '2×2' },
  { id: '3x2', label: '3×2' },
  { id: '3x3', label: '3×3' },
];

const FIXED_GRID = {
  1: { cols: 1, rows: 1 },
  '2x2': { cols: 2, rows: 2 },
  '3x2': { cols: 3, rows: 2 },
  '3x3': { cols: 3, rows: 3 },
};

/** Lưới nhỏ nhất đủ chứa N terminal — cùng bộ khung với FIXED_GRID để user không thấy lạ */
const AUTO_STEPS = [
  { upTo: 1, cols: 1, rows: 1 },
  { upTo: 4, cols: 2, rows: 2 },
  { upTo: 6, cols: 3, rows: 2 },
  { upTo: Infinity, cols: 3, rows: 3 },
];

export function gridFor(mode, terminalCount) {
  if (mode === 'all') {
    const cols = Math.max(1, Math.ceil(Math.sqrt(terminalCount)));
    const rows = Math.max(1, Math.ceil(terminalCount / cols));
    return { cols, rows, cells: cols * rows };
  }
  const fixed = FIXED_GRID[mode];
  if (fixed) return { cols: fixed.cols, rows: fixed.rows, cells: fixed.cols * fixed.rows };
  const step = AUTO_STEPS.find((s) => terminalCount <= s.upTo);
  const rows = Math.min(step.rows, Math.max(1, Math.ceil(terminalCount / step.cols)));
  return { cols: step.cols, rows, cells: step.cols * rows };
}

/** Terminal nào được hiện trong lưới — luôn chứa terminal đang gõ, phần dư đi tiếp qua hàng tab */
export function visiblePanes(terminalCount, cells, activeIndex) {
  const total = Math.max(0, terminalCount);
  if (cells >= total) return Array.from({ length: total }, (_, i) => i);
  const active = Math.min(Math.max(activeIndex, 0), total - 1);
  const start = Math.min(Math.floor(active / cells) * cells, total - cells);
  return Array.from({ length: cells }, (_, i) => start + i);
}

export function loadLayout(storage) {
  let parsed;
  try {
    parsed = JSON.parse(storage.getItem(KEY));
  } catch {
    // Chưa lưu gì / dữ liệu hỏng đều về mặc định, không được chặn console mở lên
    return { ...DEFAULT_LAYOUT };
  }
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_LAYOUT };
  const known = GRID_MODES.some((m) => m.id === parsed.mode);
  return {
    mode: known ? parsed.mode : DEFAULT_LAYOUT.mode,
    fullWidth: Boolean(parsed.fullWidth),
    zoomed: Boolean(parsed.zoomed),
  };
}

export function saveLayout(storage, layout) {
  try {
    storage.setItem(
      KEY,
      JSON.stringify({ mode: layout.mode, fullWidth: Boolean(layout.fullWidth), zoomed: Boolean(layout.zoomed) })
    );
  } catch {
    // localStorage đầy/bị chặn — chỉ mất phần nhớ bố cục, phiên hiện tại vẫn chạy
  }
}
