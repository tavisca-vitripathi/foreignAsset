import { addDays, isBetween, previousMonthEnd } from './dates'
import type {
  AcquisitionLot,
  CalculationInput,
  CalculationWarning,
  MoneyAudit,
  ReferencePack,
  ReportResult,
  SaleTransaction,
} from './types'

interface RateMatch {
  date: string
  rate: number
}

function findRate(rates: Record<string, number>, date: string): RateMatch {
  for (let offset = 0; offset <= 5; offset += 1) {
    const candidate = addDays(date, -offset)
    const rate = rates[candidate]
    if (rate !== undefined) {
      return { date: candidate, rate }
    }
  }

  throw new Error(`No SBI TT rate found on or within five days before ${date}`)
}

function salesForLot(lot: AcquisitionLot, sales: SaleTransaction[]): SaleTransaction[] {
  return sales
    .filter((sale) => sale.acquiredDate === lot.acquiredDate)
    .sort((left, right) => left.soldDate.localeCompare(right.soldDate))
}

function quantityOnDate(lot: AcquisitionLot, sales: SaleTransaction[], date: string): number {
  const sold = sales
    .filter((sale) => sale.soldDate < date)
    .reduce((sum, sale) => sum + sale.quantity, 0)
  return Math.max(0, lot.quantity - sold)
}

function moneyAudit(
  formula: string,
  inputs: Record<string, string | number>,
  exactValue: number,
): MoneyAudit {
  return { formula, inputs, exactValue }
}

function calculateFaRow(
  lot: AcquisitionLot,
  allSales: SaleTransaction[],
  pack: ReferencePack,
) {
  const calendarStart = `${pack.calendarYear}-01-01`
  const calendarEnd = `${pack.calendarYear}-12-31`
  const lotSales = salesForLot(lot, allSales)
  const acquisitionRate = findRate(pack.rates, lot.acquiredDate)
  const isDiscountedStockPurchase = lot.source.trim().toUpperCase() === 'SP'
  const initialValueUsd = isDiscountedStockPurchase ? lot.costBasisUsd / 0.9 : lot.costBasisUsd
  const initialValue = initialValueUsd * acquisitionRate.rate

  let peakValue = 0
  let peakDate: string | null = null
  let peakInputs: Record<string, string | number> = {}

  Object.entries(pack.dailyPricesUsd)
    .filter(([date]) => isBetween(date, lot.acquiredDate > calendarStart ? lot.acquiredDate : calendarStart, calendarEnd))
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([date, priceUsd]) => {
      const quantity = quantityOnDate(lot, lotSales, date)
      if (quantity <= 0) {
        return
      }

      const rate = findRate(pack.rates, date)
      const value = quantity * priceUsd * rate.rate
      if (value > peakValue) {
        peakValue = value
        peakDate = date
        peakInputs = {
          quantity,
          priceUsd,
          rate: rate.rate,
          rateDate: rate.date,
        }
      }
    })

  const closingRate = findRate(pack.rates, pack.closingPriceDate)
  const closingQuantity = quantityOnDate(lot, lotSales, addDays(calendarEnd, 1))
  const closingValue = closingQuantity * pack.closingPriceUsd * closingRate.rate

  const dividendAudits: MoneyAudit[] = []
  const grossCredited = pack.dividends
    .filter((dividend) => isBetween(dividend.recordDate, calendarStart, calendarEnd))
    .reduce((sum, dividend) => {
      const quantity = lot.acquiredDate <= dividend.recordDate
        ? quantityOnDate(lot, lotSales, dividend.recordDate)
        : 0
      if (quantity <= 0) {
        return sum
      }

      const conversionDate = previousMonthEnd(dividend.paymentDate)
      const rate = findRate(pack.rates, conversionDate)
      const value = quantity * dividend.amountPerShareUsd * rate.rate
      dividendAudits.push(moneyAudit(
        'eligible shares x dividend per share x SBI TT rate',
        {
          recordDate: dividend.recordDate,
          quantity,
          dividendPerShareUsd: dividend.amountPerShareUsd,
          rate: rate.rate,
          rateDate: rate.date,
        },
        value,
      ))
      return sum + value
    }, 0)

  const saleProceeds = lotSales
    .filter((sale) => isBetween(sale.soldDate, calendarStart, calendarEnd))
    .reduce((sum, sale) => sum + sale.proceedsUsd * findRate(pack.rates, sale.soldDate).rate, 0)

  return {
    lotId: lot.id,
    acquiredDate: lot.acquiredDate,
    initialValueInr: initialValue,
    peakValueInr: peakValue,
    peakDate,
    closingValueInr: closingValue,
    grossCreditedInr: grossCredited,
    saleProceedsInr: saleProceeds,
    audit: {
      initial: moneyAudit(
        isDiscountedStockPurchase
          ? 'USD cost basis / 90% purchase factor x SBI TT rate on acquisition date'
          : 'USD cost basis x SBI TT rate on acquisition date',
        {
          costBasisUsd: lot.costBasisUsd,
          ...(isDiscountedStockPurchase ? { purchaseFactor: 0.9, fairMarketValueUsd: initialValueUsd } : {}),
          rate: acquisitionRate.rate,
          rateDate: acquisitionRate.date,
        },
        initialValue,
      ),
      peak: moneyAudit('shares held x daily USD price x daily SBI TT rate', peakInputs, peakValue),
      closing: moneyAudit(
        'shares held at year end x closing USD price x closing SBI TT rate',
        {
          quantity: closingQuantity,
          priceUsd: pack.closingPriceUsd,
          rate: closingRate.rate,
          rateDate: closingRate.date,
        },
        closingValue,
      ),
      dividends: moneyAudit(
        'sum of gross dividends allocated to this lot',
        { payments: dividendAudits.length },
        grossCredited,
      ),
      sales: moneyAudit(
        'sum of USD sale proceeds x SBI TT rate on each sale date',
        { sales: lotSales.length },
        saleProceeds,
      ),
    },
  }
}

export function calculateReports(input: CalculationInput, pack: ReferencePack): ReportResult {
  const warnings: CalculationWarning[] = []
  const calendarEnd = `${pack.calendarYear}-12-31`
  const financialYearStart = `${pack.calendarYear}-04-01`
  const financialYearEnd = `${pack.calendarYear + 1}-03-31`

  const reportableLots = input.lots.filter((lot) => lot.acquiredDate <= calendarEnd)
  const faRows = reportableLots.map((lot) => calculateFaRow(lot, input.sales, pack))

  if (!input.salesConfirmed) {
    warnings.push({
      code: 'SALES_NOT_PROVIDED',
      severity: 'warning',
      message: 'No sales history was supplied. Zero sale proceeds are provisional, not confirmed.',
    })
  }

  const financialYearDividends = pack.dividends.filter((dividend) =>
    isBetween(dividend.recordDate, financialYearStart, financialYearEnd),
  )
  const foreignIncomeInr = financialYearDividends.reduce((sum, dividend) => {
    const eligibleQuantity = input.lots.reduce((quantity, lot) => {
      if (lot.acquiredDate > dividend.recordDate) {
        return quantity
      }
      return quantity + quantityOnDate(lot, salesForLot(lot, input.sales), dividend.recordDate)
    }, 0)
    const conversionDate = previousMonthEnd(dividend.paymentDate)
    return sum + eligibleQuantity * dividend.amountPerShareUsd * findRate(pack.rates, conversionDate).rate
  }, 0)

  const actualForeignTax = input.withholding
    .filter((record) => isBetween(record.paymentDate, financialYearStart, financialYearEnd))
    .reduce((sum, record) => {
      const rate = findRate(pack.rates, previousMonthEnd(record.paymentDate))
      return sum + record.taxWithheldUsd * rate.rate
    }, 0)
  const hasActualWithholding = input.withholdingConfirmed
  const foreignTaxPaidInr = hasActualWithholding ? actualForeignTax : foreignIncomeInr * 0.25

  if (!hasActualWithholding) {
    warnings.push({
      code: 'WITHHOLDING_ESTIMATED',
      severity: 'warning',
      message: 'Foreign tax is estimated at 25%. Upload broker withholding records before filing.',
    })
  }

  const indianTaxInr = input.averageIndianTaxRate === null
    ? null
    : foreignIncomeInr * input.averageIndianTaxRate
  if (input.averageIndianTaxRate === null) {
    warnings.push({
      code: 'INDIAN_TAX_RATE_MISSING',
      severity: 'warning',
      message: 'Enter the applicable average Indian tax rate to calculate Schedule TR relief.',
    })
  }

  const reliefAvailableInr = indianTaxInr === null
    ? null
    : Math.min(foreignTaxPaidInr, indianTaxInr)

  return {
    faRows,
    fsi: {
      country: pack.entity.countryName,
      taxpayerId: input.taxpayerId,
      headOfIncome: 'Other Sources',
      foreignIncomeInr,
      foreignTaxPaidInr,
      indianTaxInr,
      dtaaArticle: '10, 25',
      foreignTaxSource: hasActualWithholding ? 'actual' : 'estimated',
    },
    tr: {
      country: pack.entity.countryName,
      taxpayerId: input.taxpayerId,
      foreignTaxPaidInr,
      reliefAvailableInr,
      section: '90',
    },
    warnings,
  }
}