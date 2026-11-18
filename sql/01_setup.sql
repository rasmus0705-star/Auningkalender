-- =====================================================================
-- Kulturkalender Auning – databaseopsætning (Supabase / Postgres)
--
-- Alle objekter har præfikset kk_ og rører ikke dine andre tabeller.
-- Scriptet kan køres flere gange uden skade.
-- Kør det i Supabase: SQL Editor -> New query -> indsæt -> Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabeller
-- ---------------------------------------------------------------------
create table if not exists kk_kategorier (
  slug text primary key,
  navn text not null,
  farve text not null default '#1f4d3a',
  ikon text not null default '📅',
  sortering int not null default 100,
  aktiv boolean not null default true
);

create table if not exists kk_maalgrupper (
  slug text primary key,
  navn text not null,
  sortering int not null default 100,
  aktiv boolean not null default true
);

create table if not exists kk_omraader (
  slug text primary key,
  navn text not null,
  sortering int not null default 100,
  aktiv boolean not null default true
);

create table if not exists kk_steder (
  id uuid primary key default gen_random_uuid(),
  navn text not null,
  adresse text,
  omraade text references kk_omraader(slug) on update cascade on delete set null,
  lat double precision,
  lon double precision,
  sortering int not null default 100,
  aktiv boolean not null default true
);

create table if not exists kk_afvisningsaarsager (
  id serial primary key,
  tekst text not null unique,
  aktiv boolean not null default true
);

create table if not exists kk_ordliste (
  id serial primary key,
  ord text not null unique
);

-- Roller: ingen række = almindelig bruger. Kun via funktioner (se nedenfor).
create table if not exists kk_roller (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rolle text not null check (rolle in ('moderator','admin')),
  oprettet timestamptz not null default now()
);

create table if not exists kk_events (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (char_length(titel) between 3 and 120),
  beskrivelse text check (beskrivelse is null or char_length(beskrivelse) <= 4000),
  start_ts timestamptz not null,
  slut_ts timestamptz,
  slut_eff timestamptz,                      -- udfyldes af trigger (slut, eller start + 2 timer)
  sted_id uuid references kk_steder(id) on delete set null,
  sted_navn text check (sted_navn is null or char_length(sted_navn) <= 120),
  adresse text check (adresse is null or char_length(adresse) <= 200),
  omraade text references kk_omraader(slug) on update cascade on delete set null,
  kategori text not null references kk_kategorier(slug) on update cascade,
  maalgruppe text not null references kk_maalgrupper(slug) on update cascade,
  pris_tekst text check (pris_tekst is null or char_length(pris_tekst) <= 60),
  link_url text check (link_url is null or link_url ~* '^https?://'),
  billede_sti text,
  arrangoer text not null check (char_length(arrangoer) between 2 and 120),
  status text not null default 'afventer'
    check (status in ('kladde','afventer','godkendt','afvist','aflyst')),
  skjult boolean not null default false,
  afvisningsaarsag text,
  flag text[] not null default '{}',
  oprettet_af uuid default auth.uid(),
  af_moderator boolean not null default false,
  serie_id uuid,
  oprettet timestamptz not null default now(),
  opdateret timestamptz not null default now(),
  check (slut_ts is null or slut_ts >= start_ts)
);

create index if not exists kk_events_start_idx on kk_events (start_ts);
create index if not exists kk_events_status_idx on kk_events (status);
create index if not exists kk_events_opr_idx on kk_events (oprettet_af);

-- Kontaktoplysninger ligger adskilt og er kun synlige for moderatorer.
-- Slettes automatisk sammen med arrangementet.
create table if not exists kk_kontakt (
  event_id uuid primary key references kk_events(id) on delete cascade,
  navn text not null check (char_length(navn) between 2 and 120),
  email text check (email is null or char_length(email) <= 200),
  telefon text check (telefon is null or char_length(telefon) <= 40),
  check (email is not null or telefon is not null)
);

-- ---------------------------------------------------------------------
-- 2. Hjælpefunktioner til roller
-- ---------------------------------------------------------------------
create or replace function kk_er_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from kk_roller where user_id = auth.uid());
$$;

create or replace function kk_er_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from kk_roller where user_id = auth.uid() and rolle = 'admin');
$$;

create or replace function kk_min_rolle() returns text
language sql stable security definer set search_path = public as $$
  select rolle from kk_roller where user_id = auth.uid();
$$;

-- Admin: se alle roller
create or replace function kk_hent_roller()
returns table (user_id uuid, email text, rolle text)
language plpgsql security definer set search_path = public as $$
begin
  if not kk_er_admin() then raise exception 'Ingen adgang'; end if;
  return query
    select r.user_id, u.email::text, r.rolle
    from kk_roller r join auth.users u on u.id = r.user_id
    order by r.rolle, u.email;
end $$;

-- Admin: tildel / fjern rolle ('moderator', 'admin' eller 'ingen')
create or replace function kk_tildel_rolle(p_email text, p_rolle text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; antal_admins int;
begin
  if not kk_er_admin() then raise exception 'Ingen adgang'; end if;
  if p_rolle not in ('moderator','admin','ingen') then raise exception 'Ugyldig rolle'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then
    raise exception 'Brugeren findes ikke. Personen skal først oprette en konto via Moderator-siden.';
  end if;
  if p_rolle = 'ingen' or p_rolle = 'moderator' then
    select count(*) into antal_admins from kk_roller where rolle = 'admin' and user_id <> uid;
    if antal_admins = 0 and exists (select 1 from kk_roller where user_id = uid and rolle = 'admin') then
      raise exception 'Der skal altid være mindst én admin.';
    end if;
  end if;
  if p_rolle = 'ingen' then
    delete from kk_roller where user_id = uid;
  else
    insert into kk_roller (user_id, rolle) values (uid, p_rolle)
    on conflict (user_id) do update set rolle = excluded.rolle;
  end if;
end $$;

-- Første admin sættes fra SQL Editor (ikke fra appen):  select kk_foerste_admin('din@mail.dk');
create or replace function kk_foerste_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then return 'Brugeren findes ikke endnu – opret konto i appen først.'; end if;
  insert into kk_roller (user_id, rolle) values (uid, 'admin')
  on conflict (user_id) do update set rolle = 'admin';
  return 'OK: ' || p_email || ' er nu admin.';
end $$;
revoke all on function kk_foerste_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Trigger på arrangementer: sluttid, tvungne værdier og automatiske flag
-- ---------------------------------------------------------------------
create or replace function kk_events_foer() returns trigger
language plpgsql security definer set search_path = public as $$
declare ord record; antal int; tekst text;
begin
  new.slut_eff := coalesce(new.slut_ts, new.start_ts + interval '2 hours');
  new.opdateret := now();

  if tg_op = 'INSERT' then
    if kk_er_moderator() then
      new.af_moderator := true;
    else
      -- Globale værn mod oversvømmelse (gælder alle besøgende samlet, uanset session)
      if (select count(*) from kk_events where not af_moderator and oprettet > now() - interval '1 hour') >= 60
         or (select count(*) from kk_events where status = 'afventer') >= 300 then
        raise exception 'Kalenderen modtager mange indsendelser lige nu – prøv igen senere.';
      end if;
      -- Almindelige indsendelser: altid "afventer", aldrig skjult, ingen serie
      new.status := 'afventer';
      new.skjult := false;
      new.afvisningsaarsag := null;
      new.oprettet_af := auth.uid();
      new.af_moderator := false;
      new.serie_id := null;
      new.flag := '{}';

      tekst := lower(coalesce(new.titel,'') || ' ' || coalesce(new.beskrivelse,'') || ' ' || coalesce(new.link_url,''));
      antal := (length(tekst) - length(replace(tekst, 'http', ''))) / 4;
      if antal >= 3 then new.flag := array_append(new.flag, 'mange links'); end if;

      for ord in select o.ord from kk_ordliste o loop
        if tekst like '%' || lower(ord.ord) || '%' then
          new.flag := array_append(new.flag, 'ordliste: ' || ord.ord);
        end if;
      end loop;

      if exists (
        select 1 from kk_events e
        where e.id <> new.id
          and lower(trim(e.titel)) = lower(trim(new.titel))
          and (e.start_ts at time zone 'Europe/Copenhagen')::date = (new.start_ts at time zone 'Europe/Copenhagen')::date
          and e.status <> 'afvist'
      ) then
        new.flag := array_append(new.flag, 'mulig dublet');
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists kk_events_foer on kk_events;
create trigger kk_events_foer before insert or update on kk_events
  for each row execute function kk_events_foer();

-- ---------------------------------------------------------------------
-- 4. Oprettelse (arrangement + kontakt i én transaktion)
-- ---------------------------------------------------------------------
create or replace function kk_opret(p jsonb, p_kontakt jsonb default null)
returns uuid[]
language plpgsql security invoker set search_path = public as $$
declare per jsonb; ny uuid; ids uuid[] := '{}'; serie uuid := null; antal int;
begin
  antal := jsonb_array_length(coalesce(p->'perioder', '[]'::jsonb));
  if antal = 0 then raise exception 'Mangler dato'; end if;
  if antal > 1 then
    if not kk_er_moderator() then raise exception 'Kun moderatorer kan oprette serier'; end if;
    if antal > 80 then raise exception 'For mange datoer på én gang (max 80)'; end if;
    serie := gen_random_uuid();
  end if;
  if not kk_er_moderator() then
    if p_kontakt is null or coalesce(trim(p_kontakt->>'navn'),'') = ''
       or (coalesce(trim(p_kontakt->>'email'),'') = '' and coalesce(trim(p_kontakt->>'telefon'),'') = '') then
      raise exception 'Kontaktoplysninger mangler';
    end if;
  end if;

  for per in select * from jsonb_array_elements(p->'perioder') loop
    ny := gen_random_uuid();
    insert into kk_events (id, titel, beskrivelse, start_ts, slut_ts, sted_id, sted_navn, adresse, omraade,
                           kategori, maalgruppe, pris_tekst, link_url, billede_sti, arrangoer, status, serie_id)
    values (ny, trim(p->>'titel'), nullif(trim(p->>'beskrivelse'),''),
            (per->>'start')::timestamptz, nullif(per->>'slut','')::timestamptz,
            nullif(p->>'sted_id','')::uuid, nullif(trim(p->>'sted_navn'),''), nullif(trim(p->>'adresse'),''),
            nullif(p->>'omraade',''), p->>'kategori', p->>'maalgruppe',
            nullif(trim(p->>'pris_tekst'),''), nullif(trim(p->>'link_url'),''), nullif(p->>'billede_sti',''),
            trim(p->>'arrangoer'), coalesce(nullif(p->>'status',''), 'afventer'), serie);

    if p_kontakt is not null and coalesce(trim(p_kontakt->>'navn'),'') <> ''
       and (coalesce(trim(p_kontakt->>'email'),'') <> '' or coalesce(trim(p_kontakt->>'telefon'),'') <> '') then
      insert into kk_kontakt (event_id, navn, email, telefon)
      values (ny, trim(p_kontakt->>'navn'), nullif(trim(p_kontakt->>'email'),''), nullif(trim(p_kontakt->>'telefon'),''));
    end if;
    ids := ids || ny;
  end loop;
  return ids;
end $$;

-- ---------------------------------------------------------------------
-- 5. Konfliktcheck (viser kun det mest nødvendige – aldrig kontaktdata)
-- ---------------------------------------------------------------------
create or replace function kk_konflikter(
  p_start timestamptz, p_slut timestamptz, p_sted_id uuid, p_sted_navn text,
  p_maalgruppe text, p_ekskluder uuid default null)
returns table (
  id uuid, titel text, start_ts timestamptz, slut_eff timestamptz, sted_navn text,
  maalgruppe text, kategori text, status text,
  tid_overlap boolean, sted_match boolean, maalgruppe_match boolean)
language sql stable security definer set search_path = public as $$
  with p as (
    select p_start as s, coalesce(p_slut, p_start + interval '2 hours') as e
  )
  select e.id,
         case when e.status = 'godkendt' then e.titel else null end,
         e.start_ts, e.slut_eff, e.sted_navn, e.maalgruppe, e.kategori, e.status,
         tstzrange(e.start_ts, e.slut_eff) && tstzrange(p.s, p.e),
         (p_sted_id is not null and e.sted_id = p_sted_id)
           or (nullif(trim(p_sted_navn),'') is not null and lower(trim(e.sted_navn)) = lower(trim(p_sted_navn))),
         e.maalgruppe = p_maalgruppe or e.maalgruppe = 'alle' or p_maalgruppe = 'alle'
  from kk_events e, p
  where e.status in ('godkendt','afventer')
    and not e.skjult
    and (p_ekskluder is null or e.id <> p_ekskluder)
    and (e.start_ts at time zone 'Europe/Copenhagen')::date <= (p.e at time zone 'Europe/Copenhagen')::date
    and ((e.slut_eff - interval '1 minute') at time zone 'Europe/Copenhagen')::date >= (p.s at time zone 'Europe/Copenhagen')::date
  order by e.start_ts
  limit 20;
$$;

-- ---------------------------------------------------------------------
-- 6. Årsoprydning (kaldes fra adminsiden)
-- ---------------------------------------------------------------------
create or replace function kk_gamle()
returns table (id uuid, titel text, start_ts timestamptz, billede_sti text)
language plpgsql security definer set search_path = public as $$
begin
  if not kk_er_admin() then raise exception 'Ingen adgang'; end if;
  return query
    select e.id, e.titel, e.start_ts, e.billede_sti from kk_events e
    where e.slut_eff < (date_trunc('year', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen');
end $$;

create or replace function kk_slet_gamle() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not kk_er_admin() then raise exception 'Ingen adgang'; end if;
  delete from kk_events
  where slut_eff < (date_trunc('year', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen');
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------
alter table kk_roller enable row level security;      -- ingen policies: kun via funktioner
alter table kk_events enable row level security;
alter table kk_kontakt enable row level security;
alter table kk_steder enable row level security;
alter table kk_afvisningsaarsager enable row level security;
alter table kk_ordliste enable row level security;

-- Opslagstabeller: alle må læse, kun admin må skrive
do $$ declare t text; begin
  foreach t in array array['kk_kategorier','kk_maalgrupper','kk_omraader'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_laes', t);
    execute format('create policy %I on %I for select to anon, authenticated using (true)', t || '_laes', t);
    execute format('drop policy if exists %I on %I', t || '_skriv', t);
    execute format('create policy %I on %I for all to authenticated using (kk_er_admin()) with check (kk_er_admin())', t || '_skriv', t);
  end loop;
end $$;

-- Steder: alle læser, moderator og admin skriver
drop policy if exists kk_steder_laes on kk_steder;
create policy kk_steder_laes on kk_steder for select to anon, authenticated using (true);
drop policy if exists kk_steder_skriv on kk_steder;
create policy kk_steder_skriv on kk_steder for all to authenticated
  using (kk_er_moderator()) with check (kk_er_moderator());

-- Afvisningsårsager: moderator læser, admin skriver
drop policy if exists kk_afv_laes on kk_afvisningsaarsager;
create policy kk_afv_laes on kk_afvisningsaarsager for select to authenticated using (kk_er_moderator());
drop policy if exists kk_afv_skriv on kk_afvisningsaarsager;
create policy kk_afv_skriv on kk_afvisningsaarsager for all to authenticated
  using (kk_er_admin()) with check (kk_er_admin());

-- Ordliste: kun admin
drop policy if exists kk_ord_alle on kk_ordliste;
create policy kk_ord_alle on kk_ordliste for all to authenticated
  using (kk_er_admin()) with check (kk_er_admin());

-- Arrangementer
drop policy if exists kk_events_laes on kk_events;
create policy kk_events_laes on kk_events for select to anon, authenticated using (
  (status in ('godkendt','aflyst') and not skjult
     and slut_eff >= (date_trunc('year', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'))
  or oprettet_af = auth.uid()
  or kk_er_moderator()
);

drop policy if exists kk_events_opret on kk_events;
create policy kk_events_opret on kk_events for insert to authenticated with check (
  kk_er_moderator()
  or (
    oprettet_af = auth.uid()
    and status = 'afventer'
    and start_ts > now() - interval '1 day'
    and start_ts < now() + interval '18 months'
    and (select count(*) from kk_events x where x.oprettet_af = auth.uid() and x.oprettet > now() - interval '1 hour') < 5
    and (select count(*) from kk_events x where x.oprettet_af = auth.uid() and x.status = 'afventer') < 8
  )
);

drop policy if exists kk_events_ret on kk_events;
create policy kk_events_ret on kk_events for update to authenticated
  using (kk_er_moderator()) with check (kk_er_moderator());

drop policy if exists kk_events_slet on kk_events;
create policy kk_events_slet on kk_events for delete to authenticated using (kk_er_moderator());

-- Kontakt: indsendere må kun oprette (ikke læse), moderatorer må alt
drop policy if exists kk_kontakt_opret on kk_kontakt;
create policy kk_kontakt_opret on kk_kontakt for insert to authenticated with check (
  kk_er_moderator()
  or exists (select 1 from kk_events e where e.id = event_id and e.oprettet_af = auth.uid() and e.status = 'afventer')
);
drop policy if exists kk_kontakt_mod on kk_kontakt;
create policy kk_kontakt_mod on kk_kontakt for all to authenticated
  using (kk_er_moderator()) with check (kk_er_moderator());

-- ---------------------------------------------------------------------
-- 8. Billeder (Storage)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kk-billeder', 'kk-billeder', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "kk billeder laes" on storage.objects;
create policy "kk billeder laes" on storage.objects for select to anon, authenticated
  using (bucket_id = 'kk-billeder');

drop policy if exists "kk billeder upload" on storage.objects;
create policy "kk billeder upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kk-billeder' and name ~ '^[0-9a-f-]{36}\.jpg$'
    and (kk_er_moderator() or (
      select count(*) from storage.objects o
      where o.bucket_id = 'kk-billeder' and o.owner_id = auth.uid()::text and o.created_at > now() - interval '1 hour') < 10)
  );

drop policy if exists "kk billeder slet" on storage.objects;
create policy "kk billeder slet" on storage.objects for delete to authenticated
  using (bucket_id = 'kk-billeder' and kk_er_moderator());

-- ---------------------------------------------------------------------
-- 9. Startdata (kan rettes i appen under Moderator -> Indhold)
-- ---------------------------------------------------------------------
insert into kk_kategorier (slug, navn, farve, ikon, sortering) values
  ('musik',        'Musik',             '#7c3aed', '🎵', 10),
  ('foredrag',     'Foredrag',          '#0369a1', '🎤', 20),
  ('boern-familie','Børn og familie',   '#ea580c', '🧒', 30),
  ('sport',        'Sport og motion',   '#15803d', '🏃', 40),
  ('marked-fest',  'Marked og fest',    '#be123c', '🎪', 50),
  ('forening',     'Foreningsmøde',     '#475569', '🤝', 60),
  ('andet',        'Andet',             '#6b7280', '✨', 99)
on conflict (slug) do nothing;

insert into kk_maalgrupper (slug, navn, sortering) values
  ('alle', 'Alle', 10), ('boern', 'Børn', 20), ('unge', 'Unge', 30),
  ('voksne', 'Voksne', 40), ('seniorer', 'Seniorer', 50)
on conflict (slug) do nothing;

insert into kk_omraader (slug, navn, sortering) values
  ('auning', 'Auning', 10), ('gammel-auning', 'Gammel Auning', 20),
  ('albaek', 'Albæk', 30), ('skoerring', 'Skørring', 40),
  ('moerke', 'Mørke', 50), ('omegn', 'Andet i omegnen', 90)
on conflict (slug) do nothing;

insert into kk_afvisningsaarsager (tekst) values
  ('Kommerciel reklame eller tilbud uden et egentligt arrangement'),
  ('Partipropaganda eller kampagne'),
  ('Lukket privat arrangement'),
  ('Uden for kalenderens område'),
  ('Uegnet indhold'),
  ('Dublet af et eksisterende arrangement'),
  ('Mangler oplysninger'),
  ('Andet')
on conflict (tekst) do nothing;

insert into kk_ordliste (ord) values
  ('casino'), ('bitcoin'), ('viagra'), ('lån uden'), ('erotik'), ('sex ')
on conflict (ord) do nothing;

-- ---------------------------------------------------------------------
-- 10. Notifikationer: "Jeg deltager" + push
--     Tabellerne er lukkede (RLS uden policies). Enheder bruger kun funktionerne
--     nedenfor; selve udsendelsen sker i scripts/kk-job.mjs (GitHub Actions) med service_role.
--     Push-adressen (endpoint) er hemmelig og fungerer som enhedens "adgangskode".
-- ---------------------------------------------------------------------
alter table kk_events add column if not exists notificeret_ts timestamptz;   -- hvornår "nyt arrangement" blev sendt

create table if not exists kk_abonnenter (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 800),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  alle_nye boolean not null default false,
  kategorier text[] not null default '{}',
  oprettet timestamptz not null default now(),
  opdateret timestamptz not null default now()
);
alter table kk_abonnenter add column if not exists opdateret timestamptz not null default now();

create table if not exists kk_foelger (
  abonnent_id uuid not null references kk_abonnenter(id) on delete cascade,
  event_id uuid not null references kk_events(id) on delete cascade,
  oprettet timestamptz not null default now(),
  paamindelse_sendt boolean not null default false,
  aflyst_sendt boolean not null default false,
  primary key (abonnent_id, event_id)
);
alter table kk_foelger add column if not exists oprettet timestamptz not null default now();
alter table kk_foelger add column if not exists aflyst_sendt boolean not null default false;
create index if not exists kk_foelger_event_idx on kk_foelger (event_id);

alter table kk_abonnenter enable row level security;
alter table kk_foelger enable row level security;

create or replace function kk_push_gem(p_endpoint text, p_p256dh text, p_auth text, p_alle_nye boolean, p_kategorier text[])
returns void language plpgsql security definer set search_path = public as $$
declare kats text[];
begin
  if (select count(*) from kk_abonnenter where oprettet > now() - interval '1 hour') >= 300 then
    raise exception 'For mange tilmeldinger lige nu – prøv igen senere';
  end if;
  if (select count(*) from kk_abonnenter) >= 20000
     and not exists (select 1 from kk_abonnenter where endpoint = p_endpoint) then
    raise exception 'For mange enheder';
  end if;
  select coalesce(array_agg(k.slug), '{}') into kats
  from kk_kategorier k where k.slug = any(coalesce(p_kategorier, '{}'));
  insert into kk_abonnenter (endpoint, p256dh, auth, alle_nye, kategorier)
  values (p_endpoint, p_p256dh, p_auth, coalesce(p_alle_nye, false), kats)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, alle_nye = excluded.alle_nye,
        kategorier = excluded.kategorier, opdateret = now();
end $$;

create or replace function kk_push_afmeld(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from kk_abonnenter where endpoint = p_endpoint;
$$;

-- Sætter præcis hvilke arrangementer enheden følger (de, der ikke findes på serveren, ignoreres)
create or replace function kk_push_foelg(p_endpoint text, p_events uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  select id into aid from kk_abonnenter where endpoint = p_endpoint;
  if aid is null then raise exception 'Ukendt enhed'; end if;
  p_events := coalesce(p_events, '{}');
  if array_length(p_events, 1) > 200 then raise exception 'For mange arrangementer'; end if;
  delete from kk_foelger where abonnent_id = aid and not (event_id = any(p_events));
  insert into kk_foelger (abonnent_id, event_id)
  select aid, e.id from kk_events e
  where e.id = any(p_events) and e.status in ('godkendt','aflyst') and not e.skjult
  on conflict do nothing;
  update kk_abonnenter set opdateret = now() where id = aid;
end $$;

revoke all on function kk_push_gem(text, text, text, boolean, text[]) from public;
revoke all on function kk_push_afmeld(text) from public;
revoke all on function kk_push_foelg(text, uuid[]) from public;
grant execute on function kk_push_gem(text, text, text, boolean, text[]) to anon, authenticated;
grant execute on function kk_push_afmeld(text) to anon, authenticated;
grant execute on function kk_push_foelg(text, uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. Rettelink: arrangøren kan foreslå ændringer, som en moderator godkender
--     - Hvert arrangement kan få ét hemmeligt link (token). Tabellen er lukket; kun funktionerne bruges.
--     - Mens arrangementet endnu afventer første godkendelse, gemmes rettelser direkte.
--     - Er det godkendt, bliver rettelsen et FORSLAG, der først slår igennem, når en moderator godkender det.
--     - Ét ventende forslag pr. arrangement (et nyt forslag erstatter det gamle).
-- ---------------------------------------------------------------------
create table if not exists kk_rettetoken (
  event_id uuid primary key references kk_events(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  oprettet timestamptz not null default now()
);
alter table kk_rettetoken enable row level security;                     -- ingen policies

create table if not exists kk_aendringer (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references kk_events(id) on delete cascade,
  forslag jsonb not null,
  kommentar text check (kommentar is null or char_length(kommentar) <= 1000),
  aflys boolean not null default false,
  status text not null default 'afventer' check (status in ('afventer','godkendt','afvist')),
  oprettet timestamptz not null default now(),
  behandlet timestamptz,
  behandlet_af uuid
);
create unique index if not exists kk_aendringer_en_ventende on kk_aendringer (event_id) where status = 'afventer';
alter table kk_aendringer enable row level security;
drop policy if exists kk_aendringer_mod_laes on kk_aendringer;
create policy kk_aendringer_mod_laes on kk_aendringer for select using (kk_er_moderator());

-- Opretter (eller henter) rettelinket. Kun arrangementets indsender eller en moderator.
create or replace function kk_rettelink(p_event uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not (kk_er_moderator() or exists (select 1 from kk_events where id = p_event and oprettet_af = auth.uid())) then
    raise exception 'Ingen adgang';
  end if;
  insert into kk_rettetoken (event_id) values (p_event) on conflict (event_id) do nothing;
  select token into t from kk_rettetoken where event_id = p_event;
  return t;
end $$;

-- Henter arrangementet bag et link (uden kontaktoplysninger)
create or replace function kk_ret_hent(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e kk_events; a kk_aendringer;
begin
  select ev.* into e from kk_events ev join kk_rettetoken t on t.event_id = ev.id where t.token = p_token;
  if not found or e.status in ('afvist','kladde') then return null; end if;
  select * into a from kk_aendringer where event_id = e.id and status = 'afventer';
  return jsonb_build_object(
    'id', e.id, 'status', e.status, 'titel', e.titel, 'beskrivelse', e.beskrivelse, 'start_ts', e.start_ts, 'slut_ts', e.slut_ts,
    'sted_id', e.sted_id, 'sted_navn', e.sted_navn, 'adresse', e.adresse, 'omraade', e.omraade, 'kategori', e.kategori,
    'maalgruppe', e.maalgruppe, 'pris_tekst', e.pris_tekst, 'link_url', e.link_url, 'arrangoer', e.arrangoer,
    'ventende', case when a.id is null then null else jsonb_build_object('forslag', a.forslag, 'kommentar', a.kommentar, 'aflys', a.aflys, 'oprettet', a.oprettet) end);
end $$;

-- Validerer og normaliserer et forslag (kaster fejl ved ugyldige værdier)
create or replace function kk_ret_rens(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s timestamptz; sl timestamptz; titel text; ar text; lnk text; sid uuid; om text;
begin
  titel := trim(p->>'titel');
  if titel is null or char_length(titel) not between 3 and 120 then raise exception 'Titlen skal være 3-120 tegn'; end if;
  ar := trim(p->>'arrangoer');
  if ar is null or char_length(ar) not between 2 and 120 then raise exception 'Arrangør mangler'; end if;
  s := (p->>'start_ts')::timestamptz;
  sl := nullif(p->>'slut_ts','')::timestamptz;
  if s is null then raise exception 'Starttid mangler'; end if;
  if sl is not null and sl < s then raise exception 'Slut skal være efter start'; end if;
  if s > now() + interval '18 months' then raise exception 'Datoen ligger for langt ude i fremtiden'; end if;
  if not exists (select 1 from kk_kategorier where slug = p->>'kategori') then raise exception 'Ukendt kategori'; end if;
  if not exists (select 1 from kk_maalgrupper where slug = p->>'maalgruppe') then raise exception 'Ukendt målgruppe'; end if;
  om := nullif(p->>'omraade','');
  if om is not null and not exists (select 1 from kk_omraader where slug = om) then raise exception 'Ukendt område'; end if;
  sid := nullif(p->>'sted_id','')::uuid;
  if sid is not null and not exists (select 1 from kk_steder where id = sid) then raise exception 'Ukendt sted'; end if;
  if sid is null and coalesce(trim(p->>'sted_navn'),'') = '' then raise exception 'Sted mangler'; end if;
  lnk := nullif(trim(p->>'link_url'),'');
  if lnk is not null and lnk !~* '^https?://' then raise exception 'Ugyldigt link'; end if;
  if char_length(coalesce(p->>'beskrivelse','')) > 4000 or char_length(coalesce(p->>'pris_tekst','')) > 60
     or char_length(coalesce(p->>'sted_navn','')) > 120 or char_length(coalesce(p->>'adresse','')) > 200 then
    raise exception 'En tekst er for lang';
  end if;
  return jsonb_build_object(
    'titel', titel, 'beskrivelse', nullif(trim(p->>'beskrivelse'),''), 'start_ts', s, 'slut_ts', sl, 'sted_id', sid,
    'sted_navn', nullif(trim(p->>'sted_navn'),''), 'adresse', nullif(trim(p->>'adresse'),''), 'omraade', om,
    'kategori', p->>'kategori', 'maalgruppe', p->>'maalgruppe', 'pris_tekst', nullif(trim(p->>'pris_tekst'),''),
    'link_url', lnk, 'arrangoer', ar);
end $$;
revoke all on function kk_ret_rens(jsonb) from public, anon, authenticated;

-- Udfører en rettelse på selve arrangementet
create or replace function kk_anvend_forslag(p_event uuid, f jsonb, p_aflys boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update kk_events set
    titel = f->>'titel', beskrivelse = f->>'beskrivelse', start_ts = (f->>'start_ts')::timestamptz, slut_ts = (f->>'slut_ts')::timestamptz,
    sted_id = (f->>'sted_id')::uuid, sted_navn = f->>'sted_navn', adresse = f->>'adresse', omraade = f->>'omraade',
    kategori = f->>'kategori', maalgruppe = f->>'maalgruppe', pris_tekst = f->>'pris_tekst', link_url = f->>'link_url', arrangoer = f->>'arrangoer',
    status = case when p_aflys and status = 'godkendt' then 'aflyst' else status end
  where id = p_event;
end $$;
revoke all on function kk_anvend_forslag(uuid, jsonb, boolean) from public, anon, authenticated;

-- Indsender en rettelse. Returnerer 'direkte' (gemt med det samme) eller 'afventer' (kræver godkendelse).
create or replace function kk_ret_indsend(p_token uuid, p_forslag jsonb, p_kommentar text default null, p_aflys boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare e kk_events; f jsonb;
begin
  select ev.* into e from kk_events ev join kk_rettetoken t on t.event_id = ev.id where t.token = p_token;
  if not found or e.status in ('afvist','kladde') then raise exception 'Linket virker ikke længere'; end if;
  f := kk_ret_rens(p_forslag);
  if e.status = 'afventer' then
    perform kk_anvend_forslag(e.id, f, false);
    return 'direkte';
  end if;
  delete from kk_aendringer where event_id = e.id and status = 'afventer';
  insert into kk_aendringer (event_id, forslag, kommentar, aflys)
  values (e.id, f, nullif(left(trim(coalesce(p_kommentar,'')), 1000), ''), coalesce(p_aflys, false) and e.status = 'godkendt');
  return 'afventer';
end $$;

create or replace function kk_godkend_aendring(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a kk_aendringer;
begin
  if not kk_er_moderator() then raise exception 'Ingen adgang'; end if;
  select * into a from kk_aendringer where id = p_id and status = 'afventer';
  if not found then raise exception 'Forslaget findes ikke eller er allerede behandlet'; end if;
  perform kk_anvend_forslag(a.event_id, a.forslag, a.aflys);
  update kk_aendringer set status = 'godkendt', behandlet = now(), behandlet_af = auth.uid() where id = p_id;
end $$;

create or replace function kk_afvis_aendring(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not kk_er_moderator() then raise exception 'Ingen adgang'; end if;
  update kk_aendringer set status = 'afvist', behandlet = now(), behandlet_af = auth.uid() where id = p_id and status = 'afventer';
end $$;

revoke all on function kk_rettelink(uuid), kk_ret_hent(uuid), kk_ret_indsend(uuid, jsonb, text, boolean), kk_godkend_aendring(uuid), kk_afvis_aendring(uuid) from public;
grant execute on function kk_ret_hent(uuid), kk_ret_indsend(uuid, jsonb, text, boolean) to anon, authenticated;
grant execute on function kk_rettelink(uuid), kk_godkend_aendring(uuid), kk_afvis_aendring(uuid) to authenticated;
