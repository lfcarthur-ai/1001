import { createMiddleware } from '@tanstack/react-start'
import { getSupabaseServerClient } from '~/lib/supabase/server'

/** Exige sessão válida (validada no Supabase Auth, não só lida do cookie). */
export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Sessão expirada. Entre novamente.')
  return next({ context: { supabase, user: data.user } })
})

/** Exige o papel admin (função has_role no banco). */
export const adminMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc('has_role', { _user_id: context.user.id, _role: 'admin' })
    if (error || data !== true) throw new Error('Apenas o administrador pode fazer isso.')
    return next()
  })

/** Converte erros do PostgREST em mensagens legíveis. */
export function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}
