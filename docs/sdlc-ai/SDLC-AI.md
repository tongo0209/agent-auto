# SDLC with AI — Frontend

AI = Claude Code running in the terminal, wired with our FE tooling and rule set.
Humans own 5 decision gates; AI never pushes code out on its own.


> **Interactive version (recommended for presenting):** open [`sdlc-ai.html`](sdlc-ai.html) in a browser — 7 phase tabs, hover to trace, click a node for details, ▶ plays the flow and pauses at each human gate (switch to EN in the header).


```mermaid
---
config:
  theme: base
  fontFamily: "Arial, Helvetica, sans-serif"
  themeVariables:
    fontSize: 15px
  flowchart:
    htmlLabels: true
    wrappingWidth: 420
    curve: linear
    nodeSpacing: 40
    rankSpacing: 50
---
flowchart TB

START(["START"])

subgraph P1["PHASE 1 · INTAKE & PLANNING"]
  direction TB
  S1["Work intake: Jira · chat/email · QC buglist"]
  S2["AI scans Jira, extracts brief, locates design"]
  S3["Progress inferred from commits, not ticket status"]
  S4["AI proposes daily plan"]
  S1 --> S2 --> S3 --> S4
end

H1{{"HUMAN GATE 1 · Approve plan"}}
START --> S1
S4 -- "revise" --> S4
S4 --> H1

subgraph P2["PHASE 2 · DESIGN → ASSETS"]
  direction TB
  D1{"Design delivered?"}
  A1["Audit design, draft request to PM"]
  W1["Wait for PM / Designer"]
  A2["Pull design into ticket store"]
  D2{"Design source?"}
  A3["Extract PSD via Photoshop → coords file"]
  A4["Extract Figma via API → coords file"]
  A5["Digest video into text / metrics"]
  A6["PNG / JPG used as-is"]
  G1{"Enough to build?"}
  D1 -- "no" --> A1 --> W1 --> D1
  D1 -- "yes" --> A2 --> D2
  D2 -- "PSD/PSB" --> A3
  D2 -- "Figma" --> A4
  D2 -- "video" --> A5
  D2 -- "image" --> A6
  A3 --> G1
  A4 --> G1
  A5 --> G1
  A6 --> G1
  G1 -- "gaps" --> A1
end

H1 -- "approved" --> D1

subgraph P3["PHASE 3 · IMPLEMENTATION"]
  direction TB
  C0["Load internal rule set before editing"]
  C1{"Scope?"}
  C2["Trivial: dev edits inline, ≤2 files"]
  C3["Small: 1 AI, ≤4 files"]
  C4["Medium: 1 AI codes + 1 AI reviews"]
  C5["Large: 3 AI — design analysis · code · design check"]
  C6["Bug: root cause first"]
  C7["Automated guardrails on every command"]
  C0 --> C1
  C1 -- "trivial" --> C2
  C1 -- "small" --> C3
  C1 -- "medium" --> C4
  C1 -- "large" --> C5
  C1 -- "bug" --> C6
  C2 --> C7
  C3 --> C7
  C4 --> C7
  C5 --> C7
  C6 --> C7
end

G1 -- "ready" --> C0

subgraph P4["PHASE 4 · SELF-VERIFICATION"]
  direction TB
  V1["Real build, read logs"]
  V2["Missing-asset gate: fonts, 404 images, stale dist"]
  V3["UI diff in real browser vs design coords"]
  V4["Popup checklist per campaign type"]
  V5["Code quality audit against rules"]
  V6{"All pass?"}
  V1 --> V2 --> V3 --> V4 --> V5 --> V6
end

C7 --> V1
V6 -- "FAIL · file:line" --> RW

subgraph P5["PHASE 5 · HUMAN REVIEW & HANDOFF"]
  direction TB
  H2{{"HUMAN GATE 2 · Review diff"}}
  M1["Commit with AI co-author trailer"]
  H3{{"HUMAN GATE 3 · Authorize push"}}
  M2["Push feature branch + open MR"]
  H4{{"HUMAN GATE 4 · Merge"}}
  M3["Hand off HTML to backend repo"]
  H2 --> M1 --> H3 --> M2 --> H4 --> M3
end

V6 -- "PASS" --> H2
H2 -- "rejected" --> RW

subgraph P6["PHASE 6 · QC & BUG LOOP"]
  direction TB
  Q1["QC logs bugs to Google Sheets"]
  Q2["Buglist radar: filter FE-owned bugs"]
  Q3["Parallel AI fixes by file cluster"]
  Q4["Write back to sheet: Done + routing"]
  Q5{"FE bugs left?"}
  Q1 --> Q2 --> Q3 --> Q4 --> Q5
end

M3 --> Q1
Q5 -- "yes" --> RW

subgraph P7["PHASE 7 · CLOSE & LEARN"]
  direction TB
  F1["Pre-production audit"]
  F2["Daily wrap, metrics from commits"]
  F3["Log lesson learned"]
  F4["Lesson → rule → automated guardrail"]
  F1 --> F2 --> F3 --> F4
end

Q5 -- "none" --> F1
H5{{"HUMAN GATE 5 · Mark Done in Jira"}}
F2 --> H5
END(["DONE"])
H5 --> END
F4 -. "applies to all future tasks" .-> RW

RW{"REWORK LOOP"}
RW --> C0

classDef ai fill:#d5f5e3,stroke:#27ae60,stroke-width:1.5px,color:#14532d
classDef human fill:#fdebd0,stroke:#e67e22,stroke-width:3px,color:#7e3f00
classDef gate fill:#d6eaf8,stroke:#2e86c1,stroke-width:1.5px,color:#12435e
classDef dec fill:#fff9e6,stroke:#b7950b,stroke-width:1.5px,color:#6b5200
classDef wait fill:#f2f3f4,stroke:#909497,stroke-width:1.5px,color:#424949
classDef term fill:#eaeded,stroke:#566573,stroke-width:2px,color:#212f3c

class S1,S2,S3,S4,A1,A2,A3,A4,A5,A6,C0,C2,C3,C4,C5,C6,M1,M2,M3,Q3,Q4,F2,F3,F4 ai
class H1,H2,H3,H4,H5 human
class C7,V1,V2,V3,V4,V5,Q2,F1 gate
class D1,D2,G1,C1,V6,Q5,RW dec
class W1,Q1 wait
class START,END term
```

| Color | Meaning |
|---|---|
| Green | AI executes |
| Blue | Mechanical gate — must produce real output to pass |
| Orange hexagon | Human gate — AI stops |
| Yellow diamond | Branch |
| Grey | Waiting on PM / QC |
