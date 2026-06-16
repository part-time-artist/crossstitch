// Hide/show toggle test: upload image, Done, Hide → solid colour shows;
// Show → image returns with the same placement.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const bgCard = page.locator('.card', { hasText: 'Background' })
await bgCard.getByRole('button', { name: 'Image' }).click()
await page.locator('input[type="file"]').setInputFiles('assets/rows explaination.png')
await page.waitForTimeout(600)
await page.locator('.adjustBar button').click() // Done

await bgCard.getByRole('button', { name: 'Hide image' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/bg-hidden.png' })
const adjustDisabled = await bgCard.getByRole('button', { name: 'Adjust' }).isDisabled()

await bgCard.getByRole('button', { name: 'Show image' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/bg-shown.png' })

console.log('ADJUST DISABLED WHEN HIDDEN:', adjustDisabled)
console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
