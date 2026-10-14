// Exportação em CSV para abrir direto no Excel em português:
// separador ";", vírgula decimal, UTF-8 com BOM.

export type Cell = string | number | boolean | null | undefined

function cell(value: Cell): string {
  if (value === null || value === undefined) return ''
  let s: string
  if (typeof value === 'number') s = Number.isInteger(value) ? String(value) : String(value).replace('.', ',')
  else if (typeof value === 'boolean') s = value ? 'sim' : 'não'
  else s = value
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
}

/** Gera e baixa o arquivo no navegador. */
export function downloadCsv(filename: string, header: string[], rows: Cell[][]) {
  const blob = new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Converte números vindos do banco (string/numeric) para número com 2 casas. */
export function num(value: number | string | null | undefined, digits = 2): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null
}
