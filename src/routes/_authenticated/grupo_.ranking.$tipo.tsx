import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { getRanking, RANKING_KINDS, type RankingKind } from '~/server/stats.functions'
import { PageHeader } from '~/components/PageHeader'
import { RankList } from '~/components/RankList'
import { currentProject, projectSearch } from '~/lib/search'

export const Route = createFileRoute('/_authenticated/grupo_/ranking/$tipo')({
  validateSearch: projectSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    if (!(params.tipo in RANKING_KINDS)) throw notFound()
    return getRanking({ data: { projectId: deps.projeto, kind: params.tipo } })
  },
  component: Ranking,
})

function Ranking() {
  const { rows } = Route.useLoaderData()
  const { tipo } = Route.useParams()
  const { projects } = Route.useRouteContext()
  const search = Route.useSearch()
  const project = currentProject(projects, search.projeto)
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={project?.name} title={RANKING_KINDS[tipo as RankingKind]}>
        <Link to="/grupo" search={search} className="btn btn-sm">← Grupo</Link>
      </PageHeader>
      <RankList rows={rows} metric={tipo === 'controversos' ? 'std' : 'avg'} />
    </div>
  )
}
