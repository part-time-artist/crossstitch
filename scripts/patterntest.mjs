// Verify the pattern maker: marquee selects ONLY coloured beads, and the
// Grid / Brick / ½ drop buttons tile the motif across the whole canvas
// (undo between layouts). Screenshots land next to this script.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// start from an empty design (a previous save may have loaded)
const clearBtn = page.getByRole('button', { name: /Hold to clear/i })
const cb = await clearBtn.boundingBox()
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
await page.mouse.down()
await page.waitForTimeout(1000)
await page.mouse.up()
await page.waitForTimeout(300)

const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2

// draw a motif near the centre: a horizontal bar plus a bead below (an L),
// big enough that the three layouts look clearly different
await page.mouse.move(cx - 60, cy)
await page.mouse.down()
await page.mouse.move(cx + 60, cy, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(150)
await page.mouse.move(cx - 60, cy + 25)
await page.mouse.down()
await page.mouse.move(cx - 60, cy + 26)
await page.mouse.up()
await page.waitForTimeout(200)

// marquee far larger than the motif — selection must still be only the
// coloured beads (empty beads inside the box stay deselected)
await page.getByRole('button', { name: 'Select' }).click()
await page.mouse.move(cx - 120, cy - 80)
await page.mouse.down()
await page.mouse.move(cx + 120, cy + 80, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(300)
const selText = await page.locator('.selCard .cardTitle').first().innerText()

// Clear selection must zero the count (the card stays while tool = select)
await page.getByRole('button', { name: 'Clear selection' }).click()
await page.waitForTimeout(150)
const afterClear = await page.locator('.selCard .cardTitle').first().innerText()
console.log('AFTER CLEAR SELECTION:', afterClear)

// reselect the motif for the pattern screenshots
await page.mouse.move(cx - 120, cy - 80)
await page.mouse.down()
await page.mouse.move(cx + 120, cy + 80, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(200)

// breathing room between repeats so the layouts are tellable apart
const gap = page.locator('.selCard .pill input')
await gap.click()
await gap.press('Control+a')
await gap.type('4')
await gap.press('Tab')
await page.waitForTimeout(200)

for (const [name, shot] of [
  ['Grid', 'pattern-grid.png'],
  ['Brick', 'pattern-brick.png'],
  ['½ drop', 'pattern-halfdrop.png'],
]) {
  await page.getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `scripts/${shot}` })
  await page.locator('.zoomCtl button').first().click() // ↶ back to just the motif
  await page.waitForTimeout(200)
}

console.log('SELECTION (huge box over coloured beads only):', selText)

// ---- exact-geometry check: tile a SINGLE bead, then read the coordinates
// back via Save artwork → localStorage and assert the repeat lattice.
const undoBtn = page.locator('.zoomCtl button').first()
const readBeads = async () => {
  await page.getByRole('button', { name: /Save artwork|save again/i }).click()
  await page.waitForTimeout(200)
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('beadwork3_design_v1')).beads.map(([k]) =>
      k.split(',').map(Number)
    )
  )
}

// wipe, paint a tiny motif mid-canvas, select it, gap 2
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
await page.mouse.down()
await page.waitForTimeout(1000)
await page.mouse.up()
await page.getByRole('button', { name: 'Draw' }).click()
await page.mouse.move(cx - 12, cy)
await page.mouse.down()
await page.mouse.move(cx + 12, cy, { steps: 6 })
await page.mouse.up()
await page.getByRole('button', { name: 'Select', exact: true }).click()
await page.mouse.move(cx - 80, cy - 60)
await page.mouse.down()
await page.mouse.move(cx + 80, cy + 60, { steps: 4 })
await page.mouse.up()
await page.waitForTimeout(200)
console.log('PHASE-2 SELECTION:', await page.locator('.selCard .cardTitle').first().innerText())
await gap.click()
await gap.press('Control+a')
await gap.type('2')
await gap.press('Tab')

// the motif as saved = the repeat's anchor tile; mirror the app's pitch math
const GAP = 2
const motif = await readBeads()
const evenUp = (n) => n + (n % 2)
const mod = (n, m) => ((n % m) + m) % m
const minC = Math.min(...motif.map(([c]) => c)) - (Math.min(...motif.map(([c]) => c)) % 2)
const minR = Math.min(...motif.map(([, r]) => r)) - (Math.min(...motif.map(([, r]) => r)) % 2)
const px = evenUp(Math.max(...motif.map(([c]) => c)) - minC + 1 + GAP)
const py = evenUp(Math.max(...motif.map(([, r]) => r)) - minR + 1 + GAP)
const half = (n) => Math.max(2, Math.floor(n / 2) - (Math.floor(n / 2) % 2))
const res = new Set(motif.map(([c, r]) => `${c - minC},${r - minR}`))
const checks = {
  grid: (dc, dr) => res.has(`${mod(dc, px)},${mod(dr, py)}`),
  brick: (dc, dr) => {
    const j = (dr - mod(dr, py)) / py // which horizontal band of repeats
    const shift = mod(j, 2) === 1 ? half(px) : 0
    return res.has(`${mod(dc - shift, px)},${mod(dr, py)}`)
  },
  halfdrop: (dc, dr) => {
    const i = (dc - mod(dc, px)) / px // which vertical band of repeats
    const shift = mod(i, 2) === 1 ? half(py) : 0
    return res.has(`${mod(dc, px)},${mod(dr - shift, py)}`)
  },
}
console.log(`MOTIF: ${motif.length} beads · pitch ${px}×${py}`)
for (const [mode, label] of [['grid', 'Grid'], ['brick', 'Brick'], ['halfdrop', '½ drop']]) {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(200)
  const pts = await readBeads()
  const bad = pts.filter(([c, r]) => !checks[mode](c - minC, r - minR))
  console.log(
    `${mode.toUpperCase()}: ${pts.length} beads,`,
    bad.length ? `WRONG POSITIONS: ${JSON.stringify(bad.slice(0, 5))}` : 'lattice OK'
  )
  await undoBtn.click()
  await page.waitForTimeout(150)
}

// layout swap: Grid then Brick WITHOUT undo must REPLACE the grid, not stack
await page.getByRole('button', { name: 'Grid', exact: true }).click()
await page.waitForTimeout(150)
await page.getByRole('button', { name: 'Brick', exact: true }).click()
await page.waitForTimeout(150)
const swap = await readBeads()
const swapBad = swap.filter(([c, r]) => !checks.brick(c - minC, r - minR))
console.log(
  'SWAP GRID→BRICK:',
  swap.length,
  'beads,',
  swapBad.length ? `STACKED/WRONG: ${JSON.stringify(swapBad.slice(0, 5))}` : 'replaced OK'
)
// one undo from a swapped layout goes straight back to the bare motif
await undoBtn.click()
await page.waitForTimeout(150)
const afterUndo = await readBeads()
console.log(
  'UNDO AFTER SWAP:',
  afterUndo.length === motif.length ? 'back to motif OK' : `expected ${motif.length} beads, got ${afterUndo.length}`
)

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
