import { useNavigate, useRouterState } from '@tanstack/react-router'

/** Seletor "ver como": troca o usuário observado mantendo os demais filtros. */
export function UserPicker({ users, current, viewerId }: { users: { id: string; name: string }[]; current: string; viewerId: string }) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <label className="flex items-center gap-2">
      <span className="eyebrow">Usuário</span>
      <select
        className="select !w-auto !py-1 text-sm"
        value={current}
        onChange={(e) =>
          navigate({
            to: pathname,
            search: (prev: Record<string, unknown>) => ({ ...prev, usuario: e.target.value === viewerId ? undefined : e.target.value }),
          })
        }
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
            {u.id === viewerId ? ' (você)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
