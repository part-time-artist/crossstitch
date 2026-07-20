// Cross-stitch embroidery technique (Jat, Kutch). A regular SQUARE grid where
// every filled cell is one stitch, drawn as the EXACT traced shape from the
// studio's reference vector (`assets/stitch svg/jat_basic _stitch.svg`).
// Structurally the simplest grid — no stagger, no tilt, full density, square
// cells — but the stitch mark is the traced motif, not a solid bead, so it
// reads true to the embroidery (see DESIGN_DECISIONS, cross-stitch tool).
//
// SPACING IS A PLACEHOLDER: packX/packY = 1 makes square cells tile like graph
// paper. Calibrate the real fabric count / pitch against the user's reference
// image before declaring the grid done (the spec's hard rule: measure, never
// guess).
import { defineTechnique } from './defineTechnique'

const PACK = 1.0 // square cell == pitch → cells tile edge-to-edge (graph paper)
const existsAll = () => true // full density: every cell can hold a stitch

// The reference SVG (viewBox 0 0 1080 1350) is a sheet with TWO SEPARATE
// example stitches drawn on it, not one combined shape — a full cross/X near
// the top and a single diagonal-line stitch near the bottom (confirmed by
// rendering each path in isolation; a 3rd path is a sub-pixel Illustrator
// export sliver, dropped). Two brush options, one path each. Path data
// copied verbatim, fill colour stripped (it's set per-bead at draw time).
const CROSS_PATH_D =
  'M771.971,88.2c-27.851,15.725-54.33,32.824-80.314,50.418c-26.401,17.724-51.965,36.29-77.364,55.015c-25.175,18.95-50.734,37.518-75.052,57.324c-0.057,0.047-0.115,0.093-0.172,0.14c-9.661,7.876-23.346,8.107-33.004,0.227c-0.223-0.182-0.446-0.364-0.67-0.546c-24.29-19.838-49.81-38.447-74.982-57.396c-25.404-18.723-50.985-37.272-77.427-54.954c-26.348-17.777-53.205-35.044-81.522-50.857c-6.568-3.644-15.008-3.62-21.792,1.097c-8.823,6.135-10.83,18.532-5.576,27.907c15.653,27.932,32.713,54.451,50.27,80.476c17.685,26.437,36.234,52.018,54.954,77.424c18.95,25.173,37.559,50.691,57.396,74.983c0.135,0.166,0.27,0.331,0.405,0.497c7.797,9.558,7.797,23.183,0,32.741c-0.135,0.165-0.27,0.331-0.405,0.497c-19.84,24.29-38.447,49.81-57.396,74.982c-18.723,25.404-37.272,50.987-54.954,77.427c-17.777,26.35-35.044,53.205-50.857,81.522c-3.644,6.568-3.62,15.008,1.097,21.792c6.135,8.823,18.531,10.83,27.906,5.577c27.932-15.651,54.452-32.711,80.474-50.271c26.44-17.685,52.02-36.232,77.427-54.954c25.173-18.95,50.691-37.559,74.983-57.394c0.224-0.182,0.448-0.365,0.672-0.548c9.656-7.882,23.341-7.65,33.004,0.224c0.057,0.047,0.115,0.094,0.172,0.14c24.318,19.806,49.875,38.374,75.05,57.326c25.4,18.728,50.963,37.291,77.367,55.012c26.309,17.818,53.13,35.127,81.365,51.014c6.571,3.674,15.025,3.664,21.82-1.057c8.843-6.144,10.836-18.575,5.542-27.951c-15.725-27.851-32.824-54.33-50.418-80.314c-17.724-26.401-36.287-51.965-55.015-77.364c-18.949-25.175-37.518-50.734-57.324-75.053c-0.095-0.117-0.19-0.233-0.285-0.35c-7.968-9.753-7.969-23.507-0.002-33.26c0.095-0.116,0.19-0.232,0.284-0.349c19.806-24.319,38.374-49.875,57.326-75.05c18.728-25.4,37.291-50.963,55.012-77.367c17.818-26.309,35.124-53.128,51.014-81.365c3.674-6.571,3.664-15.025-1.057-21.82C793.778,84.899,781.348,82.906,771.971,88.2z'
const LINE_PATH_D =
  'M302.026,1141.093l-0.463-0.574c-6.63,9.433-13.184,18.943-19.627,28.563c-17.586,26.058-34.664,52.603-50.33,80.581c-5.251,9.378-3.255,21.789,5.582,27.934c6.796,4.722,15.247,4.744,21.811,1.092c28.353-15.82,55.239-33.108,81.629-50.915c9.598-6.421,19.086-12.952,28.497-19.583c0.022-0.022,0.055-0.033,0.077-0.055c16.493-11.595,32.744-23.455,48.929-35.381c7.745-5.825,15.534-11.628,23.301-17.431c86.428-67.96,165.255-147.846,235.994-240.43c1.842-2.482,3.696-4.932,5.549-7.403c11.441-15.523,22.826-31.1,33.991-46.899c0.177-0.265,0.364-0.519,0.563-0.783l-0.011-0.011c6.939-9.83,13.791-19.726,20.531-29.754c17.619-26.026,34.73-52.536,50.473-80.415c5.307-9.389,3.31-21.822-5.538-27.978c-6.807-4.733-15.28-4.733-21.844-1.059c-28.276,15.898-55.129,33.241-81.474,51.069c-9.995,6.708-19.847,13.537-29.644,20.443l0.397,0.596C507.527,891.771,392.172,1008.406,302.026,1141.093z'

// SVG getBBox() needs a connected element; measure once (lazily) then cache
// forever — the reference paths never change at runtime.
function measureBBox(d) {
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  const path = document.createElementNS(svgNS, 'path')
  path.setAttribute('d', d)
  svg.appendChild(path)
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;'
  document.body.appendChild(svg)
  const box = path.getBBox()
  document.body.removeChild(svg)
  return box
}

// Each motif is normalised to its OWN bounding box (not the shared 1080×1350
// artboard the two were drawn on together) so both fill a cell edge-to-edge
// regardless of where they happened to sit on the reference sheet — tips
// touching the cell edges is what makes a run of stitches read as continuous
// diagonals, same logic as the original single-shape version.
const motifs = {}
function getMotif(style) {
  let m = motifs[style]
  if (!m) {
    const d = style === 'line' ? LINE_PATH_D : CROSS_PATH_D
    m = { path: new Path2D(d), bbox: measureBBox(d) }
    motifs[style] = m
  }
  return m
}

// Draw one stitch filling the cell at (cx,cy) with the traced reference
// shape for `style` ('cross' default, 'line', or 'lineFlip'). 'lineFlip' is
// the SAME line motif mirrored vertically within its own bbox (negative Y
// scale + a matching translate) — a "/" line flips to a "\" line, the other
// diagonal — so no separate path data is needed for it. Tilt is unused
// (upright grid). Path2D + bbox are built once and cached per real motif —
// only the transform + fill colour vary per bead, so this stays cheap at scale.
function drawStitch(ctx, cx, cy, w, h, color, tilt, style) {
  const flip = style === 'lineFlip'
  const { path, bbox } = getMotif(flip ? 'line' : style)
  ctx.save()
  ctx.translate(cx - w * 0.5, cy - h * 0.5)
  if (flip) {
    ctx.scale(w / bbox.width, -h / bbox.height)
    ctx.translate(-bbox.x, -(bbox.y + bbox.height))
  } else {
    ctx.scale(w / bbox.width, h / bbox.height)
    ctx.translate(-bbox.x, -bbox.y)
  }
  ctx.fillStyle = color
  ctx.fill(path)
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

  // a filled cell is a stitch mark (cross or single line), not a solid bead.
  // Called as fillBead(ctx, cx, cy, w, h, color, tilt, style) — style comes
  // from decodeBead(rawValue) in App.jsx/chart.js and defaults to 'cross'.
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
