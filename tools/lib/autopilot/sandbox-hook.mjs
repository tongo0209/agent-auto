#!/usr/bin/env node
import os from 'node:os';
import { sandboxDenial } from './sandbox.mjs';

let raw = '';
process.stdin.on('data', (d) => (raw += d)).on('end', () => {
  const reason = sandboxDenial(JSON.parse(raw), os.homedir());
  if (reason) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
});
