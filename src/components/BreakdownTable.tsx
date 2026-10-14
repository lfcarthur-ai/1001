import { useState } from 'react'
import { dimLabel, fmtDelta, fmtNum, type Dimension } from '~/lib/format'
import type { GroupBreakdownRow, UserBreakdownRow } from '~/lib/types'

const PREVIEW = 12

function deltaClass(v: unknown) {
  const n = Number(v)
  if (v === null || !Number.isFinite(n) || Math.abs(n) < 0.005) return ''
  return n > 0 ? 'text-olive' : 'text-rust-deep'
}

export function UserBreakdownTable({ dim, rows, mine = 'Minha média' }: { dim: Dimension; rows: UserBreakdownRow[]; mine?: string }) {
  const [all, setAll] = useState(false)
  if (!rows.length) return <p className="text-ink-soft italic">Sem avaliações ainda.</p>
  const shown = all ? rows : rows.slice(0, PREVIEW)
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{({ decada: 'Década', genero: 'Gênero', pais: 'País', ano: 'Ano' } as const)[dim]}</th>
              <th className="text-right">Álbuns</th>
              <th className="text-right">{mine}</th>
              <th className="text-right">Média do grupo</th>
              <th className="text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={String(r.key)}>
                <td>{dimLabel(dim, r.key)}</td>
                <td className="num text-right">{r.n}</td>
                <td className="num text-right">{fmtNum(r.user_avg)}</td>
                <td className="num text-right">{fmtNum(r.group_avg)}</td>
                <td className={`num text-right ${deltaClass(r.delta)}`}>{fmtDelta(r.delta === null ? null : Number(r.delta))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PREVIEW && (
        <button className="btn btn-sm btn-ghost mt-2" onClick={() => setAll((v) => !v)}>
          {all ? 'Ver menos' : `Ver todos (${rows.length})`}
        </button>
      )}
    </>
  )
}

export function GroupBreakdownTable({ dim, rows }: { dim: Dimension; rows: GroupBreakdownRow[] }) {
  const [all, setAll] = useState(false)
  if (!rows.length) return <p className="text-ink-soft italic">Sem avaliações ainda.</p>
  const shown = all ? rows : rows.slice(0, PREVIEW)
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{({ decada: 'Década', genero: 'Gênero', pais: 'País', ano: 'Ano' } as const)[dim]}</th>
              <th className="text-right">Álbuns</th>
              <th className="text-right">Votos</th>
              <th className="text-right">Média</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={String(r.key)}>
                <td>{dimLabel(dim, r.key)}</td>
                <td className="num text-right">{r.n}</td>
                <td className="num text-right">{r.votes}</td>
                <td className="num text-right">{fmtNum(r.avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PREVIEW && (
        <button className="btn btn-sm btn-ghost mt-2" onClick={() => setAll((v) => !v)}>
          {all ? 'Ver menos' : `Ver todos (${rows.length})`}
        </button>
      )}
    </>
  )
}
