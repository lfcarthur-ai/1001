import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, check } from './middleware'
import type { Candidate, ImportRow, ImportSummary } from '~/lib/types'
import type { LegacyRow } from '~/lib/legacy-csv'

const MAX_ROWS = 5000

/** Camadas 1 e 2: normalização + match exato e candidatos fuzzy (pg_trgm), no banco. */
export const createImportBatch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { projectId: number; filename: string; rows: LegacyRow[] }) => {
    if (!Array.isArray(d.rows) || d.rows.length === 0) throw new Error('Nenhuma linha válida encontrada no arquivo.')
    if (d.rows.length > MAX_ROWS) throw new Error(`Arquivo grande demais (máximo ${MAX_ROWS} linhas).`)
    const rows = d.rows.map((r) => ({
      line: Number(r.line),
      artist: String(r.artist ?? '').slice(0, 500),
      album: String(r.album ?? '').slice(0, 500),
      year: r.year == null ? null : Number(r.year),
      score: r.score == null ? null : Number(r.score),
      notes: r.notes == null ? null : String(r.notes).slice(0, 5000),
      generated: r.generated && /^\d{4}-\d{2}-\d{2}$/.test(r.generated) ? r.generated : null,
    }))
    return { projectId: Number(d.projectId), filename: String(d.filename ?? '').slice(0, 255), rows }
  })
  .handler(async ({ context, data }) => {
    const batchId = check(
      await context.supabase.rpc('create_import_batch', {
        p_project: data.projectId,
        p_filename: data.filename,
        p_rows: data.rows,
      }),
    ) as number
    const batch = check(
      await context.supabase.from('import_batches').select('id, is_admin, rows').eq('id', batchId).single(),
    )
    if (!batch) throw new Error('Importação não encontrada.')
    return { id: batch.id as number, isAdmin: batch.is_admin as boolean, rows: batch.rows as ImportRow[] }
  })

/** Camada 3: aplica as decisões da revisão manual. */
export const applyImportBatch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { batchId: number; decisions: Record<string, number | null>; overwrite: boolean }) => {
    const decisions: Record<string, number | null> = {}
    for (const [line, id] of Object.entries(d.decisions ?? {})) decisions[String(Number(line))] = id ? Number(id) : null
    return { batchId: Number(d.batchId), decisions, overwrite: Boolean(d.overwrite) }
  })
  .handler(async ({ context, data }) => {
    const summary = check(
      await context.supabase.rpc('apply_import_batch', {
        p_batch: data.batchId,
        p_decisions: data.decisions,
        p_overwrite: data.overwrite,
      }),
    )
    return summary as ImportSummary
  })

export const cancelImportBatch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { batchId: number }) => ({ batchId: Number(d.batchId) }))
  .handler(async ({ context, data }) => {
    check(await context.supabase.from('import_batches').delete().eq('id', data.batchId).eq('status', 'pending'))
    return { ok: true }
  })

export const searchCatalog = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: { projectId: number; query: string }) => ({
    projectId: Number(d.projectId),
    query: String(d.query ?? '').slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    if (data.query.trim().length < 2) return [] as Candidate[]
    const rows = check(
      await context.supabase.rpc('search_albums', { p_project: data.projectId, p_query: data.query, p_limit: 10 }),
    )
    return ((rows ?? []) as (Candidate & { score: number })[]).map((r) => ({ ...r, score: Math.round(r.score * 100) }))
  })
