import { expect, test } from '@playwright/test'
import path from 'node:path'

test('renders and navigates the verified report', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Foreign asset schedules' })).toBeVisible()
  await expect(page.getByText('INR 21,76,069').or(page.getByText('₹21,76,069'))).toBeVisible()

  await page.getByRole('tab', { name: 'Schedule FSI' }).click()
  await expect(page.getByRole('heading', { name: 'Income from outside India' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '₹14,116' })).toBeVisible()

  await page.getByRole('tab', { name: 'Schedule TR' }).click()
  await expect(page.getByRole('heading', { name: 'Foreign tax relief' })).toBeVisible()
  await expect(page.getByText('Pending')).toBeVisible()

  await page.getByRole('tab', { name: 'Schedule FA / A3' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: testInfo.outputPath('workbench.png'),
    fullPage: true,
  })
})

test('supports manual corrections', async ({ page }) => {
  await page.goto('/')

  const openEvidence = page.getByRole('button', { name: 'Open evidence panel' })
  if (await openEvidence.count()) {
    await page.getByRole('button', { name: 'Open evidence panel' }).click()
  }
  await page.getByRole('button', { name: 'Add manual record' }).click()
  await expect(page.getByRole('dialog', { name: 'Add manual record' })).toBeVisible()
  await page.getByLabel('Date acquired').fill('2025-01-15')
  await page.getByLabel('Quantity').fill('1')
  await page.getByLabel('Cost basis (USD)').fill('400')
  await page.getByRole('button', { name: 'Add record' }).click()
  await expect(page.getByText('1 manual records')).toBeVisible()
})

test('combines Morgan Stanley PDF and Fidelity CSV holdings', async ({ page }) => {
  await page.goto('/')

  await page.locator('#morgan-stanley-holdings-file').setInputFiles(path.join(
    process.cwd(),
    'public/templates/morgan-stanley-holdings-template.pdf',
  ))
  await expect(page.getByText('Morgan Stanley · 1 record')).toBeVisible()
  await expect(page.getByText('Verified Fidelity sample.csv')).toHaveCount(0)

  await page.locator('#open-lots-file').setInputFiles({
    name: 'fidelity-open-lots.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date acquired,Quantity,Cost basis,Share source\nMar-31-2025,2,600,DO\n'),
  })

  await expect(page.getByText('Fidelity · 1 record')).toBeVisible()
  await expect(page.getByText('Morgan Stanley · 1 record')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Report summary' }).getByText('2', { exact: true })).toBeVisible()
})