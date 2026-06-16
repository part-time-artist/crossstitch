// Verify a reference background image is saved with the artwork (as a data URL)
// and is restored when the artwork reopens.
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
await page.locator('.techCard', { hasText: /3-bead/i }).click()
await page.waitForTimeout(400)

// Background -> Image -> choose the reference asset
await page.locator('.card .seg', { hasText: /^Image$/ }).click()
await page.locator('label.fileBtn', { hasText: /Choose image/i }).locator('input[type=file]')
  .setInputFiles('assets/beadwork 1 grid.png')
await page.waitForTimeout(700)
// leave adjust mode if the bar is up
const done = page.locator('.adjustBar button', { hasText: /DONE/i })
if (await done.isVisible().catch(() => false)) await done.click()
await page.waitForTimeout(1000) // auto-save flush

const before = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('beadwork3')
  req.onsuccess = () => {
    const all = req.result.transaction('artworks', 'readonly').objectStore('artworks').getAll()
    all.onsuccess = () => res(all.result.map((r) => (r.bg && typeof r.bg.image === 'string') ? r.bg.image.slice(0, 12) : null))
  }
}))
console.log('SAVED bg.image prefix (want data:image):', JSON.stringify(before))

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
console.log('AFTER RELOAD gallery hidden:', !(await page.locator('.gallery').isVisible().catch(() => false)))
await page.screenshot({ path: 'scripts/bg-reopen.png' })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
