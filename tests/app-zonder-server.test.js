// Eind-tot-eind test met een nagebootste Claude API (geen echte API-sleutel nodig)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const APP = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
let fouten = 0;
function check(naam, ok, extra) { console.log((ok ? 'OK   ' : 'FOUT ') + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!ok) fouten++; }

const STAP1_JSON = { gevonden: true, titel: 'Apple iPhone 13 128GB blauw', veilinghuis: 'Testveiling', kavelnummer: '4711',
  product: { merk: 'Apple', model: 'iPhone 13', variant: '128GB', zoekterm: 'iPhone 13 128GB' }, staat: 'gebruikt', staat_toelichting: 'lichte krassen',
  aantal_stuks: 1, huidig_bod: '€ 300', aantal_biedingen: 7, sluit: 'do 30 okt 20:00', locatie: 'Utrecht',
  kosten: { opgeld_pct: 18, vaste_kosten: 2.5, btw_pct: 21, btw_regeling: 'volledig', bron: 'Opgeld 18% + €2,50 kavelkosten excl. btw' }, opmerkingen: ['Ophalen in Utrecht'] };
const STAP2_JSON = { productnaam: 'Apple iPhone 13 128GB', categorie: 'Telefoons', nieuwprijs: 899, nieuwprijs_bron: 'Coolblue', nieuwprijs_url: 'https://www.coolblue.nl/product/123/iphone-13.html',
  tweedehands: [
    { platform: 'Marktplaats', titel: 'iPhone 13 128GB blauw', prijs: 575, soort: 'vraagprijs', staat: 'gebruikt', url: 'https://www.marktplaats.nl/v/telecommunicatie/mobiele-telefoons-apple-iphone/m2000000001-iphone-13' },
    { platform: 'eBay', titel: 'iPhone 13 128GB', prijs: 560, soort: 'verkocht', staat: 'gebruikt', url: 'https://www.ebay.nl/itm/1234567890' },
    { platform: 'Marktplaats', titel: 'iPhone 13 verzonnen', prijs: 640, soort: 'vraagprijs', staat: 'gebruikt', url: 'https://www.marktplaats.nl/v/verzonnen/m999-nep' } ],
  marktplaats: { laag: 500, gemiddeld: 600, hoog: 700, vertrouwen: 'middel', aantal_vergelijkbaar: 3, tip: 'Foto van batterijstatus', verkooptijd: '1-2 weken', zoekwoorden: ['iphone 13'] },
  ebay: { laag: 520, gemiddeld: 560, hoog: 610, vertrouwen: 'middel', tip: '', verkooptijd: '', keywords: [] }, partij: null,
  toelichting: 'Op basis van 2 vraagprijzen en 1 verkocht item.', aandachtspunten: ['Controleer iCloud-slot'] };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const jsFouten = [];
  page.on('pageerror', e => jsFouten.push(e.message));
  page.on('console', m => { if (m.type() === 'error') jsFouten.push('console: ' + m.text()); });
  const verzoeken = [];
  let toolsUit = false;
  await page.route('https://api.anthropic.com/**', async route => {
    const body = JSON.parse(route.request().postData());
    verzoeken.push(body);
    if (toolsUit && body.tools) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'web_search tool is not enabled for this organization' } }) });
    let content, stop = 'end_turn', usage = { input_tokens: 1000, output_tokens: 100 };
    if (body.system.indexOf('Je leest veilingkavels') === 0) {
      content = [
        { type: 'server_tool_use', id: 'srv_1', name: 'web_fetch', input: { url: 'https://www.testveiling.nl/kavel/4711' } },
        { type: 'web_fetch_tool_result', tool_use_id: 'srv_1', content: { type: 'web_fetch_result', url: 'https://www.testveiling.nl/kavel/4711', retrieved_at: '2026-10-28T17:00:00Z',
          content: { type: 'document', title: 'Kavel 4711', source: { type: 'text', media_type: 'text/plain', data: 'iPhone 13 ... Opgeld 18% ...' } } } },
        { type: 'text', text: JSON.stringify(STAP1_JSON) } ];
      usage = { input_tokens: 20000, output_tokens: 500, server_tool_use: { web_search_requests: 0, web_fetch_requests: 1 } };
    } else if (body.system.indexOf('marktprijsonderzoeker') !== -1) {
      if (body.messages.length === 1) {
        stop = 'pause_turn';
        usage = { input_tokens: 30000, output_tokens: 200, server_tool_use: { web_search_requests: 1 } };
        content = [
          { type: 'server_tool_use', id: 'srv_2', name: 'web_search', input: { query: 'iPhone 13 128GB marktplaats' } },
          { type: 'web_search_tool_result', tool_use_id: 'srv_2', content: [
            { type: 'web_search_result', url: 'https://www.ebay.nl/itm/1234567890', title: 'iPhone 13 eBay', encrypted_content: 'x', page_age: null },
            { type: 'web_search_result', url: 'https://www.coolblue.nl/product/123/iphone-13.html', title: 'Coolblue iPhone 13', encrypted_content: 'y', page_age: null } ] } ];
      } else {
        content = [
          { type: 'server_tool_use', id: 'srv_3', name: 'web_fetch', input: { url: 'https://www.marktplaats.nl/q/iPhone+13+128GB/' } },
          { type: 'web_fetch_tool_result', tool_use_id: 'srv_3', content: { type: 'web_fetch_result', url: 'https://www.marktplaats.nl/q/iPhone+13+128GB/',
            content: { type: 'document', title: 'Marktplaats', source: { type: 'text', media_type: 'text/plain', data: 'iPhone 13 128GB blauw € 575 /v/telecommunicatie/mobiele-telefoons-apple-iphone/m2000000001-iphone-13' } } } },
          { type: 'text', text: '```json\n' + JSON.stringify(STAP2_JSON) + '\n```' } ];
        usage = { input_tokens: 120000, output_tokens: 1000, server_tool_use: { web_search_requests: 0, web_fetch_requests: 1 } };
      }
    } else {
      content = [{ type: 'text', text: JSON.stringify(Object.assign({}, STAP2_JSON, { tweedehands: [], marktplaats: Object.assign({}, STAP2_JSON.marktplaats, { vertrouwen: 'hoog' }) })) }];
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', content, stop_reason: stop, usage }) });
  });

  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hnvi_apikey', 'sk-ant-test'); });
  await page.reload();

  // ── 1. Rekenfuncties ──
  const r = await page.evaluate(() => {
    const t1 = { opgeld: 0.19, btw: 0.21, vast: 0, regeling: 'volledig' };
    const k1 = berekenKosten(1000, t1);
    const k2 = berekenKosten(1000, { opgeld: 0.18, btw: 0.21, vast: 0, regeling: 'opgeld' });
    const k3 = berekenKosten(1000, { opgeld: 0.20, btw: 0.21, vast: 5, regeling: 'geen' });
    const t4 = { opgeld: 0.18, btw: 0.21, vast: 2.5, regeling: 'volledig' };
    const k4 = berekenKosten(300, t4);
    // Omkering: kosten van bodVoorTotaal(T) moeten exact T zijn, voor alle regelingen
    const fouten = [];
    ['volledig', 'opgeld', 'geen'].forEach(reg => [0, 3.5].forEach(vast => [100, 777.77, 5000].forEach(T => {
      const t = { opgeld: 0.17, btw: 0.21, vast, regeling: reg };
      const bod = bodVoorTotaal(T, t);
      if (Math.abs(berekenKosten(bod, t).totaal - T) > 1e-9) fouten.push([reg, vast, T]);
    })));
    return { k1, k2, k3, k4, omkeerFouten: fouten, maxHnvi: Math.floor(bodVoorTotaal(800, t1)), negatief: bodVoorTotaal(1, t4),
      leesEuro: [leesEuro('2,50'), leesEuro(''), leesEuro('1.250'), leesEuro('abc')], num: [num('€ 1.234,56'), num('250,-'), num(12), num('x')],
      naam: [naamUitUrl('https://www.hnvi.nl/veiling-kavel/apple-macbook-pro-14/123456'), naamUitUrl('https://www.troostwijkauctions.com/nl/l/heftruck-toyota-8fbe15-A1-23456-789')],
      det: [detecteerVeiling('https://www.hnvi.nl/x').naam, detecteerVeiling('https://www.catawiki.com/nl/l/1').naam, detecteerVeiling('https://nergens.nl/').naam,
            detecteerVeiling('https://www.catawiki.com/nl/l/1').opgeld] };
  });
  check('Btw-kavel: €1000 + 19% opgeld + 21% btw = €1439,90', Math.abs(r.k1.totaal - 1439.9) < 1e-9, r.k1.totaal);
  check('Margeregeling: €1000 + 18% opgeld + btw over opgeld = €1217,80', Math.abs(r.k2.totaal - 1217.8) < 1e-9, r.k2.totaal);
  check('Geen btw: €1000 + 20% + €5 = €1205', Math.abs(r.k3.totaal - 1205) < 1e-9, r.k3.totaal);
  check('Kavel testcase: €300 + 18% + €2,50, 21% btw = €431,365', Math.abs(r.k4.totaal - 431.365) < 1e-9, r.k4.totaal);
  check('Max bod omkering exact voor alle regelingen', r.omkeerFouten.length === 0, r.omkeerFouten);
  check('Voorbeeld handleiding: max bod HNVI bij €800 = €555', r.maxHnvi === 555, r.maxHnvi);
  check('Max bod nooit negatief', r.negatief === 0, r.negatief);
  check('Bedragen lezen', JSON.stringify(r.leesEuro.slice(0, 3)) === '[2.5,0,1250]' && Number.isNaN(r.leesEuro[3]), r.leesEuro);
  check('Getallen uit AI-tekst', JSON.stringify(r.num) === '[1234.56,250,12,null]', r.num);
  check('Productnaam uit link', r.naam[0] === 'Apple macbook pro 14' && /heftruck toyota/i.test(r.naam[1]), r.naam);
  check('Veilinghuis herkennen', r.det[0] === 'HNVI' && r.det[1] === 'Catawiki' && r.det[2] === 'Onbekend' && r.det[3] === 0.18, r.det);

  // ── 2. Volledige analyse via het formulier ──
  await page.evaluate(() => switchTab('analyse'));
  await page.fill('#kavel-url', 'www.testveiling.nl/kavel/4711');
  await page.click('#analyse-btn');
  await page.waitForSelector('#analyse-result .hero', { timeout: 10000 });
  const k = await page.evaluate(() => kavels[0]);
  check('Link aangevuld met https://', k.url === 'https://www.testveiling.nl/kavel/4711', k.url);
  check('Drie API-verzoeken (pagina + prijzen met pause_turn)', verzoeken.length === 3, verzoeken.length);
  const vervolg = verzoeken[2];
  check('pause_turn: assistent-inhoud ongewijzigd teruggestuurd', vervolg.messages.length === 2 && vervolg.messages[1].role === 'assistant' && vervolg.messages[1].content.length === 2 && vervolg.messages[1].content[1].content[0].encrypted_content === 'x');
  check('Standaard overal Claude Haiku 5.5 (zuinig)', verzoeken.every(b => b.model === 'claude-haiku-5-5'), verzoeken.map(b => b.model));
  check('Limieten zonder server: pagina 2×10k + 1 zoek, prijzen 3×6k + 1 zoek', JSON.stringify(verzoeken[0].tools.map(t => [t.max_uses, t.max_content_tokens || 0])) === '[[2,10000],[1,0]]' && JSON.stringify(verzoeken[1].tools.map(t => [t.max_uses, t.max_content_tokens || 0])) === '[[3,6000],[1,0]]');
  check('Kosten: $0,00225 + $0,0131 + $0,0625 (>100k = hoog tarief) = $0,07785', Math.abs(k.api_usd - 0.07785) < 1e-12, k.api_usd);
  check('Tools: web_fetch_20250910 + web_search_20250305', verzoeken[0].tools.map(t => t.type).join() === 'web_fetch_20250910,web_search_20250305');
  check('Kavel-URL staat in het gebruikersbericht (nodig voor web_fetch)', verzoeken[0].messages[0].content.indexOf('https://www.testveiling.nl/kavel/4711') !== -1);
  check('Zoek-URL\'s staan in het gebruikersbericht', verzoeken[1].messages[0].content.indexOf('https://www.marktplaats.nl/q/iPhone+13+128GB/') !== -1);
  check('Bod van de pagina gelezen (€300)', k.huidig_bod === 300 && k.bod_van_pagina === true, k.huidig_bod);
  check('Kosten van de pagina: 18% + €2,50, volledig', k.tarief_bron === 'pagina' && k.veiling_tarief.opgeld === 0.18 && k.veiling_tarief.vast === 2.5 && k.veiling_tarief.regeling === 'volledig', k.veiling_tarief);
  check('Totale kosten €431,365', Math.abs(k.kosten.totaal - 431.365) < 1e-9, k.kosten.totaal);
  check('Marge €168,635 → Aanrader', Math.abs(k.kosten.marge - 168.635) < 1e-9 && k.advies === 'kopen', [k.kosten.marge, k.advies]);
  check('Max bod €334, quitte €418', k.maxBod === 334 && k.breakEvenBod === 418, [k.maxBod, k.breakEvenBod]);
  const t334 = await page.evaluate(() => { const t = tariefVan(kavels[0]); return [berekenKosten(334, t).totaal, berekenKosten(335, t).totaal]; });
  check('Bij max bod precies ≥20% marge, bij +€1 niet meer', (600 - t334[0]) / 600 >= 0.2 && (600 - t334[1]) / 600 < 0.2, t334);
  const th = k.prijzen.tweedehands;
  check('Advertentie uit opgehaalde pagina = bevestigd', th[0].bevestigd === true);
  check('Advertentie uit zoekresultaten = bevestigd', th[1].bevestigd === true);
  check('Verzonnen link = niet bevestigd', th[2].bevestigd === false);
  check('Nieuwprijs-link bevestigd', k.prijzen.nieuwprijs_bevestigd === true);
  check('Mediaan advertenties €575', k.prijzen.mediaan_advertenties === 575, k.prijzen.mediaan_advertenties);
  check('Veilinghuisnaam van de pagina', k.veiling === 'Testveiling', k.veiling);
  const html = await page.innerHTML('#analyse-result');
  check('Resultaat toont "niet bevestigd"-label', html.indexOf('niet bevestigd') !== -1);
  check('Resultaat toont vaste kosten en bron', html.indexOf('Vaste kosten per kavel') !== -1 && html.indexOf('van de kavelpagina') !== -1);
  await page.screenshot({ path: OUT + '/resultaat.png', fullPage: true });

  // ── 2b. Zelfde product opnieuw: prijzen hergebruikt, alleen de kavelpagina wordt gelezen ──
  const voor = verzoeken.length;
  await page.evaluate(() => { nieuwKavel(); });
  await page.fill('#kavel-url', 'https://www.testveiling.nl/kavel/4711');
  await page.click('#analyse-btn');
  await page.waitForSelector('#analyse-result .hero', { timeout: 10000 });
  const kc = await page.evaluate(() => kavels[0]);
  check('Hergebruik: maar 1 API-verzoek (kavelpagina)', verzoeken.length - voor === 1, verzoeken.length - voor);
  check('Hergebruik: prijzen gemarkeerd en alleen paginakosten gerekend', kc.prijzen.hergebruikt === true && Math.abs(kc.api_usd - 0.00225) < 1e-12 && kc.mp_gemiddeld === 600, kc.api_usd);
  check('Hergebruik: geen dubbele kavel', await page.evaluate(() => kavels.length) === 1);

  // ── 2c. Bod wijzigen: geen API, wel herberekening ──
  const voor2 = verzoeken.length;
  await page.evaluate(() => wijzigBod(0));
  await page.fill('#wb-bod', '400');
  await page.click('#wb-eigen');
  await page.click('#modal-actions .btn-primary');
  const kb = await page.evaluate(() => kavels[0]);
  check('Bod wijzigen: €400 → (472 + 2,50) × 1,21 = €574,145, geen API-aanroep', Math.abs(kb.kosten.totaal - 574.145) < 1e-9 && kb.eigen_bod === true && verzoeken.length === voor2, kb.kosten.totaal);
  check('Bod wijzigen: marge 4,3% → Twijfel', kb.advies === 'twijfel', kb.advies);
  await page.evaluate(() => wijzigBod(0)); await page.fill('#wb-bod', '300'); await page.click('#wb-ander'); await page.click('#modal-actions .btn-primary');
  check('Totaal API-kosten bijgehouden', Math.abs(await page.evaluate(() => apiTotaal().usd) - (0.07785 + 0.00225)) < 1e-12);

  // ── 3. Instellingen: marge 30% + €10 verkoopkosten → herberekening ──
  await page.evaluate(() => { bewaarInst({ doelmarge: 0.30, verkoopkosten: 10, model: 'claude-sonnet-5-5' }); herberekenKosten(kavels[0]); });
  const k2 = await page.evaluate(() => kavels[0]);
  check('Verkoopkosten tellen mee in marge', Math.abs(k2.kosten.marge - 158.635) < 1e-9, k2.kosten.marge);
  check('Marge 26% < 30% → Twijfel', k2.advies === 'twijfel', k2.advies);
  check('Max bod bij 30% en €10: floor((420-10-3,025)/1,4278) = 285', k2.maxBod === 285, k2.maxBod);

  // ── 4. Kosten van één kavel aanpassen via de dialoog ──
  await page.evaluate(() => { toonAnalyseResultaat(kavels[0]); pasTariefAan(0); });
  await page.fill('#pt-opgeld', '10'); await page.selectOption('#pt-reg', 'opgeld'); await page.fill('#pt-vast', ''); await page.fill('#pt-vkst', '0');
  await page.click('#modal-actions .btn-primary');
  const k3 = await page.evaluate(() => kavels[0]);
  check('Dialoog: 10% opgeld, margeregeling → €300 + €30 + €6,30 = €336,30', Math.abs(k3.kosten.totaal - 336.3) < 1e-9 && k3.tarief_bron === 'handmatig', k3.kosten.totaal);

  // ── 5. Terugval als zoeken niet beschikbaar is ──
  toolsUit = true;
  await page.evaluate(() => { nieuwKavel(); });
  await page.fill('#kavel-url', 'https://www.hnvi.nl/veiling-kavel/apple-macbook-pro-14/99');
  await page.fill('#huidig-bod', '700');
  await page.click('#analyse-btn');
  await page.waitForSelector('#analyse-result .hero', { timeout: 10000 });
  const k4 = await page.evaluate(() => kavels[0]);
  check('Terugval: schatting zonder internet, met waarschuwing', k4.live === false && k4.waarschuwingen.some(w => /niet beschikbaar/.test(w)), k4.waarschuwingen);
  check('Terugval: vertrouwen max "middel"', k4.prijzen.marktplaats.vertrouwen === 'middel');
  check('Terugval: HNVI-tarief 19% gebruikt', k4.veiling_tarief.opgeld === 0.19 && k4.tarief_bron === 'huis', k4.veiling_tarief);

  // ── 6. Oude kavel (vorige versie) blijft werken ──
  const oud = await page.evaluate(() => {
    const k = { id: 1, url: 'https://www.hnvi.nl/veiling-kavel/oud/1', titel: 'Oud', veiling: 'HNVI', veiling_tarief: { opgeld: 0.19, btw: 0.21 }, huidig_bod: 1000,
      kosten: { bod: 1000, vk: 190, btw: 249.9, totaal: 1439.9, marge: 60.1, site: 'HNVI', opgeld_pct: 19 }, mp_gemiddeld: 1500, mp_laag: 1300, mp_hoog: 1700,
      prijzen: { marktplaats: { laag: 1300, gemiddeld: 1500, hoog: 1700, vertrouwen: 'middel' } }, advies: 'twijfel', status: 'klaar', toegevoegd: 1 };
    kavels.push(k); herberekenKosten(k); toonAnalyseResultaat(k); renderOverzicht(); return k;
  });
  check('Oude kavel herberekend zonder fouten (€1439,90)', Math.abs(oud.kosten.totaal - 1439.9) < 1e-9, oud.kosten.totaal);

  // ── 7. Instellingenvenster en mobiel ──
  await page.evaluate(() => { closeModal(); beheerVeilingen(); });
  await page.fill('#bh-doel', '25');
  await page.click('#modal-actions .btn-primary');
  check('Instellingen opslaan via venster (25%)', await page.evaluate(() => getInst().doelmarge) === 0.25);
  await page.evaluate(() => closeModal());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { toonAnalyseResultaat(kavels.find(k => k.url.indexOf('testveiling') !== -1)); });
  const breed = await page.evaluate(() => document.documentElement.scrollWidth);
  check('Mobiel: geen horizontaal scrollen', breed <= 390, breed);
  await page.screenshot({ path: OUT + '/mobiel.png', fullPage: true });
  await page.evaluate(() => switchTab('overzicht'));
  await page.screenshot({ path: OUT + '/overzicht.png' });

  check('Geen JavaScript-fouten', jsFouten.filter(f => !/ERR_FAILED|status of 400/.test(f)).length === 0, jsFouten);
  await browser.close();
  console.log(fouten ? '\n' + fouten + ' FOUT(EN)' : '\nALLES OK');
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
