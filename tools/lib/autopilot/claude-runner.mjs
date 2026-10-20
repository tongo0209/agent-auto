import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { labWritesOn } from './worktree.mjs';

const REVIEW = ['Read', 'Grep', 'Glob', 'Write', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git status:*)', 'Bash(node:*)'];
const IMPLEMENT = [...REVIEW, 'Edit', 'Skill', 'Agent', 'Bash(npm run:*)', 'Bash(npm ci:*)', 'Bash(npx:*)', 'Bash(ls:*)', 'Bash(python3:*)'];

export const TOOLSETS = {
  review: REVIEW.join(','),
  drift: [...REVIEW, 'Bash(curl:*)', 'Bash(diff:*)'].join(','),
  implement: IMPLEMENT.join(','),
  browser: [...IMPLEMENT, 'mcp__browserpilot__*'].join(','),
  cut: [...IMPLEMENT, 'Bash(osascript:*)', 'mcp__claude_ai_Figma__*'].join(','),
  intake: [
    ...IMPLEMENT,
    'mcp__claude_ai_Google_Drive__read_file_content',
    'mcp__claude_ai_Google_Drive__get_file_metadata',
    'mcp__claude_ai_Microsoft_365__read_resource',
  ].join(','),
};

const SANDBOX_SETTINGS = JSON.stringify({
  hooks: { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash', hooks: [{ type: 'command', command: `node ${path.join(import.meta.dirname, 'sandbox-hook.mjs')}` }] }] },
});
const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const FAKE_PASS = '```autopilot-verdict\n{"verdict":"pass"}\n```';

export const tokensOf = (usage = {}) =>
  (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);

export function buildClaudeArgs({ prompt, model, toolset, resumeSessionId }) {
  if (!TOOLSETS[toolset]) throw new Error(`toolset lạ: ${toolset}`);
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--allowedTools', TOOLSETS[toolset]];
  if (model) args.push('--model', model);
  if (resumeSessionId) args.push('--resume', resumeSessionId);
  if (!labWritesOn()) args.push('--settings', SANDBOX_SETTINGS);
  return args;
}

export const guardCode = (text = '') => text.match(/\bG-[A-Z]+-\d+\b/)?.[0] ?? null;

function runFake({ stageId, round }) {
  const script = JSON.parse(fs.readFileSync(process.env.AUTOPILOT_FAKE, 'utf8'));
  const entry = script[stageId]?.[round - 1] ?? script[stageId]?.at(-1) ?? { result: FAKE_PASS };
  return {
    ok: entry.ok ?? true,
    sessionId: `fake-${stageId}-${round}`,
    turns: entry.turns ?? 1,
    costUsd: entry.costUsd ?? 0,
    tokens: entry.tokens ?? 0,
    ms: 0,
    result: entry.result ?? FAKE_PASS,
    error: entry.ok === false ? 'fake error' : null,
  };
}

export function runClaude({ stageId, round, prompt, model, toolset, resumeSessionId, cwd, marker, timeoutMs = DEFAULT_TIMEOUT_MS, logFile }) {
  if (process.env.AUTOPILOT_FAKE) return Promise.resolve(runFake({ stageId, round }));

  const args = buildClaudeArgs({ prompt, model, toolset, resumeSessionId });
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd, env: { ...process.env, AUTOPILOT_RUN: marker }, stdio: ['ignore', 'pipe', 'pipe'] });
    if (logFile) fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const log = logFile ? fs.createWriteStream(logFile) : null;
    let lastLine = '';
    let pending = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      log?.write(d);
      pending += d;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) if (line.trim()) lastLine = line;
    });
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (pending.trim()) lastLine = pending;
      log?.end(stderr ? `\n--- stderr ---\n${stderr}` : '');
      const ms = Date.now() - started;
      let json;
      try {
        json = JSON.parse(lastLine);
        if (json.type !== 'result') throw new Error('thiếu sự kiện result');
      } catch {
        resolve({ ok: false, sessionId: null, turns: 0, costUsd: 0, ms, result: stderr, error: signal ? `timeout (${signal})` : `exit ${code}, không có sự kiện result` });
        return;
      }
      resolve({
        ok: code === 0 && !json.is_error,
        sessionId: json.session_id ?? null,
        turns: json.num_turns ?? 0,
        costUsd: json.total_cost_usd ?? 0,
        tokens: tokensOf(json.usage),
        ms: json.duration_ms ?? ms,
        result: json.result ?? '',
        error: code === 0 && !json.is_error ? null : `exit ${code}${json.subtype ? ` · ${json.subtype}` : ''}`,
      });
    });
  });
}
