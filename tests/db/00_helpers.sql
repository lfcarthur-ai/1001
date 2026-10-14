-- Helpers compartilhados pelos testes (o runner aplica os arquivos em ordem no mesmo banco).
create schema t;
grant usage on schema t to anon, authenticated, service_role;

create function t.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FALHOU: %', msg;
  end if;
end $$;

-- Executa SQL e retorna true se der erro (o SQL roda com o papel atual).
create function t.fails(sql text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return true;
end $$;

create function t.uid(p_email text) returns uuid language sql stable security definer as $$
  select id from auth.users where lower(email) = lower(p_email)
$$;

create function t.album(p_artist text, p_title text) returns bigint language sql stable security definer as $$
  select a.id from public.albums a join public.projects p on p.id = a.project_id
   where a.artist = p_artist and a.title = p_title order by p.id limit 1
$$;

-- Simula uma requisição autenticada do Supabase.
create function t.login(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(t.uid(p_email)::text, ''), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;

create function t.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
end $$;

grant execute on all functions in schema t to anon, authenticated, service_role;

insert into auth.users (email, raw_user_meta_data) values
  ('LFCarthur@gmail.com', '{"name": "Luiz"}'),
  ('ana@exemplo.com', '{"name": "Ana"}'),
  ('bia@exemplo.com', '{}');
