// Smoke test for the Jat cross-stitch technique: chooser shows one option (jat),
// the grid is an upright square lattice, and filled cells render as X crosses.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// first-ever visit lands on the gallery → New artwork creates one directly
// (no technique chooser, since cross-stitch is the only technique)
await page.locator('.newBtn', { hasText: /new artwork/i }).click()
await page.waitForTimeout(500)
console.log('BRAND:', await page.locator('.brand').first().textContent())
console.log('SUBTITLE:', await page.locator('.sub').textContent())

const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2

// zoom in so individual crosses are visible
for (let i = 0; i < 6; i++) { await page.locator('.zoomCtl button', { hasText: '+' }).click(); await page.waitForTimeout(60) }

const stroke = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 10 })
  await page.mouse.up(); await page.waitForTimeout(120)
}
// a solid block of stitches (several stacked rows) to show continuous diagonals
for (let i = 0; i < 7; i++) {
  const y = cy - 60 + i * 18
  await stroke([[cx - 70, y], [cx + 70, y]])
}
// a single diagonal-ish run
await stroke([[cx - 130, cy - 90], [cx - 60, cy - 20]])

await page.screenshot({ path: 'scripts/jat-draw.png' })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
