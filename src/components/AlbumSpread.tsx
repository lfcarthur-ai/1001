import type { ReactNode } from 'react'
import { AlbumCover } from './AlbumCover'
import { AlbumLinks } from './AlbumLinks'
import { Stars } from './StarRating'
import { fmtDate, fmtNum } from '~/lib/format'
import type { AlbumDetail } from '~/server/albums.functions'

/** Capa grande + ficha técnica, no estilo de contracapa. */
export function AlbumSpread({ detail, eyebrow, children }: { detail: AlbumDetail; eyebrow: ReactNode; children?: ReactNode }) {
  const { album, pick, ratings } = detail
  const scored = ratings.filter((r) => r.score !== null).map((r) => Number(r.score))
  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,460px)_1fr] md:gap-12">
      <div>
        <AlbumCover album={album} size="lg" />
      </div>
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-bold sm:text-6xl">{album.title}</h1>
        <p className="mt-2 font-display text-2xl italic text-rust-deep sm:text-3xl">{album.artist}</p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-ink py-4 sm:grid-cols-4">
          <Fact label="Ano" value={album.year ?? '—'} />
          <Fact label="Gênero" value={album.genre ?? '—'} />
          <Fact label="País" value={album.country ?? '—'} />
          <Fact label="Duração" value={album.run_time ?? '—'} />
          <Fact label="Faixa nº" value={pick.position} />
          <Fact label="Sorteado em" value={fmtDate(pick.pick_date)} />
          <Fact
            label="Média do grupo"
            value={
              <span className="inline-flex items-center gap-2">
                <span className="num">{fmtNum(avg)}</span>
                {avg !== null && <Stars value={Math.round(avg * 2) / 2} size={14} />}
              </span>
            }
          />
          <Fact label="Votos" value={scored.length} />
        </dl>
        <div className="mt-4">
          <AlbumLinks album={album} />
        </div>
        {children && <div className="mt-8">{children}</div>}
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow !text-[0.62rem]">{label}</dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  )
}
