import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMemo, useState } from 'react'
import { activateProject, deleteDraftProject, getProjectPreview } from '~/server/admin.functions'
import { StatTile } from '~/components/StatTile'
import { AlbumCover } from '~/components/AlbumCover'
import { decadeLabel, fmtDate } from '~/lib/format'

export const Route = createFileRoute('/_authenticated/admin/projetos/$id')({
  loader: ({ params }) => getProjectPreview({ data: { projectId: Number(params.id) } }),
  component: ProjectPreview,
})

function ProjectPreview() {
  const { project, albums, picks } = Route.useLoaderData()
  const { projects } = Route.useRouteContext()
  const router = useRouter()
  const navigate = useNavigate()
  const activate = useServerFn(activateProject)
  const discard = useServerFn(deleteDraftProject)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')
  const current = projects.find((p) => p.status === 'active')

  const stats = useMemo(() => {
    const genres = new Map<string, number>()
    const decades = new Map<number, number>()
    for (const a of albums) {
      for (const g of (a.genre ?? '').split(/[;,]/).map((x) => x.trim()).filter(Boolean)) genres.set(g, (genres.get(g) ?? 0) + 1)
      if (a.year) decades.set(Math.floor(a.year / 10) * 10, (decades.get(Math.floor(a.year / 10) * 10) ?? 0) + 1)
    }
    return {
      genres: [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      decades: [...decades.entries()].sort((a, b) => a[0] - b[0]),
      noYear: albums.filter((a) => !a.year).length,
    }
  }, [albums])

  const shown = filter
    ? albums.filter((a) => `${a.artist} ${a.title}`.toLowerCase().includes(filter.toLowerCase()))
    : albums

  async function onActivate() {
    const msg = current
      ? `Ativar “${project.name}”? O projeto “${current.name}” será encerrado e não terá mais sorteios (as avaliações continuam visíveis).`
      : `Ativar “${project.name}”?`
    if (!confirm(msg)) return
    setBusy(true)
    try {
      await activate({ data: { projectId: project.id } })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ativar.')
    } finally {
      setBusy(false)
    }
  }

  async function onDiscard() {
    if (!confirm(`Descartar o rascunho “${project.name}”? Isso não pode ser desfeito.`)) return
    setBusy(true)
    try {
      await discard({ data: { projectId: project.id } })
      await router.invalidate()
      await navigate({ to: '/admin/projetos' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao descartar.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/admin/projetos" className="text-sm">← Projetos</Link>
          <h1 className="mt-1 text-4xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-ink-soft">
            {project.status === 'draft' && 'Rascunho — visível só para o administrador.'}
            {project.status === 'active' && `Ativo desde ${fmtDate(project.activated_at)}.`}
            {project.status === 'closed' && `Encerrado em ${fmtDate(project.closed_at)}.`}
          </p>
        </div>
        {project.status === 'draft' && (
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={onDiscard} disabled={busy}>Descartar</button>
            <button className="btn btn-primary" onClick={onActivate} disabled={busy}>Ativar projeto</button>
          </div>
        )}
      </div>
      {error && <p className="flash-error">{error}</p>}

      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <StatTile label="Álbuns" value={albums.length} />
        <StatTile label="Sorteados" value={picks} />
        <StatTile label="Sem ano" value={stats.noYear} />
        <StatTile label="Com capa" value={albums.filter((a) => a.cover_url).length} />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="eyebrow mb-2">Décadas</h2>
          <ul className="flex flex-wrap gap-2">
            {stats.decades.map(([d, c]) => (
              <li key={d} className="chip">{decadeLabel(d)} · {c}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="eyebrow mb-2">Gêneros mais frequentes</h2>
          <ul className="flex flex-wrap gap-2">
            {stats.genres.map(([g, c]) => (
              <li key={g} className="chip">{g} · {c}</li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <input className="input max-w-sm" placeholder="Filtrar por artista ou álbum…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="table-wrap mt-3 max-h-[600px] overflow-y-auto">
          <table className="table">
            <thead className="sticky top-0 bg-paper">
              <tr>
                <th className="text-right">#</th>
                <th><span className="sr-only">Capa</span></th>
                <th>Artista</th>
                <th>Álbum</th>
                <th className="text-right">Ano</th>
                <th>Duração</th>
                <th>Gênero</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td className="num text-right text-ink-faint">{a.position}</td>
                  <td><AlbumCover album={a} size="xs" /></td>
                  <td>{a.artist}</td>
                  <td>{a.title}</td>
                  <td className="num text-right">{a.year ?? '—'}</td>
                  <td className="num text-xs">{a.run_time ?? '—'}</td>
                  <td className="text-sm">{a.genre ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
