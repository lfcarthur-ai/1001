// Tipos das linhas retornadas pelo banco (numeric chega como number ou string pelo PostgREST).
export type Num = number | string | null

export type Project = {
  id: number
  name: string
  status: 'draft' | 'active' | 'closed'
  created_at: string
  activated_at: string | null
  closed_at: string | null
}

export type Album = {
  id: number
  project_id: number
  position: number
  artist: string
  title: string
  year: number | null
  run_time: string | null
  genre: string | null
  country: string | null
  release_date: string | null
  cover_url: string | null
  wikipedia_url: string | null
  rym_url: string | null
  mb_release_group_id: string | null
  enriched_at: string | null
  enrich_attempts: number
}

export type Rating = {
  id: number
  user_id: string
  album_id: number
  score: Num
  should_be_in_list: boolean | null
  comment: string | null
  created_at: string
  updated_at: string
}

export type RatingWithUser = Rating & { profiles: { name: string } | null }

export type Viewer = { id: string; email: string; name: string; isAdmin: boolean }

export type HistoryRow = {
  ord: number
  pick_date: string
  source: 'sorteio' | 'importacao'
  album_id: number
  artist: string
  title: string
  year: number | null
  decade: number | null
  genre: string | null
  country: string | null
  cover_url: string | null
  wikipedia_url: string | null
  rym_url: string | null
  avg_score: Num
  votes: number
  std: Num
  reviews: number
  my_score: Num
  my_should_be_in_list: boolean | null
  my_comment: string | null
}

export type RankingRow = {
  ord: number
  album_id: number
  artist: string
  title: string
  year: number | null
  cover_url: string | null
  avg_score: Num
  votes: number
  std: Num
}

export type GroupBreakdownRow = { key: string | null; n: number; votes: number; avg: Num }
export type CategoryScore = { key: string; n: number; avg: Num }
export type Share = { n: number; yes: number; pct: Num }

export type GroupStats = {
  project_id: number | null
  total: number
  drawn: number
  votes: number
  avg: Num
  distribution: { stars: Num; count: number }[]
  breakdowns: Partial<Record<'decada' | 'genero' | 'pais', GroupBreakdownRow[]>>
  best: Partial<Record<'decada' | 'genero', CategoryScore>> | null
  worst: Partial<Record<'decada' | 'genero', CategoryScore>> | null
  top: RankingRow[]
  bottom: RankingRow[]
  controversial: RankingRow[]
  should_be_in_list: Share
}

export type UserBreakdownRow = { key: string | null; n: number; user_avg: Num; group_avg: Num; delta: Num }
export type Outlier = {
  album_id: number
  artist: string
  title: string
  year: number | null
  cover_url: string | null
  user_score: Num
  others_avg: Num
  others_n: number
  delta: Num
}
export type Comparison = {
  user_id: string
  name: string
  n: number
  my_avg: Num
  their_avg: Num
  delta: Num
  mad: Num
  agreement: Num
  corr: Num
}

export type UserStats = {
  project_id: number | null
  summary: { rated: number; drawn: number; user_avg: Num; group_avg_same: Num; group_avg: Num }
  breakdowns: Partial<Record<'decada' | 'genero' | 'pais' | 'ano', UserBreakdownRow[]>>
  outliers: { acima: Outlier[]; abaixo: Outlier[] }
  should_be_in_list: { user: Share; group: Share }
  comparisons: Comparison[]
}

export type Candidate = { id: number; artist: string; title: string; year: number | null; picked: boolean; score: number }

export type ImportRow = {
  line: number
  artist: string
  album: string
  year: number | null
  score: number | null
  notes: string | null
  generated: string | null
  status: 'exato' | 'revisar' | 'nao_sorteado'
  album_id: number | null
  album_label: string | null
  candidates: Candidate[]
}

export type ImportSummary = {
  importadas: number
  sorteios: number
  ignoradas: number
  existentes: number
  duplicadas: number
  descartadas: string[]
}
