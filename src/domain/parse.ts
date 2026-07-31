import Papa from 'papaparse'
import type {
  AcquisitionLot,
  SaleTransaction,
  WithholdingRecord,
} from './types'

export interface ParseIssue {
  row: number
  message: string
}

export type SupportedBroker = 'Fidelity' | 'Morgan Stanley'

export interface ParseResult<T> {
  rows: T[]
  issues: ParseIssue[]
  broker: SupportedBroker | null
}

type CsvRow = Record<string, string | undefined>

const ACQUIRED_DATE_ALIASES = [
  'Date acquired',
  'Acquisition date',
  'Vest date',
  'Release date',
  'Purchase date',
]
const QUANTITY_ALIASES = [
  'Quantity',
  'Shares',
  'Shares acquired',
  'Available shares',
  'Shares available',
  'Available quantity',
  'Total shares you hold',
]
const COST_BASIS_ALIASES = [
  'Cost basis',
  'Total cost basis',
  'Adjusted cost basis',
  'Total cost',
  'Acquisition cost',
  'Purchase cost',
]
const SOURCE_ALIASES = ['Share source', 'Source', 'Plan type', 'Award type', 'Grant type']
const MORGAN_STANLEY_HEADERS = new Set([
  'vestdate',
  'releasedate',
  'purchasedate',
  'availablequantity',
  'availableshares',
  'sharesavailable',
  'totalsharesyouhold',
  'adjustedcostbasis',
  'totalcost',
  'plantype',
  'awardtype',
  'granttype',
  'tradedate',
  'quantitysold',
  'netproceeds',
  'grossproceeds',
  'paydate',
  'taxamount',
])
const FIDELITY_HEADERS = new Set([
  'dateacquired',
  'datesold',
  'sharesource',
  'grossdividend',
])
const KNOWN_HEADERS = new Set([
  ...ACQUIRED_DATE_ALIASES,
  ...QUANTITY_ALIASES,
  ...COST_BASIS_ALIASES,
  ...SOURCE_ALIASES,
  'Date sold',
  'Sale date',
  'Trade date',
  'Settlement date',
  'Shares sold',
  'Quantity sold',
  'Proceeds',
  'Sale proceeds',
  'Total proceeds',
  'Net proceeds',
  'Gross proceeds',
  'Net amount',
  'Payment date',
  'Date paid',
  'Transaction date',
  'Pay date',
  'Gross income',
  'Gross dividend',
  'Dividend amount',
  'Gross amount',
  'Gross payment',
  'Income amount',
  'Tax withheld',
  'Foreign tax paid',
  'Withholding tax',
  'Federal tax withheld',
  'US federal tax withheld',
  'Tax amount',
  'Total tax withheld',
].map(normalizeHeader))

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizedRow(row: CsvRow): CsvRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value?.trim()]),
  )
}

function detectBroker(fields: string[] | undefined): SupportedBroker | null {
  const headers = (fields ?? []).map(normalizeHeader)
  if (headers.some((header) => MORGAN_STANLEY_HEADERS.has(header))) {
    return 'Morgan Stanley'
  }
  if (headers.some((header) => FIDELITY_HEADERS.has(header))) {
    return 'Fidelity'
  }
  return null
}

function pick(row: CsvRow, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)]
    if (value !== undefined && value !== '' && value !== '-') {
      return value
    }
  }
  return undefined
}

function parseNumber(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const negative = /^\(.*\)$/.test(value.trim())
  const cleaned = value.replace(/[$₹,%(),\s]/g, '')
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return negative ? -parsed : parsed
}

function normalizeSource(value: string | undefined, broker: SupportedBroker | null): string {
  const normalized = normalizeHeader(value ?? '')
  if ([
    'espp',
    'employeestockpurchase',
    'employeestockpurchaseplan',
    'stockpurchaseplan',
  ].includes(normalized)) {
    return 'SP'
  }
  return value ?? broker ?? 'Broker import'
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function parseFidelityDate(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (iso) {
    return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`
  }

  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed)
  if (numeric) {
    return `${numeric[3]}-${pad(Number(numeric[1]))}-${pad(Number(numeric[2]))}`
  }

  const named = /^([A-Za-z]{3})[-\s](\d{1,2})[-,\s]+(\d{4})$/.exec(trimmed)
  if (named) {
    const month = MONTHS[named[1].toLowerCase()]
    if (month) {
      return `${named[3]}-${pad(month)}-${pad(Number(named[2]))}`
    }
  }

  return null
}

function parseCsv(text: string): ParseResult<CsvRow> {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
  })
  const headerIndex = result.data.findIndex((values) => (
    values.filter((value) => KNOWN_HEADERS.has(normalizeHeader(value))).length >= 3
  ))
  const fields = headerIndex >= 0 ? result.data[headerIndex] : []
  const rows = headerIndex >= 0
    ? result.data.slice(headerIndex + 1).map((values) => normalizedRow(Object.fromEntries(
        fields.map((field, index) => [field, values[index]]),
      )))
    : []

  return {
    rows,
    broker: detectBroker(fields),
    issues: result.errors
      .map((error) => ({
        row: error.row === undefined ? 0 : error.row + 1,
        message: error.message,
      })),
  }
}

export function parseOpenLotsCsv(text: string): ParseResult<AcquisitionLot> {
  const parsed = parseCsv(text)
  const rows: AcquisitionLot[] = []
  const issues = [...parsed.issues]

  parsed.rows.forEach((row, index) => {
    const acquiredDate = parseFidelityDate(pick(row, ACQUIRED_DATE_ALIASES))
    const quantity = parseNumber(pick(row, QUANTITY_ALIASES))
    const costBasisUsd = parseNumber(pick(row, COST_BASIS_ALIASES))

    if (!acquiredDate && quantity === null && costBasisUsd === null) {
      return
    }
    if (!acquiredDate || quantity === null || costBasisUsd === null) {
      issues.push({
        row: index + 2,
        message: 'Expected Date acquired, Quantity, and Cost basis.',
      })
      return
    }
    if (quantity <= 0 || costBasisUsd < 0) {
      issues.push({ row: index + 2, message: 'Quantity must be positive and cost basis cannot be negative.' })
      return
    }

    rows.push({
      id: `open-${index + 1}`,
      acquiredDate,
      quantity,
      costBasisUsd,
      source: normalizeSource(pick(row, SOURCE_ALIASES), parsed.broker),
    })
  })

  if (rows.length === 0 && issues.length === 0) {
    issues.push({ row: 1, message: 'No recognizable open-lot rows were found.' })
  }
  return { rows, issues, broker: parsed.broker }
}

export function parseSalesCsv(text: string): ParseResult<SaleTransaction> {
  const parsed = parseCsv(text)
  const rows: SaleTransaction[] = []
  const issues = [...parsed.issues]

  parsed.rows.forEach((row, index) => {
    const acquiredDate = parseFidelityDate(pick(row, ACQUIRED_DATE_ALIASES))
    const soldDate = parseFidelityDate(pick(row, ['Date sold', 'Sale date', 'Trade date', 'Settlement date']))
    const quantity = parseNumber(pick(row, ['Quantity', 'Shares sold', 'Quantity sold', 'Shares']))
    const costBasisUsd = parseNumber(pick(row, COST_BASIS_ALIASES))
    const proceedsUsd = parseNumber(pick(row, [
      'Proceeds',
      'Sale proceeds',
      'Total proceeds',
      'Net proceeds',
      'Gross proceeds',
      'Net amount',
    ]))

    if (!acquiredDate && !soldDate && quantity === null && proceedsUsd === null) {
      return
    }
    if (!acquiredDate || !soldDate || quantity === null || costBasisUsd === null || proceedsUsd === null) {
      issues.push({
        row: index + 2,
        message: 'Expected Date acquired, Date sold, Quantity, Cost basis, and Proceeds.',
      })
      return
    }
    if (quantity <= 0 || costBasisUsd < 0 || proceedsUsd < 0) {
      issues.push({ row: index + 2, message: 'Sale quantities and amounts must be non-negative.' })
      return
    }

    rows.push({
      id: `sale-${index + 1}`,
      acquiredDate,
      soldDate,
      quantity,
      costBasisUsd,
      proceedsUsd,
      source: normalizeSource(pick(row, SOURCE_ALIASES), parsed.broker),
    })
  })

  return { rows, issues, broker: parsed.broker }
}

export function parseWithholdingCsv(text: string): ParseResult<WithholdingRecord> {
  const parsed = parseCsv(text)
  const rows: WithholdingRecord[] = []
  const issues = [...parsed.issues]

  parsed.rows.forEach((row, index) => {
    const paymentDate = parseFidelityDate(pick(row, [
      'Payment date',
      'Date paid',
      'Transaction date',
      'Pay date',
      'Date',
    ]))
    const grossIncomeUsd = parseNumber(pick(row, [
      'Gross income',
      'Gross dividend',
      'Dividend amount',
      'Gross amount',
      'Gross payment',
      'Income amount',
    ]))
    const taxWithheldUsd = parseNumber(pick(row, [
      'Tax withheld',
      'Foreign tax paid',
      'Withholding tax',
      'Federal tax withheld',
      'US federal tax withheld',
      'Tax amount',
      'Total tax withheld',
    ]))

    if (!paymentDate && grossIncomeUsd === null && taxWithheldUsd === null) {
      return
    }
    if (!paymentDate || grossIncomeUsd === null || taxWithheldUsd === null) {
      issues.push({
        row: index + 2,
        message: 'Expected Payment date, Gross income, and Tax withheld.',
      })
      return
    }
    if (grossIncomeUsd < 0 || taxWithheldUsd < 0) {
      issues.push({ row: index + 2, message: 'Dividend and withholding amounts cannot be negative.' })
      return
    }

    rows.push({ paymentDate, grossIncomeUsd, taxWithheldUsd })
  })

  return { rows, issues, broker: parsed.broker }
}

export function mergeLotsWithSales(
  openLots: AcquisitionLot[],
  sales: SaleTransaction[],
): AcquisitionLot[] {
  const lots = new Map<string, AcquisitionLot>()

  openLots.forEach((lot) => {
    const existing = lots.get(lot.acquiredDate)
    lots.set(lot.acquiredDate, existing
      ? {
          ...existing,
          quantity: existing.quantity + lot.quantity,
          costBasisUsd: existing.costBasisUsd + lot.costBasisUsd,
        }
      : { ...lot })
  })

  sales.forEach((sale) => {
    const existing = lots.get(sale.acquiredDate)
    lots.set(sale.acquiredDate, existing
      ? {
          ...existing,
          quantity: existing.quantity + sale.quantity,
          costBasisUsd: existing.costBasisUsd + sale.costBasisUsd,
        }
      : {
          id: `sold-${sale.acquiredDate}`,
          acquiredDate: sale.acquiredDate,
          quantity: sale.quantity,
          costBasisUsd: sale.costBasisUsd,
          source: sale.source ?? 'Sold history',
        })
  })

  return [...lots.values()].sort((left, right) => left.acquiredDate.localeCompare(right.acquiredDate))
}