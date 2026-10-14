import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseUrl } from './env'

let client: SupabaseClient | undefined

/** Cliente do navegador: usado só para autenticação. A sessão fica em cookies, visíveis ao servidor. */
export function getSupabaseBrowserClient(): SupabaseClient {
  client ??= createBrowserClient(supabaseUrl(), supabasePublishableKey())
  return client
}
