// Verifies layer groups: create 2 layers with beads, group them, see a
// collapsible header with a member count, toggle group visibility (hides
// both members' beads on canvas), collapse/expand, and Flatten merges them
// into one layer. Also checks per-layer thumbnails render as real images.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
page.on('dialog', (d) => d.accept('Renamed Group'))

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

const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2
const stroke = async (x0, y0, x1, y1) => {
  await page.mouse.move(x0, y0); await page.mouse.down()
  await page.mouse.move(x1, y1, { steps: 10 }); await page.mouse.up()
  await page.waitForTimeout(120)
}

// draw on layer 1
await stroke(cx - 60, cy - 40, cx + 20, cy - 40)
// open layers panel, add layer 2, draw on it
await page.locator('.stripBtn', { hasText: /layers/i }).click()
await page.waitForTimeout(200)
await page.locator('.lpAdd').click()
await page.waitForTimeout(200)
await stroke(cx - 60, cy + 10, cx + 20, cy + 10)

console.log('LAYER ROWS before group:', await page.locator('.layerRow').count())
console.log('THUMBS with real img:', await page.locator('.lpThumb img').count())

// active layer is Layer 2 (top); group it with the one below (Layer 1)
await page.locator('.layerActions button', { hasText: /^Group$/ }).click()
await page.waitForTimeout(200)
console.log('GROUP HEADER present:', await page.locator('.groupHeader').isVisible())
console.log('GROUP HEADER text:', await page.locator('.groupHeader .lpName').textContent())
console.log('MEMBER ROWS visible (expanded):', await page.locator('.layerRow.grouped').count())

// collapse
await page.locator('.groupHeader .lpChevron').click()
await page.waitForTimeout(150)
console.log('MEMBER ROWS after collapse:', await page.locator('.layerRow.grouped').count())
await page.locator('.groupHeader .lpChevron').click()
await page.waitForTimeout(150)

// hide the group -> both strokes should disappear from the rendered canvas
const sample = async () => page.evaluate(() => {
  const c = document.querySelector('canvas.board')
  const ctx = c.getContext('2d')
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (!(d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) && d[i + 3] > 0) n++
  return n
})
const before = await sample()
await page.locator('.groupHeader .lpEye').click()
await page.waitForTimeout(200)
const afterHide = await sample()
await page.locator('.groupHeader .lpEye').click()
await page.waitForTimeout(200)
const afterShow = await sample()
console.log('coloured px — visible:', before, 'hidden:', afterHide, 'shown again:', afterShow)

// rename the group (dialog auto-accepted above)
await page.locator('.groupHeader .lpName').dblclick()
await page.waitForTimeout(150)
console.log('GROUP RENAMED:', await page.locator('.groupHeader .lpName').textContent())

// flatten
await page.locator('.groupHeader .lpFlatten').click()
await page.waitForTimeout(200)
console.log('LAYER ROWS after flatten:', await page.locator('.layerRow').count())
console.log('GROUP HEADER gone:', !(await page.locator('.groupHeader').isVisible().catch(() => false)))
const afterFlatten = await sample()
console.log('coloured px after flatten (should ≈ shown again):', afterFlatten)

await page.screenshot({ path: 'scripts/layergroups.png' })
await page.locator('.layersPanel').screenshot({ path: 'scripts/layerspanel-zoom.png' })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
