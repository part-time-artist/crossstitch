# Beadwork Design Tool — 3-Bead Technique (Build Spec)

> Handoff spec for a fresh chat. Read this top-to-bottom before writing code.
> It captures the *why*, the exact grid geometry, the feature set, and the
> mistakes a previous attempt made so they are not repeated.

---

## 1. Why this exists (context)

Beadwork is a traditional craft from **Kutch, Gujarat**. Artisans there weave
beads into patterned pieces. A design studio (where the author is interning)
designs new pieces *for* these artisans and must hand them a **visual design**
the artisan can follow bead-by-bead.

**The problem we are solving:**
- Designers used to draw each bead by hand — extremely tedious.
- They switched to **Photoshop pixelation**, but Photoshop pixels are **square**.
- Real beads are **not square** — they have a width:height ratio like **2:3 or
  1:2** (varies by bead type).
- So a design drawn on a square-pixel grid comes out **squished width-wise**
  when the artisan actually weaves it. The made piece looks wrong vs the sketch.

**The fix:** a tool whose grid is built from the **real bead shape and the real
weave geometry**, so what the designer draws is what the artisan makes — no
distortion. It also gives the artisan a clearer, true-to-craft visual.

---

## 2. Scope

- **Focus: the 3-bead technique only.** (A separate **1-bead technique** tool is
  already built — do NOT work on that here.)
- "3-bead technique" refers to the *weave structure* of the craft. Reference
  unit is in `assets/Frame 3.png`: one **apex bead** on top + two **base beads**
  below.
- **Important correction (see §6):** the *weave* groups beads in 3s, but in the
  **tool, the designer colors ONE bead at a time.** One oval = one fillable cell.

---

## 3. Authoritative references (assets)

Base assets folder: `W:\Madhura\Morii\beadwork tool\code\assets`

| File | What it is | Use |
|---|---|---|
| `MacBook Air - 1.png` | **Rough UI mockup**: canvas of outlined ovals in a staggered grid; one blue + one red bead filled individually; right-side panel with controls | **AUTHORITATIVE for grid geometry & overall UI layout** |
| `Frame 3.png` | The single 3-bead unit (1 apex + 2 base) | Shows the motif/weave logic |
| `Frame 2.png` | That unit repeated into a filled red field | Supporting: how a finished pattern reads |
| `techniques/3 bead technique.jpg` | Photo of **real woven beads** (white field, maroon motif, black/white border) | Supporting: true nestled packing & bead shape |
| `beadwork examples/*.webp` | Finished real beadwork pieces | Inspiration / end goal |
| `ui inspo/original_56b7…png` | **Figma-style settings panels** — flat color blocks, icon tabs, inline-labeled inputs, big primary button | **PRIMARY UI reference** (see §7.5) |
| `ui inspo/original_bf2…png` | Glassmorphism card (blur, translucency, rounded) | UI mood: soft/modern |
| `ui inspo/original_df26…webp` | "Humble Beings" — muted earthy palette, minimal geometric, calm grid | UI palette/typography mood |

> The mockup is "rough" — treat its **arrangement/offset** as the target, but
> expect to **tune spacing visually** against it and the technique photo.

---

## 4. THE GRID GEOMETRY  ← most important section

The canvas is a **staggered (brick/offset) lattice of oval beads**, NOT a square
grid and NOT boxes.

### 4.1 Measured from the mockup (`MacBook Air - 1.png`)
Pixel measurements of the empty grid + the two colored beads:

- Bead outline bounding box ≈ **40 px wide × 47 px tall** (near-round to slightly
  tall in the mockup; final ratio is user-controlled, default 2:3 — see §6).
- **Horizontal pitch** (center-to-center of two beads in the *same* row) ≈ **113 px**.
- **Vertical pitch** (row to row) ≈ **42 px**.
- **Row offset:** every alternate row is shifted **right by ≈ 56 px (≈ half the
  horizontal pitch)**.
- Because vertical pitch (42) < bead height (47) and rows are half-offset, beads
  **nestle diagonally** into the gaps of the row above/below → the dense,
  honeycomb-like look of the real weave.

### 4.2 Parametric model to implement (clean + tunable)
Drive everything from bead size so changing the ratio rescales the whole grid:

```
Bw, Bh           = bead width, height (default ratio 2:3 → e.g. 40 × 60)
colPitch (Px)    = horizontal center-to-center spacing within a row
rowPitch (Py)    = vertical center-to-center spacing between rows
rowOffset        = Px / 2   (applied to odd rows)

bead center for (col, row):
  cx = PAD_X + col*Px + (row % 2)*rowOffset
  cy = PAD_Y + row*Py
```

Starting values that reproduce the mockup's nestled look (TUNE against the
mockup overlay):
- `Px ≈ 2.8 * Bw`  (mockup: 113 ≈ 2.8 × 40)
- `Py ≈ 0.7 * Bh`  (mockup: 42 ≈ 0.7 × 60)
- `PAD_X`, `PAD_Y` ≥ half a bead so edge beads (top row / left column) are not
  clipped at the canvas border.

> **Verify by overlay:** render the grid, screenshot it, and visually compare to
> `MacBook Air - 1.png` before declaring geometry done. The previous build failed
> precisely because geometry was assumed, not checked against the mockup.

### 4.3 Rendering rules
- **Empty cell = thin OUTLINED oval** (bead shape), like the mockup. Not a box,
  not a dot.
- **Filled cell = solid oval** in the chosen color.
- Oval shape should read as a soft, slightly-rounded bead (the frames use gently
  rounded ovals, almost superellipse — not a hard ellipse, not a rectangle).
- (Open detail — confirm visually) The mockup hints some beads are rounder (base)
  and some taller (apex). Default to a **uniform oval** for all cells; only add
  per-position orientation if the user asks after seeing v1.

---

## 5. What went wrong in the previous attempt (do NOT repeat)

A prior build (in `W:\Madhura\claude code\beadworks-brick-repeat`, a fork of the
old Beadworks repo) failed on these points:

1. **Drew square BOX outlines for the grid.** ✗ — must be **oval** outlines.
2. **Treated a 3-bead group as one paint unit** (clicking filled 3 beads). ✗ —
   must be **one bead per cell** (§6).
3. **Geometry was guessed**, never overlaid on the mockup, so the arrangement
   looked wrong.
4. UI was poor / unpolished (the user was unhappy with it).

There was also a real, reusable lesson worth keeping if rebuilding on that repo:
the old `next.config.js` set `assetPrefix: '/Beadworks'` (for GitHub Pages). In
**dev** that makes the browser request JS bundles from `/Beadworks/_next/*` →
404 → React never hydrates → a dead "hollow shell" page. If reusing that repo,
make the prefix **production-only**:
```js
const isProd = process.env.NODE_ENV === 'production';
module.exports = { assetPrefix: isProd ? '/Beadworks' : '' };
```

---

## 6. Bead / fill model

- **One oval bead = one fillable cell.** Clicking colors a single bead. (The
  mockup proves this: a lone blue bead and a lone red bead are filled
  independently.)
- **Bead ratio:** default **2:3** (width:height). User-selectable to other
  ratios (e.g. **1:2**) because it varies by bead type. Changing the ratio
  rescales bead ovals and the whole lattice (§4.2).

---

## 7. Required UI / features

From the mockup + author's list:

**Canvas**
- Set **canvas size** (in bead units — i.e. number of beads / rows, so the
  physical bead shape, not square pixels, defines dimensions).
- **Clear canvas** option (with confirm).

**Drawing**
- **Color any individual bead.**
- **Draw** and **Erase** tools.
- **Drag to paint** multiple beads.
- **Drag-and-drop a color to flood-fill** within a bounded region / selection
  (fill stops at differently-colored beads, like a paint-bucket within a
  boundary).

**Color**
- Color picker.
- **Create / save custom palettes.**

**Bead**
- **Selectable bead size / ratio** (default 2:3; §6).

**Background**
- Background options: **transparent**, **solid color**, and **image
  (JPEG/PNG)**.

**Export** (implied — the deliverable for the artisan)
- Export the design as an image (PNG). Decide with user whether grid outlines are
  included in export.

---

## 7.5 UI Visual Direction  ← user-specified, important

The previous build's UI was **rejected** (cramped, dark, hard to read). The user
wants something **"like Figma — easy to understand."** Direction comes from
`assets/ui inspo/` (see §3).

**Overall feel:** light, airy, rounded, flat-color, high-clarity. The canvas is
the star; controls are calm and obvious. Opposite of a dense dark toolbar.

**Concrete cues (from `original_56b7…png`, the primary reference):**
- **Floating rounded panels** with generous padding and large corner radius
  (~16–20px), soft drop shadows. Group controls into a few clear cards (e.g.
  *Canvas*, *Bead*, *Color*, *Background*, *Export*) rather than one long rail.
- **Icon tab row** at the top of a panel to switch sections (like the cube /
  bulb / image / camera tabs in the ref).
- **Inline-labeled inputs:** big bold value with a small grey label *inside* the
  same pill — e.g. `40 W`, `60 H`, `1440 width`, `2:3 ratio`. White rounded
  input pills on a soft colored card. This is the signature look — use it for
  bead size, canvas size, etc.
- **One big primary action button**, full-width, bold, high-contrast (like the
  dark "Render" button on the orange card). Use for the main action
  (e.g. *Create Canvas* / *Export*).
- **Active state = bold solid fill** (the selected tab/card is filled with the
  accent color; inactive are muted grey).

**Palette & type:**
- **DECIDED: all muted / earthy, neutral UI** (greens, beige, off-white, soft
  black) per `original_df26…webp`. **No bright accent colors.**
- **Why (functional, not just taste):** the designer is judging *bead* colors on
  the canvas. A colorful UI would bias/interfere with their color perception, so
  the interface must stay neutral and recede. Keep chrome quiet; let the bead
  colors be the only saturated thing on screen.
- Active/selected states should be shown with **tone/weight** (darker fill,
  border, soft shadow) rather than a saturated accent hue. Avoid the old
  dark-brown theme too — go light and calm.
- Clean, rounded sans-serif. Big readable numbers in inputs. Lots of whitespace.
- Optional **soft glassmorphism** (subtle blur/translucency, rounded) for
  floating panels, per `original_bf2…png` — tasteful, not heavy.

**Layout:** canvas fills the main area; a single clean side or floating panel
holds the grouped control cards. Keep it scannable — a first-time designer should
understand it without a tutorial.

---

## 8. Tech notes & starting point

- Previous fork: `W:\Madhura\claude code\beadworks-brick-repeat` — a copy of the
  open-source **Beadworks** repo (`part-time-artist/Beadworks`), **Next.js +
  HTML canvas**, single-file UI in `pages/index.js`. It already has working:
  color picker (HSV), palette save/load (localStorage), draw/erase, flood-fill,
  background transparent/solid/image, undo-redo, rulers, minimap, PNG export.
  **The reusable machinery is good; the GRID and UI polish are what need
  redoing.**
- **Decision for the new chat:** confirm with the user whether to (a) keep
  rebuilding on that fork, or (b) start a cleaner implementation. Either way,
  the canvas/geometry layer must be rewritten per §4; most of the
  color/palette/background/export plumbing can be reused.
- **Long-term goal:** once this 3-bead tool is solid, **merge it with the
  existing 1-bead tool** into one app with a technique selector. Keep that in
  mind but do **not** build it until the 3-bead tool is approved.

---

## 9. Definition of done (v1)

1. Canvas renders a staggered grid of **outlined ovals** that visually matches
   `MacBook Air - 1.png` when overlaid (geometry verified, not assumed).
2. Clicking/dragging colors **individual** beads; flood-fill works within
   boundaries.
3. Bead ratio selectable (default 2:3); changing it rescales the grid correctly,
   with **no width-squishing** vs the intended bead shape.
4. Palette create/save, draw/erase, background transparent/solid/image, canvas
   size, clear canvas all working.
5. PNG export produces an artisan-usable visual.
6. UI is clean and matches the mockup's intent (the previous UI was rejected).

---

## 10. Open questions to confirm with the user (early)

- Exact **spacing/overlap** of beads (tune v1 against the mockup + technique
  photo).
- Whether beads should have **per-position orientation** (rounder base vs taller
  apex) or stay **uniform ovals** (default uniform for v1).
- **Canvas-size units**: number of beads wide × rows tall? Or a physical size
  (cm) converted via bead dimensions?
- **Export**: include grid outlines or beads only?
- Reuse the `beadworks-brick-repeat` fork vs **clean rebuild**?
- ~~UI accent/palette~~ — **DECIDED:** all muted/earthy neutral UI, no bright
  accents, so UI colors don't bias bead-color perception (§7.5).
