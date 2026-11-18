// Tekstsider: om, retningslinjer, privatliv og ansvarsfraskrivelse.
// Ret teksterne frit – de er almindelig tekst. (Dette er ikke juridisk rådgivning; få dem gennemlæst, hvis I er i tvivl.)
import { CONFIG } from './config.js';
import { h, icon, toast } from './util.js';
import { S } from './state.js';

const SIDER = [['om', 'Om kalenderen'], ['regler', 'Retningslinjer'], ['privatliv', 'Privatliv'], ['ansvar', 'Ansvarsfraskrivelse']];

export function visTekst(root, side) {
  const indhold = { om, regler, privatliv, ansvar }[side]();
  root.append(
    h('nav', { class: 'under-faner', 'aria-label': 'Information' }, SIDER.map(([k, t]) => h('a', { class: 'chip' + (k === side ? ' på' : ''), href: `#/${k}` }, t))),
    h('article', { class: 'tekstside' }, ...indhold));
}

const kontakt = () => CONFIG.kontaktEmail ? h('a', { href: `mailto:${CONFIG.kontaktEmail}` }, CONFIG.kontaktEmail) : 'kalenderens ansvarlige';

function om() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installeret = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return [
    h('h1', null, `Om ${CONFIG.siteName}`),
    h('p', null, `${CONFIG.siteName} samler arrangementer i ${CONFIG.omraadeTekst} ét sted. Formålet er, at borgere, foreninger og erhverv kan se, hvad der sker, og at undgå, at to arrangementer med samme målgruppe ligger oven i hinanden.`),
    h('h2', null, 'Sådan bruger du kalenderen'),
    h('ul', null,
      h('li', null, 'Brug ', h('b', null, 'Arrangementer'), ' til at bladre og filtrere på tid, kategori, målgruppe og område.'),
      h('li', null, 'Brug ', h('b', null, 'Kalender'), ' til at se måneden samlet.'),
      h('li', null, 'Tryk på stjernen ★ for at huske et arrangement – de samles under "Kun mine ★" i filtrene. Det gemmes kun på din egen enhed.'),
      h('li', null, 'Tryk ', h('b', null, 'Føj til kalender'), ' på et arrangement for at lægge det i din egen kalender, og ', h('b', null, 'Del'), ' for at sende det videre.')),
    h('h2', null, 'Er du arrangør?'),
    h('p', null, h('a', { href: '#/opret' }, 'Opret dit arrangement her'), '. Det tager et par minutter. Når du sender det, får en moderator det til godkendelse, og så kommer det i kalenderen. Formularen viser dig undervejs, om der allerede er andet på samme tid eller sted.'),
    h('h2', null, 'Notifikationer og "Jeg deltager"'),
    h('p', null, 'Tryk på ', h('b', null, 'Jeg deltager'), ' på et arrangement, og slå notifikationer til (klokken øverst), så får du en påmindelse dagen før og besked, hvis arrangementet bliver aflyst. Du kan også vælge at få besked om nye arrangementer – alle eller kun i bestemte kategorier. Du behøver ingen konto, og du kan slå det fra igen når som helst. Se ', h('a', { href: '#/privatliv' }, 'Privatliv'), ' for, hvad der gemmes.'),
    h('p', { class: 'dæmpet' }, 'Notifikationer sendes løbende i løbet af dagen og er ikke garanteret at nå frem til tiden. Er et arrangement vigtigt for dig, så tjek altid hos arrangøren.'),
    h('h2', null, 'Brug den som app'),
    installeret ? h('p', null, 'Du bruger allerede kalenderen som app. 🎉')
      : S.installPrompt ? h('p', null, h('button', { class: 'knap primær', onclick: async () => { S.installPrompt.prompt(); await S.installPrompt.userChoice; S.installPrompt = null; } }, icon('download', 18), ' Installér som app'))
        : ios ? h('p', null, 'På iPhone/iPad: tryk på ', h('b', null, 'Del'), '-knappen i Safari og vælg ', h('b', null, 'Føj til hjemmeskærm'), '.')
          : h('p', null, 'I Chrome/Edge: åbn browserens menu og vælg ', h('b', null, 'Installér app'), ' eller ', h('b', null, 'Føj til startskærm'), '. Så får du et ikon som på en almindelig app – uden app-butik.'),
    h('h2', null, 'Kontakt'),
    h('p', null, 'Spørgsmål, rettelser eller et arrangement, der skal fjernes? Skriv til ', kontakt(), '.'),
    CONFIG.facebookUrl ? h('p', null, 'Du kan også følge os på ', h('a', { href: CONFIG.facebookUrl, target: '_blank', rel: 'noopener' }, 'Facebook'), '.') : null,
  ];
}

function regler() {
  return [
    h('h1', null, 'Retningslinjer for arrangementer'),
    h('p', null, 'Alle arrangementer godkendes af en moderator, før de vises. Det er frivillige, der driver kalenderen, så vær tålmodig – og hjælp os ved at udfylde oplysningerne så præcist som muligt.'),
    h('h2', null, 'Hvad hører til i kalenderen'),
    h('ul', null,
      h('li', null, `Arrangementer i ${CONFIG.omraadeTekst}, som er åbne for offentligheden, med en tydelig dato, tid og et sted.`),
      h('li', null, 'Kultur, musik, foredrag, børne- og familiearrangementer, sport og motion, markeder, fester, foreningsmøder og lignende.'),
      h('li', null, 'Åbne politiske møder og debatter.')),
    h('h2', null, 'Hvad afvises'),
    h('ul', null,
      h('li', null, 'Rene tilbud, rabatter og produktreklamer uden et egentligt arrangement.'),
      h('li', null, 'Partipropaganda og kampagner (åbne møder er tilladt).'),
      h('li', null, 'Lukkede private arrangementer, fx fødselsdage og interne møder.'),
      h('li', null, 'Arrangementer uden for området uden en særlig lokal tilknytning.'),
      h('li', null, 'Ulovligt, krænkende, diskriminerende eller voksenindhold samt pyramide- og MLM-lignende "møder".'),
      h('li', null, 'Dubletter, spam og ufuldstændige indsendelser.')),
    h('h2', null, 'Billeder og tekst'),
    h('ul', null,
      h('li', null, 'Upload kun billeder, du selv har taget eller har tilladelse til at bruge (fx plakater, du har lavet, eller pressebilleder, du må bruge).'),
      h('li', null, 'Undgå billeder, hvor enkeltpersoner – især børn – kan genkendes, medmindre de har givet tilladelse (for børn: forældrene).'),
      h('li', null, 'Skriv ikke private oplysninger om andre (adresser, telefonnumre, e-mails) i titel og beskrivelse. Brug kun kontaktoplysninger, som er beregnet til offentligheden, fx foreningens egen adresse.'),
      h('li', null, 'Moderatorerne må rette stavefejl, forkorte tekster og ændre kategori eller billede, hvis det er nødvendigt.')),
    h('h2', null, 'Dato, tid og sted'),
    h('p', null, 'Opgiv det rigtige starttidspunkt og sted. Ændres noget senere, så brug det personlige rettelink, du fik, da du sendte arrangementet. Rettelsen skal godkendes af en moderator, før den vises. Har du mistet linket, så skriv til ', kontakt(), '. Skal en hel række af datoer lægges ind (fx hver torsdag), så skriv til os – så sørger en moderator for det.'),
    h('h2', null, 'Moderation'),
    h('p', null, 'Moderatorerne kan afvise, rette, aflyse eller fjerne arrangementer, også efter de er godkendt. Der er ikke krav om en begrundelse, men vi forsøger at give en, når vi afviser.'),
  ];
}

function privatliv() {
  return [
    h('h1', null, 'Privatliv'),
    h('p', null, `Ansvarlig for kalenderen (dataansvarlig) er ${CONFIG.ansvarlig}. Du kan kontakte os på `, kontakt(), '.'),
    h('p', null, 'Kort fortalt: du behøver ikke oprette en konto for at bruge kalenderen. Vi bruger ingen sporings-, statistik- eller reklamecookies, og vi sælger eller deler ikke oplysninger.'),

    h('h2', null, 'Hvilke oplysninger behandler vi, og hvorfor?'),
    h('ul', null,
      h('li', null, h('b', null, 'Arrangementsoplysninger'), ' (titel, tekst, tid, sted, pris, link, billede og arrangørnavn). De vises offentligt, når arrangementet er godkendt. Formål: at vise en kalender over lokale arrangementer.'),
      h('li', null, h('b', null, 'Kontaktoplysninger'), ' (navn og e-mail og/eller telefon), som arrangøren selv skriver, når et arrangement sendes ind. De vises ', h('b', null, 'aldrig'), ' offentligt og kan kun ses af moderatorer. Formål: at kunne stille spørgsmål til og rette op på arrangementet. Grundlaget er arrangørens samtykke ved indsendelsen.'),
      h('li', null, h('b', null, 'Moderatorer og admins'), ' har en konto med e-mail og adgangskode. Formål: at administrere kalenderen.'),
      h('li', null, h('b', null, 'Teknisk session:'), ' når du sender et arrangement, oprettes en anonym session (uden navn og e-mail), så vi kan begrænse spam og lade dig se dit eget arrangement, mens det afventer godkendelse. Hvis Cloudflare Turnstile er slået til, bruges det til at skelne mennesker fra robotter.'),
      h('li', null, h('b', null, 'Rettelink:'), ' når du sender et arrangement, får du et personligt link, så du kan foreslå rettelser. Linket er en tilfældig kode knyttet til arrangementet (ikke til dig). Rettelser vises først, når en moderator har godkendt dem, og rettelsesforslag slettes sammen med arrangementet.'),
      h('li', null, h('b', null, 'Notifikationer (valgfrit):'), ' hvis du slår notifikationer til, gemmer vi din browsers push-adresse (en teknisk adresse til netop din enhed), dine valg (nye arrangementer, kategorier) og hvilke arrangementer du har trykket "Jeg deltager" på. Der gemmes ikke navn, e-mail eller telefonnummer. Selve beskederne leveres via browserens egen tjeneste (fx Google, Apple eller Mozilla), som dermed kan se, at din enhed modtager en besked. Grundlaget er dit samtykke, som du giver ved at slå notifikationer til.')),

    h('h2', null, 'På din egen enhed'),
    h('p', null, 'Dine stjernemarkerede arrangementer, rettelinks til arrangementer, du selv har sendt ind, dine notifikationsvalg og de senest hentede arrangementer gemmes i din browsers lokale lager, så kalenderen kan åbne hurtigt og delvist virke uden internet. Det sendes ikke til tredjepart og bruges ikke til sporing. Du kan slette det ved at rydde websitedata i din browser.'),

    h('h2', null, 'Hvor længe gemmer vi det?'),
    h('ul', null,
      h('li', null, 'Arrangementer – inklusive kontaktoplysninger og billeder – gemmes højst til årsskiftet. Efter 1. januar slettes arrangementer fra tidligere år. Du kan til enhver tid bede os om at slette eller rette dine oplysninger tidligere.'),
      h('li', null, 'Afviste arrangementer og tilhørende kontaktoplysninger kan slettes af moderatorerne på et hvilket som helst tidspunkt og slettes senest ved årsskiftet.'),
      h('li', null, 'Notifikationer: du kan slå dem fra via klokken, og så slettes din push-adresse og dine valg. Enheder, der ikke har været i kontakt med kalenderen i ca. fire måneder, eller som ikke længere findes, fjernes automatisk.')),

    h('h2', null, 'Hvem har adgang, og hvor ligger data?'),
    h('p', null, 'Kontaktoplysninger kan kun ses af moderatorer og admins. Data opbevares hos Supabase (database og billeder). Siden hostes på GitHub Pages, og et automatisk job på GitHub Actions laver delingssider og sender notifikationer ud fra de offentlige arrangementsdata. Notifikationer leveres via browserens push-tjeneste. Disse leverandører kan behandle tekniske oplysninger som IP-adresser i forbindelse med drift og sikkerhed, og nogle af dem kan ligge uden for EU/EØS med de overførselsgrundlag, leverandørerne selv opgiver.'),

    h('h2', null, 'Når du deler et arrangement'),
    h('p', null, 'Deler du et link til et arrangement på fx Facebook, åbner modtageren en lille side med arrangementets titel, tid, sted og billede, så der kan vises en forhåndsvisning. Der er ingen kontaktoplysninger på siden. Facebook og andre tjenester har deres egne privatlivsregler.'),

    h('h2', null, 'Personoplysninger i arrangementer og billeder'),
    h('p', null, 'Arrangører må kun skrive oplysninger om andre personer eller uploade billeder af genkendelige personer, hvis de har lov til det. Mener du, at et billede eller en tekst viser dig eller dit barn uden tilladelse, så skriv til os, så fjerner vi det hurtigst muligt.'),

    h('h2', null, 'Dine rettigheder'),
    h('p', null, 'Du har ret til indsigt, berigtigelse, sletning og begrænsning af behandlingen af dine oplysninger, til at gøre indsigelse og til at trække et samtykke tilbage. Skriv til ', kontakt(), '. Giv os gerne arrangementets titel og dato, så vi kan finde det. Du kan også klage til Datatilsynet (datatilsynet.dk).'),
    h('p', { class: 'dæmpet' }, 'Opdateret: ' + new Date().toLocaleDateString('da-DK', { year: 'numeric', month: 'long' }) + '.'),
  ];
}

function ansvar() {
  return [
    h('h1', null, 'Ansvarsfraskrivelse'),
    h('p', null, `${CONFIG.siteName} drives af frivillige og er en service uden garanti. Kalenderen er ikke en officiel kommunal tjeneste.`),
    h('ul', null,
      h('li', null, 'Oplysningerne om de enkelte arrangementer er indsendt af arrangørerne selv. Vi kontrollerer dem ikke i detaljer og påtager os intet ansvar for, at de er korrekte, fuldstændige eller opdaterede.'),
      h('li', null, 'Arrangementer kan blive ændret, flyttet eller aflyst uden varsel. Tjek altid hos arrangøren, før du tager af sted.'),
      h('li', null, 'Arrangøren er ansvarlig for arrangementets afvikling, tilladelser, forsikringer, billetsalg og tilmeldinger, og for at have ret til de billeder og tekster, der uploades.'),
      h('li', null, 'Vi påtager os intet ansvar for tab, der opstår som følge af brug af kalenderen eller af links til eksterne sider.'),
      h('li', null, 'Vi forbeholder os retten til at afvise, rette, skjule eller fjerne arrangementer og indhold uden varsel, og til at ændre eller lukke tjenesten.'),
      h('li', null, 'Notifikationer og påmindelser sendes efter bedste evne, men kan forsinkes eller udeblive (fx pga. din enheds indstillinger eller netværket). Stol ikke alene på dem.'),
      h('li', null, 'Delingslinks og forhåndsvisninger (fx på Facebook) vises af de pågældende tjenester og kan være forsinkede eller vise ældre oplysninger.'),
      h('li', null, 'Billeder og tekster tilhører arrangørerne eller deres rettighedshavere. Mener du, at noget krænker dine rettigheder, så skriv til os, så fjerner vi det hurtigst muligt.'),
      h('li', null, 'Vi er ikke part i og ansvarlige for aftaler mellem arrangører og deltagere.'),
      h('li', null, 'Kalenderen kan have nedetid eller fejl.')),
    h('p', { class: 'dæmpet' }, 'Opdateret: ' + new Date().toLocaleDateString('da-DK', { year: 'numeric', month: 'long' }) + '.'),
  ];
}
