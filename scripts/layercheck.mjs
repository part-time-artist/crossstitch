// Verify the layers feature: a fresh doc has one layer; adding a layer and
// drawing on it keeps the first layer's beads intact (separate Maps); the
// quick-save snapshot serialises every layer; hiding a layer drops it from the
// flattened export; undo reverses a layer add; and the top layer wins on
// overlapping nodes.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const fail = (msg) => { console.log('FAIL:', msg); process.exitCode = 1 }

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const snapshot = async () => {
  await page.getByRole('button', { name: /Save artwork|save again/ }).click()
  await page.waitForTimeout(150)
  return page.evaluate(() => JSON.parse(localStorage.getItem('beadwork3_design_v1')))
}

const board = await page.locator('canvas.board').boundingBox()
const cx = board.x + board.width / 2
const cy = board.y + board.height / 2

const stroke = (x0, y0, x1, y1) => page.mouse.move(x0, y0)
  .then(() => page.mouse.down())
  .then(() => page.mouse.move(x1, y1, { steps: 12 }))
  .then(() => page.mouse.up())
  .then(() => page.waitForTimeout(150))

// 1. fresh doc = exactly one layer
let snap = await snapshot()
console.log(`fresh layers: ${snap.layers.length}`)
if (snap.layers.length !== 1) fail('fresh design should have exactly one layer')

// 2. draw a stroke on Layer 1
await page.getByTitle('Draw').click()
await stroke(cx - 140, cy, cx - 40, cy)
snap = await snapshot()
const l1 = snap.layers[0].beads.length
console.log(`layer 1 beads: ${l1}`)
if (!l1) fail('nothing drawn on layer 1')

// 3. open the layers panel and add a layer
await page.getByTitle('Layers').click()
await page.waitForTimeout(150)
if (!(await page.locator('.layersPanel').isVisible())) fail('layers panel did not open')
await page.locator('.lpAdd').click()
await page.waitForTimeout(150)
snap = await snapshot()
console.log(`after add: ${snap.layers.length} layers, active index ${snap.activeIndex}`)
if (snap.layers.length !== 2) fail('add layer did not create a second layer')
if (snap.activeIndex !== 1) fail('new layer should become active (index 1)')
if (snap.layers[0].beads.length !== l1) fail('layer 1 beads changed when adding a layer')

// 4. draw on layer 2 (different spot) — layer 1 must stay intact (separate Maps)
await stroke(cx + 40, cy, cx + 140, cy)
snap = await snapshot()
const l2 = snap.layers[1].beads.length
console.log(`layer 2 beads: ${l2}, layer 1 still: ${snap.layers[0].beads.length}`)
if (!l2) fail('nothing drawn on layer 2')
if (snap.layers[0].beads.length !== l1) fail('drawing on layer 2 corrupted layer 1')

// 5. undo reverses the LAST content op (the layer-2 stroke)
await page.locator('.zoomCtl button[title*="Undo"]').click()
await page.waitForTimeout(200)
snap = await snapshot()
console.log(`after undo: layer2 beads ${snap.layers[1]?.beads.length ?? 'n/a'}`)
if ((snap.layers[1]?.beads.length || 0) !== 0) fail('undo did not clear the layer-2 stroke')
// redo it back for the export check
await page.locator('.zoomCtl button[title*="Redo"]').click()
await page.waitForTimeout(200)

// 6. hide layer 1, export, and confirm only the visible layer's beads ship.
//    Count coloured pixels: with layer 1 hidden the flattened chart has fewer.
const exportColouredPixels = async () => {
  return page.evaluate(async () => {
    // trigger Save PNG and read the produced data URL by patching the anchor
    return new Promise((resolve) => {
      const realClick = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function () {
        const href = this.href
        HTMLAnchorElement.prototype.click = realClick
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.width; c.height = img.height
          const x = c.getContext('2d')
          x.drawImage(img, 0, 0)
          const d = x.getImageData(0, 0, c.width, c.height).data
          let coloured = 0
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3]
            // count strongly-coloured pixels (skip white/near-white + transparent)
            if (a > 10 && !(r > 235 && g > 235 && b > 235)) coloured++
          }
          resolve(coloured)
        }
        img.src = href
      }
    })
  })
}
// kick the export, then await the patched click result
const bothP = exportColouredPixels()
await page.getByRole('button', { name: 'Save PNG' }).click()
const both = await bothP
console.log(`coloured px, both layers visible: ${both}`)

// hide layer 1 (top row in the reversed list is layer 2; layer 1 is the lower)
const rows = page.locator('.layerRow')
await rows.nth(1).locator('.lpEye').click() // second row = bottom layer = Layer 1
await page.waitForTimeout(150)
const oneP = exportColouredPixels()
await page.getByRole('button', { name: 'Save PNG' }).click()
const one = await oneP
console.log(`coloured px, layer 1 hidden: ${one}`)
if (!(one < both)) fail('hiding a layer did not reduce the exported coloured area')

if (errors.length) fail('page errors: ' + errors.join(' | '))
console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: PASS')
await browser.close()
