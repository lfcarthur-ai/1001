-- Sorteio diário e avaliações.
select t.login('ana@exemplo.com');
create temp table if not exists tmp_pick as select * from public.pick_daily_album();
select t.assert((select count(*) from tmp_pick where id is not null) = 1, 'fallback da home sorteia o álbum do dia');
select t.assert((select id from public.pick_daily_album()) = (select id from tmp_pick), 'sorteio é idempotente');
select t.assert((select pick_date from tmp_pick) = public.today_brt(), 'sorteio usa a data de Brasília');
select t.assert((select count(*) from public.daily_picks) = 1, 'um único sorteio');

-- avaliar só álbum sorteado
select t.assert(t.fails(format($$insert into public.ratings (user_id, album_id, score) values (auth.uid(), %s, 4)$$,
                (select a.id from public.albums a where a.id <> (select album_id from tmp_pick) limit 1))),
                'não avalia álbum não sorteado');
insert into public.ratings (user_id, album_id, score, should_be_in_list, comment)
  select auth.uid(), album_id, 4.5, true, 'Ótimo' from tmp_pick;
select t.assert(t.fails($$update public.ratings set score = 4.3 where user_id = auth.uid()$$), 'nota precisa ser múltiplo de 0,5');
select t.assert(t.fails($$update public.ratings set score = 5.5 where user_id = auth.uid()$$), 'nota máxima 5');
select t.assert(t.fails($$update public.ratings set score = 0 where user_id = auth.uid()$$), 'nota mínima 0,5');
update public.ratings set score = 0.5 where user_id = auth.uid();
update public.ratings set score = 3.5 where user_id = auth.uid();
select t.assert(t.fails(format($$insert into public.ratings (user_id, album_id, score) values (%L, %s, 2)$$,
                t.uid('bia@exemplo.com'), (select album_id from tmp_pick))), 'não avalia em nome de outra pessoa');
select t.logout();

select t.login('bia@exemplo.com');
select t.assert((select count(*) from public.ratings) = 1, 'avaliações visíveis para o grupo');
update public.ratings set score = 1 where user_id = t.uid('ana@exemplo.com');
delete from public.ratings where user_id = t.uid('ana@exemplo.com');
insert into public.ratings (user_id, album_id, score, should_be_in_list)
  select auth.uid(), album_id, 2.5, false from tmp_pick;
select t.logout();
select t.assert((select score from public.ratings where user_id = t.uid('ana@exemplo.com')) = 3.5, 'não altera/exclui avaliação alheia');

-- concorrência na data: um segundo sorteio para a mesma data não cria outro registro
set role service_role;
select public.pick_daily_album_for(public.today_brt());
select public.pick_daily_album_for(public.today_brt() - 1);
reset role;
select t.assert((select count(*) from public.daily_picks where source = 'sorteio') = 2, 'um sorteio por data');
select t.assert((select count(distinct album_id) from public.daily_picks) = 2, 'álbuns não se repetem');
