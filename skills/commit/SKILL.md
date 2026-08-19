---
name: commit
description: Use when creating or amending a git commit in a VNG repo, when the user asks to "commit" / "commit theo chuẩn", or when a commit message needs the org format or the AI co-author footer. Covers message convention, mandatory AI co-authorship, and push/release safety.
---

# Commit (VNG org convention)

## Overview
VNG commit messages follow Conventional-Commits and are **enforced automatically in the CI/CD pipeline**. Any AI-assisted commit MUST declare the AI tool as co-author. **Invoking `/commit` (or asking to "commit") IS the explicit go-ahead — commit directly, no further questions.** Pushing is separate and still needs an explicit ask.

## When invoked — ONLY `git status` → stage → commit
`/commit` / "commit" / "commit theo chuẩn" = **just look at `git status`/`git diff` and commit what is already there.** Nothing else.
- **Do NOT run builds** (`build-dev`/`build-pro`), browser tests, linters, or any external/verification step. Committing is not a verification gate — commit the working tree exactly as the user left it. If `dist/` is stale, that is the user's call, not something to "fix" by rebuilding.
- **Stage ALL changed files of the current project** — every modified/new file in the campaign/product folder you're working in (source **and** any `dist/`, sprites, caches already rebuilt), NOT just the files from the immediate task. A `/commit` captures the whole working state of this project. The user made this explicit: don't "chừa" (leave out) a changed source file just because it isn't part of the task at hand. Don't ask which files. Don't regenerate anything.
- **Scope boundary = the project, not the task.** The only thing to exclude is **another project/product** (a different `products/<game>/[landing/]<campaign>/` or its `dist/`) — leave those for their own commit.
- Write the message in the format below and **commit on the current branch** — cdn-source landing repos commit to `master` directly; don't create a branch or ask about branching.
- **Do NOT ask** to confirm message, branch, or file scope. Just commit.
- **Still do NOT `git push`** unless the user explicitly says to push.
- Only pause if staging would pull in **another project's** changes you cannot cleanly separate — otherwise proceed and commit everything changed in this project.

## Message format
```
(<type>): <mô tả ngắn, chữ thường, không dấu chấm cuối>

<mô tả chi tiết — tùy chọn, khuyến khích; sau 1 dòng trống>

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

- **Title:** `(<type>): <description>` — description imperative, lowercase, no trailing period. Keep proper nouns (product names, `CMS Tools`) as-is.
- **Scope of this format (chốt 19/8/2026):** applies to repos pushed to **git VNG** — `cdn-source`, `gt-promotion-template`, `new-mainsite`, `vportal2view` (CI/CD enforces it there). **Internal repos** (`agent-auto`, `promptAgent`, personal tooling) use `[<leaf-folder>] <English subject>` + the same `Co-Authored-By` trailer instead — see `~/VNG/agent-auto/rules/code-style.md` § Commit. Never commit in `gt-promotion-template` / `new-mainsite` on the user's behalf (R-GTP-2, R-TWIG-4) — show `git diff --stat` instead.
- **Body:** optional but encouraged — bullets explaining what/why, after one blank line.
- **Footer:** see AI co-author rule below.

## Valid types (only these)
| type | when |
|---|---|
| `feat` | new feature / capability |
| `fix` | bug fix |
| `refactor` | code change, no behavior change |
| `perf` | performance improvement |
| `docs` | documentation / guides only |
| `test` | tests only |
| `chore` | tooling, deps, housekeeping |
| `build` | build system / bundling |
| `ci` | CI/CD config |
| `revert` | revert a previous commit |

## Mandatory: AI co-author footer
Every commit **created or assisted by an AI tool** MUST include a co-author trailer that **names the tool** — required evidence for human-vs-AI contribution tracking:
```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```
Name the actual tool (`Claude Code`, `Cursor`, …). This is not optional. A human-only commit omits it.

## Push & release safety (do NOT skip)
- **`git commit` is pre-authorized when the user invokes `/commit`** — commit directly, no confirmation. **`git commit --amend` and `git push` still require an explicit ask.**
- **Committing on the default branch (`master`) is fine** for cdn-source landing repos — that's the team norm; don't force a branch or ask about it.
- **Scope = the current project, not the current task** — stage every changed file in this campaign/product folder (source + `dist/` + caches), including edits the user made outside the immediate task. Never leave a changed source file of this project out — if `dist/` already reflects it, omitting the source desyncs source↔`dist/`. The only thing to exclude is **another project/product's** changes.
- **Never rewrite + force-push history that is already on a shared branch** (e.g. pushed `dev`) without the user's explicit OK and coordination — it breaks others' clones.
- **Production releases go through the CI/CD pipeline only** (triggered by Tech Ops). No manual deploy. Every release is tagged with **Semantic Versioning** `vMAJOR.MINOR.PATCH`.

## Example
```
(docs): add VI/EN language toggle and refresh CMS Tools guide

- add single-file VI/EN toggle (localStorage + no-flash bootstrap)
- remove Short Link tab and renumber tabs 0-10

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

## Common mistakes
| Mistake | Fix |
|---|---|
| `[docs] ...` or `docs: ...` prefix | Use `(docs): ...` — type in parentheses. |
| `up`, `update`, `fix bug` (vague) | Describe the actual change. |
| Missing AI footer on AI-assisted commit | Add `Co-Authored-By: <tool> <email>`. |
| Capitalized / trailing period in title | Lowercase, no period. |
| Running build / tests / browser on `/commit` | `/commit` only reads `git status`/`git diff` and commits — never build, verify, or check anything external. |
| Auto-pushing without being asked | `/commit` authorizes commit only — still ask before `push` / `--amend`. |
| Leaving out changed source of the same project | Commit ALL of this project's changed files, not just the task's — an omitted source file desyncs source↔`dist/`. |
| Sweeping in **another** project's changes | Exclude only other products/campaigns; everything changed in the current project goes in. |
| Force-push to fix a message on shared `dev` | Usually not worth it; apply the standard to future commits instead. |
