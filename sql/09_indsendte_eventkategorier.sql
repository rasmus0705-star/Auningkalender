-- Lad arrangører tilføje kategorier til egne ventende arrangementer.
-- Kør efter 07_event_kategorier.sql.

drop policy if exists kk_event_kategorier_indsend on kk_event_kategorier;
create policy kk_event_kategorier_indsend on kk_event_kategorier
  for insert to authenticated with check (
    kk_er_moderator()
    or exists (
      select 1 from kk_events e
      where e.id = event_id and e.oprettet_af = auth.uid() and e.status = 'afventer'
    )
  );
