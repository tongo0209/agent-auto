import fs from 'node:fs';
import path from 'node:path';

function pathsRead(logTexts) {
  const read = new Set();
  for (const line of logTexts.join('\n').split('\n')) {
    if (!line.includes('"Read"')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    for (const part of event.message?.content ?? []) {
      if (part.type === 'tool_use' && part.name === 'Read') read.add(path.resolve(part.input?.file_path ?? ''));
    }
  }
  return read;
}

// Stage so design chỉ được pass khi mọi ảnh khai làm bằng chứng có trên đĩa VÀ đã được mở bằng Read trong phiên
export function missingEvidence(files, logTexts) {
  if (!files.length) return ['không khai ảnh bằng chứng nào (evidence rỗng)'];
  const read = pathsRead(logTexts);
  return files
    .map((f) => path.resolve(f))
    .flatMap((f) => (!fs.existsSync(f) ? [`${f}: không có trên đĩa`] : !read.has(f) ? [`${f}: chưa mở bằng Read`] : []));
}
