// Hook PreToolUse cho claude của autopilot (luôn bật): chỉ được ghi trong repo của run (writable)
import path from 'node:path';

const LAB = 'VNG/agent-auto-lab';
const PROTECTED = ['VNG/git-vng', 'VNG/agent-auto', LAB, '.claude', '.claude-teamB', '.claude.json'];
const RUN_CONTROL_FILES = new Set(['run.json', '.pause', '.child']);
const WRITE_TOOLS = { Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };
const WRITES_EVERY_ARG = new Set(['rm', 'mv', 'tee', 'touch', 'mkdir', 'chmod', 'truncate']);
const WRITES_LAST_ARG = new Set(['cp', 'ln', 'rsync']);
const GIT_WRITES = new Set(['commit', 'add', 'checkout', 'reset', 'push', 'pull', 'merge', 'rebase', 'stash', 'apply', 'restore', 'clean', 'switch', 'worktree', 'tag', 'rm', 'mv', 'cherry-pick', 'revert', 'am',
  'checkout-index', 'read-tree', 'update-index', 'update-ref', 'symbolic-ref', 'sparse-checkout', 'bisect', 'gc', 'prune', 'filter-branch', 'replace', 'notes']);
const GIT_READ_FORMS = { stash: ['list', 'show'], worktree: ['list'], apply: ['--check', '--stat', '--numstat', '--summary'], tag: ['-l', '--list', '-n'], config: ['--get', '--get-all', '--get-regexp', '--list', '-l'] };
const WRAPPERS = new Set(['env', 'command', 'exec', 'nohup', 'time', 'nice', 'stdbuf']);
const BUILD_OUTPUT_DIRS = new Set(['dist', 'node_modules', '.cache']);
const XARGS_VALUE_FLAGS = new Set(['-n', '-I', '-L', '-P', '-d', '-s', '-E']);
const SHELLS = new Set(['sh', 'bash', 'zsh']);
const READ_ONLY_TOOLS = ['pm-gate.mjs', 'layout-gate.mjs', 'landing-parity.mjs', 'handoff-drift.mjs', 'fe-gate.mjs', 'check-promotion.mjs', 'baked-text-guard.py'];
const PROJECT_NOTE_READS = ['path', 'show', 'get'];
const INLINE_WRITE_SIGN = /['"][wa]\+?['"]|writeFile|appendFile|rmSync|unlink|rename|mkdir/;

const expandHome = (text, home) => text.replace(/\$\{HOME\}|\$HOME|(^|[\s'"=:(>])~(?=\/)/g, (m, lead = '') => (m.startsWith('$') ? home : `${lead}${home}`));

const isInside = (target, root) => target === root || target.startsWith(`${root}/`);
const protectedRootOf = (target, home, writable = []) =>
  writable.some((root) => isInside(target, root)) && !isRunControlFile(target, home) ? undefined : PROTECTED.map((p) => path.join(home, p)).find((root) => isInside(target, root));
// Thư mục run cho stage ghi báo cáo, nhưng file điều khiển (run.json, .pause, .child) chỉ engine được ghi
const isRunControlFile = (target, home) => RUN_CONTROL_FILES.has(path.basename(target)) && isInside(target, path.join(home, LAB, 'runs'));
const repoRoots = (writable, home) => writable.filter((root) => !isInside(root, path.join(home, LAB)));

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
    } else if (c === '\n' || c === ';' || (c === '|' && command[i - 1] !== '>') || (c === '&' && command[i + 1] !== '>' && command[i - 1] !== '>')) {
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
    const glued = t.match(/^(?:\d*|&)>[>|]?(.*)$/);
    if (!glued) return;
    const target = glued[1] || tokens[i + 1];
    if (target && !target.startsWith('&') && target !== '/dev/null') targets.push(target);
  });
  return targets;
}

// Bỏ lớp bọc (A=1, env, command, xargs, /usr/bin/git) để thấy chương trình thật
function unwrap(rawTokens) {
  const env = {};
  let viaXargs = false;
  let tokens = rawTokens.map((t, i) => (i === 0 ? t.replace(/^\\/, '') : t));
  for (;;) {
    const assignment = tokens[0]?.match(/^(\w+)=(.*)$/);
    if (assignment && tokens.length > 1) {
      env[assignment[1]] = assignment[2];
      tokens = tokens.slice(1);
    } else if (WRAPPERS.has(tokens[0]) || tokens[0] === 'timeout') {
      const takesDuration = tokens[0] === 'timeout';
      tokens = tokens.slice(1);
      while (tokens[0]?.startsWith('-')) tokens = tokens.slice(1);
      if (takesDuration) tokens = tokens.slice(1);
    } else if (tokens[0] === 'xargs') {
      let i = 1;
      while (tokens[i]?.startsWith('-')) i += XARGS_VALUE_FLAGS.has(tokens[i]) ? 2 : 1;
      tokens = tokens.slice(i);
      viaXargs = true;
    } else break;
  }
  if (tokens[0]) tokens[0] = path.basename(tokens[0].replace(/^\\/, ''));
  return { tokens, env, viaXargs };
}

const gitWrites = (sub, rest) => {
  if (sub === 'branch') return rest.some((a) => /^-[a-zA-Z]*[dDmMfcC]/.test(a) || /^--(delete|move|force|copy)$/.test(a));
  if (sub === 'tag' && !rest.length) return false;
  if (GIT_READ_FORMS[sub]?.some((form) => rest.includes(form))) return false;
  return sub === 'config' || GIT_WRITES.has(sub);
};

// Mọi thư mục mà lệnh git ghi có thể chạm (cwd sau -C, --git-dir, GIT_DIR); [] khi lệnh chỉ đọc
function gitWriteDirs(args, cwd, env = {}) {
  const dirs = [env.GIT_WORK_TREE, env.GIT_DIR].filter(Boolean).map((d) => path.resolve(cwd, d));
  let dir = cwd;
  let alias = false;
  for (let i = 0; i < args.length; i++) {
    const gitDirFlag = args[i].match(/^--(git-dir|work-tree)(?:=(.*))?$/);
    if (args[i] === '-C') dir = path.resolve(dir, args[++i]);
    else if (args[i] === '-c') alias ||= /^alias\./.test(args[++i] ?? '');
    else if (gitDirFlag) dirs.push(path.resolve(cwd, gitDirFlag[2] ?? args[++i]));
    else if (!args[i].startsWith('-')) return alias || gitWrites(args[i], args.slice(i + 1)) ? [dir, ...dirs] : [];
  }
  return [];
}

const optionValue = (args, names) => {
  const i = args.findIndex((a) => names.includes(a));
  if (i >= 0) return args[i + 1];
  const glued = args.find((a) => names.some((n) => n.startsWith('--') && a.startsWith(`${n}=`)));
  return glued?.slice(glued.indexOf('=') + 1);
};

function nodeToolIsReadOnly(args, toolsDir) {
  const scriptIndex = args.findIndex((a) => !a.startsWith('-'));
  const script = args[scriptIndex];
  if (path.dirname(script) !== toolsDir) return false;
  if (READ_ONLY_TOOLS.includes(path.basename(script))) return true;
  return path.basename(script) === 'project-note.mjs' && PROJECT_NOTE_READS.includes(args[scriptIndex + 1]);
}

// sips không có --out thì sửa ảnh tại chỗ; -g chỉ đọc thuộc tính
function sipsWriteTargets(args) {
  const out = optionValue(args, ['--out', '-o']);
  if (out) return [out];
  return args.some((a) => a === '-g' || a === '--getProperty') ? [] : args.filter((a) => !a.startsWith('-'));
}

function segmentWriteTargets([program, ...args], cwd, home, writable) {
  const writeTargets = redirectTargets(args);
  if (WRITES_EVERY_ARG.has(program)) writeTargets.push(...args);
  if (WRITES_LAST_ARG.has(program)) writeTargets.push(args.at(-1));
  if (program === 'sed' && args.some((a) => /^(-i|--in-place)/.test(a))) writeTargets.push(...args);
  if (program === 'perl' && args.some((a) => /^-\w*i/.test(a))) writeTargets.push(...args);
  if (program === 'git') writeTargets.push(...gitWriteDirs(args, cwd));
  if (program === 'npm' || program === 'npx') writeTargets.push(cwd, optionValue(args, ['--prefix']));
  if (program === 'dd') writeTargets.push(args.find((a) => a.startsWith('of='))?.slice(3));
  if (program === 'curl' || program === 'wget') writeTargets.push(optionValue(args, ['-o', '--output', '-O', '--output-document', '-P']));
  if (program === 'tar') writeTargets.push(optionValue(args, ['-C', '--directory']));
  if (program === 'unzip') writeTargets.push(optionValue(args, ['-d']));
  if (program === 'cp' || program === 'mv') writeTargets.push(optionValue(args, ['-t', '--target-directory']));
  if (program === 'sips') writeTargets.push(...sipsWriteTargets(args));
  if (/^(node|python3?)$/.test(program)) {
    const inlineScript = args.find((a, i) => /^-[ce]$/.test(args[i - 1]));
    const mentionedPath = inlineScript?.match(new RegExp(`${home}/[^'"\\s]*`))?.[0];
    if (mentionedPath && INLINE_WRITE_SIGN.test(inlineScript)) writeTargets.push(mentionedPath);
    const toolsDir = path.join(home, 'VNG/agent-auto/tools');
    const script = args.find((a) => !a.startsWith('-'));
    if (!inlineScript && script && protectedRootOf(path.resolve(cwd, script), home, writable) && !nodeToolIsReadOnly(args, toolsDir)) writeTargets.push(script);
  }
  return writeTargets.filter(Boolean).map((t) => path.resolve(cwd, t));
}

// Repo gốc có file dở của phiên khác: git ghi (checkout/reset/stash/clean/commit…) chỉ cổng commit được làm
function ownRepoGit(tokens, env, cwd, repos) {
  const dirs = tokens[0] === 'git' ? gitWriteDirs(tokens.slice(1), cwd, env) : [];
  return dirs.some((dir) => repos.some((root) => isInside(dir, root))) ? tokens.join(' ') : null;
}

// Repo gốc chỉ được xoá từng file — xoá đệ quy có thể cuốn cả file dở của phiên khác
// dist/node_modules là output build, xoá cả thư mục vẫn an toàn
const isBuildOutput = (target, root) => path.relative(root, target).split(path.sep).some((part) => BUILD_OUTPUT_DIRS.has(part));

function ownRepoBulkDelete([program, ...args], viaXargs, cwd, repos) {
  const paths = (list) => list.filter((a) => !a.startsWith('-')).map((a) => path.resolve(cwd, a));
  let targets = [];
  if (program === 'rm' && (viaXargs || args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive'))) targets = viaXargs ? [cwd] : paths(args);
  if (program === 'find' && args.some((a) => a === '-delete' || a === 'rm')) {
    const firstFlag = args.findIndex((a) => a.startsWith('-'));
    targets = paths(args.slice(0, firstFlag < 0 ? args.length : firstFlag));
    if (!targets.length) targets = [cwd];
  }
  const inline = /^(node|python3?)$/.test(program) && args.find((a, i) => /^-[ce]$/.test(args[i - 1]));
  if (inline && /rmSync|rmtree|\brm\(/.test(inline) && /recursive|rmtree/.test(inline)) targets = [cwd];
  const hit = targets.some((t) => repos.some((root) => isInside(t, root) && !isBuildOutput(t, root)));
  return hit ? [program, ...args].join(' ') : null;
}

function innerScript([program, ...args]) {
  if (program === 'eval') return args.join(' ');
  const flag = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
  return SHELLS.has(program) && flag >= 0 ? args[flag + 1] : undefined;
}

function bashDenial(command, cwd, home, writable) {
  const vars = {};
  const repos = repoRoots(writable, home);
  for (const rawTokens of splitSegments(expandHome(command, home))) {
    const tokens = rawTokens.map((t) => t.replace(/\$\{?(\w+)\}?/g, (m, name) => vars[name] ?? m).replace(/^[({]+|[)}]+$/g, '')).filter(Boolean);
    const assignment = tokens.length === 1 && tokens[0].match(/^(\w+)=(.*)$/);
    if (assignment) vars[assignment[1]] = assignment[2];
    else if (tokens[0] === 'cd') cwd = path.resolve(cwd, tokens[1] ?? home);
    else {
      const { tokens: program, env, viaXargs } = unwrap(tokens);
      const script = innerScript(program);
      const inner = script && bashDenial(script, cwd, home, writable);
      if (inner) return inner;
      if (SHELLS.has(program[0]) && program.length === 1) return `autopilot: không đẩy lệnh qua stdin vào ${program[0]} — chạy lệnh trực tiếp để hook soát được`;
      const git = ownRepoGit(program, env, cwd, repos);
      if (git) return `autopilot: không chạy \`${git}\` trên repo gốc — commit chỉ qua cổng commit của autopilot, không checkout/reset/stash/clean`;
      const bulk = ownRepoBulkDelete(program, viaXargs, cwd, repos);
      if (bulk) return `autopilot: không chạy \`${bulk}\` — trong repo gốc chỉ xoá từng file, không xoá cả thư mục`;
      const root = segmentWriteTargets(program, cwd, home, writable).map((t) => protectedRootOf(t, home, writable)).find(Boolean);
      if (root) return `autopilot: lệnh ghi vào ${root} — chỉ đọc được, mọi thay đổi làm trong ${writable.length ? writable.join(', ') : cwd}`;
    }
  }
  return null;
}

export function sandboxDenial({ tool_name, tool_input = {}, cwd }, home, writable = []) {
  const allowed = writable.length ? writable.join(', ') : cwd;
  const field = WRITE_TOOLS[tool_name];
  if (field) {
    const target = path.resolve(cwd, expandHome(tool_input[field] ?? '', home));
    const root = protectedRootOf(target, home, writable);
    return root ? `autopilot: không được ghi vào ${root} — chỉ sửa trong ${allowed}` : null;
  }
  if (tool_name !== 'Bash') return null;
  return bashDenial(tool_input.command ?? '', cwd, home, writable);
}
