// Technique registry. One artwork = one technique; the grid is the only thing
// that differs between techniques. Each technique supplies geometry, cell shape,
// flood-fill neighbours and pattern/placement parity; App.jsx and the chart
// renderer call through the active technique instead of hard-coding grid math.
// The shared geometry-method factory lives in ./defineTechnique.
//
// This is the Jat cross-stitch tool: jat is the only registered technique. The
// beadwork techniques (threeBead.js / oneBead.js) are kept on disk for reference
// but unregistered — re-add them here to bring multi-technique back.
import jat from './jat'

export const TECHNIQUES = [jat]
export const DEFAULT_TECHNIQUE = 'jat'

export function getTechnique(id) {
  return TECHNIQUES.find((t) => t.id === id) || jat
}
