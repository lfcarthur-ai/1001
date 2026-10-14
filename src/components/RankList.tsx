import { Link } from '@tanstack/react-router'
import { AlbumCover } from './AlbumCover'
import { fmtNum } from '~/lib/format'
import type { RankingRow } from '~/lib/types'

export function RankList({ rows, metric = 'avg', start = 1 }: { rows: RankingRow[]; metric?: 'avg' | 'std'; start?: number }) {
  if (!rows.length) return <p className="text-ink-soft italic">Ainda sem votos suficientes.</p>
  return (
    <ol className="divide-y divide-line">
      {rows.map((r, i) => (
        <li key={r.album_id} className="flex items-center gap-3 py-2.5">
          <span className="num w-7 text-right text-lg text-rust">{String(start + i).padStart(2, '0')}</span>
          <AlbumCover album={r} size="xs" />
          <div className="min-w-0 flex-1">
            <Link to="/album/$albumId" params={{ albumId: String(r.album_id) }} className="block truncate font-display font-semibold text-ink no-underline hover:text-rust">
              {r.title}
            </Link>
            <p className="truncate text-sm text-ink-soft">{r.artist}{r.year ? ` · ${r.year}` : ''}</p>
          </div>
          <div className="text-right">
            <p className="num">{metric === 'std' ? `σ ${fmtNum(r.std)}` : fmtNum(r.avg_score)}</p>
            <p className="num text-xs text-ink-faint">
              {metric === 'std' ? `média ${fmtNum(r.avg_score)} · ` : ''}{r.votes} votos
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
