-- 1001 Álbuns — schema base
-- Projetos (listas de álbuns), catálogo, sorteios diários, avaliações, perfis e papéis.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------- normalização
-- Mesmas regras de src/lib/normalize.ts: minúsculas, sem acentos, sem aspas,
-- pontuação vira espaço, "&" vira "and", artigos (en/pt/es/fr/de/it) e "and" removidos.
create or replace function public.f_normalize(t text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select coalesce(string_agg(w, ' ' order by i), '')
  from regexp_split_to_table(
         regexp_replace(
           replace(
             replace(
               lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                     translate(coalesce(t, ''), '''‘’‚‛′`´', ''))),
               '&', ' and '),
             '''', ''),
           '[^[:alnum:][:space:]]|_', ' ', 'g'),
         '\s+') with ordinality as x(w, i)
  where w <> ''
    and w not in ('the', 'a', 'an', 'and',
                  'o', 'os', 'as', 'um', 'uma',
                  'el', 'la', 'los', 'las',
                  'le', 'les', 'l',
                  'der', 'die', 'das',
                  'il', 'lo', 'gli')
$$;

-- ---------------------------------------------------------------- papéis e perfis
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

-- ---------------------------------------------------------------- projetos
create table public.projects (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  closed_at timestamptz
);

-- Só um projeto ativo por vez.
create unique index projects_one_active on public.projects ((true)) where status = 'active';

-- ---------------------------------------------------------------- catálogo
create table public.albums (
  id bigint generated always as identity primary key,
  project_id bigint not null references public.projects (id) on delete cascade,
  position integer not null,
  artist text not null,
  title text not null,
  year integer,
  run_time text,
  genre text,
  -- Enriquecimento (MusicBrainz, Cover Art Archive, Wikipedia, RYM)
  country text,
  release_date text,
  cover_url text,
  wikipedia_url text,
  rym_url text,
  mb_release_group_id text,
  enriched_at timestamptz,
  enrich_attempts integer not null default 0,
  norm_artist text generated always as (public.f_normalize(artist)) stored,
  norm_title text generated always as (public.f_normalize(title)) stored,
  created_at timestamptz not null default now(),
  unique (project_id, artist, title, year),
  unique (id, project_id)
);

create index albums_project_idx on public.albums (project_id, position);
create index albums_norm_idx on public.albums (project_id, norm_artist, norm_title);
create index albums_norm_artist_trgm on public.albums using gin (norm_artist extensions.gin_trgm_ops);
create index albums_norm_title_trgm on public.albums using gin (norm_title extensions.gin_trgm_ops);

-- ---------------------------------------------------------------- sorteios
-- source = 'sorteio': álbum do dia (um por data). source = 'importacao': histórico legado
-- importado pelo administrador (conta como "já ouvido", pode repetir datas).
create table public.daily_picks (
  id bigint generated always as identity primary key,
  project_id bigint not null references public.projects (id) on delete cascade,
  album_id bigint not null,
  pick_date date not null,
  source text not null default 'sorteio' check (source in ('sorteio', 'importacao')),
  created_at timestamptz not null default now(),
  foreign key (album_id, project_id) references public.albums (id, project_id) on delete cascade,
  unique (project_id, album_id)
);

create unique index daily_picks_one_per_day
  on public.daily_picks (project_id, pick_date) where source = 'sorteio';
create index daily_picks_order_idx on public.daily_picks (project_id, pick_date, id);

-- ---------------------------------------------------------------- avaliações
create table public.ratings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  album_id bigint not null references public.albums (id) on delete cascade,
  -- 0,5 a 5 em passos de 0,5. Nulo apenas para histórico legado sem nota.
  score numeric(2, 1) check (score is null or (score between 0.5 and 5 and score * 2 = trunc(score * 2))),
  should_be_in_list boolean,
  comment text check (comment is null or char_length(comment) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, album_id)
);

create index ratings_album_idx on public.ratings (album_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger ratings_touch before update on public.ratings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- importações
create table public.import_batches (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id bigint not null references public.projects (id) on delete cascade,
  filename text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled')),
  is_admin boolean not null default false,
  rows jsonb not null default '[]'::jsonb,
  summary jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

-- ---------------------------------------------------------------- cadastro
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- O administrador é sempre a conta lfcarthur@gmail.com.
create or replace function public.admin_email()
returns text language sql immutable as $$ select 'lfcarthur@gmail.com'::text $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');
begin
  insert into public.profiles (id, name, email)
  values (new.id, left(coalesce(v_name, split_part(new.email, '@', 1)), 80), lower(new.email));

  insert into public.user_roles (user_id, role) values (new.id, 'user');
  if lower(new.email) = public.admin_email() then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil igual ao da autenticação; quem passa a usar o e-mail do
-- administrador recebe o papel.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
    if lower(new.email) = public.admin_email() then
      insert into public.user_roles (user_id, role) values (new.id, 'admin')
      on conflict (user_id, role) do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- A conta do administrador nunca perde o papel.
create or replace function public.protect_owner_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin'
     -- Se o perfil já foi excluído (conta removida), a exclusão em cascata segue normalmente.
     and exists (select 1 from public.profiles p where p.id = old.user_id and p.email = public.admin_email()) then
    raise exception 'A conta % é sempre administradora.', public.admin_email()
      using errcode = 'P0001';
  end if;
  return old;
end $$;

create trigger user_roles_protect_owner
  before delete on public.user_roles
  for each row execute function public.protect_owner_admin();
