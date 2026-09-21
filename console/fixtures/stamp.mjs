import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Chép fixture ra /tmp và làm tươi `openBugsAt` — cảnh báo reopened chỉ sinh khi lượt quét <6h */
export function stampFixture(name) {
  const state = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, `${name}.json`), 'utf8'));
  const now = new Date().toISOString();
  for (const entry of Object.values(state.bugWatch)) if (entry.openBugsAt) entry.openBugsAt = now;

  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'console-fixture-')), `${name}.json`);
  fs.writeFileSync(out, JSON.stringify(state, null, 2));
  return out;
}

if (process.argv[2]) console.log(stampFixture(process.argv[2]));
