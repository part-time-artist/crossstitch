// Test straight-line snapping: a wobbly near-horizontal stroke should snap to
// a clean continuous row; a clearly curved stroke should stay freehand.
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

// wobbly near-horizontal stroke, ~10 beads long (3mm default → Px≈38px @159%)
await page.mouse.move(cx - 180, cy - 60)
await page.mouse.down()
for (let i = 0; i <= 360; i += 8) {
  await page.mouse.move(cx - 180 + i, cy - 60 + Math.sin(i / 18) * 9)
}
await page.mouse.up()

// clearly curved stroke below — must stay freehand
await page.mouse.move(cx - 150, cy + 40)
await page.mouse.down()
for (let i = 0; i <= 300; i += 8) {
  await page.mouse.move(cx - 150 + i, cy + 40 + Math.sin(i / 60) * 70)
}
await page.mouse.up()

await page.screenshot({ path: 'scripts/snap-result.png', clip: { x: cx - 220, y: cy - 140, width: 440, height: 290 } })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
