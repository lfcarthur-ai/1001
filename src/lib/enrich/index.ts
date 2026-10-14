// Enriquecimento dos álbuns via APIs públicas e gratuitas (somente servidor):
// - MusicBrainz: release-group, data de lançamento, país do artista e links (máx. 1 req/s)
// - Cover Art Archive: capa
// - Wikidata / Wikipedia: link do artigo (prefere pt.wikipedia; busca na Wikipedia como fallback)
// - RateYourMusic: link montado por slug
import { normalize } from '../normalize'
import { ratio, tokenSetRatio, tokenSortRatio } from '../fuzzy'
import { countryName } from './countries'
import { rymUrl } from './rym'

export const MAX_ATTEMPTS = 3
const MB_BASE = 'https://musicbrainz.org/ws/2'
const CAA_BASE = 'https://coverartarchive.org'
const MB_INTERVAL_MS = 1100
const TIMEOUT_MS = 12000

export type EnrichableAlbum = {
  id: number
  artist: string
  title: string
  year: number | null
  country: string | null
  release_date: string | null
  cover_url: string | null
  wikipedia_url: string | null
  rym_url: string | null
  mb_release_group_id: string | null
  enrich_attempts: number
}

export type EnrichPatch = Partial<Omit<EnrichableAlbum, 'id'>> & { enriched_at?: string | null }

type ReleaseGroup = {
  id: string
  title?: string
  'primary-type'?: string
  'first-release-date'?: string
  'artist-credit'?: { name?: string; artist?: { id?: string; name?: string } }[]
}

export type EnricherOptions = {
  fetch?: typeof fetch
  userAgent?: string
  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
}

export function createEnricher(opts: EnricherOptions = {}) {
  const doFetch = opts.fetch ?? fetch
  const userAgent = opts.userAgent ?? process.env.ENRICH_USER_AGENT ?? '1001AlbunsClube/1.0'
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const log = opts.log ?? ((msg: string) => console.warn(msg))
  let mbQueue: Promise<unknown> = Promise.resolve()
  let mbLast = 0

  async function get(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      return await doFetch(url, {
        ...init,
        signal: controller.signal,
        headers: { 'User-Agent': userAgent, Accept: 'application/json', ...(init.headers ?? {}) },
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async function getJson<T>(url: string): Promise<T> {
    const res = await get(url)
    if (!res.ok) throw new Error(`${res.status} em ${url}`)
    return (await res.json()) as T
  }

  /** GET no MusicBrainz, serializado e espaçado em ≥ 1,1 s. */
  function mb<T>(path: string, params: Record<string, string>): Promise<T> {
    const run = async () => {
      const wait = mbLast + MB_INTERVAL_MS - Date.now()
      if (wait > 0) await sleep(wait)
      try {
        const qs = new URLSearchParams({ ...params, fmt: 'json' })
        return await getJson<T>(`${MB_BASE}/${path}?${qs}`)
      } finally {
        mbLast = Date.now()
      }
    }
    const p = mbQueue.then(run, run)
    mbQueue = p.catch(() => undefined)
    return p
  }

  async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn()
    } catch (err) {
      log(`Enriquecimento: ${label} falhou: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  async function findReleaseGroup(album: EnrichableAlbum): Promise<ReleaseGroup | null> {
    const q = `releasegroup:"${luceneEscape(album.title)}" AND artist:"${luceneEscape(album.artist)}"`
    let data = await mb<{ 'release-groups'?: ReleaseGroup[] }>('release-group/', { query: q, limit: '10' })
    let groups = data['release-groups'] ?? []
    if (!groups.length) {
      data = await mb('release-group/', { query: `${album.title} ${album.artist}`, limit: '10' })
      groups = data['release-groups'] ?? []
    }
    let best: ReleaseGroup | null = null
    let bestScore = 0
    for (const rg of groups) {
      const sc = scoreReleaseGroup(album, rg)
      if (sc > bestScore) [best, bestScore] = [rg, sc]
    }
    return bestScore >= 70 ? best : null
  }

  async function artistCountry(artistId: string): Promise<string | null> {
    const data = await mb<{ country?: string; area?: { name?: string; 'iso-3166-1-codes'?: string[] } }>(
      `artist/${artistId}`,
      {},
    )
    if (data.country) return countryName(data.country)
    const codes = data.area?.['iso-3166-1-codes'] ?? []
    if (codes.length) return countryName(codes[0])
    return data.area?.name ?? null
  }

  async function wikipediaFromWikidata(qid: string): Promise<string | null> {
    const data = await getJson<{ entities?: Record<string, { sitelinks?: Record<string, { title: string }> }> }>(
      `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
    )
    const sitelinks = data.entities?.[qid]?.sitelinks ?? {}
    for (const [site, host] of [
      ['ptwiki', 'pt.wikipedia.org'],
      ['enwiki', 'en.wikipedia.org'],
    ] as const) {
      const link = sitelinks[site]
      if (link) return `https://${host}/wiki/${encodeURIComponent(link.title.replace(/ /g, '_'))}`
    }
    return null
  }

  async function wikipediaSearch(album: EnrichableAlbum): Promise<string | null> {
    const qs = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: `intitle:"${album.title}" ${album.artist} album`,
      format: 'json',
      srlimit: '5',
      origin: '*',
    })
    const data = await getJson<{ query?: { search?: { title: string }[] } }>(`https://en.wikipedia.org/w/api.php?${qs}`)
    const target = normalize(album.title)
    for (const hit of data.query?.search ?? []) {
      const base = normalize(hit.title.replace(/\(.*?\)/g, ''))
      if (base === target || ratio(base, target) >= 90) {
        return `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`
      }
    }
    return null
  }

  async function coverArt(mbid: string): Promise<string | null> {
    const url = `${CAA_BASE}/release-group/${mbid}/front-500`
    const res = await get(url, { method: 'HEAD', redirect: 'manual' })
    return [200, 301, 302, 307, 308].includes(res.status) ? url : null
  }

  /** Calcula o que preencher. Nunca sobrescreve valores existentes. */
  async function enrich(album: EnrichableAlbum): Promise<EnrichPatch> {
    const cur = { ...album }
    const patch: EnrichPatch = { enrich_attempts: (album.enrich_attempts ?? 0) + 1 }
    const set = <K extends keyof EnrichPatch>(key: K, value: EnrichPatch[K] | null) => {
      if (value) {
        patch[key] = value
        ;(cur as Record<string, unknown>)[key] = value
      }
    }
    if (!cur.rym_url) set('rym_url', rymUrl(album))

    const rg = await safe('MusicBrainz', () => findReleaseGroup(album))
    if (rg) {
      set('mb_release_group_id', rg.id)
      if (!cur.release_date) set('release_date', rg['first-release-date'] ?? null)
      const artistId = rg['artist-credit']?.[0]?.artist?.id
      if (!cur.country && artistId) set('country', await safe('país do artista', () => artistCountry(artistId)))
      if (!cur.wikipedia_url) {
        const details = await safe('links do MusicBrainz', () =>
          mb<{ relations?: { type?: string; url?: { resource?: string } }[] }>(`release-group/${rg.id}`, {
            inc: 'url-rels',
          }),
        )
        for (const rel of details?.relations ?? []) {
          const target = rel.url?.resource ?? ''
          if (rel.type === 'wikidata' && target.includes('/wiki/Q')) {
            const qid = target.split('/').pop() ?? ''
            set('wikipedia_url', await safe('Wikidata', () => wikipediaFromWikidata(qid)))
          } else if (rel.type === 'wikipedia' && !cur.wikipedia_url) {
            set('wikipedia_url', target)
          }
          if (cur.wikipedia_url) break
        }
      }
      if (!cur.cover_url) set('cover_url', await safe('Cover Art Archive', () => coverArt(rg.id)))
    }
    if (!cur.wikipedia_url) set('wikipedia_url', await safe('busca na Wikipedia', () => wikipediaSearch(album)))

    const complete = Boolean(cur.cover_url && cur.wikipedia_url && cur.country)
    if (complete || (patch.enrich_attempts ?? 0) >= MAX_ATTEMPTS) patch.enriched_at = new Date().toISOString()
    return patch
  }

  return { enrich, findReleaseGroup }
}

export function luceneEscape(s: string): string {
  return s.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, '\\$1')
}

export function scoreReleaseGroup(album: { artist: string; title: string; year: number | null }, rg: ReleaseGroup): number {
  const titleScore = tokenSortRatio(normalize(album.title), normalize(rg.title ?? ''))
  const credit = (rg['artist-credit'] ?? []).map((c) => c.name || c.artist?.name || '').join(' ')
  const artistScore = tokenSetRatio(normalize(album.artist), normalize(credit))
  let score = 0.55 * titleScore + 0.45 * artistScore
  const date = rg['first-release-date'] ?? ''
  if (album.year && /^\d{4}/.test(date)) score -= Math.min(Math.abs(Number(date.slice(0, 4)) - album.year), 5) * 2
  if (rg['primary-type'] === 'Album') score += 3
  return score
}
