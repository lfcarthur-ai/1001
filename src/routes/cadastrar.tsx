import { useState, type FormEvent } from 'react'
import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AuthFrame } from '~/components/AuthFrame'
import { getSupabaseBrowserClient } from '~/lib/supabase/browser'
import { getSession } from '~/server/session.functions'

const MIN_PASSWORD = 8

export const Route = createFileRoute('/cadastrar')({
  beforeLoad: async () => {
    if (await getSession()) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Cadastrar · 1001 Álbuns' }] }),
  component: RegisterPage,
})

function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name')).trim()
    const email = String(form.get('email')).trim().toLowerCase()
    const password = String(form.get('password'))
    if (!name || name.length > 80) return setError('Informe um nome (até 80 caracteres).')
    if (password.length < MIN_PASSWORD) return setError(`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`)
    if (password !== form.get('password2')) return setError('As senhas não conferem.')

    setBusy(true)
    setError(null)
    const { data, error } = await getSupabaseBrowserClient().auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: `${window.location.origin}/` },
    })
    setBusy(false)
    if (error) {
      setError(/already|registered/i.test(error.message) ? 'Este e-mail já está cadastrado.' : error.message)
      return
    }
    if (!data.session) {
      setPending(email)
      return
    }
    await router.invalidate()
    await router.navigate({ to: '/' })
  }

  if (pending) {
    return (
      <AuthFrame title="Confira seu e-mail">
        <p className="flash-ok">
          Enviamos um link de confirmação para <strong>{pending}</strong>. Depois de confirmar, é só entrar.
        </p>
        <Link to="/entrar" search={{ redirect: undefined }} className="btn mt-6">
          Ir para o login
        </Link>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title="Criar conta">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <p className="flash-error">{error}</p>}
        <div>
          <label className="label" htmlFor="name">Nome</label>
          <input id="name" name="name" autoComplete="name" required maxLength={80} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">Senha</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password2">Confirmar</label>
            <input id="password2" name="password2" type="password" autoComplete="new-password" required className="input" />
          </div>
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">
        Já tem conta? <Link to="/entrar" search={{ redirect: undefined }}>Entrar</Link>
      </p>
    </AuthFrame>
  )
}
