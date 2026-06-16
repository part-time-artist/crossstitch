// Verify (1) old localStorage designs migrate into the gallery once, and
// (2) Export-all → clear → Import restores every artwork.
import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const design = (name, k) => ({
  version: 2, name, technique: '3bead',
  canvasCm: { w: 10, h: 7 }, beadMM: { w: 1.5, h: 1.875 },
  palette: ['#F3CEDE'], bg: { type: 'solid', color: '#FFFFFF', image: null },
  bgT: { x: 0, y: 0, scale: 1 }, bgShown: true, pack: 0.75,
  layers: [{ name: 'Layer 1', visible: true, locked: false, beads: [[`${k},${k}`, '#000000']] }],
  activeIndex: 0,
})

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
// clear IndexedDB, then seed the OLD localStorage keys
await page.evaluate((d) => new Promise((res) => {
  localStorage.clear()
  localStorage.setItem('beadwork3_designs_v1', JSON.stringify([{ name: 'Old Slot', savedAt: Date.now(), data: d.slot }]))
  localStorage.setItem('beadwork3_design_v1', JSON.stringify(d.quick))
  const r = indexedDB.deleteDatabase('beadwork3'); r.onsuccess = r.onerror = r.onblocked = () => res()
}), { slot: design('Old Slot', 5), quick: design('Last Work', 9) })

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
// boot reopens the last-edited; go to the gallery to inspect
if (await page.locator('.gallery').isVisible().catch(() => false) === false) {
  await page.getByRole('button', { name: /← My artworks/i }).click()
  await page.waitForTimeout(300)
}
console.log('MIGRATED NAMES:', await page.locator('.artRow .artName').allTextContents())

// migration must not re-run on reload
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
if (await page.locator('.gallery').isVisible().catch(() => false) === false) {
  await page.getByRole('button', { name: /← My artworks/i }).click()
  await page.waitForTimeout(300)
}
console.log('ROWS after reload (want 2, no duplicates):', await page.locator('.artRow').count())

// Export all → save the download
const [dl] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('.galleryFoot button', { hasText: /Back up all/i }).click(),
])
const backupPath = join(tmpdir(), 'beadwork-backup-test.json')
await dl.saveAs(backupPath)

// wipe everything, then import the backup
await page.evaluate(() => new Promise((res) => {
  localStorage.clear()
  const r = indexedDB.deleteDatabase('beadwork3'); r.onsuccess = r.onerror = r.onblocked = () => res()
}))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
console.log('AFTER WIPE rows (want 0):', await page.locator('.artRow').count())
await page.locator('.galleryFoot input[type=file]').setInputFiles(backupPath)
await page.waitForTimeout(800)
console.log('AFTER IMPORT names (want Old Slot + Last Work):', await page.locator('.artRow .artName').allTextContents())

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
