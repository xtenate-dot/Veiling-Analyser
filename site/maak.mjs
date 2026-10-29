// Bouwt de website (Nederlands en Engels) naar site/www. Draai: node site/maak.mjs
// De Worker serveert site/www vanaf de hoofdmap van veilinganalyser.nl; de app staat op /app.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const UIT = join(HIER, 'www');
const BEDRIJF = { naam: 'Xtenate', kvk: '85656364', btw: 'NL004127521B86', adres: 'Besoyensestraat 42, 5141 AK Waalwijk', email: 'info@veilinganalyser.nl' };
const GECONTROLEERD = '29 oktober 2026';

const LOGO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E2B051" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5 12 4l8 5.5v9.5H4z"></path><circle cx="12" cy="13" r="2.2"></circle></svg>';

function kop(taal, actief) {
  const nl = taal === 'nl';
  const m = nl
    ? [['/#hoe', 'Hoe het werkt', 'hoe'], ['/prijzen', 'Prijzen', 'prijzen'], ['/veilinggids/', 'Veilinggids', 'gids'], ['/verhalen/', 'Verhalen', 'verhalen'], ['/over', 'Over ons', 'over']]
    : [['/en/#how', 'How it works', 'hoe'], ['/en/pricing', 'Pricing', 'prijzen'], ['/veilinggids/', 'Auction guide (Dutch)', 'gids']];
  return `<a class="skip" href="#inhoud">${nl ? 'Naar de inhoud' : 'Skip to content'}</a>
<header class="kop"><nav class="wrap" aria-label="${nl ? 'Hoofdmenu' : 'Main menu'}">
  <a class="merk" href="${nl ? '/' : '/en/'}"><span class="merk-teken">${LOGO}</span><span class="merk-naam">Veiling Analyser</span></a>
  <div class="menu">${m.map(([h, t, k]) => `<a href="${h}"${k === actief ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</div>
  <div class="kop-acties"><a class="taal" href="${nl ? '/en/' : '/'}" hreflang="${nl ? 'en' : 'nl'}" lang="${nl ? 'en' : 'nl'}">${nl ? 'EN' : 'NL'}</a><a class="knop knop-hoofd knop-klein" href="/app">${nl ? 'Start gratis' : 'Start free'}</a></div>
</nav></header>`;
}
function voet(taal) {
  const nl = taal === 'nl';
  return `<footer class="voet"><div class="wrap raster">
  <div><b>Veiling Analyser</b>${nl ? 'Veiling Analyser is een handelsnaam van' : 'Veiling Analyser is a trade name of'} ${BEDRIJF.naam}.<br>${BEDRIJF.adres}<br>KvK ${BEDRIJF.kvk} · ${nl ? 'btw' : 'VAT'} ${BEDRIJF.btw}<br><a href="mailto:${BEDRIJF.email}">${BEDRIJF.email}</a></div>
  <div><b>${nl ? 'Website' : 'Website'}</b><ul><li><a href="${nl ? '/prijzen' : '/en/pricing'}">${nl ? 'Prijzen' : 'Pricing'}</a></li><li><a href="/veilinggids/">${nl ? 'Veilinggids' : 'Auction guide (Dutch)'}</a></li>${nl ? '<li><a href="/verhalen/">Verhalen</a></li><li><a href="/hoe-we-rekenen">Zo rekent de app</a></li><li><a href="/over">Over ons en contact</a></li>' : ''}</ul></div>
  <div><b>${nl ? 'Juridisch' : 'Legal'}</b><ul><li><a href="/privacy">${nl ? 'Privacybeleid' : 'Privacy policy (Dutch)'}</a></li><li><a href="/voorwaarden">${nl ? 'Voorwaarden' : 'Terms (Dutch)'}</a></li><li>${nl ? 'Geen samenwerking met de genoemde veilinghuizen.' : 'Not affiliated with the auction houses mentioned.'}</li></ul></div>
  <div><b>${nl ? 'De app' : 'The app'}</b><ul><li><a href="/app">${nl ? 'Naar de app' : 'Open the app'}</a></li><li>© 2026 ${BEDRIJF.naam}</li></ul></div>
</div></footer>`;
}
function pagina({ taal = 'nl', titel, beschrijving, pad, actief, inhoud, script = '' }) {
  const alt = taal === 'nl' ? (pad === '/' ? '/en/' : pad === '/prijzen' ? '/en/pricing' : null) : (pad === '/en/' ? '/' : pad === '/en/pricing' ? '/prijzen' : null);
  return `<!DOCTYPE html>
<html lang="${taal}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titel}</title>
<meta name="description" content="${beschrijving}">
<link rel="canonical" href="https://veilinganalyser.nl${pad}">
${alt ? `<link rel="alternate" hreflang="${taal === 'nl' ? 'en' : 'nl'}" href="https://veilinganalyser.nl${alt}">\n` : ''}<meta property="og:title" content="${titel}">
<meta property="og:description" content="${beschrijving}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#3A1F4D">
<link rel="icon" href="/icons/icon48.png">
<link rel="apple-touch-icon" href="/icons/icon512.png">
<link rel="preload" href="/fonts/instrument-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site/site.css">
</head>
<body>
${kop(taal, actief)}
<main id="inhoud">
${inhoud}
</main>
${voet(taal)}
${script}
</body>
</html>
`;
}
const euro = n => '€' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Voorbeeldkaart (zelfde als in de app; alle bedragen kloppen bij 17% opgeld en 21% btw) ──
function voorbeeld(nl) {
  return `<div class="voorbeeld" role="img" aria-label="${nl ? 'Voorbeeld van een analyse: bied maximaal 45 euro' : 'Example analysis: bid at most 45 euros'}">
  <span class="pil">${nl ? 'Aanrader' : 'Recommended'}</span><span class="label">${nl ? 'Voorbeeld' : 'Example'}</span>
  <p class="titel">Bosch accuboormachine 18V</p>
  <p class="sub">${nl ? 'Huidig bod €40 · verwachte verkoop €80 · 17% opgeld' : 'Current bid €40 · expected resale €80 · 17% premium'}</p>
  <div class="regel"><span>${nl ? 'Marktplaats, gebruikt' : 'Marktplaats, used'}</span><b>€75 – €85</b></div>
  <div class="regel"><span>${nl ? 'eBay, verkocht' : 'eBay, sold'}</span><b>€78</b></div>
  <div class="regel"><span>${nl ? 'Nieuwprijs' : 'New price'}</span><b>€129</b></div>
  <div class="kaartje"><span>${nl ? 'Bied maximaal' : 'Bid at most'}</span><b>€45</b><span>${nl ? 'voor 20% marge · quitte bij €56' : 'for a 20% margin · break-even at €56'}</span></div>
</div>`;
}
const REVIEWS_JS = (nl) => `<script>
(function(){
  var box = document.getElementById('reviews'); if (!box) return;
  fetch('/api/reviews').then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
    if (!d || !d.aantal) return;
    function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    var h = '<p class="intro">' + ${nl ? "'Gemiddeld '" : "'Average '"} + String(d.gemiddelde).replace('.', ',') + ${nl ? "' van 5 sterren uit '" : "' out of 5 stars from '"} + d.aantal + (d.aantal === 1 ? ${nl ? "' review'" : "' review'"} : ${nl ? "' reviews'" : "' reviews'"}) + '.</p><div class="rij">';
    d.reviews.slice(0, 6).forEach(function(x){
      h += '<div class="review"><div class="sterren" aria-label="' + x.sterren + ${nl ? "' van 5 sterren'" : "' out of 5 stars'"} + '">' + '★★★★★'.slice(0, x.sterren) + '<span style="color:var(--line-2)">' + '★★★★★'.slice(x.sterren) + '</span></div><p style="margin:8px 0 0">' + esc(x.tekst) + '</p><p class="naam">' + esc(x.naam) + ' · ' + esc(x.datum) + '</p></div>';
    });
    h += '</div><p class="bron" style="margin-top:14px">' + esc(d.uitleg) + '</p>';
    document.getElementById('reviews-lijst').innerHTML = h;
    box.classList.add('zichtbaar');
  }).catch(function(){});
})();
</script>`;

// ── Homepagina NL ──
const HOME_NL = pagina({
  titel: 'Veiling Analyser – weet tot hoeveel je kunt bieden',
  beschrijving: 'Plak de link van een veilingkavel. Veiling Analyser zoekt echte prijzen op Marktplaats, 2dehands en eBay, rekent opgeld en btw door en zegt tot welk bod je goed zit.',
  pad: '/', actief: '',
  inhoud: `<section class="held"><div class="wrap rij">
  <div>
    <p class="boventitel">Voor veilingen in Nederland en België</p>
    <h1>Weet tot hoeveel je kunt bieden, vóór je biedt.</h1>
    <p class="intro">Plak de link van een veilingkavel. Veiling Analyser zoekt wat hetzelfde product vandaag echt kost op Marktplaats, 2dehands en eBay, rekent opgeld en btw voor je door en zegt tot welk bod je nog goed zit.</p>
    <div class="knoppen"><a class="knop knop-hoofd" href="/app">Analyseer je eerste kavel gratis</a><a class="knop knop-twee" href="#hoe">Zo werkt het</a></div>
    <p class="klein">10 analyses cadeau bij je account. Ze verlopen niet. Geen betaalgegevens nodig.</p>
  </div>
  <div>${voorbeeld(true)}</div>
</div></section>

<section class="sectie sectie-wit" id="hoe"><div class="wrap">
  <h2>Zo werkt het</h2>
  <div class="rij">
    <div class="kaart kaart-grijs"><span class="stap-nr">1</span><h3>Plak de link</h3><p>Van elke veilingsite. Op je telefoon deel je een kavel direct naar de app. Foto's toevoegen kan ook.</p></div>
    <div class="kaart kaart-grijs"><span class="stap-nr">2</span><h3>De app zoekt de prijzen</h3><p>Echte advertenties en verkochte items van vandaag, en de nieuwprijs. Met links, zodat je alles zelf kunt nakijken.</p></div>
    <div class="kaart kaart-grijs"><span class="stap-nr">3</span><h3>Bied tot het kaartje</h3><p>Het hoogste bod waarbij je na opgeld, btw en verkoopkosten nog je marge haalt.</p></div>
  </div>
</div></section>

<section class="sectie"><div class="wrap rij">
  <div>
    <h2>Het bod is niet wat je betaalt</h2>
    <p class="intro">Bovenop je bod komen opgeld en btw, en soms vaste kosten per kavel. Een bod van €40 wordt zo al snel bijna €57. Wie dat vergeet, koopt een kavel waar niets meer aan te verdienen valt.</p>
    <p>Veiling Analyser leest de kosten van de kavelpagina en rekent ze altijd mee. <a href="/verhalen/opgeld-berekenen">Zo reken je opgeld zelf uit.</a></p>
  </div>
  <div class="kaart"><div class="tabel-box"><table class="tabel">
    <caption>Rekenvoorbeeld bij 17% opgeld en 21% btw</caption>
    <tbody><tr><td>Je bod</td><td>€40,00</td></tr><tr><td>Opgeld 17%</td><td>€6,80</td></tr><tr><td>Btw 21% over bod en opgeld</td><td>€9,83</td></tr><tr class="totaal"><td>Wat je echt betaalt</td><td>€56,63</td></tr></tbody>
  </table></div></div>
</div></section>

<section class="sectie sectie-zacht"><div class="wrap">
  <h2>Voor wie bieden leuk vindt, en voor wie ervan leeft</h2>
  <div class="rij">
    <div class="kaart"><h3>Particulieren</h3><p>Je ziet iets moois op een veiling en wilt niet meer betalen dan in de winkel of op Marktplaats.</p><ul class="lijst"><li>Zie direct of het kavel goedkoper is dan nieuw of tweedehands</li><li>Geen verrassingen door opgeld en btw</li><li>Zet de sluitingstijd met één tik in je agenda</li></ul></div>
    <div class="kaart"><h3>Handelaren</h3><p>Je koopt op veilingen om door te verkopen en wilt per kavel weten wat er overblijft.</p><ul class="lijst"><li>Maximaal bod voor de marge die jij kiest</li><li>Verkoopkosten en margeregeling meegerekend</li><li>Meerdere links tegelijk, en je winst per verkocht kavel</li></ul></div>
  </div>
</div></section>

<section class="sectie"><div class="wrap">
  <h2>Eerlijke prijzen, geen gokwerk</h2>
  <div class="rij">
    <div><h3>Echte advertenties</h3><p>De prijzen komen uit advertenties en verkochte items van vandaag, met een link naar elke bron.</p></div>
    <div><h3>Zegt het als het niet zeker is</h3><p>Weinig aanbod of twijfel over het product? Dan staat dat erbij, in plaats van een mooi maar verzonnen getal.</p></div>
    <div><h3>Jij houdt de regie</h3><p>Pas prijzen, kosten en je marge zelf aan. Het maximale bod rekent direct mee.</p></div>
  </div>
  <p class="melding" style="margin-top:24px">De app bekijkt foto's om het product te herkennen, maar ziet niet elk detail. Controleer zelf of er geen schade of defecte onderdelen zijn, het liefst op de kijkdag.</p>
</div></section>

<section class="sectie sectie-wit reviews" id="reviews"><div class="wrap"><h2>Wat gebruikers zeggen</h2><div id="reviews-lijst"></div></div></section>

<section class="sectie"><div class="wrap smal">
  <h2>Veelgestelde vragen</h2>
  <details class="vraag"><summary>Werkt het met elke veilingsite?</summary><p>Met de meeste: de app leest de openbare kavelpagina. Voor bekende veilinghuizen staat in de <a href="/veilinggids/">veilinggids</a> wat je bovenop je bod betaalt. Links van Marktplaats en 2dehands zelf kun je niet laten analyseren: dat zijn geen veilingen.</p></details>
  <details class="vraag"><summary>Hoe kloppen de prijzen?</summary><p>Het zijn echte vraagprijzen en verkochte items, met links. De verwachte verkoopprijs is een berekening op basis daarvan, geen garantie. Vind je dat er iets niet klopt, dan meld je dat met één tik bij de analyse. <a href="/hoe-we-rekenen">Zo rekent de app precies.</a></p></details>
  <details class="vraag"><summary>Haalt een handelaar niet meer dan een particulier?</summary><p>Vaak wel. De app rekent met wat een particulier krijgt bij verkoop aan een particulier. Haal jij meer of minder, pas de verkoopprijs dan zelf aan. <a href="/hoe-we-rekenen">Lees hoe de app rekent.</a></p></details>
  <details class="vraag"><summary>Gaan mijn gratis analyses verloren?</summary><p>Nee. De 10 analyses bij je account en losse bundels blijven staan tot je ze gebruikt.</p></details>
  <details class="vraag"><summary>Kan ik opzeggen?</summary><p>Altijd, per maand. Je abonnement loopt door tot het einde van de betaalde maand.</p></details>
  <details class="vraag"><summary>Werken jullie samen met veilinghuizen?</summary><p>Nee. Veiling Analyser is onafhankelijk. We noemen veilinghuizen alleen om uit te leggen hoe hun kosten werken.</p></details>
  <details class="vraag"><summary>Wat gebeurt er met mijn gegevens?</summary><p>We vragen alleen je e-mailadres. Je kunt je gegevens altijd downloaden of je account verwijderen. Lees meer in het <a href="/privacy">privacybeleid</a>.</p></details>
</div></section>

<section class="sectie sectie-donker"><div class="wrap rij" style="align-items:center">
  <div><h2 style="margin-bottom:8px">Plak je eerste kavel</h2><p>10 analyses cadeau. Geen betaalgegevens nodig.</p></div>
  <div style="flex:0 1 auto"><a class="knop knop-messing" href="/app">Start gratis</a></div>
</div></section>`,
  script: REVIEWS_JS(true)
});

// ── Prijzen ──
const PAKKETTEN = [
  { id: 'af_en_toe', nl: 'Af en toe', en: 'Now and then', n: 30, p: '4,99', pe: '4.99', nlw: 'Voor wie een paar keer per maand op een veiling kijkt.', enw: 'For a few auctions a month.' },
  { id: 'regelmatig', nl: 'Regelmatig', en: 'Regular', n: 120, p: '12,99', pe: '12.99', nlw: 'Voor wie elke week biedt of af en toe doorverkoopt.', enw: 'For weekly bidders and occasional resellers.', top: true },
  { id: 'handelaar', nl: 'Handelaar', en: 'Trader', n: 500, p: '29,99', pe: '29.99', nlw: 'Voor wie kavels koopt om door te verkopen.', enw: 'For buying lots to resell.' },
  { id: 'handelaar_plus', nl: 'Handelaar Plus', en: 'Trader Plus', n: 1500, p: '69,99', pe: '69.99', nlw: 'Voor grote handelaren die dagelijks veel kavels bekijken.', enw: 'For large traders checking many lots a day.' }
];
function prijzenInhoud(nl) {
  const pak = PAKKETTEN.map(x => `<div class="kaart pakket${x.top ? ' pakket-uit' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>${nl ? x.nl : x.en}</h3>${x.top ? `<span class="badge">${nl ? 'Meest gekozen' : 'Most popular'}</span>` : ''}</div>
    <p>${nl ? x.nlw : x.enw}</p>
    <p class="prijs">€${nl ? x.p : x.pe}<small> ${nl ? 'per maand' : 'per month'}</small></p>
    <p style="font-weight:700">${x.n.toLocaleString('nl-NL')} ${nl ? 'analyses per maand' : 'analyses a month'}</p>
    <a class="knop ${x.top ? 'knop-messing' : 'knop-twee'}" href="/app">${nl ? 'Kies ' + x.nl : 'Choose ' + x.en}</a></div>`).join('');
  return `<section class="held"><div class="wrap smal" style="text-align:center">
  <h1>${nl ? 'Betaal voor wat je gebruikt' : 'Pay for what you use'}</h1>
  <p class="intro" style="margin:16px auto 0">${nl ? 'Begin met 10 gratis analyses. Bied je af en toe, koop dan een losse bundel. Bied je vaak, dan is een abonnement voordeliger. Alle prijzen zijn inclusief btw.' : 'Start with 10 free analyses. Bid now and then? Buy a one-off bundle. Bid often? A subscription is cheaper. All prices include VAT.'}</p>
</div></section>
<section class="wrap"><div class="welkom"><div style="flex:1 1 420px"><h2 style="font-size:24px;margin-bottom:4px">${nl ? 'Welkomstbundel: 10 analyses gratis' : 'Welcome bundle: 10 free analyses'}</h2><p>${nl ? 'Eenmalig bij je account. Ze verlopen niet: je gebruikt ze wanneer je wilt.' : 'Once, with your account. They never expire.'}</p></div><a class="knop knop-hoofd" href="/app">${nl ? 'Account maken' : 'Create account'}</a></div></section>
<section class="sectie" style="padding-bottom:0"><div class="wrap">
  <h2 style="margin-bottom:6px">${nl ? 'Losse bundels' : 'One-off bundles'}</h2><p style="color:var(--ink-2)">${nl ? 'Eén keer betalen, geen abonnement. Verlopen niet.' : 'Pay once, no subscription. Never expire.'}</p>
  <div class="rij">
    <div class="kaart pakket"><h3>25 analyses</h3><p class="prijs">€${nl ? '4,99' : '4.99'}</p><p>${nl ? '€0,20 per analyse' : '€0.20 per analysis'}</p><a class="knop knop-twee" href="/app">${nl ? 'Koop bundel' : 'Buy bundle'}</a></div>
    <div class="kaart pakket"><h3>60 analyses</h3><p class="prijs">€${nl ? '9,99' : '9.99'}</p><p>${nl ? '€0,17 per analyse' : '€0.17 per analysis'}</p><a class="knop knop-twee" href="/app">${nl ? 'Koop bundel' : 'Buy bundle'}</a></div>
  </div>
</div></section>
<section class="sectie"><div class="wrap">
  <h2 style="margin-bottom:6px">${nl ? 'Abonnementen' : 'Subscriptions'}</h2><p style="color:var(--ink-2)">${nl ? 'Elke maand nieuwe analyses. Maandelijks opzegbaar.' : 'New analyses every month. Cancel monthly.'}</p>
  <div class="raster">${pak}</div>
</div></section>
<section class="sectie sectie-wit"><div class="wrap smal">
  <h2>${nl ? 'Goed om te weten' : 'Good to know'}</h2>
  <ul class="lijst">${(nl ? [
    'Mislukt een analyse, dan telt hij niet mee.',
    'Hetzelfde bod opnieuw doorrekenen kost geen analyse.',
    'Met een abonnement gebruik je eerst de analyses van die maand en daarna pas je bundel.',
    'Analyses van een abonnement die je niet gebruikt, vervallen aan het eind van de maand. Bundels niet.',
    'Tegen misbruik kun je hooguit 60 analyses per uur doen; met Handelaar 120 en met Handelaar Plus 200.'
  ] : [
    'A failed analysis does not count.',
    'Recalculating a different bid is free.',
    'With a subscription, the month\'s analyses are used first, then your bundle.',
    'Unused subscription analyses expire at the end of the month. Bundles do not.',
    'To prevent abuse, you can run up to 60 analyses an hour; 120 with Trader and 200 with Trader Plus.'
  ]).map(x => `<li>${x}</li>`).join('')}</ul>
  <p style="margin-top:14px">${nl ? 'Betalen kan met' : 'Pay with'}</p><div class="betaal"><span>iDEAL</span><span>Bancontact</span><span>${nl ? 'Creditcard' : 'Credit card'}</span></div>
  <p class="bron" style="margin-top:14px">${nl ? 'Betalen gaat via Stripe. Je betaalgegevens gaan rechtstreeks naar Stripe; wij zien ze niet.' : 'Payments are handled by Stripe. Your payment details go straight to Stripe; we never see them.'}</p>
</div></section>`;
}
const PRIJZEN_NL = pagina({ titel: 'Prijzen – Veiling Analyser', beschrijving: 'Begin met 10 gratis analyses. Losse bundels vanaf €4,99 en abonnementen vanaf €4,99 per maand, inclusief btw.', pad: '/prijzen', actief: 'prijzen', inhoud: prijzenInhoud(true) });

// ── Veilinggids ──
// Alleen wat bij de bron is gecontroleerd. Bij twijfel: "verschilt per veiling".
const GIDS = [
  {
    slug: 'hnvi', naam: 'HNVI', land: 'Nederland',
    kort: '19% opgeld, btw over bod en opgeld',
    cijfers: [['Opgeld', '19%', ''], ['Btw', '21%', 'over bod en opgeld'], ['Vaste kosten per kavel', '€0', '']],
    voorbeeld: { bod: 100, regels: [['Opgeld 19%', 19], ['Btw 21% over €119,00', 24.99]], totaal: 143.99 },
    tekst: '<p>Bij HNVI komt er 19% opgeld bovenop je bod. Over het bod én het opgeld betaal je 21% btw. Een bod van €100 kost je zo €143,99.</p>',
    extra: '<h2>Ophalen en betalen</h2><p>[Ophaaldagen, betaaltermijn en bezorgmogelijkheden volgens de veilingvoorwaarden van HNVI.]</p>',
    bron: '[link naar de veilingvoorwaarden van HNVI]', bronUrl: null
  },
  {
    slug: 'troostwijk', naam: 'Troostwijk Auctions', land: 'Nederland en België',
    kort: 'Opgeld verschilt per veiling, plus btw',
    cijfers: [['Opgeld', 'Per veiling', 'staat bij de veiling'], ['Btw', 'Erbij', 'volgens de veiling'], ['Vaste kosten per kavel', 'Geen', 'in de algemene voorwaarden']],
    tekst: '<p>Troostwijk rekent opgeld: een percentage over je bod, plus btw. Hoe hoog dat percentage is, staat niet in de algemene voorwaarden maar in de voorwaarden van elke veiling. Kijk dus per veiling, of laat de app het van de kavelpagina lezen.</p><p>Biedingen zijn altijd zonder opgeld en belastingen: wat je bovenop je bod betaalt, komt er na het gunnen bij.</p>',
    extra: '<h2>Let op</h2><ul class="lijst"><li>Haal je een kavel niet op tijd op, dan kan Troostwijk opslag- en administratiekosten rekenen, volgens de algemene voorwaarden minstens €350.</li><li>Herroep je als consument een aankoop, dan rekent Troostwijk volgens de voorwaarden €25 per kavel voor de kosten.</li></ul>',
    bron: 'Algemene voorwaarden online veiling TroostwijkAuctions.com', bronUrl: 'https://api.troostwijkauctions.com/salefile/terms/36301/0/126?language=nl'
  },
  {
    slug: 'catawiki', naam: 'Catawiki', land: 'Europa',
    kort: 'Kopersbescherming 9% + €3, inclusief btw',
    cijfers: [['Kopersbescherming', '9%', 'van je winnende bod'], ['Vast bedrag', '€3', 'per aankoop'], ['Btw', 'Inbegrepen', 'in de kopersbescherming, waar van toepassing']],
    voorbeeld: { bod: 100, regels: [['Kopersbescherming 9%', 9], ['Vast bedrag', 3]], totaal: 112, noot: 'Verzendkosten komen er nog bij.' },
    tekst: '<p>Catawiki noemt het geen opgeld maar kopersbescherming: 9% van je winnende bod plus €3. De btw zit daar volgens Catawiki al in, waar die van toepassing is. Verzendkosten komen er apart bij.</p>',
    bron: 'Catawiki Help: What is the Buyer Protection fee?', bronUrl: 'https://auction.catawiki.com/en/help/fees/what-is-the-buyer-protection-fee'
  },
  {
    slug: 'nedveiling', naam: 'Nedveiling', land: 'Nederland',
    kort: '15% opgeld, plus btw over het opgeld',
    cijfers: [['Opgeld', '15%', 'tenzij vooraf anders vermeld'], ['Btw', '21%', 'over het opgeld'], ['Vaste kosten per kavel', 'Geen', 'in de voorwaarden']],
    voorbeeld: { bod: 100, regels: [['Opgeld 15%', 15], ['Btw 21% over het opgeld', 3.15]], totaal: 118.15, noot: 'Komt er bij een kavel ook btw over het bod, dan staat dat bij het kavel. Bezorgkosten komen er bij als je laat bezorgen.' },
    tekst: '<p>Volgens de voorwaarden van Nedveiling is het opgeld 15% van je bod, tenzij Nedveiling vóór de veiling een ander bedrag noemt. Over het opgeld betaal je btw. Vaste kosten per kavel staan niet in de voorwaarden; alleen bij te laat betalen rekent Nedveiling €10 administratiekosten.</p>',
    bron: 'Veilingvoorwaarden Nedveiling (pdf)', bronUrl: 'https://www.nedveiling.nl/files/terms.pdf'
  }
];
const NOG = ['BVA Auctions', 'Vavato', 'Onlineveilingmeester', 'Klaz', 'Surplex', 'Venduehuis', 'XL Auctions', 'Openbare Verkopen', 'Dome Auctions', 'Auctelia', 'DTZ'];
function gidsPagina(h) {
  const v = h.voorbeeld;
  const tabel = v ? `<div class="tabel-box"><table class="tabel"><caption>Rekenvoorbeeld: bod van ${euro(v.bod)}</caption><tbody><tr><td>Bod</td><td>${euro(v.bod)}</td></tr>${v.regels.map(([a, b]) => `<tr><td>${a}</td><td>${euro(b)}</td></tr>`).join('')}<tr class="totaal"><td>Totaal</td><td>${euro(v.totaal)}</td></tr></tbody></table></div>${v.noot ? `<p class="bron">${v.noot}</p>` : ''}` : '';
  return pagina({
    titel: `Kosten bij ${h.naam}: wat betaal je bovenop je bod? – Veiling Analyser`,
    beschrijving: `Opgeld, btw en andere kosten bij ${h.naam}, met een rekenvoorbeeld. ${h.kort}.`,
    pad: `/veilinggids/${h.slug}`, actief: 'gids',
    inhoud: `<section class="sectie"><div class="wrap smal artikel">
  <p class="kruimel"><a href="/veilinggids/">Veilinggids</a> › ${h.naam}</p>
  <h1 style="font-size:clamp(32px,4.4vw,48px)">Kosten bij ${h.naam}: wat betaal je bovenop je bod?</h1>
  <p class="intro" style="margin-top:14px">Een onafhankelijke uitleg. Veiling Analyser werkt niet samen met ${h.naam}.</p>
  <div class="cijfers">${h.cijfers.map(([a, b, c]) => `<div><span>${a}</span><b>${b}</b>${c ? `<small>${c}</small>` : ''}</div>`).join('')}</div>
  ${h.tekst}
  ${tabel}
  ${h.extra || ''}
  <div class="melding" style="margin:28px 0 16px;display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center"><p style="margin:0;flex:1 1 300px;font-weight:600">Wil je weten tot hoeveel je op een kavel van ${h.naam} kunt bieden? Plak de link in de app.</p><a class="knop knop-hoofd" href="/app">Analyseer een kavel</a></div>
  <p class="bron">Bron: ${h.bronUrl ? `<a href="${h.bronUrl}" rel="nofollow noopener" target="_blank">${h.bron}</a>` : h.bron}. Gecontroleerd op ${GECONTROLEERD}. Kosten kunnen per veiling verschillen; de voorwaarden van het veilinghuis gaan altijd voor.</p>
</div></section>`
  });
}
const GIDS_INDEX = pagina({
  titel: 'Veilinggids: kosten per veilinghuis – Veiling Analyser',
  beschrijving: 'Wat betaal je bovenop je bod bij HNVI, Troostwijk, Catawiki, Nedveiling en andere veilinghuizen? Opgeld, btw en vaste kosten, gecontroleerd bij de bron.',
  pad: '/veilinggids/', actief: 'gids',
  inhoud: `<section class="sectie"><div class="wrap">
  <h1 style="font-size:clamp(34px,4.6vw,52px)">Veilinggids</h1>
  <p class="intro" style="margin:14px 0 28px">Wat betaal je bovenop je bod? Per veilinghuis het opgeld, de btw en andere kosten, met de bron erbij. Veiling Analyser werkt niet samen met deze veilinghuizen.</p>
  <ul class="gidslijst">${GIDS.map(h => `<li><a href="/veilinggids/${h.slug}"><b>${h.naam}</b><span>${h.kort}</span></a></li>`).join('')}</ul>
  <h2 style="font-size:24px;margin:40px 0 12px">Binnenkort</h2>
  <p style="color:var(--ink-2)">Deze veilinghuizen voegen we toe zodra we hun kosten bij de bron hebben gecontroleerd. Tot die tijd leest de app de kosten van de kavelpagina zelf.</p>
  <ul class="gidslijst">${NOG.map(n => `<li><span class="nog">${n}</span></li>`).join('')}</ul>
</div></section>`
});

// ── Verhalen ──
const VERHALEN = [
  {
    slug: 'opgeld-berekenen', titel: 'Wat is opgeld en hoe reken je het uit?',
    kort: 'Het bedrag bovenop je bod, met een rekenvoorbeeld en een handige vuistregel.',
    inhoud: `<p>Opgeld is het bedrag dat een veilinghuis bovenop je bod rekent. Het is meestal een percentage van je bod, vaak tussen de 15 en 25 procent. Daar komt in veel gevallen btw over.</p>
<h2>Zo reken je het uit</h2>
<p>Bij een veiling die btw rekent over het bod én het opgeld, betaal je:</p>
<p><b>bod × (1 + opgeld) × 1,21</b></p>
<p>Bij 18% opgeld is dat bod × 1,18 × 1,21 = bod × 1,428. Elke euro die je biedt, kost je dus bijna €1,43.</p>
<div class="tabel-box"><table class="tabel"><caption>Bij 18% opgeld en 21% btw over bod en opgeld</caption><thead><tr><th>Bod</th><th>Wat je betaalt</th></tr></thead><tbody><tr><td>€50</td><td>€71,39</td></tr><tr><td>€100</td><td>€142,78</td></tr><tr><td>€250</td><td>€356,95</td></tr></tbody></table></div>
<h2>Vuistregel</h2>
<p>Wil je weten wat je maximaal kunt bieden? Deel het bedrag dat je in totaal wilt uitgeven door 1,43 (bij 18% opgeld en 21% btw). Wil je hooguit €100 kwijt zijn, bied dan niet meer dan €70.</p>
<h2>Let op de uitzonderingen</h2>
<p>Niet elke veiling rekent btw over het bod. Bij gebruikte goederen gebruiken veilinghuizen vaak de margeregeling: dan komt er geen btw over het bod, wel over het opgeld. <a href="/verhalen/margeregeling-of-btw">Dat scheelt flink.</a> En sommige veilingen rekenen een vast bedrag per kavel. Kijk altijd in de voorwaarden van de veiling, of laat Veiling Analyser het van de kavelpagina lezen.</p>`
  },
  {
    slug: 'margeregeling-of-btw', titel: 'Margeregeling of 21% btw: waarom dat bij een veiling zoveel uitmaakt',
    kort: 'Hetzelfde bod, een verschil van ruim twintig euro.',
    inhoud: `<p>Bij een veiling betaal je bijna altijd btw over het opgeld. Maar of je ook btw betaalt over je bod, hangt af van de regeling die de veiling gebruikt. Dat staat in de voorwaarden of bij het kavel.</p>
<h2>Volledige btw</h2>
<p>De veiling rekent 21% btw over het bod en over het opgeld. Dat zie je vaak bij nieuwe goederen en bij kavels van bedrijven.</p>
<h2>Margeregeling</h2>
<p>Bij gebruikte goederen gebruiken veilinghuizen vaak de bijzondere regeling voor gebruikte goederen, de margeregeling. Dan komt er geen btw over het bod, wel over het opgeld.</p>
<div class="tabel-box"><table class="tabel"><caption>Bod van €100 bij 18% opgeld</caption><thead><tr><th>Regeling</th><th>Wat je betaalt</th></tr></thead><tbody><tr><td>Volledige btw: €100 + €18 opgeld + €24,78 btw</td><td>€142,78</td></tr><tr><td>Margeregeling: €100 + €18 opgeld + €3,78 btw over het opgeld</td><td>€121,78</td></tr></tbody></table></div>
<p>Hetzelfde bod kost je dus €21 meer of minder. Bij een bod van €500 is dat al ruim €100.</p>
<h2>Opgeld inclusief btw</h2>
<p>Sommige veilingen noemen een opgeld waar de btw al in zit, zoals de kopersbescherming bij <a href="/veilinggids/catawiki">Catawiki</a>. Dan komt er niets meer bij.</p>
<p>Veiling Analyser rekent met alle drie de regelingen. Leest de app de regeling niet van de kavelpagina, dan kun je hem zelf kiezen bij de kosten.</p>
<p class="bron">Dit is een algemene uitleg, geen belastingadvies. Twijfel je, kijk dan in de voorwaarden van de veiling.</p>`
  },
  {
    slug: 'vijf-dure-fouten', titel: 'Vijf dure fouten bij online veilingen',
    kort: 'Van vergeten opgeld tot doorbieden in de laatste minuut.',
    inhoud: `<h2>1. Alleen naar het bod kijken</h2>
<p>Opgeld en btw maken van €40 al snel bijna €57. Reken altijd met wat je echt betaalt. <a href="/verhalen/opgeld-berekenen">Zo reken je het uit.</a></p>
<h2>2. Vaste kosten en ophalen vergeten</h2>
<p>Sommige veilingen rekenen een vast bedrag per kavel. En wie niet op de ophaaldag komt, kan opslagkosten krijgen. Reken ook je eigen reistijd en benzine mee.</p>
<h2>3. Vergelijken met vraagprijzen</h2>
<p>Op Marktplaats staat een product vaak voor meer dan waarvoor het echt verkocht wordt. Verkochte items op eBay zeggen meer over wat mensen echt betalen.</p>
<h2>4. Doorbieden in de laatste minuut</h2>
<p>Veel online veilingen verlengen de sluitingstijd als er vlak voor het einde wordt geboden. Wie op het moment zelf beslist, biedt al snel meer dan hij wilde. Bepaal je maximale bod vooraf en houd je eraan.</p>
<h2>5. Alleen op de foto's vertrouwen</h2>
<p>Foto's laten niet alles zien. Kom naar de kijkdag als dat kan, en controleer of er geen schade of defecte onderdelen zijn. Ook Veiling Analyser ziet op foto's niet elk detail.</p>`
  }
];
function verhaalPagina(v) {
  return pagina({
    titel: `${v.titel} – Veiling Analyser`, beschrijving: v.kort, pad: `/verhalen/${v.slug}`, actief: 'verhalen',
    inhoud: `<section class="sectie"><article class="wrap smal artikel">
  <p class="kruimel"><a href="/verhalen/">Verhalen</a></p>
  <h1 style="font-size:clamp(32px,4.4vw,48px)">${v.titel}</h1>
  <p class="intro" style="margin:14px 0 8px">${v.kort}</p>
  ${v.inhoud}
  <div class="melding" style="margin:32px 0 0;display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center"><p style="margin:0;flex:1 1 300px;font-weight:600">Laat de app het rekenwerk doen: plak de link van een kavel en zie tot hoeveel je kunt bieden.</p><a class="knop knop-hoofd" href="/app">Probeer het gratis</a></div>
</article></section>`
  });
}
const VERHALEN_INDEX = pagina({
  titel: 'Verhalen en uitleg – Veiling Analyser', beschrijving: 'Uitleg over opgeld, btw en slim bieden op online veilingen.', pad: '/verhalen/', actief: 'verhalen',
  inhoud: `<section class="sectie"><div class="wrap">
  <h1 style="font-size:clamp(34px,4.6vw,52px)">Verhalen en uitleg</h1>
  <p class="intro" style="margin:14px 0 28px">Slimmer bieden op online veilingen, in gewone taal.</p>
  <ul class="gidslijst">${VERHALEN.map(v => `<li><a href="/verhalen/${v.slug}"><b>${v.titel}</b><span>${v.kort}</span></a></li>`).join('')}</ul>
</div></section>`
});

// ── Over ons en contact ──
const OVER = pagina({
  titel: 'Over ons en contact – Veiling Analyser', beschrijving: 'Veiling Analyser is een handelsnaam van Xtenate uit Waalwijk. Zo neem je contact op.', pad: '/over', actief: 'over',
  inhoud: `<section class="sectie"><div class="wrap smal artikel">
  <h1 style="font-size:clamp(34px,4.6vw,52px)">Over Veiling Analyser</h1>
  <p class="intro" style="margin:14px 0 8px">Veiling Analyser helpt je bepalen tot welk bedrag je op een veilingkavel kunt bieden, met echte prijzen en alle kosten meegerekend.</p>
  <h2>Wie zit erachter</h2>
  <p>[Jouw verhaal: wie je bent, waarom je de app maakte en wat je met veilingen hebt.]</p>
  <p>Veiling Analyser is een handelsnaam van ${BEDRIJF.naam}.</p>
  <h2>Contact</h2>
  <p>Vragen, ideeën of iets dat niet klopt? Mail naar <a href="mailto:${BEDRIJF.email}">${BEDRIJF.email}</a>. We reageren meestal binnen twee werkdagen.</p>
  <div class="tabel-box"><table class="tabel"><tbody>
    <tr><td>Bedrijf</td><td>${BEDRIJF.naam}</td></tr>
    <tr><td>Adres</td><td>${BEDRIJF.adres}</td></tr>
    <tr><td>KvK-nummer</td><td>${BEDRIJF.kvk}</td></tr>
    <tr><td>Btw-nummer</td><td>${BEDRIJF.btw}</td></tr>
    <tr><td>E-mail</td><td><a href="mailto:${BEDRIJF.email}">${BEDRIJF.email}</a></td></tr>
  </tbody></table></div>
  <h2>Onafhankelijk</h2>
  <p>We werken niet samen met veilinghuizen of met Marktplaats, 2dehands of eBay. Namen van veilinghuizen gebruiken we alleen om uit te leggen hoe hun kosten werken.</p>
</div></section>`
});

// ── Zo rekent de app ──
const REKENEN = pagina({
  titel: 'Zo rekent de app – Veiling Analyser', beschrijving: 'Wat Veiling Analyser meerekent in het maximale bod, wat niet, en waarom een particulier en een handelaar een andere opbrengst halen.', pad: '/hoe-we-rekenen', actief: '',
  inhoud: `<section class="sectie"><div class="wrap smal artikel">
  <h1 style="font-size:clamp(34px,4.6vw,52px)">Zo rekent de app</h1>
  <p class="intro" style="margin:14px 0 8px">Het maximale bod is een rekensom met twee kanten: wat het kavel je kost, en wat je er later voor krijgt. Hier staat precies wat erin zit, wat niet, en waar de uitkomst voor jou anders kan uitvallen.</p>

  <h2>1. Wat het kavel je kost</h2>
  <ul class="lijst">
    <li><b>Je bod</b>, of het huidige bod als je zelf niets invult.</li>
    <li><b>Opgeld</b>: het percentage dat het veilinghuis bovenop je bod rekent.</li>
    <li><b>Vaste kosten per kavel</b>, zoals kavelkosten of administratiekosten, als de veiling die heeft.</li>
    <li><b>Btw</b> volgens de regeling van het kavel: over bod en opgeld, alleen over het opgeld (margeregeling), of niet.</li>
    <li><b>Je eigen verkoopkosten</b> per kavel, als je die in de instellingen invult (bijvoorbeeld verzending of platformkosten).</li>
  </ul>
  <p>De kosten leest de app van de kavelpagina. Staan ze daar niet, dan gebruikt de app jouw instelling voor dat veilinghuis of een standaardwaarde, en zegt dat erbij. De voorwaarden van het veilinghuis gaan altijd voor.</p>

  <h2>2. Wat je er later voor krijgt</h2>
  <p>De <b>verwachte verkoopprijs</b> is wat een particulier er in Nederland of België realistisch voor krijgt als hij het binnen een paar weken verkoopt aan een andere particulier. De app baseert dat op advertenties van hetzelfde product in een vergelijkbare staat en, waar die er zijn, op verkochte items. Vraagprijzen liggen meestal hoger dan wat er echt betaald wordt; daar corrigeert de app voor.</p>
  <p>Bij <b>auto's en andere voertuigen</b> met een Nederlands kenteken haalt de app het exacte model, de eerste toelating, de catalogusprijs en het oordeel over de tellerstand uit de open data van de RDW. Vraagprijzen van autobedrijven staan apart: die zijn inclusief garantie, afleveringskosten en hun marge. Als particulier krijg je meestal 8 tot 15% minder dan zo'n vraagprijs.</p>

  <h2>3. Het maximale bod</h2>
  <p>De app zoekt het hoogste bod waarbij na alle kosten jouw <b>gewenste marge</b> overblijft (standaard 20% van de verkoopprijs; je kunt die zelf instellen). Het <b>break-evenbod</b> is het bod waarbij je precies quitte speelt.</p>
  <div class="tabel-box"><table class="tabel"><caption>Voorbeeld: verwachte verkoop €1.000, 20% marge, 17% opgeld, btw over bod en opgeld</caption><tbody>
    <tr><td>Verwachte verkoopprijs</td><td>€1.000</td></tr>
    <tr><td>Daarvan wil je overhouden (20%)</td><td>€200</td></tr>
    <tr><td>Mag het kavel in totaal kosten</td><td>€800</td></tr>
    <tr class="totaal"><td>Maximaal bod (€800 ÷ 1,17 ÷ 1,21)</td><td>€565</td></tr>
  </tbody></table></div>

  <h2>4. Wat de app niet meerekent</h2>
  <ul class="lijst">
    <li>Transport, ophalen en eventuele kosten als je te laat ophaalt</li>
    <li>Reparatie, onderdelen, schoonmaken en keuring (zoals APK)</li>
    <li>Garantie die jij aan je koper geeft</li>
    <li>Onderhandelen: kopers bieden vaak minder dan je vraagt</li>
    <li>Jouw eigen btw of belasting over de winst als je zakelijk doorverkoopt</li>
    <li>Opslag, je tijd en het risico dat iets langer blijft staan of niet verkoopt</li>
    <li>Schade of gebreken die niet op de pagina of de foto's staan</li>
  </ul>
  <p>Wil je die toch meetellen, vul ze dan in als verkoopkosten of kies een hogere gewenste marge.</p>

  <h2>5. Particulier of handelaar: wie verkoopt maakt uit</h2>
  <p>Hetzelfde kavel levert niet voor iedereen hetzelfde op. Een handelaar met een vaste klantenkring, een showroom of garantie kan vaak meer vragen dan een particulier. Verkoop je juist aan een handelaar, opkoper of als inruil, dan krijg je meestal minder. De app rekent met de verkoop van particulier aan particulier, omdat dat voor iedereen het eerlijkste vergelijkingspunt is.</p>
  <p>Weet je uit ervaring dat jij meer of minder haalt? Pas de verwachte verkoopprijs bij het kavel dan zelf aan. Het maximale bod rekent direct mee.</p>

  <h2>6. Een hulpmiddel, geen garantie</h2>
  <p>De prijzen komen van advertenties en verkochte items van anderen. Die kunnen onvolledig of verouderd zijn of over een net iets ander product gaan. Bij weinig vergelijkbaar aanbod zegt de app dat erbij. Jij beslist of en hoeveel je biedt. Zie ook artikel 3 van de <a href="/voorwaarden">voorwaarden</a>.</p>
</div></section>`
});

// ── Engels ──
const HOME_EN = pagina({
  taal: 'en', titel: 'Veiling Analyser – know how much to bid',
  beschrijving: 'Paste the link of an auction lot. Veiling Analyser finds real prices on Marktplaats, 2dehands and eBay, adds the buyer\'s premium and VAT, and tells you how much you can bid.',
  pad: '/en/', actief: '',
  inhoud: `<section class="held"><div class="wrap rij">
  <div>
    <p class="boventitel">For auctions in the Netherlands and Belgium</p>
    <h1>Know how much to bid, before you bid.</h1>
    <p class="intro">Paste the link of an auction lot. Veiling Analyser checks what the same product really sells for today on Marktplaats, 2dehands and eBay, adds the buyer's premium and VAT, and tells you the highest bid that still makes sense.</p>
    <div class="knoppen"><a class="knop knop-hoofd" href="/app">Analyse your first lot for free</a><a class="knop knop-twee" href="#how">How it works</a></div>
    <p class="klein">10 free analyses with your account. They never expire. No payment details needed. The app itself is in Dutch.</p>
  </div>
  <div>${voorbeeld(false)}</div>
</div></section>
<section class="sectie sectie-wit" id="how"><div class="wrap">
  <h2>How it works</h2>
  <div class="rij">
    <div class="kaart kaart-grijs"><span class="stap-nr">1</span><h3>Paste the link</h3><p>From any auction site. On your phone, share a lot straight to the app. You can add photos too.</p></div>
    <div class="kaart kaart-grijs"><span class="stap-nr">2</span><h3>The app finds prices</h3><p>Real listings and sold items from today, plus the new price. With links, so you can check everything yourself.</p></div>
    <div class="kaart kaart-grijs"><span class="stap-nr">3</span><h3>Bid up to the tag</h3><p>The highest bid that still leaves your margin after premium, VAT and selling costs.</p></div>
  </div>
</div></section>
<section class="sectie"><div class="wrap rij">
  <div><h2>The bid is not what you pay</h2><p class="intro">Auction houses add a buyer's premium and VAT, sometimes a fixed fee per lot. A €40 bid quickly becomes almost €57. Veiling Analyser reads the costs from the lot page and always includes them.</p></div>
  <div class="kaart"><div class="tabel-box"><table class="tabel"><caption>Example at 17% premium and 21% VAT</caption><tbody><tr><td>Your bid</td><td>€40.00</td></tr><tr><td>Premium 17%</td><td>€6.80</td></tr><tr><td>VAT 21% on bid and premium</td><td>€9.83</td></tr><tr class="totaal"><td>What you really pay</td><td>€56.63</td></tr></tbody></table></div></div>
</div></section>
<section class="sectie sectie-zacht"><div class="wrap">
  <h2>Honest prices, no guesswork</h2>
  <div class="rij">
    <div><h3>Real listings</h3><p>Prices come from today's listings and sold items, with a link to every source.</p></div>
    <div><h3>Says so when it is unsure</h3><p>Few listings or doubt about the product? It tells you, instead of showing a nice but made-up number.</p></div>
    <div><h3>You stay in control</h3><p>Adjust prices, costs and your margin. The maximum bid updates instantly.</p></div>
  </div>
  <p class="melding" style="margin-top:24px">The app looks at photos to recognise the product, but it cannot see every detail. Always check for damage or defective parts yourself, ideally on the viewing day.</p>
</div></section>
<section class="sectie sectie-wit reviews" id="reviews"><div class="wrap"><h2>What users say</h2><div id="reviews-lijst"></div></div></section>
<section class="sectie sectie-donker"><div class="wrap rij" style="align-items:center">
  <div><h2 style="margin-bottom:8px">Paste your first lot</h2><p>10 free analyses. No payment details needed.</p></div>
  <div style="flex:0 1 auto"><a class="knop knop-messing" href="/app">Start free</a></div>
</div></section>`,
  script: REVIEWS_JS(false)
});
const PRIJZEN_EN = pagina({ taal: 'en', titel: 'Pricing – Veiling Analyser', beschrijving: 'Start with 10 free analyses. One-off bundles from €4.99 and subscriptions from €4.99 a month, VAT included.', pad: '/en/pricing', actief: 'prijzen', inhoud: prijzenInhoud(false) });

// ── Wegschrijven ──
const BESTANDEN = {
  'index.html': HOME_NL, 'prijzen.html': PRIJZEN_NL, 'over.html': OVER, 'hoe-we-rekenen.html': REKENEN,
  'veilinggids/index.html': GIDS_INDEX, 'verhalen/index.html': VERHALEN_INDEX,
  'en/index.html': HOME_EN, 'en/pricing.html': PRIJZEN_EN
};
GIDS.forEach(h => { BESTANDEN['veilinggids/' + h.slug + '.html'] = gidsPagina(h); });
VERHALEN.forEach(v => { BESTANDEN['verhalen/' + v.slug + '.html'] = verhaalPagina(v); });
const urls = Object.keys(BESTANDEN).map(p => 'https://veilinganalyser.nl/' + p.replace(/index\.html$/, '').replace(/\.html$/, ''));
BESTANDEN['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(u => '  <url><loc>' + u + '</loc></url>').join('\n') + '\n</urlset>\n';
BESTANDEN['robots.txt'] = 'User-agent: *\nDisallow: /api/\nAllow: /\nSitemap: https://veilinganalyser.nl/sitemap.xml\n';

rmSync(UIT, { recursive: true, force: true });
for (const [pad, inhoud] of Object.entries(BESTANDEN)) {
  const doel = join(UIT, pad);
  mkdirSync(dirname(doel), { recursive: true });
  writeFileSync(doel, inhoud);
}
console.log('Website gebouwd: ' + Object.keys(BESTANDEN).length + ' bestanden in site/www');
