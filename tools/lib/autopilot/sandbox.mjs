// Hook PreToolUse cho claude của autopilot khi chưa bật AUTOPILOT_LAB_WRITES: chỉ được ghi trong worktree của run
import path from 'node:path';

const PROTECTED = ['VNG/git-vng', 'VNG/agent-auto', '.claude'];
const READ_ONLY_TOOLS = /\S*\/VNG\/agent-auto\/tools\/(pm-gate|layout-gate|landing-parity)\.mjs/g;
const PROTECTED_IN_COMMAND = /(^|[^\w-])(git-vng|agent-auto|\.claude)(?=$|[/\s'"`;)])/;
const WRITE_TOOLS = { Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };

const expandHome = (text, home) => text.replace(/\$\{HOME\}|\$HOME|(^|[\s'"=:(])~(?=\/)/g, (m, lead = '') => (m.startsWith('$') ? home : `${lead}${home}`));

export function sandboxDenial({ tool_name, tool_input = {}, cwd }, home) {
  const field = WRITE_TOOLS[tool_name];
  if (field) {
    const target = path.resolve(cwd, expandHome(tool_input[field] ?? '', home));
    const root = PROTECTED.map((p) => path.join(home, p)).find((r) => target === r || target.startsWith(`${r}/`));
    return root ? `autopilot chạy thử: không được ghi vào ${root} — chỉ sửa trong worktree ${cwd}` : null;
  }
  if (tool_name !== 'Bash') return null;
  const command = expandHome(tool_input.command ?? '', home).replace(READ_ONLY_TOOLS, '');
  const hit = command.match(PROTECTED_IN_COMMAND)?.[2];
  return hit ? `autopilot chạy thử: lệnh nhắm vào ${hit} (source gốc) — chỉ làm trong worktree ${cwd}` : null;
}
