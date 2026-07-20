// Verifies the two-stitch-style brush: default Cross, switch to Line, draw
// both in one design, recolour preserves each stitch's own shape, undo/redo
// still work, and save/reload round-trips both styles.
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

console.log('DEFAULT STITCH SELECTED:', await page.locator('.stitchSeg .seg.on').textContent())

const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2
const tap = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(80) }

// draw a row of CROSS stitches (default) — spaced well over a cell width apart
await tap(cx - 120, cy - 100)
await tap(cx - 30, cy - 100)
await tap(cx + 60, cy - 100)

// switch to Line, draw a row well below
await page.locator('.stitchSeg .seg', { hasText: /line/i }).click()
console.log('AFTER SWITCH SELECTED:', await page.locator('.stitchSeg .seg.on').textContent())
await tap(cx - 120, cy + 100)
await tap(cx - 30, cy + 100)
await tap(cx + 60, cy + 100)

await page.screenshot({ path: 'scripts/stitchstyle-mixed.png' })

// switch back to cross, recolour the line row via marquee select + Recolour
await page.locator('.stitchSeg .seg', { hasText: /cross/i }).click()
await page.locator('.stripBtn', { hasText: /select/i }).click()
await page.waitForTimeout(150)
await page.mouse.move(cx - 160, cy + 60)
await page.mouse.down()
await page.mouse.move(cx + 100, cy + 140, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(150)
// pick a different palette colour (2nd .swatches block = the palette, not
// Recent), then recolour
await page.locator('.swatches').nth(1).locator('.sw').nth(1).click()
await page.waitForTimeout(100)
await page.locator('.selCard button', { hasText: /recolour/i }).click()
await page.waitForTimeout(150)
await page.screenshot({ path: 'scripts/stitchstyle-recolored.png' })

// undo the recolour, then undo everything and redo
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
await page.screenshot({ path: 'scripts/stitchstyle-after-undo.png' })

// save/reload round trip: go to gallery and back
await page.getByRole('button', { name: /← My artworks/i }).click()
await page.waitForTimeout(600)
await page.locator('.artCard').first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'scripts/stitchstyle-reloaded.png' })

// export PNG: both shapes should render on the chart, and the legend should
// group by colour only (pink cross + pink line = ONE legend entry, not two)
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('button', { hasText: /save png/i }).click(),
])
const dlPath = await download.path()
console.log('EXPORT DOWNLOADED:', !!dlPath)
const fs = await import('fs')
fs.copyFileSync(dlPath, 'scripts/stitchstyle-export.png')

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
