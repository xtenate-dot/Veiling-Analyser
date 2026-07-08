# Veiling Analyser — refactored

## Draaien
Dubbelklikken op `index.html` werkt in de meeste browsers, maar voor volledige
PWA-ondersteuning (installeerbaar, offline-cache via de service worker) moet de
map via `http(s)://` bediend worden — browsers registreren service workers niet
op `file://`. Simpelste manier lokaal:

```
cd app
python3 -m http.server 8000
# open http://localhost:8000
```

Of upload de hele map naar een gratis static host (GitHub Pages, Netlify, Vercel).

## Structuur
```
index.html              schema/markup, laadt de modules hieronder in volgorde
css/style.css            alle stijl, via CSS-variabelen (zie :root)
js/helpers.js             fmt/datum/percentage-formatters, parseLooseJSON, kleine utils
js/logger.js               centrale logger (info/warn/error) i.p.v. losse console.log's
js/storage.js               enige module die localStorage aanraakt, alles in try/catch
js/state.js                  één centraal App.state object i.p.v. losse globals
js/veilinghuizen.js           standaardlijst, CRUD, kostenberekening, invoervalidatie
js/api.js                     Claude-aanroepen: timeout (30s), retry bij netwerkfout,
                               response-validatie — enige plek met fetch() naar Anthropic
js/sheets.js                  Google Sheets sync met status/laatste-sync/retry
js/ui.js                      toasts, maakButton/maakBadge/maakPrijskaart/... bouwstenen,
                               alle render-functies (overzicht, gewonnen, dashboard)
js/analyse.js                 fotoverwerking (compressie + ObjectURL-previews),
                               het analyseformulier, resultaatscherm
js/exportImport.js            JSON/CSV/Excel-export, JSON-import met validatie
js/app.js                     bootstrap: koppelt event listeners, start alles op
manifest.json + sw.js + icon.svg   PWA: installeerbaar, offline app-shell cache
```

Alle modules hangen aan één `window.App` object (`App.state`, `App.ui`, `App.api`, ...)
in plaats van losse globale functies/variabelen — dat voorkomt naamsbotsingen en maakt
in één oogopslag duidelijk welke module welke verantwoordelijkheid heeft.

## Wat er inhoudelijk is verbeterd
- **Geen `innerHTML +=` meer** voor dynamische/AI-afkomstige data — alles bouwt met
  `createElement`/`textContent`, wat XSS via een kwaadaardige of rare AI-respons voorkomt.
- **Foutafhandeling**: elke API-aanroep heeft een timeout (30s) en probeert bij een
  netwerkfout automatisch nog 2x opnieuw (niet bij een echte API-fout, zoals een
  ongeldige key — dat lost een retry toch niet op). Alle async-code gebruikt
  `async/await` met `try/catch` i.p.v. lange `.then()`-ketens.
- **API-respons wordt gevalideerd** (`validatePrijzenResponse`) voordat de app 'm
  gebruikt — ontbrekende/foute velden geven een duidelijke melding i.p.v. een crash.
- **Foto's**: worden nu client-side gecomprimeerd (max ~1600px, JPEG-kwaliteit 0.82),
  previews gebruiken `ObjectURL` in plaats van de volle base64-string in de DOM, en er
  zit een limiet op aantal (5) en bestandsgrootte (8MB). **Bonus-fix:** in de vorige
  versie werden geüploade foto's wel opgeslagen maar nooit daadwerkelijk meegestuurd
  naar Claude — dat is nu gerepareerd, de AI ziet je foto's echt bij de analyse.
- **Validatie van invoer**: bod moet een geldig, niet-negatief en realistisch bedrag
  zijn; URL wordt gecontroleerd; veilinghuis-percentages moeten tussen 0-100 liggen.
- **Centrale meldingen**: een toast onderin i.p.v. losse `alert()`-popups (behalve voor
  bevestigingen zoals "definitief verwijderen?", waar een blokkerende `confirm()` juist
  gepast is).
- **Dashboard uitgebreid**: totale winst, gemiddelde ROI, gemiddelde marge, totaal
  geïnvesteerd, beste/slechtste koop — naast de bestaande tellingen.
- **Zoeken en sorteren** in het overzicht (op titel/veilinghuis, en op datum/marge/ROI).
- **Export**: JSON (volledige back-up, opnieuw te importeren), CSV, en een echte Excel
  (.xlsx) via SheetJS. **Import**: JSON-back-up met controle op structuur/versie.
- **Sheets-sync**: toont status ("Synchroniseren...", laatste sync-tijdstip) en probeert
  bij een netwerkfout één keer automatisch opnieuw.
- **Veilinghuizen** ondersteunen nu ook optionele `land`/`valuta`-velden voor
  toekomstige niet-Nederlandse veilingen, zonder dat de structuur hoeft te veranderen.
- **PWA**: manifest, service worker (cachet de app-shell voor offline gebruik),
  installatieknop die verschijnt zodra de browser dat toestaat.
- Consequent `const`/`let`, geen `var` meer; JSDoc op de minder voor-de-hand-liggende
  functies; geen dode code of duplicatie tussen de render-functies (kavelrij en
  gewonnen-rij delen nu bijvoorbeeld dezelfde `maakKavelRij`-functie).

## Bewust (nog) niet volledig opgelost
- **API-key beveiliging**: de key staat nog steeds in `localStorage` van de browser,
  omdat deze app geen eigen server heeft. Dat kan niet "vanzelf" veiliger zonder een
  backend te bouwen — zie de toelichting in de Handleiding-tab in de app zelf, en de
  comment bovenin `js/api.js`. Als je dit voor meerdere mensen gaat gebruiken of
  publiek host, is een kleine backend (die de key server-side bewaart en de aanroep
  naar Claude doorzet) de aangewezen volgende stap.
- Sommige veilinghuizen hanteren een **staffel** (ander percentage boven een
  drempelbedrag). Dat is te modelleren met twee aparte veilinghuis-entries; een
  volwaardige staffel-editor in de UI is er nog niet.
