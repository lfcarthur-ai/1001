import { createServerFn } from '@tanstack/react-start'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authMiddleware, check } from './middleware'
import type { GroupStats, HistoryRow, RankingRow, UserStats } from '~/lib/types'

type ProjectArg = { projectId?: number | null }
const projectArg = (d: ProjectArg) => (d?.projectId ? Number(d.projectId) : null)

async function listUsers(supabase: SupabaseClient) {
  const { data } = await supabase.from('profiles').select('id, name').order('name')
  return (data ?? []) as { id: string; name: string }[]
}

export const getHistory = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: ProjectArg & { userId?: string | null }) => ({
    projectId: projectArg(d),
    userId: d?.userId ? String(d.userId) : null,
  }))
  .handler(async ({ context, data }) => {
    const userId = data.userId ?? context.user.id
    const rows = check(await context.supabase.rpc('history_rows', { p_project: data.projectId, p_user: userId }))
    return { rows: (rows ?? []) as HistoryRow[], userId, users: await listUsers(context.supabase) }
  })

export const getUserStats = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: ProjectArg & { userId?: string | null }) => ({
    projectId: projectArg(d),
    userId: d?.userId ? String(d.userId) : null,
  }))
  .handler(async ({ context, data }) => {
    const userId = data.userId ?? context.user.id
    const stats = check(await context.supabase.rpc('user_stats', { p_project: data.projectId, p_user: userId }))
    return { stats: stats as UserStats, userId, users: await listUsers(context.supabase) }
  })

export const getGroupStats = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: ProjectArg) => ({ projectId: projectArg(d) }))
  .handler(async ({ context, data }) => {
    const [stats, rows] = await Promise.all([
      context.supabase.rpc('group_stats', { p_project: data.projectId }),
      context.supabase.rpc('history_rows', { p_project: data.projectId, p_user: context.user.id }),
    ])
    return { stats: check(stats) as GroupStats, rows: (check(rows) ?? []) as HistoryRow[] }
  })

export const RANKING_KINDS = {
  melhores: 'Álbuns melhor avaliados',
  piores: 'Álbuns pior avaliados',
  controversos: 'Álbuns mais controversos',
} as const
export type RankingKind = keyof typeof RANKING_KINDS

export const getRanking = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: ProjectArg & { kind: string }) => {
    if (!(d.kind in RANKING_KINDS)) throw new Error('Ranking inválido.')
    return { projectId: projectArg(d), kind: d.kind as RankingKind }
  })
  .handler(async ({ context, data }) => {
    const rows = check(
      await context.supabase.rpc('album_ranking', { p_project: data.projectId, p_kind: data.kind, p_limit: 2000, p_offset: 0 }),
    )
    return { rows: (rows ?? []) as RankingRow[] }
  })
