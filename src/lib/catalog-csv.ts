// CSV de catálogo de um projeto: Artist, Title, Release Date, Run Time, Genre
// (também aceita cabeçalhos em português).
import { mapHeader, parseYear, readRows } from './csv'

export type CatalogAlbum = {
  artist: string
  title: string
  year: number | null
  run_time: string | null
  genre: string | null
}

export type CatalogParseResult = {
  albums: CatalogAlbum[]
  skipped: { line: number; reason: string }[]
  duplicates: number
  headerFound: boolean
}

const CATALOG_ALIASES = {
  artist: ['artist', 'artista', 'artists', 'artistas'],
  title: ['title', 'album', 'titulo', 'nome album', 'nome', 'nome do album'],
  year: ['release date', 'year', 'ano', 'released', 'release year', 'ano lancamento', 'data lancamento'],
  run_time: ['run time', 'runtime', 'duration', 'duracao', 'tempo'],
  genre: ['genre', 'genres', 'genero', 'generos'],
}

type Field = keyof typeof CATALOG_ALIASES
const DEFAULT_ORDER: Field[] = ['artist', 'title', 'year', 'run_time', 'genre']

export function parseCatalogCsv(text: string): CatalogParseResult {
  const rows = readRows(text)
  const result: CatalogParseResult = { albums: [], skipped: [], duplicates: 0, headerFound: false }
  if (rows.length === 0) return result

  let header = mapHeader(rows[0], CATALOG_ALIASES)
  let start = 1
  if (header.includes('artist') && header.includes('title')) {
    result.headerFound = true
  } else {
    // Sem cabeçalho reconhecível: assume a ordem do formato padrão.
    header = DEFAULT_ORDER
    start = 0
  }

  const genreForms = new Map<string, string>()
  const seen = new Set<string>()
  rows.slice(start).forEach((row, i) => {
    const line = i + start + 1
    const rec: Partial<Record<Field, string>> = {}
    header.forEach((field, col) => {
      if (field && col < row.length) rec[field] = row[col]
    })
    if (!rec.artist || !rec.title) {
      result.skipped.push({ line, reason: 'Artist e Title são obrigatórios' })
      return
    }
    let genre = rec.genre || null
    if (genre) {
      // Unifica variações de caixa ("hip Hop" -> "Hip Hop")
      const key = genre.toLowerCase()
      if (!genreForms.has(key)) genreForms.set(key, genre[0].toUpperCase() + genre.slice(1))
      genre = genreForms.get(key) ?? genre
    }
    const album: CatalogAlbum = {
      artist: rec.artist,
      title: rec.title,
      year: parseYear(rec.year),
      run_time: rec.run_time || null,
      genre,
    }
    const key = `${album.artist}\u0000${album.title}\u0000${album.year ?? ''}`
    if (seen.has(key)) {
      result.duplicates++
      return
    }
    seen.add(key)
    result.albums.push(album)
  })
  return result
}
