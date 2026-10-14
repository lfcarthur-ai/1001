// Gera a migration de seed do projeto "1001 Álbuns" a partir de data/albums.csv,
// usando o mesmo parser da tela de criação de projetos.
// Uso: npm run seed:generate
import { readFileSync, writeFileSync } from 'node:fs'
import { decodeCsv } from '../src/lib/csv'
import { parseCatalogCsv } from '../src/lib/catalog-csv'

const SRC = 'data/albums.csv'
const OUT = 'supabase/migrations/20261014000006_seed_1001_albuns.sql'

const { albums, skipped, duplicates } = parseCatalogCsv(decodeCsv(readFileSync(SRC)))
const lit = (v: string | number | null) =>
  v === null ? 'null' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`

const values = albums
  .map((a, i) => `  (${i + 1}, ${lit(a.artist)}, ${lit(a.title)}, ${lit(a.year)}, ${lit(a.run_time)}, ${lit(a.genre)})`)
  .join(',\n')

const sql = `-- Gerado por scripts/generate-seed.ts a partir de ${SRC} (${albums.length} álbuns). Não edite à mão.
-- Primeiro projeto: "1001 Álbuns", já ativo.
with p as (
  insert into public.projects (name, status, activated_at)
  values ('1001 Álbuns', 'active', now())
  returning id
)
insert into public.albums (project_id, position, artist, title, year, run_time, genre)
select p.id, v.position, v.artist, v.title, v.year, v.run_time, v.genre
from p, (values
${values}
) as v(position, artist, title, year, run_time, genre);
`
writeFileSync(OUT, sql)
console.log(`${OUT}: ${albums.length} álbuns (${skipped.length} linhas ignoradas, ${duplicates} duplicadas)`)
