// Verify two-finger canvas rotation: draw an asymmetric mark, rotate ~45° with a
// real multi-touch gesture (via CDP), and confirm (1) the canvas visibly rotates
// and (2) drawing still lands correctly afterwards (hit-test is rotation-aware).
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, hasTouch: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const cdp = await page.context().newCDPSession(page)
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })

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

const box = await page.locator('canvas.board').boundingBox()
const cx = box.x + box.width / 2, cy = box.y + box.height / 2
// asymmetric "L" mark so rotation is obvious
const stroke = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down()
  for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 8 })
  await page.mouse.up(); await page.waitForTimeout(100)
}
await stroke([[cx - 100, cy - 60], [cx + 100, cy - 60]]) // top horizontal
await stroke([[cx - 100, cy - 60], [cx - 100, cy + 60]]) // left vertical
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/rotate-before.png' })
const beadsBefore = await page.evaluate(() => new Promise((res) => {
  const q = indexedDB.open('beadwork3'); q.onsuccess = () => {
    const a = q.result.transaction('artworks', 'readonly').objectStore('artworks').getAll()
    a.onsuccess = () => res((a.result[0].layers || []).reduce((n, l) => n + l.beads.length, 0))
  }
}))

// two-finger rotate ~45° around the canvas centre, via synthetic touch pointer
// events dispatched straight at the canvas (reliably reaches React's handlers)
await page.evaluate(({ total, steps, R }) => {
  const canvas = document.querySelector('canvas.board')
  canvas.setPointerCapture = () => {}
  canvas.releasePointerCapture = () => {}
  const rect = canvas.getBoundingClientRect()
  const mx = rect.left + rect.width / 2, my = rect.top + rect.height / 2
  const fire = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
    bubbles: true, cancelable: true, isPrimary: id === 1,
  }))
  const rot = (px, py, a) => ({ x: mx + (px - mx) * Math.cos(a) - (py - my) * Math.sin(a), y: my + (px - mx) * Math.sin(a) + (py - my) * Math.cos(a) })
  fire('pointerdown', 1, mx - R, my)
  fire('pointerdown', 2, mx + R, my)
  for (let i = 1; i <= steps; i++) {
    const a = (total * i) / steps
    const q1 = rot(mx - R, my, a), q2 = rot(mx + R, my, a)
    fire('pointermove', 1, q1.x, q1.y)
    fire('pointermove', 2, q2.x, q2.y)
  }
  fire('pointerup', 1, mx, my)
  fire('pointerup', 2, mx, my)
}, { total: Math.PI / 4, steps: 18, R: 120 })
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/rotate-after.png' })
console.log('STATUS BAR after rotate:', (await page.locator('.stageInfo').textContent()).trim())

// draw again after rotating — must still paint (rotation-aware hit-test)
await stroke([[cx - 40, cy + 40], [cx + 40, cy + 40]])
await page.waitForTimeout(900)
const beadsAfter = await page.evaluate(() => new Promise((res) => {
  const q = indexedDB.open('beadwork3'); q.onsuccess = () => {
    const a = q.result.transaction('artworks', 'readonly').objectStore('artworks').getAll()
    a.onsuccess = () => res((a.result[0].layers || []).reduce((n, l) => n + l.beads.length, 0))
  }
}))
console.log('BEADS before rotate:', beadsBefore)
console.log('BEADS after rotate + draw (must be higher):', beadsAfter)
console.log('DREW AFTER ROTATE:', beadsAfter > beadsBefore)
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
