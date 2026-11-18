-- Ekstra kategorier på arrangementer.
-- Kør efter 01_setup.sql. Den eksisterende kk_events.kategori er fortsat hovedkategori.

create table if not exists kk_event_kategorier (
  event_id uuid not null references kk_events(id) on delete cascade,
  kategori text not null references kk_kategorier(slug) on update cascade on delete restrict,
  primary key (event_id, kategori)
);

alter table kk_event_kategorier enable row level security;
grant select on kk_event_kategorier to anon, authenticated;
grant insert, delete on kk_event_kategorier to authenticated;

drop policy if exists kk_event_kategorier_laes on kk_event_kategorier;
create policy kk_event_kategorier_laes on kk_event_kategorier
  for select to anon, authenticated using (true);

drop policy if exists kk_event_kategorier_mod on kk_event_kategorier;
create policy kk_event_kategorier_mod on kk_event_kategorier
  for all to authenticated using (kk_er_moderator()) with check (kk_er_moderator());

drop policy if exists kk_event_kategorier_indsend on kk_event_kategorier;
create policy kk_event_kategorier_indsend on kk_event_kategorier
  for insert to authenticated with check (
    kk_er_moderator()
    or exists (
      select 1 from kk_events e
      where e.id = event_id and e.oprettet_af = auth.uid() and e.status = 'afventer'
    )
  );
