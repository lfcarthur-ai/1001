// Normalização para comparar nomes de artistas/álbuns. Mesmas regras de
// public.f_normalize (supabase/migrations/..._schema.sql).

const ARTICLES = new Set([
  'the', 'a', 'an', 'and',
  'o', 'os', 'as', 'um', 'uma',
  'el', 'la', 'los', 'las',
  'le', 'les', 'l',
  'der', 'die', 'das',
  'il', 'lo', 'gli',
])

const APOSTROPHES = /['‘’‚‛′`´]/g

export function stripAccents(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '')
}

export function normalize(text: string | null | undefined): string {
  if (!text) return ''
  const s = stripAccents(String(text).replace(APOSTROPHES, ''))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]|_/gu, ' ')
  return s
    .split(/\s+/)
    .filter((w) => w && !ARTICLES.has(w))
    .join(' ')
}
