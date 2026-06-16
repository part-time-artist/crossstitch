---
name: grill-me
description: Use when the user wants to lock down a design or requirements before building — they say "grill me", "let's plan", "get on the same page", or are about to start a non-trivial feature/redesign. Interrogates one decision at a time, records every locked answer to DESIGN_DECISIONS.md, and stays token-efficient.
---

# Grill Me — efficient design lock-down

Goal: turn vague intent into a single, unambiguous design using the fewest tokens.
The chat is disposable; **DESIGN_DECISIONS.md is the memory.**

## Before asking anything
1. Read `DESIGN_DECISIONS.md` (repo root). Never re-ask a decision already
   recorded there — reference it instead.
2. Read `BEADWORK_TOOL_SPEC.md` so questions are informed, not naive.

## How to ask
- Use the `AskUserQuestion` tool. **Batch up to 4 independent questions per call**
  — this is the token-efficient default.
- Ask one-at-a-time ONLY when a later question genuinely depends on an earlier
  answer (real branching). Otherwise batch.
- Each option: a 1–5 word label + a one-line consequence. Recommended option
  first, marked "(Recommended)".
- Don't ask about anything you can sensibly default. Pick the default, say so,
  move on.
- For anything visual (geometry, layout), MEASURE the reference asset; never
  guess. Prove it against the mockup.

## After each answer
- Immediately append the locked decision to `DESIGN_DECISIONS.md` under
  "## Locked decisions" as a numbered one-liner.
- If the user is unsure, record it under "## Deferred" with what blocks it.

## When the design is complete
- Summarise each locked decision in one line.
- Hand off to implementation (or `ExitPlanMode` if in plan mode).

## Token discipline (non-negotiable)
- Reference DESIGN_DECISIONS.md; do not restate the whole design each turn.
- Do not spawn sub-agents to re-derive context that's already in the docs.
- Keep prose minimal. One fix / one decision at a time, verified before the next.
