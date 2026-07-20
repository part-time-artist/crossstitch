# Beadwork Tool — Design Decisions (living doc)

Single source of truth. Update as decisions lock so neither side re-derives
context. The `/grill-me` skill reads and appends to this file.

## Measured geometry (from the user's Figma vectors — do not guess)
- Bead intrinsic ratio **4:5 (80:100)**, w/h = 0.80. Upright bead bbox = 80×100.
- Same-row pitch 127 → `PACK_X = 1.59` (× bead width).
  **SUPERSEDED 2026-06-10:** `PACK_X = 1.296`, calibrated to the real woven
  swatch — **36 beads across 7 cm at a 1.5 mm bead** (pitch 70/36 ≈ 1.944 mm);
  beads sit denser with smaller gaps. Bead sizes offered: **1.5 mm / 3 mm**.
- Apex-to-apex row pitch 175.5 → `PACK_Y = 0.875` (× bead height).
- Base beads tilt **±45°** (from `Frame 3`, the canonical 3-bead unit).
- Tilt pattern (corrected ×3 on 2026-06-10, see `assets/rows explaination.png`):
  apex rows lie **HORIZONTAL** (rotated 90°); in tilted rows neighbouring beads
  MIRROR each other (+45/−45 alternating along the row) and the phase flips row
  to row, so alternate beads down each column mirror too — checkerboard of
  mirrored pairs (global sign flipped per user). `tiltFor` in `App.jsx`.
- Lattice occupancy: base rows (odd) fully packed; **apex rows (even) half-density**
  — node exists iff `(col + row/2)` is odd (`beadExists` in `lib/geometry.js`).

## Locked decisions (deliverable + export)
1. Deliverable: **printed coloured chart**, read bead-by-bead at the loom.
2. Every bead drawn with a **thin outline** so a run of N same-colour beads reads
   as N distinct ovals.
3. Sizing input: physical **cm** is primary; bead/row counts derive from it.
4. Chart beads: **tilted woven** (true-to-craft).
5. Print scale: **enlarged, fixed ~8 mm per bead**; large designs span sheets.
6. Place-keeping: **edge row/col numbers + bolder guide line every 10**.
7. Legend: swatch + **total bead count per colour**.
8. Export: **both** print-ready **A4 PDF** and **PNG**.
9. Screen: clean canvas + a **"Show chart guides" toggle**.
10. Export background: choice of **transparent OR on-screen** background.

## Deferred (need studio confirmation)
- **Weave order / numbering direction** — default horizontal rows top→bottom;
  isolated to `rowLabel`/`colLabel` in `lib/chart.js` for a one-spot change.

## Open issues — current problems to fix (basics-first, ordered)
1. [DONE] Canvas zoom on Ctrl/⌘+scroll, Figma-style (zoom toward cursor).
2. Sidebar redesign — clean, only the wanted features (below). Remove clutter
   (orientation toggle, redundant tabs). Keep export but tuck it away.
   Wanted feature set:
   - Canvas size + metric units
   - Bead size changeable
   - Colour palette maker
   - Draw + erase tools
   - Drag a colour from the palette onto the canvas to flood-fill a region
   - Background: solid colour / PNG image / transparent
   - Clear canvas (with a yes/no confirm dialog)
   - Save artwork
   - Selection: drag a marquee over beads to select them
3. Drag-drop colour→fill interaction.
4. Save artwork (format TBD).
5. Marquee selection of beads (+ what actions on the selection — TBD).

## Sidebar / feature decisions (LOCKED)
- Export: **keep, tucked away** in its own small Export section (not a primary).
- Save artwork: **download a .json project file** + a Load button to reopen.
- Selection actions: **recolor · copy/paste · delete** (no move for now).
- Fill: **replace the Fill tool** — flood-fill happens only by dragging a colour
  from the palette onto the canvas. Tools become Draw / Erase / Select.
- Layout: single scrollable column of clear cards (no icon-tab row), muted tokens.
- Orientation toggle removed (woven is locked); keep `orient='woven'` internally.

## Deployment (CORRECTED 2026-06-10 — the tool lives on Beadwork-3-tech)
- Live: **https://part-time-artist.github.io/Beadwork-3-tech/** (GitHub Pages,
  `gh-pages` branch). Repo: `part-time-artist/Beadwork-3-tech` = git remote
  **`newtool`**. The old `origin` (`part-time-artist/Beadworks`) hosts a
  DIFFERENT site — **never deploy the tool there** (done by mistake once,
  restored to `7095d37`).
- `vite.config.js` `base: '/Beadwork-3-tech/'` in production (must match repo).
- Redeploy: `npm run build`, then publish `dist/` via worktree:
  `git fetch newtool gh-pages` → `git worktree add --detach ../bw-ghp-new
  newtool/gh-pages` → clear it → `cp -r dist/. ../bw-ghp-new/` →
  `touch .nojekyll` → commit → `git push newtool HEAD:gh-pages` →
  `git worktree remove ../bw-ghp-new --force`. No CNAME.

## Stack — MIGRATED (Vite + React 18)
- Moved off the 2019 Next 9 / React 16 fork → **Vite 5 + React 18**. App lives in
  `src/App.jsx` + `src/lib/{geometry,chart}.js`; entry `index.html` + `src/main.jsx`.
- `styled-jsx` kept via its Babel plugin (`vite.config.js`). GH Pages base in
  `vite.config.js`. Old `pages/`, root `lib/`, `next.config.js` deleted.
- Unlocks modern UI/interaction libs (dnd-kit, Radix, Framer Motion) for future
  work — the reason for the migration.

## Build order for the sidebar phase
A. Sidebar restructure + drag-from-palette fill + Save/Load .json  ← done
A2. Fixes pass (this): dark minimal Figma UI, PNG-only one-sheet export,
    bead-size perf, borderless minimal cards, solid-bg verified.       ← this pass
B. Marquee Select tool + recolor/copy-paste/delete actions         ← next pass

## UI theme — UPDATED (overrides spec §7.5 light direction)
- **"Nothing" design language** (see `.claude/skills/nothing-design`): black chrome,
  monochrome greys, **one red accent** (`#d6001c`) used sparingly (primary button +
  brand dot only), UPPERCASE monospace labels, dotted-grid panel background.
- **Artboard (the canvas) stays light** (`T.artboard` ≈ #f3f3f4) so bead colours
  are judged against near-white, matching the printed paper. Black chrome, light
  canvas. Red kept minimal so it doesn't bias bead-colour perception (§7.5 intent).
- Borderless, flat sections; no number-input spinners; no zoom pill (Ctrl+scroll).

## Export — UPDATED
- **PNG only**, **whole design on one sheet** (no print-scaling / pagination).
  PDF export and the mm/bead control removed. Chart still has outlines + edge
  numbers + guides + colour-key legend, rendered to a single PNG.

## Performance
- `beadPath` uses a precomputed unit-superellipse polygon (no per-bead Math.pow).
- Empty bead lattice rendered ONCE to an offscreen canvas (`lattice` useMemo) and
  blitted each frame; painting only redraws filled beads (iterates the Map).
- Transparency checker is a static CSS background on the canvas, not redrawn per
  frame (was the biggest cost).
- `paintBead` bails out (returns prev state) when a bead is unchanged, so dragging
  over the same bead doesn't trigger redraws.

## Canvas model — viewport + transform (Figma/Photoshop-style)
- The canvas element is sized to the **viewport** (pasteboard), never to the
  document. Zoom/pan is a **view transform** (`view = {scale, tx, ty}`), so a huge
  design no longer makes an oversized canvas → fixes the "glitches above 60cm"
  bug (browser ~16k-px canvas limit).
- **No scrollbars.** Navigation: **wheel = zoom toward cursor**, **Space-drag or
  middle-mouse = pan**, on-screen zoom control (−/%/+, click % = Fit). Auto-fits
  on load and when the cm size changes.
- Rendering culls to the **visible cell range** and uses level-of-detail (drops
  outlines / draws simple rects when beads are tiny on screen), so any document
  size stays fast. Canvas size cap raised to 300cm.

## Sizing, panels, persistence (latest)
- **Bead size = density, canvas stays constant.** Bead px is tied to physical mm
  (`SCREEN_PXMM`), so the artboard tracks the cm canvas; changing bead size only
  changes how many beads fit, not the canvas size.
- **On-screen chart-guides toggle removed** (the PNG export still includes guides
  + numbers + legend).
- **Save artwork = in-tool persistence.** Saves to localStorage (`DESIGN_KEY`) and
  **auto-restores on load**, so work reopens for editing. The separate "Open
  design" file picker was removed. Export is "Save PNG".
- **Saved palettes**: click-to-load rows (name + swatch strip), internal scroll;
  fixes "can't open/use saved palettes easily".
- **Two-panel layout** (no panel scrolling): LEFT = tools + canvas + bead +
  background; RIGHT = colour/palette + export + save. Canvas in the middle.

## Editing features (latest)
- **Select tool** (marquee): drag a box → selects **coloured beads only**
  (2026-06-11; empty cells are never selectable). Actions: Recolour / Delete.
  Selected beads get an accent ring; live marquee drawn dashed.
- **Pattern maker replaces copy/paste** (2026-06-11; a centred-paste version
  existed briefly the same day). The selected motif repeats across the WHOLE
  canvas in a textile layout: **Grid** (straight repeat), **Brick** (alternate
  repeat-rows shift sideways by half a tile) or **Half-drop** (alternate
  repeat-columns drop by half a tile), plus a **gap** input (empty beads
  between repeats). The repeat lattice is anchored on the motif itself; tile
  pitch and all shifts stay EVEN so apex/base parity and `beadExists` survive
  (the half-tile shift is floored to even, min 2). One pattern = one undo step.
  Verified by `scripts/patterntest.mjs` (asserts the exact lattice of all
  three layouts).
- **Layout buttons SWAP, never stack** (2026-06-11, user report: "it is making
  all the patterns when I click one by one"). While the last edit was a pattern
  apply, clicking another layout (or changing gap and re-clicking) rebuilds
  from the pre-pattern design; any other edit ends swap mode. Undo from any
  layout returns straight to the bare motif.
- **iPad Safari crash fixes** (2026-06-11, "Safari shuts down after a few
  strokes"): (1) strokes repaint the canvas via requestAnimationFrame straight
  from `beadsRef` — no React re-render per pencil event (was 120–240 full
  renders/s); React state syncs once at stroke end. (2) Undo history is capped
  by TOTAL stored beads (250k) as well as 50 steps — 50 snapshots of a dense
  full-canvas pattern was hundreds of MB.
- **Brush size** slider (1–6): brush>1 paints all beads within a growing radius.
- **Recent colours** (up to 5), auto-tracked on draw/fill, shown above the palette.
- **Empty beads** drawn very-slight grey (#eaeaeb), not white.

## Packed bead view (2026-06-11)
- Problem: real beads touch with almost no ground showing, so woven motifs read
  instantly; on screen each bead was drawn at true size on the lattice pitch,
  so designs looked like scattered dots.
- Fix: **"Packed" view (default)** draws FILLED beads enlarged by
  `PACKED_DRAW` (1.15) so neighbours kiss like the real weave. Empty cells stay
  true-size (grid stays readable). Pure rendering — bead centres, hit-testing,
  bead counts and the printed chart are untouched. Persisted with Save artwork.
  Visual check: `scripts/packedview.mjs` (packed/spaced/zoom screenshots).
- 2026-06-11: the Packed/Spaced toggle became a **Bead spacing slider** (Bead
  size card): 0 = spaced (true size) … 1 = max packed; draw scale blends
  `1 + pack × (PACKED_DRAW − 1)`. Saved as numeric `pack`; old boolean
  `packed` saves still load (true→0.75, false→0).
- Same day, per user: max packing raised to **20%** (`PACKED_DRAW` 1.15→1.2)
  so beads can press/overlap for a denser fabric look. Beads *kiss* at 0.75 of
  the slider — that's the default, so the default look is unchanged.

## PNG export: browser canvas ceiling (fixed 2026-06-11)
- Bug: **Save PNG silently produced a blank sheet.** The chart rasterises at
  ~300 DPI (8mm/bead), and browsers FAIL SILENTLY past a max canvas size —
  iPad Safari's ceiling (~16.7M px) is hit by even a 6×6cm chart; 300cm
  canvases blow past every browser's limit.
- Fix: `rasterScale(w, h)` in `lib/chart.js` (cap: 15M px area, 8192px/side)
  shrinks the chart + the composed chart-and-legend PNG to fit — full 300 DPI
  when it fits, proportionally lower resolution when it doesn't, never blank.
- `buildPDF` (currently unused) still assumes an unscaled raster — see the
  CAUTION comment if PDF export is ever revived. Visual check:
  `scripts/exportcheck.mjs` (60×20cm export, counts coloured pixels).

## Duplicate / Move & place (2026-06-11)
- Selection card gains **Duplicate** and **Move**: both turn the selected
  coloured beads into a 55%-alpha ghost; pen/mouse drag moves it (relative
  grab — no jump), **Place** commits as one undo step, **Cancel** discards.
  The placed beads become the new selection so operations chain.
- Duplicate's ghost starts +1 col +2 rows from the original; Move's starts in
  place with the originals *hidden, not deleted* (`placing.hide`) — Cancel
  simply unhides them, Place deletes originals + writes the new spot in one
  commit.
- Ghost positions snap to **parity-valid origins** (row shift even, column
  parity = half the row shift) so every copied bead lands on an existing
  lattice node — same rule the pattern maker keeps. Fingers still pan
  (Procreate rule); only pen/mouse move the ghost.
- Default drawing colour is now the palette pink `#F3CEDE` (was dark maroon).
- Visual check: `scripts/duplicatecheck.mjs`.

## Named designs + design files (2026-06-11)
- "My designs" card (right panel): **multiple named design slots** in this
  browser (`beadwork3_designs_v1`), name pill + Save (same name overwrites),
  click a slot to load (undoable), × deletes (with confirm).
- **Export file / Import file** moves a design between devices as
  `<name>.beadwork.json` — the same design object every save path uses
  (`designData()` / `applyDesign()` in App.jsx; quick-save "Save artwork" and
  the boot restore share them).
- Background *images* are not embedded in saves/files (blob URLs die with the
  session — pre-existing behaviour); the design loads with its solid colour.
- Default palette replaced (user: old 15-swatch muted set rejected): **the
  user's own 5 colours** — pink `#F3CEDE`, chartreuse `#D8DA5F`, sky blue
  `#8BBEDD`, bone `#F4EEDF`, violet `#4A3772`. (User wrote "8BBED", 5 hex
  digits; interpreted as `#8BBEDD` — correct here if wrong.) Bead colours may
  be rich; only UI chrome must stay muted (spec §7.5).
- Fresh-start defaults per user (2026-06-11): **canvas 10×7 cm, 1.5 mm bead,
  15% packing** (spacing slider at 0.75). A restored save still wins over
  these — a design carries its own canvas/palette/spacing.
- Visual check: `scripts/designscheck.mjs` (save/load/export/import/reload).

## Layers feature (grilling 2026-06-15)
LOCKED so far:
1. **Purpose: separate design parts** (border / motif / background on different
   layers) so editing one never disturbs the others. Not blend-driven.
2. **Stacking: top layer wins.** Each lattice node holds one solid bead; the
   topmost VISIBLE layer's bead covers lower ones (opaque). Lower bead hidden,
   not deleted. No opacity blending (a woven bead is one solid colour).
3. **Per-layer controls: show/hide, reorder, lock, rename, duplicate, merge
   down, delete** (full layer management).
4. **Export: flatten visible layers** top-down into the single artisan chart;
   hidden layers omitted. (No per-layer sheets.)
5. **Flood-fill bounds the ACTIVE layer only** — spreads through the active
   layer's beads, stops at its colour boundaries, ignores other layers' beads.
6. **UI: floating Procreate-style layers panel** (top-right, opened by a
   button), not a side-panel card — keeps the side panels uncluttered, touch-friendly.
7. **Other layers shown normally** (full colour, real composite while editing);
   hide via the eye toggle. No onion-skin dimming.

Defaults taken (no objection raised — change if wrong):
- D1. All edit tools (draw / erase / select / pattern maker / duplicate / move)
  act on the **active layer only**.
- D2. New design starts with **one layer ("Layer 1")**; old saves + .beadwork.json
  files **migrate to a single layer**. Saves now store a layers array (each =
  its own bead Map + name/visible/locked) and the active-layer index.
- D3. **Background (solid colour / reference image) stays a global element
  beneath ALL layers**, not per-layer.
- D4. Painting on a **hidden or locked active layer does nothing** (no auto-show).
- D5. Merge-down composites with the same **top-wins** rule; new layers insert
  **above** the active one. Total-bead perf cap (250k, existing) spans all layers.

IMPLEMENTED 2026-06-15 (in `src/App.jsx`):
- Model: `layers` = array bottom→top of `{id,name,visible,locked,beads:Map}` +
  `activeId`. `beads`/`beadsRef` mirror the ACTIVE layer so every existing edit
  path (strokes, fill, selection, pattern, duplicate) is unchanged and naturally
  acts on the active layer only. `applyBeads` syncs the active Map back into the
  stack (deferred during silent strokes; `endDrag` calls `syncActiveLayer`).
- Undo/redo now snapshot the whole document (`{layers,activeId}`) — bead edits
  AND layer ops (add/delete/duplicate/merge/reorder) are one undo step each;
  visibility/lock/rename/switch-active are NOT undoable. Bead budget counts all
  layers. `currentDoc`/`applyDoc` are the snapshot/restore pair.
- Render: `drawScene` composites visible layers top-wins (`fillAt`); active uses
  live `beadsRef`. Export `flattenVisible()` flattens visible layers for the chart.
- Save format v2: `layers:[…]` + `activeIndex`; old single-`beads` saves migrate
  to one layer (`applyDesign`). UI: floating panel toggled from the tool strip.
- Verified by `scripts/layercheck.mjs` (fresh=1 layer, separate Maps, add/undo,
  hidden layer excluded from export). Screenshot `scripts/view-layers.png`.

## Multi-technique website (grilling 2026-06-15)
The 1-bead and 3-bead tools become ONE app; the GRID is the only difference.
Take the existing 3-bead app and make grid geometry pluggable per "technique";
every other feature (layers, palette, save, export, background, draw/erase/
select, brush, pattern, duplicate, iPad gestures) is shared as-is. The old
1-bead codebase is NOT merged — only its grid model is recreated.
LOCKED:
1. **1-bead grid = aligned grid of bead-shaped cells.** Straight rows & columns,
   NO stagger, NO tilt, every cell exists (full density), beads keep a real
   width:height ratio + rounded bead shape (loom / square-stitch look). Flood
   fill = 4 orthogonal neighbours. (3-bead stays exactly as today.)
2. **One artwork = one technique, chosen up front.** A technique-chooser popup
   appears at start / on "New artwork"; the choice is FIXED for that artwork —
   no mid-artwork switching. (Changing technique = start a new artwork.)
3. **Saved designs tagged by technique.** One shared "My designs" list; each
   design records its technique and reopens in the matching grid. Auto-restore
   and import/export carry the technique tag.
Still to tune (visual, against a reference if available): the 1-bead bead ratio
(default = same 4:5 as 3-bead, controllable by bead size), pitch/packing, and the
rounded-rect bead silhouette.

IMPLEMENTED 2026-06-15 (`src/techniques/` registry):
- `techniques/{index,threeBead,oneBead}.js`. Each technique supplies geometry
  (makeGeometry, beadCountFromCm, beadExists, beadAt, nearestBead), bead shape
  (beadPath exponent) + tilt, flood-fill neighbours, snap axes, and pattern/
  placement parity (snapMotifOrigin, copyStartOffset, evenUp, patternHalf,
  snapPlace). `App.jsx` and `lib/chart.js` call through the active technique
  instead of importing 3-bead math directly.
- `geometry.js` generalised (backward-compatible): `makeGeometry`/`beadCountFromCm`
  take `packX`/`packY`/`stagger`; `beadAt`/`nearestBead` take a density fn;
  `beadPath` takes a silhouette exponent (cached per-n).
- 1-bead packing measured from `assets/beadwork 1 grid.png` via
  `scripts/measure1grid.mjs`: PACK_X 1.235, PACK_Y 1.273, stagger off, full
  density, bead exponent 3.4 (boxier loom bead — tunable).
- Chooser popup: forced at first start, cancellable via "New artwork" (My
  designs card). `technique` tag added to saved design data; `applyDesign` reads
  it (missing/unknown ⇒ 3-bead) so auto-restore, named slots and import/export
  reopen in the matching grid.
- Verified: `scripts/techcheck.mjs` (3-bead unchanged), `onebeadcheck.mjs`
  (chooser + aligned grid), `techpersist.mjs` (technique round-trips on reload),
  `exporttechcheck.mjs` (PNG charts for both: export-1bead.png / export-3bead.png).

## My artworks gallery (grilling 2026-06-15)
Replaces the split "Save artwork" (DESIGN_KEY) + "My designs" slots with one
multi-artwork model. Supersedes "Named designs + design files" storage.
LOCKED:
1. **Device-local only.** Artworks live in this browser; Export/Import
   `.beadwork.json` files are the backup/transfer path. No accounts, no server.
2. **Quick-switch gallery, one artwork open at a time** (not multiple open
   simultaneously).
3. **Text list** — name · technique · beads · last-edited. No thumbnails.
4. **Auto-save only.** The open artwork saves itself continuously; the manual
   "Save artwork" button is removed. (Export stays for backups.)
5. **Each artwork = one record**: id, name, technique, full design data,
   last-edited time. Per-artwork actions: Open, Rename, Duplicate, Delete.
6. **"+ New artwork"** → technique chooser → blank canvas. **"← My artworks"**
   button returns to the list.
7. **Storage moves localStorage → IndexedDB** (the ~5MB localStorage ceiling
   can't hold many dense designs). Existing localStorage designs (named slots +
   the quick-save) migrate into the gallery on first load — nothing lost.
8. **On open: reopen the last-edited artwork** (continue where you left off);
   the gallery is one tap away via "← My artworks". First-ever visit (nothing
   saved) lands on the gallery → New artwork → technique chooser.
9. **New artworks auto-name from a forest/tree list** (theme: Morii = forest —
   e.g. Oak, Willow, Cedar, Birch, Rowan, Alder, Hazel, Fern, Moss, Aspen…).
   Pick the next unused name; when the list is exhausted, append a number.
   Rename anytime from the gallery. (No name prompt up front.)
10. **Reference background images are saved with the artwork** (stored in
    IndexedDB as a data URL) so they survive reopening — fixes the old
    blob-URL-dies-with-session loss. Adds weight per artwork; acceptable.
11. **"Export all" backup**: one button writes ALL artworks to a single backup
    file; re-importing restores them. Per-artwork Export/Import stays too.
Defaults (not separately grilled): gallery is a full-screen overlay in the
existing chooser's visual language; auto-save is debounced (~after edits settle
+ on leaving); Delete keeps a confirm; Duplicate = "<name> copy"; a New artwork
KEEPS canvas size, bead size, palette + spacing and resets only the background
to plain (so a previous artwork's reference image can't carry over).

IMPLEMENTED 2026-06-15:
- `src/lib/store.js` = IndexedDB wrapper (list/get/put/delete artworks + meta
  for lastOpenedId/migrated). One record = `designData()` + `id` + `updatedAt`.
- App.jsx: `screen` ('loading'|'gallery'|'editor'), `artworks` (summaries),
  `currentArtworkId`. Debounced auto-save (600ms) writes the open artwork.
  Boot migrates the old localStorage designs once, then reopens the last-edited
  (or shows the gallery). New artworks auto-name via `nextTreeName`.
- Reference bg images now read as data URLs (`onBgImage`) and reload into
  bgImgRef on `applyDesign`, so they persist; switching artworks clears a stale
  image. Manual "Save artwork" button removed; right panel "This artwork" card
  = name + ← My artworks + Export this artwork; gallery has Import/Back-up-all.
- Bug found + fixed during build: the 1-bead grid has GAPS between beads, so the
  oval hit-test left gaps unpaintable (a stroke could thread between beads). The
  technique now sets `hitCell: true` (defineTechnique) → the whole rectangular
  cell maps to its bead. The staggered 3-bead weave keeps the oval hit-test.
- Verified: scripts/gallerycheck, onebeaddraw, migratecheck, bgcheck.

## iPad / Apple Pencil pass (locked 2026-06-10)
1. Primary device is **iPad + Apple Pencil**. Pencil (and desktop mouse) draws;
   **single-finger drag pans only** (Procreate-style — no stray marks).
2. **2-finger pinch = zoom toward gesture midpoint + pan** (replaces nothing on
   desktop: wheel-zoom and space-drag stay).
2b. **2-finger twist = ROTATE the canvas** (added 2026-06-15), combined with the
   same pinch — zoom + rotate + pan happen together around the gesture. On
   lift, the rotation gently snaps to the nearest right angle if within ~7°.
   The view transform is now `screen = scale·R(rot)·doc + t`; ALL screen↔doc
   conversions go through `screenToDoc` (App.jsx) so drawing/hit-test stay
   correct. The status bar shows the angle; **Fit (the % button) resets
   rotation to 0** — it doubles as "straighten". Verified: scripts/rotatecheck.
3. **2-finger tap = undo, 3-finger tap = redo.** Undo history = bead edits only
   (one stroke = one step), capped at 50. Small ↶/↷ buttons sit in the zoom
   control for desktop; Ctrl/⌘+Z and Ctrl/⌘+Shift+Z also work.
4. Tools (Draw/Erase/Select) move to a **floating vertical strip on the right
   edge of the canvas** — under a right-handed user's hand, ≥44px touch targets.
   (Pencil double-tap gesture is not exposed to web apps, so on-screen it is.)
5. Bead density: the 1.5 mm size is **replaced by "1 mm" (1.05 × 1.3125 mm)**,
   giving exactly **6 beads (3 pairs) per cm** of row pitch. 3 mm stays.
6. Right panel: content **scrolls**; **Save PNG (red primary) + Save artwork**
   are clubbed and **pinned at the bottom** (overrides "no panel scrolling").
   Save PNG is now the highlighted action, not Save artwork.

## Drag-to-fill
- Dropping a palette colour anywhere fills the **nearest** bead's region
  (`nearestBead` in `lib/geometry.js`) — no longer requires dropping exactly on a
  bead.
- **Pointer-based, not HTML5 drag-and-drop** (2026-06-10): iPad Safari has no
  touch DnD. A ghost swatch follows the pointer; tap = pick colour, drag past
  8px = fill on release over the canvas. One path for finger/pencil/mouse.

## Background reference image (2026-06-10)
- The uploaded image is a **placeable reference under the beads**: "Adjust
  image" mode (auto-entered on upload; banner + DONE on canvas) — drag moves,
  pinch/wheel resizes (`bgT` = offset + scale over the cover fit, clamped
  0.2–8, clipped to the canvas).
- While a bg image is set, **empty beads draw outline-only** (no grey fill) so
  the design shows through; painted beads sit on top.
- Placement is saved with the artwork and **reproduced in the PNG export**
  (passed as fractions of the bead area → chart.js `paintImageBackground`).
- In adjust mode painting/undo-taps are suspended; gestures act on the image.
- **Show/Hide toggle**: hiding the image falls back to the solid colour (the
  colour picker appears in the card while hidden); placement is kept, Adjust
  is disabled, and a hidden image exports as the solid colour too.

## UI fixes pass (2026-06-10)
- On-screen background: **solid colour / image only** — transparent is an
  EXPORT-time choice only (`exportBg`).
- Clear canvas: **press-and-hold button (700 ms, sweeping fill, no confirm)**
  pinned at the LEFT panel's bottom; undo can restore.
- Both panels: content scrolls (`.panelScroll`), action cluster pinned below.
- App height **100dvh** (100vh hid the bottom buttons behind iPad Safari chrome).
- `Pill` inputs edit a local draft while focused, so the field can be cleared
  to retype (canvas cm fields were impossible to edit); hex text fits (14px).

> **NOTE (2026-07-20):** everything above this line is inherited verbatim from
> the beadwork tool's `DESIGN_DECISIONS.md` at the point this repo was forked
> — it describes the BEADWORK tool's UI (bead layers, "My designs" slots,
> etc.), not what's currently shipped here (which has since moved to the
> "My artworks" gallery, jat square grid, etc.). Treat it as historical
> background on the shared architecture, not as this repo's current state.
> The section below is the first entry that actually documents cross-stitch
> tool changes.

## Perf fixes + exact stitch shape (2026-07-20)
User reported the tool lagging; also supplied the studio's traced SVG
reference for the stitch mark (`assets/stitch svg/jat_basic _stitch.svg`) to
replace the earlier hand-built approximation.

1. **Stitch shape now traced from the reference SVG, not approximated.**
   `src/techniques/jat.js` `drawStitch` previously built a parametric concave
   4-point star via 4 `bezierCurveTo` calls RECOMPUTED every draw call. Now a
   `Path2D` is built ONCE from the SVG's literal path data (viewBox 1080×1350,
   same 4:5 ratio as the cell) and cached module-wide; each cell just
   `translate`s/`scale`s into place and fills the cached path. Exact visual
   match to the reference, and meaningfully cheaper per cell (no per-draw
   curve math). Verified `scripts/jatcheck.mjs` (screenshot shows the traced
   X, not the old symmetric astroid).
2. **`paintBrush` cloned the WHOLE bead Map on every pointer event during a
   freehand stroke** (up to ~240Hz) — `applyBeads(prev => new Map(prev)...)`
   ran per event, not per stroke, so a dense design allocated a full-map copy
   on every single pencil sample. Fixed the same way the beadwork tool fixed
   it: a new `strokeWorking` ref clones `strokeBase` lazily on the first real
   change and mutates that private copy in place for the rest of the stroke;
   reset to `null` at stroke start/end and whenever the line-snap path
   (`paintAlong`, which already rebuilds fresh from `strokeBase` each time)
   takes over, so it can't hold a stale/abandoned Map. Verified
   `scripts/undocheck.mjs` (freehand strokes still undo/redo as exactly one
   step each).
3. **No zoom/pan blit cache — every wheel/pinch/pan step re-ran the full
   per-cell redraw** (all the more expensive with the bezier/Path2D stitch
   draw). Added the same fix as the beadwork tool: `sceneCacheRef`/
   `cacheViewRef` hold the last full render + the view it was drawn at;
   `interactingRef` flips on for the duration of a gesture (`beginInteract()`,
   called from the wheel handler and the pinch/pan branches of
   `onPointerMove`), during which `requestRedraw` blits the cached raster
   through the device-space transform DELTA between the cached view and the
   live one (`devMat`/`drawBlit`) instead of walking every bead. Settles to a
   crisp full render (refreshing the cache) ~130ms after the gesture stops.
   The scene-repaint effect now goes through `requestRedraw` too, so both
   paths share one chooser. Verified `scripts/perfcheck.mjs` (35-step zoom
   burst over a filled canvas: 0 long tasks).
4. **Autosave debounce now scales with design size** (600ms → 1800ms above
   15k beads → 4000ms above 40k), matching the beadwork tool — serialising
   every layer on every settle only got expensive on a dense design.
5. **Found + fixed independently: Ctrl/⌘+Z silently did nothing after
   clicking ANY button** (zoom control, "+ New artwork", tool strip, ...).
   The guard required `e.target === document.body`; clicking a button moves
   focus off body, so undo bailed. This is the exact bug the beadwork tool
   fixed in its "Fixes + layers pass" — same fix here: only skip real text
   fields (`INPUT`/`TEXTAREA`/contentEditable), and blur any focused text
   input on canvas `pointerdown` so native input-undo can't fire instead.
   Verified `scripts/undocheck.mjs`.

Not done this pass (lower priority / separate from the live-drawing
complaint, flagged for later if still needed): the bead-texture tile overlay
for the mid-zoom LOD band (jat's grid has no stagger, so this would be a
simple 1×1 tile if built), fast/batched PNG export (`lib/chart.js`
`drawBeads` still does per-cell `beginPath→stroke→fill` with no flush — same
bug the beadwork tool's "fast PNG export" fix addressed, but this only
affects Save PNG, not drawing), reference-image downscaling.

## iPad UI pass — porting the beadwork tool's newer chrome (2026-07-20)
User asked to bring this tool's iPad UI in line with where the beadwork
tool's UI has moved on to since the fork point. Researched the gap (the
beadwork tool's `DESIGN_DECISIONS.md` is 1482 lines vs this file's ~430 —
substantial drift) and ported four pieces, all in `src/App.jsx` unless noted:

1. **Icon set → Framework7/iOS-style** (`src/icons.jsx`, new file, ported
   verbatim from the beadwork tool). Replaced the 8 inline outline-SVG icon
   components (`IconDraw`/`IconErase`/`IconSelect`/`IconLayers`/`IconEye`/
   `IconEyeOff`/`IconLock`/`IconUnlock`) with imports from `./icons` — same
   component names, so every call site is unchanged.
2. **Modal/panel touch-scroll**: added `overscroll-behavior: contain` to the
   three persistent scrollable regions (`.layersList`, `.panelScroll`,
   `.savedList`) so an iPad swipe inside them can't rubber-band/chain-scroll
   the page behind (already blocked at the body level, but the inner glow
   wasn't contained). Scope note: this app has no custom scrolling modals
   like the beadwork tool's Artwork Details drawer / PhotoImport (rename and
   delete use native `window.prompt`/`confirm`), so there was nothing further
   to redesign there.
3. **Gallery: thumbnail cards + long-press menu**, replacing the text-row
   list. `makeThumb(rec)` (near `summarize`) renders a small flat-colour PNG
   from a design record — iterates only PLACED beads (top-wins across
   visible layers), not the whole grid, so it stays cheap on a dense design —
   stored as `rec.thumb` alongside each artwork and regenerated wherever
   beads can change (autosave, file import, backup restore; duplicate just
   copies the existing thumb since beads don't change). `.galleryGrid` /
   `.artCard` show it (monogram letter if none yet, e.g. a brand new blank
   artwork). Tap opens; a ~450ms hold or right-click opens a floating
   `.artMenu` (Open/Rename/Duplicate/Delete) instead of always-visible
   buttons — `onCardPointerDown/Move/Up`, `LONG_PRESS_MS`/`LONG_PRESS_CANCEL_PX`
   near the `screen`/`artworks` state. Verified `scripts/gallerycards.mjs`.
4. **Layer groups + per-layer thumbnails**. `groups` state (parallel to
   `layers`, mirrored in a `groupsRef` exactly like `layersRef`) holds
   `{id,name,visible,locked,collapsed}`; member layers carry a matching
   `groupId` and MUST stay contiguous in z-order. `layers` itself stays a
   flat array (every hot path untouched) — this app has no drag-reorder yet
   (↑/↓ buttons only), so `moveLayer` simply refuses to move a grouped layer
   rather than risk splitting a group; Group/Ungroup are the only way to
   change a grouped layer's position. `groupWithBelow(id)` joins the active
   layer to the one directly below (its group if it has one, else forms a
   new one) — only offered on an ungrouped layer, so it's always a same-block
   extension, never a reorder. `flattenGroup` merges a group's layers
   top-wins into one, at the bottom member's slot, one undo step (same rule
   as the existing `mergeDown`). Group content changes (group/ungroup/
   flatten) are one undo step via the existing `currentDoc()`/`pushHistory`
   plumbing (just added `groups` to the snapshot); visibility/lock/rename/
   collapse are metadata, not undoable — same policy already used for
   per-layer toggles. `layerVisible(l, groups)` is the one place effective
   (layer AND group) visibility is computed; both `drawScene`'s composite and
   export's `flattenVisible` route through it. Save format bumped to v3:
   `designData()` adds `groups` + each layer's `groupId`; `applyDesign` drops
   dangling group ids (a group an import/hand-edit left with no members) and
   defaults to `groups: []` for any pre-v3 save (no migration step needed —
   absence is exactly a fresh/ungrouped state).
   Per-layer thumbnails (`layerThumb`, 34×24, same flat-colour-block approach
   as the gallery thumb but scoped to one layer's own beads) render in each
   layers-panel row.
   **Bug hit + fixed during this**: styled-jsx's scoping transform only walks
   JSX reachable from the component's `return` statement — it does NOT reach
   into a separately-defined helper function (`renderLayerRow`/
   `renderLayerRows` as top-level `const`s in the component body, called via
   `{renderLayerRows()}`), so those elements silently got NONE of the
   `.layerRow`/`.lpThumb`/etc. rules (no `jsx-<hash>` class), collapsing the
   whole row to unstyled block/inline defaults. Fixed by inlining the row
   renderer as a nested function inside an IIFE directly in the JSX
   (`{(() => { const row = (l, grouped) => (...); ...; return out })()}`),
   matching the pattern the existing `.layerActions` block already used.
   Worth remembering for any future layers-panel work in this file.
   Verified `scripts/layergroups.mjs` (group/ungroup member count, collapse
   hides rows, hide-group drops the right pixels and restores exactly,
   rename, flatten reduces to one layer with the exact same rendered pixels).

## Two stitch shapes: Cross + Line brush (2026-07-20)
User caught that `jat_basic _stitch.svg` was being rendered wrong: it's a
reference SHEET with TWO SEPARATE example stitches drawn on it (confirmed by
rendering each of its 3 `<path>`s in isolation) — a full cross/X and a single
diagonal-line stitch — not one combined shape. The earlier "exact SVG" pass
(same day, above) had merged all three into one Path2D, so every filled cell
was drawing the cross AND the line on top of each other.

LOCKED (grilled): the two shapes are separate BRUSH options, mixable
bead-by-bead within one design (like colour) — draw some stitches as Cross,
others as Line, each remembers its own shape. Toggle lives in the left panel
next to Brush, as a `.segmented` control (same visual pattern as the export
Transparent/On-screen toggle).

IMPLEMENTED:
- `src/techniques/jat.js`: split into `CROSS_PATH_D` (was the SVG's 2nd
  `<path>`) and `LINE_PATH_D` (the 1st `<path>`); the 3rd path (a sub-pixel
  Illustrator export sliver) is dropped entirely. Each motif is normalised to
  its OWN bounding box via a one-time `getBBox()` measurement (temporarily
  attaching an off-screen `<svg>`, cached forever after) rather than the
  shared 1080×1350 artboard the two were drawn on together — this is what
  makes both fill their cell edge-to-edge (tips touching neighbours, so a run
  of stitches reads as continuous diagonals) regardless of where each motif
  sat on the reference sheet. `fillBead(ctx,cx,cy,w,h,color,tilt,style)`
  picks the matching cached `{path,bbox}` by `style`.
- `src/lib/beadValue.js` (new): a bead Map's value is normally just a colour
  hex string (Cross, the default — every pre-existing save/design stays
  valid with ZERO migration). A Line stitch adds a trailing `"|L"` marker.
  `encodeBead(color,style)` / `decodeBead(value)` are the only two functions
  that touch this encoding.
- `stitchStyle` state (`'cross'|'line'`, default `'cross'`) in `App.jsx`,
  ephemeral like `color` (not saved separately — it's baked into whichever
  beads get painted while it's active, same as colour).
- Every WRITE path that paints new/changed beads with the current tool now
  encodes `(color, stitchStyle)`: `paintBrush`, `floodFill` (including its
  early-bail comparison and boundary detection — a same-colour cross and line
  region are treated as different regions, matching that they're visually
  different textures), `paintAlong` (line-snap draw). `recolorSelection` is
  the one exception: it decodes the EXISTING style and re-encodes with just
  the new colour, so Recolour never silently reshapes a stitch. Everywhere
  that just COPIES existing bead values through unchanged — `mergeDown`,
  `flattenGroup`, `flattenVisible` (export), the pattern maker, duplicate/move
  (`placing.motif`) — needed no change at all, since copying the raw encoded
  string already preserves whatever style it carried.
- Every READ path that turns a bead value into an actual CSS colour now
  decodes first: `drawScene`'s per-cell fill (both the `simple` LOD rect path
  and `tech.fillBead`), the duplicate/move ghost preview, the gallery
  thumbnail (`makeThumb`), the layers-panel thumbnail (`layerThumb`), and in
  `chart.js`: `drawBeads` (export/print) and `tallyColors` (the legend —
  grouped by colour only, so a cross and a line stitch of the same thread
  colour are ONE legend entry, not two, per the existing "swatch + count per
  colour" decision).
- Verified `scripts/stitchstyle.mjs`: default is Cross; switching to Line and
  drawing produces visibly distinct shapes in the same design; Recolour via
  marquee-select changes colour but keeps each stitch's shape; undo/redo
  correct; gallery round-trip (close artwork, reopen) preserves both shapes
  exactly; PNG export renders both shapes and the legend shows one merged
  colour entry (`×6` for 3 cross + 3 line of the same pink).

## 3rd brush: Line Flip (2026-07-20, same session)
User asked for a third option: the line stitch mirrored to the OTHER
diagonal. `beadValue.js`'s marker table extended to `{line: '|L', lineFlip:
'|F'}` (still zero migration for old plain-colour saves). No new path data
needed: `jat.js`'s `drawStitch` draws `style: 'lineFlip'` using the SAME
cached line motif, just with the cell transform's Y scale negated (and the Y
translate adjusted to `-(bbox.y + bbox.height)` instead of `-bbox.y`) — a
mirror within the motif's own bbox, so a "╱" becomes a "╲". Segmented control
in the left panel now has three buttons: ✕ Cross / ╱ Line / ╲ Flip. Verified
`scripts/stitchflip.mjs`: all three shapes render distinctly (and the flip
visibly mirrors to the other diagonal), round-trips through gallery
close/reopen exactly.
