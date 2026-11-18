# Kulturkalender Auning – opsætning og drift

Gratis webapp (PWA) på GitHub Pages + Supabase. Eneste udgift: domænet.

## Indhold i pakken

| Fil / mappe | Hvad |
|---|---|
| `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js` | Selve siden (ingen build-trin) |
| `js/config.js` | **Eneste fil du skal rette**: nøgler, navn, kontakt, farve |
| `sql/01_setup.sql` | Database, regler (RLS), funktioner, billedlager, startdata |
| `sql/02_eksempeldata.sql` | Valgfri testdata (`[EKSEMPEL]` i titlen) |
| `sql/03_foerste_admin.sql` | Gør dig til første admin |
| `sql/07_event_kategorier.sql` | Tilføj ekstra kategorier til arrangementer |
| `sql/08_valgfrit_sted.sql` | Gør sted valgfrit, også via arrangørens rettelink |
| `sql/09_indsendte_eventkategorier.sql` | Lad arrangører vælge flere kategorier ved indsendelse |
| `.github/workflows/kk-job.yml` + `scripts/` | Kører hver time: delingssider, notifikationer og holder gratis Supabase vågen |
| `sql/06_moderator_invites.sql` + `supabase/functions/kk-invite-moderator/` | Admininvitationer til nye moderatorer |
| `404.html`, `d/` | Delingslinks (`/d/<id>/`) og forhåndsvisning til Facebook (`d/` oprettes af jobbet) |

## 0. Prøv den først (2 minutter, ingen opsætning)

Så længe `js/config.js` indeholder `DIT-PROJEKT`, kører siden i **demo-tilstand** med eksempeldata. Intet gemmes. Moderatorlogin i demo: vilkårlig e-mail og koden `demo`.

Siden bruger moduler og skal derfor åbnes via en webserver (ikke ved at dobbeltklikke på filen). Åbn en terminal i mappen og kør `python -m http.server 8000`, og gå til <http://localhost:8000>. På GitHub Pages virker det af sig selv.

## 1. Supabase (i dit eksisterende projekt)

Alt har præfikset `kk_`, så det rører ikke dine andre tabeller.

1. **SQL Editor → New query**: indsæt hele `sql/01_setup.sql` → **Run**. Kan køres igen uden skade. (Valgfrit: `02_eksempeldata.sql` for testdata.)
2. Kør også `sql/06_moderator_invites.sql`, hvis du vil bruge moderatorinvitationer.
3. Kør også `sql/07_event_kategorier.sql`, hvis arrangementer skal kunne have flere kategorier.
4. Kør også `sql/08_valgfrit_sted.sql`, så arrangører kan sende og rette arrangementer uden at kende stedet.
5. Kør også `sql/09_indsendte_eventkategorier.sql`, så arrangører må gemme flere valgte kategorier på deres ventende indsendelser.
6. **Authentication → Sign In / Providers**: slå **Allow anonymous sign-ins** til (bruges, når en arrangør sender et arrangement, uden navn eller e-mail). Sørg for, at **Email** er slået til.
7. **Authentication → URL Configuration**: sæt *Site URL* til din adresse (fx `https://<brugernavn>.github.io/<repo>/` eller dit domæne), så bekræftelsesmails peger det rigtige sted hen.
8. **Project Settings → API**: kopiér *Project URL* og *anon public key* ind i `js/config.js`. Anon-nøglen er designet til at være offentlig. Brug **aldrig** `service_role`-nøglen på siden.
9. **Storage**: tjek, at bucketen `kk-billeder` findes (oprettes af SQL'en). Ellers opret en *public* bucket med det navn, maks. 3 MB, kun billedfiler.

> **Deler du projekt med andre apps?** Anonyme brugere får databaserollen `authenticated`, ligesom rigtige brugere. Har en anden app i projektet politikker som `to authenticated using (true)`, kan anonyme besøgende pludselig læse dens data. Tjek først i SQL Editor: `select schemaname, tablename, policyname, roles, qual from pg_policies where 'authenticated' = any(roles) and tablename not like 'kk\_%';` og stram dem, der har `true` eller mangler ejer-tjek. Punkt 2 påvirker ellers ikke andre apps. Slå ikke *Captcha protection* til (afsnit 3), hvis andre apps i projektet bruger login, for den gælder for hele projektet.

## 2. GitHub Pages

1. Opret et repo og læg alle filer fra denne mappe i roden (inkl. mappen `.github`).
2. **Settings → Pages → Deploy from a branch → main / (root)**.
3. Efter et minut er siden live på `https://<brugernavn>.github.io/<repo>/`.
4. **Eget domæne (senere):** Settings → Pages → *Custom domain*, og peg DNS til GitHub efter deres vejledning. Slå *Enforce HTTPS* til. Tilføj domænet under *Site URL* i Supabase (punkt 1.3).
5. **Timejobbet** (afsnit 3): giver delingskort, notifikationer og holder samtidig Supabase vågent.

## 3. Timejobbet: delingskort, notifikationer og hold-vågen

`.github/workflows/kk-job.yml` kører hver time (og kan startes manuelt under *Actions → Kulturkalender-job → Run workflow*). Det gør tre ting: (1) laver en lille delingsside pr. arrangement, så et delt link får billede og tekst på Facebook, (2) sender notifikationer, og (3) læser fra databasen, så gratis Supabase ikke sættes på pause.

Opsætning i repoet under **Settings → Secrets and variables → Actions**:

| Navn | Type | Værdi |
|---|---|---|
| `DATABASE_URL` | Secret | Forbindelse for den begrænsede jobrolle `kk_job` (se nedenfor). Jobbet bruger **ikke** `service_role`-nøglen, så en lækage kan kun røre `kk_`-tabellerne |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Secrets | Nøglepar til notifikationer (herunder). Uden dem sendes der ikke notifikationer, men delingssider og hold-vågen virker stadig |
| `SITE_URL` | Variable (valgfri) | Fx `https://auningkalender.dk` – sæt den, når du har eget domæne. Ellers findes adressen automatisk fra GitHub eller filen `CNAME` |

**Jobrollen `kk_job`** (gør én gang):

1. Åbn `sql/05_job_rolle.sql`, **skift kodeordet** i filen til et langt, tilfældigt et, og kør filen i SQL Editor. Rollen kan kun læse de `kk_`-tabeller, jobbet skal bruge, og opdatere nogle få felter.
2. I Supabase: **Connect → Session pooler**. Kopiér forbindelsesstrengen og sæt rollen ind, så den ser ud som `postgresql://kk_job.<project-ref>:<kodeord>@<pooler-host>:5432/postgres`. Læg den som secret `DATABASE_URL`.
3. Mangler `DATABASE_URL`, springer jobbet over med en besked (det fejler ikke).

Hold-vågen: jobbet skriver en lille ugentlig fil (`d/.hjerteslag`), så GitHub ikke slår tidsplanen fra efter 60 dages stilhed, og kører `gh workflow enable` for en sikkerheds skyld.

Tjek også **Settings → Actions → General → Workflow permissions → Read and write**, så jobbet må gemme delingssiderne.

### Notifikationer ("Jeg deltager" og nye arrangementer)

1. Lav et nøglepar (kræver Node): `npx web-push generate-vapid-keys`.
2. Læg *public* i `vapidPublicKey` i `js/config.js` (offentlig) og både public og private som secrets ovenfor. Mist aldrig den private nøgle, og skift den ikke senere, for så skal alle slå notifikationer til igen.
3. Når nøglen er sat, vises en klokke øverst på siden. Uden nøgle er funktionen skjult.

Hvad brugeren får: påmindelse dagen før for arrangementer markeret med "Jeg deltager", besked ved aflysning, og efter eget valg besked om nye arrangementer (alle eller udvalgte kategorier). En serie (fx 7 torsdage) giver én besked. Beskederne går ud ved næste timekørsel efter godkendelse, så der kan gå op til en time. Ændringer i tid eller sted sender ikke en besked (kun aflysning).

Gode at vide: iPhone/iPad kræver, at siden er lagt på hjemmeskærmen (klokken forklarer det). Enheder, der ikke har været i kontakt i ca. fire måneder, fjernes automatisk. Jobbet kan køre i tørtilstand: `DRY_RUN=1 node scripts/kk-job.mjs` (kræver `npm install --prefix scripts` og miljøvariablerne ovenfor).

### Delingskort til Facebook

"Del"-knappen på et arrangement giver et link som `https://din-adresse/d/<id>/`. Det sender videre til arrangementet, og Facebook læser billede, titel, tid og sted. Siden laves af jobbet, så et lige godkendt arrangement har først forhåndsvisning efter næste timekørsel. Kør jobbet manuelt, hvis det haster. Har Facebook allerede set et link uden billede, så brug *Sharing Debugger* (developers.facebook.com/tools/debug) og tryk *Scrape again*. Delingssiderne gemmes i mappen `d/` i repoet; det er normalt, at jobbet laver små commits.

### Google-søgning

Hvert godkendt arrangement får en statisk, læsbar side i `d/<id>/` med titel, tid, sted og strukturerede data (schema.org *Event*), og jobbet vedligeholder `sitemap.xml`, `robots.txt` og en oversigt på `d/`. Selve appen er uændret; de statiske sider sender besøgende videre til den (`#/event/<id>`). Arrangementer, der er slut eller fjernet, forsvinder fra siderne.

Sådan får du det til at virke:

1. **Eget domæne anbefales.** `sitemap.xml` og `robots.txt` virker kun i roden af et domæne. På `brugernavn.github.io/repo/` ligger de i en undermappe, og Google ignorerer dem der.
2. Sæt variablen `SITE_URL` (se ovenfor), og kør jobbet manuelt én gang.
3. Opret siden i **Google Search Console** (gratis), og indsend `https://din-adresse/sitemap.xml`.
4. Vær tålmodig: det tager typisk dage til uger, før Google viser siderne, og der er ingen garanti for placering. Forsiden er stadig JavaScript-baseret; det er arrangementssiderne, der indekseres.

## 3b. Spamværn (valgfrit, anbefalet hvis projektet ikke bruger login andre steder)

Uden captcha beskytter disse ting allerede: moderatorgodkendelse, max 5 indsendelser pr. time og max 8 ventende pr. enhed, flag på links og ord, og Supabases egne grænser for anonyme logins.

Vil du have captcha: opret en gratis Turnstile-site i Cloudflare. Indsæt *site key* i `turnstileSiteKey` i `js/config.js`, og indsæt *secret* i Supabase under **Authentication → Attack Protection → Enable Captcha protection → Turnstile**.

## 4. Første admin

1. Åbn siden → **Moderator** (nederst) → **Ny moderator? Opret konto**. Bekræft e-mailen, hvis du får en.
2. Åbn `sql/03_foerste_admin.sql`, skift e-mailadressen til din og kør den i SQL Editor.
3. Log ind på Moderator-siden. Du er nu admin.
4. Gå til **Roller** for at give en eksisterende konto moderator- eller adminrettigheder, eller invitere en ny moderator. Der skal altid være mindst én admin.

### Invitér en ny moderator

En admin kan invitere en person, før vedkommende har oprettet en konto. Gå til **Moderator → Roller → Invitér ny moderator**, og indtast e-mailadressen. Supabase sender et invitationlink. Modtageren vælger selv en adgangskode; moderatorrollen tildeles først, når invitationen accepteres. Eksisterende konti kan stadig få en rolle direkte i samme fane.

Funktionen bruger en Supabase Edge Function, så `service_role`/secret key aldrig ligger i browseren:

1. Kør `sql/06_moderator_invites.sql` i SQL Editor.
2. Fra projektmappen, log ind med Supabase CLI (`supabase login`), og deploy funktionen: `supabase functions deploy kk-invite-moderator --project-ref skktwjsoqjgmilrojqac`.
3. Supabase Auth' standardmail sender kun til adresser, der tilhører dit Supabase-organization team, og den har en lav afsendelsesgrænse. For at invitere andre adresser skal du først konfigurere en SMTP-udbyder under **Authentication → SMTP Settings**.

Hvis du senere ændrer webadressen, skal både `SITE_URL` og `allowedOrigins` øverst i `supabase/functions/kk-invite-moderator/index.ts` opdateres, og funktionen deployes igen.

## 4b. Startindlæsning fra det gamle dokument

`sql/04_import_fra_dokument.sql` indeholder de 81 arrangementer fra Kulturkalender.docx (nov. 2026 – dec. 2027). Kør den i SQL Editor efter `01_setup.sql` – den kan køres igen uden at lave dubletter, og den opretter de steder, der mangler (Kulturperronen, Sognehuset, AIK m.fl.).

- Arrangementerne udgives med det samme som godkendte. Gennemse dem under **Moderator → Kommende** bagefter.
- Arrangementer uden klokkeslæt ("Info følger", "Åbningstiden", "Program følger") vises som **Tid følger**, og den oprindelige tekst står i beskrivelsen. Ret dem, når tiden kendes (så fjernes teksten manuelt).
- Kategori, målgruppe og arrangør er gættet ud fra titel, genre og sted – kig dem igennem. Arrangør står som "Ikke oplyst", hvor dokumentet ikke nævner en.
- Kyndelmissegudstjenesten (31. januar 2027, kl. 14–15, Kirkevej 2) manglede dato i dokumentet og er lagt ind manuelt i scriptet.
- Retter du dokumentet og vil indlæse igen: `python3 scripts/docx_til_sql.py Kulturkalender.docx` (kræver `pip install python-docx`) laver filen påny. Ændrede rækker bliver til nye arrangementer, så slet de gamle først.
- Vil du ikke have notifikationer til de importerede arrangementer: kør importen, **før** du sætter VAPID-nøgler og starter timejobbet – så markeres de som annonceret uden at sende noget. (Jobbet sender kun "nyt arrangement"-beskeder til dem, der har bedt om det, så der sker intet, før nogen har tilmeldt sig.)

## 5. Daglig brug

- **Afventer**: godkend med ét tryk, afvis med årsag, eller ret. *Godkend alle uden advarsler* tager de rene indsendelser. Røde mærker (fx *mange links*, *ordliste: casino*, *mulig dublet*) betyder, at du bør kigge efter.
- **Nyt arrangement** (som moderator): udgives med det samme. Her kan du også sætte **gentagelser** (ugentligt, hver 2. uge, første torsdag i måneden m.m.). *Dupliker* kopierer et eksisterende arrangement.
- **Aflys** viser arrangementet som aflyst. **Skjul** fjerner det midlertidigt.
- **Steder** (moderator og admin) og **Indhold** (admin): kategorier, målgrupper, områder, afvisningsårsager og ordliste kan rettes uden kode.
- Opret kategorier under **Moderator → Indhold → Kategorier**. Skriv en kort unik kode (fx `film-og-teater`), navn, ikon og farve, og tryk **Tilføj**. Arrangører kan vælge flere kategorier ved indsendelse. Moderatorer og admins kan bagefter rette hovedkategori og ekstra kategorier; filtre og notifikationer bruger alle valgte kategorier.
- Sted er valgfrit ved indsendelse. Moderatorer og admins kan tilføje eller ændre det senere via arrangementets redigering.
- Sluttidspunkt er valgfrit. Markér **Sluttidspunkt ikke oplyst**, når det ikke kendes; datoen kan stadig udfyldes, hvis arrangementet varer flere dage.
- Konfliktcheck i formularen advarer om samme sted/tid (rød), samtidige arrangementer (gul) og andet samme dag (blå).

### Rettelser fra arrangører (rettelink)

Når en arrangør sender et arrangement, får hun et personligt **rettelink** på kvitteringssiden (og det huskes i hendes browser, hvor der også dukker en knap *Foreslå rettelse* op på arrangementet). Via linket kan hun rette titel, tid, sted, pris m.m. eller melde det aflyst.

- Er arrangementet endnu ikke godkendt, gemmes rettelsen med det samme.
- Er det godkendt, bliver rettelsen et **forslag**. Intet ændres offentligt, før du trykker *Godkend* under **Moderator → Afventer → Foreslåede rettelser** (du ser gammelt → nyt, arrangørens besked og kontaktoplysninger). *Afvis* kasserer forslaget; *Ret selv* åbner den normale redigering. Et nyt forslag erstatter et ventende.
- Du kan selv lave et link til et arrangement (fx et du har oprettet for en forening) med knappen **Rettelink** på arrangementet og sende det videre.
- Linket giver kun mulighed for at foreslå rettelser – ikke at se kontaktoplysninger eller billeder. Billeder kan ikke skiftes via linket (skriv til moderatoren i beskedfeltet).
- Følgere af arrangementet får (som før) kun besked ved aflysning, ikke ved flyttet tid eller sted.

## 6. Årsoprydning (hver januar)

Arrangementer, kontaktoplysninger og billeder gemmes højst til årsskiftet. Gamle arrangementer vises ikke offentligt, men slettes først, når en admin trykker på **Moderator → Oprydning → Slet gamle arrangementer** (sletter også billederne). Samme sted finder du **Ubrugte billeder** (uploadede billeder uden arrangement, fx fra afbrudte indsendelser), som kan slettes. Sæt en kalendererindring til 2. januar.

Valgfri oprydning af anonyme sessioner (kør af og til i SQL Editor):
```sql
delete from auth.users where is_anonymous and created_at < now() - interval '30 days';
```

## 7. Backup

Gratisplanen har ingen automatisk backup. (Tabellerne `kk_abonnenter`/`kk_foelger` indeholder kun tekniske push-adresser, men tag dem med i en backup, hvis du vil bevare tilmeldinger.) Eksportér jævnligt (fx månedligt), og husk, at `kk_kontakt` indeholder personoplysninger. Gem filen sikkert, og slet den efter årsskiftet.

- Table Editor → vælg `kk_events` → *Export as CSV*, eller
- `pg_dump "<connection string fra Project Settings → Database>" --table='kk_*' -f kalender-backup.sql`

## 8. Opdateringer af siden

Ændrer du filer, så hæv `VERSION` i `sw.js` (fx `kk-v3`). Ellers kan gamle versioner ligge i brugernes cache.

## 9. Overdragelse (hvis nogen overtager)

Giv videre: ejerskab af GitHub-repoet (eller tilføj som admin), adgang til Supabase-projektet (eller en eksport af `kk_*`-tabellerne og en kopi af `sql/`), adgang til domæneudbyderen og evt. Cloudflare-kontoen, `js/config.js` og en admin-rolle til den nye ansvarlige i appen. Opdater derefter *ansvarlig* og *kontaktEmail* i `js/config.js`, så privatlivsteksten stemmer.

## 10. En anden by

Kopiér repoet, opret et nyt Supabase-projekt (gratis plan: 2 aktive projekter), kør `01_setup.sql` og ret derefter kategorier og områder i appen. Ret `js/config.js` (navn, tekst, områder, farve, kontakt) og peg et nyt domæne på kopien.

## Ærlig status

- Frontend er testet i browser i demo-tilstand (desktop og mobil): visning, kalender, formular, konfliktcheck, gentagelser, moderator, roller, indhold og oprydning.
- Timejobbet er kørt mod en lokal Postgres som den begrænsede rolle `kk_job` (sider, beskeder, påmindelser, aflysninger, oprydning), men ikke mod rigtige Supabase, rigtige browsere/Google/Facebook. Forbindelsesstrengen til poolen og anonym login testes først, når du sætter det op.
- Databasen (`01_setup.sql`) er kørt og testet i en lokal Postgres 16 med Supabase-lignende roller: oprettelse, tvungen status, rate limit, kontaktbeskyttelse, roller, konfliktcheck og oprydning virker. Reglerne for **Supabase Storage** (billeder) og selve **Supabase Auth** er ikke testet live, så gennemfør afsnit 1 og test med et rigtigt arrangement med billede, før du går i luften.
- Kortet på arrangementssiden vises kun for steder med koordinater. Ellers er der en "Find vej"-knap.
- Notifikationer og delingskort er bygget. Jobbet er testet mod en lokal Postgres med PostgREST (samme lag som Supabase) og en falsk push-tjeneste: nye arrangementer, serier samlet i én besked, påmindelse, aflysning, ingen dubletter ved genkørsel, og døde enheder fjernes. **Ikke testet:** rigtig levering til Chrome/Safari/Firefox og selve Facebook-forhåndsvisningen. Test begge, når du er live (slå notifikationer til på din egen telefon, og godkend et arrangement).
- Kun aflysning udløser besked om ændringer; flytning af tid/sted gør ikke.
- Tekster om privatliv, retningslinjer og ansvar er skærpet (bl.a. notifikationer, billedrettigheder og dataoverførsler), men er stadig et udgangspunkt og ikke juridisk rådgivning. Få dem gennemlæst, hvis du lancerer officielt, og ret afsnittet om dataansvarlig til i `js/config.js`.
