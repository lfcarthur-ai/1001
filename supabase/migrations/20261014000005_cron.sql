-- Sorteio diário às 03:00 UTC (00:00 em Brasília) via pg_cron + pg_net.
--
-- A rota /api/public/cron/daily-pick sorteia e enriquece o álbum do dia. A URL do app e o
-- segredo ficam no Supabase Vault (veja o README):
--   select vault.create_secret('https://seu-app.exemplo.com', 'app_url');
--   select vault.create_secret('<mesmo valor de CRON_SECRET>', 'cron_secret');
--
-- Rede de segurança: às 03:05 UTC o próprio banco garante o sorteio caso a chamada HTTP
-- tenha falhado (a página inicial também cria o sorteio do dia se faltar).
--
-- Em bancos sem pg_cron/pg_net (ex.: testes locais) esta migration não faz nada.

create or replace function public.call_daily_pick_endpoint()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'Sorteio: configure os segredos app_url e cron_secret no Vault.';
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/public/cron/daily-pick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;

revoke all on function public.call_daily_pick_endpoint() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;

    perform cron.schedule('daily-pick', '0 3 * * *', 'select public.call_daily_pick_endpoint()');
    perform cron.schedule('daily-pick-fallback', '5 3 * * *', 'select public.pick_daily_album_for(public.today_brt())');
  else
    raise notice 'pg_cron/pg_net indisponíveis: agendamento do sorteio não criado.';
  end if;
end
$do$;
