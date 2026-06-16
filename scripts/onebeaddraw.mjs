import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => new Promise((res) => {
  try { localStorage.clear() } catch (e) {}
  const r = indexedDB.deleteDatabase('beadwork3'); r.onsuccess = r.onerror = r.onblocked = () => res()
}))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.locator('.newBtn').click()
await page.locator('.techCard', { hasText: /1-bead/i }).click()
await page.waitForTimeout(500)
const c = await page.locator('canvas.board').boundingBox()
const cx = c.x + c.width / 2, cy = c.y + c.height / 2
await page.mouse.move(cx - 80, cy); await page.mouse.down()
await page.mouse.move(cx + 80, cy, { steps: 10 }); await page.mouse.up()
await page.waitForTimeout(1300)
await page.screenshot({ path: 'scripts/onebeaddraw.png' })
const beads = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('beadwork3')
  req.onsuccess = () => {
    const all = req.result.transaction('artworks', 'readonly').objectStore('artworks').getAll()
    all.onsuccess = () => res(all.result.map((r) => (r.layers || []).reduce((n, l) => n + (l.beads ? l.beads.length : 0), 0)))
  }
}))
console.log('BEADS IN DB:', JSON.stringify(beads))
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
