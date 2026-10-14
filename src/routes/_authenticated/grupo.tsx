import { Link, createFileRoute } from '@tanstack/react-router'
import { getGroupStats } from '~/server/stats.functions'
import { PageHeader } from '~/components/PageHeader'
import { ProjectTabs } from '~/components/ProjectTabs'
import { ProgressBar } from '~/components/ProgressBar'
import { Section, StatTile } from '~/components/StatTile'
import { GroupBreakdownTable } from '~/components/BreakdownTable'
import { AvgBarChart, DistributionChart } from '~/components/Charts'
import { RankList } from '~/components/RankList'
import { AlbumLinks } from '~/components/AlbumLinks'
import { currentProject, projectSearch } from '~/lib/search'
import { dimLabel, fmtDate, fmtNum, fmtPct } from '~/lib/format'
import { exportGroup } from '~/lib/exports'
import type { CategoryScore } from '~/lib/types'

export const Route = createFileRoute('/_authenticated/grupo')({
  validateSearch: projectSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getGroupStats({ data: { projectId: deps.projeto } }),
  head: () => ({ meta: [{ title: 'Estatísticas do grupo · 1001 Álbuns' }] }),
  component: Group,
})

function Group() {
  const { stats: s, rows } = Route.useLoaderData()
  const { projects } = Route.useRouteContext()
  const search = Route.useSearch()
  const project = currentProject(projects, search.projeto)
  const decadeChart = (s.breakdowns.decada ?? [])
    .filter((r) => r.key !== null)
    .map((r) => ({ label: dimLabel('decada', r.key), avg: r.avg === null ? null : Number(r.avg), n: r.n }))

  return (
    <div>
      <PageHeader eyebrow={project?.name} title="Estatísticas do grupo">
        <button className="btn btn-sm" onClick={() => exportGroup(s, rows, project?.name ?? 'projeto')}>Exportar CSV</button>
      </PageHeader>
      <ProjectTabs projects={projects} current={project?.id ?? null} />

      <ProgressBar done={s.drawn} total={s.total} label="Progresso da lista" />
      <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
        <StatTile label="Sorteados" value={s.drawn} hint={`de ${s.total} álbuns`} />
        <StatTile label="Notas dadas" value={s.votes} />
        <StatTile label="Média geral" value={fmtNum(s.avg)} />
        <StatTile label="“Deveria estar na lista”" value={fmtPct(s.should_be_in_list.pct)} hint={`${s.should_be_in_list.n} respostas`} />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Highlight label="Melhor década" c={s.best?.decada} dim="decada" />
        <Highlight label="Pior década" c={s.worst?.decada} dim="decada" />
        <Highlight label="Melhor gênero" c={s.best?.genero} dim="genero" />
        <Highlight label="Pior gênero" c={s.worst?.genero} dim="genero" />
      </div>

      <Section title="Distribuição das notas">
        <DistributionChart data={s.distribution} />
      </Section>

      <div className="grid gap-x-10 md:grid-cols-2">
        <Section title="Top 5" aside={<Link to="/grupo/ranking/$tipo" params={{ tipo: 'melhores' }} search={search}>Ver mais →</Link>}>
          <RankList rows={s.top} />
        </Section>
        <Section title="Bottom 5" aside={<Link to="/grupo/ranking/$tipo" params={{ tipo: 'piores' }} search={search}>Ver mais →</Link>}>
          <RankList rows={s.bottom} />
        </Section>
      </div>
      <Section
        title="Mais controversos"
        aside={<Link to="/grupo/ranking/$tipo" params={{ tipo: 'controversos' }} search={search}>Ver mais →</Link>}
      >
        <p className="-mt-2 mb-3 text-sm text-ink-soft">Maior desvio padrão entre as notas (mínimo de 2 votos).</p>
        <RankList rows={s.controversial} metric="std" />
      </Section>

      <Section title="Por década">
        <AvgBarChart rows={decadeChart} label="Média do grupo por década" />
        <div className="mt-6"><GroupBreakdownTable dim="decada" rows={s.breakdowns.decada ?? []} /></div>
      </Section>
      <div className="grid gap-x-10 md:grid-cols-2">
        <Section title="Por gênero"><GroupBreakdownTable dim="genero" rows={s.breakdowns.genero ?? []} /></Section>
        <Section title="Por país"><GroupBreakdownTable dim="pais" rows={s.breakdowns.pais ?? []} /></Section>
      </div>

      <Section title="Todos os sorteados">
        <div className="table-wrap max-h-[640px] overflow-y-auto">
          <table className="table">
            <thead className="sticky top-0 bg-paper">
              <tr>
                <th className="text-right">#</th>
                <th>Data</th>
                <th>Álbum</th>
                <th>Artista</th>
                <th className="text-right">Ano</th>
                <th>Gênero</th>
                <th>País</th>
                <th className="text-right">Média</th>
                <th className="text-right">Votos</th>
                <th className="text-right">σ</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.album_id}>
                  <td className="num text-right text-ink-faint">{r.ord}</td>
                  <td className="num text-xs whitespace-nowrap">{fmtDate(r.pick_date)}</td>
                  <td><Link to="/album/$albumId" params={{ albumId: String(r.album_id) }}>{r.title}</Link></td>
                  <td>{r.artist}</td>
                  <td className="num text-right">{r.year ?? '—'}</td>
                  <td className="text-sm">{r.genre ?? '—'}</td>
                  <td className="text-sm">{r.country ?? '—'}</td>
                  <td className="num text-right">{fmtNum(r.avg_score)}</td>
                  <td className="num text-right">{r.votes}</td>
                  <td className="num text-right">{fmtNum(r.std)}</td>
                  <td><AlbumLinks album={r} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

function Highlight({ label, c, dim }: { label: string; c: CategoryScore | undefined; dim: 'decada' | 'genero' }) {
  return (
    <StatTile
      label={label}
      value={<span className="font-display text-2xl">{c ? dimLabel(dim, c.key) : '—'}</span>}
      hint={c ? `média ${fmtNum(c.avg)} · ${c.n} álbuns` : 'sem dados'}
    />
  )
}
