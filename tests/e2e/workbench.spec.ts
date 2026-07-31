import { expect, test } from '@playwright/test'

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