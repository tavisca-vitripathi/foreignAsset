import type { ReferencePack, ReportResult } from '../domain/types'

export type ReportSection = 'fa' | 'fsi' | 'tr' | 'audit'
type Cell = string | number | null

interface Sheet {
  name: string
  rows: Cell[][]
}

function rounded(value: number | null): number | string {
  return value === null ? 'Pending tax rate' : Math.round(value)
}

function faRows(report: ReportResult, pack: ReferencePack): Cell[][] {
  const header: Cell[] = [
    'Country Name and Code',
    'Name of Entity',
    'Address of Entity',
    'Zip Code',
    'Nature of Entity',
    'Date of Acquiring the Interest',
    'Initial Value of Investment (INR)',
    'Peak Value During the Period (INR)',
    'Closing Balance (INR)',
    'Total Gross Amount Paid/Credited (INR)',
    'Total Gross Proceeds from Sale/Redemption (INR)',
  ]
  return [
    header,
    ...report.faRows.map((row) => [
      `${pack.entity.countryCode} - ${pack.entity.countryName}`,
      pack.entity.name,
      pack.entity.address,
      pack.entity.zipCode,
      pack.entity.nature,
      row.acquiredDate,
      rounded(row.initialValueInr),
      rounded(row.peakValueInr),
      rounded(row.closingValueInr),
      rounded(row.grossCreditedInr),
      rounded(row.saleProceedsInr),
    ]),
  ]
}

function fsiRows(report: ReportResult): Cell[][] {
  return [[
    'Country',
    'Taxpayer Identification Number',
    'Head of Income',
    'Income from Outside India (INR)',
    'Tax Paid Outside India (INR)',
    'Tax Payable Under Normal Provisions (INR)',
    'Relevant Article of DTAA',
    'Foreign Tax Source',
  ], [
    report.fsi.country,
    report.fsi.taxpayerId || 'Not provided',
    report.fsi.headOfIncome,
    rounded(report.fsi.foreignIncomeInr),
    rounded(report.fsi.foreignTaxPaidInr),
    rounded(report.fsi.indianTaxInr),
    report.fsi.dtaaArticle,
    report.fsi.foreignTaxSource,
  ]]
}

function trRows(report: ReportResult): Cell[][] {
  return [[
    'Country',
    'Taxpayer Identification Number',
    'Total Taxes Paid Outside India (INR)',
    'Total Tax Relief Available (INR)',
    'Tax Relief Claimed Under Section',
  ], [
    report.tr.country,
    report.tr.taxpayerId || 'Not provided',
    rounded(report.tr.foreignTaxPaidInr),
    rounded(report.tr.reliefAvailableInr),
    report.tr.section,
  ]]
}

function auditRows(report: ReportResult): Cell[][] {
  const rows: Cell[][] = [['Lot', 'Field', 'Formula', 'Inputs', 'Exact Value (INR)']]
  report.faRows.forEach((row) => {
    Object.entries(row.audit).forEach(([field, audit]) => {
      rows.push([
        row.acquiredDate,
        field,
        audit.formula,
        JSON.stringify(audit.inputs),
        audit.exactValue,
      ])
    })
  })
  report.warnings.forEach((warning) => {
    rows.push(['Warning', warning.code, warning.message, warning.severity, null])
  })
  return rows
}

function rowsFor(section: ReportSection, report: ReportResult, pack: ReferencePack): Cell[][] {
  if (section === 'fa') return faRows(report, pack)
  if (section === 'fsi') return fsiRows(report)
  if (section === 'tr') return trRows(report)
  return auditRows(report)
}

function csvCell(value: Cell): string {
  const text = value === null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCsv(
  section: ReportSection,
  report: ReportResult,
  pack: ReferencePack,
): string {
  return rowsFor(section, report, pack)
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')
}

function xmlEscape(value: Cell): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function worksheetXml(sheet: Sheet): string {
  const rows = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((value) => {
      const type = typeof value === 'number' ? 'Number' : 'String'
      const style = rowIndex === 0 ? ' ss:StyleID="Header"' : ''
      return `<Cell${style}><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`
    }).join('')
    return `<Row>${cells}</Row>`
  }).join('')
  return `<Worksheet ss:Name="${xmlEscape(sheet.name)}"><Table>${rows}</Table></Worksheet>`
}

export function buildWorkbookXml(report: ReportResult, pack: ReferencePack): string {
  const sheets: Sheet[] = [
    { name: 'Schedule FA A3', rows: faRows(report, pack) },
    { name: 'Schedule FSI', rows: fsiRows(report) },
    { name: 'Schedule TR', rows: trRows(report) },
    { name: 'Calculation Audit', rows: auditRows(report) },
  ]
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DDEBE3" ss:Pattern="Solid"/></Style></Styles>` +
    sheets.map(worksheetXml).join('') +
    `</Workbook>`
}

export function downloadText(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}