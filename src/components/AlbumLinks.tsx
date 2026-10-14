import { rymUrl, wikipediaSearchUrl } from '~/lib/enrich/rym'

type A = { artist: string; title: string; wikipedia_url: string | null; rym_url: string | null }

export function AlbumLinks({ album, compact = false }: { album: A; compact?: boolean }) {
  const wiki = album.wikipedia_url ?? wikipediaSearchUrl(album)
  const rym = album.rym_url ?? rymUrl(album)
  if (compact) {
    return (
      <span className="inline-flex gap-2 font-mono text-xs whitespace-nowrap">
        <a href={wiki} target="_blank" rel="noreferrer" title="Wikipedia">
          Wiki
        </a>
        <a href={rym} target="_blank" rel="noreferrer" title="RateYourMusic (reviews)">
          RYM
        </a>
      </span>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      <a className="btn btn-sm" href={wiki} target="_blank" rel="noreferrer">
        Wikipedia{album.wikipedia_url ? '' : ' (busca)'} ↗
      </a>
      <a className="btn btn-sm" href={rym} target="_blank" rel="noreferrer">
        RateYourMusic ↗
      </a>
    </div>
  )
}
