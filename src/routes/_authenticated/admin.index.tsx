import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { enrichBatch, listAdminProjects } from '~/server/admin.functions'
import { StatTile } from '~/components/StatTile'
import { fmtDate } from '~/lib/format'

export const Route = createFileRoute('/_authenticated/admin/')({
  loader: () => listAdminProjects(),
  component: AdminHome,
})

function AdminHome() {
  const projects = Route.useLoaderData()
  const active = projects.find((p) => p.status === 'active')
  const run = useServerFn(enrichBatch)
  const [state, setState] = useState<string | null>(null)

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <StatTile label="Projeto ativo" value={<span className="font-display text-2xl">{active?.name ?? '—'}</span>} hint={active?.activated_at ? `desde ${fmtDate(active.activated_at)}` : undefined} />
        <StatTile label="Álbuns" value={active?.albums ?? 0} />
        <StatTile label="Sorteados" value={active?.picks ?? 0} />
        <StatTile label="Projetos" value={projects.length} hint={`${projects.filter((p) => p.status === 'draft').length} em rascunho`} />
      </div>

      <section className="card max-w-2xl">
        <h2 className="text-2xl font-semibold">Enriquecimento</h2>
        <p className="mt-2 text-ink-soft">
          Capas, país e links vêm do MusicBrainz, Cover Art Archive e Wikipedia. O sorteio diário já enriquece o álbum do dia e um lote
          pequeno de pendentes; use o botão para processar mais um lote agora (cerca de 5 álbuns, respeitando 1 requisição/s).
        </p>
        <button
          className="btn mt-4"
          disabled={state === 'busy'}
          onClick={async () => {
            setState('busy')
            try {
              const { done } = await run({ data: { limit: 5 } })
              setState(`${done} álbuns processados.`)
            } catch (err) {
              setState(err instanceof Error ? err.message : 'Falhou.')
            }
          }}
        >
          {state === 'busy' ? 'Processando…' : 'Enriquecer um lote'}
        </button>
        {state && state !== 'busy' && <p className="mt-3 text-sm">{state}</p>}
      </section>

      <p>
        <Link to="/admin/projetos">Gerenciar projetos →</Link> · <Link to="/admin/usuarios">Gerenciar usuários →</Link>
      </p>
    </div>
  )
}
