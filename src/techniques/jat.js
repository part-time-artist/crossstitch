// Cross-stitch embroidery technique (Jat, Kutch). A regular SQUARE grid where
// every filled cell is one cross stitch, drawn as a concave four-pointed star
// with its tips on the cell corners (see "1 cell stitch unit reference.png").
// Structurally the simplest grid — no stagger, no tilt, full density, square
// cells — but the stitch mark is the star, not a solid bead, so it reads true to
// the embroidery (see DESIGN_DECISIONS, cross-stitch tool).
//
// SPACING IS A PLACEHOLDER: packX/packY = 1 makes square cells tile like graph
// paper. Calibrate the real fabric count / pitch against the user's reference
// image before declaring the grid done (the spec's hard rule: measure, never
// guess).
import { defineTechnique } from './defineTechnique'

const PACK = 1.0 // square cell == pitch → cells tile edge-to-edge (graph paper)
const existsAll = () => true // full density: every cell can hold a stitch

// Draw one cross stitch filling the cell at (cx,cy). The stitch unit is a concave
// four-pointed star (astroid): sharp points at the four cell CORNERS with the
// four sides bowing inward — see "1 cell stitch unit reference.png". Because the
// tips sit on the corners, stitches in a run touch and read as continuous
// diagonals, like real cross-stitch. Tilt is unused (upright grid). Geometry
// scales with the cell, so it stays crisp at any zoom.
const CONCAVITY = 0.82 // 0 = straight diamond/X, →1 = deeply pinched astroid arms
function drawStitch(ctx, cx, cy, w, h, color) {
  const hw = w * 0.5
  const hh = h * 0.5
  const corners = [
    [cx - hw, cy - hh],
    [cx + hw, cy - hh],
    [cx + hw, cy + hh],
    [cx - hw, cy + hh],
  ]
  // control point pulled from a corner toward the cell centre — deeper pull =
  // slimmer, more concave arms.
  const toward = (px, py) => [px + CONCAVITY * (cx - px), py + CONCAVITY * (cy - py)]
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(corners[0][0], corners[0][1])
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    const c1 = toward(a[0], a[1])
    const c2 = toward(b[0], b[1])
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1])
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export default defineTechnique({
  id: 'jat',
  label: 'Cross stitch embroidery',
  subtitle: 'EMBROIDERY',
  desc: 'Counted cross-stitch — square grid, each cell an X.',
  exists: existsAll,
  beadShapeN: 6, // near-square cell outline → fabric-grid look (rounded corners)
  packX: PACK,
  packY: PACK,
  stagger: false,
  hitCell: true, // tap anywhere in a cell to stitch it (square cells, no gaps to miss)

  tiltFor: () => 0, // upright grid

  // a filled cell is a cross stitch (concave 4-point star), not a solid bead
  fillBead: drawStitch,

  // flood fill = the 4 orthogonal neighbours (square grid)
  floodNeighbors: (col, row) => [
    { col: col - 1, row },
    { col: col + 1, row },
    { col, row: row - 1 },
    { col, row: row + 1 },
  ],

  // straight grid: horizontal + vertical lattice lines only
  snapAxes: (geo) => [
    { ux: 1, uy: 0, pitch: geo.Px },
    { ux: 0, uy: 1, pitch: geo.Py },
  ],

  // ---- motif placement / pattern parity ----
  // Every cell exists, so there is no parity constraint: a copy lands anywhere.
  snapMotifOrigin: (minC, minR) => ({ minC, minR }),
  copyStartOffset: { dc: 1, dr: 1 },
  evenUp: (n) => n,
  patternHalf: (n) => Math.max(1, Math.floor(n / 2)),

  snapPlace: (geo, x, y) => ({
    c: Math.round((x - geo.padX) / geo.Px),
    r: Math.round((y - geo.padY) / geo.Py),
  }),
})
