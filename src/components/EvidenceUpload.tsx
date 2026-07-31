import { Check, FileSpreadsheet, Upload, X } from 'lucide-react'
import type { ChangeEvent } from 'react'
import type { ParseIssue } from '../domain/parse'

interface EvidenceUploadProps {
  id: string
  label: string
  description: string
  filename: string | null
  count: number
  issues: ParseIssue[]
  required?: boolean
  onFile: (file: File) => void
  onClear: () => void
}

export function EvidenceUpload({
  id,
  label,
  description,
  filename,
  count,
  issues,
  required = false,
  onFile,
  onClear,
}: EvidenceUploadProps) {
  const hasData = filename !== null
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onFile(file)
    }
    event.target.value = ''
  }

  return (
    <div className={`evidence-item ${hasData ? 'is-complete' : ''}`}>
      <div className="evidence-icon" aria-hidden="true">
        {hasData ? <Check size={16} /> : <FileSpreadsheet size={16} />}
      </div>
      <div className="evidence-copy">
        <div className="evidence-label-row">
          <span className="evidence-label">{label}</span>
          {required && <span className="required-mark">Required</span>}
        </div>
        {hasData ? (
          <>
            <span className="evidence-filename" title={filename}>{filename}</span>
            <span className="evidence-meta">
              {count} {count === 1 ? 'record' : 'records'}
              {issues.length > 0 && ` · ${issues.length} skipped`}
            </span>
          </>
        ) : (
          <span className="evidence-description">{description}</span>
        )}
      </div>
      <div className="evidence-actions">
        <label className="icon-button compact" htmlFor={id} title={`Upload ${label}`}>
          <Upload size={16} />
          <span className="sr-only">Upload {label}</span>
        </label>
        <input
          id={id}
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          onChange={handleChange}
        />
        {hasData && (
          <button className="icon-button compact" type="button" onClick={onClear} title={`Clear ${label}`}>
            <X size={16} />
            <span className="sr-only">Clear {label}</span>
          </button>
        )}
      </div>
      {issues.length > 0 && (
        <details className="parse-issues">
          <summary>Review skipped rows</summary>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.row}-${index}`}>Row {issue.row}: {issue.message}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}