// Stage-3 verification: PNG chart export works for BOTH techniques. For each,
// pick the technique, draw a small motif, click Save PNG, capture the download
// and save it for visual review (1-bead must be a full-density aligned chart;
// 3-bead the staggered weave). Confirms chart.js routes through the technique.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

async function run(techRe, outName) {
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.locator('.techCard', { hasText: techRe }).click()
  await page.waitForTimeout(300)
  // small motif
  const canvas = await page.locator('canvas.board').boundingBox()
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2
  const stroke = async (pts) => {
    await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 8 })
    await page.mouse.up(); await page.waitForTimeout(100)
  }
  await stroke([[cx - 60, cy - 40], [cx + 60, cy - 40]])
  await stroke([[cx - 60, cy], [cx + 60, cy]])
  await stroke([[cx - 60, cy + 40], [cx + 60, cy + 40]])
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button.primary', { hasText: /Save PNG/i }).click(),
  ])
  const path = `scripts/${outName}`
  await dl.saveAs(path)
  console.log('SAVED', path)
}

await run(/3-bead/i, 'export-3bead.png')
await run(/1-bead/i, 'export-1bead.png')
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
