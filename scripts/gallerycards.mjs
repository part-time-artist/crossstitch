// Verifies the redesigned gallery: thumbnail cards (real bead-render preview,
// not a placeholder) + long-press/right-click menu (Rename/Duplicate/Delete)
// replacing the old always-visible-button text rows.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const clearStorage = () => page.evaluate(() => new Promise((res) => {
  try { localStorage.clear() } catch (e) {}
  const req = indexedDB.deleteDatabase('beadwork3')
  req.onsuccess = req.onerror = req.onblocked = () => res()
}))

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await clearStorage()
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

await page.locator('.newBtn', { hasText: /new artwork/i }).click()
await page.waitForTimeout(400)
for (let i = 0; i < 6; i++) { await page.locator('.zoomCtl button', { hasText: '+' }).click(); await page.waitForTimeout(40) }
const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2
await page.mouse.move(cx - 80, cy)
await page.mouse.down()
await page.mouse.move(cx + 80, cy, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(1000) // autosave debounce (600ms) + thumb generation

await page.getByRole('button', { name: /← My artworks/i }).click()
await page.waitForTimeout(400)

const cardCount = await page.locator('.artCard').count()
const hasImg = await page.locator('.artCard .artThumb img').count()
console.log('CARDS:', cardCount, '| CARDS WITH real thumbnail img:', hasImg)

await page.screenshot({ path: 'scripts/gallerycards-grid.png' })
// long-press: pointer down, hold ~600ms without moving, then up (should open menu, not navigate)
const card = page.locator('.artCard').first()
const box = await card.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.waitForTimeout(600)
await page.mouse.up()
await page.waitForTimeout(150)
console.log('MENU OPEN after long-press:', await page.locator('.artMenu').isVisible().catch(() => false))
console.log('MENU BUTTONS:', await page.locator('.artMenu button').allTextContents())
console.log('STILL ON GALLERY (long-press must not navigate):', await page.locator('.gallery').isVisible())

// Duplicate via the menu
await page.locator('.artMenu button', { hasText: /duplicate/i }).click()
await page.waitForTimeout(300)
console.log('CARDS after duplicate:', await page.locator('.artCard').count())

// right-click opens the menu too
await card.click({ button: 'right' })
await page.waitForTimeout(150)
console.log('MENU OPEN after right-click:', await page.locator('.artMenu').isVisible().catch(() => false))
// click outside closes it
await page.mouse.click(20, 20)
await page.waitForTimeout(150)
console.log('MENU CLOSED after outside click:', !(await page.locator('.artMenu').isVisible().catch(() => false)))

// a plain quick tap still opens the artwork
await page.locator('.artCard').first().click()
await page.waitForTimeout(400)
console.log('OPENED into editor:', !(await page.locator('.gallery').isVisible().catch(() => false)))

await page.screenshot({ path: 'scripts/gallerycards.png' })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
