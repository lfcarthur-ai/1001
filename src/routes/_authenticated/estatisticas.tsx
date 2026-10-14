import { Link, createFileRoute } from '@tanstack/react-router'
import { getUserStats } from '~/server/stats.functions'
import { PageHeader } from '~/components/PageHeader'
import { ProjectTabs } from '~/components/ProjectTabs'
import { UserPicker } from '~/components/UserPicker'
import { Section, StatTile } from '~/components/StatTile'
import { UserBreakdownTable } from '~/components/BreakdownTable'
import { CompareBarChart, YearLineChart } from '~/components/Charts'
import { AlbumCover } from '~/components/AlbumCover'
import { currentProject, numParam, strParam } from '~/lib/search'
import { dimLabel, fmtDelta, fmtNum, fmtPct, fmtStars, type Dimension } from '~/lib/format'
import { exportUserStats } from '~/lib/exports'
import type { Outlier, UserBreakdownRow } from '~/lib/types'

export const Route = createFileRoute('/_authenticated/estatisticas')({
  validateSearch: (s: Record<string, unknown>): { projeto?: number; usuario?: string } => ({
    projeto: numParam(s.projeto),
    usuario: strParam(s.usuario),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getUserStats({ data: { projectId: deps.projeto, userId: deps.usuario } }),
  head: () => ({ meta: [{ title: 'Minhas estatísticas · 1001 Álbuns' }] }),
  component: MyStats,
})

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function MyStats() {
  const { stats: s, userId, users } = Route.useLoaderData()
  const { viewer, projects } = Route.useRouteContext()
  const search = Route.useSearch()
  const project = currentProject(projects, search.projeto)
  const isMe = userId === viewer.id
  const who = isMe ? 'você' : (users.find((u) => u.id === userId)?.name ?? '')
  const mine = isMe ? 'Minha média' : `Média de ${who}`
  const b = s.breakdowns
  const diff = s.summary.user_avg !== null && s.summary.group_avg_same !== null ? n(s.summary.user_avg)! - n(s.summary.group_avg_same)! : null

  const chartRows = (rows: UserBreakdownRow[] | undefined, dim: Dimension) =>
    (rows ?? []).filter((r) => r.key !== null).map((r) => ({ label: dimLabel(dim, r.key), user: n(r.user_avg), group: n(r.group_avg) }))

  return (
    <div>
      <PageHeader eyebrow={project?.name} title={isMe ? 'Minhas estatísticas' : `Estatísticas de ${who}`}>
        <button className="btn btn-sm" onClick={() => exportUserStats(s, who, project?.name ?? 'projeto')}>Exportar CSV</button>
      </PageHeader>
      <ProjectTabs projects={projects} current={project?.id ?? null} />
      <div className="mb-8 flex justify-end">
        <UserPicker users={users} current={userId} viewerId={viewer.id} />
      </div>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
        <StatTile label="Avaliados" value={`${s.summary.rated}`} hint={`de ${s.summary.drawn} sorteados`} />
        <StatTile label={mine} value={fmtNum(s.summary.user_avg)} />
        <StatTile label="Grupo nos mesmos álbuns" value={fmtNum(s.summary.group_avg_same)} hint={`geral: ${fmtNum(s.summary.group_avg)}`} />
        <StatTile label="Diferença" value={fmtDelta(diff)} hint={diff === null ? undefined : diff >= 0 ? 'mais generoso que o grupo' : 'mais exigente que o grupo'} />
        <StatTile
          label="“Deveria estar na lista”"
          value={fmtPct(s.should_be_in_list.user.pct)}
          hint={`grupo: ${fmtPct(s.should_be_in_list.group.pct)} (${s.should_be_in_list.user.n} respostas)`}
        />
      </div>

      {s.summary.rated === 0 ? (
        <p className="mt-16 text-center text-ink-soft italic">
          {isMe ? 'Você ainda não avaliou nenhum álbum deste projeto.' : `${who} ainda não avaliou nenhum álbum deste projeto.`}
        </p>
      ) : (
        <>
          <Section title="Por década">
            <CompareBarChart rows={chartRows(b.decada, 'decada')} label="Média por década" mine={mine} />
            <div className="mt-6"><UserBreakdownTable dim="decada" rows={b.decada ?? []} mine={mine} /></div>
          </Section>
          <Section title="Por gênero">
            <UserBreakdownTable dim="genero" rows={b.genero ?? []} mine={mine} />
          </Section>
          <Section title="Por país de origem">
            <UserBreakdownTable dim="pais" rows={b.pais ?? []} mine={mine} />
          </Section>
          <Section title="Média por ano de lançamento">
            <YearLineChart
              mine={mine}
              rows={(b.ano ?? []).filter((r) => r.key !== null).map((r) => ({ year: String(r.key), user: n(r.user_avg), group: n(r.group_avg) }))}
            />
          </Section>
          <Section title="Outliers">
            <p className="-mt-2 mb-5 text-ink-soft">Onde a nota {isMe ? 'sua' : `de ${who}`} mais diverge da média dos demais.</p>
            <div className="grid gap-8 md:grid-cols-2">
              <OutlierList title="Gostou mais que o grupo" rows={s.outliers.acima} />
              <OutlierList title="Gostou menos que o grupo" rows={s.outliers.abaixo} />
            </div>
          </Section>
          <Section title="Comparação com o grupo">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th className="text-right">Em comum</th>
                    <th className="text-right">{mine}</th>
                    <th className="text-right">Média dele(a)</th>
                    <th className="text-right">Diferença</th>
                    <th className="text-right">Diferença média</th>
                    <th className="text-right">Concordância</th>
                    <th className="text-right">Correlação</th>
                  </tr>
                </thead>
                <tbody>
                  {s.comparisons.map((c) => (
                    <tr key={c.user_id}>
                      <td>
                        <Link to="/estatisticas" search={{ projeto: search.projeto, usuario: c.user_id === viewer.id ? undefined : c.user_id }}>
                          {c.name}
                        </Link>
                      </td>
                      <td className="num text-right">{c.n}</td>
                      <td className="num text-right">{fmtNum(c.my_avg)}</td>
                      <td className="num text-right">{fmtNum(c.their_avg)}</td>
                      <td className="num text-right">{fmtDelta(n(c.delta))}</td>
                      <td className="num text-right">{fmtNum(c.mad)}</td>
                      <td className="num text-right">{fmtPct(c.agreement)}</td>
                      <td className="num text-right">{fmtNum(c.corr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Diferença média: média da diferença absoluta entre as notas nos álbuns em comum. Concordância = 1 − diferença média ÷ 4,5.
              Correlação de Pearson a partir de 3 álbuns em comum.
            </p>
          </Section>
        </>
      )}
    </div>
  )
}

function OutlierList({ title, rows }: { title: string; rows: Outlier[] }) {
  return (
    <div>
      <h3 className="eyebrow mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-ink-soft italic">Nenhum.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((o) => (
            <li key={o.album_id} className="flex items-center gap-3">
              <AlbumCover album={o} size="sm" />
              <div className="min-w-0 flex-1">
                <Link to="/album/$albumId" params={{ albumId: String(o.album_id) }} className="font-display font-semibold">
                  {o.title}
                </Link>
                <p className="truncate text-sm text-ink-soft">{o.artist}</p>
              </div>
              <div className="text-right">
                <p className="num text-sm">{fmtStars(o.user_score)} vs {fmtNum(o.others_avg)}</p>
                <p className="num text-xs text-ink-faint">{fmtDelta(n(o.delta))}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
