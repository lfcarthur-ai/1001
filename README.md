# 1001 Álbuns — clube de audição

Plataforma fechada para um grupo acompanhar a lista **“1001 álbuns para ouvir antes de morrer”**.
Todo dia, à meia-noite (horário de Brasília), um álbum ainda não ouvido é sorteado como **álbum do dia**,
o mesmo para todos. Os usuários avaliam (0,5 a 5 estrelas), indicam se o álbum deveria estar na lista,
comentam, e a plataforma gera estatísticas individuais e do grupo.

Stack: Python 3.11+, Flask, SQLAlchemy (SQLite por padrão; PostgreSQL via `DATABASE_URL`),
APScheduler e páginas renderizadas no servidor (sem build de front-end).

## Como rodar

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export SECRET_KEY="uma-chave-longa-e-aleatoria"
gunicorn -w 1 --threads 8 -b 0.0.0.0:8000 wsgi:app
# ou, em desenvolvimento: flask --app wsgi run --debug
```

Acesse `/cadastro`: **a primeira conta criada vira administradora**. Depois disso, qualquer pessoa com o
link de cadastro pode criar sua conta. Todas as demais páginas exigem login.

Com Docker: `docker build -t 1001 . && docker run -p 8000:8000 -e SECRET_KEY=... -v $PWD/instance:/app/instance 1001`.

### Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `SECRET_KEY` | (inseguro) | Chave de sessão. **Defina em produção.** |
| `DATABASE_URL` | `sqlite:///instance/app.db` | Banco de dados |
| `ALBUMS_CSV` | `data/albums.csv` | Catálogo carregado automaticamente se o banco estiver vazio |
| `SCHEDULER_ENABLED` | `1` | Liga o agendador (sorteio + enriquecimento) |
| `ENRICH_ENABLED` | `1` | Liga o enriquecimento automático |
| `ENRICH_BATCH_SIZE` / `ENRICH_INTERVAL_MINUTES` | `10` / `5` | Ritmo do enriquecimento em segundo plano |

## Catálogo

`data/albums.csv` contém os 1.089 álbuns (`Artist, Title, Release Date, Run Time, Genre`; também são aceitos
cabeçalhos em português: Artista, Nome do Álbum, Ano de Lançamento, Duração, Gênero). Ele é carregado na
primeira inicialização e não pode ser alterado pela interface. Para acrescentar manualmente:
`flask --app wsgi carregar-catalogo data/albums.csv` (só insere álbuns novos).

## Sorteio diário

- Tarefa agendada às 00:00 de `America/Sao_Paulo` escolhe aleatoriamente um álbum que **não está no histórico
  do administrador** (tabela de sorteios, que inclui o histórico legado importado pelo administrador).
- A data do álbum do dia é única no banco, então o sorteio nunca se repete no mesmo dia, mesmo com vários
  processos. Se o servidor estiver desligado à meia-noite, o sorteio acontece no primeiro acesso do dia.
- Se o histórico importado pelo administrador já tiver um álbum com a data de hoje, ele vira o álbum do dia.
- Só é possível avaliar álbuns já sorteados. Comando manual: `flask --app wsgi sortear`.

## Enriquecimento automático

Capa, link da Wikipedia, link do RateYourMusic, país de origem e data de lançamento completa vêm de APIs
públicas e gratuitas: **MusicBrainz** (identificação, data, país do artista, links), **Cover Art Archive**
(capa, com fallback na **iTunes Search API**), **Wikidata/Wikipedia** (artigo, preferindo pt.wikipedia).
O RateYourMusic não tem API: o link é montado pelo padrão de URL do site
(`/release/album/<artista>/<album>/`) e pode falhar em nomes ambíguos.

Roda em segundo plano (respeitando o limite de 1 req/s do MusicBrainz), priorizando álbuns já sorteados; o
álbum do dia é enriquecido logo após o sorteio. O administrador pode forçar lotes em **Administração** ou
reprocessar um álbum na página dele. Comando: `flask --app wsgi enriquecer --limite 50`.

## Importação de histórico legado

Em **Importar/Exportar**, envie um CSV com `Artist, Album, Released, Rating, Notes, Global Rating, Origin,
Generated Date` (Global Rating e Origin são ignorados). O casamento com o catálogo tem três camadas:

1. normalização (minúsculas, sem acentos, pontuação, artigos e aspas especiais) + match exato de artista/álbum/ano;
2. fuzzy matching (RapidFuzz) sugerindo de 3 a 5 candidatos;
3. tela de revisão manual (escolher sugestão, digitar outro álbum do catálogo ou ignorar) antes de confirmar.

- **Administrador:** os álbuns importados entram no histórico de sorteios com a data de *Generated Date*.
- **Demais usuários:** linhas de álbuns ainda não sorteados (comparando com o histórico do administrador)
  são descartadas automaticamente. Por isso o administrador deve importar primeiro.
- Avaliações já existentes só são sobrescritas se a opção for marcada.

## Exportação

Histórico, estatísticas individuais (de qualquer usuário) e estatísticas do grupo são exportados
separadamente em CSV (separador `;`, vírgula decimal, UTF-8 com BOM, para abrir direto no Excel).

## Perfis

- **Usuário:** avalia álbuns sorteados, edita os próprios dados e avaliações, vê histórico e estatísticas de todos.
- **Administrador:** além disso, edita dados de outros usuários (nome, e-mail, senha), promove/rebaixa
  administradores, desativa ou exclui contas. A plataforma sempre mantém ao menos um administrador ativo.

## Testes

```bash
pip install -r requirements-dev.txt
pytest
```
