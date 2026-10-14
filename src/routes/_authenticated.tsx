import { Link, Outlet, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSupabaseBrowserClient } from '~/lib/supabase/browser'
import { getSession } from '~/server/session.functions'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/entrar', search: { redirect: location.href } })
    return session
  },
  component: Layout,
})

const NAV = [
  { to: '/', label: 'Álbum do dia', exact: true },
  { to: '/historico', label: 'Histórico' },
  { to: '/estatisticas', label: 'Minhas estatísticas' },
  { to: '/grupo', label: 'Grupo' },
  { to: '/importar', label: 'Importar / Exportar' },
] as const

function Layout() {
  const { viewer } = Route.useRouteContext()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut()
    await router.invalidate()
    await router.navigate({ to: '/entrar', search: { redirect: undefined } })
  }

  const linkClass =
    'block px-3 py-2 font-mono text-[0.72rem] tracking-[0.14em] uppercase text-ink-soft no-underline hover:text-ink border-b-2 border-transparent'
  const activeClass = '!text-ink !border-rust'

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75 sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-baseline gap-2 text-ink no-underline hover:text-ink">
            <span className="font-display text-2xl font-bold tracking-tight">1001</span>
            <span className="font-display text-2xl italic text-rust">álbuns</span>
          </Link>
          <button
            className="btn btn-sm lg:hidden"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
          <div className="hidden items-center gap-3 lg:flex">
            <span className="text-sm text-ink-soft">{viewer.name}</span>
            <button className="btn btn-sm btn-ghost" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
        <nav
          id="main-nav"
          aria-label="Principal"
          className={`mx-auto max-w-6xl px-2 lg:flex lg:items-center ${open ? 'block' : 'hidden'} pb-2 lg:pb-0`}
          onClick={() => setOpen(false)}
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={linkClass}
              activeProps={{ className: activeClass }}
              activeOptions={{ exact: 'exact' in item, includeSearch: false }}
            >
              {item.label}
            </Link>
          ))}
          <span className="hidden flex-1 lg:block" />
          <Link to="/configuracoes" className={linkClass} activeProps={{ className: activeClass }}>
            Configurações
          </Link>
          {viewer.isAdmin && (
            <Link to="/admin" className={linkClass} activeProps={{ className: activeClass }}>
              Administração
            </Link>
          )}
          <button className={`${linkClass} lg:hidden w-full text-left cursor-pointer`} onClick={logout}>
            Sair ({viewer.name})
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center">
        <hr className="rule" />
        <p className="eyebrow">Lado B · 1001 álbuns para ouvir antes de morrer</p>
      </footer>
    </div>
  )
}
