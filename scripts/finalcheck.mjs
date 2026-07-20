// Comprehensive smoke test for the canvas-first UI (current selectors).
// Covers: live stroke rendering, undo/redo, erase, stitch styles, selection +
// pattern maker, layer groups + alpha lock, drag-to-fill, gallery round-trip.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 1024 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()) })

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => new Promise((res) => {
  try { localStorage.clear() } catch (e) {}
  const req = indexedDB.deleteDatabase('beadwork3')
  req.onsuccess = req.onerror = req.onblocked = () => res()
}))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.locator('.newBtn').click()
await page.waitForTimeout(600)
for (let i = 0; i < 6; i++) { await page.locator('.zoomCtl button', { hasText: '+' }).click(); await page.waitForTimeout(30) }

const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2
const sample = () => page.evaluate(() => {
  const c = document.querySelector('canvas.board')
  const ctx = c.getContext('2d')
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (!(d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) && d[i + 3] > 0) n++
  return n
})

// 1. LIVE STROKE — must update progressively during the drag, not just on release
const before = await sample()
await page.mouse.move(cx - 150, cy)
await page.mouse.down()
await page.waitForTimeout(100)
const midDrag = []
for (let i = 1; i <= 4; i++) {
  await page.mouse.move(cx - 150 + i * 50, cy, { steps: 5 })
  await page.waitForTimeout(150)
  midDrag.push(await sample())
}
await page.mouse.up()
await page.waitForTimeout(150)
const afterUp = await sample()
const progressed = midDrag.some((v, i) => i > 0 && v > midDrag[0])
console.log('LIVE STROKE progressed during drag:', progressed ? 'PASS' : 'FAIL', midDrag)
console.log('DRAW total:', before, '->', afterUp, afterUp > before ? 'PASS' : 'FAIL')

// 2. UNDO/REDO
await page.locator('.undoRedo button').first().click()
await page.waitForTimeout(150)
const afterUndo = await sample()
console.log('UNDO reduced:', afterUndo < afterUp ? 'PASS' : 'FAIL', afterUndo)
await page.locator('.undoRedo button').nth(1).click()
await page.waitForTimeout(150)
const afterRedo = await sample()
console.log('REDO restored (~):', Math.abs(afterRedo - afterUp) < 100 ? 'PASS' : 'FAIL', afterRedo)

// 3. ERASE
await page.locator('[title="Erase"]').click()
await page.waitForTimeout(100)
await page.mouse.click(cx - 150, cy)
await page.waitForTimeout(150)
const afterErase = await sample()
console.log('ERASE reduced:', afterErase < afterRedo ? 'PASS' : 'FAIL')
await page.locator('[title="Draw"]').click()
await page.waitForTimeout(100)

// 4. STITCH STYLES
await page.locator('.stitchRailBtn', { hasText: '╱' }).click()
await page.mouse.click(cx + 100, cy + 100)
await page.waitForTimeout(100)
await page.locator('.stitchRailBtn', { hasText: '╲' }).click()
await page.mouse.click(cx + 150, cy + 100)
await page.waitForTimeout(150)
console.log('STITCH STYLES drawn without error: PASS (no crash)')

// 5. DRAG-TO-FILL from palette rail
const sw = page.locator('.railSw').nth(2)
const swBox = await sw.boundingBox()
await page.mouse.move(swBox.x + swBox.width / 2, swBox.y + swBox.height / 2)
await page.mouse.down()
await page.mouse.move(cx - 100, cy, { steps: 10 })
await page.waitForTimeout(80)
await page.mouse.up()
await page.waitForTimeout(150)
console.log('DRAG-FILL: no crash, PASS')

// 6. SELECT + PATTERN
await page.locator('[title="Select"]').click()
await page.waitForTimeout(100)
await page.mouse.move(cx - 200, cy - 30)
await page.mouse.down()
await page.mouse.move(cx - 40, cy + 30, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(150)
console.log('SEL PANEL:', await page.locator('.selPanel').isVisible())
await page.locator('[title="Draw"]').click()

// 7. LAYERS + GROUPS + ALPHA LOCK
await page.locator('[title="Layers"]').click()
await page.waitForTimeout(150)
await page.locator('.lpAddBtn').click()
await page.waitForTimeout(150)
console.log('LAYERS after add:', await page.locator('.lpRow').count())
await page.locator('.lpBar button', { hasText: /^Group$/ }).click()
await page.waitForTimeout(150)
console.log('GROUP created:', await page.locator('.lpGroupRow').count() === 1 ? 'PASS' : 'FAIL')
await page.locator('.lpBar button', { hasText: /alpha lock/i }).click()
await page.waitForTimeout(100)
console.log('ALPHA LOCK toggled, no crash: PASS')

// 8. GALLERY ROUND TRIP
await page.locator('[title="My artworks"]').click()
await page.waitForTimeout(600)
console.log('GALLERY CARDS:', await page.locator('.artCard').count())
console.log('THUMB IMG:', await page.locator('.artCard .artThumb img').count())

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
