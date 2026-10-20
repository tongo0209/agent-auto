#!/usr/bin/env node
import os from 'node:os';
import { sandboxDenial } from './sandbox.mjs';

let raw = '';
process.stdin.on('data', (d) => (raw += d)).on('end', () => {
  let reason;
  // hook lỗi = exit 1 = Claude Code cho lệnh chạy tiếp, nên lỗi phải thành từ chối
  try {
    reason = sandboxDenial(JSON.parse(raw), os.homedir(), process.argv.slice(2));
  } catch (e) {
    reason = `autopilot: hook sandbox không phân tích được lệnh (${e.message}) — viết lại lệnh đơn giản hơn`;
  }
  if (reason) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
});
