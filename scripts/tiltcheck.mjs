// Visual check of the tilt pattern: zoomed close-up of the empty lattice.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const box = await page.locator('canvas.board').boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
// zoom in ~3 steps toward center for a clear view
for (let i = 0; i < 5; i++) {
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, -200)
  await page.waitForTimeout(120)
}
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/tilt-pattern.png', clip: { x: cx - 200, y: cy - 160, width: 400, height: 320 } })
console.log('done')
await browser.close()
