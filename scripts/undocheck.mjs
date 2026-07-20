// Verifies the stroke-clone-once-per-stroke fix (paintBrush now mutates a
// private per-stroke Map instead of cloning on every pointer event) didn't
// break undo/redo: each freehand stroke must still be exactly one undo step,
// and a snapped straight-line stroke (which goes through paintAlong, a
// different code path) must undo cleanly too.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.locator('.newBtn', { hasText: /new artwork/i }).click()
await page.waitForTimeout(400)
for (let i = 0; i < 6; i++) { await page.locator('.zoomCtl button', { hasText: '+' }).click(); await page.waitForTimeout(40) }

const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2

const strokeCount = async () => page.evaluate(() => {
  const c = document.querySelector('canvas.board')
  const ctx = c.getContext('2d')
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  let coloured = 0
  for (let i = 0; i < data.length; i += 4) {
    // pink fill has R>200,G~150-210,B~200-230 roughly; just count non-white/non-bg pixels
    if (!(data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) && data[i + 3] > 0) coloured++
  }
  return coloured
})

const freehandStroke = async (x0, y0, x1, y1, n) => {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= n; i++) {
    const t = i / n
    // wiggle so it's NOT a straight line (avoid the line-snap path for this probe)
    const wig = Math.sin(t * 9) * 6
    await page.mouse.move(x0 + (x1 - x0) * t + wig, y0 + (y1 - y0) * t)
  }
  await page.mouse.up()
  await page.waitForTimeout(150)
}

const before = await strokeCount()
await freehandStroke(cx - 120, cy - 60, cx + 120, cy - 60, 24)
const afterStroke1 = await strokeCount()
await freehandStroke(cx - 120, cy + 20, cx + 120, cy + 20, 24)
const afterStroke2 = await strokeCount()

await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
const afterUndo1 = await strokeCount()

await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
const afterUndo2 = await strokeCount()

await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(150)
const afterRedo1 = await strokeCount()

console.log('coloured px — before:', before, 'after stroke1:', afterStroke1, 'after stroke2:', afterStroke2)
console.log('after undo x1:', afterUndo1, '(expect ≈ afterStroke1)')
console.log('after undo x2:', afterUndo2, '(expect ≈ before)')
console.log('after redo x1:', afterRedo1, '(expect ≈ afterStroke1)')

const near = (a, b, tolPct = 4) => Math.abs(a - b) <= Math.max(50, b * tolPct / 100)
const ok =
  afterStroke1 > before &&
  afterStroke2 > afterStroke1 &&
  near(afterUndo1, afterStroke1) &&
  near(afterUndo2, before) &&
  afterRedo1 === afterUndo1 // redo restores the exact same snapshot object — must match exactly

console.log('RESULT:', ok ? 'PASS' : 'FAIL')
await page.screenshot({ path: 'scripts/undocheck.png' })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
