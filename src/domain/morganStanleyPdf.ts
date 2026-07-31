import { parseFidelityDate, type ParseResult } from './parse'
import type { AcquisitionLot } from './types'

export interface PdfTextCell {
  str: string
  x: number
  y: number
}

export type PdfTextRow = PdfTextCell[]

function parseMorganStanleyDate(value: string): string | null {
  const dayFirst = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim())
  if (dayFirst) {
    return parseFidelityDate(`${dayFirst[2]}-${dayFirst[1]}-${dayFirst[3]}`)
  }
  return parseFidelityDate(value)
}

function parseAmount(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number(value.replace(/[$,]/g, '').replace(/\s*USD\s*$/i, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function parseMorganStanleyHoldingRows(
  pdfRows: PdfTextRow[],
): ParseResult<AcquisitionLot> {
  const rows: AcquisitionLot[] = []
  const issues: ParseResult<AcquisitionLot>['issues'] = []
  let summaryFound = false

  for (const [index, pdfRow] of pdfRows.entries()) {
    const values = pdfRow.map((cell) => cell.str)
    const line = values.join(' ').replace(/\s+/g, ' ').trim()

    if (line.includes('Summary of MSFT Holdings')) {
      summaryFound = true
      continue
    }
    if (!summaryFound) {
      continue
    }
    if (line.startsWith('Activity for')) {
      break
    }
    if (values.length < 9 || !/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(values[0])) {
      continue
    }

    const acquiredDate = parseMorganStanleyDate(values[0])
    const costBasisUsd = parseAmount(values[4])
    const quantity = parseAmount(values[6])
    if (!acquiredDate || quantity === null || costBasisUsd === null) {
      issues.push({ row: index + 1, message: 'Could not parse the Morgan Stanley holding row.' })
      continue
    }
    if (quantity <= 0 || costBasisUsd < 0) {
      issues.push({
        row: index + 1,
        message: 'Quantity must be positive and cost basis cannot be negative.',
      })
      continue
    }

    rows.push({
      id: `morgan-pdf-${index + 1}`,
      acquiredDate,
      quantity,
      costBasisUsd,
      source: 'Morgan Stanley',
    })
  }

  if (!summaryFound) {
    issues.unshift({ row: 1, message: 'Could not find the Summary of MSFT Holdings section.' })
  } else if (rows.length === 0 && issues.length === 0) {
    issues.push({ row: 1, message: 'No recognizable Morgan Stanley holding rows were found.' })
  }

  return {
    rows: rows.sort((left, right) => left.acquiredDate.localeCompare(right.acquiredDate)),
    issues,
    broker: 'Morgan Stanley',
  }
}

async function extractPdfRows(file: File): Promise<PdfTextRow[]> {
  const [{ GlobalWorkerOptions, getDocument }, { default: workerSrc }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  GlobalWorkerOptions.workerSrc = workerSrc

  const pdf = await getDocument({ data: await file.arrayBuffer() }).promise
  const rows: PdfTextRow[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const cells = content.items.flatMap((item) => {
        if (!('str' in item) || !item.str.trim()) {
          return []
        }
        return [{
          str: item.str.trim(),
          x: item.transform[4],
          y: item.transform[5],
        }]
      })
      const pageRows = new Map<number, PdfTextCell[]>()

      cells.forEach((cell) => {
        const rowY = [...pageRows.keys()].find((value) => Math.abs(value - cell.y) < 2) ?? cell.y
        const row = pageRows.get(rowY) ?? []
        row.push(cell)
        pageRows.set(rowY, row)
      })

      rows.push(...[...pageRows.entries()]
        .sort(([leftY], [rightY]) => rightY - leftY)
        .map(([, row]) => row.sort((left, right) => left.x - right.x)))
    }
  } finally {
    await pdf.destroy()
  }

  return rows
}

export async function parseMorganStanleyHoldingsPdf(
  file: File,
): Promise<ParseResult<AcquisitionLot>> {
  try {
    return parseMorganStanleyHoldingRows(await extractPdfRows(file))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown PDF error'
    return {
      rows: [],
      issues: [{ row: 1, message: `Could not read the Morgan Stanley PDF: ${message}` }],
      broker: 'Morgan Stanley',
    }
  }
}