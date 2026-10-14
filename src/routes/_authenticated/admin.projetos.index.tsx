import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { createProject, listAdminProjects } from '~/server/admin.functions'
import { decodeCsv } from '~/lib/csv'
import { parseCatalogCsv, type CatalogParseResult } from '~/lib/catalog-csv'
import { fmtDate } from '~/lib/format'

export const Route = createFileRoute('/_authenticated/admin/projetos/')({
  loader: () => listAdminProjects(),
  component: Projects,
})

const STATUS = { draft: 'rascunho', active: 'ativo', closed: 'encerrado' } as const

function Projects() {
  const projects = Route.useLoaderData()
  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-4xl font-semibold">Projetos</h1>
        <p className="mt-2 text-ink-soft">
          Cada lista de álbuns é um projeto. Só um fica ativo por vez; ao ativar outro, o atual é encerrado e para de ter sorteios, mas as
          avaliações continuam visíveis.
        </p>
        <div className="table-wrap mt-6">
          <table className="table">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Situação</th>
                <th className="text-right">Álbuns</th>
                <th className="text-right">Sorteados</th>
                <th>Criado</th>
                <th>Ativado</th>
                <th>Encerrado</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to="/admin/projetos/$id" params={{ id: String(p.id) }} className="font-display font-semibold">
                      {p.name}
                    </Link>
                  </td>
                  <td>
                    <span className={`chip ${p.status === 'active' ? 'chip-rust' : ''}`}>{STATUS[p.status]}</span>
                  </td>
                  <td className="num text-right">{p.albums}</td>
                  <td className="num text-right">{p.picks}</td>
                  <td className="num text-xs">{fmtDate(p.created_at)}</td>
                  <td className="num text-xs">{fmtDate(p.activated_at)}</td>
                  <td className="num text-xs">{fmtDate(p.closed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <NewProject />
    </div>
  )
}

function NewProject() {
  const navigate = useNavigate()
  const create = useServerFn(createProject)
  const [parsed, setParsed] = useState<CatalogParseResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setError(null)
    setParsed(null)
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return setError('O arquivo excede o limite de 5 MB.')
    setFileName(file.name)
    const result = parseCatalogCsv(decodeCsv(await file.arrayBuffer()))
    if (!result.albums.length) setError('Nenhum álbum encontrado. Formato esperado: Artist, Title, Release Date, Run Time, Genre.')
    setParsed(result)
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!parsed?.albums.length) return
    setBusy(true)
    setError(null)
    try {
      const name = String(new FormData(e.currentTarget).get('name'))
      const { id } = await create({ data: { name, albums: parsed.albums } })
      await navigate({ to: '/admin/projetos/$id', params: { id: String(id) } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o projeto.')
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2 className="text-3xl font-semibold">Novo projeto</h2>
      <p className="mt-1 text-ink-soft">
        CSV no mesmo formato da lista original: <code className="font-mono text-sm">Artist, Title, Release Date, Run Time, Genre</code>. O
        projeto é criado como rascunho; você revisa e ativa em seguida.
      </p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        {error && <p className="flash-error">{error}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="label">Nome</span>
            <input name="name" required maxLength={120} className="input" placeholder="Ex.: 1001 álbuns brasileiros" />
          </label>
          <label>
            <span className="label">Arquivo CSV</span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} required className="input !py-1.5 text-sm" />
          </label>
        </div>

        {parsed && parsed.albums.length > 0 && (
          <div>
            <p className="text-sm">
              <strong>{fileName}</strong>: {parsed.albums.length} álbuns
              {parsed.duplicates > 0 && ` · ${parsed.duplicates} duplicados ignorados`}
              {parsed.skipped.length > 0 && ` · ${parsed.skipped.length} linhas inválidas`}
              {!parsed.headerFound && ' · sem cabeçalho (ordem padrão assumida)'}
            </p>
            <div className="table-wrap mt-3 max-h-80 overflow-y-auto">
              <table className="table">
                <thead className="sticky top-0 bg-card">
                  <tr>
                    <th className="text-right">#</th>
                    <th>Artista</th>
                    <th>Álbum</th>
                    <th className="text-right">Ano</th>
                    <th>Duração</th>
                    <th>Gênero</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.albums.slice(0, 50).map((a, i) => (
                    <tr key={i}>
                      <td className="num text-right text-ink-faint">{i + 1}</td>
                      <td>{a.artist}</td>
                      <td>{a.title}</td>
                      <td className="num text-right">{a.year ?? '—'}</td>
                      <td className="num text-xs">{a.run_time ?? '—'}</td>
                      <td className="text-sm">{a.genre ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.albums.length > 50 && <p className="mt-1 text-xs text-ink-faint">Mostrando os 50 primeiros.</p>}
            {parsed.skipped.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer">Linhas inválidas</summary>
                <ul className="mt-1 list-disc pl-5 text-ink-soft">
                  {parsed.skipped.slice(0, 50).map((s) => (
                    <li key={s.line}>
                      linha {s.line}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <button className="btn btn-primary" disabled={busy || !parsed?.albums.length}>
          {busy ? 'Criando…' : 'Criar rascunho'}
        </button>
      </form>
    </section>
  )
}
