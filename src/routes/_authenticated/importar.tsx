import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState, type ChangeEvent } from 'react'
import { PageHeader } from '~/components/PageHeader'
import { Section } from '~/components/StatTile'
import { applyImportBatch, cancelImportBatch, createImportBatch, searchCatalog } from '~/server/import.functions'
import { getGroupStats, getHistory, getUserStats } from '~/server/stats.functions'
import { decodeCsv } from '~/lib/csv'
import { LegacyFormatError, parseLegacyCsv } from '~/lib/legacy-csv'
import { exportGroup, exportHistory, exportUserStats } from '~/lib/exports'
import { fmtDate, fmtStars } from '~/lib/format'
import { currentProject, projectSearch } from '~/lib/search'
import type { Candidate, ImportRow, ImportSummary } from '~/lib/types'

export const Route = createFileRoute('/_authenticated/importar')({
  validateSearch: projectSearch,
  head: () => ({ meta: [{ title: 'Importar / Exportar · 1001 Álbuns' }] }),
  component: ImportExport,
})

type Batch = { id: number; isAdmin: boolean; rows: ImportRow[] }

function ImportExport() {
  const { viewer, projects } = Route.useRouteContext()
  const search = Route.useSearch()
  const router = useRouter()
  const visible = projects.filter((p) => p.status !== 'draft')
  const [projectId, setProjectId] = useState<number | undefined>(currentProject(projects, search.projeto)?.id)
  const project = visible.find((p) => p.id === projectId)

  const create = useServerFn(createImportBatch)
  const apply = useServerFn(applyImportBatch)
  const cancel = useServerFn(cancelImportBatch)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [decisions, setDecisions] = useState<Record<number, number | null>>({})
  const [overwrite, setOverwrite] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !projectId) return
    setError(null)
    setSummary(null)
    if (file.size > 5 * 1024 * 1024) return setError('O arquivo excede o limite de 5 MB.')
    setBusy('Lendo e casando com o catálogo…')
    try {
      const rows = parseLegacyCsv(decodeCsv(await file.arrayBuffer()))
      if (!rows.length) throw new LegacyFormatError('Nenhuma linha válida encontrada no arquivo.')
      const b = await create({ data: { projectId, filename: file.name, rows } })
      setBatch(b)
      // Pré-seleciona o melhor candidato quando a confiança é alta.
      const initial: Record<number, number | null> = {}
      for (const r of b.rows) {
        if (r.status === 'revisar') {
          const best = r.candidates[0]
          initial[r.line] = best && best.score >= 75 && (b.isAdmin || best.picked) ? best.id : null
        }
      }
      setDecisions(initial)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.')
    } finally {
      setBusy(null)
    }
  }

  async function onConfirm() {
    if (!batch) return
    setBusy('Importando…')
    try {
      setSummary(await apply({ data: { batchId: batch.id, decisions, overwrite } }))
      setBatch(null)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na importação.')
    } finally {
      setBusy(null)
    }
  }

  async function onCancel() {
    if (batch) await cancel({ data: { batchId: batch.id } })
    setBatch(null)
  }

  return (
    <div>
      <PageHeader eyebrow="Seus dados" title="Importar / Exportar" />

      {!batch && (
        <Section title="Importar histórico legado">
          <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
            <div className="space-y-4">
              <p>
                Envie um CSV com as colunas <code className="font-mono text-sm">Artist, Album, Released, Rating, Notes, Global Rating, Origin, Generated Date</code>{' '}
                (Global Rating e Origin são ignorados). Cada linha é casada com o catálogo em três etapas: correspondência exata após
                normalização, sugestões aproximadas e revisão manual antes de confirmar.
              </p>
              {viewer.isAdmin ? (
                <p className="flash-ok">
                  Como administrador, os álbuns importados entram no histórico de sorteios (com a data de <em>Generated Date</em>) e saem do
                  sorteio. Importe o seu histórico antes dos demais usuários.
                </p>
              ) : (
                <p className="text-sm text-ink-soft">
                  Notas de álbuns que ainda não foram sorteados no projeto são descartadas automaticamente.
                </p>
              )}
              {error && <p className="flash-error">{error}</p>}
              {summary && <SummaryBox summary={summary} />}
              <div className="flex flex-wrap items-end gap-3">
                <label>
                  <span className="label">Projeto</span>
                  <select className="select" value={projectId ?? ''} onChange={(e) => setProjectId(Number(e.target.value))}>
                    {visible.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.status === 'closed' ? ' (encerrado)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`btn btn-primary ${busy || !project ? 'pointer-events-none opacity-50' : ''}`}>
                  {busy ?? 'Escolher arquivo CSV'}
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} disabled={!!busy || !project} />
                </label>
              </div>
            </div>
            <aside className="card text-sm">
              <h3 className="eyebrow mb-2">Exemplo</h3>
              <pre className="overflow-x-auto font-mono text-xs leading-relaxed">{`Artist,Album,Released,Rating,Notes,Global Rating,Origin,Generated Date
Radiohead,OK Computer,1997,5,"Obra-prima",4.3,UK,2024-01-10
Miles Davis,Kind of Blue,1959,4.5,,4.4,US,2024-01-11`}</pre>
              <p className="mt-3 text-ink-soft">Separadores “,” ou “;” e notas com vírgula decimal são aceitos.</p>
            </aside>
          </div>
        </Section>
      )}

      {batch && project && (
        <Review
          batch={batch}
          projectId={project.id}
          decisions={decisions}
          setDecisions={setDecisions}
          overwrite={overwrite}
          setOverwrite={setOverwrite}
          busy={busy}
          error={error}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}

      {!batch && <ExportSection projectId={projectId} projectName={project?.name ?? 'projeto'} viewerName={viewer.name} />}
    </div>
  )
}

function SummaryBox({ summary }: { summary: ImportSummary }) {
  return (
    <div className="flash-ok space-y-1">
      <p>
        <strong>Importação concluída.</strong> {summary.importadas} avaliações importadas
        {summary.sorteios ? `, ${summary.sorteios} álbuns adicionados ao histórico de sorteios` : ''}.
      </p>
      <p className="text-xs">
        {summary.existentes} já existentes mantidas · {summary.duplicadas} duplicadas · {summary.ignoradas} ignoradas ·{' '}
        {summary.descartadas.length} descartadas (não sorteadas)
      </p>
      {summary.descartadas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer">Ver descartadas</summary>
          <ul className="mt-1 list-disc pl-5">{summary.descartadas.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </details>
      )}
    </div>
  )
}

function Review(props: {
  batch: Batch
  projectId: number
  decisions: Record<number, number | null>
  setDecisions: (fn: (d: Record<number, number | null>) => Record<number, number | null>) => void
  overwrite: boolean
  setOverwrite: (v: boolean) => void
  busy: string | null
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const { batch, decisions } = props
  const exact = batch.rows.filter((r) => r.status === 'exato')
  const review = batch.rows.filter((r) => r.status === 'revisar')
  const discarded = batch.rows.filter((r) => r.status === 'nao_sorteado')
  const chosen = Object.values(decisions).filter(Boolean).length

  return (
    <Section title="Revisão da importação">
      <div className="mb-6 grid grid-cols-3 gap-4 text-center">
        <Count n={exact.length} label="encontrados" />
        <Count n={review.length} label="para revisar" accent />
        <Count n={discarded.length} label="não sorteados (descartados)" />
      </div>
      {props.error && <p className="flash-error mb-4">{props.error}</p>}

      {review.length > 0 && (
        <div className="space-y-4">
          <h3 className="eyebrow">Escolha o álbum correspondente ou ignore a linha</h3>
          {review.map((r) => (
            <ReviewRow
              key={r.line}
              row={r}
              projectId={props.projectId}
              isAdmin={batch.isAdmin}
              value={decisions[r.line] ?? null}
              onChange={(id) => props.setDecisions((d) => ({ ...d, [r.line]: id }))}
            />
          ))}
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer eyebrow">Encontrados automaticamente ({exact.length})</summary>
        <ul className="mt-2 columns-1 text-sm md:columns-2">
          {exact.map((r) => (
            <li key={r.line} className="break-inside-avoid py-0.5">
              {r.album_label} {r.score !== null && <span className="num text-ink-faint">· {fmtStars(r.score)}★</span>}
            </li>
          ))}
        </ul>
      </details>
      {discarded.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer eyebrow">Descartados — ainda não sorteados ({discarded.length})</summary>
          <ul className="mt-2 text-sm text-ink-soft">
            {discarded.map((r) => <li key={r.line}>{r.album_label}</li>)}
          </ul>
        </details>
      )}

      <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-4 border-t border-ink bg-paper py-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={props.overwrite} onChange={(e) => props.setOverwrite(e.target.checked)} className="h-4 w-4 accent-[var(--color-rust)]" />
          Sobrescrever avaliações que já existem
        </label>
        <span className="flex-1" />
        <button className="btn btn-ghost" onClick={props.onCancel} disabled={!!props.busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={props.onConfirm} disabled={!!props.busy}>
          {props.busy ?? `Confirmar (${exact.length + chosen} linhas)`}
        </button>
      </div>
    </Section>
  )
}

function Count({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className={`border-t-2 pt-2 ${accent ? 'border-rust' : 'border-ink'}`}>
      <p className={`num text-3xl ${accent ? 'text-rust' : ''}`}>{n}</p>
      <p className="eyebrow">{label}</p>
    </div>
  )
}

function ReviewRow({
  row,
  projectId,
  isAdmin,
  value,
  onChange,
}: {
  row: ImportRow
  projectId: number
  isAdmin: boolean
  value: number | null
  onChange: (id: number | null) => void
}) {
  const search = useServerFn(searchCatalog)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [extra, setExtra] = useState<Candidate[]>([])

  useEffect(() => {
    if (query.trim().length < 2) return setResults([])
    const t = setTimeout(() => {
      search({ data: { projectId, query } }).then(setResults).catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query, projectId, search])

  const options = [...row.candidates, ...extra.filter((e) => !row.candidates.some((c) => c.id === e.id))]
  const name = `row-${row.line}`

  return (
    <fieldset className="card !p-4">
      <legend className="px-1 text-sm">
        <span className="num text-ink-faint">linha {row.line}</span>
      </legend>
      <p className="font-display text-lg font-semibold">
        {row.artist} — {row.album}
        {row.year && <span className="ml-1 font-normal text-ink-soft">({row.year})</span>}
      </p>
      <p className="text-xs text-ink-soft">
        {row.score !== null ? `nota ${fmtStars(row.score)}` : 'sem nota'}
        {row.generated && ` · sorteado em ${fmtDate(row.generated)}`}
      </p>
      <div className="mt-3 space-y-1.5">
        {options.map((c) => {
          const blocked = !isAdmin && !c.picked
          return (
            <label key={c.id} className={`flex items-center gap-2 text-sm ${blocked ? 'opacity-50' : 'cursor-pointer'}`}>
              <input type="radio" name={name} checked={value === c.id} disabled={blocked} onChange={() => onChange(c.id)} className="accent-[var(--color-rust)]" />
              <span>
                {c.artist} — {c.title}
                {c.year ? ` (${c.year})` : ''}
              </span>
              <span className="num text-xs text-ink-faint">{c.score}%</span>
              {!c.picked && <span className="chip !py-0">{isAdmin ? 'será marcado como ouvido' : 'não sorteado'}</span>}
            </label>
          )
        })}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="radio" name={name} checked={value === null} onChange={() => onChange(null)} className="accent-[var(--color-rust)]" />
          <span className="italic text-ink-soft">Ignorar esta linha</span>
        </label>
      </div>
      <div className="relative mt-3">
        <input
          className="input !py-1.5 text-sm"
          placeholder="Buscar outro álbum no catálogo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Buscar álbum para a linha ${row.line}`}
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-sm border border-ink bg-card shadow-lg">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!isAdmin && !c.picked}
                  onClick={() => {
                    setExtra((x) => [...x, c])
                    onChange(c.id)
                    setQuery('')
                    setResults([])
                  }}
                >
                  {c.artist} — {c.title}
                  {c.year ? ` (${c.year})` : ''} {!c.picked && <span className="text-xs text-ink-faint">· não sorteado</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </fieldset>
  )
}

function ExportSection({ projectId, projectName, viewerName }: { projectId?: number; projectName: string; viewerName: string }) {
  const history = useServerFn(getHistory)
  const userStats = useServerFn(getUserStats)
  const group = useServerFn(getGroupStats)
  const [busy, setBusy] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title="Exportar">
      <p className="mb-4 text-ink-soft">
        Arquivos CSV separados por “;” com vírgula decimal, prontos para abrir no Excel. Projeto: <strong>{projectName}</strong>.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => run('h', async () => exportHistory((await history({ data: { projectId } })).rows, viewerName, projectName))}
        >
          {busy === 'h' ? 'Gerando…' : 'Meu histórico'}
        </button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => run('s', async () => exportUserStats((await userStats({ data: { projectId } })).stats, viewerName, projectName))}
        >
          {busy === 's' ? 'Gerando…' : 'Minhas estatísticas'}
        </button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run('g', async () => {
              const g = await group({ data: { projectId } })
              exportGroup(g.stats, g.rows, projectName)
            })
          }
        >
          {busy === 'g' ? 'Gerando…' : 'Estatísticas do grupo'}
        </button>
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        Para exportar o histórico ou as estatísticas de outra pessoa, use o botão “Exportar CSV” em <Link to="/historico">Histórico</Link> ou{' '}
        <Link to="/estatisticas">Estatísticas</Link> com o usuário selecionado.
      </p>
    </Section>
  )
}
