import { execFileSync } from 'node:child_process';

export function notify(title, message) {
  process.stderr.write(`🔔 ${title}: ${message}\n`);
  if (process.env.AUTOPILOT_NO_NOTIFY) return;
  try {
    execFileSync('osascript', ['-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`]);
  } catch {
    // noti là best-effort: chưa cấp quyền Notifications không được làm hỏng run
  }
}
