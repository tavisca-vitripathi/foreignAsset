const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseIsoDate(value: string): Date {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Invalid ISO date: ${value}`)
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function addDays(value: string, days: number): string {
  const date = parseIsoDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatIsoDate(date)
}

export function previousMonthEnd(value: string): string {
  const date = parseIsoDate(value)
  return formatIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0)))
}

export function isBetween(value: string, start: string, end: string): boolean {
  return value >= start && value <= end
}