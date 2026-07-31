import { describe, expect, it } from 'vitest'
import referencePackData from '../data/ay-2026-27.json'
import { sampleOpenLots } from '../data/sample'
import { calculateReports } from './calculate'
import { mergeLotsWithSales } from './parse'
import type { CalculationInput, ReferencePack } from './types'

const referencePack = referencePackData as ReferencePack

const input: CalculationInput = {
  taxpayerId: '',
  averageIndianTaxRate: null,
  sales: [],
  salesConfirmed: false,
  withholding: [],
  withholdingConfirmed: false,
  lots: [
    { id: '1', acquiredDate: '2025-03-31', quantity: 5.1754, costBasisUsd: 1748.51, source: 'SP' },
    { id: '2', acquiredDate: '2025-06-30', quantity: 3.9096, costBasisUsd: 1750.21, source: 'SP' },
    { id: '3', acquiredDate: '2025-09-30', quantity: 4.3645, costBasisUsd: 2034.56, source: 'SP' },
    { id: '4', acquiredDate: '2025-12-31', quantity: 4.0406, costBasisUsd: 1758.71, source: 'SP' },
    { id: '5', acquiredDate: '2026-01-15', quantity: 24.08, costBasisUsd: 11061.87, source: 'DO' },
  ],
}

describe('calculateReports', () => {
  it('reproduces the reconciled Schedule FA rows', () => {
    const result = calculateReports(input, referencePack)

    expect(result.faRows.map((row) => ({
      acquiredDate: row.acquiredDate,
      initial: Math.round(row.initialValueInr),
      peak: Math.round(row.peakValueInr),
      closing: Math.round(row.closingValueInr),
      credited: Math.round(row.grossCreditedInr),
    }))).toEqual([
      { acquiredDate: '2025-03-31', initial: 165331, peak: 251897, closing: 223937, credited: 1161 },
      { acquiredDate: '2025-06-30', initial: 165492, peak: 190288, closing: 169166, credited: 601 },
      { acquiredDate: '2025-09-30', initial: 199726, peak: 212429, closing: 188850, credited: 353 },
      { acquiredDate: '2025-12-31', initial: 174835, peak: 176469, closing: 174835, credited: 0 },
    ])

    expect(Math.round(result.faRows.reduce((sum, row) => sum + row.initialValueInr, 0))).toBe(705385)
    expect(Math.round(result.faRows.reduce((sum, row) => sum + row.peakValueInr, 0))).toBe(831083)
    expect(Math.round(result.faRows.reduce((sum, row) => sum + row.closingValueInr, 0))).toBe(756788)
    expect(Math.round(result.faRows.reduce((sum, row) => sum + row.grossCreditedInr, 0))).toBe(2116)
  })

  it('includes the January to March dividend in Schedule FSI', () => {
    const result = calculateReports(input, referencePack)

    expect(Math.round(result.fsi.foreignIncomeInr)).toBe(5541)
    expect(Math.round(result.fsi.foreignTaxPaidInr)).toBe(1385)
    expect(result.fsi.foreignTaxSource).toBe('estimated')
    expect(result.tr.reliefAvailableInr).toBeNull()
  })

  it('reconciles the supplied mixed DO and SP open lots', () => {
    const result = calculateReports({
      ...input,
      lots: mergeLotsWithSales(sampleOpenLots, []),
    }, referencePack)

    expect(result.faRows.map((row) => ({
      initial: Math.round(row.initialValueInr),
      peak: Math.round(row.peakValueInr),
      closing: Math.round(row.closingValueInr),
      credited: Math.round(row.grossCreditedInr),
    }))).toEqual([
      { initial: 643037, peak: 870596, closing: 773961, credited: 5304 },
      { initial: 77861, peak: 105725, closing: 93990, credited: 644 },
      { initial: 181808, peak: 234356, closing: 208343, credited: 1428 },
      { initial: 77526, peak: 105073, closing: 93410, credited: 640 },
      { initial: 23448, peak: 33438, closing: 29726, credited: 154 },
      { initial: 138777, peak: 200967, closing: 178660, credited: 926 },
      { initial: 77209, peak: 117635, closing: 104578, credited: 542 },
      { initial: 26954, peak: 33486, closing: 29769, credited: 106 },
      { initial: 195802, peak: 234404, closing: 208386, credited: 740 },
      { initial: 77286, peak: 88865, closing: 79001, credited: 281 },
      { initial: 30528, peak: 33438, closing: 29726, credited: 56 },
      { initial: 215731, peak: 234404, closing: 208386, credited: 390 },
      { initial: 116197, peak: 123588, closing: 109870, credited: 206 },
      { initial: 30184, peak: 30326, closing: 29726, credited: 0 },
      { initial: 178333, peak: 181347, closing: 178573, credited: 0 },
      { initial: 85388, peak: 86186, closing: 85388, credited: 0 },
    ])
    expect(result.faRows.reduce((sum, row) => sum + Math.round(row.initialValueInr), 0)).toBe(2176069)
    expect(Math.round(result.fsi.foreignIncomeInr)).toBe(14116)
  })
})