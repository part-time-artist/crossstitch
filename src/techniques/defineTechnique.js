// Build the geometry methods every technique shares from the few values that
// actually differ: the density predicate `exists`, the bead silhouette exponent
// `beadShapeN`, and the lattice packing/stagger. Omitting packX/packY/stagger
// falls through to geometry.js's 3-bead defaults. Each technique then spreads in
// only its own behaviour (tilt, flood neighbours, snap axes, pattern parity).
// (Kept separate from index.js so the technique modules can import it without a
// circular dependency through the registry.)
import {
  makeGeometry,
  beadCountFromCm,
  beadAt,
  nearestBead,
  beadPath,
} from '../lib/geometry'

// `hitCell`: on a full-density aligned grid the beads have gaps between them, so
// an oval hit-test leaves the gaps unpaintable (a stroke can thread between
// beads). When set, the whole rectangular CELL maps to its bead — clicking
// anywhere in the grid paints. The staggered weave keeps the oval hit-test.
export function defineTechnique({ exists, beadShapeN, packX, packY, stagger, hitCell, ...rest }) {
  const hitTest = hitCell
    ? (geo, x, y) => {
        const n = nearestBead(geo, x, y, exists)
        if (!n) return null
        const { cx, cy } = geo.centerFor(n.col, n.row)
        return Math.abs(x - cx) <= geo.Px / 2 && Math.abs(y - cy) <= geo.Py / 2 ? n : null
      }
    : (geo, x, y) => beadAt(geo, x, y, exists)
  return {
    beadExists: exists,
    makeGeometry: ({ Bw, Bh, cols, rows }) =>
      makeGeometry({ Bw, Bh, cols, rows, packX, packY, stagger }),
    beadCountFromCm: ({ canvasWcm, canvasHcm, beadWmm, beadHmm }) =>
      beadCountFromCm({ canvasWcm, canvasHcm, beadWmm, beadHmm, packX, packY }),
    beadAt: hitTest,
    nearestBead: (geo, x, y) => nearestBead(geo, x, y, exists),
    beadPath: (ctx, cx, cy, Bw, Bh, tilt = 0) => beadPath(ctx, cx, cy, Bw, Bh, tilt, beadShapeN),
    ...rest,
  }
}
