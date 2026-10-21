// Ảnh chụp Jira lúc run bắt đầu: state.json chỉ /daily ghi, Jira đổi sau lượt quét cuối thì run phải tự biết
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const FETCH_TIMEOUT_MS = 120_000;
const GET_ISSUE_TOOL = 'mcp__claude_ai_Atlassian__getJiraIssue';

export function jiraClaudeArgs(key, cloudId) {
  const prompt = `Gọi ${GET_ISSUE_TOOL} với cloudId "${cloudId}", issueIdOrKey "${key}". Chỉ trả về đúng 1 object JSON, không giải thích:
{"key","summary","status" (tên status),"duedate","updated","description" (text thuần),"latestComment": {"author","created","body"} hoặc null}`;
  return ['-p', prompt, '--model', 'haiku', '--output-format', 'json', '--allowedTools', GET_ISSUE_TOOL];
}

export function parseJiraSnapshot(stdout) {
  const reply = JSON.parse(stdout);
  if (reply.is_error) throw new Error(String(reply.result).slice(0, 200));
  const text = String(reply.result);
  const snapshot = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  if (!snapshot.updated) throw new Error('ảnh chụp Jira thiếu updated');
  return snapshot;
}

export const jiraChangedSince = (snapshot, lastSeenUpdated) => !lastSeenUpdated || Date.parse(snapshot.updated) > Date.parse(lastSeenUpdated);

// null = tắt (test/fake); lỗi gọi Jira thì ném để người gọi cảnh báo rồi đi tiếp
export function fetchJiraSnapshot(key, cloudId) {
  if (process.env.AUTOPILOT_FAKE_JIRA) return JSON.parse(fs.readFileSync(process.env.AUTOPILOT_FAKE_JIRA, 'utf8'));
  if (process.env.AUTOPILOT_NO_JIRA || process.env.AUTOPILOT_FAKE) return null;
  const stdout = execFileSync('claude', jiraClaudeArgs(key, cloudId), { encoding: 'utf8', timeout: FETCH_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] });
  return parseJiraSnapshot(stdout);
}
