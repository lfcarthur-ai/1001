import { useState, type FormEvent } from 'react'
import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AuthFrame } from '~/components/AuthFrame'
import { getSupabaseBrowserClient } from '~/lib/supabase/browser'
import { getSession } from '~/server/session.functions'

export const Route = createFileRoute('/entrar')({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === 'string' && s.redirect.startsWith('/') && !s.redirect.startsWith('//') ? s.redirect : undefined,
  }),
  beforeLoad: async () => {
    if (await getSession()) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Entrar · 1001 Álbuns' }] }),
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { redirect: next } = Route.useSearch()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: String(form.get('email')).trim().toLowerCase(),
      password: String(form.get('password')),
    })
    if (error) {
      setBusy(false)
      setError(error.message.includes('not confirmed') ? 'Confirme seu e-mail antes de entrar.' : 'E-mail ou senha inválidos.')
      return
    }
    await router.invalidate()
    await router.navigate({ to: next ?? '/' })
  }

  return (
    <AuthFrame title="Entrar">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <p className="flash-error">{error}</p>}
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">
        Ainda não tem conta? <Link to="/cadastrar">Cadastre-se</Link>
      </p>
    </AuthFrame>
  )
}
