// Verify Save PNG produces a non-blank chart even for big canvases.
// Browsers silently no-op drawing past their canvas ceiling, so before the
// rasterScale cap a 60×20cm export came out completely blank.
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// start clean
const clearBtn = page.getByRole('button', { name: /Hold to clear/i })
const cb = await clearBtn.boundingBox()
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
await page.mouse.down()
await page.waitForTimeout(1000)
await page.mouse.up()
await page.waitForTimeout(300)

// big canvas — way past the browser canvas ceiling at 300 DPI
const wPill = page.locator('.pill', { hasText: 'cm W' }).locator('input')
const hPill = page.locator('.pill', { hasText: 'cm H' }).locator('input')
await wPill.fill('60')
await hPill.fill('20')
await page.keyboard.press('Tab')
await page.waitForTimeout(500)

// draw a few strokes so the chart has coloured beads
const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2
const brushSlider = page.locator('.slider').nth(0)
await brushSlider.fill('6')
for (const dy of [-60, 0, 60]) {
  await page.mouse.move(cx - 200, cy + dy)
  await page.mouse.down()
  await page.mouse.move(cx + 200, cy + dy, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}

// export and capture the downloaded PNG
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Save PNG' }).click(),
])
const file = await download.path()
const size = fs.statSync(file).size

// decode the PNG back in the page and count visible / coloured pixels
const b64 = fs.readFileSync(file).toString('base64')
const stats = await page.evaluate(async (b64) => {
  const img = new Image()
  img.src = 'data:image/png;base64,' + b64
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const x = c.getContext('2d')
  x.drawImage(img, 0, 0)
  const d = x.getImageData(0, 0, c.width, c.height).data
  let visible = 0
  let coloured = 0
  let samples = 0
  for (let i = 0; i < d.length; i += 40) { // sample every 10th pixel
    samples++
    if (d[i + 3] > 10) {
      visible++
      // bead colours differ across channels; chart chrome is near-grey
      if (Math.abs(d[i] - d[i + 1]) > 20 || Math.abs(d[i] - d[i + 2]) > 20) coloured++
    }
  }
  return { w: img.width, h: img.height, visible, coloured, samples }
}, b64)

console.log(`PNG: ${stats.w}×${stats.h}px, ${(size / 1024).toFixed(0)} kB`)
console.log(`visible px: ${stats.visible}/${stats.samples} sampled, coloured (bead) px: ${stats.coloured}`)
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
console.log(stats.coloured > 100 ? 'PASS: export has bead content' : 'FAIL: export looks blank')
await browser.close()
