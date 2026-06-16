// Stage-2 verification: a saved design carries its technique and auto-restores
// into the matching grid (no chooser). Pick 1-bead, Save artwork, reload, and
// confirm the chooser does NOT appear and the subtitle is still 1-bead.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.locator('.techCard', { hasText: /1-bead/i }).click()
await page.waitForTimeout(300)

// draw one stroke so there is content, then Save artwork
const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2
await page.mouse.move(cx - 80, cy); await page.mouse.down()
await page.mouse.move(cx + 80, cy, { steps: 10 }); await page.mouse.up()
await page.waitForTimeout(150)
await page.locator('button', { hasText: /Save artwork/i }).click()
await page.waitForTimeout(300)

// reload — should auto-restore as 1-bead, no chooser
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const chooserVisible = await page.locator('.modal').isVisible().catch(() => false)
console.log('CHOOSER AFTER RELOAD (want false):', chooserVisible)
console.log('SUBTITLE AFTER RELOAD (want 1-BEAD):', await page.locator('.sub').textContent())
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
