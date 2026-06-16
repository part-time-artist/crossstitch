// Diagonal snap test: wobbly stroke along the weave diagonal (Px/2, Py).
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const box = await page.locator('canvas.board').boundingBox()
// default 3mm @ ~159%: Px ≈ 38*1.59... measure: Bw=24 doc px, Px=38.2, Py=26.25, scale~1.6
// diagonal direction on screen ≈ (Px/2, Py)*scale ≈ (30, 42) per step
const sx = box.x + box.width / 2 - 120
const sy = box.y + box.height / 2 - 140
await page.mouse.move(sx, sy)
await page.mouse.down()
for (let t = 0; t <= 1; t += 0.04) {
  const wob = Math.sin(t * 20) * 8
  // direction ~ (0.58, 0.81) of length ~340
  await page.mouse.move(sx + 197 * t + wob * 0.81, sy + 275 * t - wob * 0.58)
}
await page.mouse.up()
await page.screenshot({ path: 'scripts/snap-diag.png', clip: { x: sx - 60, y: sy - 40, width: 360, height: 380 } })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
