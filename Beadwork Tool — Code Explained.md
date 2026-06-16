# Beadwork Tool — Code Explained

> [!info] What this note is
> A plain-language map of the code behind **https://part-time-artist.github.io/Beadwork-3-tech/** — what each file is, what each part does, and *why it exists for the craft*. Read top to bottom once, then use it as a reference. Technical words are explained the first time they appear.

---

## 1. The big picture

The tool solves one real problem: **beads are not square.** A Kutch 3-bead-weave bead is taller than it is wide (4:5 ratio), and beads nestle into the gaps of the row below — like bricks in a wall, not like squares on graph paper. If you design on a normal pixel grid (Photoshop), the woven piece comes out squished. So this tool's *entire grid is built from the real bead's shape and the real weave's spacing*. What you draw is what the artisan weaves.

The app is a single web page. There is no server, no database — everything runs in your browser, and saving uses the browser's own storage.

### The files that matter

| File | One-line job |
|---|---|
| `index.html` | The empty page the browser loads first |
| `src/main.jsx` | Tiny starter — mounts the app onto the page |
| `src/App.jsx` | **The whole app**: every button, the canvas, all behaviour |
| `src/lib/geometry.js` | **All the bead-grid math** — pure, no UI |
| `src/lib/chart.js` | Draws the **printable chart** the artisan reads at the loom |
| `src/lib/store.js` | **Saves artworks** in the browser's larger database (IndexedDB) |
| `src/techniques/` | **One file per weave** (3-bead, 1-bead) — picks the grid rules |

That's the whole app — four files. The leftover folders from the open-source
project this was forked from (`components/`, `parts/`, `static/`, plus an
unused Tailwind CSS setup) were **deleted in the 2026-06-11 cleanup**; nothing
imported them, they only made the project look bigger than it is. `scripts/`
holds small Playwright scripts that open the app in a headless browser and
screenshot it — our stand-in for a test suite.

> [!tip] Why split geometry/chart out of App.jsx?
> `geometry.js` is *pure math* — give it numbers, it gives numbers back. It never touches the screen. That means the same math drives both the on-screen editor and the printed chart, so the two can never disagree. This is a classic programming idea: **separate "what is true" (math/data) from "how it looks" (UI).**

---

## 2. `src/lib/geometry.js` — the heart: where beads sit

### The lattice (the bead grid)

```js
export const PACK_X = 1.296  // horizontal spacing ÷ bead width
export const PACK_Y = 0.875  // vertical spacing ÷ bead height
```

These two numbers ARE the weave — they come from real measurements, not guesses:
- A bead is 80 wide × 100 tall in the Figma vectors → ratio 4:5.
- `PACK_X` is calibrated to the **real woven swatch**: 36 beads across 7 cm at a 1.5 mm bead → pitch 70 ÷ 36 ≈ 1.944 mm → 1.944 ÷ 1.5 ≈ **1.296**. (The first value, 1.59, came from Figma but left too much gap between beads.)
- Row-to-row distance in Figma was 87.75 → 87.75 ÷ 100 = **0.875**.

Because `PACK_Y` is *less than 1*, each row sits **closer than one full bead height** to the next — that's what makes beads nestle into the gaps below, the honeycomb look of real weaving. Odd rows also shift right by half a step (`rowOffset`) — the brick-wall offset.

### `makeGeometry({ Bw, Bh, cols, rows })`

Takes a bead's on-screen width/height (`Bw`, `Bh`) and how many columns/rows you want, and returns a little toolbox:
- `centerFor(col, row)` → the exact pixel centre of any bead. **One formula places every bead**: `x = padding + col × pitch + (half-step if odd row)`.
- `width` / `height` → total size of the whole design.

> [!note] Concept: a "cell address"
> Every bead has an address `(col, row)` — like a seat number in a theatre. The math converts addresses ↔ pixel positions. The design itself is just a list of "seat 4,7 = dark red".

### `beadCountFromCm(...)` — real-world sizing

You type the canvas size in **cm** and pick a bead size in **mm**. This function divides physical canvas size by physical bead pitch to get how many beads fit. Same packing constants → **screen and real weave agree**. This is the "physical layer" that makes the tool honest.

### `beadExists(col, row)` — the 3-bead pattern itself

```js
if (row % 2 === 1) return true            // base rows: every column filled
return ((col + row/2) % 2) === 1          // apex rows: only every other node
```

In the 3-bead weave, **base rows (odd) are fully packed**, but **apex rows (even) hold only half as many beads** — one upright apex bead above each *pair* of leaning base beads. This function is the gatekeeper: every other part of the code asks it "is there really a bead here?" before drawing, painting, or filling. (`%` is "remainder after division" — `row % 2` is 0 for even rows, 1 for odd. It's how code asks "odd or even?")

### `beadAt(geo, x, y)` — "which bead did I click?"

When you click pixel (x, y), this finds the bead under the cursor. Trick for speed: instead of checking all thousands of beads, it *estimates* the row/column from the math, then checks only the 3×3 neighbourhood around that guess. It measures distance in a "stretched" way (divide dx by half-width, dy by half-height) so the clickable area is **oval like the bead**, not circular.

### `nearestBead(geo, x, y)` — same, but never gives up

`beadAt` returns nothing if you click in a gap. `nearestBead` always returns the *closest* bead, even from a gap — used for **drag-a-colour-onto-the-canvas fill**, so a sloppy drop still works.

### `beadPath(...)` — the bead silhouette

The bead outline is a **superellipse** — an oval that's slightly boxy (exponent 2.4; plain ellipse = 2.0), matching a real glass bead's soft-rectangle look.

> [!tip] Performance trick worth understanding
> The curve is computed **once** as 36 points on a unit (size-1) shape, stored in `UNIT_BEAD`. Drawing a bead then just *scales and rotates* those ready-made points. Computing the curve fresh for 10,000 beads on every redraw would lag; reusing one precomputed shape is instant. **"Compute once, reuse forever"** is one of the most common performance patterns in programming.

---

## 3. `src/lib/chart.js` — the artisan's printout

This file renders the **deliverable**: the printed colour chart read bead-by-bead at the loom. Layout is done in **millimetres** and converted at `PX_PER_MM = 11.81` (≈300 DPI, print quality), so a chart bead prints at a fixed real size (~8 mm) regardless of design size.

- **`drawBeads`** — draws every bead, and gives **every bead a thin outline** even inside a same-colour run, so the artisan can *count* "7 dark-red beads" on paper. (Locked decision #2.)
- **`drawGuides`** — a bolder line every 10 rows/columns, chunking the grid for counting (like the heavier lines on graph paper).
- **`drawNumbers`** — row numbers down the left edge, column numbers along the top, every 10. The numbering *direction* lives only in two tiny functions (`rowLabel`, `colLabel`) so when the studio confirms weave order, it's a one-spot change.
- **`renderFullChart`** — combines all of the above onto one fresh canvas with a margin for the numbers.
- **`rasterScale`** — the blank-PNG guard. Browsers have a hidden maximum canvas size, and going past it doesn't throw an error — drawing just silently does nothing, so the saved PNG used to come out blank (iPad Safari has the smallest limit; even a 6×6 cm chart at 300 DPI brushed against it). This function answers "how much must I shrink this canvas to fit safely?" — 1 means "not at all, full 300 DPI", smaller numbers mean a proportionally lower-resolution (but never blank) export.
- **`tallyColors` + `renderLegend`** — counts beads per colour and draws the colour key ("`#7A2E2E` × 142") so the studio knows exactly how many beads to buy.
- **`buildPDF`** — old A4 multi-page export; currently unused (export is PNG-only now) but kept.

---

## 4. `src/App.jsx` — the app itself

This one file is the entire user interface (~1200 lines). It follows React's core idea:

> [!note] Concept: state → screen
> In React you never say "move that pixel". You keep **state** (the facts: which beads are filled, which tool is active, the zoom level) and describe how the screen should look *given* that state. Change a fact → React redraws. Every `useState(...)` line near the top declares one fact the app remembers.

### The design data — one humble Map

```js
const [beads, setBeads] = useState(() => new Map())
```

Your whole artwork is a **Map** (a dictionary): key `"col,row"` → colour hex. `"4,7" → "#7A2E2E"` means "bead at column 4, row 7 is dark red". Unfilled beads simply aren't in the Map. That's why saving is trivial — it's just a small list of address→colour pairs.

> [!warning] A real bug worth learning from: stale state
> React doesn't update the screen (or its state) the instant you call `setBeads` — it batches work and can lag many frames behind a fast Apple Pencil (240 events/second). Code that *read* the design from React's render-time state at the start of a new stroke could grab an **out-of-date Map** — and since line-snapping rebuilds the design as "old state + new line", the previous stroke vanished. The fix: every write now goes through one function, `applyBeads`, which updates a plain reference (`beadsRef`) **synchronously** before telling React. Anything that needs "the design right now" reads `beadsRef`, never the render-time value. Lesson: *UI state is for drawing the screen; fast-moving truth needs a synchronous home.*

### Physical model → screen size

- `beadMM` (1.5 mm or 3 mm beads) + `canvasCm` → `cols, rows` via `beadCountFromCm`. At 1.5 mm, a 7 cm row holds **exactly 36 beads** — pitch = 1.296 × 1.5 = 1.944 mm, and 70 ÷ 1.944 = 36, matching the real swatch.
- On screen: `Bw = beadMM.w × 8` px (8 screen pixels per real mm). So the artboard's size tracks the *cm canvas*, and changing bead size changes **density** (how many beads fit), not canvas size — exactly like real life.

### `tiltFor(col, row)` — the woven look

Even rows (apex beads) lie **horizontal** — rotated a full 90°, so they read wider-than-tall. In tilted (odd) rows, **neighbouring beads mirror each other** — +45°, −45°, +45° along the row — and the pattern flips phase from one tilted row to the next, so alternate beads down a column mirror too: a checkerboard of mirrored pairs around each horizontal bead (per `assets/rows explaination.png`). The whole pattern is one line of arithmetic: `((row+1)/2 + col) % 2` decides the lean sign.

### The view: zoom & pan like Figma

```js
const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
```

The canvas element is only ever the size of your *window*, never the design. Zoom/pan is a **camera**: `screen position = document position × scale + offset`. Scroll = zoom toward the cursor; Space-drag or middle-mouse = pan; the % button = fit to screen.

> [!tip] Why a camera instead of a giant canvas?
> Browsers refuse canvases bigger than ~16,000 px. A 300 cm design would blow past that. With a camera, the canvas stays small and we just change which part of the document it shows — this fixed the old "glitches above 60 cm" bug.

### The Bead spacing slider — why beads are drawn bigger than they are

In the real weave, beads press against each other — almost no background shows, which is exactly why motifs are so easy to read on real beadwork. If the screen draws every bead at its mathematically true size, the lattice spacing leaves visible ground between beads and a design looks like scattered dots. So the **Bead spacing slider** (in the Bead size card) lets you draw *filled* beads anywhere from true size ("Spaced", slider at 0) up to 20% larger ("Packed", slider at 1), where beads press into each other for a dense fabric look — purely a drawing trick. The code stores the slider as a number `pack` between 0 and 1 and computes the draw size as `1 + pack × (PACKED_DRAW − 1)` — this is called *linear interpolation*: at 0 you get exactly 1× (true size), at 1 you get exactly 1.2×, and in between you get proportionally in-between sizes. Beads just *touch* at 0.75 on the slider, which is the default. The bead's real position, its hit area, the bead counts and the printed chart all still use the true geometry.

### `drawScene` — the painter

Runs every time anything changes, in order: background (colour/image/checkerboard) → **only the beads currently visible** (off-screen beads are skipped — "culling") → selection rings → the dashed marquee rectangle. When zoomed far out it draws simple rectangles instead of detailed ovals ("level of detail") so even huge designs stay fast.

### Painting tools

- **`paintBead` / `paintBrush`** — set or delete entries in the beads Map. Brush sizes 2–6 paint all beads within a growing radius. If nothing actually changed, it returns the old Map untouched so React skips a pointless redraw.
- **`floodFill`** — the paint-bucket, triggered by *dragging a palette colour onto the canvas*. The drag itself is built from plain pointer events (a ghost swatch follows your finger/pencil/mouse; a quick tap just picks the colour) because **iPad Safari doesn't support HTML5 drag-and-drop for touch at all** — that's why the old version silently did nothing on iPad. The fill starts at the dropped bead and spreads to same-coloured neighbours, stopping at different colours. Crucially it spreads via the **staggered neighbours** — left, right, and the four *diagonal nestled* beads — because that's who actually touches whom in this weave. A square-grid flood fill would be wrong here.
- **Selection (marquee)** — drag a box; any **coloured** bead whose *centre* falls inside gets selected (stored as a Set of keys). Empty beads are never selectable — a selection is always a motif you actually drew. Then Recolour / Delete, or feed it to the pattern maker.
- **Pattern maker** — repeats the selected motif across the whole canvas in one of three classic textile layouts: **Grid** (straight rows and columns of copies), **Brick** (every other row of copies slides sideways by half a tile, like a brick wall), and **Half-drop** (every other *column* of copies drops down by half a tile). The **gap** number adds empty beads between copies. The repeat is anchored on your original motif, so your drawing becomes one tile of the pattern. Clicking a different layout (or changing the gap and clicking again) **replaces** the pattern — the tool remembers the canvas as it was before the pattern and rebuilds from that, so you can flip between Grid, Brick and Half-drop freely. The whole pattern is still a single undo step: tap undo and only your motif remains. (Drawing, erasing or any other edit "locks in" the current pattern.)
- One rule hides inside the pattern math: copies only ever sit at **even** column/row offsets from the original. Shifting by 1 would land apex-row beads on tilted rows and break the weave pattern — programmers call this keeping the "parity". It's also why a half-tile shift is rounded to an even number.

### Pointer handling — who is touching, and with what?

Every press/move/release arrives as a **pointer event** carrying a `pointerType`: `'pen'` (Apple Pencil), `'touch'` (finger), or `'mouse'`. The handlers branch on it (iPad pass, Procreate conventions):

- **Pencil or mouse** → the active tool: paint, erase, or drag a marquee. Space-drag / middle-mouse still pans on desktop.
- **One finger** → pan only. Fingers can never paint, so a resting finger can't leave stray marks.
- **Two fingers** → pinch *and twist*: zoom toward the midpoint, **rotate** the canvas by the angle your fingers turn through, and pan with their drift — all at once. The math keeps the *document point between your fingers* pinned under them. Because the canvas can now be rotated, the camera formula gained a rotation: `screen = scale × rotate(angle) × document + offset`, and every "where on the design is this finger?" calculation goes through one helper, `screenToDoc`. Lift your fingers near a quarter-turn and it **snaps to the right angle**; the **% button (Fit)** resets rotation to 0, so it doubles as "straighten". The current angle shows in the bottom status bar.
- **Quick 2-finger tap** → undo. **3-finger tap** → redo. A "tap" = all fingers up within 350 ms, having moved less than 12 px. The code tracks every active finger in a Map (`touchPts`, pointerId → position) and remembers the *maximum* finger count of the gesture.

`docFromEvent` converts a screen position into document coordinates by undoing the camera — the inverse of the drawing transform. While a pencil stroke is live, incoming finger touches are ignored (palm protection), and Safari's own `gesturestart/change/end` page-zoom events are blocked so only the canvas camera zooms, never the page.

### Straight-line snapping

While you drag a stroke, the code keeps the list of points your pencil passed through (`strokeRef`). Each move it asks: *does this whole path still fit one of the lattice's straight directions* — along a row, or one of the two weave diagonals? "Fit" means every recorded point stays within about one bead-height of the ideal line. Once the stroke spans **more than 3 beads** while fitting, it snaps: the design is rebuilt as *(what existed at stroke start)* + *a clean line of beads* sampled densely along the perfect axis from your start point. If you then curve away, it un-snaps and replays your recorded freehand path instead — nothing is lost. The same logic works for the eraser. Two performance guards matter on iPad: the recorded path only keeps points more than 1px apart, and the snapped line is only rebuilt when it actually gains/loses a bead-length — rebuilding the whole design Map 240×/second crashed mobile Safari. Knobs: `SNAP_BEADS` (3) and the `Bh * 0.9` tolerance in `evalSnap`, both in `App.jsx`.

### The background reference image

Upload an image and the tool drops into **adjust mode** (banner at the top, DONE to finish): dragging moves the picture, pinching or scrolling resizes it. Its placement lives in one small state object — `bgT = { x, y, scale }` — an offset and zoom *on top of* the automatic cover-fit. While adjusting, the same gesture code that normally pans/zooms the canvas is simply re-routed to update `bgT` instead of the view — one mechanism, two targets. Empty beads switch to outline-only over an image, so the reference design shows through and you bead "on top" of it. A **Hide/Show toggle** (`bgShown`) swaps the image for the solid background colour without losing its placement — handy for checking how the beadwork reads on its own — and a hidden image exports as the solid colour too. The placement is stored with your artwork and handed to the chart renderer as *fractions* of the canvas size, so the PNG export reproduces the exact same alignment even though it rasterises at print resolution.

### Undo / redo — a history of Maps

```js
const undoStack = useRef([])   // past bead Maps
const redoStack = useRef([])   // futures, after an undo
```

Because every edit *replaces* the beads Map with a new one (never mutates the old), "remembering the past" is just **keeping the old Map reference** — costs almost nothing. Undo = push the current Map onto the redo pile, restore the top of the undo pile.

The subtlety is **granularity**: one drag-stroke paints dozens of beads, but should undo as *one* step. So a stroke snapshots the Map once at pointer-down and commits that snapshot only if the stroke actually changed something. One-shot edits (flood fill, recolour/delete selection, applying a pattern, clear canvas) go through a small `commit()` helper that snapshots only when the edit really changed the Map. History is capped at 50 steps; any new edit clears the redo pile (you can't redo into a future you've overwritten). Desktop: `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, or the ↶ ↷ buttons by the zoom control.

### Duplicate / Move & place — stamping and shifting a motif

Select coloured beads, then tap **Duplicate** (a half-transparent "ghost" *copy* appears beside the original) or **Move** (the selection itself fades into a ghost, in place). Dragging with the pen or mouse moves the ghost; **Place** commits it (one undo step) and the placed beads stay selected, so you can immediately chain the next duplicate or move. A neat trick behind Move: the originals aren't deleted while you drag — they're only *hidden from drawing* — so Cancel simply unhides them and nothing was ever at risk. The interesting bit is *where* the ghost is allowed to sit: the weave's lattice isn't uniform (apex rows hold only every other bead, and the lean of base beads alternates), so the code snaps the ghost to positions where every bead still lands on a real lattice node — `snapPlace` in `App.jsx`. Without that snap, parts of the motif would silently vanish into the gaps of the weave.

### Saving — where your work lives

| What | Where | When |
|---|---|---|
| Your current artwork | `beadwork3_design_v1` | "Save artwork" button; auto-restores on load |
| Named designs | `beadwork3_designs_v1` | "My designs" card — Save stores a slot under the name, click a slot to load, × deletes |
| Saved palettes | `beadwork3_palettes_v1` | "Save current palette" |
| A design file | a downloaded `<name>.beadwork.json` file | "Export file" / "Import file" in My designs — the way to move a design between devices |
| PNG chart | a downloaded file | "Save PNG" (the red primary button) — calls `renderFullChart` + `renderLegend`, stacks them on one canvas, triggers a download |

All four design paths read and write the **same design object**, built by `designData()` and applied by `applyDesign()` in `App.jsx` — one format, four doors. The design file is plain JSON (structured text you could open in any editor), so it survives email, WhatsApp, AirDrop, or a USB stick on the way to another device. One limitation: a background *reference image* isn't carried inside saves or files — the design arrives with its solid background colour instead.

The right panel's cards scroll (`.panelScroll`), while Save PNG + Save artwork sit in a `.saveCluster` **pinned at the bottom** — a giant palette can no longer push the save buttons off-screen. The Draw/Erase/Select switch lives in a **floating strip on the canvas's right edge** (`.toolStrip`) with 56 px buttons, sized and placed for a right-handed iPad user's pencil hand.

> [!note] localStorage
> A small per-website storage box inside *your browser on your computer*. Nothing is uploaded anywhere; clearing browser data clears it.

### The look — `T` tokens + styled-jsx

All colours/fonts live in one object `T` at the top ("design tokens" — change `T.accent` once, everything updates). The theme is the **Nothing design language**: black chrome, monochrome greys, one red accent used sparingly, uppercase monospace labels, dotted-grid panels. The artboard itself stays **light** on purpose: you judge bead colours against near-white, like the printed paper — a colourful UI would bias your colour perception. Styles are written in `<style jsx>` blocks (CSS scoped to this component). The `Pill` component at the bottom is the reusable inline-labelled input (the "6 ︱cm W" boxes).

---

## 5. How a click becomes a bead (the full journey)

1. You click the canvas → `onPointerDown` fires.
2. `docFromEvent` converts screen pixels → document coordinates (undoes zoom/pan).
3. `beadAt` (via `brushCells`) finds which bead address `(col, row)` that is — checking `beadExists` so gaps in apex rows can't be painted.
4. `paintBrush` writes `"col,row" → colour` into the beads Map.
5. React notices the Map changed → `drawScene` repaints → `beadPath` draws the superellipse at `centerFor(col, row)`, tilted by `tiltFor`.
6. Later, "Save PNG" feeds the *same Map* and *same math* into `chart.js` → outlined, numbered, legended chart for the loom.

---

## 5b. Layers (like Procreate) — added 2026-06-15

**The idea:** instead of one sheet of beads, the design is now a *stack* of
sheets ("layers"). You might put the border on one, the main motif on another,
and the background on a third — so editing one never disturbs the others.

**The key rule:** a real bead is one solid colour, so layers can't blend like
Procreate's paint. Where two visible layers both fill the same bead node, the
**top layer wins** (it simply covers the one below — nothing is deleted).

**How it's built (the simple version):**
- Each layer is its own beads Map plus a name, a *visible* flag and a *locked*
  flag. They live in the `layers` array, ordered **bottom → top**.
- One layer is *active* (`activeId`). To avoid rewriting every drawing tool, the
  active layer's Map is mirrored into the same old `beads` / `beadsRef` the
  whole app already used — so **all the drawing code keeps working unchanged and
  automatically paints only the active layer.** Every write is copied back into
  the stack.
- **Undo** now remembers the *whole stack* at each step (it was just one Map
  before). So undo reverses both bead strokes and layer actions like add/delete/
  merge. Cheap, because unchanged layers are shared, not copied.
- **Drawing the screen** (`drawScene`) walks the visible layers top-to-bottom
  per bead and draws the first colour it finds (`fillAt`). **Export**
  (`flattenVisible`) squashes the visible layers into one Map → the single chart
  the artisan reads.
- **Saving** now stores `layers` + which one was active; old saves with a single
  `beads` list are auto-converted into one layer when opened.
- A layer that's **hidden or locked** can't be drawn on (a small note appears,
  and the tools are disabled).

The panel is the floating box you open with the **Layers** button on the right
tool strip: an eye to show/hide, the name (double-click to rename), a lock, the
bead count, and Dup / Merge↓ / move / Del actions.

---

## 6. Vocabulary cheat-sheet

| Term | Meaning here |
|---|---|
| **State** | A fact the app remembers (current tool, zoom, the beads Map) |
| **Map / Set** | Dictionary (key→value) / bag of unique items |
| **Canvas** | An HTML element you draw pixels on with JavaScript |
| **`ctx`** | The canvas "drawing context" — the pen you draw with |
| **Transform** | The camera math: scale + offset between document and screen |
| **Culling** | Skip drawing what's off-screen |
| **LOD (level of detail)** | Draw simpler shapes when things are tiny |
| **Parity** | Odd/even-ness — here it encodes apex rows vs base rows |
| **Hit-test** | "Which object is under this point?" (`beadAt`) |
| **Pure function** | Math in → math out, touches nothing else (`geometry.js`) |
| **Design tokens** | Named colours/sizes in one place (`T`) |
| **localStorage** | The browser's small private storage box |

---

## 6.5 The two techniques (1-bead & 3-bead)

The tool started as a 3-bead-weave editor. As of 2026-06-15 it also does the
**1-bead** weave (the loom / square-stitch look). The clever part: **the only
real difference between the two is the grid.** Drawing, erasing, filling,
layers, palettes, saving, exporting — all identical. So instead of building a
second app, we made the grid *swappable*.

> [!info] What "technique" means here
> A **technique** is one weave's set of grid rules, bundled into one file. The
> app keeps one technique "active" at a time and asks it the grid questions —
> "where does bead (col,row) sit?", "does a bead exist here?", "which neighbours
> does a flood-fill spread to?" — instead of hard-coding the 3-bead answers.

### The files

```
src/techniques/
  index.js       — the list of techniques + a getTechnique(id) lookup
  threeBead.js   — the Kutch 3-bead weave (staggered, tilted, half-density)
  oneBead.js     — the 1-bead loom grid (straight, upright, every cell filled)
```

Each technique file is a plain object that answers the same set of questions.
The two that matter most:

| The grid question | 3-bead answer | 1-bead answer |
|---|---|---|
| Stagger rows like bricks? | yes (odd rows shift half a bead) | no (straight columns) |
| Does every cell hold a bead? | no — apex rows are half-empty | yes — full density |
| Tilt the beads? | yes — the woven lean | no — upright |
| Flood-fill spreads to… | 6 nestled neighbours | 4 up/down/left/right |
| Bead shape | soft oval | boxier (loom bead) |

`App.jsx` and `chart.js` never mention "3-bead" anymore — they ask the **active
technique** (`tech.beadExists(...)`, `tech.beadPath(...)`, and so on). Swap the
technique and the whole grid changes with it.

> [!tip] Why measure, not guess, the 1-bead spacing?
> The 1-bead grid's spacing (`PACK_X` 1.235, `PACK_Y` 1.273 in `oneBead.js`)
> came from a real reference image (`assets/beadwork 1 grid.png`) measured by
> `scripts/measure1grid.mjs` — the script finds the beads in the picture and
> reads their spacing. The spec's rule: *measure against a real reference, never
> assume.*

### One artwork = one technique

When you open the tool with no saved work, a **chooser popup** asks which weave
you're designing for. That choice is **fixed** for that artwork — there's no
"switch weave" button mid-design, because changing the grid under an existing
design would scramble it. To change technique you start fresh: the **"New
artwork"** button (in *My designs*) reopens the chooser and blanks the canvas.

Every saved design records its technique (a `technique` tag in the saved data),
so reopening it — whether from auto-restore, your *My designs* list, or an
imported file — brings back the matching grid automatically. Old designs saved
before this feature have no tag, so they're treated as 3-bead (which they were).

---

## 6.6 Saving & the "My artworks" gallery

You can keep **many artworks** and switch between them. When you open the tool it
shows **My artworks** — a list of everything you've made (name · weave · bead
count · when you last touched it) — or, if you were just working, it reopens your
**last artwork** so you can carry on. From the editor, **← My artworks** (in the
*This artwork* card) takes you back to the list.

> [!info] How saving works now
> There's **no Save button** — your open artwork **saves itself** a moment after
> you stop drawing (this is called *auto-save*; it waits ~0.6s so it isn't saving
> on every single pencil mark). Each artwork is one **record** — its name, weave,
> the whole design, and the time you last edited it.

**Where it's stored.** Earlier the tool used the browser's tiny storage box
(`localStorage`, ~5 MB — fine for a handful of designs). It now uses
**IndexedDB**, the browser's *bigger* database, so you can keep lots of artworks
(and their reference images). `src/lib/store.js` is a thin wrapper around it:
`listArtworks`, `getArtwork`, `putArtwork`, `deleteArtwork`, plus a small
`meta` box that remembers which artwork to reopen. The first time you load the
new version, your old saved designs are **carried over automatically**.

**New artworks are named after the forest** (*Morii* means forest): Oak, Willow,
Cedar, Birch… (`TREE_NAMES` / `nextTreeName` in `App.jsx`). Rename anytime.

**Backups.** It's all on this one device, so the gallery has **Back up all**
(saves every artwork into one file) and **Import file / backup** (restores them,
or adds a single design someone shared). *This artwork → Export* saves just the
open one. The reference image you trace under the beads is now saved **inside**
the artwork (stored as the image's own text form, a *data URL*), so it's still
there when you reopen — it used to vanish.

> [!tip] One subtlety the 1-bead weave exposed
> The 1-bead grid has small **gaps** between beads. The "what bead is under the
> pen?" test originally only counted a hit if you touched the bead's oval — so a
> stroke could slip through the gaps and draw nothing. The fix: for a full grid
> (1-bead), the whole **cell** counts as that bead (`hitCell` in the technique),
> so tapping anywhere paints. The overlapping 3-bead weave never had gaps, so it
> keeps the original oval test.

---

## 7. Where to make common changes

- 3-bead weave spacing looks off → `PACK_X` / `PACK_Y` in `geometry.js`
- 1-bead grid spacing looks off → `PACK_X` / `PACK_Y` in `techniques/oneBead.js`
- Bead shape too round/boxy → `beadShapeN` in the technique file (3-bead `2.4`, 1-bead `3.4`)
- Lean angle of base beads → `Math.PI / 4` (45°) in `tiltFor`, `techniques/threeBead.js`
- Add a whole new weave → a new file in `techniques/` + list it in `techniques/index.js`
- New-artwork names (the trees) → `TREE_NAMES` in `App.jsx`
- Auto-save delay → the `600` (ms) in the auto-save `useEffect`, `App.jsx`
- Where artworks are stored → `src/lib/store.js` (IndexedDB names at the top)
- 1-bead "tap anywhere in a cell to paint" → `hitCell` in `techniques/oneBead.js`
- Chart numbering direction → `rowLabel` / `colLabel` in `chart.js`
- Guide-line frequency → `GUIDE_EVERY` in `chart.js`
- Printed bead size → `printBeadMm` (default 8 mm)
- UI colours → the `T` object at the top of `App.jsx`
- Add a bead size option → `BEAD_SIZES` in `App.jsx`
- Undo history depth → `HISTORY_MAX` in `App.jsx` (default 50)
- Multi-finger tap feel → the `350` ms / `12` px thresholds in `onPointerMove`/`liftTouch`, `App.jsx`
- Zoom limits → the `0.02, 8` clamps in `zoomAt` and the pinch handler
- Rotation snap angle → the `0.12` (radians ≈ 7°) in `snapRotation`, `App.jsx`
- Layer compositing (who wins on overlap) → `fillAt` in `drawScene`, `App.jsx`
- What export includes → `flattenVisible` in `App.jsx`
- New-layer name / where it inserts → `addLayer` in `App.jsx`
- Layers panel look → the `.layersPanel` styles in `App.jsx`
