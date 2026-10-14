// CSV de histórico legado: Artist, Album, Released, Rating, Notes, Global Rating (ignorado),
// Origin (ignorado), Generated Date (data do sorteio).
import { mapHeader, parseDate, parseRating, parseYear, readRows } from './csv'

export type LegacyRow = {
  line: number
  artist: string
  album: string
  year: number | null
  score: number | null
  notes: string | null
  generated: string | null
}

const LEGACY_ALIASES = {
  artist: ['artist', 'artista'],
  album: ['album', 'title', 'titulo', 'nome album', 'nome do album'],
  year: ['released', 'release date', 'year', 'ano', 'ano lancamento'],
  rating: ['rating', 'nota', 'my rating'],
  notes: ['notes', 'notas', 'comentario', 'comment', 'review'],
  generated: ['generated date', 'generated', 'data sorteio', 'date'],
}

export class LegacyFormatError extends Error {}

export function parseLegacyCsv(text: string): LegacyRow[] {
  const rows = readRows(text)
  if (rows.length === 0) throw new LegacyFormatError('O arquivo está vazio.')
  const header = mapHeader(rows[0], LEGACY_ALIASES)
  if (!header.includes('artist') || !header.includes('album')) {
    throw new LegacyFormatError(
      'Cabeçalho não reconhecido. Esperado: Artist, Album, Released, Rating, Notes, Global Rating, Origin, Generated Date.',
    )
  }
  const out: LegacyRow[] = []
  rows.slice(1).forEach((row, i) => {
    const rec: Partial<Record<keyof typeof LEGACY_ALIASES, string>> = {}
    header.forEach((field, col) => {
      if (field && col < row.length) rec[field] = row[col]
    })
    if (!rec.artist && !rec.album) return
    out.push({
      line: i + 2,
      artist: rec.artist ?? '',
      album: rec.album ?? '',
      year: parseYear(rec.year),
      score: parseRating(rec.rating),
      notes: rec.notes || null,
      generated: parseDate(rec.generated),
    })
  })
  return out
}
