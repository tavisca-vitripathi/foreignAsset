import { describe, expect, it, vi } from 'vitest'
import {
  parseMorganStanleyHoldingRows,
  parseMorganStanleyHoldingsPdf,
  type PdfTextRow,
} from './morganStanleyPdf'
import {
  mergeLotsWithSales,
  parseOpenLotsCsv,
  parseSalesCsv,
  parseWithholdingCsv,
} from './parse'

vi.mock('pdfjs-dist', () => import('pdfjs-dist/legacy/build/pdf.mjs'))

const openLotsCsv = `Date acquired,Quantity,Cost basis,Cost basis/share,Value,Share source
Jul-15-2026,5.5030,2118.26,384.93,2508.65,DO
Mar-31-2025,5.1754,1748.51,337.85,2359.31,SP
,
The values are displayed in USD
`

function pdfRow(...values: string[]): PdfTextRow {
  return values.map((str, index) => ({ str, x: index * 100, y: 100 }))
}

function buildTextPdf(textItems: Array<{ text: string; x: number; y: number }>): string {
  const stream = [
    'BT',
    '/F1 10 Tf',
    ...textItems.flatMap(({ text, x, y }) => [
      `1 0 0 1 ${x} ${y} Tm`,
      `(${text.replace(/([\\()])/g, '\\$1')}) Tj`,
    ]),
    'ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  const offsets = [0]
  let pdf = '%PDF-1.4\n'

  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return pdf
}

describe('Fidelity and Morgan Stanley CSV parsing', () => {
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

  it('parses the Morgan Stanley holdings table headers after its summary row', () => {
    const result = parseOpenLotsCsv(`Summary of MSFT Holdings,,,,,,,,
Acquisition Date,Lot,Capital Gain Impact,Adjusted Gain/Loss,Adjusted Cost Basis *,Adjusted Cost Basis Per Share *,Total Shares You Hold,Current Price per Share,Current Value
Type of Money: MSFT,,,,,,,,
03/31/2025,1,--,--,"$1,748.51","$337.85",5.1754,$480.00,"$2,484.19"
`)

    expect(result.broker).toBe('Morgan Stanley')
    expect(result.issues).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      acquiredDate: '2025-03-31',
      quantity: 5.1754,
      costBasisUsd: 1748.51,
      source: 'Morgan Stanley',
    })
  })

  it('combines Fidelity CSV lots with Morgan Stanley PDF holdings', () => {
    const fidelity = parseOpenLotsCsv(openLotsCsv)
    const morganStanley = parseMorganStanleyHoldingRows([
      pdfRow('Portfolio overview'),
      pdfRow('Summary of MSFT Holdings'),
      pdfRow(
        '31-Dec-2024',
        '1',
        '--',
        '--',
        '$1,200.00 USD',
        '$300.00',
        '4.0000',
        '$480.00',
        '$1,920.00',
      ),
      pdfRow('Activity for MSFT'),
      pdfRow(
        '01-Jan-2024',
        '2',
        '--',
        '--',
        '$999.00 USD',
        '$999.00',
        '1.0000',
        '$480.00',
        '$480.00',
      ),
    ])

    expect(morganStanley.issues).toEqual([])
    expect(morganStanley.rows[0]).toMatchObject({
      acquiredDate: '2024-12-31',
      quantity: 4,
      costBasisUsd: 1200,
      source: 'Morgan Stanley',
    })
    expect(mergeLotsWithSales([...fidelity.rows, ...morganStanley.rows], [])).toHaveLength(3)
  })

  it('extracts Morgan Stanley holdings from a text PDF', async () => {
    const { WorkerMessageHandler } = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    Object.assign(globalThis, { pdfjsWorker: { WorkerMessageHandler } })
    const columns = [
      '31-Dec-2024',
      '1',
      '--',
      '--',
      '$1,200.00 USD',
      '$300.00',
      '4.0000',
      '$480.00',
      '$1,920.00',
    ]
    const pdf = buildTextPdf([
      { text: 'Summary of MSFT Holdings', x: 40, y: 750 },
      ...columns.map((text, index) => ({ text, x: 40 + (index * 100), y: 700 })),
      { text: 'Activity for MSFT', x: 40, y: 650 },
    ])
    const file = new File([pdf], 'morgan-stanley-holdings.pdf', { type: 'application/pdf' })

    const result = await parseMorganStanleyHoldingsPdf(file)

    expect(result.issues).toEqual([])
    expect(result.rows).toEqual([
      expect.objectContaining({
        acquiredDate: '2024-12-31',
        quantity: 4,
        costBasisUsd: 1200,
        source: 'Morgan Stanley',
      }),
    ])
  })

  it('parses Morgan Stanley sales and withholding evidence', () => {
    const sales = parseSalesCsv(`Acquisition Date,Trade Date,Quantity Sold,Total Cost,Net Proceeds,Plan Type
03/31/2025,10/01/2025,2,"$675.70","$1,000.00",RSU
`)
    const withholding = parseWithholdingCsv(`Pay Date,Gross Amount,Tax Amount
03/12/2026,$37.83,$9.46
`)

    expect(sales.broker).toBe('Morgan Stanley')
    expect(sales.issues).toEqual([])
    expect(sales.rows[0]).toMatchObject({
      acquiredDate: '2025-03-31',
      soldDate: '2025-10-01',
      quantity: 2,
      costBasisUsd: 675.7,
      proceedsUsd: 1000,
      source: 'RSU',
    })
    expect(withholding.broker).toBe('Morgan Stanley')
    expect(withholding.issues).toEqual([])
    expect(withholding.rows).toEqual([
      { paymentDate: '2026-03-12', grossIncomeUsd: 37.83, taxWithheldUsd: 9.46 },
    ])
  })
})