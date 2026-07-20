// Verifies the 3rd brush option: Line Flip (vertically mirrored line — the
// other diagonal). Draws all three styles side by side and confirms the
// flip round-trips through save/reload.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => new Promise((res) => {
  try { localStorage.clear() } catch (e) {}
  const req = indexedDB.deleteDatabase('beadwork3')
  req.onsuccess = req.onerror = req.onblocked = () => res()
}))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.locator('.newBtn', { hasText: /new artwork/i }).click()
await page.waitForTimeout(400)
for (let i = 0; i < 6; i++) { await page.locator('.zoomCtl button', { hasText: '+' }).click(); await page.waitForTimeout(30) }

console.log('SEG BUTTONS:', await page.locator('.stitchSeg .seg').allTextContents())

const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2
const tap = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(80) }

await tap(cx - 150, cy - 100) // cross (default)

await page.locator('.stitchSeg .seg', { hasText: /line/i }).first().click()
await tap(cx, cy - 100) // line

await page.locator('.stitchSeg .seg', { hasText: /flip/i }).click()
console.log('FLIP SELECTED:', await page.locator('.stitchSeg .seg.on').textContent())
await tap(cx + 150, cy - 100) // line flipped

await page.screenshot({ path: 'scripts/stitchflip.png' })
await page.waitForTimeout(1000) // let the 600ms autosave debounce actually flush before navigating away

// round trip through gallery
await page.getByRole('button', { name: /← My artworks/i }).click()
await page.waitForTimeout(600)
await page.locator('.artCard').first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'scripts/stitchflip-reloaded.png' })

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
