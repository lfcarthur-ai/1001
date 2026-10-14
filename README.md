# 1001 Álbuns — plataforma do grupo

Plataforma fechada, em português, para o grupo acompanhar a lista **“1001 álbuns para ouvir antes de morrer”**.
Todo dia, à meia-noite (horário de Brasília), um álbum que o administrador ainda não ouviu é sorteado como
**álbum do dia**, o mesmo para todos. Cada pessoa dá uma nota de 0,5 a 5 estrelas, diz se o álbum deveria estar
na lista e comenta; a plataforma mostra histórico, estatísticas individuais e do grupo, importa históricos
legados e exporta tudo em CSV.

**Stack:** TanStack Start (React 19, SSR) · Supabase (Postgres, Auth, RLS, pg_cron, pg_net, pg_trgm) ·
Tailwind CSS 4 · recharts · papaparse.

## Projetos

Cada lista de álbuns é um **projeto**. O primeiro, “1001 Álbuns”, vem de `data/albums.csv` (1.089 álbuns) e já
nasce ativo. Em **Administração → Projetos** o administrador cria um projeto novo (nome + CSV no formato
`Artist, Title, Release Date, Run Time, Genre`), confere a pré-visualização (rascunho invisível para os demais)
e ativa. Só um projeto fica ativo por vez (índice único parcial no banco); ao ativar outro, o anterior é
encerrado, para de ter sorteios e suas avaliações continuam visíveis. Histórico, estatísticas e barra de
progresso têm abas por projeto (padrão: o ativo; encerrados marcados como “encerrado”).

## Páginas

| Rota | Página |
|---|---|
| `/entrar`, `/cadastrar` | Login e cadastro (qualquer pessoa com o link). A conta **lfcarthur@gmail.com** recebe o papel de administrador automaticamente. |
| `/` | Álbum do dia: capa, ficha, links Wikipedia/RateYourMusic, nota com meias estrelas, “deveria estar na lista?”, comentário, avaliações do grupo. |
| `/historico` | Ordem, data, mini capa, álbum, artista, minha nota, média global, links; filtros por gênero, década e nota; ver o histórico de outra pessoa. |
| `/album/:id` | Detalhe do álbum com todas as avaliações. |
| `/estatisticas` | Por década, gênero e país (quantidade, minha média, média do grupo, diferença), média por ano, outliers, % “deveria estar” eu × grupo, comparação com cada usuário. |
| `/grupo` | Progresso, distribuição de notas, melhor/pior década e gênero, top/bottom 5, mais controversos (desvio padrão), breakdowns, tabela de sorteados. “Ver mais” em `/grupo/ranking/:tipo`. |
| `/importar` | Importação do CSV legado com revisão; exportação CSV de cada aba. |
| `/configuracoes` | Nome, e-mail e troca de senha. |
| `/admin` | Só para administradores: enriquecimento em lote, usuários (dados e papéis) e projetos. |

## Regras garantidas no banco

- Só é possível avaliar álbuns já sorteados (política RLS em `ratings`), e cada um só edita as próprias notas.
- Nota de 0,5 a 5 em passos de 0,5 (`check`), uma por usuário e álbum (`unique`).
- Catálogo somente leitura para usuários; escrita só do administrador, via `create_project`.
- Sorteio apenas no projeto ativo, entre álbuns sem registro em `daily_picks`; um álbum do dia por data.
- Rotas e server functions de administração revalidam `has_role(auth.uid(), 'admin')` no servidor.

`daily_picks` também guarda o histórico legado importado pelo administrador (`source = 'importacao'`), que pode
repetir datas. Por isso a unicidade da data vale para os sorteios (`source = 'sorteio'`) e por projeto — como só
há um projeto ativo, na prática é “um álbum do dia por data” e a troca de projeto no meio do dia não conflita.

## Como rodar localmente

Requisitos: Node 22+, Docker (para o Supabase local) e a [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
npm install
npx supabase start          # sobe Postgres/Auth/REST e aplica supabase/migrations (inclui o seed)
cp .env.example .env        # preencha com a URL e as chaves exibidas pelo comando acima
npm run dev                 # http://localhost:3000
```

Cadastre-se com `lfcarthur@gmail.com` para ter a conta de administrador.

### Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | build + servidor | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build + servidor | Chave pública (anon/publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | só servidor | Usada no cron, no enriquecimento e na edição de e-mail pelo admin |
| `CRON_SECRET` | só servidor | Segredo da rota `/api/public/cron/daily-pick` |
| `ENRICH_USER_AGENT` | só servidor | User-Agent com contato, exigido pelo MusicBrainz |

## Produção

1. **Banco:** `npx supabase link --project-ref <ref>` e `npx supabase db push` (aplica as migrations, o seed e
   agenda o cron). Em Authentication → URL Configuration, defina o *Site URL* do app. Se quiser cadastro sem
   confirmação de e-mail, desligue “Confirm email”.
2. **Segredos do cron no Vault** (SQL Editor):
   ```sql
   select vault.create_secret('https://seu-app.exemplo.com', 'app_url');
   select vault.create_secret('<mesmo valor de CRON_SECRET>', 'cron_secret');
   ```
3. **App:** `npm run build` gera `.output/` (Nitro). `node .output/server/index.mjs` roda em qualquer host Node;
   há um `Dockerfile` (passe `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` como build args). Para Vercel,
   Netlify ou Cloudflare, troque o preset do Nitro/plugin em `vite.config.ts`.

### Sorteio diário

- `pg_cron` chama `public.call_daily_pick_endpoint()` às **03:00 UTC** (00:00 em Brasília), que faz um POST em
  `/api/public/cron/daily-pick` com `Authorization: Bearer <cron_secret>` via `pg_net`.
- A rota chama `pick_daily_album()` (insert com `ON CONFLICT DO NOTHING`, então é idempotente), enriquece o álbum
  do dia e um lote pequeno de pendentes.
- Redes de segurança: às 03:05 UTC o próprio banco roda `pick_daily_album_for(today_brt())`, e a página inicial
  cria o sorteio do dia se ele ainda não existir.

### Enriquecimento

MusicBrainz (release-group, data, país do artista, links) → Cover Art Archive (capa) → Wikidata/Wikipedia
(artigo, preferindo pt.wikipedia; busca na Wikipedia como fallback) → link do RateYourMusic montado por slug (o
site não tem API e o link pode falhar em nomes ambíguos). As chamadas ao MusicBrainz são serializadas com
intervalo ≥ 1,1 s; o resultado fica em cache nas colunas do álbum e cada álbum tem no máximo 3 tentativas
automáticas (o administrador pode reprocessar na página do álbum).

### Importação de histórico legado

CSV com `Artist, Album, Released, Rating, Notes, Global Rating, Origin, Generated Date` (Global Rating e Origin
são ignorados), lido no navegador com papaparse. O casamento tem três camadas:

1. normalização (`public.f_normalize`: minúsculas, sem acentos, aspas, pontuação e artigos) + match exato de
   artista/álbum/ano;
2. 3 a 5 candidatos por similaridade de trigramas (`pg_trgm`), com busca livre no catálogo;
3. tela de revisão manual e confirmação em lote (`apply_import_batch`).

O histórico do **administrador** entra em `daily_picks` com a data de *Generated Date* (sai do sorteio). Para os
**demais**, notas de álbuns ainda não sorteados são descartadas automaticamente — o administrador deve importar
primeiro. Avaliações existentes só são sobrescritas se a opção for marcada.

## Testes

```bash
npm test            # vitest: normalização, parsers CSV, formatação/exportação, enriquecimento (fetch simulado)
npm run test:db     # aplica as migrations num Postgres local (stub do Supabase) e roda tests/db/*.sql
npm run typecheck
npm run build
```

`tests/db` cobre RLS (anônimo, usuário, admin), admin automático, sorteio idempotente, regras de nota,
importação admin × usuário, estatísticas e ciclo de vida dos projetos.

## Estrutura

```
supabase/migrations/   schema, RLS, funções (sorteio, projetos, importação), estatísticas, cron, seed
src/routes/            páginas (TanStack Router, arquivos) — protegidas sob _authenticated/
src/routes/api/public/cron/daily-pick.ts   rota do cron
src/server/            server functions (auth/admin validados no servidor)
src/lib/               normalização, CSV, formatação, exportação, enriquecimento, clientes Supabase
src/components/        capa, estrelas, abas de projeto, gráficos, tabelas
scripts/               gerador do seed a partir de data/albums.csv e runner dos testes de banco
```

Para regenerar o seed depois de alterar `data/albums.csv`: `npm run seed:generate`.
