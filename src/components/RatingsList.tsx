import { Stars } from './StarRating'
import { fmtDate, fmtStars } from '~/lib/format'
import type { RatingWithUser } from '~/lib/types'

export function RatingsList({ ratings, viewerId }: { ratings: RatingWithUser[]; viewerId: string }) {
  if (!ratings.length) return <p className="text-ink-soft italic">Ninguém avaliou este álbum ainda.</p>
  return (
    <ul className="divide-y divide-line">
      {ratings.map((r) => (
        <li key={r.id} className="py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <strong className="font-display text-lg">
              {r.profiles?.name ?? 'Usuário'}
              {r.user_id === viewerId && <span className="ml-1 text-sm font-normal text-ink-faint">(você)</span>}
            </strong>
            <Stars value={r.score} />
            <span className="num text-sm">{fmtStars(r.score)}</span>
            {r.should_be_in_list !== null && (
              <span className={`chip ${r.should_be_in_list ? '' : 'line-through'}`}>
                {r.should_be_in_list ? 'deveria estar' : 'não deveria'}
              </span>
            )}
            <span className="ml-auto font-mono text-xs text-ink-faint">{fmtDate(r.updated_at)}</span>
          </div>
          {r.comment && <p className="mt-2 whitespace-pre-line">{r.comment}</p>}
        </li>
      ))}
    </ul>
  )
}
