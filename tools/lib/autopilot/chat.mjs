// Chế độ chat: mỗi task một tab claude tương tác, máy chỉ giữ worktree, board và cổng cơ học
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tokensOf, sandboxArgs } from './claude-runner.mjs';
import { runDir } from './store.mjs';
import { toWorktree } from './worktree.mjs';
import { PROMPTS_DIR } from './flows.mjs';
import { fillVars } from './prompts.mjs';
import { stageVars, commandFor } from './driver.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const CLI = path.join(REPO_ROOT, 'tools', 'autopilot.mjs');
const BRIEF_VARS = ['repo', 'campaignDir', 'campaignDirs', 'handoffDir', 'cloneSource', 'sheetUrl', 'sheetKind', 'runDir'];

const projectsDir = () => process.env.AUTOPILOT_CLAUDE_PROJECTS || path.join(os.homedir(), '.claude', 'projects');

export const chatCwd = (run) => (run.repo ? toWorktree(run.worktrees, run.repo) : REPO_ROOT);
export const briefFile = (run) => path.join(runDir(run.key, run.runId), 'brief.md');

// Claude Code lưu phiên ở ~/.claude/projects/<cwd, mọi ký tự ngoài chữ-số thành '-'>
export function latestSession(cwd) {
  const dir = path.join(projectsDir(), cwd.replace(/[^A-Za-z0-9]/g, '-'));
  if (!fs.existsSync(dir)) return null;
  const file = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  return file ? { id: path.basename(file, '.jsonl'), file } : null;
}

// Mỗi message assistant bị ghi lặp theo từng khối nội dung, cùng id cùng usage
export function sessionUsage(file) {
  const usageById = new Map();
  let first = null;
  let last = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.timestamp) {
      last = Date.parse(entry.timestamp);
      first ??= last;
    }
    if (entry.message?.usage) usageById.set(entry.message.id, entry.message.usage);
  }
  const tokens = [...usageById.values()].reduce((n, u) => n + tokensOf(u), 0);
  return { tokens, ms: first === null ? 0 : last - first };
}

function goalOf(stage, run, input) {
  if (stage.kind === 'gate') return `cổng cơ học ${stage.checks.join(', ')}: chạy \`node ${CLI} gates ${run.key}${stage.checks.includes('commit') ? ' commit' : ''}\``;
  if (stage.kind === 'pause') return `dừng hỏi user duyệt${stage.show ? ` (đưa user xem ${stage.show.join(', ')})` : ''}, mark \`ask\` trong lúc chờ`;
  if (stage.kind === 'attached') return `chạy \`${commandFor(stage, run)}\` ngay trong tab này`;
  const template = fs.readFileSync(path.join(PROMPTS_DIR, stage.prompt), 'utf8');
  const firstLine = template.split('\n').find((l) => l.trim() && !l.startsWith('#'));
  return `${fillVars(firstLine, stageVars(run, stage, input))} _(đủ yêu cầu: \`${path.join(PROMPTS_DIR, stage.prompt)}\`)_`;
}

export function briefOf(run, flow, input) {
  const vars = stageVars(run, flow.stages[0], input);
  const steps = flow.stages.map((s, i) => `${i + 1}. **${s.id}**${s.when ? ` _(chỉ khi ${s.when})_` : ''}: ${goalOf(s, run, input)}`);
  return `# ${run.key} · ${flow.label}: làm cùng user trong tab này

Worktree riêng: \`${chatCwd(run)}\`. Repo gốc bị sandbox chặn ghi; mọi sửa nằm trong worktree. Không push.

## Biến
${BRIEF_VARS.filter((name) => vars[name]).map((name) => `- ${name}: \`${vars[name]}\``).join('\n')}

## Các bước (luồng ${flow.id})
${steps.join('\n')}

## Báo tiến độ lên board
Bắt đầu, xong hay vướng một bước đều báo:
\`node ${CLI} mark ${run.key} <bước> <doing|pass|fail|ask> --note "…"\`
- \`ask\` = đang chờ user trả lời (board tô vàng "Chờ bạn"); user trả lời xong thì mark lại \`doing\`.

## Cổng cơ học
Tới bước cổng, hoặc trước khi báo xong: \`node ${CLI} gates ${run.key} [check…]\`. Lệnh in kết quả ngắn và ghi artifact vào run; đỏ thì sửa rồi chạy lại. Commit chỉ chạy khi gọi rõ \`gates ${run.key} commit\`.

Xong hết thì nhắc user bấm "Xong" trên board.
`;
}

export function chatLaunch(run, { resume = false } = {}) {
  const cwd = chatCwd(run);
  const session = resume ? latestSession(cwd) : null;
  const start = session ? ['--resume', session.id] : [`Đọc ${briefFile(run)} rồi bắt đầu bước đầu tiên. Vướng gì cần quyết thì hỏi tôi, đừng tự đoán.`];
  return { key: run.key, runId: run.runId, cwd, args: [...start, ...sandboxArgs()], env: { AUTOPILOT_RUN: `${run.key}/${run.runId}` } };
}

export function followupBriefOf(run, changes, note) {
  const repoBlocks = changes.map((c) => `### ${c.name} · nhánh \`${c.branch}\` · \`${c.worktree}\`
${c.commits.map((x) => `- commit ${x.sha.slice(0, 9)} ${x.subject}`).join('\n') || '- chưa có commit'}
${c.files.map((f) => `- ${f.status} \`${f.path}\``).join('\n')}`);
  return `# ${run.key} · sửa tiếp sau review

Run đã xong và commit trên nhánh riêng; user review rồi muốn sửa thêm. Sửa tiếp ngay trên worktree \`${chatCwd(run)}\`, commit chồng lên cùng nhánh. Repo gốc bị sandbox chặn ghi. Không push.

## Lời nhắn của user
${note?.trim() || '_(chưa ghi — hỏi user cần sửa gì)_'}

## Đã sửa ở các lượt trước
${repoBlocks.join('\n\n')}

## Cổng + commit
Sửa xong: \`node ${CLI} gates ${run.key}\`, đạt thì commit chồng lên nhánh: \`node ${CLI} gates ${run.key} commit\`.
Báo tiến độ: \`node ${CLI} mark ${run.key} ${run.stage} <doing|pass|fail|ask> --note "…"\`.

Xong thì nhắc user bấm "Xong" trên board để review lại.
`;
}
