// Chamada pelo pg_cron às 03:00 UTC (00:00 em Brasília). Protegida por segredo.
import { createFileRoute } from '@tanstack/react-router'
import { timingSafeEqual } from 'node:crypto'
import { getSupabaseAdminClient } from '~/lib/supabase/server'
import { enrichAlbumById, enrichPending } from '~/lib/enrich/service'

const BATCH = 8

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'não autorizado' }, { status: 401 })

  const admin = getSupabaseAdminClient()
  const { data: pick, error } = await admin.rpc('pick_daily_album')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!pick?.album_id) return Response.json({ pick: null, message: 'Sem projeto ativo ou sem álbuns disponíveis.' })

  const enriched = await enrichAlbumById(admin, pick.album_id).catch(() => false)
  const batch = await enrichPending(admin, BATCH).catch(() => 0)
  return Response.json({ pick, enriched, batch })
}

export const Route = createFileRoute('/api/public/cron/daily-pick')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
    },
  },
})
