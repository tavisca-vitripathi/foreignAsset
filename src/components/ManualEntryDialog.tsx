import { Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { AcquisitionLot, SaleTransaction, WithholdingRecord } from '../domain/types'

type EntryKind = 'lot' | 'sale' | 'withholding'

interface ManualEntryDialogProps {
  onClose: () => void
  onAddLot: (lot: AcquisitionLot) => void
  onAddSale: (sale: SaleTransaction) => void
  onAddWithholding: (record: WithholdingRecord) => void
}

function positiveNumber(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function textValue(data: FormData, name: string): string {
  return String(data.get(name) ?? '').trim()
}

export function ManualEntryDialog({
  onClose,
  onAddLot,
  onAddSale,
  onAddWithholding,
}: ManualEntryDialogProps) {
  const [kind, setKind] = useState<EntryKind>('lot')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const id = crypto.randomUUID()

    if (kind === 'lot') {
      const acquiredDate = textValue(data, 'acquiredDate')
      const quantity = positiveNumber(data.get('quantity'))
      const costBasisUsd = positiveNumber(data.get('costBasisUsd'))
      const source = textValue(data, 'source')
      if (!acquiredDate || quantity === null || quantity === 0 || costBasisUsd === null) {
        setError('Enter an acquisition date, positive quantity, and cost basis.')
        return
      }
      onAddLot({ id: `manual-lot-${id}`, acquiredDate, quantity, costBasisUsd, source })
    }

    if (kind === 'sale') {
      const acquiredDate = textValue(data, 'acquiredDate')
      const soldDate = textValue(data, 'soldDate')
      const quantity = positiveNumber(data.get('quantity'))
      const costBasisUsd = positiveNumber(data.get('costBasisUsd'))
      const proceedsUsd = positiveNumber(data.get('proceedsUsd'))
      if (!acquiredDate || !soldDate || quantity === null || quantity === 0 || costBasisUsd === null || proceedsUsd === null) {
        setError('Enter acquisition and sale dates, positive quantity, cost basis, and proceeds.')
        return
      }
      if (soldDate < acquiredDate) {
        setError('The sale date cannot be before the acquisition date.')
        return
      }
      onAddSale({ id: `manual-sale-${id}`, acquiredDate, soldDate, quantity, costBasisUsd, proceedsUsd })
    }

    if (kind === 'withholding') {
      const paymentDate = textValue(data, 'paymentDate')
      const grossIncomeUsd = positiveNumber(data.get('grossIncomeUsd'))
      const taxWithheldUsd = positiveNumber(data.get('taxWithheldUsd'))
      if (!paymentDate || grossIncomeUsd === null || taxWithheldUsd === null) {
        setError('Enter a payment date, gross dividend, and tax withheld.')
        return
      }
      onAddWithholding({ paymentDate, grossIncomeUsd, taxWithheldUsd })
    }

    onClose()
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="manual-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-entry-title">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Evidence correction</span>
            <h2 id="manual-entry-title">Add manual record</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Close manual entry">
            <X size={17} />
            <span className="sr-only">Close manual entry</span>
          </button>
        </div>

        <div className="kind-selector" aria-label="Manual record type">
          {([
            ['lot', 'Acquisition'],
            ['sale', 'Sale'],
            ['withholding', 'Tax withheld'],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              className={kind === value ? 'active' : ''}
              onClick={() => {
                setKind(value)
                setError(null)
              }}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <div className="dialog-fields">
            {(kind === 'lot' || kind === 'sale') && (
              <label>
                <span>Date acquired</span>
                <input className="text-input" type="date" name="acquiredDate" required />
              </label>
            )}
            {kind === 'sale' && (
              <label>
                <span>Date sold</span>
                <input className="text-input" type="date" name="soldDate" required />
              </label>
            )}
            {kind === 'withholding' && (
              <label>
                <span>Payment date</span>
                <input className="text-input" type="date" name="paymentDate" required />
              </label>
            )}
            {(kind === 'lot' || kind === 'sale') && (
              <label>
                <span>Quantity</span>
                <input className="text-input" type="number" name="quantity" min="0.0001" step="0.0001" required />
              </label>
            )}
            {(kind === 'lot' || kind === 'sale') && (
              <label>
                <span>Cost basis (USD)</span>
                <input className="text-input" type="number" name="costBasisUsd" min="0" step="0.01" required />
              </label>
            )}
            {kind === 'lot' && (
              <label>
                <span>Share source</span>
                <select className="text-input" name="source" defaultValue="DO">
                  <option value="DO">DO</option>
                  <option value="SP">SP</option>
                </select>
              </label>
            )}
            {kind === 'sale' && (
              <label>
                <span>Sale proceeds (USD)</span>
                <input className="text-input" type="number" name="proceedsUsd" min="0" step="0.01" required />
              </label>
            )}
            {kind === 'withholding' && (
              <>
                <label>
                  <span>Gross dividend (USD)</span>
                  <input className="text-input" type="number" name="grossIncomeUsd" min="0" step="0.01" required />
                </label>
                <label>
                  <span>Tax withheld (USD)</span>
                  <input className="text-input" type="number" name="taxWithheldUsd" min="0" step="0.01" required />
                </label>
              </>
            )}
          </div>
          {error && <p className="dialog-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit"><Plus size={16} /> Add record</button>
          </div>
        </form>
      </div>
    </div>
  )
}