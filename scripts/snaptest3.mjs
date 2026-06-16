// Regression test for the stroke-erases-stroke bug + row-tilt check:
// draw TWO snapped lines back-to-back quickly; both must survive.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const box = await page.locator('canvas.board').boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

// line 1: horizontal, immediately followed by line 2 below (no pause between)
await page.mouse.move(cx - 180, cy - 70)
await page.mouse.down()
for (let i = 0; i <= 360; i += 12) await page.mouse.move(cx - 180 + i, cy - 70 + Math.sin(i / 15) * 7)
await page.mouse.up()
await page.mouse.move(cx - 180, cy + 50)
await page.mouse.down()
for (let i = 0; i <= 360; i += 12) await page.mouse.move(cx - 180 + i, cy + 50 + Math.sin(i / 13) * 7)
await page.mouse.up()

await page.screenshot({ path: 'scripts/snap-two-lines.png', clip: { x: cx - 220, y: cy - 130, width: 440, height: 260 } })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
