// Staggered (brick/offset) lattice of oval beads for the 3-bead technique.
// Everything is driven from bead size so changing the ratio rescales the grid.
// See BEADWORK_TOOL_SPEC.md §4.

// Packing constants (pitch as a multiple of bead size). Beads nestle when
// PACK_Y < 1 and rows are half-offset, so each bead drops into the gap of the
// row above/below.
// PACK_X calibrated to the user's real woven swatch (2026-06-10): 36 beads
// across 7cm at a 1.5mm bead → pitch 70/36 ≈ 1.944mm → 1.944/1.5 ≈ 1.296.
// (Was 1.59 from the Figma vectors; lowered so beads sit denser, smaller gaps.)
export const PACK_X = 1.296 // horizontal centre-to-centre / bead width
export const PACK_Y = 0.875 // vertical row pitch / bead height (87.75/100)

// `packX`/`packY` default to the 3-bead constants; a technique passes its own.
// `stagger` controls the half-pitch shift of odd rows: true = brick-offset weave
// (3-bead), false = an aligned grid (1-bead loom / square-stitch).
export function makeGeometry({
  Bw, Bh, cols, rows, padScale = 0.75,
  packX = PACK_X, packY = PACK_Y, stagger = true,
}) {
  const Px = packX * Bw
  const Py = packY * Bh
  const rowOffset = stagger ? Px / 2 : 0
  const padX = Bw * padScale
  const padY = Bh * padScale

  const centerFor = (col, row) => ({
    cx: padX + col * Px + (row % 2) * rowOffset,
    cy: padY + row * Py,
  })

  // Width must fit the offset of odd rows too (+ rowOffset on the right edge).
  const width = padX * 2 + (cols - 1) * Px + rowOffset
  const height = padY * 2 + (rows - 1) * Py

  return { Px, Py, rowOffset, padX, padY, centerFor, width, height, Bw, Bh, cols, rows }
}

// Convert a physical canvas size (cm) + physical bead size (mm) into a bead/row
// count, using the same packing ratios so screen and real weave agree.
export function beadCountFromCm({
  canvasWcm, canvasHcm, beadWmm, beadHmm, packX = PACK_X, packY = PACK_Y,
}) {
  const pitchXmm = packX * beadWmm
  const pitchYmm = packY * beadHmm
  const cols = Math.max(1, Math.round((canvasWcm * 10) / pitchXmm))
  const rows = Math.max(1, Math.round((canvasHcm * 10) / pitchYmm))
  return { cols, rows }
}

// In the 3-bead weave the lattice is not fully packed. Base rows (odd) carry a
// bead in every column; apex rows (even) hold only half — one upright apex bead
// sits above each pair of base beads. Measured from assets/Frame 2.png: an even
// (apex) row node exists iff (col + row/2) is odd. Odd (base) rows are always
// filled. Apply everywhere so the empty apex nodes can't be drawn or painted.
export function beadExists(col, row) {
  if (row % 2 === 1) return true
  return (((col + row / 2) % 2) + 2) % 2 === 1
}

// Hit-test: nearest bead center to a point, within an oval radius. Returns
// { col, row } or null. Skips lattice nodes that hold no bead. `exists`
// defaults to the 3-bead density; a technique passes its own (1-bead = full).
export function beadAt(geo, x, y, exists = beadExists) {
  const { Px, Py, rowOffset, padX, padY, Bw, Bh, cols, rows } = geo
  const approxRow = Math.round((y - padY) / Py)
  let best = null
  let bestD = Infinity
  for (let row = approxRow - 1; row <= approxRow + 1; row++) {
    if (row < 0 || row >= rows) continue
    const offset = (row % 2) * rowOffset
    const approxCol = Math.round((x - padX - offset) / Px)
    for (let col = approxCol - 1; col <= approxCol + 1; col++) {
      if (col < 0 || col >= cols) continue
      if (!exists(col, row)) continue
      const cx = padX + col * Px + offset
      const cy = padY + row * Py
      // normalized oval distance
      const dx = (x - cx) / (Bw / 2)
      const dy = (y - cy) / (Bh / 2)
      const d = dx * dx + dy * dy
      if (d <= 1 && d < bestD) {
        bestD = d
        best = { col, row }
      }
    }
  }
  return best
}

// Like beadAt but with NO radius cutoff — returns the closest existing bead to a
// point even if the point lands in a gap. Used for drag-and-drop fill so a colour
// dropped anywhere fills the nearest bead's region.
export function nearestBead(geo, x, y, exists = beadExists) {
  const { Px, Py, rowOffset, padX, padY, cols, rows } = geo
  const approxRow = Math.round((y - padY) / Py)
  let best = null
  let bestD = Infinity
  for (let row = approxRow - 2; row <= approxRow + 2; row++) {
    if (row < 0 || row >= rows) continue
    const offset = (row % 2) * rowOffset
    const approxCol = Math.round((x - padX - offset) / Px)
    for (let col = approxCol - 2; col <= approxCol + 2; col++) {
      if (col < 0 || col >= cols) continue
      if (!exists(col, row)) continue
      const cx = padX + col * Px + offset
      const cy = padY + row * Py
      const dx = x - cx
      const dy = y - cy
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = { col, row }
      }
    }
  }
  return best
}

// Precompute unit superellipse silhouettes ONCE per exponent (n=2.4 = soft
// 3-bead oval; higher = boxier, for the 1-bead loom bead). Drawing then only
// scales/rotates cached points — no per-bead Math.pow, so re-rendering a full
// grid on bead-size change stays smooth (perf).
const UNIT_BEAD_CACHE = new Map()
function unitBead(n) {
  let pts = UNIT_BEAD_CACHE.get(n)
  if (pts) return pts
  const steps = 36
  pts = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const ct = Math.cos(t)
    const st = Math.sin(t)
    pts.push([
      Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n),
      Math.sign(st) * Math.pow(Math.abs(st), 2 / n),
    ])
  }
  UNIT_BEAD_CACHE.set(n, pts)
  return pts
}

// Build a soft, slightly-rounded bead silhouette centred at cx,cy. `n` is the
// superellipse exponent (2 = ellipse, higher = boxier). Caller fills and/or
// strokes afterwards (path stays valid after restore).
export function beadPath(ctx, cx, cy, Bw, Bh, tilt = 0, n = 2.4) {
  const rx = Bw / 2
  const ry = Bh / 2
  const unit = unitBead(n)
  ctx.save()
  ctx.translate(cx, cy)
  if (tilt) ctx.rotate(tilt)
  ctx.beginPath()
  for (let i = 0; i < unit.length; i++) {
    const x = unit[i][0] * rx
    const y = unit[i][1] * ry
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.restore()
}
