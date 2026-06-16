// Verify the My artworks gallery: empty state -> New artwork (tree name) -> draw
// -> auto-save -> back to gallery -> second artwork (other technique) -> open the
// first -> reload reopens last artwork. Clears IndexedDB + localStorage first.
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
await page.waitForTimeout(700)

console.log('GALLERY VISIBLE (empty):', await page.locator('.gallery').isVisible())
console.log('EMPTY STATE:', await page.locator('.galleryEmpty').isVisible().catch(() => false))

const canvas = () => page.locator('canvas.board').boundingBox()
const stroke = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 8 })
  await page.mouse.up(); await page.waitForTimeout(120)
}
async function newArt(techRe) {
  await page.locator('.newBtn').click()
  await page.locator('.techCard', { hasText: techRe }).click()
  await page.waitForTimeout(400)
  const c = await canvas()
  await stroke([[c.x + c.width / 2 - 60, c.y + c.height / 2], [c.x + c.width / 2 + 60, c.y + c.height / 2]])
  await page.waitForTimeout(900) // let auto-save (600ms debounce) flush
}

await newArt(/3-bead/i)
await page.getByRole('button', { name: /← My artworks/i }).click()
await page.waitForTimeout(400)
console.log('GALLERY ROWS after 1:', await page.locator('.artRow').count())
console.log('ROW 1 NAME (tree):', await page.locator('.artRow .artName').first().textContent())
console.log('ROW 1 META:', await page.locator('.artRow .artMeta').first().textContent())

// second artwork, 1-bead
await newArt(/1-bead/i)
await page.getByRole('button', { name: /← My artworks/i }).click()
await page.waitForTimeout(400)
console.log('GALLERY ROWS after 2:', await page.locator('.artRow').count())
console.log('ALL NAMES:', await page.locator('.artRow .artName').allTextContents())
await page.screenshot({ path: 'scripts/gallery.png' })

// open the 3-bead artwork by its row
await page.locator('.artRow', { has: page.locator('.artMeta', { hasText: '3-bead' }) }).locator('.artOpen').click()
await page.waitForTimeout(500)
console.log('OPENED 3-bead — subtitle:', await page.locator('.sub').textContent())

// reload should reopen the last artwork (no gallery)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
console.log('AFTER RELOAD gallery hidden:', !(await page.locator('.gallery').isVisible().catch(() => false)))
console.log('AFTER RELOAD subtitle:', await page.locator('.sub').textContent())

// dump the actual saved records from IndexedDB
const dump = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('beadwork3')
  req.onsuccess = () => {
    const db = req.result
    const all = db.transaction('artworks', 'readonly').objectStore('artworks').getAll()
    all.onsuccess = () => res(all.result.map((r) => ({
      name: r.name, technique: r.technique,
      beads: (r.layers || []).reduce((n, l) => n + (l.beads ? l.beads.length : 0), 0),
    })))
  }
}))
console.log('DB RECORDS:', JSON.stringify(dump))

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
