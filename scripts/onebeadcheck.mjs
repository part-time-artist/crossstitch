// Stage-2 verification: technique chooser appears with no saved design, picking
// 1-bead switches to the aligned full-density grid. Draw + flood fill + select/
// pattern to confirm the 1-bead paths, and screenshot for visual review.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

// start fresh so the chooser is forced
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// chooser should be visible — pick 1-bead
const chooserVisible = await page.locator('.modal').isVisible().catch(() => false)
console.log('CHOOSER AT START:', chooserVisible)
await page.locator('.techCard', { hasText: /1-bead/i }).click()
await page.waitForTimeout(400)
console.log('SUBTITLE:', await page.locator('.sub').textContent())

const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2
const stroke = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 10 })
  await page.mouse.up(); await page.waitForTimeout(120)
}
// horizontal + vertical strokes (1-bead snap axes), plus a diagonal freehand
await stroke([[cx - 140, cy - 60], [cx + 120, cy - 60]])
await stroke([[cx - 60, cy - 100], [cx - 60, cy + 80]])
await stroke([[cx - 120, cy + 40], [cx + 60, cy + 100]])

// flood fill a region
const sw = await page.locator('.swatches .sw').nth(1).boundingBox()
await page.mouse.move(sw.x + sw.width / 2, sw.y + sw.height / 2)
await page.mouse.down(); await page.mouse.move(cx + 40, cy + 20, { steps: 12 }); await page.mouse.up()
await page.waitForTimeout(200)

await page.screenshot({ path: 'scripts/onebead-draw.png' })

// zoom in to inspect the aligned grid + bead shape
for (let i = 0; i < 5; i++) { await page.locator('.zoomCtl button', { hasText: '+' }).click(); await page.waitForTimeout(60) }
await page.screenshot({ path: 'scripts/onebead-zoom.png' })

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
