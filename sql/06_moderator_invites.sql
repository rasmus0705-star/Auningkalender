-- Invitationer til nye moderatorer.
-- Kør efter 01_setup.sql. Kun en admin kan sende invitationer via Edge Function.

create table if not exists kk_moderator_invites (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 5 and 200),
  invited_by uuid not null references auth.users(id) on delete cascade,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table kk_moderator_invites enable row level security;
revoke all on table kk_moderator_invites from public, anon, authenticated;

-- Kun den inviterede, bekræftede bruger kan se, at invitationen venter.
create or replace function kk_moderator_invite_pending() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1
    from kk_moderator_invites i
    join auth.users u on u.id = i.user_id
    where i.user_id = auth.uid()
      and lower(i.email) = lower(u.email)
      and u.email_confirmed_at is not null
      and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
      and i.accepted_at is null
  );
$$;

-- Giv moderatorrollen først efter invitationen er accepteret og e-mailen bekræftet.
create or replace function kk_moderator_invite_accept() returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  invited_email text;
begin
  if uid is null then raise exception 'Log ind via invitationslinket først'; end if;

  select lower(u.email) into invited_email
  from auth.users u
  where u.id = uid and u.email_confirmed_at is not null and not u.is_anonymous;
  if invited_email is null then raise exception 'Bekræft e-mailadressen først'; end if;

  update kk_moderator_invites
  set accepted_at = now()
  where user_id = uid and lower(email) = invited_email and accepted_at is null;

  if not found then
    if exists (select 1 from kk_roller where user_id = uid and rolle in ('moderator','admin')) then
      return 'Rollen er allerede aktiv.';
    end if;
    raise exception 'Der findes ingen ventende moderatorinvitation til denne konto';
  end if;

  insert into kk_roller (user_id, rolle) values (uid, 'moderator')
  on conflict (user_id) do update
    set rolle = case when kk_roller.rolle = 'admin' then 'admin' else 'moderator' end;

  return 'Invitation accepteret. Du er nu moderator.';
end $$;

revoke all on function kk_moderator_invite_pending() from public, anon, authenticated;
revoke all on function kk_moderator_invite_accept() from public, anon, authenticated;
grant execute on function kk_moderator_invite_pending() to authenticated;
grant execute on function kk_moderator_invite_accept() to authenticated;
