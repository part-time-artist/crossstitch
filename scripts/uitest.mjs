// Verify: 36 beads across 7cm at 1.5mm, pointer-based colour drag fills,
// hold-to-clear works, Pill can be cleared and retyped, no None bg option.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// pick 1.5mm and type canvas width 7 (clear the field first — the old bug)
await page.getByRole('button', { name: '1.5 mm' }).click()
const wInput = page.locator('.pill input').first()
await wInput.click()
await wInput.press('Control+a')
await wInput.press('Backspace')
await wInput.type('7')
await wInput.press('Tab')
await page.waitForTimeout(400)
const info = await page.locator('.stageInfo').innerText()

// drag a palette swatch onto the canvas with plain pointer events
const sw = page.locator('.swatches .sw').first()
const swBox = await sw.boundingBox()
const canvas = await page.locator('canvas.board').boundingBox()
await page.mouse.move(swBox.x + 10, swBox.y + 10)
await page.mouse.down()
await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(400)
await page.screenshot({ path: 'scripts/ui-after-fill.png' })

// hold-to-clear (press 1s)
const clearBtn = page.getByRole('button', { name: /Hold to clear/i })
const cb = await clearBtn.boundingBox()
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
await page.mouse.down()
await page.waitForTimeout(1000)
await page.mouse.up()
await page.waitForTimeout(400)
await page.screenshot({ path: 'scripts/ui-after-clear.png' })

const bgOptions = await page.locator('.card', { hasText: 'Background' }).locator('.seg').allInnerTexts()
console.log('STAGE INFO:', info.replace(/\n/g, ' '))
console.log('BG OPTIONS:', bgOptions.join(', '))
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
