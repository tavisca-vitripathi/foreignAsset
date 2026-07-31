export interface EntityDetails {
  countryCode: string
  countryName: string
  name: string
  address: string
  zipCode: string
  nature: string
}

export interface AcquisitionLot {
  id: string
  acquiredDate: string
  quantity: number
  costBasisUsd: number
  source: string
}

export interface SaleTransaction {
  id: string
  acquiredDate: string
  soldDate: string
  quantity: number
  costBasisUsd: number
  proceedsUsd: number
  source?: string
}

export interface DividendDefinition {
  recordDate: string
  paymentDate: string
  amountPerShareUsd: number
}

export interface WithholdingRecord {
  paymentDate: string
  grossIncomeUsd: number
  taxWithheldUsd: number
}

export interface ReferencePack {
  id: string
  assessmentYear: string
  calendarYear: number
  entity: EntityDetails
  rates: Record<string, number>
  dailyPricesUsd: Record<string, number>
  closingPriceUsd: number
  closingPriceDate: string
  dividends: DividendDefinition[]
  provenance: string[]
}

export interface CalculationInput {
  lots: AcquisitionLot[]
  sales: SaleTransaction[]
  withholding: WithholdingRecord[]
  salesConfirmed: boolean
  withholdingConfirmed: boolean
  averageIndianTaxRate: number | null
  taxpayerId: string
}

export interface MoneyAudit {
  formula: string
  inputs: Record<string, string | number>
  exactValue: number
}

export interface ScheduleFaRow {
  lotId: string
  acquiredDate: string
  initialValueInr: number
  peakValueInr: number
  peakDate: string | null
  closingValueInr: number
  grossCreditedInr: number
  saleProceedsInr: number
  audit: Record<string, MoneyAudit>
}

export interface ScheduleFsiRow {
  country: string
  taxpayerId: string
  headOfIncome: string
  foreignIncomeInr: number
  foreignTaxPaidInr: number
  indianTaxInr: number | null
  dtaaArticle: string
  foreignTaxSource: 'actual' | 'estimated'
}

export interface ScheduleTrRow {
  country: string
  taxpayerId: string
  foreignTaxPaidInr: number
  reliefAvailableInr: number | null
  section: string
}

export interface CalculationWarning {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export interface ReportResult {
  faRows: ScheduleFaRow[]
  fsi: ScheduleFsiRow
  tr: ScheduleTrRow
  warnings: CalculationWarning[]
}