import { describe, expect, it, vi } from 'vitest'
import { createEnricher, scoreReleaseGroup, type EnrichableAlbum } from '~/lib/enrich'
import { ratio, tokenSetRatio, tokenSortRatio } from '~/lib/fuzzy'

const album: EnrichableAlbum = {
  id: 1, artist: 'Radiohead', title: 'OK Computer', year: 1997, country: null, release_date: null,
  cover_url: null, wikipedia_url: null, rym_url: null, mb_release_group_id: null, enrich_attempts: 0,
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function mockFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/release-group/?')) {
      return json({
        'release-groups': [
          { id: 'wrong', title: 'OK Computer OKNOTOK', 'primary-type': 'Album', 'first-release-date': '2017', 'artist-credit': [{ name: 'Radiohead' }] },
          { id: 'rg1', title: 'OK Computer', 'primary-type': 'Album', 'first-release-date': '1997-05-21', 'artist-credit': [{ name: 'Radiohead', artist: { id: 'a1' } }] },
        ],
      })
    }
    if (url.includes('/artist/a1')) return json({ country: 'GB' })
    if (url.includes('/release-group/rg1?')) return json({ relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q213' } }] })
    if (url.includes('wikidata.org/wiki/Special:EntityData/Q213')) {
      return json({ entities: { Q213: { sitelinks: { ptwiki: { title: 'OK Computer' }, enwiki: { title: 'OK Computer' } } } } })
    }
    if (url.includes('coverartarchive.org') && init?.method === 'HEAD') return new Response(null, { status: 307 })
    return json({}, 404)
  })
}

describe('fuzzy', () => {
  it('se comporta como RapidFuzz nos casos básicos', () => {
    expect(ratio('abc', 'abc')).toBe(100)
    expect(Math.round(ratio('abcd', 'abce'))).toBe(75)
    expect(tokenSortRatio('computer ok', 'ok computer')).toBe(100)
    expect(tokenSetRatio('radiohead', 'radiohead thom yorke')).toBe(100)
  })
})

describe('enriquecimento', () => {
  it('escolhe o release-group certo', () => {
    const right = { id: 'x', title: 'OK Computer', 'primary-type': 'Album', 'first-release-date': '1997', 'artist-credit': [{ name: 'Radiohead' }] }
    const wrong = { ...right, title: 'Kid A', 'first-release-date': '2000' }
    expect(scoreReleaseGroup(album, right)).toBeGreaterThan(scoreReleaseGroup(album, wrong))
    expect(scoreReleaseGroup(album, right)).toBeGreaterThanOrEqual(70)
  })

  it('preenche capa, país, data e Wikipedia (pt) respeitando 1 req/s no MusicBrainz', async () => {
    const fetch = mockFetch()
    const waits: number[] = []
    const sleep = async (ms: number) => { waits.push(ms) }
    const patch = await createEnricher({ fetch: fetch as unknown as typeof globalThis.fetch, sleep, log: () => {} }).enrich(album)
    expect(patch).toMatchObject({
      mb_release_group_id: 'rg1',
      release_date: '1997-05-21',
      country: 'Reino Unido',
      wikipedia_url: 'https://pt.wikipedia.org/wiki/OK_Computer',
      cover_url: 'https://coverartarchive.org/release-group/rg1/front-500',
      rym_url: 'https://rateyourmusic.com/release/album/radiohead/ok-computer/',
      enrich_attempts: 1,
    })
    expect(patch.enriched_at).toBeTruthy()
    // 3 chamadas ao MusicBrainz → pelo menos 2 esperas entre elas
    const mbCalls = fetch.mock.calls.filter(([u]) => String(u).includes('musicbrainz.org')).length
    expect(mbCalls).toBe(3)
    expect(waits.length).toBeGreaterThanOrEqual(2)
    for (const w of waits) expect(w).toBeLessThanOrEqual(1100)
    const ua = (fetch.mock.calls[0][1]?.headers as Record<string, string>)['User-Agent']
    expect(ua).toBeTruthy()
  })

  it('não sobrescreve valores existentes e marca como concluído após 3 tentativas', async () => {
    const fetch = vi.fn(async () => json({}, 503))
    const patch = await createEnricher({ fetch: fetch as unknown as typeof globalThis.fetch, sleep: async () => {}, log: () => {} }).enrich({
      ...album,
      cover_url: 'https://x/cover.jpg',
      enrich_attempts: 2,
    })
    expect(patch.cover_url).toBeUndefined()
    expect(patch.enrich_attempts).toBe(3)
    expect(patch.enriched_at).toBeTruthy()
  })
})
