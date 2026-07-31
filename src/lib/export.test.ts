import { describe, expect, it } from 'vitest'
import type { ReferencePack, ReportResult } from '../domain/types'
import { buildCsv, buildWorkbookXml } from './export'

const report: ReportResult = {
  faRows: [{
    lotId: 'lot-1',
    acquiredDate: '2025-03-31',
    initialValueInr: 148798.2,
    peakValueInr: 251897.01,
    peakDate: '2025-10-28',
    closingValueInr: 223936.87,
    grossCreditedInr: 1161.2,
    saleProceedsInr: 0,
    audit: {
      initial: { formula: 'cost x rate', inputs: { rate: 85.1 }, exactValue: 148798.2 },
    },
  }],
  fsi: {
    country: 'United States of America',
    taxpayerId: '',
    headOfIncome: 'Other Sources',
    foreignIncomeInr: 5541,
    foreignTaxPaidInr: 1385.25,
    indianTaxInr: null,
    dtaaArticle: '10, 25',
    foreignTaxSource: 'estimated',
  },
  tr: {
    country: 'United States of America',
    taxpayerId: '',
    foreignTaxPaidInr: 1385.25,
    reliefAvailableInr: null,
    section: '90',
  },
  warnings: [],
}

const pack = {
  assessmentYear: '2026-27',
  entity: {
    countryCode: '2',
    countryName: 'United States of America',
    name: 'Microsoft Corporation',
    address: 'One Microsoft Way',
    zipCode: '98052',
    nature: 'Listed Company',
  },
} as ReferencePack

describe('report exports', () => {
  it('creates a portal-shaped Schedule FA CSV', () => {
    const csv = buildCsv('fa', report, pack)
    expect(csv).toContain('Initial Value of Investment (INR)')
    expect(csv).toContain('2025-03-31,148798,251897,223937,1161,0')
  })

  it('creates a four-sheet Excel XML workbook', () => {
    const workbook = buildWorkbookXml(report, pack)
    expect(workbook.match(/<Worksheet /g)).toHaveLength(4)
    expect(workbook).toContain('ss:Name="Schedule FA A3"')
    expect(workbook).toContain('ss:Name="Schedule FSI"')
    expect(workbook).toContain('ss:Name="Schedule TR"')
    expect(workbook).toContain('ss:Name="Calculation Audit"')
  })
})