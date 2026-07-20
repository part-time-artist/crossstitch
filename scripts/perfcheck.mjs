// Perf sanity check for the lag fixes: fill a moderately dense area with
// stitches, then burst-zoom/pan and measure wall time + long tasks. Not a
// strict regression gate — just confirms the blit-cache + stroke-clone fixes
// keep a loaded canvas responsive.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.locator('.newBtn', { hasText: /new artwork/i }).click()
await page.waitForTimeout(400)

// bump canvas size so the grid is dense, then fill a big block by dragging
// a long zig-zag freehand stroke back and forth many times (stresses paintBrush)
const canvas = await page.locator('canvas.board').boundingBox()
const cx = canvas.x + canvas.width / 2
const cy = canvas.y + canvas.height / 2

const t0 = Date.now()
await page.mouse.move(cx - 400, cy - 250)
await page.mouse.down()
let steps = 0
for (let row = 0; row < 24; row++) {
  const y = cy - 250 + row * 20
  await page.mouse.move(cx - 400, y, { steps: 3 })
  await page.mouse.move(cx + 400, y, { steps: 40 })
  steps += 40
}
await page.mouse.up()
const strokeMs = Date.now() - t0
console.log(`FREEHAND FILL: ${steps} pointer-move steps in ${strokeMs}ms`)

// long-task instrumentation for the zoom burst
await page.evaluate(() => {
  window.__longTasks = []
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__longTasks.push(e.duration)
  }).observe({ entryTypes: ['longtask'] })
})

const t1 = Date.now()
for (let i = 0; i < 20; i++) {
  await page.locator('.zoomCtl button', { hasText: '+' }).click()
}
for (let i = 0; i < 15; i++) {
  await page.locator('.zoomCtl button', { hasText: '−' }).click()
}
await page.waitForTimeout(250) // let the settle-to-full-render fire
const zoomMs = Date.now() - t1

const longTasks = await page.evaluate(() => window.__longTasks || [])
console.log(`ZOOM BURST: 35 steps in ${zoomMs}ms; long tasks: ${longTasks.length}, worst ${longTasks.length ? Math.max(...longTasks).toFixed(0) : 0}ms`)

await page.screenshot({ path: 'scripts/perfcheck.png' })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
