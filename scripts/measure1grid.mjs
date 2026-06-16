// Measure the 1-bead grid geometry from assets/beadwork 1 grid.png:
// bead width/height (ratio), horizontal pitch, vertical pitch, and the
// background graph-paper square size. Outputs PACK_X = pitchX/beadW and
// PACK_Y = pitchY/beadH for the technique definition. Measure, never guess.
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const b64 = readFileSync('assets/beadwork 1 grid.png').toString('base64')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage()

const out = await page.evaluate(async (dataUrl) => {
  const img = new Image()
  await new Promise((res) => { img.onload = res; img.src = dataUrl })
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const x = c.getContext('2d')
  x.drawImage(img, 0, 0)
  const { data, width: W, height: H } = x.getImageData(0, 0, c.width, c.height)
  const dark = (i) => data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 90
  // 1) connected components of dark pixels (beads)
  const seen = new Uint8Array(W * H)
  const beads = []
  const stack = []
  for (let y = 0; y < H; y++) {
    for (let xx = 0; xx < W; xx++) {
      const p = y * W + xx
      if (seen[p] || !dark(p * 4)) continue
      let minx = xx, maxx = xx, miny = y, maxy = y, n = 0
      stack.length = 0; stack.push(p); seen[p] = 1
      while (stack.length) {
        const q = stack.pop(); const qy = (q / W) | 0; const qx = q % W
        n++
        if (qx < minx) minx = qx; if (qx > maxx) maxx = qx
        if (qy < miny) miny = qy; if (qy > maxy) maxy = qy
        const nb = [q - 1, q + 1, q - W, q + W]
        for (const r of nb) {
          if (r < 0 || r >= W * H) continue
          if (seen[r] || !dark(r * 4)) continue
          seen[r] = 1; stack.push(r)
        }
      }
      if (n > 20) beads.push({ cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx + 1, h: maxy - miny + 1, n })
    }
  }
  const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[(s.length / 2) | 0] }
  const beadW = med(beads.map((b) => b.w))
  const beadH = med(beads.map((b) => b.h))
  // 2) pitch: group beads into rows (similar cy) and cols (similar cx), median gap
  const rowTol = beadH * 0.5, colTol = beadW * 0.5
  const gaps = (vals, tol) => {
    const s = [...vals].sort((p, q) => p - q)
    const g = []
    for (let i = 1; i < s.length; i++) { const d = s[i] - s[i - 1]; if (d > tol) g.push(d) }
    return g
  }
  // horizontal pitch: within each row, consecutive cx gaps near 1 cell
  const rows = {}
  for (const bd of beads) { const k = Math.round(bd.cy / rowTol); (rows[k] ||= []).push(bd.cx) }
  let hx = []
  for (const k in rows) hx = hx.concat(gaps(rows[k], beadW * 0.4).filter((d) => d < beadW * 2.2))
  const cols = {}
  for (const bd of beads) { const k = Math.round(bd.cx / colTol); (cols[k] ||= []).push(bd.cy) }
  let vy = []
  for (const k in cols) vy = vy.concat(gaps(cols[k], beadH * 0.4).filter((d) => d < beadH * 2.2))
  const pitchX = med(hx), pitchY = med(vy)
  // 3) graph-paper square: detect light-grey vertical lines period in a blank band
  const isGrid = (i) => {
    const r = data[i], g = data[i + 1], bl = data[i + 2]
    return r > 170 && r < 235 && Math.abs(r - g) < 14 && Math.abs(r - bl) < 14
  }
  const bandY = 40
  const colHits = []
  for (let xx = 0; xx < W; xx++) if (isGrid((bandY * W + xx) * 4)) colHits.push(xx)
  const gridGaps = gaps(colHits, 3).filter((d) => d > 6 && d < 60)
  return {
    beadCount: beads.length, beadW, beadH, ratioWH: +(beadW / beadH).toFixed(3),
    pitchX, pitchY, PACK_X: +(pitchX / beadW).toFixed(3), PACK_Y: +(pitchY / beadH).toFixed(3),
    gridSquare: med(gridGaps), pitchX_in_cells: +(pitchX / med(gridGaps)).toFixed(2),
    pitchY_in_cells: +(pitchY / med(gridGaps)).toFixed(2),
  }
}, `data:image/png;base64,${b64}`)

console.log(JSON.stringify(out, null, 2))
await browser.close()
