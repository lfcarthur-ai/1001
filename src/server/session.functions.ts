import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient } from '~/lib/supabase/server'
import type { Project, Viewer } from '~/lib/types'

/** Usuário logado (validado no Supabase Auth) + projetos visíveis. null se não houver sessão. */
export const getSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ viewer: Viewer; projects: Project[] } | null> => {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    const user = data.user

    const [profile, admin, projects] = await Promise.all([
      supabase.from('profiles').select('name, email').eq('id', user.id).maybeSingle(),
      supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
      supabase.from('projects').select('id, name, status, created_at, activated_at, closed_at').order('id'),
    ])
    return {
      viewer: {
        id: user.id,
        email: profile.data?.email ?? user.email ?? '',
        name: profile.data?.name ?? user.email ?? '',
        isAdmin: admin.data === true,
      },
      projects: (projects.data ?? []) as Project[],
    }
  },
)
