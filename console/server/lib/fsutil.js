const fs = require('fs');

/** Đọc JSON, lỗi/không có → fallback (console không được sập vì file người dùng) */
function readJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Đọc .jsonl → mảng object, bỏ qua dòng lỗi */
function readJSONL(filePath) {
  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function listFiles(dirPath, ext) {
  try {
    return fs.readdirSync(dirPath).filter((f) => f.endsWith(ext));
  } catch {
    return [];
  }
}

/** YYYY-MM-DD theo giờ máy */
function todayStr(d = new Date()) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function daysBetween(fromISO, toISO) {
  return Math.round((new Date(toISO + 'T00:00:00') - new Date(fromISO + 'T00:00:00')) / 864e5);
}

module.exports = { readJSON, readJSONL, listFiles, todayStr, daysBetween };
