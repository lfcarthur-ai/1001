// Formatação em português (vírgula decimal, datas DD/MM/AAAA).

export function fmtNum(value: number | string | null | undefined, digits = 2): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(digits).replace('.', ',')
}

export function fmtStars(score: number | string | null | undefined): string {
  return fmtNum(score, 1)
}

export function fmtDelta(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const n = Number(value)
  return (n > 0 ? '+' : '') + fmtNum(n)
}

export function fmtPct(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(Number(value) * 100)}%`
}

/** AAAA-MM-DD (ou AAAA-MM / AAAA) → DD/MM/AAAA. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parts = value.slice(0, 10).split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  if (parts.length === 2) return `${parts[1]}/${parts[0]}`
  return value
}

export function decadeLabel(decade: number | string | null | undefined): string {
  if (decade === null || decade === undefined || decade === '') return 'Sem data'
  const d = Number(decade)
  return d >= 2000 ? `Anos ${d}` : `Anos ${String(d % 100).padStart(2, '0')}`
}

export type Dimension = 'decada' | 'genero' | 'pais' | 'ano'

export const DIMENSION_LABELS: Record<Dimension, string> = {
  decada: 'Década',
  genero: 'Gênero',
  pais: 'País de origem',
  ano: 'Ano',
}

export function dimLabel(dim: Dimension, key: string | null): string {
  if (key === null) return dim === 'decada' || dim === 'ano' ? 'Sem data' : 'Não informado'
  return dim === 'decada' ? decadeLabel(key) : key
}

export function albumLabel(a: { artist: string; title: string; year?: number | null }): string {
  return `${a.artist} — ${a.title}${a.year ? ` (${a.year})` : ''}`
}

/** Data de hoje no fuso de Brasília, AAAA-MM-DD. */
export function todayBrt(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function fmtLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}
