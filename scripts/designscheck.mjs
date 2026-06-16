// Verify named design slots + design-file export/import + the 5-colour preset.
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const fail = (msg) => { console.log('FAIL:', msg); process.exitCode = 1 }

// fresh browser state so the default palette shows
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// 1. default palette = 5 swatches (+ the "add" button)
const swatches = await page.locator('.swatches .sw:not(.add)').count()
console.log(`palette swatches: ${swatches}`)
if (swatches !== 5) fail(`expected 5 default swatches, got ${swatches}`)

// helpers
const designsCard = page.locator('.card', { hasText: 'My designs' })
const namePill = designsCard.locator('.pillInput')
const board = await page.locator('canvas.board').boundingBox()
const cx = board.x + board.width / 2
const cy = board.y + board.height / 2
const stroke = async (x0, y0, x1, y1) => {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x1, y1, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}

// 2. draw, name it, save
await stroke(cx - 120, cy - 40, cx + 120, cy - 40)
await namePill.fill('test-flower')
await designsCard.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForTimeout(200)
let items = await designsCard.locator('.savedItem').count()
console.log(`saved designs after 1st save: ${items}`)
if (items !== 1) fail(`expected 1 saved design, got ${items}`)

// 3. different drawing under a second name
await stroke(cx - 120, cy + 60, cx + 120, cy + 60)
await namePill.fill('second')
await designsCard.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForTimeout(200)
items = await designsCard.locator('.savedItem').count()
if (items !== 2) fail(`expected 2 saved designs, got ${items}`)

// 4. load the first slot back — name pill should follow
await designsCard.locator('.savedApply', { hasText: 'test-flower' }).click()
await page.waitForTimeout(300)
const loadedName = await namePill.inputValue()
console.log(`name after load: ${loadedName}`)
if (loadedName !== 'test-flower') fail(`expected name test-flower, got ${loadedName}`)

// 5. export file
const [download] = await Promise.all([
  page.waitForEvent('download'),
  designsCard.getByRole('button', { name: 'Export file' }).click(),
])
console.log(`download name: ${download.suggestedFilename()}`)
const file = await download.path()
const exported = JSON.parse(fs.readFileSync(file, 'utf8'))
console.log(`exported: name=${exported.name}, beads=${exported.beads.length}`)
if (exported.name !== 'test-flower' || !exported.beads.length) fail('exported file wrong')

// 6. import the file back (after renaming away, to prove import sets state)
await namePill.fill('something-else')
await namePill.blur() // Pill shows its typing draft until blurred
await designsCard.locator('input[type=file]').setInputFiles(file)
await page.waitForTimeout(400)
const importedName = await namePill.inputValue()
console.log(`name after import: ${importedName}`)
if (importedName !== 'test-flower') fail(`import did not apply, name=${importedName}`)

// 7. reload — slots persist
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
items = await designsCard.locator('.savedItem').count()
console.log(`saved designs after reload: ${items}`)
if (items !== 2) fail(`expected 2 saved designs after reload, got ${items}`)

// 8. no horizontal overflow in either panel
const overflow = await page.evaluate(() =>
  [...document.querySelectorAll('.panelScroll')].some((el) => el.scrollWidth > el.clientWidth)
)
if (overflow) fail('panel scrolls horizontally')

await page.screenshot({ path: 'scripts/view-designs.png' })
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: PASS')
await browser.close()
