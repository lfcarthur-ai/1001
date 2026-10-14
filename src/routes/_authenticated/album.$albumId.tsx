import { createFileRoute, notFound } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { getAlbum } from '~/server/albums.functions'
import { reenrichAlbum } from '~/server/admin.functions'
import { AlbumSpread } from '~/components/AlbumSpread'
import { RatingForm } from '~/components/RatingForm'
import { RatingsList } from '~/components/RatingsList'

export const Route = createFileRoute('/_authenticated/album/$albumId')({
  loader: async ({ params }) => {
    const detail = await getAlbum({ data: { albumId: Number(params.albumId) } })
    if (!detail) throw notFound()
    return detail
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.album.title} · ${loaderData.album.artist} · 1001 Álbuns` : '1001 Álbuns' }],
  }),
  component: AlbumPage,
})

function AlbumPage() {
  const detail = Route.useLoaderData()
  const { viewer } = Route.useRouteContext()
  const mine = detail.ratings.find((r) => r.user_id === viewer.id) ?? null
  return (
    <div className="space-y-12">
      <AlbumSpread
        detail={detail}
        eyebrow={
          <>
            {detail.project.name}
            {detail.project.status === 'closed' && ' · encerrado'}
          </>
        }
      >
        <RatingForm key={detail.album.id} albumId={detail.album.id} mine={mine} />
        {viewer.isAdmin && <Reenrich albumId={detail.album.id} />}
      </AlbumSpread>
      <section>
        <h2 className="text-3xl font-semibold">Todas as avaliações</h2>
        <hr className="rule !mt-3" />
        <RatingsList ratings={detail.ratings} viewerId={viewer.id} />
      </section>
    </div>
  )
}

function Reenrich({ albumId }: { albumId: number }) {
  const run = useServerFn(reenrichAlbum)
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  return (
    <button
      className="btn btn-sm btn-ghost mt-3"
      disabled={state === 'busy'}
      onClick={async () => {
        setState('busy')
        await run({ data: { albumId } })
        setState('done')
        location.reload()
      }}
    >
      {state === 'busy' ? 'Buscando capa e links…' : 'Reprocessar capa e links (admin)'}
    </button>
  )
}
