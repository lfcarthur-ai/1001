import { describe, expect, it } from 'vitest'
import { decadeLabel, fmtDate, fmtDelta, fmtNum, fmtPct, todayBrt } from '~/lib/format'
import { toCsv } from '~/lib/export-csv'
import { rymUrl } from '~/lib/enrich/rym'

describe('format', () => {
  it('números em pt-BR', () => {
    expect(fmtNum(3.456)).toBe('3,46')
    expect(fmtNum('4.5', 1)).toBe('4,5')
    expect(fmtNum(null)).toBe('—')
    expect(fmtDelta(0.5)).toBe('+0,50')
    expect(fmtDelta(-1)).toBe('-1,00')
    expect(fmtPct(0.756)).toBe('76%')
  })
  it('datas e décadas', () => {
    expect(fmtDate('2024-03-09')).toBe('09/03/2024')
    expect(fmtDate('2024-03-09T12:00:00Z')).toBe('09/03/2024')
    expect(decadeLabel(1970)).toBe('Anos 70')
    expect(decadeLabel(2010)).toBe('Anos 2010')
    expect(decadeLabel(null)).toBe('Sem data')
  })
  it('hoje em Brasília vira o dia à meia-noite de lá (03:00 UTC)', () => {
    expect(todayBrt(new Date('2026-10-14T02:59:00Z'))).toBe('2026-10-13')
    expect(todayBrt(new Date('2026-10-14T03:00:00Z'))).toBe('2026-10-14')
  })
})

describe('export CSV', () => {
  it('usa ";", vírgula decimal, BOM e escapa aspas', () => {
    const csv = toCsv(['A', 'B', 'C', 'D'], [['x;y', 4.5, true, null], ['diz "oi"', 3, false, undefined]])
    expect(csv).toBe('﻿A;B;C;D\r\n"x;y";4,5;sim;\r\n"diz ""oi""";3;não;\r\n')
  })
})

describe('RYM', () => {
  it('monta o link por slug', () => {
    expect(rymUrl({ artist: 'Sigur Rós', title: "( )" })).toBe('https://rateyourmusic.com/release/album/sigur-ros//')
    expect(rymUrl({ artist: 'Simon & Garfunkel', title: "Bridge Over Troubled Water" })).toBe(
      'https://rateyourmusic.com/release/album/simon-and-garfunkel/bridge-over-troubled-water/',
    )
  })
})
