import { createServerFn } from '@tanstack/react-start'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authMiddleware, check } from './middleware'
import { getSupabaseAdminClient } from '~/lib/supabase/server'
import { enrichAlbumById } from '~/lib/enrich/service'
import { todayBrt } from '~/lib/format'
import type { Album, Project, RatingWithUser } from '~/lib/types'

const ALBUM_COLUMNS =
  'id, project_id, position, artist, title, year, run_time, genre, country, release_date, cover_url, wikipedia_url, rym_url, mb_release_group_id, enriched_at, enrich_attempts'

export type AlbumDetail = {
  album: Album
  project: Project
  pick: { pick_date: string; source: string; position: number }
  ratings: RatingWithUser[]
}

async function loadAlbumDetail(supabase: SupabaseClient, albumId: number): Promise<AlbumDetail | null> {
  const { data: album } = await supabase.from('albums').select(ALBUM_COLUMNS).eq('id', albumId).maybeSingle()
  if (!album) return null
  const [pick, project, ratings, position] = await Promise.all([
    supabase.from('daily_picks').select('pick_date, source').eq('album_id', albumId).maybeSingle(),
    supabase.from('projects').select('id, name, status, created_at, activated_at, closed_at').eq('id', album.project_id).single(),
    supabase
      .from('ratings')
      .select('*, profiles(name)')
      .eq('album_id', albumId)
      .order('updated_at', { ascending: false }),
    supabase.rpc('pick_position', { p_album: albumId }),
  ])
  if (!pick.data) return null
  return {
    album: album as Album,
    project: project.data as Project,
    pick: { ...pick.data, position: position.data ?? 0 },
    ratings: (ratings.data ?? []) as RatingWithUser[],
  }
}

/** Álbum do dia do projeto ativo. Se o sorteio de hoje ainda não existir, cria (fallback do cron). */
export const getToday = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { supabase } = context
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, status, created_at, activated_at, closed_at')
      .eq('status', 'active')
      .maybeSingle()
    if (!project) return { project: null, detail: null, total: 0, drawn: 0, today: todayBrt() }

    let { data: pick } = await supabase
      .from('daily_picks')
      .select('album_id')
      .eq('project_id', project.id)
      .eq('pick_date', todayBrt())
      .eq('source', 'sorteio')
      .maybeSingle()

    if (!pick) {
      const created = check(await supabase.rpc('pick_daily_album'))
      pick = created?.album_id ? { album_id: created.album_id } : null
      if (pick) {
        // Enriquecimento imediato do álbum recém-sorteado (com limite de tempo).
        await Promise.race([
          enrichAlbumById(getSupabaseAdminClient(), pick.album_id).catch((err) =>
            console.error('Enriquecimento do álbum do dia falhou', err),
          ),
          new Promise((r) => setTimeout(r, 9000)),
        ])
      }
    }

    const [total, drawn] = await Promise.all([
      supabase.from('albums').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
      supabase.from('daily_picks').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
    ])
    return {
      project: project as Project,
      detail: pick ? await loadAlbumDetail(supabase, pick.album_id) : null,
      total: total.count ?? 0,
      drawn: drawn.count ?? 0,
      today: todayBrt(),
    }
  })

export const getAlbum = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((data: { albumId: number }) => ({ albumId: Number(data.albumId) }))
  .handler(async ({ context, data }) => loadAlbumDetail(context.supabase, data.albumId))

export type RatingInput = {
  albumId: number
  score: number
  shouldBeInList: boolean
  comment: string
}

export const saveRating = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: RatingInput): RatingInput => {
    const score = Number(d.score)
    if (!(score >= 0.5 && score <= 5 && Number.isInteger(score * 2))) throw new Error('Escolha uma nota entre 0,5 e 5 estrelas.')
    const comment = String(d.comment ?? '').trim()
    if (comment.length > 5000) throw new Error('O comentário pode ter até 5.000 caracteres.')
    return { albumId: Number(d.albumId), score, shouldBeInList: Boolean(d.shouldBeInList), comment }
  })
  .handler(async ({ context, data }) => {
    // A RLS garante: só o próprio usuário e só álbuns já sorteados.
    const { error } = await context.supabase.from('ratings').upsert(
      {
        user_id: context.user.id,
        album_id: data.albumId,
        score: data.score,
        should_be_in_list: data.shouldBeInList,
        comment: data.comment || null,
      },
      { onConflict: 'user_id,album_id' },
    )
    if (error) {
      throw new Error(error.code === '42501' ? 'Só é possível avaliar álbuns já sorteados.' : error.message)
    }
    return { ok: true }
  })

export const deleteRating = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { albumId: number }) => ({ albumId: Number(d.albumId) }))
  .handler(async ({ context, data }) => {
    check(await context.supabase.from('ratings').delete().eq('user_id', context.user.id).eq('album_id', data.albumId))
    return { ok: true }
  })
