import { describe, expect, it } from 'vitest'
import {
  mergeLotsWithSales,
  parseOpenLotsCsv,
  parseSalesCsv,
  parseWithholdingCsv,
} from './parse'

const openLotsCsv = `Date acquired,Quantity,Cost basis,Cost basis/share,Value,Share source
Jul-15-2026,5.5030,2118.26,384.93,2508.65,DO
Mar-31-2025,5.1754,1748.51,337.85,2359.31,SP
,
The values are displayed in USD
`

describe('Fidelity CSV parsing', () => {
  it('parses open lots and ignores the Fidelity footer', () => {
    const result = parseOpenLotsCsv(openLotsCsv)

    expect(result.issues).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[1]).toMatchObject({
      acquiredDate: '2025-03-31',
      quantity: 5.1754,
      costBasisUsd: 1748.51,
      source: 'SP',
    })
  })

  it('merges closed quantities back into their acquisition lot', () => {
    const open = parseOpenLotsCsv(openLotsCsv).rows
    const sales = parseSalesCsv(`Date acquired,Date sold,Quantity,Cost basis,Proceeds
Mar-31-2025,Oct-01-2025,2.0000,675.70,1000.00
Dec-31-2024,Feb-10-2025,1.0000,400.00,450.00
`).rows

    expect(sales).toHaveLength(2)
    expect(mergeLotsWithSales(open, sales)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        acquiredDate: '2025-03-31',
        quantity: 7.1754,
        costBasisUsd: 2424.21,
      }),
      expect.objectContaining({ acquiredDate: '2024-12-31', quantity: 1, costBasisUsd: 400 }),
    ]))
  })

  it('parses actual withholding evidence', () => {
    const result = parseWithholdingCsv(`Payment date,Gross dividend,Tax withheld
Mar-12-2026,$37.83,$9.46
`)

    expect(result.issues).toEqual([])
    expect(result.rows).toEqual([
      { paymentDate: '2026-03-12', grossIncomeUsd: 37.83, taxWithheldUsd: 9.46 },
    ])
  })
})