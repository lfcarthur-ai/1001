import { createServerFn } from '@tanstack/react-start'
import { adminMiddleware, check } from './middleware'
import { getSupabaseAdminClient } from '~/lib/supabase/server'
import { enrichPending, enrichAlbumById } from '~/lib/enrich/service'
import type { Album, Project } from '~/lib/types'
import type { CatalogAlbum } from '~/lib/catalog-csv'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ADMIN_EMAIL = 'lfcarthur@gmail.com'

export type AdminUser = {
  id: string
  name: string
  email: string
  created_at: string
  roles: ('admin' | 'user')[]
  ratings: number
}

export const listUsers = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from('profiles')
      .select('id, name, email, created_at, user_roles(role), ratings(count)')
      .order('name')
    return ((data ?? []) as any[]).map(
      (p): AdminUser => ({
        id: p.id,
        name: p.name,
        email: p.email,
        created_at: p.created_at,
        roles: (p.user_roles ?? []).map((r: { role: 'admin' | 'user' }) => r.role),
        ratings: p.ratings?.[0]?.count ?? 0,
      }),
    )
  })

export const updateUser = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((d: { userId: string; name: string; email: string }) => {
    const name = String(d.name ?? '').trim()
    const email = String(d.email ?? '').trim().toLowerCase()
    if (!name || name.length > 80) throw new Error('Informe um nome (até 80 caracteres).')
    if (!EMAIL_RE.test(email)) throw new Error('Informe um e-mail válido.')
    return { userId: String(d.userId), name, email }
  })
  .handler(async ({ data }) => {
    const admin = getSupabaseAdminClient()
    const { data: current } = await admin.from('profiles').select('email').eq('id', data.userId).single()
    if (!current) throw new Error('Usuário não encontrado.')
    if (current.email === ADMIN_EMAIL && data.email !== ADMIN_EMAIL) {
      throw new Error(`O e-mail da conta administradora (${ADMIN_EMAIL}) não pode ser alterado.`)
    }
    if (current.email !== data.email) {
      const { error } = await admin.auth.admin.updateUserById(data.userId, { email: data.email, email_confirm: true })
      if (error) throw new Error(error.message.includes('already') ? 'Este e-mail já está cadastrado.' : error.message)
    }
    check(await admin.from('profiles').update({ name: data.name }).eq('id', data.userId))
    return { ok: true }
  })

export const setAdminRole = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((d: { userId: string; admin: boolean }) => ({ userId: String(d.userId), admin: Boolean(d.admin) }))
  .handler(async ({ context, data }) => {
    // Via RLS (política "admin concede/remove papéis"); o trigger protege a conta principal.
    if (data.admin) {
      check(
        await context.supabase
          .from('user_roles')
          .upsert({ user_id: data.userId, role: 'admin' }, { onConflict: 'user_id,role', ignoreDuplicates: true }),
      )
    } else {
      check(await context.supabase.from('user_roles').delete().eq('user_id', data.userId).eq('role', 'admin'))
    }
    return { ok: true }
  })

export const listAdminProjects = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from('projects')
      .select('id, name, status, created_at, activated_at, closed_at, albums(count), daily_picks(count)')
      .order('id', { ascending: false })
    return ((data ?? []) as any[]).map((p) => ({
      ...(p as Project),
      albums: p.albums?.[0]?.count ?? 0,
      picks: p.daily_picks?.[0]?.count ?? 0,
    }))
  })

export const getProjectPreview = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .validator((d: { projectId: number }) => ({ projectId: Number(d.projectId) }))
  .handler(async ({ context, data }) => {
    const project = check(
      await context.supabase
        .from('projects')
        .select('id, name, status, created_at, activated_at, closed_at')
        .eq('id', data.projectId)
        .single(),
    ) as Project
    const albums = check(
      await context.supabase
        .from('albums')
        .select('id, position, artist, title, year, run_time, genre, cover_url, enriched_at')
        .eq('project_id', data.projectId)
        .order('position')
        .limit(5000),
    ) as Pick<Album, 'id' | 'position' | 'artist' | 'title' | 'year' | 'run_time' | 'genre' | 'cover_url' | 'enriched_at'>[]
    const { count: picks } = await context.supabase
      .from('daily_picks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', data.projectId)
    return { project, albums, picks: picks ?? 0 }
  })

export const createProject = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((d: { name: string; albums: CatalogAlbum[] }) => {
    const name = String(d.name ?? '').trim()
    if (!name || name.length > 120) throw new Error('Informe o nome do projeto (até 120 caracteres).')
    if (!Array.isArray(d.albums) || d.albums.length === 0) throw new Error('O CSV não tem álbuns.')
    if (d.albums.length > 20000) throw new Error('O CSV tem álbuns demais (máximo 20.000).')
    const albums = d.albums.map((a) => ({
      artist: String(a.artist ?? '').trim(),
      title: String(a.title ?? '').trim(),
      year: a.year == null || !Number.isFinite(Number(a.year)) ? null : Math.trunc(Number(a.year)),
      run_time: a.run_time ? String(a.run_time).trim().slice(0, 32) : null,
      genre: a.genre ? String(a.genre).trim().slice(0, 255) : null,
    }))
    return { name, albums }
  })
  .handler(async ({ context, data }) => {
    const id = check(await context.supabase.rpc('create_project', { p_name: data.name, p_albums: data.albums }))
    return { id: id as number }
  })

export const activateProject = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((d: { projectId: number }) => ({ projectId: Number(d.projectId) }))
  .handler(async ({ context, data }) => {
    check(await context.supabase.rpc('activate_project', { p_id: data.projectId }))
    return { ok: true }
  })

export const deleteDraftProject = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((d: { projectId: number }) => ({ projectId: Number(d.projectId) }))
  .handler(async ({ context, data }) => {
    check(await context.supabase.rpc('delete_draft_project', { p_id: data.projectId }))
    return { ok: true }
  })

/** Enriquecimento em lote limitado (respeita 1 req/s do MusicBrainz). */
export const enrichBatch = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((d: { limit?: number }) => ({ limit: Math.min(Math.max(Number(d?.limit) || 5, 1), 10) }))
  .handler(async ({ data }) => ({ done: await enrichPending(getSupabaseAdminClient(), data.limit) }))

export const reenrichAlbum = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((d: { albumId: number }) => ({ albumId: Number(d.albumId) }))
  .handler(async ({ data }) => ({ ok: await enrichAlbumById(getSupabaseAdminClient(), data.albumId, true) }))
