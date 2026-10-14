import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, check } from './middleware'

export const updateMyName = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: { name: string }) => {
    const name = String(d.name ?? '').trim()
    if (!name || name.length > 80) throw new Error('Informe um nome (até 80 caracteres).')
    return { name }
  })
  .handler(async ({ context, data }) => {
    check(await context.supabase.from('profiles').update({ name: data.name }).eq('id', context.user.id))
    return { ok: true }
  })
