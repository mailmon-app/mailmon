# README Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure and rewrite README.md to match Ghostty's polished, straightforward style while improving developer onboarding (target: 400–500 lines from current ~600).

**Architecture:** Step-by-step section restructuring with aggressive trimming, tone adjustments, and strategic callouts. Preserve all technical accuracy while removing marketing language.

**Tech Stack:** Markdown, GitHub flavored formatting (callouts), no external tools needed.

---

## Task 1: Create Centered Hero Header

**Files:**

- Modify: `README.md:1-25`

**Step 1: Replace title section with centered hero**

Replace the current simple `# Mailmon` heading with:

```markdown
<h1>
<p align="center">
  Mailmon
</h1>
  <p align="center">
    Gmail-first sync infrastructure for correct mailbox state, durable events, and replayable webhooks.
    <br />
    A reliable event system on top of Gmail.
    <br />
    <a href="#about">About</a>
    ·
    <a href="#quickstart">Quickstart</a>
    ·
    <a href="https://github.com/anomalyco/mailmon">GitHub</a>
  </p>
</p>
```

**Step 2: Verify rendering**

Check that the header renders centered and the navigation links are visible in raw markdown.

**Step 3: Commit**

```bash
git add README.md
git commit -m "refactor: add centered hero header with navigation"
```

---

## Task 2: Rewrite Problem & Solution Section

**Files:**

- Modify: `README.md` (currently lines 20-38)

**Step 1: Replace with straightforward problem statement**

Remove flowery language. Replace with factual pain points:

```markdown
## Problem

Most Gmail integrations fail in production because:

- Duplicate push notifications cause replayed state
- Missed changes from bad cursor handling
- Worker crashes between fetch and commit
- Invalid or expired Gmail history cursors
- Revoked OAuth tokens
- Webhook endpoints going down
- No replay path for historical changes

Mailmon treats email sync as a distributed systems problem, not a fetch loop.

The key question is not "can we read email?" — it's:

> Can we maintain correct mailbox state over time under retries, failures, and scale?
```

**Step 2: Verify tone**

Read it aloud. Does it sound honest and direct (like Ghostty), not marketing-y?

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite Problem section with factual tone"
```

---

## Task 3: Condense Design Principles to 3–4 Bullets

**Files:**

- Modify: `README.md` (currently lines 58–82, 7 items)

**Step 1: Replace "Design Rules" section with "Core Design Principles"**

Reduce from 7 to 4 core principles:

```markdown
## Core Design Principles

1. **Mailbox is the unit of work.** Each mailbox owns its cursor, operational state, and active sync lease. No account-scoped state.

2. **Push is a wake-up, not truth.** Gmail push notifications trigger work. Gmail history remains the source of truth.

3. **State first, cursor second.** The cursor advances only after mailbox state and events are durably committed.

4. **Correctness over speed.** Durable event logs, transactional state commits, and mailbox leases enforce one sync per mailbox—queue ordering is not trusted.
```

**Step 2: Verify brevity**

Each principle should fit in 1–2 sentences. Done?

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: condense Design Rules to 4 Core Design Principles"
```

---

## Task 4: Update At a Glance Table

**Files:**

- Modify: `README.md` (currently lines 11–18, move up and reformat)

**Step 1: Move table to position after "Core Design Principles"**

Place it right after the principles section so readers understand stack immediately.

**Step 2: Replace content with straightforward statements**

```markdown
## At a Glance

| Area            | Current state                                                       |
| --------------- | ------------------------------------------------------------------- |
| Provider        | Gmail                                                               |
| Sync model      | Canonical state + durable event log, at-least-once webhook delivery |
| API             | HTTP with workspace-scoped API keys                                 |
| Persistence     | PostgreSQL with Drizzle ORM                                         |
| Async transport | Pub/Sub for mailbox sync, Cloud Tasks for webhook delivery          |
| Local dev       | Full feature parity with local adapters (no emulators required)     |
```

**Step 3: Verify clarity**

Each row answers "what is this?" clearly and factually.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update At a Glance table, move to earlier position"
```

---

## Task 5: Move Quickstart Earlier & Add Callouts

**Files:**

- Modify: `README.md` (currently lines 153–201, move to position ~6)

**Step 1: Move Quickstart section to position 5 (right after At a Glance)**

Cut entire Quickstart section and paste after At a Glance table.

**Step 2: Add TIP callout about local mode**

After "### 3. Start local services" section, add:

```markdown
> [!TIP]
> Local mode does not require local Pub/Sub, Cloud Tasks, or Gmail watch infrastructure. It uses local adapters so the core sync and webhook flows can be developed without cloud emulators.
```

**Step 3: Add IMPORTANT callout about encryption key**

In the environment setup, after the encryption key line, add:

````markdown
> [!IMPORTANT]
> The encryption key must be exactly 32 bytes base64-encoded. Generate with:
>
> ```bash
> node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
> ```
````

**Step 4: Verify step completeness**

Can someone follow these steps and have working local setup? Yes/no?

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: move Quickstart earlier, add callouts"
```

---

## Task 6: Move Operator CLI Earlier

**Files:**

- Modify: `README.md` (currently lines 210–258, move to position ~7)

**Step 1: Move "Operator CLI" section to position 6 (right after Quickstart)**

This shows practical next steps: create workspace → create API key → run mailbox sync → etc.

**Step 2: Verify flow**

Does it feel natural: Quickstart → then "now try these CLI commands"?

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: move Operator CLI section earlier, right after Quickstart"
```

---

## Task 7: Reorganize Middle Sections

**Files:**

- Modify: `README.md` (sections around lines 83–152)

**Step 1: Keep Architecture section at position 8**

Move it up slightly. Keep diagram. Keep brief explanation.

**Step 2: Keep Project Structure at position 9**

No changes, but tighten prose if verbose.

**Step 3: Move API Examples to position 10**

Move up from current position.

**Step 4: Verify section order**

1. Hero Header
2. Problem & Solution
3. Core Design Principles
4. At a Glance
5. Quickstart
6. Operator CLI
7. Architecture
8. Project Structure
9. API Examples
10. (Webhooks/Runtime Modes/Development Commands following)

Commit this reorganization:

```bash
git add README.md
git commit -m "refactor: reorganize middle sections (Architecture, Project Structure, API Examples)"
```

---

## Task 8: Integrate Tech Stack into Architecture

**Files:**

- Modify: `README.md` (currently lines 132–152, remove standalone section)

**Step 1: Delete "Tech Stack" section**

Remove the entire section listing TypeScript, Effect, Hono, PostgreSQL, etc.

**Step 2: Weave tech into Architecture section**

In Architecture section, mention:

- "Uses Effect service interfaces for transport-neutral workflows"
- "PostgreSQL via Drizzle for transactional state and migration safety"
- "Pub/Sub for sync dispatch, Cloud Tasks for webhook delivery scheduling"

Example revision:

```markdown
## Architecture

Mailmon is built on Effect service interfaces (transport-neutral contracts), PostgreSQL persistence via Drizzle for atomic state commits, and GCP-native async: Pub/Sub for mailbox sync dispatch, Cloud Tasks for webhook delivery scheduling.

[Keep existing diagram]

**Key guarantee:** Sync runs hold a database-backed lease. Only one sync executes per mailbox. State and events are committed atomically with cursor advancement.
```

**Step 3: Verify completeness**

Are tech choices now explained by their role, not just listed?

**Step 4: Commit**

```bash
git add README.md
git commit -m "refactor: integrate Tech Stack into Architecture section, remove standalone list"
```

---

## Task 9: Add Strategic Callouts Throughout

**Files:**

- Modify: `README.md` (multiple locations)

**Step 1: Add NOTE callout in Runtime Modes section**

After "### GCP mode" intro:

```markdown
> [!NOTE]
> Mailmon is GCP-native. We optimize for Pub/Sub, Cloud Tasks, and Cloud SQL. We do not target cloud-agnostic or Kubernetes-generic deployments.
```

**Step 2: Add TIP callout in API Examples section**

After "### Inspect mailbox observability" or similar:

```markdown
> [!TIP]
> Webhook events include an `id` field. Consumers must deduplicate by event ID—delivery is at-least-once, not exactly-once.
```

**Step 3: Check all sections for opportunistic callouts**

Look for places where a NOTE, TIP, or WARNING would prevent confusion. Add sparingly.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add strategic callouts (NOTE, TIP) for key concepts"
```

---

## Task 10: Trim & Compress Development Commands

**Files:**

- Modify: `README.md` (currently lines 523–564)

**Step 1: Replace verbose list with condensed reference**

Current section lists 20+ commands. Replace with brief reference + link to docs:

````markdown
## Development Commands

```bash
pnpm install          # Install dependencies
pnpm docker:up        # Start local containers
pnpm dev              # Run API and worker
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm lint             # Lint and format check
```
````

For full reference (migrations, coverage, watch modes), see [Development Guide](docs/DEVELOPMENT.md).

````

**Step 2: Verify essentials are covered**

Can a dev get started with just this? If not, add the minimum needed.

**Step 3: Create or update docs/DEVELOPMENT.md**

If it doesn't exist, create a stub:

```markdown
# Development Guide

[Extended reference for pnpm commands, migrations, CI/CD, etc.]
````

**Step 4: Commit**

```bash
git add README.md docs/DEVELOPMENT.md
git commit -m "refactor: compress Development Commands, move details to docs/DEVELOPMENT.md"
```

---

## Task 11: Verify Line Count & Overall Flow

**Files:**

- Check: `README.md` (entire file)

**Step 1: Count lines**

Run: `wc -l README.md`

Expected: 400–500 lines (down from ~600).

**Step 2: Read full README top-to-bottom**

Does the flow feel natural?

- Hero → Problem → Principles → At a Glance → Quickstart → CLI → Architecture → Examples → Details

**Step 3: Check all links are valid**

Scan for `[text](#anchor)` and `[text](docs/...)` — do anchors exist?

**Step 4: Verify tone consistency**

Skim for marketing language ("fragile," "pushes," "ambitious"). Should be gone or rewritten neutrally.

**Step 5: Commit cleanup if needed**

```bash
git add README.md
git commit -m "docs: final review and tone pass"
```

---

## Task 12: Final Verification & Commit

**Files:**

- Test: `README.md` (render check)

**Step 1: Render README locally**

If you have a Markdown previewer, check:

- Hero header is centered
- All links work
- Callouts render correctly (`[!NOTE]`, `[!TIP]`, etc.)
- Tables are readable
- Code blocks have syntax highlighting

**Step 2: Verify all sections are present**

Checklist:

- [ ] Hero header with navigation
- [ ] Problem & Solution (rewritten)
- [ ] Core Design Principles (4 bullets)
- [ ] At a Glance table
- [ ] Quickstart with callouts
- [ ] Operator CLI
- [ ] Architecture
- [ ] Project Structure
- [ ] API Examples
- [ ] Webhooks
- [ ] Runtime Modes
- [ ] Development Commands (trimmed)
- [ ] Roadmap
- [ ] Notes for Reviewers

**Step 3: Final commit message**

```bash
git add README.md docs/plans/2026-05-04-readme-redesign.md
git commit -m "refactor: redesign README in Ghostty style

- Centered hero header with navigation
- Reorganize sections for developer onboarding (Quickstart early)
- Rewrite Problem statement with factual tone
- Condense Design Principles to 4 core rules
- Update At a Glance with straightforward statements
- Add strategic callouts (NOTE, TIP, IMPORTANT)
- Integrate Tech Stack into Architecture
- Compress Development Commands, link to docs
- Target 400-500 lines (from ~600)

Matches Ghostty's straightforward, honest documentation style."
```

**Step 4: Verify commit**

```bash
git log -1 --stat
```

Expected: Shows README.md and design doc changes.

---

## Execution Approach

Plan complete and saved to `docs/plans/2026-05-04-readme-redesign.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans skill, batch execution with checkpoints

Which approach?
