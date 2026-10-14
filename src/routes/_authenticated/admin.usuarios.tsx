import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { listUsers, setAdminRole, updateUser, type AdminUser } from '~/server/admin.functions'
import { fmtDate } from '~/lib/format'

const OWNER = 'lfcarthur@gmail.com'

export const Route = createFileRoute('/_authenticated/admin/usuarios')({
  loader: () => listUsers(),
  component: Users,
})

function Users() {
  const users = Route.useLoaderData()
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <div>
      <h1 className="text-4xl font-semibold">Usuários</h1>
      <p className="mt-2 text-ink-soft">
        Qualquer pessoa com o link pode se cadastrar. A conta {OWNER} é sempre administradora.
      </p>
      <div className="table-wrap mt-6">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papéis</th>
              <th className="text-right">Avaliações</th>
              <th>Desde</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) =>
              editing === u.id ? (
                <EditRow key={u.id} user={u} onDone={() => setEditing(null)} />
              ) : (
                <tr key={u.id}>
                  <td className="font-display font-semibold">{u.name}</td>
                  <td className="text-sm">{u.email}</td>
                  <td>
                    {u.roles.includes('admin') ? <span className="chip chip-rust">admin</span> : <span className="chip">usuário</span>}
                  </td>
                  <td className="num text-right">{u.ratings}</td>
                  <td className="num text-xs">{fmtDate(u.created_at)}</td>
                  <td className="text-right">
                    <button className="btn btn-sm" onClick={() => setEditing(u.id)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EditRow({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const router = useRouter()
  const save = useServerFn(updateUser)
  const setRole = useServerFn(setAdminRole)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isOwner = user.email === OWNER

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await save({ data: { userId: user.id, name: String(f.get('name')), email: String(f.get('email')) } })
      const wantAdmin = f.get('admin') === 'on'
      if (wantAdmin !== user.roles.includes('admin')) await setRole({ data: { userId: user.id, admin: wantAdmin } })
      await router.invalidate()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="bg-paper-deep/40">
      <td colSpan={6}>
        <form onSubmit={onSubmit} className="grid items-end gap-3 py-2 md:grid-cols-[1fr_1.4fr_auto_auto]">
          {error && <p className="flash-error md:col-span-4">{error}</p>}
          <label>
            <span className="label">Nome</span>
            <input name="name" defaultValue={user.name} required maxLength={80} className="input" />
          </label>
          <label>
            <span className="label">E-mail</span>
            <input name="email" type="email" defaultValue={user.email} required readOnly={isOwner} className="input" />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              name="admin"
              defaultChecked={user.roles.includes('admin')}
              disabled={isOwner}
              className="h-4 w-4 accent-[var(--color-rust)]"
            />
            Administrador
            {isOwner && <input type="hidden" name="admin" value="on" />}
          </label>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy}>
              Salvar
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
              Cancelar
            </button>
          </div>
        </form>
      </td>
    </tr>
  )
}
