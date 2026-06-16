// Verify the pink default colour and the Duplicate & place flow:
// draw a motif, select it, duplicate, drag the ghost, Place, and confirm the
// bead count doubled and the copy is selected.
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

// 1. default colour is the palette pink
const defColor = await page
  .locator('.card', { hasText: 'Palette' })
  .locator('input[type=color]')
  .inputValue()
console.log(`default colour: ${defColor}`)
if (defColor.toLowerCase() !== '#f3cede') fail(`expected #f3cede, got ${defColor}`)

// bead count, via the quick-save snapshot
const beadCount = async () => {
  await page.getByRole('button', { name: /Save artwork|save again/ }).click()
  await page.waitForTimeout(150)
  return page.evaluate(() => JSON.parse(localStorage.getItem('beadwork3_design_v1')).beads.length)
}

const board = await page.locator('canvas.board').boundingBox()
const cx = board.x + board.width / 2
const cy = board.y + board.height / 2

// 2. draw a small motif top-left of centre
await page.mouse.move(cx - 150, cy - 80)
await page.mouse.down()
await page.mouse.move(cx - 60, cy - 80, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(200)
const before = await beadCount()
console.log(`motif beads: ${before}`)
if (!before) fail('nothing drawn')

// 3. select it with the marquee
await page.getByTitle('Select').click()
await page.mouse.move(cx - 180, cy - 110)
await page.mouse.down()
await page.mouse.move(cx - 30, cy - 50, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(200)
const selTitle = await page.locator('.selCard .cardTitle').first().textContent()
console.log(`selection card: ${selTitle.trim()}`)
if (selTitle.includes('· 0')) fail('marquee selected nothing')

// 4. duplicate → ghost appears; drag it well below the original
await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
await page.waitForTimeout(200)
await page.screenshot({ path: 'scripts/view-dup-ghost.png' })
await page.mouse.move(cx - 100, cy - 80)
await page.mouse.down()
await page.mouse.move(cx + 40, cy + 90, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(200)

// 5. place it
await page.getByRole('button', { name: 'Place', exact: true }).click()
await page.waitForTimeout(200)
const after = await beadCount()
console.log(`beads after place: ${after} (expected ${before * 2})`)
if (after !== before * 2) fail(`expected ${before * 2} beads, got ${after}`)

// 6. the placed copy is selected, ready to chain
const selAfter = await page.locator('.selCard .cardTitle').first().textContent()
console.log(`selection after place: ${selAfter.trim()}`)
if (selAfter.includes('· 0')) fail('placed copy not selected')

// 7. undo removes the placed copy in one step
// (the app's Ctrl+Z handler only fires when no button/input has focus)
await page.evaluate(() => document.activeElement.blur())
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
const afterUndo = await beadCount()
console.log(`beads after undo: ${afterUndo} (expected ${before})`)
if (afterUndo !== before) fail(`undo did not restore, got ${afterUndo}`)

await page.screenshot({ path: 'scripts/view-dup-placed.png' })

// 8. MOVE: reselect the original motif and move it — count unchanged, keys changed
const beadKeys = async () => {
  await page.getByRole('button', { name: /Save artwork|save again/ }).click()
  await page.waitForTimeout(150)
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('beadwork3_design_v1')).beads.map(([k]) => k).sort()
  )
}
const keysBefore = await beadKeys()
await page.mouse.move(cx - 180, cy - 110)
await page.mouse.down()
await page.mouse.move(cx - 30, cy - 50, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Move', exact: true }).click()
await page.waitForTimeout(200)
await page.mouse.move(cx - 100, cy - 80)
await page.mouse.down()
await page.mouse.move(cx + 120, cy + 120, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Place', exact: true }).click()
await page.waitForTimeout(200)
const keysAfter = await beadKeys()
console.log(`move: beads ${keysBefore.length} -> ${keysAfter.length}`)
if (keysAfter.length !== keysBefore.length) fail('move changed the bead count')
if (JSON.stringify(keysAfter) === JSON.stringify(keysBefore)) fail('move did not move anything')

// 9. cancel restores hidden originals untouched
await page.mouse.move(cx + 60, cy + 60)
await page.mouse.down()
await page.mouse.move(cx + 160, cy + 160, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Move', exact: true }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Cancel', exact: true }).click()
await page.waitForTimeout(200)
const keysCancel = await beadKeys()
if (JSON.stringify(keysCancel) !== JSON.stringify(keysAfter)) fail('cancel changed beads')
console.log('cancel: beads untouched')

console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: PASS')
await browser.close()
