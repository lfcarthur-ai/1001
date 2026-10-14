-- Estatísticas e ciclo de vida de projetos.
select t.login('bia@exemplo.com');
insert into public.ratings (user_id, album_id, score, should_be_in_list) values
  (auth.uid(), t.album('808 State', '90'), 2, true),
  (auth.uid(), t.album('Prince', '1999'), 4, false);
select t.logout();

select t.login('ana@exemplo.com');
create temp table gs as select public.group_stats(null) as s;
select t.assert((select (s ->> 'total')::int from gs) = 1089, 'total do projeto');
select t.assert((select (s ->> 'drawn')::int from gs) = 5, 'sorteados = 2 sorteios + 3 importados');
select t.assert((select (s ->> 'votes')::int from gs) = (select count(*) from public.ratings where score is not null), 'votos');
select t.assert((select (s ->> 'avg')::numeric from gs) = (select round(avg(score), 4) from public.ratings), 'média global');
select t.assert((select jsonb_array_length(s -> 'distribution') from gs) = 10, 'distribuição de 0,5 a 5');
select t.assert((select jsonb_array_length(s -> 'top') from gs) between 1 and 5, 'top 5');
select t.assert((select s -> 'breakdowns' ? 'decada' and s -> 'breakdowns' ? 'genero' and s -> 'breakdowns' ? 'pais' from gs), 'breakdowns');
select t.assert((select count(*) from public.history_rows(null, auth.uid())) = 5, 'histórico com todos os sorteados');
select t.assert((select ord from public.history_rows(null, auth.uid()) where album_id = t.album('808 State', '90')) = 1, 'ordem pela data do sorteio');

create temp table us as select public.user_stats(null, auth.uid()) as s;
select t.assert((select (s -> 'summary' ->> 'rated')::int from us) = (select count(*) from public.ratings where user_id = auth.uid() and score is not null), 'avaliados');
select t.assert((select jsonb_array_length(s -> 'comparisons') from us) = 2, 'comparação com cada outro usuário');
select t.assert((select (c ->> 'n')::int from us, jsonb_array_elements(s -> 'comparisons') c where c ->> 'name' = 'bia') = 2,
                'álbuns em comum com bia');
-- Ana: 808=? (sem nota), Prince=2, dia=3.5; Bia: Prince=4, dia=2.5, 808=2 -> em comum Prince e dia: MAD = (2+1)/2 = 1.5
select t.assert((select (c ->> 'mad')::numeric from us, jsonb_array_elements(s -> 'comparisons') c where c ->> 'name' = 'bia') = 1.5, 'MAD');
select t.assert((select s -> 'should_be_in_list' -> 'user' ->> 'n' from us) = '1', '% deveria estar (usuário)');
select t.assert((select jsonb_array_length(s -> 'breakdowns' -> 'ano') from us) >= 1, 'média por ano');
select t.logout();

-- novo projeto: rascunho invisível, ativação encerra o anterior
select t.login('lfcarthur@gmail.com');
create temp table np as select public.create_project('Brasileiros', $$[
  {"artist": "Os Mutantes", "title": "Os Mutantes", "year": 1968, "run_time": "0:33:00", "genre": "Rock"},
  {"artist": "Caetano Veloso", "title": "Transa", "year": 1972, "run_time": "", "genre": "MPB"},
  {"artist": "Caetano Veloso", "title": "Transa", "year": 1972, "run_time": "", "genre": "MPB"},
  {"artist": "", "title": "Sem artista", "year": 2000}
]$$::jsonb) as id;
select t.assert((select count(*) from public.albums where project_id = (select id from np)) = 2, 'duplicadas e inválidas descartadas');
select t.assert(t.fails($$select public.create_project('Vazio', '[]')$$), 'CSV vazio rejeitado');
select t.logout();

select t.login('ana@exemplo.com');
select t.assert(not exists (select 1 from public.projects where status = 'draft'), 'rascunho invisível para usuários');
select t.assert(not exists (select 1 from public.albums a join public.projects p on p.id = a.project_id where p.status = 'draft'), 'álbuns do rascunho invisíveis');
select t.logout();

select t.login('lfcarthur@gmail.com');
select public.activate_project((select id from np));
select t.assert(t.fails(format('select public.activate_project(%s)', (select id from np))), 'projeto já ativo não reativa');
select t.logout();
select t.assert((select count(*) from public.projects where status = 'active') = 1, 'só um projeto ativo');
select t.assert((select status from public.projects where name = '1001 Álbuns') = 'closed', 'anterior encerrado');
select t.assert(t.fails($$update public.projects set status = 'active'$$), 'índice único impede dois ativos');

select t.login('ana@exemplo.com');
create temp table np_pick as select * from public.pick_daily_album();
select t.assert((select project_id from np_pick) = (select id from np), 'sorteio considera apenas o projeto ativo');
select t.assert((select count(*) from public.history_rows((select id from public.projects where name = '1001 Álbuns'), auth.uid())) = 5,
                'histórico do projeto encerrado continua visível');
select t.assert((select (public.group_stats(null) ->> 'drawn')::int) = 1, 'estatísticas filtram pelo projeto ativo por padrão');
select t.logout();
