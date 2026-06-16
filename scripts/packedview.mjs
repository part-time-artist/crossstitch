// Visual check for the bead spacing slider: draw a chunky motif + flood-filled
// blob, screenshot fully packed vs fully spaced so density can be tuned by eye.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// start clean
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

// a motif with body: zigzag (diagonals) + horizontal bar + thick brush blob
const stroke = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1])
  await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(120)
}
await stroke([[cx - 140, cy - 40], [cx - 80, cy - 100], [cx - 20, cy - 40], [cx + 40, cy - 100], [cx + 100, cy - 40]])
await stroke([[cx - 140, cy], [cx + 100, cy]])
// two range sliders exist now: [0] = brush size, [1] = bead spacing
const brushSlider = page.locator('.slider').nth(0)
const spacingSlider = page.locator('.slider').nth(1)
// brush 3 blob
await brushSlider.fill('3')
await stroke([[cx - 60, cy + 70], [cx + 20, cy + 70]])
await brushSlider.fill('1')

await page.screenshot({ path: 'scripts/view-packed.png' })
await spacingSlider.fill('0')
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/view-spaced.png' })
await spacingSlider.fill('1')
await page.waitForTimeout(300)

// zoomed-in closeup of the packed weave
for (let i = 0; i < 5; i++) {
  await page.locator('.zoomCtl button', { hasText: '+' }).click()
  await page.waitForTimeout(80)
}
await page.screenshot({ path: 'scripts/view-packed-zoom.png' })

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
