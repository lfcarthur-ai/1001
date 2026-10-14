import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { getHistory } from '~/server/stats.functions'
import { PageHeader } from '~/components/PageHeader'
import { ProjectTabs } from '~/components/ProjectTabs'
import { ProgressBar } from '~/components/ProgressBar'
import { UserPicker } from '~/components/UserPicker'
import { AlbumCover } from '~/components/AlbumCover'
import { AlbumLinks } from '~/components/AlbumLinks'
import { Stars } from '~/components/StarRating'
import { currentProject, numParam, strParam } from '~/lib/search'
import { decadeLabel, fmtDate, fmtNum, fmtStars } from '~/lib/format'
import { exportHistory } from '~/lib/exports'

type Search = { projeto?: number; usuario?: string; genero?: string; decada?: number; nota?: string }

export const Route = createFileRoute('/_authenticated/historico')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    projeto: numParam(s.projeto),
    usuario: strParam(s.usuario),
    genero: strParam(s.genero),
    decada: s.decada === undefined ? undefined : Number(s.decada),
    nota: strParam(s.nota),
  }),
  loaderDeps: ({ search }) => ({ projeto: search.projeto, usuario: search.usuario }),
  loader: ({ deps }) => getHistory({ data: { projectId: deps.projeto, userId: deps.usuario } }),
  head: () => ({ meta: [{ title: 'Histórico · 1001 Álbuns' }] }),
  component: History,
})

const splitGenres = (g: string | null) => (g ?? '').split(/[;,]/).map((x) => x.trim()).filter(Boolean)

function History() {
  const { rows, userId, users } = Route.useLoaderData()
  const { viewer, projects } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const project = currentProject(projects, search.projeto)
  const userName = users.find((u) => u.id === userId)?.name ?? ''
  const isMe = userId === viewer.id

  const genres = useMemo(() => [...new Set(rows.flatMap((r) => splitGenres(r.genre)))].sort((a, b) => a.localeCompare(b, 'pt')), [rows])
  const decades = useMemo(() => [...new Set(rows.map((r) => r.decade).filter((d) => d !== null))].sort() as number[], [rows])

  const filtered = rows.filter((r) => {
    if (search.genero && !splitGenres(r.genre).includes(search.genero)) return false
    if (search.decada !== undefined && r.decade !== search.decada) return false
    if (search.nota === 'sem') return r.my_score === null
    if (search.nota) return r.my_score !== null && Number(r.my_score) === Number(search.nota)
    return true
  })

  const setFilter = (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  const exportCsv = () => exportHistory(filtered, userName, project?.name ?? 'projeto')

  return (
    <div>
      <PageHeader eyebrow={project?.status === 'closed' ? `${project.name} · encerrado` : project?.name} title="Histórico">
        <button className="btn btn-sm" onClick={exportCsv} disabled={!filtered.length}>
          Exportar CSV
        </button>
      </PageHeader>
      <ProjectTabs projects={projects} current={project?.id ?? null} />

      <div className="mb-6 grid gap-6 md:grid-cols-[2fr_3fr] md:items-end">
        <ProgressBar
          done={rows.filter((r) => r.my_score !== null).length}
          total={rows.length}
          label={isMe ? 'Avaliados por você' : `Avaliados por ${userName}`}
        />
        <div className="flex flex-wrap items-end gap-3 md:justify-end">
          <UserPicker users={users} current={userId} viewerId={viewer.id} />
          <label className="flex items-center gap-2">
            <span className="eyebrow">Gênero</span>
            <select className="select !w-auto !py-1 text-sm" value={search.genero ?? ''} onChange={(e) => setFilter({ genero: e.target.value || undefined })}>
              <option value="">Todos</option>
              {genres.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="eyebrow">Década</span>
            <select
              className="select !w-auto !py-1 text-sm"
              value={search.decada ?? ''}
              onChange={(e) => setFilter({ decada: e.target.value === '' ? undefined : Number(e.target.value) })}
            >
              <option value="">Todas</option>
              {decades.map((d) => <option key={d} value={d}>{decadeLabel(d)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="eyebrow">Nota</span>
            <select className="select !w-auto !py-1 text-sm" value={search.nota ?? ''} onChange={(e) => setFilter({ nota: e.target.value || undefined })}>
              <option value="">Todas</option>
              <option value="sem">Sem nota</option>
              {Array.from({ length: 10 }, (_, i) => (10 - i) / 2).map((v) => (
                <option key={v} value={String(v)}>{fmtStars(v)} ★</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-ink-soft italic">
          {rows.length ? 'Nenhum álbum com esses filtros.' : 'Nenhum álbum sorteado neste projeto ainda.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="text-right">#</th>
                <th>Data</th>
                <th><span className="sr-only">Capa</span></th>
                <th>Álbum</th>
                <th>Artista</th>
                <th>{isMe ? 'Minha nota' : `Nota de ${userName}`}</th>
                <th className="text-right">Média</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.album_id}>
                  <td className="num text-right text-ink-faint">{r.ord}</td>
                  <td className="num whitespace-nowrap text-xs">
                    {fmtDate(r.pick_date)}
                    {r.source === 'importacao' && <span className="ml-1 text-ink-faint" title="Importado do histórico legado">·i</span>}
                  </td>
                  <td><AlbumCover album={r} size="xs" /></td>
                  <td className="min-w-48">
                    <Link to="/album/$albumId" params={{ albumId: String(r.album_id) }} className="font-display font-semibold text-ink no-underline hover:text-rust">
                      {r.title}
                    </Link>
                    <span className="ml-1 text-xs text-ink-faint">{r.year}</span>
                  </td>
                  <td className="min-w-36">{r.artist}</td>
                  <td className="whitespace-nowrap">
                    {r.my_score !== null ? (
                      <span className="inline-flex items-center gap-1.5"><Stars value={r.my_score} size={13} /><span className="num text-xs">{fmtStars(r.my_score)}</span></span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="num text-right whitespace-nowrap">
                    {fmtNum(r.avg_score)} <span className="text-xs text-ink-faint">({r.votes})</span>
                  </td>
                  <td><AlbumLinks album={r} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-right font-mono text-xs text-ink-faint">{filtered.length} de {rows.length} álbuns</p>
    </div>
  )
}
