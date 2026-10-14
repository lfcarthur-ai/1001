// Exportações CSV de cada aba (histórico, estatísticas individuais, grupo).
import { downloadCsv, num, type Cell } from './export-csv'
import { dimLabel, type Dimension } from './format'
import { rymUrl } from './enrich/rym'
import type { GroupStats, HistoryRow, UserStats } from './types'

export function exportHistory(rows: HistoryRow[], userName: string, projectName: string) {
  downloadCsv(
    `historico-${projectName}-${userName}.csv`,
    ['Ordem', 'Data do sorteio', 'Origem', 'Artista', 'Álbum', 'Ano', 'Gênero', 'País', 'Nota', 'Deveria estar na lista', 'Comentário', 'Média global', 'Votos', 'Wikipedia', 'RateYourMusic'],
    rows.map((r) => [
      r.ord, r.pick_date, r.source, r.artist, r.title, r.year, r.genre, r.country, num(r.my_score, 1),
      r.my_should_be_in_list, r.my_comment, num(r.avg_score), r.votes, r.wikipedia_url, r.rym_url ?? rymUrl(r),
    ]),
  )
}

export function exportUserStats(s: UserStats, who: string, projectName: string) {
  const rows: Cell[][] = []
  for (const dim of ['decada', 'genero', 'pais', 'ano'] as const) {
    for (const r of s.breakdowns[dim] ?? []) {
      rows.push([dimLabelFor(dim), dimLabel(dim, r.key), r.n, num(r.user_avg), num(r.group_avg), num(r.delta)])
    }
  }
  for (const c of s.comparisons) rows.push(['Comparação', c.name, c.n, num(c.my_avg), num(c.their_avg), num(c.delta)])
  for (const o of [...s.outliers.acima, ...s.outliers.abaixo]) {
    rows.push(['Outlier', `${o.artist} — ${o.title}`, 1, num(o.user_score, 1), num(o.others_avg), num(o.delta)])
  }
  rows.push(['Deveria estar na lista', 'Usuário', s.should_be_in_list.user.n, num(s.should_be_in_list.user.pct), num(s.should_be_in_list.group.pct), null])
  downloadCsv(`estatisticas-${projectName}-${who}.csv`, ['Seção', 'Categoria', 'Álbuns', 'Média do usuário', 'Média do grupo / outro', 'Diferença'], rows)
}

const dimLabelFor = (d: Dimension) => ({ decada: 'Década', genero: 'Gênero', pais: 'País', ano: 'Ano' })[d]

export function exportGroup(s: GroupStats, rows: HistoryRow[], projectName: string) {
  const out: Cell[][] = rows.map((r) => [
    r.ord, r.pick_date, r.artist, r.title, r.year, r.genre, r.country, num(r.avg_score), r.votes, num(r.std),
  ])
  out.push([])
  for (const dim of ['decada', 'genero', 'pais'] as const) {
    for (const b of s.breakdowns[dim] ?? []) out.push([dim, null, null, dimLabel(dim, b.key), null, null, null, num(b.avg), b.votes, b.n])
  }
  downloadCsv(
    `grupo-${projectName}.csv`,
    ['Ordem / Seção', 'Data do sorteio', 'Artista', 'Álbum / Categoria', 'Ano', 'Gênero', 'País', 'Média', 'Votos', 'Desvio padrão / Álbuns'],
    out,
  )
}
