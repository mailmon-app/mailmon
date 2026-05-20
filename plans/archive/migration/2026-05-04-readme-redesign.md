# README Redesign: Ghostty-Inspired Style & Structure

**Date:** May 4, 2026  
**Goal:** Improve Mailmon's README to match Ghostty's polished documentation style while maintaining technical depth.

## Design Overview

Redesign the README to be:

- **Visually polished** with centered hero header and clear navigation
- **Lean and onboarding-focused** (400–500 lines, aggressive trimming)
- **Factually straightforward** matching Ghostty's honest, no-nonsense tone
- **Developer-focused** with Quickstart and Operator CLI moved high up
- **Constraint-aware** clearly stating what Mailmon is and isn't

## Key Changes

### 1. Header & Hero

Replace simple title with centered, impactful header:

- Centered logo + project name
- Tagline: "Gmail-first sync infrastructure for correct mailbox state, durable events, and replayable webhooks."
- Subtitle: "A reliable event system on top of Gmail."
- Navigation links in header: About · Quickstart · Documentation · API Examples

### 2. Section Reordering

**New order (from current):**

| Current Position     | New Position                 | Change                                  |
| -------------------- | ---------------------------- | --------------------------------------- |
| At a Glance          | After Core Design Principles | Moved significantly earlier             |
| Problem              | Position 2                   | Stays early but more prominent          |
| Quickstart           | Position 5                   | Moved up from position 13               |
| Operator CLI         | Position 6                   | Moved up from position 13               |
| Architecture         | Position 7                   | Moved up, more prominent                |
| API Examples         | Position 9                   | Moved up from position 11               |
| Tech Stack           | Removed                      | Integrated into Architecture & sections |
| Development Commands | Kept but trimmed             | Links to docs instead of full reference |

**Sections to remove/defer to external docs:**

- "Current Status" (Implemented/In Progress) — Roadmap replaces this
- Detailed webhook format — Link to docs
- Runtime Modes deep dive — Link to docs
- Deployment Model details — Link to docs or fold into Architecture
- Verbose Development Commands — Keep as quick reference, link to extended docs

### 3. At a Glance Table

Replace multi-line descriptions with concise, factual statements:

```
| Area               | Current state |
|---|---|
| Provider           | Gmail |
| Sync model         | Canonical state + durable event log with at-least-once webhooks |
| API                | HTTP with workspace-scoped API keys |
| Persistence        | PostgreSQL (Drizzle ORM) |
| Async transport    | Pub/Sub (sync dispatch) + Cloud Tasks (webhook delivery) |
| Local dev          | Full feature parity via local adapters, no emulators required |
```

**Tone:** Straightforward declarations matching Ghostty's style. No marketing language, no "what it isn't" section—just what it is.

### 4. Callout Formatting & Tone

**Strategic callouts:**

- `> [!TIP]` in Quickstart: Local mode doesn't require Pub/Sub/Cloud Tasks emulators
- `> [!IMPORTANT]` in Quickstart: Encryption key setup required
- `> [!NOTE]` in Runtime Modes: GCP-first design, no cloud-agnostic abstraction
- `> [!TIP]` in API Examples: Event deduplication via `event.id`

**Tone adjustments:**

- Remove marketing language ("fragile trigger source," "pushes modern features")
- Keep problem statement factual: list actual failure modes
- State constraints clearly: "Mailmon is GCP-native. We don't target cloud-agnostic deployments."
- Confident without overselling: "This is what we've built" not "we believe you can"

**Tech stack:** Integrate into Architecture/Async/Persistence sections, explaining trade-offs and choices. Remove flat shopping list.

## Target Outcomes

- **Length:** 400–500 lines (from current ~600)
- **Readability:** Developers can skim → understand → try in 5 minutes
- **Tone:** Honest, straightforward, confident (Ghostty-like)
- **Navigation:** Hero header with clear anchor links
- **Developer focus:** Quickstart and practical examples high up, deep architecture available but not front-loaded

## Implementation Notes

1. Keep all content accurate to current state (syncs, webhooks, API contracts are real)
2. Preserve "Notes for Reviewers" at end (valuable context for evaluators)
3. Link to external docs for detailed deployment, CLI reference, webhook format
4. Test that all code examples still work with current API/CLI shape
5. Commit design doc + updated README together for traceability
