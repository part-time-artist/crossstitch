---
name: nothing-design
description: Apply the "Nothing" (Nothing Phone / Nothing OS) visual language to a UI — when the user asks for a Nothing-style, dot-matrix, monochrome-with-red-accent, technical/industrial look. Defines the tokens and layout rules to use.
---

# Nothing design language

A minimal, monochrome, engineered aesthetic: pure black + white + grey, a single
red accent used sparingly, dotted/perforated grids, and small UPPERCASE monospace
"instrumentation" labels.

## Tokens
- **Black** background `#000000`; near-black surfaces `#0a0a0a`–`#141414`.
- **White/near-white** text `#f2f2f2`; muted grey `#7a7a7a`; hairlines `#262626`.
- **Nothing red** `#D6001C` — the ONLY colour. Use it sparingly: the primary
  action, a single status dot, the active indicator. Never fill large areas.
- Tight corner radius (`4–8px`) or square. Flat — no gradients, no soft shadows.

## Typography
- Labels / readouts: **monospace**, `UPPERCASE`, `letter-spacing: 0.06–0.12em`,
  small (`10–12px`). Feels like a control panel.
- Values / body: clean grotesk (Inter / system sans).
- Lots of negative space; left-aligned; numbers read like instruments.

## Layout & texture
- Visible **structure**: thin hairline rules / dotted separators between sections
  (not boxed cards). A subtle **dotted grid** background
  (`radial-gradient(#262626 1px, transparent 1px)`, ~14px) evokes the Glyph/dot
  matrix.
- Controls are flat blocks; active = inverted (white fill, black text) for the
  monochrome parts, red reserved for the one primary action.
- Keep it sparse and technical. Every label earns its place.

## Guardrails for this project
- The **artboard/canvas stays light** (≈#f3f3f4) so bead colours are judged
  against near-white (= printed paper). Only the chrome goes black.
- Keep red minimal so it doesn't bias bead-colour perception (DESIGN_DECISIONS.md
  §UI theme).
