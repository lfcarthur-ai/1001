export function supabaseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  if (!url) throw new Error('Defina VITE_SUPABASE_URL (veja .env.example).')
  return url
}

export function supabasePublishableKey(): string {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!key) throw new Error('Defina VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example).')
  return key
}
