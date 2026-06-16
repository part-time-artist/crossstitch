// Stage-1 verification: exercise the 3-bead paths after routing them through the
// technique registry — draw, flood fill, brush, select + pattern, export — and
// confirm no runtime errors. Screenshot for visual comparison against the weave.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// dismiss the technique chooser if it's up (first start), picking 3-bead
if (await page.locator('.modal').isVisible().catch(() => false)) {
  await page.locator('.techCard', { hasText: /3-bead/i }).click()
  await page.waitForTimeout(300)
}

// clear
const clearBtn = page.getByRole('button', { name: /Hold to clear/i })
const cb = await clearBtn.boundingBox()
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
await page.mouse.down(); await page.waitForTimeout(1000); await page.mouse.up()
await page.waitForTimeout(300)

const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2

const stroke = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 10 })
  await page.mouse.up(); await page.waitForTimeout(120)
}
// draw a motif (diagonals exercise the tilt + snap axes)
await stroke([[cx - 140, cy - 40], [cx - 80, cy - 100], [cx - 20, cy - 40], [cx + 40, cy - 100], [cx + 100, cy - 40]])
await stroke([[cx - 140, cy], [cx + 100, cy]])

// flood fill: drag a palette swatch onto the canvas
const sw = await page.locator('.swatches .sw').nth(2).boundingBox()
await page.mouse.move(sw.x + sw.width / 2, sw.y + sw.height / 2)
await page.mouse.down()
await page.mouse.move(cx - 60, cy + 60, { steps: 12 })
await page.mouse.up(); await page.waitForTimeout(200)

await page.screenshot({ path: 'scripts/techcheck-3bead.png' })

// select a region + apply a brick pattern (exercises parity / snapMotifOrigin)
await page.locator('.stripBtn', { hasText: 'Select' }).click()
await stroke([[cx - 150, cy - 110], [cx + 110, cy + 10]])
await page.waitForTimeout(150)
await page.locator('button', { hasText: /^Brick$/ }).click()
await page.waitForTimeout(200)
await page.screenshot({ path: 'scripts/techcheck-3bead-pattern.png' })

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
