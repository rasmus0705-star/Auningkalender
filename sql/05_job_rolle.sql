-- =====================================================================
-- VALGFRI, men anbefalet når du deler Supabase-projekt med andre apps.
-- Opretter en databasebruger "kk_job" med adgang KUN til kalenderens tabeller,
-- så timejobbet i GitHub Actions ikke behøver service_role-nøglen (som giver adgang til ALT).
--
-- 1) Skift kodeordet herunder til et langt, tilfældigt kodeord (kun bogstaver og tal er nemmest).
-- 2) Kør hele filen i SQL Editor (efter 01_setup.sql).
-- 3) Brug forbindelsesstrengen som GitHub-hemmelighed DATABASE_URL (se GUIDE.md afsnit 3).
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'kk_job') then
    create role kk_job login password 'SKIFT-MIG-TIL-ET-LANGT-KODEORD';
  end if;
end $$;

grant usage on schema public to kk_job;
grant select on kk_events, kk_kategorier, kk_steder, kk_abonnenter, kk_foelger to kk_job;
grant update (notificeret_ts) on kk_events to kk_job;
grant update (paamindelse_sendt, aflyst_sendt) on kk_foelger to kk_job;
grant delete on kk_abonnenter to kk_job;

do $$ declare t text; begin
  foreach t in array array['kk_events','kk_kategorier','kk_steder','kk_abonnenter','kk_foelger'] loop
    execute format('drop policy if exists kk_job_laes on %I', t);
    execute format('create policy kk_job_laes on %I for select to kk_job using (true)', t);
  end loop;
  drop policy if exists kk_job_events_ret on kk_events;
  create policy kk_job_events_ret on kk_events for update to kk_job using (true) with check (true);
  drop policy if exists kk_job_foelger_ret on kk_foelger;
  create policy kk_job_foelger_ret on kk_foelger for update to kk_job using (true) with check (true);
  drop policy if exists kk_job_abo_slet on kk_abonnenter;
  create policy kk_job_abo_slet on kk_abonnenter for delete to kk_job using (true);
end $$;
