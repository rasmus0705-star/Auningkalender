-- =====================================================================
-- VALGFRI: eksempelarrangementer til at teste siden.
-- Alle har "[EKSEMPEL]" i titlen, så de er nemme at finde og slette:
--   delete from kk_events where titel like '[EKSEMPEL]%';
-- Kør først 01_setup.sql.
-- =====================================================================

insert into kk_steder (navn, adresse, omraade) values
  ('Eksempel: Forsamlingshuset', 'Eksempelvej 1, Auning', 'auning'),
  ('Eksempel: Idrætshallen', 'Hallevej 2, Auning', 'auning')
on conflict do nothing;

insert into kk_events (titel, beskrivelse, start_ts, slut_ts, sted_navn, omraade, kategori, maalgruppe, pris_tekst, arrangoer, status)
values
  ('[EKSEMPEL] Fællesspisning', 'Alle er velkomne til en hyggelig aften med mad og snak.',
     (date_trunc('day', now()) + interval '3 days 17 hours'), (date_trunc('day', now()) + interval '3 days 20 hours'),
     'Eksempel: Forsamlingshuset', 'auning', 'forening', 'alle', '60 kr.', 'Eksempelforeningen', 'godkendt'),
  ('[EKSEMPEL] Koncert med lokalt band', 'En aften med live musik.',
     (date_trunc('day', now()) + interval '8 days 19 hours'), (date_trunc('day', now()) + interval '8 days 22 hours'),
     'Eksempel: Forsamlingshuset', 'auning', 'musik', 'voksne', 'Gratis', 'Eksempelforeningen', 'godkendt'),
  ('[EKSEMPEL] Børnenes juleværksted', 'Kreativt værksted for børn og forældre.',
     (date_trunc('day', now()) + interval '12 days 10 hours'), (date_trunc('day', now()) + interval '12 days 13 hours'),
     'Eksempel: Idrætshallen', 'auning', 'boern-familie', 'boern', 'Gratis', 'Eksempelforeningen', 'godkendt'),
  ('[EKSEMPEL] Julemarked (flere dage)', 'Marked med boder og aktiviteter.',
     (date_trunc('day', now()) + interval '19 days 10 hours'), (date_trunc('day', now()) + interval '21 days 16 hours'),
     'Eksempel: Idrætshallen', 'auning', 'marked-fest', 'alle', 'Gratis', 'Eksempelforeningen', 'godkendt');

-- Triggeren sætter nye rækker til "afventer", når de indsættes fra SQL Editor; her godkender vi dem.
update kk_events set status = 'godkendt', af_moderator = true, flag = '{}' where titel like '[EKSEMPEL]%' and status = 'afventer';
