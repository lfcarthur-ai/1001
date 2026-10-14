-- Papéis, perfis e RLS.
select t.assert(public.has_role(t.uid('lfcarthur@gmail.com'), 'admin'), 'lfcarthur@gmail.com recebe admin no cadastro');
select t.assert(not public.has_role(t.uid('ana@exemplo.com'), 'admin'), 'outros usuários não são admin');
select t.assert(public.has_role(t.uid('ana@exemplo.com'), 'user'), 'todo usuário tem o papel user');
select t.assert((select name from public.profiles where id = t.uid('bia@exemplo.com')) = 'bia', 'nome padrão vem do e-mail');
select t.assert((select email from public.profiles where id = t.uid('lfcarthur@gmail.com')) = 'lfcarthur@gmail.com', 'e-mail do perfil em minúsculas');

-- Normalização
select t.assert(public.f_normalize('The Beatles & Friends: Don’t Stop!') = 'beatles friends dont stop', 'f_normalize básico');
select t.assert(public.f_normalize('Os Mutantes — A Divina Comédia') = 'mutantes divina comedia', 'f_normalize acentos/artigos pt');
select t.assert(public.f_normalize('¿Dónde está la "Señal"?') = 'donde esta senal', 'f_normalize espanhol');

-- anônimo não lê nada
set role anon;
select t.assert(t.fails('select * from public.albums'), 'anon não lê o catálogo');
select t.assert(t.fails('select * from public.ratings'), 'anon não lê avaliações');
select t.assert(t.fails('select public.pick_daily_album()'), 'anon não sorteia');
reset role;

-- usuário comum
select t.login('ana@exemplo.com');
select t.assert((select count(*) from public.projects where status = 'active') = 1, 'projeto 1001 Álbuns ativo e visível');
select t.assert((select count(*) from public.albums) = 1089, 'catálogo com 1089 álbuns');
select t.assert(t.fails($$insert into public.albums (project_id, position, artist, title) values (public.active_project_id(), 9999, 'X', 'Y')$$),
                'usuário não insere álbum');
select t.assert(t.fails($$update public.albums set title = 'Z' where id = t.album('Ash', '1977')$$), 'usuário não altera álbum');
select t.assert(t.fails($$delete from public.albums$$), 'usuário não exclui álbum');
select t.assert(t.fails($$insert into public.projects (name) values ('Hack')$$), 'usuário não cria projeto direto');
select t.assert(t.fails($$select public.create_project('Hack', '[{"artist":"a","title":"b"}]')$$), 'usuário não cria projeto via função');
select t.assert(t.fails($$select public.activate_project(1)$$), 'usuário não ativa projeto');
select t.assert(t.fails($$insert into public.daily_picks (project_id, album_id, pick_date) values (public.active_project_id(), t.album('Ash', '1977'), '2000-01-01')$$),
                'usuário não insere sorteio');
select t.assert(t.fails($$select public.pick_daily_album_for('2030-01-01')$$), 'usuário não sorteia datas arbitrárias');
select t.assert(t.fails($$insert into public.user_roles (user_id, role) values (auth.uid(), 'admin')$$), 'usuário não se promove');

-- perfil: só o próprio nome
update public.profiles set name = 'Ana Paula' where id = auth.uid();
select t.assert((select name from public.profiles where id = auth.uid()) = 'Ana Paula', 'edita o próprio nome');
select t.assert(t.fails($$update public.profiles set email = 'x@y.com' where id = auth.uid()$$), 'não edita e-mail pelo perfil');
update public.profiles set name = 'Invasora' where id = t.uid('bia@exemplo.com');
select t.logout();
select t.assert((select name from public.profiles where id = t.uid('bia@exemplo.com')) = 'bia', 'não edita perfil alheio');

-- admin
select t.login('lfcarthur@gmail.com');
select t.assert(t.fails($$delete from public.user_roles where user_id = auth.uid() and role = 'admin'$$),
                'a conta lfcarthur@gmail.com nunca perde o admin');
insert into public.user_roles (user_id, role) values (t.uid('bia@exemplo.com'), 'admin');
delete from public.user_roles where user_id = t.uid('bia@exemplo.com') and role = 'admin';
select t.logout();
select t.assert(not public.has_role(t.uid('bia@exemplo.com'), 'admin'), 'admin concede e remove papéis');
