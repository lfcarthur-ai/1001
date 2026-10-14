// Somente servidor: importar apenas dentro de handlers de server functions / server routes.
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCookies, setCookie } from '@tanstack/react-start/server'
import { supabasePublishableKey, supabaseUrl } from './env'

/** Cliente com a sessão do usuário (cookies): todas as consultas passam pela RLS. */
export function getSupabaseServerClient(): SupabaseClient {
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }))
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) setCookie(name, value, options)
      },
    },
  })
}

/** Cliente com service role (ignora RLS). Usar só para enriquecimento, cron e ações já autorizadas. */
export function getSupabaseAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Defina SUPABASE_SERVICE_ROLE_KEY.')
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } })
}
