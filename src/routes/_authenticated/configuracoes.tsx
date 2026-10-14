import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { PageHeader } from '~/components/PageHeader'
import { updateMyName } from '~/server/profile.functions'
import { getSupabaseBrowserClient } from '~/lib/supabase/browser'

export const Route = createFileRoute('/_authenticated/configuracoes')({
  head: () => ({ meta: [{ title: 'Configurações · 1001 Álbuns' }] }),
  component: Settings,
})

type Msg = { ok: boolean; text: string } | null

function Settings() {
  const { viewer } = Route.useRouteContext()
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow={viewer.email} title="Configurações" />
      <div className="space-y-8">
        <NameForm initial={viewer.name} />
        <EmailForm initial={viewer.email} isOwnerAdmin={viewer.email === 'lfcarthur@gmail.com'} />
        <PasswordForm email={viewer.email} />
      </div>
    </div>
  )
}

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null
  return <p className={msg.ok ? 'flash-ok' : 'flash-error'}>{msg.text}</p>
}

function NameForm({ initial }: { initial: string }) {
  const router = useRouter()
  const save = useServerFn(updateMyName)
  const [msg, setMsg] = useState<Msg>(null)
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    try {
      await save({ data: { name: String(new FormData(e.currentTarget).get('name')) } })
      setMsg({ ok: true, text: 'Nome atualizado.' })
      await router.invalidate()
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Erro ao salvar.' })
    }
  }
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="text-2xl font-semibold">Nome</h2>
      <Feedback msg={msg} />
      <input name="name" defaultValue={initial} maxLength={80} required className="input" aria-label="Nome" />
      <button className="btn">Salvar nome</button>
    </form>
  )
}

function EmailForm({ initial, isOwnerAdmin }: { initial: string; isOwnerAdmin: boolean }) {
  const [msg, setMsg] = useState<Msg>(null)
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email')).trim().toLowerCase()
    if (email === initial) return
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ email })
    setMsg(
      error
        ? { ok: false, text: /already/i.test(error.message) ? 'Este e-mail já está cadastrado.' : error.message }
        : { ok: true, text: 'Enviamos um link de confirmação para o novo endereço. A troca vale após a confirmação.' },
    )
  }
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="text-2xl font-semibold">E-mail</h2>
      <Feedback msg={msg} />
      {isOwnerAdmin ? (
        <p className="text-sm text-ink-soft">O e-mail da conta administradora ({initial}) não pode ser alterado.</p>
      ) : (
        <>
          <input name="email" type="email" defaultValue={initial} required className="input" aria-label="E-mail" />
          <button className="btn">Alterar e-mail</button>
        </>
      )}
    </form>
  )
}

function PasswordForm({ email }: { email: string }) {
  const [msg, setMsg] = useState<Msg>(null)
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const current = String(f.get('current'))
    const password = String(f.get('password'))
    if (password.length < 8) return setMsg({ ok: false, text: 'A nova senha deve ter pelo menos 8 caracteres.' })
    if (password !== f.get('password2')) return setMsg({ ok: false, text: 'As senhas não conferem.' })
    const supabase = getSupabaseBrowserClient()
    // Confirma a senha atual antes de trocar.
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current })
    if (authError) return setMsg({ ok: false, text: 'Senha atual incorreta.' })
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return setMsg({ ok: false, text: error.message })
    form.reset()
    setMsg({ ok: true, text: 'Senha alterada.' })
  }
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="text-2xl font-semibold">Trocar senha</h2>
      <Feedback msg={msg} />
      <div>
        <label className="label" htmlFor="current">Senha atual</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">Nova senha</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password2">Confirmar</label>
          <input id="password2" name="password2" type="password" autoComplete="new-password" required className="input" />
        </div>
      </div>
      <button className="btn">Trocar senha</button>
    </form>
  )
}
