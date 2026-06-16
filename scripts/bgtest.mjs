// Background-image placement test: upload an image, verify adjust mode opens,
// drag to move + wheel to resize it, Done exits, beads paint on top.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// switch background to Image and upload the rows-explanation PNG as a stand-in
await page.locator('.card', { hasText: 'Background' }).getByRole('button', { name: 'Image' }).click()
await page.locator('input[type="file"]').setInputFiles('assets/rows explaination.png')
await page.waitForTimeout(600)
const barVisible = await page.locator('.adjustBar').isVisible()

// drag to move the image, wheel to enlarge it
const c = await page.locator('canvas.board').boundingBox()
const cx = c.x + c.width / 2
const cy = c.y + c.height / 2
await page.mouse.move(cx, cy)
await page.mouse.down()
await page.mouse.move(cx - 80, cy - 50, { steps: 8 })
await page.mouse.up()
await page.mouse.move(cx, cy)
await page.mouse.wheel(0, -400)
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/bg-adjusting.png' })

// Done, then draw beads on top
await page.locator('.adjustBar button').click()
await page.waitForTimeout(200)
await page.mouse.move(cx - 60, cy)
await page.mouse.down()
await page.mouse.move(cx + 60, cy, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/bg-painted.png', clip: { x: cx - 220, y: cy - 170, width: 440, height: 340 } })

console.log('ADJUST BAR SHOWN:', barVisible)
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
