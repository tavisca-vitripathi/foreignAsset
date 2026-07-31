import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  Download,
  FileDown,
  FileSpreadsheet,
  Info,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Printer,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import './App.css'
import './workbench.css'
import { EvidenceUpload } from './components/EvidenceUpload'
import { ManualEntryDialog } from './components/ManualEntryDialog'
import referencePackData from './data/ay-2026-27.json'
import { sampleOpenLots } from './data/sample'
import { calculateReports } from './domain/calculate'
import {
  mergeLotsWithSales,
  parseOpenLotsCsv,
  parseSalesCsv,
  parseWithholdingCsv,
  type ParseIssue,
} from './domain/parse'
import type {
  AcquisitionLot,
  ReferencePack,
  SaleTransaction,
  ScheduleFaRow,
  WithholdingRecord,
} from './domain/types'
import {
  buildCsv,
  buildWorkbookXml,
  downloadText,
  type ReportSection,
} from './lib/export'

const referencePack = referencePackData as ReferencePack

type ReportTab = ReportSection

interface EvidenceState<T> {
  filename: string | null
  rows: T[]
  issues: ParseIssue[]
}

const EMPTY_EVIDENCE = { filename: null, rows: [], issues: [] }
const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
const DECIMAL = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

function formatInr(value: number | null): string {
  return value === null ? 'Pending' : INR.format(Math.round(value))
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

type MoneyField = keyof Pick<
  ScheduleFaRow,
  'initialValueInr' | 'peakValueInr' | 'closingValueInr' | 'grossCreditedInr' | 'saleProceedsInr'
>

function sum(rows: ScheduleFaRow[], field: MoneyField): number {
  return rows.reduce((total, row) => total + Math.round(row[field]), 0)
}

function App() {
  const [openLots, setOpenLots] = useState<EvidenceState<AcquisitionLot>>({
    filename: 'Verified Fidelity sample.csv',
    rows: sampleOpenLots,
    issues: [],
  })
  const [sales, setSales] = useState<EvidenceState<SaleTransaction>>(EMPTY_EVIDENCE)
  const [withholding, setWithholding] = useState<EvidenceState<WithholdingRecord>>(EMPTY_EVIDENCE)
  const [salesConfirmed, setSalesConfirmed] = useState(false)
  const [withholdingConfirmed, setWithholdingConfirmed] = useState(false)
  const [manualLots, setManualLots] = useState<AcquisitionLot[]>([])
  const [manualSales, setManualSales] = useState<SaleTransaction[]>([])
  const [manualWithholding, setManualWithholding] = useState<WithholdingRecord[]>([])
  const [manualDialogOpen, setManualDialogOpen] = useState(false)
  const [taxpayerId, setTaxpayerId] = useState('')
  const [averageTaxRate, setAverageTaxRate] = useState('')
  const [activeTab, setActiveTab] = useState<ReportTab>('fa')
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null)
  const [railOpen, setRailOpen] = useState(() => window.innerWidth > 820)
  const [notice, setNotice] = useState<string | null>(null)

  const allSales = [...sales.rows, ...manualSales]
  const allWithholding = [...withholding.rows, ...manualWithholding]
  const lots = mergeLotsWithSales([...openLots.rows, ...manualLots], allSales)
  const parsedTaxRate = Number(averageTaxRate)
  const averageIndianTaxRate = averageTaxRate !== '' && Number.isFinite(parsedTaxRate)
    ? parsedTaxRate / 100
    : null
  const report = calculateReports({
    lots,
    sales: allSales,
    withholding: allWithholding,
    salesConfirmed: sales.filename !== null || manualSales.length > 0 || salesConfirmed,
    withholdingConfirmed: withholding.filename !== null || manualWithholding.length > 0 || withholdingConfirmed,
    averageIndianTaxRate,
    taxpayerId: taxpayerId.trim(),
  }, referencePack)
  const selectedRow = report.faRows.find((row) => row.lotId === selectedLotId) ?? null
  const completedEvidence = [
    openLots.filename !== null && openLots.rows.length > 0,
    sales.filename !== null || manualSales.length > 0 || salesConfirmed,
    withholding.filename !== null || manualWithholding.length > 0 || withholdingConfirmed,
    averageIndianTaxRate !== null,
  ].filter(Boolean).length

  const readFile = async <T,>(
    file: File,
    parser: (text: string) => { rows: T[]; issues: ParseIssue[] },
    setter: (value: EvidenceState<T>) => void,
  ) => {
    try {
      const parsed = parser(await file.text())
      setter({ filename: file.name, ...parsed })
      setNotice(`${file.name}: ${parsed.rows.length} records loaded locally.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Could not read ${file.name}.`)
    }
  }

  const restoreSample = () => {
    setOpenLots({ filename: 'Verified Fidelity sample.csv', rows: sampleOpenLots, issues: [] })
    setSales(EMPTY_EVIDENCE)
    setWithholding(EMPTY_EVIDENCE)
    setSalesConfirmed(false)
    setWithholdingConfirmed(false)
    setManualLots([])
    setManualSales([])
    setManualWithholding([])
    setTaxpayerId('')
    setAverageTaxRate('')
    setSelectedLotId(null)
    setNotice('Verified sample restored.')
  }

  const exportCsv = () => {
    downloadText(
      `schedule-${activeTab}-ay-${referencePack.assessmentYear}.csv`,
      buildCsv(activeTab, report, referencePack),
      'text/csv;charset=utf-8',
    )
  }

  const exportWorkbook = () => {
    downloadText(
      `foreign-assets-ay-${referencePack.assessmentYear}.xml`,
      buildWorkbookXml(report, referencePack),
      'application/vnd.ms-excel;charset=utf-8',
    )
  }

  return (
    <div className={`app-shell ${railOpen ? '' : 'rail-collapsed'}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">FA</div>
          <div>
            <strong>Foreign Asset Workbench</strong>
            <span>Fidelity / Microsoft equity</span>
          </div>
        </div>
        <div className="topbar-center">
          <span className="status-dot" aria-hidden="true" />
          AY {referencePack.assessmentYear}
          <span className="topbar-separator" />
          <span>{referencePack.id}</span>
        </div>
        <div className="topbar-actions">
          <span className="privacy-chip"><LockKeyhole size={14} /> Browser only</span>
          <button className="icon-button" type="button" onClick={restoreSample} title="Restore verified sample">
            <RotateCcw size={17} />
            <span className="sr-only">Restore verified sample</span>
          </button>
          <button className="primary-button" type="button" onClick={exportWorkbook} title="Export Excel-compatible workbook">
            <FileSpreadsheet size={16} /> Export workbook
          </button>
        </div>
      </header>

      <aside className="evidence-rail" aria-label="Evidence inputs" aria-hidden={!railOpen}>
        <div className="rail-heading">
          <div>
            <span className="eyebrow">Evidence</span>
            <h2>Source files</h2>
          </div>
          <span className="completion-count">{completedEvidence}/4</span>
        </div>
        <div className="completion-track" aria-label={`${completedEvidence} of 4 evidence steps complete`}>
          <span style={{ width: `${completedEvidence * 25}%` }} />
        </div>

        <div className="evidence-list">
          <EvidenceUpload
            id="open-lots-file"
            label="Open lots"
            description="Fidelity View open lots CSV"
            filename={openLots.filename}
            count={openLots.rows.length}
            issues={openLots.issues}
            required
            onFile={(file) => void readFile(file, parseOpenLotsCsv, setOpenLots)}
            onClear={() => setOpenLots(EMPTY_EVIDENCE)}
          />
          <EvidenceUpload
            id="sales-file"
            label="Sold lots"
            description="Realized gain/loss or transaction CSV"
            filename={sales.filename}
            count={sales.rows.length}
            issues={sales.issues}
            onFile={(file) => {
              setSalesConfirmed(false)
              void readFile(file, parseSalesCsv, setSales)
            }}
            onClear={() => setSales(EMPTY_EVIDENCE)}
          />
          {sales.filename === null && (
            <label className="confirmation-row">
              <input
                type="checkbox"
                checked={salesConfirmed}
                onChange={(event) => setSalesConfirmed(event.target.checked)}
              />
              <span>Statement confirms no sales</span>
            </label>
          )}
          <EvidenceUpload
            id="withholding-file"
            label="Dividend tax"
            description="Dividend and withholding CSV"
            filename={withholding.filename}
            count={withholding.rows.length}
            issues={withholding.issues}
            onFile={(file) => {
              setWithholdingConfirmed(false)
              void readFile(file, parseWithholdingCsv, setWithholding)
            }}
            onClear={() => setWithholding(EMPTY_EVIDENCE)}
          />
          {withholding.filename === null && (
            <label className="confirmation-row">
              <input
                type="checkbox"
                checked={withholdingConfirmed}
                onChange={(event) => setWithholdingConfirmed(event.target.checked)}
              />
              <span>Statement confirms no withholding</span>
            </label>
          )}
        </div>

        <div className="manual-records">
          <div className="manual-records-heading">
            <div>
              <span className="eyebrow">Corrections</span>
              <strong>{manualLots.length + manualSales.length + manualWithholding.length} manual records</strong>
            </div>
            <button className="icon-button compact" type="button" onClick={() => setManualDialogOpen(true)} title="Add manual record">
              <PencilLine size={15} />
              <span className="sr-only">Add manual record</span>
            </button>
          </div>
          {(manualLots.length + manualSales.length + manualWithholding.length) > 0 ? (
            <div className="manual-record-summary">
              <span>{manualLots.length} acquisitions</span>
              <span>{manualSales.length} sales</span>
              <span>{manualWithholding.length} tax rows</span>
              <button
                type="button"
                onClick={() => {
                  setManualLots([])
                  setManualSales([])
                  setManualWithholding([])
                  setNotice('Manual corrections cleared.')
                }}
              >
                <Trash2 size={13} /> Clear
              </button>
            </div>
          ) : (
            <button className="manual-add-button" type="button" onClick={() => setManualDialogOpen(true)}>
              Add a missing lot, sale, or withholding record
            </button>
          )}
        </div>

        <div className="rail-section">
          <span className="eyebrow">Tax profile</span>
          <label className="field-label" htmlFor="taxpayer-id">Passport / foreign TIN</label>
          <input
            id="taxpayer-id"
            className="text-input"
            value={taxpayerId}
            onChange={(event) => setTaxpayerId(event.target.value)}
            placeholder="Held only in this tab"
            autoComplete="off"
          />
          <label className="field-label" htmlFor="tax-rate">Average Indian tax rate</label>
          <div className="percent-input">
            <input
              id="tax-rate"
              className="text-input"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={averageTaxRate}
              onChange={(event) => setAverageTaxRate(event.target.value)}
              placeholder="For FTC relief"
            />
            <span>%</span>
          </div>
        </div>

        <div className="reference-note">
          <ShieldCheck size={17} />
          <div>
            <strong>Reference pack locked</strong>
            <span>{Object.keys(referencePack.rates).length.toLocaleString('en-IN')} rates / {Object.keys(referencePack.dailyPricesUsd).length} prices</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <button
          className="rail-toggle icon-button"
          type="button"
          onClick={() => setRailOpen((value) => !value)}
          title={railOpen ? 'Collapse evidence panel' : 'Open evidence panel'}
        >
          {railOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          <span className="sr-only">{railOpen ? 'Collapse evidence panel' : 'Open evidence panel'}</span>
        </button>

        {notice && (
          <div className="toast" role="status">
            <CheckCircle2 size={16} /> {notice}
            <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}

        <section className="workspace-heading">
          <div>
            <span className="eyebrow">Assessment year {referencePack.assessmentYear}</span>
            <h1>Foreign asset schedules</h1>
            <p>Review calculated filing values, trace every rate, and export only when the evidence is complete.</p>
          </div>
          <div className="heading-actions">
            <button className="secondary-button" type="button" onClick={exportCsv}>
              <Download size={16} /> CSV
            </button>
            <button className="secondary-button" type="button" onClick={() => window.print()}>
              <Printer size={16} /> Print / PDF
            </button>
          </div>
        </section>

        <section className="metric-strip" aria-label="Report summary">
          <div><span>Reportable lots</span><strong>{report.faRows.length}</strong><small>Calendar year 2025</small></div>
          <div><span>Peak foreign assets</span><strong>{formatInr(sum(report.faRows, 'peakValueInr'))}</strong><small>Sum of per-lot peaks</small></div>
          <div><span>FY foreign income</span><strong>{formatInr(report.fsi.foreignIncomeInr)}</strong><small>Apr 2025 - Mar 2026</small></div>
          <div>
            <span>FTC evidence</span>
            <strong className={report.fsi.foreignTaxSource === 'actual' ? 'metric-good' : 'metric-warning'}>
              {report.fsi.foreignTaxSource === 'actual' ? 'Actual' : 'Estimated'}
            </strong>
            <small>{formatInr(report.fsi.foreignTaxPaidInr)}</small>
          </div>
        </section>

        {report.warnings.length > 0 && (
          <section className="warning-stack" aria-label="Completeness warnings">
            {report.warnings.map((warning) => (
              <div className="warning-row" key={warning.code}>
                <AlertTriangle size={17} />
                <div><strong>{warning.code.replace(/_/g, ' ')}</strong><span>{warning.message}</span></div>
              </div>
            ))}
          </section>
        )}

        <div className="report-toolbar">
          <div className="tabs" role="tablist" aria-label="Report schedules">
            {([
              ['fa', 'Schedule FA / A3'],
              ['fsi', 'Schedule FSI'],
              ['tr', 'Schedule TR'],
              ['audit', 'Calculation audit'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                className={activeTab === id ? 'active' : ''}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="rounding-note"><Info size={14} /> Portal values round to whole rupees</span>
        </div>

        <section className="report-surface">
          {activeTab === 'fa' && (
            <ScheduleFaTable
              rows={report.faRows}
              selectedLotId={selectedLotId}
              onSelect={(lotId) => setSelectedLotId((current) => current === lotId ? null : lotId)}
            />
          )}
          {activeTab === 'fsi' && (
            <div className="schedule-panel">
              <div className="schedule-heading">
                <div><span className="schedule-code">FSI</span><h2>Income from outside India</h2></div>
                <span className={`source-badge ${report.fsi.foreignTaxSource}`}>{report.fsi.foreignTaxSource}</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Country</th><th>Foreign TIN</th><th>Head</th><th className="number">Foreign income</th><th className="number">Foreign tax</th><th className="number">Indian tax</th><th>DTAA</th></tr></thead>
                  <tbody><tr>
                    <td>{report.fsi.country}</td>
                    <td>{report.fsi.taxpayerId || <span className="missing-value">Not provided</span>}</td>
                    <td>{report.fsi.headOfIncome}</td>
                    <td className="number strong-number">{formatInr(report.fsi.foreignIncomeInr)}</td>
                    <td className="number">{formatInr(report.fsi.foreignTaxPaidInr)}</td>
                    <td className="number">{formatInr(report.fsi.indianTaxInr)}</td>
                    <td>{report.fsi.dtaaArticle}</td>
                  </tr></tbody>
                </table>
              </div>
              <div className="schedule-footnote"><Info size={15} /> Income includes Microsoft dividends with record dates from 1 Apr 2025 through 31 Mar 2026. Match actual withholding to Form 67 evidence.</div>
            </div>
          )}
          {activeTab === 'tr' && (
            <div className="schedule-panel">
              <div className="schedule-heading"><div><span className="schedule-code">TR</span><h2>Foreign tax relief</h2></div></div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Country</th><th>Foreign TIN</th><th className="number">Tax paid abroad</th><th className="number">Relief available</th><th>Section</th></tr></thead>
                  <tbody><tr>
                    <td>{report.tr.country}</td>
                    <td>{report.tr.taxpayerId || <span className="missing-value">Not provided</span>}</td>
                    <td className="number strong-number">{formatInr(report.tr.foreignTaxPaidInr)}</td>
                    <td className="number">{formatInr(report.tr.reliefAvailableInr)}</td>
                    <td>{report.tr.section}</td>
                  </tr></tbody>
                </table>
              </div>
              <div className="formula-callout">
                <BookOpenCheck size={18} />
                <div><strong>Relief is capped</strong><span>Lower of tax paid abroad and Indian tax attributable to the same income. Enter your average Indian tax rate to resolve this field.</span></div>
              </div>
            </div>
          )}
          {activeTab === 'audit' && <AuditView rows={report.faRows} provenance={referencePack.provenance} />}
        </section>

        {activeTab === 'fa' && selectedRow && (
          <aside className="audit-drawer" aria-label={`Audit for ${selectedRow.acquiredDate}`}>
            <div className="audit-drawer-heading">
              <div><span className="eyebrow">Calculation trace</span><h2>{formatDate(selectedRow.acquiredDate)} lot</h2></div>
              <button className="icon-button" type="button" onClick={() => setSelectedLotId(null)} title="Close calculation trace">x</button>
            </div>
            {Object.entries(selectedRow.audit).map(([field, audit]) => (
              <div className="audit-line" key={field}>
                <span>{field}</span>
                <strong>{formatInr(audit.exactValue)}</strong>
                <code>{audit.formula}</code>
                <dl>{Object.entries(audit.inputs).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
              </div>
            ))}
          </aside>
        )}
      </main>

      {manualDialogOpen && (
        <ManualEntryDialog
          onClose={() => setManualDialogOpen(false)}
          onAddLot={(lot) => {
            setManualLots((rows) => [...rows, lot])
            setNotice('Manual acquisition added.')
          }}
          onAddSale={(sale) => {
            setManualSales((rows) => [...rows, sale])
            setSalesConfirmed(false)
            setNotice('Manual sale added.')
          }}
          onAddWithholding={(record) => {
            setManualWithholding((rows) => [...rows, record])
            setWithholdingConfirmed(false)
            setNotice('Manual withholding added.')
          }}
        />
      )}
    </div>
  )
}

interface ScheduleFaTableProps {
  rows: ScheduleFaRow[]
  selectedLotId: string | null
  onSelect: (lotId: string) => void
}

function ScheduleFaTable({ rows, selectedLotId, onSelect }: ScheduleFaTableProps) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <FileDown size={28} />
        <h2>Upload Fidelity open lots</h2>
        <p>The Schedule FA table appears after a recognizable CSV is loaded.</p>
      </div>
    )
  }

  return (
    <div className="schedule-panel">
      <div className="schedule-heading">
        <div><span className="schedule-code">A3</span><h2>Foreign equity interests</h2></div>
        <span>{rows.length} acquisition lots</span>
      </div>
      <div className="table-scroll">
        <table className="fa-table">
          <thead><tr><th>Date acquired</th><th className="number">Initial value</th><th className="number">Peak value</th><th>Peak date</th><th className="number">Closing value</th><th className="number">Gross credited</th><th className="number">Sale proceeds</th><th><span className="sr-only">Audit</span></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.lotId} className={selectedLotId === row.lotId ? 'selected' : ''}>
                <td><strong>{formatDate(row.acquiredDate)}</strong><span className="cell-sub">Microsoft Corp.</span></td>
                <td className="number">{formatInr(row.initialValueInr)}</td>
                <td className="number strong-number">{formatInr(row.peakValueInr)}</td>
                <td>{row.peakDate ? formatDate(row.peakDate) : '-'}</td>
                <td className="number">{formatInr(row.closingValueInr)}</td>
                <td className="number">{formatInr(row.grossCreditedInr)}</td>
                <td className="number">{formatInr(row.saleProceedsInr)}</td>
                <td><button className="row-audit-button" type="button" onClick={() => onSelect(row.lotId)} title="Inspect calculation"><ChevronDown size={16} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="number">{formatInr(sum(rows, 'initialValueInr'))}</td><td className="number">{formatInr(sum(rows, 'peakValueInr'))}</td><td>-</td><td className="number">{formatInr(sum(rows, 'closingValueInr'))}</td><td className="number">{formatInr(sum(rows, 'grossCreditedInr'))}</td><td className="number">{formatInr(sum(rows, 'saleProceedsInr'))}</td><td /></tr></tfoot>
        </table>
      </div>
      <div className="schedule-footnote"><Info size={15} /> Row amounts are calculated at full precision and displayed rounded. The exact gross-credit total for the sample is INR 2,115.52, displayed as INR 2,116.</div>
    </div>
  )
}

function AuditView({ rows, provenance }: { rows: ScheduleFaRow[]; provenance: string[] }) {
  return (
    <div className="audit-view">
      <div className="schedule-heading"><div><span className="schedule-code">LOG</span><h2>Calculation audit</h2></div><span>Exact values retained</span></div>
      <div className="audit-grid">
        {rows.map((row) => (
          <details key={row.lotId} className="audit-group">
            <summary><span>{formatDate(row.acquiredDate)}</span><strong>{formatInr(row.peakValueInr)} peak</strong><ChevronDown size={16} /></summary>
            <div className="audit-group-body">
              {Object.entries(row.audit).map(([field, audit]) => (
                <div className="audit-entry" key={field}>
                  <div><span>{field}</span><strong>{DECIMAL.format(audit.exactValue)}</strong></div>
                  <code>{audit.formula}</code>
                  <p>{Object.entries(audit.inputs).map(([key, value]) => `${key}: ${value}`).join(' / ')}</p>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
      <div className="provenance-block"><h3>Reference provenance</h3>{provenance.map((item) => <p key={item}>{item}</p>)}</div>
    </div>
  )
}

export default App