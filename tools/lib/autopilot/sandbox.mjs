// Hook PreToolUse cho claude của autopilot khi chưa bật AUTOPILOT_LAB_WRITES: chỉ được ghi trong worktree của run
import path from 'node:path';

const PROTECTED = ['VNG/git-vng', 'VNG/agent-auto', '.claude'];
const WRITE_TOOLS = { Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };
const WRITES_EVERY_ARG = new Set(['rm', 'mv', 'tee', 'touch', 'mkdir', 'chmod', 'truncate']);
const WRITES_LAST_ARG = new Set(['cp', 'ln', 'rsync']);
const GIT_WRITES = new Set(['commit', 'add', 'checkout', 'reset', 'push', 'pull', 'merge', 'rebase', 'stash', 'apply', 'restore', 'clean', 'switch', 'worktree', 'tag', 'rm', 'mv', 'cherry-pick', 'revert', 'am']);
const READ_ONLY_TOOLS = ['pm-gate.mjs', 'layout-gate.mjs', 'landing-parity.mjs'];
const PROJECT_NOTE_READS = ['path', 'show', 'get'];
const INLINE_WRITE_SIGN = /['"][wa]\+?['"]|writeFile|appendFile|rmSync|unlink|rename|mkdir/;

const expandHome = (text, home) => text.replace(/\$\{HOME\}|\$HOME|(^|[\s'"=:(>])~(?=\/)/g, (m, lead = '') => (m.startsWith('$') ? home : `${lead}${home}`));

const protectedRootOf = (target, home) =>
  PROTECTED.map((p) => path.join(home, p)).find((root) => target === root || target.startsWith(`${root}/`));

// Tách theo ; && || | xuống dòng (ngoài nháy), mỗi đoạn là mảng token đã bỏ nháy
function splitSegments(command) {
  const segments = [[]];
  let token = null;
  let quote = null;
  const endToken = () => {
    if (token !== null) segments.at(-1).push(token);
    token = null;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else token += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      token ??= '';
    } else if (c === '\n' || c === ';' || c === '|' || (c === '&' && command[i + 1] === '&')) {
      endToken();
      segments.push([]);
      if (command[i + 1] === c) i++;
    } else if (/\s/.test(c)) endToken();
    else token = (token ?? '') + c;
  }
  endToken();
  return segments.filter((s) => s.length);
}

function redirectTargets(tokens) {
  const targets = [];
  tokens.forEach((t, i) => {
    const glued = t.match(/^\d*>>?(.*)$/);
    if (!glued) return;
    const target = glued[1] || tokens[i + 1];
    if (target && !target.startsWith('&') && target !== '/dev/null') targets.push(target);
  });
  return targets;
}

function gitWriteDir(args, cwd) {
  let dir = cwd;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-C') dir = path.resolve(dir, args[++i]);
    else if (!args[i].startsWith('-')) {
      const writes = GIT_WRITES.has(args[i]) || (args[i] === 'branch' && args.some((a) => /^-[dDmMf]$/.test(a)));
      return writes ? dir : null;
    }
  }
  return null;
}

function nodeToolIsReadOnly(args, toolsDir) {
  const scriptIndex = args.findIndex((a) => !a.startsWith('-'));
  const script = args[scriptIndex];
  if (path.dirname(script) !== toolsDir) return false;
  if (READ_ONLY_TOOLS.includes(path.basename(script))) return true;
  return path.basename(script) === 'project-note.mjs' && PROJECT_NOTE_READS.includes(args[scriptIndex + 1]);
}

function segmentWriteTargets([program, ...args], cwd, home) {
  const writeTargets = redirectTargets(args);
  if (WRITES_EVERY_ARG.has(program)) writeTargets.push(...args);
  if (WRITES_LAST_ARG.has(program)) writeTargets.push(args.at(-1));
  if (program === 'sed' && args.some((a) => /^(-i|--in-place)/.test(a))) writeTargets.push(...args);
  if (program === 'perl' && args.some((a) => /^-\w*i/.test(a))) writeTargets.push(...args);
  if (program === 'git') writeTargets.push(gitWriteDir(args, cwd));
  if (program === 'npm' || program === 'npx') writeTargets.push(cwd);
  if (/^(node|python3?)$/.test(program)) {
    const inlineScript = args.find((a, i) => /^-[ce]$/.test(args[i - 1]));
    const mentionedPath = inlineScript?.match(new RegExp(`${home}/[^'"\\s]*`))?.[0];
    if (mentionedPath && INLINE_WRITE_SIGN.test(inlineScript)) writeTargets.push(mentionedPath);
    const toolsDir = path.join(home, 'VNG/agent-auto/tools');
    const script = args.find((a) => !a.startsWith('-'));
    if (!inlineScript && script && protectedRootOf(path.resolve(cwd, script), home) && !nodeToolIsReadOnly(args, toolsDir)) writeTargets.push(script);
  }
  return writeTargets.filter(Boolean).map((t) => path.resolve(cwd, t));
}

function bashDenial(command, cwd, home) {
  const vars = {};
  for (const rawTokens of splitSegments(expandHome(command, home))) {
    const tokens = rawTokens.map((t) => t.replace(/\$\{?(\w+)\}?/g, (m, name) => vars[name] ?? m));
    const assignment = tokens.length === 1 && tokens[0].match(/^(\w+)=(.*)$/);
    if (assignment) vars[assignment[1]] = assignment[2];
    else if (tokens[0] === 'cd') cwd = path.resolve(cwd, tokens[1] ?? home);
    else {
      const root = segmentWriteTargets(tokens, cwd, home).map((t) => protectedRootOf(t, home)).find(Boolean);
      if (root) return root;
    }
  }
  return null;
}

export function sandboxDenial({ tool_name, tool_input = {}, cwd }, home) {
  const field = WRITE_TOOLS[tool_name];
  if (field) {
    const target = path.resolve(cwd, expandHome(tool_input[field] ?? '', home));
    const root = protectedRootOf(target, home);
    return root ? `autopilot chạy thử: không được ghi vào ${root} — chỉ sửa trong worktree ${cwd}` : null;
  }
  if (tool_name !== 'Bash') return null;
  const root = bashDenial(tool_input.command ?? '', cwd, home);
  return root ? `autopilot chạy thử: lệnh ghi vào ${root} (source gốc) — chỉ đọc được, mọi thay đổi làm trong worktree ${cwd}` : null;
}
