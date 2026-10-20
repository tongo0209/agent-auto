// Chế độ chat: mỗi task một tab claude tương tác, máy chỉ giữ khoá repo, board và cổng cơ học
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

const isLegacy = (run) => Object.keys(run.worktrees ?? {}).length > 0;

// Run cũ (trước R19) vẫn mở trong worktree của nó; run mới làm thẳng trên repo gốc
export const chatCwd = (run) => (isLegacy(run) ? toWorktree(run.worktrees, run.repo) : run.repo) ?? REPO_ROOT;

function placeOf(run) {
  if (isLegacy(run)) return `Worktree riêng (run cũ): \`${chatCwd(run)}\`. Không push.`;
  const branch = run.workBranch?.[run.repo] ?? Object.values(run.workBranch ?? {})[0] ?? '(đang checkout)';
  return `Làm thẳng trên repo gốc \`${chatCwd(run)}\`, nhánh \`${branch}\` — không checkout/reset/stash/clean, không đổi nhánh; file dở của phiên khác để nguyên. Không push.`;
}
export const briefFile = (run) => path.join(runDir(run.key, run.runId), 'brief.md');
export const attachFile = (run) => path.join(runDir(run.key, run.runId), 'attach.md');

const SOURCE_RULE = 'KHÔNG push. Commit chỉ qua cổng `gates <KEY> commit` (add đúng file run đổi, cdn-source tự pull master sau commit) — không tự `git add -A`/commit tay.';

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

${placeOf(run)}

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

${SOURCE_RULE}

Xong hết và user đồng ý thì chạy \`node ${CLI} done ${run.key}\`.
`;
}

const launchOf = (run, start) => ({ key: run.key, runId: run.runId, cwd: chatCwd(run), args: [...start, ...sandboxArgs(Object.keys(run.workBranch ?? {}))], env: { AUTOPILOT_RUN: `${run.key}/${run.runId}` } });

export function chatLaunch(run, { resume = false } = {}) {
  const session = resume ? latestSession(chatCwd(run)) : null;
  return launchOf(run, session ? ['--resume', session.id] : [`Đọc ${briefFile(run)} rồi bắt đầu bước đầu tiên. Vướng gì cần quyết thì hỏi tôi, đừng tự đoán.`]);
}

export const attachLaunch = (run) => launchOf(run, [`Đọc ${attachFile(run)} để nắm run ${run.key}, rồi chờ tôi nói cần làm gì.`]);

const COMMAND_HELP = {
  pause: ['pause {key}', 'dừng ngay bước claude đang chạy (resume nối tiếp đúng phiên)'],
  resume: ['resume {key} [--note "…"]', 'chạy tiếp run đã dừng/bị ngắt; note nhắn vào bước bị dừng'],
  approve: ['approve {key} [--note "…"]', 'duyệt mốc đang chờ, máy chạy tiếp'],
  reject: ['reject {key} --note "…"', 'trả về cho máy tự sửa lại theo note (run xong: chạy lại fix → cổng → commit chồng lên)'],
  reviewed: ['reviewed {key}', 'đánh dấu user đã review code'],
  followup: ['open {key} --followup --note "…"', 'chuyển run sang chat để sửa tay ngay trong tab này; sau đó dùng `gates`, `gates commit`, `mark`, `done` như brief.md mới ghi'],
  abort: ['abort {key}', 'huỷ run: tắt tiến trình, xoá thư mục run, in file run đã đổi chưa commit (không đụng repo) — chỉ khi user bảo rõ'],
  status: ['status {key}', 'xem trạng thái run'],
};
const COMMANDS_BY_STATUS = {
  running: ['pause', 'resume'],
  paused: ['approve', 'reject'],
  attached: ['approve'],
  stopped: ['resume'],
  done: ['reviewed', 'reject', 'followup'],
};

const STATUS_NOTE = {
  running: 'Máy đang tự chạy trên repo này: phải `pause` trước khi sửa file, nếu không sẽ giẫm lên bước đang chạy.',
  paused: 'Run đang chờ user duyệt ở bước hiện tại.',
  attached: 'Run chờ user chạy lệnh của bước hiện tại trong một phiên claude rồi duyệt.',
  stopped: 'Run đã dừng; sửa xong thì `resume` để máy chạy tiếp.',
  done: 'Run đã xong, code đã commit; user đang review.',
};

export function attachBriefOf(run, flow, changes) {
  const artifacts = fs.readdirSync(runDir(run.key, run.runId)).filter((f) => /\.(md|json)$/.test(f) && !['run.json', 'brief.md', 'attach.md'].includes(f));
  const commands = [...(COMMANDS_BY_STATUS[run.status] ?? []), 'status', 'abort'].map((name) => {
    const [usage, meaning] = COMMAND_HELP[name];
    return `| \`node ${CLI} ${usage.replace('{key}', run.key)}\` | ${meaning} |`;
  });
  const repoBlocks = changes.map((c) => `### ${c.name} · nhánh \`${c.branch}\` · \`${c.worktree}\`
${c.commits.map((x) => `- commit ${x.sha.slice(0, 9)} ${x.subject}`).join('\n') || '- chưa có commit'}
${c.files.map((f) => `- ${f.status} \`${f.path}\``).join('\n')}${c.cherryPick ? `\n- đưa vào source (user tự chạy): \`${c.cherryPick}\`` : ''}`);
  return `# ${run.key} · ${flow.label}

Tab này mở từ board Autopilot để user làm mọi việc với run qua bạn. ${placeOf(run)}

## Trạng thái
- ${run.status}${run.stage ? ` · bước \`${run.stage}\`` : ''}${run.stopReason ? ` · lý do dừng: ${run.stopReason}` : ''}
- ${STATUS_NOTE[run.status]}
${run.rejectNote ? `- lần trả về trước: ${run.rejectNote}\n` : ''}
## Các lượt đã chạy
${run.receipts.map((r) => `- ${r.stage} · vòng ${r.round} · ${r.verdict}${r.note ? ` · ${r.note}` : ''}`).join('\n') || '- chưa có'}

## Thay đổi
${repoBlocks.join('\n\n') || '_chưa có thay đổi_'}

## Artifact (trong \`${runDir(run.key, run.runId)}\`)
${artifacts.map((f) => `- \`${f}\``).join('\n') || '- chưa có'}

## Lệnh autopilot dùng được lúc này
| Lệnh | Ý nghĩa |
|---|---|
${commands.join('\n')}

## Luật
- ${SOURCE_RULE}
- Lệnh đổi trạng thái run (reject, resume, approve, abort…) chỉ chạy khi user bảo.
`;
}

export function followupBriefOf(run, changes, note) {
  const repoBlocks = changes.map((c) => `### ${c.name} · nhánh \`${c.branch}\` · \`${c.worktree}\`
${c.commits.map((x) => `- commit ${x.sha.slice(0, 9)} ${x.subject}`).join('\n') || '- chưa có commit'}
${c.files.map((f) => `- ${f.status} \`${f.path}\``).join('\n')}`);
  return `# ${run.key} · sửa tiếp sau review

Run đã xong và đã commit; user review rồi muốn sửa thêm. ${placeOf(run)}

## Lời nhắn của user
${note?.trim() || '_(chưa ghi — hỏi user cần sửa gì)_'}

## Đã sửa ở các lượt trước
${repoBlocks.join('\n\n')}

## Cổng + commit
Sửa xong: \`node ${CLI} gates ${run.key}\`, đạt thì commit chồng lên: \`node ${CLI} gates ${run.key} commit\`.
Báo tiến độ: \`node ${CLI} mark ${run.key} ${run.stage} <doing|pass|fail|ask> --note "…"\`.

${SOURCE_RULE}

Xong và user đồng ý thì chạy \`node ${CLI} done ${run.key}\` để review lại.
`;
}
