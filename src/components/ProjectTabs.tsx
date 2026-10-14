import { Link, useRouterState } from '@tanstack/react-router'
import type { Project } from '~/lib/types'

/** Abas de projeto: o ativo em destaque, os encerrados com o selo "encerrado". */
export function ProjectTabs({ projects, current }: { projects: Project[]; current: number | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const visible = projects.filter((p) => p.status !== 'draft')
  if (visible.length <= 1) return null
  const ordered = [...visible].sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : b.id - a.id))
  return (
    <nav aria-label="Projetos" className="mb-6 flex flex-wrap items-center gap-2 border-b border-line pb-3">
      <span className="eyebrow mr-2">Projeto</span>
      {ordered.map((p) => {
        const active = p.id === current
        return (
          <Link
            key={p.id}
            to={pathname}
            search={(prev: Record<string, unknown>) => ({ ...prev, projeto: p.status === 'active' ? undefined : p.id })}
            className={`inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-sm no-underline transition-colors ${
              active ? 'border-ink bg-ink text-paper hover:text-paper' : 'border-line text-ink hover:border-ink hover:text-ink'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="font-display font-semibold">{p.name}</span>
            {p.status === 'active' ? (
              <span className="chip chip-rust !py-0">atual</span>
            ) : (
              <span className={`chip !py-0 ${active ? '!border-paper/40 !text-paper/80' : ''}`}>encerrado</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
