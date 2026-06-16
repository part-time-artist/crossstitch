// 3-bead weave technique (Kutch). Brick-offset lattice of oval beads, apex rows
// half-density, woven tilt. This module collects the behaviours that used to be
// inline in App.jsx; the shared geometry methods come from defineTechnique
// (packing/stagger default to the 3-bead values in geometry.js).
import { beadExists } from '../lib/geometry'
import { defineTechnique } from './defineTechnique'

export default defineTechnique({
  id: '3bead',
  label: '3-bead weave',
  subtitle: '3-BEAD TECHNIQUE',
  exists: beadExists,
  beadShapeN: 2.4, // soft oval silhouette

  // Apex (even) rows lie horizontal; tilted (odd) rows mirror ±45° in a
  // checkerboard.
  tiltFor: (col, row) => {
    if (row % 2 === 0) return Math.PI / 2
    const A = Math.PI / 4
    return ((row + 1) / 2 + col) % 2 === 1 ? -A : A
  },

  // Flood-fill walks the staggered neighbours: left/right + 4 nestled diagonals.
  floodNeighbors: (col, row) => {
    const odd = row % 2
    const diagL = odd ? col : col - 1
    const diagR = odd ? col + 1 : col
    return [
      { col: col - 1, row },
      { col: col + 1, row },
      { col: diagL, row: row - 1 },
      { col: diagR, row: row - 1 },
      { col: diagL, row: row + 1 },
      { col: diagR, row: row + 1 },
    ]
  },

  // Straight lattice lines for stroke snapping: along a row + the two weave
  // diagonals.
  snapAxes: (geo) => {
    const dl = Math.hypot(geo.Px / 2, geo.Py)
    return [
      { ux: 1, uy: 0, pitch: geo.Px },
      { ux: geo.Px / 2 / dl, uy: geo.Py / dl, pitch: dl },
      { ux: -(geo.Px / 2) / dl, uy: geo.Py / dl, pitch: dl },
    ]
  },

  // ---- motif placement / pattern parity ----
  // The weave is not uniform, so motif origins and tile pitches snap to EVEN
  // cells to keep apex/base parity and the tilt checkerboard intact.
  snapMotifOrigin: (minC, minR) => ({ minC: minC - (minC % 2), minR: minR - (minR % 2) }),
  copyStartOffset: { dc: 1, dr: 2 }, // a fresh copy nudges to a parity-valid spot
  evenUp: (n) => n + (n % 2),
  patternHalf: (n) => {
    const s = Math.floor(n / 2)
    return Math.max(2, s - (s % 2))
  },

  // Snap a dragged copy's origin so every motif bead lands on an existing node.
  snapPlace: (geo, x, y, pl) => {
    let r = Math.round((y - geo.padY) / geo.Py)
    if ((((r - pl.baseR) % 2) + 2) % 2 === 1) r += (y - geo.padY) / geo.Py > r ? 1 : -1
    const off = (r % 2) * geo.rowOffset
    let c = Math.round((x - geo.padX - off) / geo.Px)
    const dHalf = ((((r - pl.baseR) / 2) % 2) + 2) % 2
    if (((c - pl.baseC + dHalf) % 2 + 2) % 2 === 1) c += (x - geo.padX - off) / geo.Px > c ? 1 : -1
    return { c, r }
  },
})
