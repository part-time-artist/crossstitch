// Printed-chart rendering for the artisan deliverable. The on-screen editing
// canvas and the exported PNG/PDF share the bead-drawing helpers here so the
// screen and the print never diverge (CLAUDE.md). All chart layout is done in
// millimetres and rasterised at PX_PER_MM so a bead prints at a fixed real size.
//
// See BEADWORK_TOOL_SPEC.md and the locked design decisions in
// ~/.claude/plans/distinch-and-with-outlines-curried-eich.md.

import { getTechnique } from '../techniques'
import { decodeBead } from './beadValue'

export const PX_PER_MM = 11.81 // ~300 DPI raster
export const A4 = { w: 210, h: 297 } // mm
export const GUIDE_EVERY = 10 // bolder guide line + edge number every N beads/rows

// Browsers have a hard canvas-size ceiling and FAIL SILENTLY past it — drawing
// becomes a no-op and the exported PNG comes out blank. iPad Safari has the
// smallest ceiling (~16.7M pixels total); even a 6×6cm chart at 300 DPI sits
// right at that edge, and big canvases (up to 300cm) blow past every browser's
// limit. rasterScale(w, h) returns the factor (≤1) a canvas of that size must
// be shrunk by to stay safely inside the ceiling — full 300 DPI when it fits,
// proportionally lower resolution when it doesn't, never blank.
const MAX_CANVAS_AREA = 15e6 // pixels, safely under iPad Safari's ~16.7M
const MAX_CANVAS_DIM = 8192 // per-side ceiling, safe on all modern browsers
export function rasterScale(w, h) {
  return Math.min(1, MAX_CANVAS_DIM / w, MAX_CANVAS_DIM / h, Math.sqrt(MAX_CANVAS_AREA / (w * h)))
}

const key = (c, r) => `${c},${r}`

// Muted chart chrome (no bright accents — spec §7.5).
const C = {
  emptyOutline: '#C7C0B2',
  filledOutline: 'rgba(46,43,38,0.35)',
  guide: 'rgba(46,43,38,0.28)',
  number: '#6B6458',
}

// --- numbering direction (DEFERRED weave-order decision lives here only) ------
// Default: horizontal rows numbered top->bottom, columns left->right. Change
// these two functions to switch direction once the studio confirms weave order.
const rowLabel = (r) => r + 1
const colLabel = (c) => c + 1

// Build a print-scale geometry: bead width fixed to printBeadMm (default 8mm),
// height following the real bead ratio. Returned dimensions are in pixels.
export function makePrintGeo({ cols, rows, printBeadMm, beadRatio, tech }) {
  const Bw = printBeadMm * PX_PER_MM
  const Bh = printBeadMm * beadRatio * PX_PER_MM
  return tech.makeGeometry({ Bw, Bh, cols, rows })
}

// --- shared bead drawing (used by screen + export) ----------------------------
export function drawBeads(ctx, { geo, beads, cols, rows, tiltFor, tech }) {
  const lw = Math.max(0.8, geo.Bw * 0.035)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!tech.beadExists(col, row)) continue
      const { cx, cy } = geo.centerFor(col, row)
      const raw = beads.get(key(col, row))
      const { color: fill, style } = raw ? decodeBead(raw) : { color: null, style: 'cross' }
      const tilt = tiltFor(col, row)
      // faint cell outline first so every cell stays countable on paper, like
      // graph paper (locked decision #2); the stitch mark is drawn on top.
      tech.beadPath(ctx, cx, cy, geo.Bw, geo.Bh, tilt)
      ctx.lineWidth = lw
      ctx.strokeStyle = fill ? C.filledOutline : C.emptyOutline
      ctx.stroke()
      if (fill) {
        if (tech.fillBead) {
          tech.fillBead(ctx, cx, cy, geo.Bw, geo.Bh, fill, tilt, style)
        } else {
          ctx.fillStyle = fill
          ctx.fill()
        }
      }
    }
  }
}

// Bolder guide lines every `every` rows/cols to chunk the grid for counting.
export function drawGuides(ctx, { geo, cols, rows, every = GUIDE_EVERY }) {
  ctx.save()
  ctx.strokeStyle = C.guide
  ctx.lineWidth = Math.max(1, geo.Bw * 0.04)
  const x0 = geo.padX - geo.Px / 2
  const x1 = geo.padX + (cols - 1) * geo.Px + geo.rowOffset + geo.Px / 2
  const y0 = geo.padY - geo.Py / 2
  const y1 = geo.padY + (rows - 1) * geo.Py + geo.Py / 2
  for (let r = 0; r <= rows; r += every) {
    const y = geo.padY + r * geo.Py - geo.Py / 2
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
  }
  for (let c = 0; c <= cols; c += every) {
    const x = geo.padX + c * geo.Px - geo.Px / 2
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke()
  }
  ctx.restore()
}

// Edge row/column numbers. mode 'margin' draws into the negative-coordinate
// margin (export); mode 'inset' draws just inside the top/left edge (screen,
// where the canvas has no margin).
export function drawNumbers(ctx, { geo, cols, rows, every = GUIDE_EVERY, mode = 'margin' }) {
  ctx.save()
  ctx.fillStyle = C.number
  const fs = Math.max(9, geo.Bw * 0.34)
  ctx.font = `600 ${fs}px -apple-system, 'Segoe UI', sans-serif`
  ctx.textBaseline = 'middle'
  const off = mode === 'margin' ? -fs * 0.9 : fs * 0.7
  // rows down the left edge
  ctx.textAlign = mode === 'margin' ? 'right' : 'left'
  for (let r = 0; r < rows; r += every) {
    const { cy } = geo.centerFor(0, r)
    ctx.fillText(String(rowLabel(r)), off, cy)
  }
  // columns along the top edge
  ctx.textAlign = 'center'
  ctx.textBaseline = mode === 'margin' ? 'bottom' : 'top'
  for (let c = 0; c < cols; c += every) {
    const { cx } = geo.centerFor(c, 0)
    ctx.fillText(String(colLabel(c)), cx, off)
  }
  ctx.restore()
}

// Image backgrounds carry the user's on-screen placement as fractions of the
// bead-area size (background.t = { scale, fx, fy }), so the chart reproduces
// exactly the alignment the designer set under the beads. Drawn into the bead
// area (after the margin translate), clipped so it never spills into margins.
function paintImageBackground(ctx, W, H, img, t = { scale: 1, fx: 0, fy: 0 }) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.clip()
  const s = Math.max(W / img.width, H / img.height) * (t.scale || 1)
  const dw = img.width * s
  const dh = img.height * s
  ctx.drawImage(img, (W - dw) / 2 + (t.fx || 0) * W, (H - dh) / 2 + (t.fy || 0) * H, dw, dh)
  ctx.restore()
}

// Render the entire chart (beads + outlines + guides + edge numbers) to a fresh
// canvas. A margin on the top/left holds the edge numbers. Returns the canvas.
export function renderFullChart({
  beads, cols, rows, tiltFor, tech, printBeadMm = 8, beadRatio = 1.25,
  background, guides = true, numbers = true, every = GUIDE_EVERY,
}) {
  tech = tech || getTechnique('3bead')
  const geo = makePrintGeo({ cols, rows, printBeadMm, beadRatio, tech })
  const margin = numbers ? Math.max(11, printBeadMm * PX_PER_MM * 0.5) : 0
  const W = Math.ceil(margin + geo.width)
  const H = Math.ceil(margin + geo.height)
  const canvas = document.createElement('canvas')
  // shrink to fit the browser's canvas ceiling (see rasterScale) — layout maths
  // stay in full-resolution pixels, ctx.scale maps them onto the smaller canvas
  const scale = rasterScale(W, H)
  canvas.width = Math.ceil(W * scale)
  canvas.height = Math.ceil(H * scale)
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  if (background && background.type === 'solid') {
    ctx.fillStyle = background.color
    ctx.fillRect(0, 0, W, H)
  }
  ctx.translate(margin, margin)
  if (background && background.type === 'image' && background.img) {
    paintImageBackground(ctx, geo.width, geo.height, background.img, background.t)
  }
  drawBeads(ctx, { geo, beads, cols, rows, tiltFor, tech })
  if (guides) drawGuides(ctx, { geo, cols, rows, every })
  if (numbers) drawNumbers(ctx, { geo, cols, rows, every, mode: 'margin' })
  return canvas
}

// --- colour legend ------------------------------------------------------------
// Grouped by actual colour, regardless of stitch style (locked decision #7:
// "swatch + total bead count per colour" — a cross and a line stitch of the
// same thread colour are one legend entry, not two).
export function tallyColors(beads) {
  const m = new Map()
  for (const v of beads.values()) {
    const { color } = decodeBead(v)
    m.set(color, (m.get(color) || 0) + 1)
  }
  return [...m.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count)
}

// Render the legend (swatch + hex + total count per colour) to its own canvas.
export function renderLegend(beads, { scale = PX_PER_MM } = {}) {
  const tally = tallyColors(beads)
  const pad = 6 * scale
  const rowH = 9 * scale
  const sw = 7 * scale
  const W = Math.ceil(70 * scale)
  const H = Math.ceil(pad * 2 + (tally.length + 1) * rowH)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#2E2B26'
  ctx.font = `700 ${4.6 * scale}px -apple-system, 'Segoe UI', sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText('Colour key', pad, pad + rowH / 2)
  ctx.font = `500 ${4 * scale}px -apple-system, 'Segoe UI', sans-serif`
  tally.forEach((t, i) => {
    const y = pad + (i + 1) * rowH + rowH / 2
    ctx.fillStyle = t.color
    ctx.strokeStyle = C.filledOutline
    ctx.lineWidth = 1
    ctx.fillRect(pad, y - sw / 2, sw, sw)
    ctx.strokeRect(pad, y - sw / 2, sw, sw)
    ctx.fillStyle = '#2E2B26'
    ctx.fillText(`${t.color}   ×${t.count}`, pad + sw + 4 * scale, y)
  })
  return canvas
}

// --- PDF pagination -----------------------------------------------------------
// Slice the full-chart canvas into A4 printable tiles, one per page, with a page
// label footer for taping, then append a legend page. Needs a jsPDF instance.
// CAUTION (currently unused — PNG-only export is the locked decision): this
// assumes fullCanvas is rasterised at exactly PX_PER_MM, but renderFullChart now
// shrinks big charts to fit the browser canvas ceiling. If PDF export is ever
// revived, account for that scale or the printed bead size will be off.
export function buildPDF(JsPDF, { fullCanvas, beads, margin = 8, label = 'Beadwork chart' }) {
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  const printW = A4.w - margin * 2
  const footer = 7 // mm reserved for the page label
  const printH = A4.h - margin * 2 - footer
  const s = PX_PER_MM
  const tileWpx = Math.floor(printW * s)
  const tileHpx = Math.floor(printH * s)
  const ncols = Math.max(1, Math.ceil(fullCanvas.width / tileWpx))
  const nrows = Math.max(1, Math.ceil(fullCanvas.height / tileHpx))
  const tile = document.createElement('canvas')
  const tctx = tile.getContext('2d')
  let first = true
  for (let ty = 0; ty < nrows; ty++) {
    for (let tx = 0; tx < ncols; tx++) {
      const sw = Math.min(tileWpx, fullCanvas.width - tx * tileWpx)
      const sh = Math.min(tileHpx, fullCanvas.height - ty * tileHpx)
      tile.width = sw
      tile.height = sh
      tctx.clearRect(0, 0, sw, sh)
      tctx.fillStyle = '#FFFFFF'
      tctx.fillRect(0, 0, sw, sh)
      tctx.drawImage(fullCanvas, tx * tileWpx, ty * tileHpx, sw, sh, 0, 0, sw, sh)
      if (!first) doc.addPage()
      first = false
      doc.addImage(tile, 'PNG', margin, margin, sw / s, sh / s)
      doc.setFontSize(8)
      doc.setTextColor(107, 100, 88)
      doc.text(
        `${label} — sheet r${ty + 1} c${tx + 1} of ${nrows}×${ncols}`,
        margin,
        A4.h - margin
      )
    }
  }
  // legend page
  const legend = renderLegend(beads)
  doc.addPage()
  const lw = Math.min(printW, legend.width / s)
  const lh = (legend.height / s) * (lw / (legend.width / s))
  doc.addImage(legend, 'PNG', margin, margin, lw, lh)
  return doc
}
