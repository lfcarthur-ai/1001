-- Row Level Security. Escritas sensíveis (sorteio, criação/ativação de projeto,
-- aplicação de importação) acontecem em funções SECURITY DEFINER que validam o chamador.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.projects enable row level security;
alter table public.albums enable row level security;
alter table public.daily_picks enable row level security;
alter table public.ratings enable row level security;
alter table public.import_batches enable row level security;

-- Plataforma fechada: visitantes anônimos não leem nada.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------- profiles
create policy "perfis visíveis para o grupo" on public.profiles
  for select to authenticated using (true);

-- Cada um altera apenas o próprio nome; e-mail vem da autenticação; o administrador
-- edita dados de outros pelo servidor (service role).
revoke insert, update, delete on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

create policy "editar o próprio perfil" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------- user_roles
create policy "papéis visíveis para o grupo" on public.user_roles
  for select to authenticated using (true);

revoke update on public.user_roles from authenticated;

create policy "admin concede papéis" on public.user_roles
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "admin remove papéis" on public.user_roles
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------- projects
create policy "projetos publicados visíveis" on public.projects
  for select to authenticated
  using (status <> 'draft' or public.has_role(auth.uid(), 'admin'));

revoke insert, update, delete on public.projects from authenticated;

-- ---------------------------------------------------------------- albums
-- Catálogo somente leitura para usuários.
create policy "catálogo visível" on public.albums
  for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = albums.project_id
      and (p.status <> 'draft' or public.has_role(auth.uid(), 'admin'))
  ));

revoke update, delete on public.albums from authenticated;

create policy "admin adiciona álbuns a projeto em rascunho" on public.albums
  for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    and exists (select 1 from public.projects p where p.id = albums.project_id and p.status = 'draft')
  );

-- ---------------------------------------------------------------- daily_picks
create policy "sorteios visíveis" on public.daily_picks
  for select to authenticated using (true);

revoke insert, update, delete on public.daily_picks from authenticated;

-- ---------------------------------------------------------------- ratings
create policy "avaliações visíveis para o grupo" on public.ratings
  for select to authenticated using (true);

-- Só é possível avaliar álbuns já sorteados, e cada um só mexe nas próprias notas.
create policy "avaliar álbum sorteado" on public.ratings
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.daily_picks dp where dp.album_id = ratings.album_id)
  );

create policy "editar a própria avaliação" on public.ratings
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.daily_picks dp where dp.album_id = ratings.album_id)
  );

create policy "excluir a própria avaliação" on public.ratings
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------- import_batches
create policy "minhas importações" on public.import_batches
  for select to authenticated using (user_id = auth.uid());

create policy "cancelar minhas importações" on public.import_batches
  for delete to authenticated using (user_id = auth.uid());

revoke insert, update on public.import_batches from authenticated;
