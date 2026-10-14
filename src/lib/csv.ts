import Papa from 'papaparse'
import { normalize } from './normalize'

/** Decodifica o arquivo tentando UTF-8 e caindo para Windows-1252 (CSV salvo pelo Excel). */
export function decodeCsv(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(data)
  }
}

/** Lê o CSV (separador `,`, `;` ou tab detectado automaticamente) em linhas de strings. */
export function readRows(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t'],
  })
  return result.data.map((row) => row.map((cell) => (cell ?? '').trim()))
}

/** Mapeia cada coluna do cabeçalho para um campo conhecido (ou null). */
export function mapHeader<F extends string>(header: string[], aliases: Record<F, string[]>): (F | null)[] {
  const seen = new Set<F>()
  return header.map((h) => {
    const n = normalize(h)
    const nNoPrep = n.replace(/\b(de|do|da)\b/g, ' ').replace(/\s+/g, ' ').trim()
    for (const field of Object.keys(aliases) as F[]) {
      if (seen.has(field)) continue
      if (aliases[field].includes(n) || aliases[field].includes(nNoPrep)) {
        seen.add(field)
        return field
      }
    }
    return null
  })
}

export function parseYear(value: string | null | undefined): number | null {
  const m = /(\d{4})/.exec(value ?? '')
  return m ? Number(m[1]) : null
}

/** Nota 0,5–5 (aceita vírgula); arredonda para a meia estrela mais próxima. */
export function parseRating(value: string | null | undefined): number | null {
  const s = (value ?? '').trim().replace(',', '.')
  if (!s) return null
  const v = Number(s)
  if (!Number.isFinite(v)) return null
  const half = Math.round(v * 2)
  if (half < 1 || half > 10) return null
  return half / 2
}

/** Aceita AAAA-MM-DD, DD/MM/AAAA, AAAA/MM/DD, DD-MM-AAAA e ISO com horário. Retorna AAAA-MM-DD. */
export function parseDate(value: string | null | undefined): string | null {
  const s = (value ?? '').trim()
  if (!s) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const valid = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s)
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s)
  if (m) {
    let [d, mo] = [Number(m[1]), Number(m[2])]
    const y = Number(m[3])
    if (mo > 12 && d <= 12) [d, mo] = [mo, d] // formato americano MM/DD/AAAA
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null
  }
  return null
}
