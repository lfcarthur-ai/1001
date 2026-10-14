import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { decodeCsv, parseDate, parseRating, parseYear } from '~/lib/csv'
import { parseCatalogCsv } from '~/lib/catalog-csv'
import { LegacyFormatError, parseLegacyCsv } from '~/lib/legacy-csv'

describe('helpers', () => {
  it('parseRating aceita vírgula e arredonda para meia estrela', () => {
    expect(parseRating('4,5')).toBe(4.5)
    expect(parseRating('3.74')).toBe(3.5)
    expect(parseRating('0')).toBeNull()
    expect(parseRating('6')).toBeNull()
    expect(parseRating('abc')).toBeNull()
    expect(parseRating('')).toBeNull()
  })
  it('parseDate aceita vários formatos', () => {
    expect(parseDate('2024-01-05')).toBe('2024-01-05')
    expect(parseDate('05/01/2024')).toBe('2024-01-05')
    expect(parseDate('2024/1/5')).toBe('2024-01-05')
    expect(parseDate('12/31/2024')).toBe('2024-12-31')
    expect(parseDate('2024-01-05T10:00:00Z')).toBe('2024-01-05')
    expect(parseDate('31/02/2024')).toBeNull()
    expect(parseDate('ontem')).toBeNull()
  })
  it('parseYear extrai o ano', () => {
    expect(parseYear('1969-08-01')).toBe(1969)
    expect(parseYear('')).toBeNull()
  })
  it('decodeCsv cai para Windows-1252', () => {
    const latin1 = new Uint8Array([0x43, 0x61, 0x66, 0xe9]) // "Café" em cp1252
    expect(decodeCsv(latin1)).toBe('Café')
    expect(decodeCsv(new TextEncoder().encode('﻿ok'))).toBe('ok')
  })
})

describe('parseCatalogCsv', () => {
  it('lê o catálogo enviado (1089 álbuns)', () => {
    const r = parseCatalogCsv(decodeCsv(readFileSync('data/albums.csv')))
    expect(r.headerFound).toBe(true)
    expect(r.albums).toHaveLength(1089)
    expect(r.albums[0]).toEqual({ artist: '808 State', title: '90', year: 1989, run_time: '0:39:14', genre: 'Electronic' })
  })
  it('aceita cabeçalhos em português e ";"', () => {
    const r = parseCatalogCsv('Artista;Nome do Álbum;Ano de Lançamento;Duração;Gênero\nCaetano;Transa;1972;0:38:00;mpb\nGal;Fa-Tal;1971;;MPB\n')
    expect(r.albums).toEqual([
      { artist: 'Caetano', title: 'Transa', year: 1972, run_time: '0:38:00', genre: 'Mpb' },
      { artist: 'Gal', title: 'Fa-Tal', year: 1971, run_time: null, genre: 'Mpb' },
    ])
  })
  it('sem cabeçalho assume a ordem padrão; descarta duplicadas e inválidas', () => {
    const r = parseCatalogCsv('A,B,2000,1:00,Rock\nA,B,2000,1:00,Rock\n,Sem artista,2001,,\n')
    expect(r.headerFound).toBe(false)
    expect(r.albums).toHaveLength(1)
    expect(r.duplicates).toBe(1)
    expect(r.skipped).toEqual([{ line: 3, reason: 'Artist e Title são obrigatórios' }])
  })
})

describe('parseLegacyCsv', () => {
  it('lê o formato legado e ignora Global Rating/Origin', () => {
    const rows = parseLegacyCsv(
      'Artist,Album,Released,Rating,Notes,Global Rating,Origin,Generated Date\n' +
        'Radiohead,OK Computer,1997,"4,5","Obra, prima",4.3,UK,2024-01-10\n' +
        'Miles Davis,Kind of Blue,1959,,,4.4,US,11/01/2024\n',
    )
    expect(rows).toEqual([
      { line: 2, artist: 'Radiohead', album: 'OK Computer', year: 1997, score: 4.5, notes: 'Obra, prima', generated: '2024-01-10' },
      { line: 3, artist: 'Miles Davis', album: 'Kind of Blue', year: 1959, score: null, notes: null, generated: '2024-01-11' },
    ])
  })
  it('rejeita cabeçalho desconhecido', () => {
    expect(() => parseLegacyCsv('foo,bar\n1,2')).toThrow(LegacyFormatError)
  })
})
