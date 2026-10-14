-- Estatísticas por projeto (padrão: projeto ativo). Executam com as permissões de quem
-- chama (RLS): avaliações e sorteios são visíveis para todo o grupo autenticado.

create or replace function public.resolve_project(p_project bigint)
returns bigint language sql stable set search_path = public as $$
  select coalesce(p_project, public.active_project_id())
$$;

-- Álbuns sorteados do projeto, na ordem de audição.
create or replace function public.picked_albums(p_project bigint)
returns table (
  ord int, pick_date date, source text, album_id bigint, artist text, title text, year int,
  decade int, genre text, country text, cover_url text, wikipedia_url text, rym_url text
)
language sql stable set search_path = public as $$
  select (row_number() over (order by dp.pick_date, dp.id))::int, dp.pick_date, dp.source,
         a.id, a.artist, a.title, a.year, (a.year / 10) * 10, a.genre, a.country,
         a.cover_url, a.wikipedia_url, a.rym_url
    from public.daily_picks dp
    join public.albums a on a.id = dp.album_id
   where dp.project_id = public.resolve_project(p_project)
$$;

-- Notas válidas (não nulas) dadas a álbuns sorteados do projeto.
create or replace function public.project_scores(p_project bigint)
returns table (album_id bigint, user_id uuid, score numeric)
language sql stable set search_path = public as $$
  select r.album_id, r.user_id, r.score
    from public.ratings r
    join public.daily_picks dp on dp.album_id = r.album_id
   where dp.project_id = public.resolve_project(p_project) and r.score is not null
$$;

-- Dimensões de cada álbum sorteado: década, gênero (separado por "," ou ";") e país.
create or replace function public.album_dimensions(p_project bigint)
returns table (album_id bigint, dim text, key text, sort numeric)
language sql stable set search_path = public as $$
  select album_id, 'decada', decade::text, decade from public.picked_albums(p_project)
  union all
  select pa.album_id, 'genero', g.key, null
    from public.picked_albums(p_project) pa
    cross join lateral (
      select nullif(btrim(x), '') as key
        from regexp_split_to_table(coalesce(pa.genre, ''), '[;,]') as x
    ) g
   where g.key is not null or coalesce(btrim(pa.genre), '') = ''
  union all
  select album_id, 'pais', country, null from public.picked_albums(p_project)
$$;

-- Tabela de todos os sorteados com média, votos e desvio padrão (e a nota de p_user).
create or replace function public.history_rows(p_project bigint default null, p_user uuid default null)
returns table (
  ord int, pick_date date, source text, album_id bigint, artist text, title text, year int,
  decade int, genre text, country text, cover_url text, wikipedia_url text, rym_url text,
  avg_score numeric, votes int, std numeric, reviews int,
  my_score numeric, my_should_be_in_list boolean, my_comment text
)
language sql stable set search_path = public as $$
  select pa.*,
         round(agg.avg_score, 4), coalesce(agg.votes, 0)::int, round(agg.std, 4), coalesce(agg.reviews, 0)::int,
         mine.score, mine.should_be_in_list, mine.comment
    from public.picked_albums(p_project) pa
    left join lateral (
      select avg(r.score) as avg_score,
             count(r.score) as votes,
             case when count(r.score) >= 2 then stddev_pop(r.score) end as std,
             count(*) filter (where r.score is not null or nullif(btrim(r.comment), '') is not null) as reviews
        from public.ratings r where r.album_id = pa.album_id
    ) agg on true
    left join public.ratings mine on mine.album_id = pa.album_id and mine.user_id = p_user
   order by pa.ord
$$;

-- Rankings: melhores, piores, controversos (desvio padrão).
create or replace function public.album_ranking(p_project bigint, p_kind text, p_limit int default 5, p_offset int default 0)
returns table (ord int, album_id bigint, artist text, title text, year int, cover_url text,
               avg_score numeric, votes int, std numeric)
language sql stable set search_path = public as $$
  select h.ord, h.album_id, h.artist, h.title, h.year, h.cover_url, h.avg_score, h.votes, h.std
    from public.history_rows(p_project, null) h
   where h.votes > 0 and (p_kind <> 'controversos' or h.std is not null)
   order by
     case when p_kind = 'melhores' then -h.avg_score
          when p_kind = 'piores' then h.avg_score
          else -h.std end,
     h.votes desc, h.ord
   limit p_limit offset p_offset
$$;

-- ---------------------------------------------------------------- grupo
create or replace function public.group_stats(p_project bigint default null)
returns jsonb
language sql stable set search_path = public as $$
  with
  pid as (select public.resolve_project(p_project) as id),
  s as (select * from public.project_scores(p_project)),
  dims as (select * from public.album_dimensions(p_project)),
  breakdown as (
    select d.dim, d.key, max(d.sort) as sort, count(distinct s.album_id) as n, count(*) as votes, avg(s.score) as avg
      from dims d join s on s.album_id = d.album_id
     group by d.dim, d.key
  ),
  ranked as (
    -- melhor/pior entre categorias com pelo menos 3 álbuns (se nenhuma tiver, considera todas)
    select b.*,
           bool_or(n >= 3) over (partition by dim) as any_big
      from breakdown b where b.key is not null and b.dim in ('decada', 'genero')
  ),
  eligible as (select * from ranked where n >= 3 or not any_big),
  answered as (
    select r.should_be_in_list from public.ratings r
      join public.daily_picks dp on dp.album_id = r.album_id
     where dp.project_id = (select id from pid) and r.should_be_in_list is not null
  )
  select jsonb_build_object(
    'project_id', (select id from pid),
    'total', (select count(*) from public.albums where project_id = (select id from pid)),
    'drawn', (select count(*) from public.daily_picks where project_id = (select id from pid)),
    'votes', (select count(*) from s),
    'avg', (select round(avg(score), 4) from s),
    'distribution', (
      select jsonb_agg(jsonb_build_object('stars', v, 'count', (select count(*) from s where s.score = v)) order by v)
        from generate_series(0.5, 5.0, 0.5) as v
    ),
    'breakdowns', coalesce((
      select jsonb_object_agg(dim, rows) from (
        select dim, jsonb_agg(jsonb_build_object('key', key, 'n', n, 'votes', votes, 'avg', round(avg, 4))
                              order by key is null, sort nulls last, n desc, key) as rows
          from breakdown group by dim
      ) x), '{}'::jsonb),
    'best', (
      select jsonb_object_agg(dim, jsonb_build_object('key', key, 'n', n, 'avg', round(avg, 4)))
        from (select distinct on (dim) * from eligible order by dim, avg desc, n desc) x),
    'worst', (
      select jsonb_object_agg(dim, jsonb_build_object('key', key, 'n', n, 'avg', round(avg, 4)))
        from (select distinct on (dim) * from eligible order by dim, avg asc, n desc) x),
    'top', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.album_ranking(p_project, 'melhores', 5) t),
    'bottom', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.album_ranking(p_project, 'piores', 5) t),
    'controversial', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.album_ranking(p_project, 'controversos', 5) t),
    'should_be_in_list', jsonb_build_object(
      'n', (select count(*) from answered),
      'yes', (select count(*) from answered where should_be_in_list),
      'pct', (select round(avg(case when should_be_in_list then 1 else 0 end), 4) from answered))
  )
$$;

-- ---------------------------------------------------------------- individual
create or replace function public.user_stats(p_project bigint, p_user uuid)
returns jsonb
language sql stable set search_path = public as $$
  with
  pid as (select public.resolve_project(p_project) as id),
  s as (select * from public.project_scores(p_project)),
  mine as (select album_id, score from s where user_id = p_user),
  album_agg as (select album_id, sum(score) as total, count(*) as cnt from s group by album_id),
  dims as (
    select * from public.album_dimensions(p_project)
    union all
    select album_id, 'ano', year::text, year from public.picked_albums(p_project)
  ),
  breakdown as (
    select d.dim, d.key, max(d.sort) as sort, count(*) as n, avg(m.score) as user_avg,
           sum(aa.total) / sum(aa.cnt) as group_avg
      from mine m
      join dims d on d.album_id = m.album_id
      join album_agg aa on aa.album_id = m.album_id
     group by d.dim, d.key
  ),
  outliers as (
    select pa.album_id, pa.artist, pa.title, pa.year, pa.cover_url, m.score as user_score,
           o.avg as others_avg, o.n as others_n, m.score - o.avg as delta
      from mine m
      join public.picked_albums(p_project) pa on pa.album_id = m.album_id
      join lateral (select avg(score) as avg, count(*) as n from s
                     where s.album_id = m.album_id and s.user_id <> p_user) o on o.n > 0
  ),
  answered as (
    select r.user_id, r.should_be_in_list from public.ratings r
      join public.daily_picks dp on dp.album_id = r.album_id
     where dp.project_id = (select id from pid) and r.should_be_in_list is not null
  ),
  pairs as (
    select t.user_id as other, m.score as x, t.score as y
      from mine m join s t on t.album_id = m.album_id and t.user_id <> p_user
  ),
  comparisons as (
    select p.id as user_id, p.name,
           count(pr.x) as n, avg(pr.x) as my_avg, avg(pr.y) as their_avg,
           avg(abs(pr.x - pr.y)) as mad,
           case when count(pr.x) >= 3 then corr(pr.x::float8, pr.y::float8) end as corr
      from public.profiles p
      left join pairs pr on pr.other = p.id
     where p.id <> p_user
     group by p.id, p.name
  )
  select jsonb_build_object(
    'project_id', (select id from pid),
    'summary', jsonb_build_object(
      'rated', (select count(*) from mine),
      'drawn', (select count(*) from public.daily_picks where project_id = (select id from pid)),
      'user_avg', (select round(avg(score), 4) from mine),
      'group_avg_same', (select round(sum(total) / nullif(sum(cnt), 0), 4) from album_agg where album_id in (select album_id from mine)),
      'group_avg', (select round(avg(score), 4) from s)),
    'breakdowns', coalesce((
      select jsonb_object_agg(dim, rows) from (
        select dim, jsonb_agg(jsonb_build_object(
                 'key', key, 'n', n, 'user_avg', round(user_avg, 4), 'group_avg', round(group_avg, 4),
                 'delta', round(user_avg - group_avg, 4))
               order by key is null, sort nulls last, n desc, key) as rows
          from breakdown group by dim
      ) x), '{}'::jsonb),
    'outliers', jsonb_build_object(
      'acima', (select coalesce(jsonb_agg(to_jsonb(o) order by delta desc), '[]')
                  from (select * from outliers where delta > 0 order by delta desc limit 5) o),
      'abaixo', (select coalesce(jsonb_agg(to_jsonb(o) order by delta asc), '[]')
                   from (select * from outliers where delta < 0 order by delta asc limit 5) o)),
    'should_be_in_list', jsonb_build_object(
      'user', jsonb_build_object(
        'n', (select count(*) from answered where user_id = p_user),
        'yes', (select count(*) from answered where user_id = p_user and should_be_in_list),
        'pct', (select round(avg(case when should_be_in_list then 1 else 0 end), 4) from answered where user_id = p_user)),
      'group', jsonb_build_object(
        'n', (select count(*) from answered),
        'yes', (select count(*) from answered where should_be_in_list),
        'pct', (select round(avg(case when should_be_in_list then 1 else 0 end), 4) from answered))),
    'comparisons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', user_id, 'name', name, 'n', n,
               'my_avg', round(my_avg, 4), 'their_avg', round(their_avg, 4),
               'delta', round(my_avg - their_avg, 4), 'mad', round(mad, 4),
               'agreement', round(1 - mad / 4.5, 4), 'corr', round(corr::numeric, 4))
             order by n = 0, 1 - mad / 4.5 desc nulls last, lower(name))
        from comparisons), '[]'::jsonb)
  )
$$;
