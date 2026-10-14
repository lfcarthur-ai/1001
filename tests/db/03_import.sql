-- Importação de histórico legado: casamento em camadas e regras admin × usuário.
select t.login('lfcarthur@gmail.com');
create temp table imp as select public.create_import_batch(public.active_project_id(), 'admin.csv', $$[
  {"line": 2, "artist": "808 state", "album": "90", "year": 1989, "score": 4, "notes": "Bom", "generated": "2024-01-10"},
  {"line": 3, "artist": "Prince", "album": "1999", "year": 1982, "score": 5, "notes": null, "generated": "2024-01-11"},
  {"line": 4, "artist": "Van Halen", "album": "1984 (Remastered)", "year": 1984, "score": 3.5, "notes": null, "generated": "2024-01-11"},
  {"line": 5, "artist": "Prince", "album": "1999", "year": 1982, "score": 1, "notes": null, "generated": "2024-01-12"},
  {"line": 6, "artist": "Ninguém", "album": "Nada", "year": null, "score": 2, "notes": null, "generated": null}
]$$::jsonb) as id;

select t.assert((select rows -> 0 ->> 'status' from public.import_batches where id = (select id from imp)) = 'exato', 'match exato normalizado');
select t.assert((select rows -> 2 ->> 'status' from public.import_batches where id = (select id from imp)) = 'revisar', 'sem match exato vai para revisão');
select t.assert((select jsonb_array_length(rows -> 2 -> 'candidates') between 3 and 5 from public.import_batches where id = (select id from imp)),
                '3 a 5 candidatos fuzzy');
select t.assert((select (rows -> 2 -> 'candidates' -> 0 ->> 'id')::bigint from public.import_batches where id = (select id from imp)) = t.album('Van Halen', '1984'),
                'melhor candidato fuzzy é o álbum certo');

create temp table imp_res as select public.apply_import_batch(
  (select id from imp), jsonb_build_object('4', t.album('Van Halen', '1984'), '6', null), false) as s;
select t.assert((select (s ->> 'sorteios')::int from imp_res) = 3, 'admin: álbuns importados entram como sorteados');
select t.assert((select (s ->> 'importadas')::int from imp_res) = 3, 'admin: notas importadas');
select t.assert((select (s ->> 'duplicadas')::int from imp_res) = 1, 'linha duplicada ignorada');
select t.assert((select (s ->> 'ignoradas')::int from imp_res) = 1, 'linha sem decisão ignorada');
select t.assert((select pick_date from public.daily_picks where album_id = t.album('808 State', '90')) = '2024-01-10', 'data do sorteio vem de Generated Date');
select t.assert((select source from public.daily_picks where album_id = t.album('Prince', '1999')) = 'importacao', 'origem importação');
select t.assert(t.fails(format('select public.apply_import_batch(%s, %L, false)', (select id from imp), '{}')), 'lote não pode ser aplicado duas vezes');
select t.logout();

-- usuário: álbuns não sorteados são descartados automaticamente
select t.login('ana@exemplo.com');
create temp table imp2 as select public.create_import_batch(public.active_project_id(), 'ana.csv', $$[
  {"line": 2, "artist": "Prince", "album": "1999", "year": 1982, "score": 2, "notes": "meh", "generated": null},
  {"line": 3, "artist": "Ash", "album": "1977", "year": 1996, "score": 5, "notes": null, "generated": null}
]$$::jsonb) as id;
select t.assert((select rows -> 1 ->> 'status' from public.import_batches where id = (select id from imp2)) = 'nao_sorteado',
                'usuário: álbum não sorteado sinalizado');
create temp table imp2_res as select public.apply_import_batch((select id from imp2), '{}'::jsonb, false) as s;
select t.assert((select (s ->> 'importadas')::int from imp2_res) = 1, 'usuário: nota de álbum sorteado importada');
select t.assert((select jsonb_array_length(s -> 'descartadas') from imp2_res) = 1, 'usuário: nota de álbum não sorteado descartada');
select t.assert(not exists (select 1 from public.daily_picks where album_id = t.album('Ash', '1977')), 'usuário não cria sorteios');
select t.assert(t.fails(format('select public.apply_import_batch(%s, %L, false)',
                (select id from imp), '{}')), 'não aplica lote de outra pessoa');
select t.logout();

-- sobrescrita opcional
select t.login('ana@exemplo.com');
create temp table imp3 as select public.create_import_batch(public.active_project_id(), 'ana2.csv', $$[
  {"line": 2, "artist": "Prince", "album": "1999", "year": 1982, "score": 4, "notes": null, "generated": null}
]$$::jsonb) as id;
select t.assert((select (public.apply_import_batch((select id from imp3), '{}'::jsonb, false) ->> 'existentes')::int) = 1,
                'não sobrescreve sem a opção');
select t.logout();
select t.assert((select score from public.ratings where user_id = t.uid('ana@exemplo.com') and album_id = t.album('Prince', '1999')) = 2,
                'nota existente preservada');
