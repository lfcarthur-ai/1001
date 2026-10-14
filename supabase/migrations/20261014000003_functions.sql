-- Funções de negócio: sorteio, projetos e importação de histórico legado.

create or replace function public.today_brt()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function public.active_project_id()
returns bigint language sql stable security definer set search_path = public as $$
  select id from public.projects where status = 'active'
$$;

create or replace function public.require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas o administrador pode fazer isso.' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------- sorteio
-- Sorteia o álbum do dia `p_date` no projeto ativo entre os álbuns que o administrador
-- ainda não ouviu (sem registro em daily_picks). Idempotente: a data é única por projeto.
create or replace function public.pick_daily_album_for(p_date date)
returns public.daily_picks
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_project bigint := public.active_project_id();
  v_pick public.daily_picks;
  v_album bigint;
  v_try int := 0;
begin
  if v_project is null then
    return null;
  end if;

  loop
    select * into v_pick from public.daily_picks
     where project_id = v_project and pick_date = p_date and source = 'sorteio';
    if found then
      return v_pick;
    end if;

    v_try := v_try + 1;
    exit when v_try > 5;

    select a.id into v_album
      from public.albums a
     where a.project_id = v_project
       and not exists (select 1 from public.daily_picks dp
                        where dp.project_id = v_project and dp.album_id = a.id)
     order by random()
     limit 1;

    if v_album is null then
      return null; -- todos os álbuns já foram sorteados
    end if;

    -- Conflito na data (outra execução simultânea) ou no álbum: tenta de novo / lê o vencedor.
    insert into public.daily_picks (project_id, album_id, pick_date, source)
    values (v_project, v_album, p_date, 'sorteio')
    on conflict do nothing;
  end loop;
  return null;
end $$;

-- Usada pela página inicial como fallback: sempre a data de hoje (Brasília).
create or replace function public.pick_daily_album()
returns public.daily_picks
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  return public.pick_daily_album_for(public.today_brt());
end $$;

revoke all on function public.pick_daily_album_for(date) from public, anon, authenticated;
grant execute on function public.pick_daily_album_for(date) to service_role;
revoke all on function public.pick_daily_album() from public, anon;
grant execute on function public.pick_daily_album() to authenticated, service_role;

-- Posição do álbum na ordem de audição do projeto.
create or replace function public.pick_position(p_album bigint)
returns integer language sql stable set search_path = public as $$
  select count(*)::int
    from public.daily_picks dp
    join public.daily_picks me on me.album_id = p_album and me.project_id = dp.project_id
   where (dp.pick_date, dp.id) <= (me.pick_date, me.id)
$$;

-- ---------------------------------------------------------------- projetos
-- Cria um projeto em rascunho a partir das linhas do CSV (já interpretadas no navegador).
-- p_albums: [{artist, title, year, run_time, genre}]
create or replace function public.create_project(p_name text, p_albums jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_count int;
begin
  perform public.require_admin();
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Informe o nome do projeto.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_albums) <> 'array' or jsonb_array_length(p_albums) = 0 then
    raise exception 'O CSV não tem álbuns.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_albums) > 20000 then
    raise exception 'O CSV tem álbuns demais (máximo 20.000).' using errcode = '22023';
  end if;

  insert into public.projects (name, status, created_by)
  values (btrim(p_name), 'draft', auth.uid())
  returning id into v_id;

  insert into public.albums (project_id, position, artist, title, year, run_time, genre)
  select v_id, row_number() over (order by r.ord), r.artist, r.title, r.year, r.run_time, r.genre
    from (
      select distinct on (btrim(e ->> 'artist'), btrim(e ->> 'title'), nullif(e ->> 'year', '')::int)
             ord,
             left(btrim(e ->> 'artist'), 500) as artist,
             left(btrim(e ->> 'title'), 500) as title,
             nullif(e ->> 'year', '')::int as year,
             nullif(btrim(e ->> 'run_time'), '') as run_time,
             nullif(btrim(e ->> 'genre'), '') as genre
        from jsonb_array_elements(p_albums) with ordinality as x(e, ord)
       where coalesce(btrim(e ->> 'artist'), '') <> '' and coalesce(btrim(e ->> 'title'), '') <> ''
       order by btrim(e ->> 'artist'), btrim(e ->> 'title'), nullif(e ->> 'year', '')::int, ord
    ) r;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Nenhuma linha válida (Artist e Title são obrigatórios).' using errcode = '22023';
  end if;
  return v_id;
end $$;

-- Ativa um projeto em rascunho; o projeto ativo anterior é encerrado (para de ter sorteios).
create or replace function public.activate_project(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  perform public.require_admin();
  select status into v_status from public.projects where id = p_id for update;
  if v_status is null then
    raise exception 'Projeto não encontrado.' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Só projetos em rascunho podem ser ativados.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.albums where project_id = p_id) then
    raise exception 'O projeto não tem álbuns.' using errcode = '22023';
  end if;

  update public.projects set status = 'closed', closed_at = now() where status = 'active';
  update public.projects set status = 'active', activated_at = now() where id = p_id;
end $$;

create or replace function public.delete_draft_project(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  delete from public.projects where id = p_id and status = 'draft';
  if not found then
    raise exception 'Só projetos em rascunho podem ser descartados.' using errcode = '22023';
  end if;
end $$;

revoke all on function public.create_project(text, jsonb), public.activate_project(bigint),
  public.delete_draft_project(bigint) from public, anon;
grant execute on function public.create_project(text, jsonb), public.activate_project(bigint),
  public.delete_draft_project(bigint) to authenticated;

-- ---------------------------------------------------------------- catálogo: busca
create or replace function public.search_albums(p_project bigint, p_query text, p_limit int default 10)
returns table (id bigint, artist text, title text, year int, picked boolean, score real)
language sql
stable
set search_path = public, extensions
as $$
  with q as (select public.f_normalize(p_query) as n)
  select a.id, a.artist, a.title, a.year,
         exists (select 1 from public.daily_picks dp where dp.album_id = a.id) as picked,
         greatest(
           extensions.word_similarity(q.n, a.norm_artist || ' ' || a.norm_title),
           extensions.similarity(q.n, a.norm_title),
           extensions.similarity(q.n, a.norm_artist)
         ) as score
    from public.albums a, q
   where a.project_id = p_project and q.n <> ''
   order by score desc, a.position
   limit least(greatest(p_limit, 1), 50)
$$;

-- ---------------------------------------------------------------- importação legada
-- Candidatos fuzzy (trigramas) para uma linha: 3 a 5 sugestões.
create or replace function public.legacy_candidates(p_project bigint, p_artist text, p_title text, p_year int)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with q as (select public.f_normalize(p_artist) as na, public.f_normalize(p_title) as nt),
  scored as (
    select a.id, a.artist, a.title, a.year,
           exists (select 1 from public.daily_picks dp where dp.album_id = a.id) as picked,
           0.6 * greatest(extensions.similarity(q.nt, a.norm_title), extensions.word_similarity(q.nt, a.norm_title))
           + 0.4 * extensions.similarity(q.na, a.norm_artist)
           - case when p_year is not null and a.year is not null
                  then least(abs(a.year - p_year), 5) * 0.02 else 0 end as score
      from public.albums a, q
     where a.project_id = p_project
  ),
  ranked as (select s.*, row_number() over (order by score desc, id) as rn from scored s)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'artist', artist, 'title', title, 'year', year,
           'picked', picked, 'score', round((score * 100)::numeric)) order by rn), '[]'::jsonb)
    from ranked
   where rn <= 3 or (rn <= 5 and score >= 0.45)
$$;

-- Cria um lote de importação com o casamento automático (camadas 1 e 2).
-- p_rows: [{line, artist, album, year, score, notes, generated}]
create or replace function public.create_import_batch(p_project bigint, p_filename text, p_rows jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_id bigint;
  v_rows jsonb;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project and status <> 'draft') then
    raise exception 'Projeto inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nenhuma linha válida encontrada no arquivo.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Arquivo grande demais (máximo 5.000 linhas).' using errcode = '22023';
  end if;
  v_admin := public.has_role(v_uid, 'admin');

  with input as (
    select e, ord,
           coalesce(e ->> 'artist', '') as artist,
           coalesce(e ->> 'album', '') as title,
           nullif(e ->> 'year', '')::int as year
      from jsonb_array_elements(p_rows) with ordinality as x(e, ord)
  ),
  matched as (
    select i.*,
           (select case when count(*) = 1 then min(a.id) end
              from public.albums a
             where a.project_id = p_project
               and a.norm_artist = public.f_normalize(i.artist)
               and a.norm_title = public.f_normalize(i.title)
               and a.year is not distinct from i.year) as album_id
      from input i
  )
  select jsonb_agg(
           m.e
           || jsonb_build_object(
                'album_id', m.album_id,
                'album_label', case when m.album_id is not null then
                   (select a.artist || ' — ' || a.title || coalesce(' (' || a.year || ')', '')
                      from public.albums a where a.id = m.album_id) end,
                'candidates', case when m.album_id is null
                   then public.legacy_candidates(p_project, m.artist, m.title, m.year)
                   else '[]'::jsonb end,
                'status', case
                   when m.album_id is null then 'revisar'
                   when not v_admin and not exists (select 1 from public.daily_picks dp where dp.album_id = m.album_id)
                     then 'nao_sorteado'
                   else 'exato' end)
           order by m.ord)
    into v_rows
    from matched m;

  delete from public.import_batches where user_id = v_uid and status = 'pending';
  insert into public.import_batches (user_id, project_id, filename, is_admin, rows)
  values (v_uid, p_project, left(p_filename, 255), v_admin, v_rows)
  returning id into v_id;
  return v_id;
end $$;

-- Aplica o lote (camada 3: decisões da revisão manual).
-- p_decisions: {"<linha>": <album_id> | null} para as linhas em revisão.
create or replace function public.apply_import_batch(p_batch bigint, p_decisions jsonb, p_overwrite boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b public.import_batches;
  r jsonb;
  v_admin boolean;
  v_album bigint;
  v_seen bigint[] := '{}';
  v_date date;
  v_score numeric;
  v_notes text;
  v_existing public.ratings;
  s_imported int := 0;
  s_picks int := 0;
  s_ignored int := 0;
  s_existing int := 0;
  s_dupes int := 0;
  s_discarded jsonb := '[]'::jsonb;
  v_summary jsonb;
begin
  select * into b from public.import_batches where id = p_batch and user_id = v_uid and status = 'pending' for update;
  if not found then
    raise exception 'Importação não encontrada ou já aplicada.' using errcode = 'P0002';
  end if;
  v_admin := b.is_admin and public.has_role(v_uid, 'admin');

  for r in select * from jsonb_array_elements(b.rows) loop
    if r ->> 'status' = 'revisar' then
      v_album := nullif(p_decisions ->> (r ->> 'line'), '')::bigint;
    else
      v_album := nullif(r ->> 'album_id', '')::bigint;
    end if;

    if v_album is null or not exists (select 1 from public.albums where id = v_album and project_id = b.project_id) then
      s_ignored := s_ignored + 1;
      continue;
    end if;
    if v_album = any (v_seen) then
      s_dupes := s_dupes + 1;
      continue;
    end if;
    v_seen := v_seen || v_album;

    if not exists (select 1 from public.daily_picks where album_id = v_album) then
      if v_admin then
        -- O histórico do administrador define o que já foi ouvido.
        v_date := coalesce(nullif(r ->> 'generated', '')::date, public.today_brt());
        insert into public.daily_picks (project_id, album_id, pick_date, source)
        values (b.project_id, v_album, v_date, 'importacao')
        on conflict do nothing;
        s_picks := s_picks + 1;
      else
        -- Nota para álbum ainda não sorteado: descartada.
        s_discarded := s_discarded || to_jsonb(coalesce(r ->> 'artist', '') || ' — ' || coalesce(r ->> 'album', ''));
        continue;
      end if;
    end if;

    v_score := nullif(r ->> 'score', '')::numeric;
    if v_score is not null and not (v_score between 0.5 and 5 and v_score * 2 = trunc(v_score * 2)) then
      v_score := null;
    end if;
    v_notes := left(nullif(btrim(coalesce(r ->> 'notes', '')), ''), 5000);
    if v_score is null and v_notes is null then
      continue;
    end if;

    select * into v_existing from public.ratings where user_id = v_uid and album_id = v_album;
    if found then
      if not p_overwrite then
        s_existing := s_existing + 1;
        continue;
      end if;
      update public.ratings set score = v_score, comment = v_notes where id = v_existing.id;
    else
      insert into public.ratings (user_id, album_id, score, comment) values (v_uid, v_album, v_score, v_notes);
    end if;
    s_imported := s_imported + 1;
  end loop;

  v_summary := jsonb_build_object(
    'importadas', s_imported, 'sorteios', s_picks, 'ignoradas', s_ignored,
    'existentes', s_existing, 'duplicadas', s_dupes, 'descartadas', s_discarded);
  update public.import_batches
     set status = 'applied', applied_at = now(), summary = v_summary
   where id = b.id;
  return v_summary;
end $$;

revoke all on function public.create_import_batch(bigint, text, jsonb),
  public.apply_import_batch(bigint, jsonb, boolean) from public, anon;
grant execute on function public.create_import_batch(bigint, text, jsonb),
  public.apply_import_batch(bigint, jsonb, boolean) to authenticated;
