import { Link, createFileRoute } from '@tanstack/react-router'
import { getToday } from '~/server/albums.functions'
import { AlbumSpread } from '~/components/AlbumSpread'
import { RatingForm } from '~/components/RatingForm'
import { RatingsList } from '~/components/RatingsList'
import { ProgressBar } from '~/components/ProgressBar'
import { fmtLongDate } from '~/lib/format'

export const Route = createFileRoute('/_authenticated/')({
  loader: () => getToday(),
  head: () => ({ meta: [{ title: 'Álbum do dia · 1001 Álbuns' }] }),
  component: Home,
})

function Home() {
  const { project, detail, total, drawn, today } = Route.useLoaderData()
  const { viewer } = Route.useRouteContext()

  if (!project) {
    return (
      <Empty title="Nenhum projeto ativo">
        {viewer.isAdmin ? (
          <>
            Crie e ative um projeto em <Link to="/admin/projetos">Administração → Projetos</Link>.
          </>
        ) : (
          'O administrador ainda não ativou uma lista. Volte mais tarde.'
        )}
      </Empty>
    )
  }
  if (!detail) {
    return (
      <Empty title="Lista concluída!">
        Todos os {total} álbuns de “{project.name}” já foram sorteados. Veja o <Link to="/historico">histórico</Link>.
      </Empty>
    )
  }

  const mine = detail.ratings.find((r) => r.user_id === viewer.id) ?? null
  const others = detail.ratings.filter((r) => r.user_id !== viewer.id)
  return (
    <div className="space-y-12">
      <AlbumSpread
        detail={detail}
        eyebrow={
          <>
            Álbum do dia · <span className="normal-case tracking-normal">{fmtLongDate(today)}</span>
          </>
        }
      >
        <RatingForm key={detail.album.id} albumId={detail.album.id} mine={mine} />
      </AlbumSpread>

      <section className="grid gap-8 md:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="text-2xl font-semibold">{project.name}</h2>
          <div className="mt-4">
            <ProgressBar done={drawn} total={total} label="Álbuns sorteados" />
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            Um novo álbum é sorteado todo dia à meia-noite (horário de Brasília) entre os que ainda não foram ouvidos.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold">O que o grupo achou</h2>
          <div className="mt-2">
            <RatingsList ratings={others} viewerId={viewer.id} />
          </div>
          <Link to="/album/$albumId" params={{ albumId: String(detail.album.id) }} className="mt-2 inline-block text-sm">
            Página do álbum →
          </Link>
        </div>
      </section>
    </div>
  )
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="eyebrow">Silêncio entre faixas</p>
      <h1 className="mt-2 text-5xl font-semibold">{title}</h1>
      <p className="mt-4 text-lg text-ink-soft">{children}</p>
    </div>
  )
}
