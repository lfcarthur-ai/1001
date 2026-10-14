// Persistência do enriquecimento (service role). Somente servidor.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createEnricher, MAX_ATTEMPTS, type EnrichableAlbum } from './index'

const COLUMNS =
  'id, artist, title, year, country, release_date, cover_url, wikipedia_url, rym_url, mb_release_group_id, enrich_attempts'

export async function enrichAlbumById(admin: SupabaseClient, albumId: number, force = false): Promise<boolean> {
  const { data, error } = await admin.from('albums').select(`${COLUMNS}, enriched_at`).eq('id', albumId).single()
  if (error || !data) return false
  if (data.enriched_at && !force) return false
  const patch = await createEnricher().enrich(data as EnrichableAlbum)
  const { error: upErr } = await admin.from('albums').update(patch).eq('id', albumId)
  return !upErr
}

/** Enriquece um lote limitado de pendentes do projeto ativo, priorizando os já sorteados. */
export async function enrichPending(admin: SupabaseClient, limit: number): Promise<number> {
  const { data: project } = await admin.from('projects').select('id').eq('status', 'active').maybeSingle()
  if (!project) return 0
  const pendingQuery = (onlyPicked = false) =>
    admin
      .from('albums')
      .select(onlyPicked ? `${COLUMNS}, daily_picks!inner(id)` : COLUMNS)
      .eq('project_id', project.id)
      .is('enriched_at', null)
      .lt('enrich_attempts', MAX_ATTEMPTS)
      .order('enrich_attempts')
      .order('position')

  const picked = (await pendingQuery(true).limit(limit)).data ?? []
  const others = (await pendingQuery().limit(limit * 2)).data ?? []
  const rows: EnrichableAlbum[] = []
  const seen = new Set<number>()
  for (const r of [...picked, ...others] as unknown as EnrichableAlbum[]) {
    if (rows.length >= limit) break
    if (!seen.has(r.id)) {
      seen.add(r.id)
      rows.push(r)
    }
  }

  const enricher = createEnricher()
  let done = 0
  for (const album of rows) {
    try {
      const patch = await enricher.enrich(album)
      const { error } = await admin.from('albums').update(patch).eq('id', album.id)
      if (!error) done++
    } catch (err) {
      console.error('Falha ao enriquecer', album.id, err)
    }
  }
  return done
}
