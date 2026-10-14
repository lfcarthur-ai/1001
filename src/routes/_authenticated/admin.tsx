import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/admin')({
  // Só UX: toda server function de administração revalida has_role no servidor.
  beforeLoad: ({ context }) => {
    if (!context.viewer.isAdmin) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Administração · 1001 Álbuns' }] }),
  component: AdminLayout,
})

function AdminLayout() {
  const tab = 'px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] no-underline text-ink-soft border-b-2 border-transparent hover:text-ink'
  return (
    <div>
      <p className="eyebrow">Administração</p>
      <nav className="mt-2 mb-8 flex gap-2 border-b border-line" aria-label="Administração">
        <Link to="/admin" className={tab} activeOptions={{ exact: true }} activeProps={{ className: '!text-ink !border-rust' }}>
          Visão geral
        </Link>
        <Link to="/admin/usuarios" className={tab} activeProps={{ className: '!text-ink !border-rust' }}>
          Usuários
        </Link>
        <Link to="/admin/projetos" className={tab} activeProps={{ className: '!text-ink !border-rust' }}>
          Projetos
        </Link>
      </nav>
      <Outlet />
    </div>
  )
}
