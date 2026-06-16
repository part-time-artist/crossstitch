# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based **beadwork design tool for the 3-bead weave technique** (a craft
from Kutch, Gujarat). It is a fork of the open-source "Etch" Next.js project —
much of the original scaffolding remains, but the only live code is the beadwork
app. **Read `BEADWORK_TOOL_SPEC.md` before changing canvas/grid behavior or UI**;
it is the authoritative handoff spec (the *why*, exact grid geometry, feature
list, and mistakes a prior attempt made).

The core problem the tool solves: real beads are not square (ratio ~2:3 or 1:2),
so a design drawn on a square-pixel grid (e.g. Photoshop) comes out squished when
actually woven. This tool's grid is built from the real bead shape and weave
geometry so what the designer draws is what the artisan makes.

## Commands

```powershell
npm run dev      # Vite dev server (http://localhost:3000)
npm run build    # production build → dist/
npm run preview  # serve the production build locally
```

**Stack: Vite + React 18** (migrated off the original Next 9 / React 16 fork).
`styled-jsx` is kept via its Babel plugin (configured in `vite.config.js`) so the
`<style jsx>` blocks port unchanged. GitHub Pages serves under the `/Beadworks`
base path — set in `vite.config.js` (`base`). Any `next.*` / `out/` references
are dead Etch/Next artifacts.

There is **no test suite, linter, or typechecker** configured. Verification is
visual: run `npm run dev`, open the app, and compare the rendered grid against
`assets/MacBook Air - 1.png` (the spec mandates overlay verification — geometry
must be checked against the mockup, never assumed; that was a prior failure).

> Live design decisions + open issues are tracked in `DESIGN_DECISIONS.md`
> (the single source of truth). Read it before changing UI/behaviour.

## Architecture

- **`index.html`** + **`src/main.jsx`** — Vite entry; `main.jsx` mounts `<App/>`
  with React 18 `createRoot` (no StrictMode).
- **`src/App.jsx`** (the whole app as one React component, exported default
  `Home`). Holds all state (bead map, tool, color, palettes, background, bead
  size, canvas size, zoom, orientation, guides), renders to an HTML `<canvas>`,
  handles pointer/drag/zoom interaction, and contains all UI + styled-jsx. The
  `Pill` / `HoldButton` components and `clampNum` live at the bottom.
- **`src/lib/geometry.js`** — all grid math, pure and separate. Exports
  `makeGeometry`, `beadCountFromCm`, `beadExists`, `beadAt` (hit-test),
  `nearestBead` (closest bead, no radius cutoff — for drag-fill), `beadPath`
  (cached unit-superellipse silhouette).
- **`src/lib/chart.js`** — the printed-chart renderer (outlined beads, guide
  lines, edge numbers, colour-key legend) shared by the on-screen guides overlay
  and the PNG export.
- **`src/techniques/`** — per-weave grid rules (`index.js` registry +
  `threeBead.js` / `oneBead.js`). One artwork = one technique, chosen up front.
  `App.jsx` and `chart.js` call through the **active technique** (`tech.beadExists`,
  `tech.beadPath`, `tech.makeGeometry`, `tech.floodNeighbors`, `tech.snapPlace`,
  pattern parity …) — they no longer import 3-bead math directly. `geometry.js`
  is now the shared engine: `makeGeometry`/`beadCountFromCm` take `packX`/`packY`/
  `stagger`, `beadAt`/`nearestBead` take a density fn, `beadPath` takes a
  silhouette exponent. To add a weave: new file in `techniques/` + list it in
  `index.js`. See DESIGN_DECISIONS "Multi-technique website".

**Legacy Etch leftovers were deleted 2026-06-11** (`components/`, `parts/`,
`static/`, the Tailwind/shadcn pipeline, `yarn.lock`). Everything under `src/`
is live; `scripts/` holds Playwright visual-check scripts (`node scripts/x.mjs`
against a running dev server).

### The grid model (the heart of the tool)

Beads sit on a **staggered (brick-offset) lattice of oval beads** — not a square
grid, not boxes. Everything scales from bead size, so changing the bead ratio
rescales the whole lattice. See `BEADWORK_TOOL_SPEC.md` §4 for the measured
values and rationale.

- `makeGeometry` computes pitches from packing constants `PACK_X` (2.8) and
  `PACK_Y` (0.7) — center-to-center spacing as a multiple of bead width/height.
  Odd rows shift right by half the horizontal pitch (`rowOffset`). `PACK_Y < 1`
  + half-offset is what makes beads nestle diagonally into the honeycomb weave
  look. These constants are the **knobs to tune against the mockup.**
- A bead cell is identified by `(col, row)`; the filled-bead store is a `Map`
  keyed by the string `"col,row"` (`key(c,r)`), value = color hex.
- Two coordinate notions: **physical** (real bead mm + canvas cm → bead/row
  counts via `beadCountFromCm`) and **screen** (bead width `Bw = 26 * zoom`, with
  `Bh` following the real bead ratio). The physical layer makes screen and real
  weave agree.
- `beadAt` hit-tests a pixel to the nearest bead using normalized oval distance,
  searching only the 3×3 neighborhood of the approximate cell.

### Interaction & rendering

- **Tools:** `draw`, `erase`, `fill`. Draw/erase paint single beads and support
  drag (pointer down sets `dragging`, move repaints). One oval = one fillable
  cell — never treat a 3-bead group as one paint unit (a prior failure, spec §5).
- **Flood fill** walks staggered neighbors (left/right same row + 4 nestled
  diagonals) and stops at differently-colored beads (boundary fill).
- **`drawScene(ctx, { forExport })`** is the single render path for both the
  on-screen canvas and PNG export. On screen it draws empty cells as thin
  outlined ovals and a checkerboard for transparency; **export is beads-only**
  (no outlines, no checkerboard) at 4× scale. Keep both paths going through this
  one function.
- **Orientation:** `uniform` (all upright) or `woven` (even rows upright =
  apex; odd-row beads tilt ±18° by column = the two leaning base beads), via
  `tiltFor`.

### Persistence

No backend. Saved color palettes live in `localStorage` under
`beadwork3_palettes_v1`; "Save artwork" persists the whole design (beads,
canvas, palette, background) under `beadwork3_design_v1` and auto-restores it
on load.

## UI conventions (spec §7.5 — non-negotiable)

The UI must stay **muted/earthy neutral — no bright accent colors** on purpose:
the designer judges *bead* colors on the canvas, so a colorful UI would bias
their color perception. Active/selected states use tone/weight (darker fill,
border, shadow), never a saturated hue. Design tokens are the `T` object at the
top of `src/App.jsx`. The look: light, airy, rounded, flat, soft glass panels,
inline-labeled input pills (`Pill`), one full-width primary button. A prior dark
cramped UI was rejected — keep it Figma-clean.
