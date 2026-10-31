// Klantreis in servermodus: app (8080) → echte servercode (8787) met SQLite en nagebootste AI
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const OUT = process.argv[2];
let fouten = 0;
function check(naam, ok, extra) { console.log((ok ? 'OK   ' : 'FOUT ') + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!ok) fouten++; }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const jsFouten = [];
  page.on('pageerror', e => jsFouten.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: "window.VA_CONFIG = { api: 'http://localhost:8787', prijzen: { regelmatig: '€ 12,99 per maand', handelaar: '€ 29,99 per maand', b25: '€ 4,99', b60: '€ 9,99' } };" }));
  await page.goto('http://localhost:8080/app.html');
  await page.waitForTimeout(400);

  check('Servermodus: geen vraag om API-sleutel', !(await page.isVisible('#apikey-bar')));
  check('Welkomstscherm toont Account maken', await page.isVisible('#welkom-knoppen >> text=Account maken'));
  await page.screenshot({ path: OUT + '/srv-welkom.png' });

  // Account maken
  await page.click('#welkom-knoppen >> text=Account maken');
  await page.fill('#li-email', 'klant@voorbeeld.nl');
  await page.fill('#li-ww', 'kort');
  await page.click('#modal-actions .btn-primary');
  await page.waitForTimeout(300);
  check('Te kort wachtwoord: foutmelding van de server', /minstens 8 tekens/.test(await page.textContent('#li-err')));
  await page.fill('#li-ww', 'geheim123');
  await page.click('#modal-actions .btn-primary');
  await page.waitForFunction(() => window.account && window.account.email);
  check('Account aangemaakt en ingelogd', await page.evaluate(() => account.plan === 'gratis' && account.limiet === 0 && account.tegoed === 3));

  // Analyseren via de server
  await page.evaluate(() => nieuwKavel());
  await page.fill('#kavel-url', 'https://www.testveiling.nl/kavel/88');
  await page.click('#analyse-btn');
  await page.waitForSelector('#analyse-result .hero', { timeout: 15000 });
  const k = await page.evaluate(() => kavels[0]);
  check('Analyse via server: bod €40 en 17% van de pagina', k.huidig_bod === 40 && k.veiling_tarief.opgeld === 0.17 && k.tarief_bron === 'pagina', [k.huidig_bod, k.veiling_tarief]);
  check('Kosten: 40 × 1,17 × 1,21 = €56,628', Math.abs(k.kosten.totaal - 56.628) < 1e-9, k.kosten.totaal);
  check('Max bod bij €80 en 20%: floor(64 / 1,4157) = €45', k.maxBod === 45, k.maxBod);
  check('Klant ziet geen API-kosten', k.api_usd === null);
  check('Verbruik bijgewerkt: 1 van 3', await page.evaluate(() => account.gebruikt === 1));
  check('Agenda- en meldingenknop zichtbaar (sluitingstijd bekend)', await page.isVisible('button:has-text("In agenda")') && await page.isVisible('button:has-text("Meldingen")'));
  await page.screenshot({ path: OUT + '/srv-resultaat.png', fullPage: true });

  // Synchronisatie: nieuw apparaat ziet dezelfde kavels
  await page.waitForTimeout(1600);
  const token = await page.evaluate(() => localStorage.getItem('va_sessie'));
  const page2 = await (await browser.newContext()).newPage();
  await page2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page2.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: "window.VA_CONFIG = { api: 'http://localhost:8787' };" }));
  await page2.addInitScript(t => localStorage.setItem('va_sessie', t), token);
  await page2.goto('http://localhost:8080/app.html');
  await page2.waitForFunction(() => window.kavels && kavels.length === 1, null, { timeout: 5000 }).catch(() => {});
  check('Tweede apparaat: kavel gesynchroniseerd', await page2.evaluate(() => kavels.length === 1 && kavels[0].titel === 'Bosch GSB 18V-21'));

  // Limiet bereiken met meerdere links tegelijk
  await page.evaluate(() => openBatch());
  await page.fill('#batch-links', 'https://www.testveiling.nl/kavel/89\nhttps://www.testveiling.nl/kavel/90\nhttps://www.testveiling.nl/kavel/91');
  await page.click('#modal-actions .btn-primary');
  await page.waitForFunction(() => !batchBezig, null, { timeout: 20000 });
  const tekst = await page.textContent('#batch-err');
  check('Batch: 2 gelukt, daarna stopt hij bij de limiet met uitleg', await page.evaluate(() => kavels.length === 3) && /gratis analyses zijn op/.test(tekst), tekst);
  await page.screenshot({ path: OUT + '/srv-batch.png' });
  await page.click('#modal-actions .btn-primary');
  check('Knop Abonnement kiezen opent abonnementen', await page.isVisible('text=Kies Regelmatig'));
  await page.screenshot({ path: OUT + '/srv-account.png' });
  await page.evaluate(() => closeModal());

  // Gewonnen en verkocht
  await page.evaluate(() => { kavels[0].status = 'gewonnen'; kavels[0].gewonnen_op = Date.now(); switchTab('gewonnen'); legVerkoopVast(0); });
  await page.waitForTimeout(150); // venster zet eerst de cursor in het eerste veld
  await page.fill('#vv-voor', '85');
  await page.fill('#vv-kosten', '6,95');
  await page.click('#modal-actions .btn-primary');
  const w = await page.evaluate(() => winstVan(kavels[0]));
  check('Winst: 85 − 56,63 (betaald, op centen) − 6,95 = €21,42', Math.abs(w - 21.42) < 1e-9, w);
  check('Winstoverzicht zichtbaar', /Rendement/.test(await page.textContent('#winst-strip')));
  const breed = await page.evaluate(() => document.documentElement.scrollWidth);
  check('Mobiel: geen horizontaal scrollen', breed <= 390, breed);
  await page.screenshot({ path: OUT + '/srv-gewonnen.png', fullPage: true });

  // CSV-export
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exporteerCsv(true))]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  check('CSV: puntkomma, komma-decimalen, winst 21,42', csv.charCodeAt(0) === 0xfeff && /;Winst\r\n/.test(csv) && /;21,42$/.test(csv.trim()), csv.split('\r\n')[1]);

  // Agenda
  await page.evaluate(() => switchTab('overzicht'));
  const idx = await page.evaluate(() => kavels.findIndex(k => k.pagina && k.pagina.sluit_iso));
  const [ics] = await Promise.all([page.waitForEvent('download'), page.evaluate(i => zetInAgenda(i), idx)]);
  const icsTxt = require('fs').readFileSync(await ics.path(), 'utf8');
  check('Agenda-bestand: afspraak 15 min voor sluiting (18:00 UTC)', /DTSTART:20991031T174500Z/.test(icsTxt) && /DTEND:20991031T180000Z/.test(icsTxt), icsTxt.match(/DTSTART:\S+/)[0]);
  // Agenda koppelen: persoonlijke link waar de agenda-app de sluittijden ophaalt
  await page.evaluate(() => agendaKoppelen());
  await page.waitForSelector('#ag-url');
  const agUrl = await page.inputValue('#ag-url');
  const agTxt = await page.evaluate(async u => (await fetch(u)).text(), agUrl);
  check('Agenda koppelen: link geeft een agenda met de sluittijd van het kavel', /\/api\/agenda\/[0-9a-f]{48}\.ics$/.test(agUrl) && agTxt.startsWith('BEGIN:VCALENDAR') && /DTEND:20991031T180000Z/.test(agTxt), agUrl);
  check('Agenda koppelen: knoppen voor iPhone (webcal), Google en Outlook', await page.locator('.ag-knoppen a').count() === 3 && (await page.getAttribute('.ag-knoppen a >> nth=0', 'href')).startsWith('webcal://'));
  await page.evaluate(() => closeModal());

  // Gedeelde link (telefoon of bladwijzer)
  await page.goto('http://localhost:8080/app.html?text=' + encodeURIComponent('Kijk eens https://www.testveiling.nl/kavel/123 mooi'));
  await page.waitForTimeout(500);
  check('Gedeelde link ingevuld in het formulier', await page.inputValue('#kavel-url') === 'https://www.testveiling.nl/kavel/123');

  check('Geen JavaScript-fouten', jsFouten.length === 0, jsFouten);
  await browser.close();
  console.log(fouten ? '\n' + fouten + ' FOUT(EN)' : '\nALLES OK');
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
