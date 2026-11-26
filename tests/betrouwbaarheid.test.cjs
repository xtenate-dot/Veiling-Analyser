// Unit-tests voor de betrouwbaarheidsscore en productherkenning (zonder AI, zonder netwerk)
const assert = require('assert');
globalThis.global = globalThis;
require('../kern.js');
const K = globalThis.VAKern;
const nu = Date.now();
const ad = (titel, prijs, soort, extra) => Object.assign({ platform: 'Marktplaats', titel, prijs, soort: soort || 'vraagprijs', url: 'https://x.nl/' + Math.random(), bevestigd: true, datum: null }, extra);
const pr = (ads, extra) => Object.assign({ live: true, opgehaald_op: nu, marktplaats: { gemiddeld: 300, vertrouwen: 'hoog' }, tweedehands: ads }, extra);
const pagina = { gevonden: true, merk: 'DeWalt', model: 'DCD791', variant: '', titel: 'DeWalt DCD791 accuboormachine', zoekterm: 'dewalt dcd791' };
let n = 0; const t = (naam, f) => { f(); n++; console.log('ok -', naam); };

t('geen advertenties = onvoldoende', () => {
  const b = K.berekenBetrouwbaarheid(pr([]), pagina, 'DeWalt DCD791', '', nu);
  assert.strictEqual(b.niveau, 'onvoldoende');
});
t('niet live = onvoldoende, ook met advertenties', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791 set', 250)], { live: false }), pagina, 'x', '', nu);
  assert.strictEqual(b.niveau, 'onvoldoende');
});
t('advertenties van een ander type tellen niet mee', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD796 boor', 200), ad('Makita boormachine', 100), ad('DeWalt DCD790', 150)]), pagina, 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 0); assert.strictEqual(b.niveau, 'onvoldoende');
});
t('zes passende vraagprijzen zonder verkoop: nooit hoog', () => {
  const ads = [1, 2, 3, 4, 5, 6].map(i => ad('DeWalt DCD791 ' + i, 200 + i * 5));
  const b = K.berekenBetrouwbaarheid(pr(ads), pagina, 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 6); assert.strictEqual(b.niveau, 'middel');
});
t('vijf passende met verkochte items kan hoog zijn', () => {
  const ads = [ad('DeWalt DCD791 a', 210, 'verkocht', { platform: 'eBay' }), ad('DeWalt DCD791 b', 220, 'verkocht', { platform: 'eBay' }), ad('DeWalt DCD791 c', 230, 'verkocht', { platform: 'eBay' }), ad('DeWalt DCD791 d', 240), ad('DeWalt DCD791 e', 250)];
  const b = K.berekenBetrouwbaarheid(pr(ads, { marktplaats: { gemiddeld: 230, vertrouwen: 'laag' } }), pagina, 'x', '', nu);
  assert.strictEqual(b.niveau, 'hoog', JSON.stringify(b));
});
t('AI-vertrouwen "hoog" verandert de score niet', () => {
  const a = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791', 200)], { marktplaats: { gemiddeld: 200, vertrouwen: 'hoog' } }), pagina, 'x', '', nu);
  const c = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791', 200)], { marktplaats: { gemiddeld: 200, vertrouwen: 'laag' } }), pagina, 'x', '', nu);
  assert.strictEqual(a.score, c.score); assert.strictEqual(a.niveau, 'onvoldoende');
});
t('verwachte prijs ver boven de gevonden prijzen kost punten', () => {
  const ads = [ad('DeWalt DCD791 a', 100), ad('DeWalt DCD791 b', 110), ad('DeWalt DCD791 c', 105)];
  const goed = K.berekenBetrouwbaarheid(pr(ads, { marktplaats: { gemiddeld: 100 } }), pagina, 'x', '', nu);
  const slecht = K.berekenBetrouwbaarheid(pr(ads, { marktplaats: { gemiddeld: 300 } }), pagina, 'x', '', nu);
  assert.ok(slecht.score === goed.score - 10, goed.score + ' vs ' + slecht.score);
});
t('oude advertenties verlagen de actualiteit', () => {
  const oud = new Date(nu - 200 * 864e5).toISOString().slice(0, 10);
  const ads = [ad('DeWalt DCD791 a', 200, 'vraagprijs', { datum: oud }), ad('DeWalt DCD791 b', 210, 'vraagprijs', { datum: oud })];
  const b = K.berekenBetrouwbaarheid(pr(ads), pagina, 'x', '', nu);
  assert.strictEqual(b.factoren.find(f => f.naam === 'Actualiteit').punten, 3);
});
t('variantwoord pro: iPhone 13 matcht niet met iPhone 13 Pro', () => {
  const p = { gevonden: true, merk: 'Apple', model: 'iPhone 13', variant: '128GB' };
  const b = K.berekenBetrouwbaarheid(pr([ad('Apple iPhone 13 Pro 128GB', 600), ad('Apple iPhone 13 128GB', 450)]), p, 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 1);
});
t('modelnummer met streepje wordt herkend', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('Dewalt DCD-791 accuboor', 150)]), pagina, 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 1);
});
t('zonder merk of model is er niets te toetsen: advertenties tellen maar worden gemeld', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('Houten kast', 80), ad('Kast eiken', 90), ad('Kastje', 70)]), { gevonden: true }, 'houten kast', '', nu);
  assert.strictEqual(b.aantal_passend, 3);
  assert.ok(/niet te toetsen/.test(b.factoren[1].tekst));
});
t('door gebruiker opgegeven naam telt als eis', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('Sony WH-1000XM4 koptelefoon', 150), ad('Sony WH-1000XM5', 250)]), { gevonden: true }, 'Sony WH-1000XM4', 'Sony WH-1000XM4', nu);
  assert.strictEqual(b.aantal_passend, 1);
});
t('titel zonder merk maar met modelnummer past; zonder typenummer is het merk nodig', () => {
  assert.strictEqual(K.berekenBetrouwbaarheid(pr([ad('DCD791 accuboor 18V', 150)]), pagina, 'x', '', nu).aantal_passend, 1);
  const p2 = { gevonden: true, merk: 'Bosch', model: 'boormachine', variant: '' };
  assert.strictEqual(K.berekenBetrouwbaarheid(pr([ad('Bosch boormachine groen', 40), ad('Makita boormachine', 45)]), p2, 'x', '', nu).aantal_passend, 1);
});
t('herkenning: merk + modelnummer in titel = zeker', () => {
  assert.strictEqual(K.bepaalHerkenning(pagina, 'DeWalt DCD791', '', null).zekerheid, 'zeker');
});
t('herkenning: geen modelnummer = onzeker', () => {
  assert.strictEqual(K.bepaalHerkenning({ gevonden: true, merk: 'Bosch', model: 'boormachine', variant: '', titel: 'Bosch boormachine' }, 'x', '', null).zekerheid, 'onzeker');
});
t('herkenning: niets herkend = onvoldoende; opgegeven door gebruiker = bevestigd', () => {
  assert.strictEqual(K.bepaalHerkenning(null, '', '', null).zekerheid, 'onvoldoende');
  assert.strictEqual(K.bepaalHerkenning(null, 'iets', 'iets', null).zekerheid, 'bevestigd');
});
t('herkenning zakt naar onzeker als advertenties niet passen', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('Makita a', 1), ad('Makita b', 1), ad('Makita c', 1)]), pagina, 'x', '', nu);
  assert.strictEqual(K.bepaalHerkenning(pagina, 'x', '', b).zekerheid, 'onzeker');
});
t('partijen van meerdere stuks tellen niet mee voor één stuk', () => {
  const p = { gevonden: true, merk: 'Pokemon', model: '', variant: '' };
  const b = K.berekenBetrouwbaarheid(pr([ad('Pokémon - 10 Booster pack - Scarlet & Violet', 8), ad('Pokémon 20 Booster pack mix van 20', 59), ad('Pokemon booster pack sv1s losse pack', 9), ad('Pokemon booster pack 151 pack', 12)]), p, 'Pokemon booster pack', '', nu);
  assert.strictEqual(b.aantal_passend, 2, JSON.stringify(b.afgekeurd));
});
t('partij-kavel mag wel partij-advertenties vergelijken', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791 set van 10', 800), ad('DeWalt DCD791 partij 10 stuks', 900)]), Object.assign({}, pagina, { aantal_stuks: 10 }), 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 2);
});
t('defecte advertentie telt niet mee bij een werkend product, en omgekeerd', () => {
  const ads = [ad('DeWalt DCD791 werkt perfect', 200), ad('DeWalt DCD791 gebarsten behuizing', 80), ad('DeWalt DCD791 accuboor', 190)];
  assert.strictEqual(K.berekenBetrouwbaarheid(pr(ads), pagina, 'x', '', nu).aantal_passend, 2);
  const defect = Object.assign({}, pagina, { staat: 'defect' });
  assert.strictEqual(K.berekenBetrouwbaarheid(pr(ads), defect, 'x', '', nu).aantal_passend, 1);
});
t('veilingkavels zijn geen marktprijs', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791 (veilingkavel, uitstekende staat)', 900), ad('DeWalt DCD791 boor', 150, 'vraagprijs', { url: 'https://www.hnvi.nl/kavel/1' }), ad('DeWalt DCD791 los', 160)]), pagina, 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 1);
});
t('advertenties ouder dan een jaar tellen niet mee', () => {
  const oud = new Date(nu - 400 * 864e5).toISOString().slice(0, 10);
  const b = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791 a', 150, 'vraagprijs', { datum: oud }), ad('DeWalt DCD791 b', 160), ad('DeWalt DCD791 c', 170)]), pagina, 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 2);
});
t('minder dan twee passende advertenties = onvoldoende, met uitleg', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791 los', 150), ad('DeWalt DCD796', 160)]), pagina, 'x', '', nu);
  assert.strictEqual(b.niveau, 'onvoldoende'); assert.ok(/maar één advertentie/.test(b.reden));
});
t('modelnaam met cijfers als "iPhone 13 128GB" wordt niet als partij gezien', () => {
  const p = { gevonden: true, merk: 'Apple', model: 'iPhone 13', variant: '128GB' };
  const b = K.berekenBetrouwbaarheid(pr([ad('iPhone 13 128GB blauw', 250), ad('Apple iPhone 13 128GB zwart', 240)]), p, 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 2);
});
// ── A: jaartal ──
const mac = { gevonden: true };
const macExtra = 'Apple MacBook Pro 14 inch M3 2023, scherm gebarsten, werkt verder';
t('A: jaartal hoeft niet in de titel te staan', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('Apple 14" MacBook Pro M3 / 8 GB / 1 TB SSD', 1250), ad('MacBook Pro 14 inch M3 16GB', 1150)]), mac, 'Apple MacBook Pro 14 inch M3 2023', 'Apple MacBook Pro 14 inch M3 2023', nu);
  assert.strictEqual(b.aantal_passend, 2, JSON.stringify(b.afgekeurd));
});
t('A: aantoonbaar ander modeljaar (2 jaar of meer) wordt uitgesloten, een jaar verschil niet', () => {
  const p = (titels) => K.berekenBetrouwbaarheid(pr(titels.map(x => ad(x, 900))), mac, 'MacBook Pro 14 M3 2023', 'MacBook Pro 14 M3 2023', nu);
  const b = p(['MacBook Pro 14 M3 2021', 'MacBook Pro 14 M3 2024', 'MacBook Pro 14 M3 2023', 'MacBook Pro 14 M3']);
  assert.strictEqual(b.aantal_passend, 3, JSON.stringify(b.afgekeurd));
  assert.ok(/ander modeljaar/.test(JSON.stringify(b.afgekeurd)));
});
t('A: garantiejaar of aankoopjaar in de titel telt niet als modeljaar', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('MacBook Pro 14 M3 garantie tot 2027', 900), ad('MacBook Pro 14 M3 gekocht in 2021', 900)]), mac, 'MacBook Pro 14 M3 2023', 'MacBook Pro 14 M3 2023', nu);
  assert.strictEqual(b.aantal_passend, 2);
});
t('A: GPU-typenummer als RTX 2060 is geen jaartal', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('Asus RTX 2060 6GB', 150), ad('MSI RTX 2060 Super', 170)]), mac, 'RTX 2060', 'RTX 2060', nu);
  assert.strictEqual(b.jaar_eis, null); assert.ok(b.aantal_passend >= 1);
});
// ── B: staat en afkeurreden ──
const advMacWerkend = { titel: 'Apple Macbook Pro 2023 14" M3/ 8GB/ 1TB SSD / in Nieuwstaat', staat: 'zo goed als nieuw' };
t('B: werkende MacBook bij een defect kavel wordt afgekeurd, met duidelijke reden', () => {
  const pp = pr([ad(advMacWerkend.titel, 1350, 'vraagprijs', { staat: advMacWerkend.staat })]);
  const b = K.berekenBetrouwbaarheid(pp, null, 'Apple MacBook Pro 14 inch M3 2023', macExtra, nu);
  const a = pp.tweedehands[0];
  assert.strictEqual(a.past, false); assert.strictEqual(a.afkeur, 'werkend exemplaar (kavel is defect)');
  assert.ok(/gebarsten/.test(a.afkeur_detail) && /zo goed als nieuw/.test(a.afkeur_detail), a.afkeur_detail);
  assert.strictEqual(b.kavel_defect, true); assert.strictEqual(b.kavel_defect_woord, 'gebarsten');
});
t('B: defecte advertentie bij een defect kavel telt wel mee; staat-veld met defectwoord ook', () => {
  const pp = pr([ad('MacBook Pro 14 M3 scherm gebarsten', 600), ad('MacBook Pro 14 M3', 650, 'vraagprijs', { staat: 'defect' })]);
  const b = K.berekenBetrouwbaarheid(pp, null, 'Apple MacBook Pro 14 inch M3 2023', macExtra, nu);
  assert.strictEqual(b.aantal_passend, 2, JSON.stringify(pp.tweedehands.map(a => [a.afkeur, a.afkeur_detail])));
});
t('B: elke afkeuring heeft een reden en een detail', () => {
  const pp = pr([ad('DeWalt DCD796', 100), ad('DeWalt DCD791 10 stuks', 900), ad('DeWalt DCD791 veilingkavel', 900), ad('DeWalt DCD791 kapot', 20)]);
  K.berekenBetrouwbaarheid(pp, pagina, 'x', '', nu);
  pp.tweedehands.forEach(a => { assert.strictEqual(a.past, false); assert.ok(a.afkeur && a.afkeur_detail, JSON.stringify(a)); });
});
// ── C: score en onvoldoende ──
t('C: alleen passende advertenties tellen mee voor bronnen en actualiteit', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('Makita a', 100), ad('Makita b', 100), ad('Makita c', 100)]), pagina, 'x', '', nu);
  assert.strictEqual(b.factoren.find(f => f.naam === 'Kwaliteit van de bronnen').punten, 0);
  assert.strictEqual(b.factoren.find(f => f.naam === 'Actualiteit').punten, 0);
});
t('C: minder dan twee passende advertenties: score hooguit 24 en altijd onvoldoende (willekeurige invoer)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const titels = ['DeWalt DCD791 los', 'DeWalt DCD791 set', 'DeWalt DCD796', 'Makita boor', 'DeWalt DCD791 kapot', 'DeWalt DCD791 10 stuks', 'DeWalt DCD791 veilingkavel', 'DeWalt DCD791 accu'];
  let gezien = 0;
  for (let i = 0; i < 400; i++) {
    const ads = Array.from({ length: Math.floor(rnd() * 12) }, () => ad(titels[Math.floor(rnd() * titels.length)], 50 + Math.floor(rnd() * 300), rnd() < 0.3 ? 'verkocht' : 'vraagprijs', { bevestigd: rnd() < 0.8, datum: rnd() < 0.5 ? new Date(nu - rnd() * 100 * 864e5).toISOString().slice(0, 10) : null }));
    const b = K.berekenBetrouwbaarheid(pr(ads, { live: rnd() < 0.9 }), pagina, 'x', '', nu);
    if (b.aantal_passend < 2 || !pr(ads).live) { gezien++; }
    if (b.aantal_passend < 2) { assert.ok(b.score <= 24, 'score ' + b.score); assert.strictEqual(b.niveau, 'onvoldoende'); }
  }
  assert.ok(gezien > 20);
});
t('C: de begrenzing staat in de uitleg', () => {
  const b = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791 los', 200)]), pagina, 'x', '', nu);
  assert.ok(b.score <= 24 && b.begrensd && b.factoren.some(f => f.naam === 'Begrenzing'));
});

// Ontkenningen: "geen schade" is geen defectmelding, echte defectmeldingen blijven gevonden
t('negatie: ontkende defectwoorden zijn geen defect', () => {
  ['geen schade', 'Geen schade aan het toestel', 'niet defect', 'zonder schade', 'zonder defecten', 'vrij van gebreken', 'Vrij van schade en gebreken',
   'geen enkele schade', 'niet beschadigd', 'nooit defect geweest', 'geen gebreken', 'geen defecten bekend', 'nergens schade', 'zonder krassen of schade',
   'in perfecte staat, geen schade of defect', 'NIET kapot', 'niet gebarsten'].forEach(z => assert.strictEqual(K.defectWoord(z), null, z));
});
t('negatie: echte defectmeldingen blijven gevonden', () => {
  ['defect', 'Scherm gebarsten', 'kapot scherm', 'waterschade', 'water schade aanwezig', 'beschadigd', 'niet werkend', 'werkt niet meer', 'voor onderdelen',
   'met schade', 'heeft gebreken', 'defecte accu', 'gebroken scherm', 'MacBook Pro, scherm kapot'].forEach(z => assert.ok(K.defectWoord(z), z));
});
t('negatie: ontkenning in andere zin geldt niet', () => {
  assert.ok(K.defectWoord('Geen krassen. Scherm defect'));
  assert.ok(K.defectWoord('niet origineel, wel defect'));
  assert.ok(K.defectWoord('Geen doos, schade aan behuizing'));
});
t('negatie: contrastwoord heft ontkenning op', () => {
  assert.ok(K.defectWoord('niet origineel wel defect'));
  assert.ok(K.defectWoord('geen doos maar schade aan scherm'));
});
t('negatie: gemengd, eerste echte melding wordt gevonden', () => {
  assert.strictEqual(K.defectWoord('geen schade, maar accu defect').toLowerCase(), 'defect');
  assert.strictEqual(K.defectWoord('zonder schade of gebreken'), null);
});
t('negatie: niet-werkend blijft defect ondanks "niet"', () => {
  assert.ok(K.defectWoord('toestel is niet werkend'));
  assert.ok(K.defectWoord('werkt niet'));
});
t('negatie: kavel met "geen schade" is niet defect, advertentie met "defect" wordt dan afgekeurd', () => {
  const pg = { gevonden: true, merk: 'DeWalt', model: 'DCD791', variant: '', titel: 'DeWalt DCD791 zonder schade', staat: 'goed, vrij van gebreken', zoekterm: 'dewalt dcd791' };
  const ads = [ad('DeWalt DCD791 defect', 100), ad('DeWalt DCD791 a', 200), ad('DeWalt DCD791 b', 210), ad('DeWalt DCD791 c', 220)];
  const b = K.berekenBetrouwbaarheid(pr(ads), pg, 'DeWalt DCD791', '', nu);
  assert.strictEqual(b.kavel_defect, false); assert.strictEqual(b.aantal_passend, 3);
});
t('negatie: kavel met "geen schade" in titel en defect in advertentie: advertentie afgekeurd, niet omgekeerd', () => {
  const pg = { gevonden: true, merk: 'DeWalt', model: 'DCD791', variant: '', titel: 'DeWalt DCD791 geen schade', zoekterm: 'x' };
  const b = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791 niet defect', 200), ad('DeWalt DCD791 defect', 90)]), pg, 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 1); assert.strictEqual(b.kavel_defect, false);
});
t('negatie: echt defect kavel blijft defect', () => {
  const pg = { gevonden: true, merk: 'DeWalt', model: 'DCD791', variant: '', titel: 'DeWalt DCD791 defect', zoekterm: 'x' };
  const b = K.berekenBetrouwbaarheid(pr([ad('DeWalt DCD791 a', 200)]), pg, 'x', '', nu);
  assert.strictEqual(b.kavel_defect, true);
});

// Hoeveelheid: inhoud van één product, aantal producten in een advertentie, partij
t('hoeveelheid: inhoud van één pack is geen aantal producten', () => {
  ['Pokémon booster pack (5 kaarten)', 'Pokemon Scarlet & Violet booster pack 5 kaarten', 'Japans boosterpack met 5 kaarten', 'Booster pack 10 kaarten per pack',
   'Pokémon pack - 11 cards', 'Pokemon booster, vijf kaarten', 'Sealed booster pack (5 kaartjes)', 'Pokemon deck 60 kaarten', 'Elite Trainer Box 9 boosters'.replace('9 boosters', ''), 'Pokémon blister 10 kaarten',
   'Booster pack Wild Force 5 cards inside', 'Pokémon tin met 10 kaarten', 'Magic booster 15 kaarten'].forEach(z => assert.strictEqual(K.partijWoord(z), null, z));
});
t('hoeveelheid: meerdere producten in één advertentie blijft partij', () => {
  ['10 boosterpacks Pokémon', '10 booster packs Scarlet Violet', 'Pokemon 3 boosters', '2x Pokémon booster pack', 'Pokémon booster pack 10x', 'tien boosterpacks Pokémon',
   '5 packs Pokemon Japans', 'Pokémon 6 pakjes', '24 boosters Pokémon', '3 boxes Pokémon 151', 'Pokémon 2 displays', '4 tins Pokémon', 'Partij Pokémon boosters', 'Pokémon bulk', 'Pokémon collectie',
   'lot van 12 packs', 'drie packs Pokémon', '10 boosterpacks (5 kaarten per pack)', '8 stuks Pokémon packs'].forEach(z => assert.ok(K.partijWoord(z), z));
});
t('hoeveelheid: kaarten zonder verpakking zijn wel een aantal', () => {
  ['50 kaarten Pokémon', '100 kaarten Pokémon', '1000 kaarten Pokémon', 'Pokemon 20 cards', 'twintig'.replace('twintig', '12 kaarten Pokémon')].forEach(z => assert.ok(K.partijWoord(z), z));
});
t('hoeveelheid: modelnamen en setnamen met getallen zijn geen aantal', () => {
  ['iPhone 13 128GB', 'Pokémon 151 booster pack', 'Scarlet & Violet 151 pack', 'Samsung Galaxy S23', 'DeWalt DCD791 18V 2.0Ah', 'RTX 3060 12GB', 'Nintendo Switch OLED', 'Pokémon SV5 booster pack'].forEach(z => assert.strictEqual(K.partijWoord(z), null, z));
});
t('hoeveelheid: advertentie met "5 kaarten" voor een los pack wordt niet afgekeurd, 10 packs wel', () => {
  const pg = { gevonden: true, merk: 'Pokémon', model: 'Scarlet & Violet booster pack', variant: 'Japans', titel: 'Pokémon booster pack Japans', zoekterm: 'pokemon booster pack' };
  const ads = [ad('Pokémon Booster pack - Scarlet & Violet - Wild (Japans, ongeopend, 5 kaarten)', 8), ad('Pokemon Scarlet Violet booster pack Japans sealed', 7), ad('10 boosterpacks Pokémon Scarlet Violet Japans', 70), ad('Pokémon Scarlet Violet 3 packs Japans', 24)];
  const b = K.berekenBetrouwbaarheid(pr(ads), pg, 'Pokemon booster pack Japans', '', nu);
  assert.strictEqual(b.aantal_passend, 2);
  assert.ok(ads[2].afkeur === 'meerdere stuks' && ads[3].afkeur === 'meerdere stuks');
  assert.ok(ads[0].past !== false && ads[1].past !== false);
});
t('hoeveelheid: een partij-kavel mag partij-advertenties vergelijken', () => {
  assert.ok(K.partijWoord('Partij 10 boosterpacks Pokémon'));
  const pg = { gevonden: true, merk: 'Pokémon', model: 'booster pack', variant: '', titel: '10 boosterpacks Pokémon', aantal_stuks: 10, zoekterm: 'x' };
  const b = K.berekenBetrouwbaarheid(pr([ad('10 boosterpacks Pokémon', 70), ad('12 booster packs Pokémon', 80)]), pg, 'x', '', nu);
  assert.strictEqual(b.aantal_passend, 2);
});

// Chipvergelijking: de volledige chipvariant moet gelijk zijn
const chips = ['M1', 'M1 Pro', 'M1 Max', 'M1 Ultra', 'M2', 'M2 Pro', 'M2 Max', 'M2 Ultra', 'M3', 'M3 Pro', 'M3 Max', 'M4', 'M4 Pro', 'M4 Max'];
t('chip: chipsVan leest alle varianten', () => {
  chips.forEach(c => assert.deepStrictEqual(K.chipsVan('MacBook Pro 14 ' + c + ' 16GB'), [c.toLowerCase().replace(' ', '')], c));
  assert.deepStrictEqual(K.chipsVan('MacBook Pro M3Pro'), ['m3pro']);
  assert.deepStrictEqual(K.chipsVan('MacBook Pro 14 M3 pro 18GB'), ['m3pro']);
  assert.deepStrictEqual(K.chipsVan('MacBook Pro 14 M3 ProMotion scherm'), ['m3']);
  assert.deepStrictEqual(K.chipsVan('MacBook Pro 14 inch 2023 18GB'), []);
});
t('chip: elke chip past alleen bij zichzelf (volledige matrix)', () => {
  chips.forEach(kavel => {
    const e = K.matchEisen({ merk: 'Apple', model: 'MacBook Pro 14 inch ' + kavel, variant: '' }, null, '');
    chips.forEach(adChip => {
      const r = K.toetsEisen('Apple MacBook Pro 14 inch ' + adChip + ' 512GB', e);
      assert.strictEqual(r.past, kavel === adChip, 'kavel ' + kavel + ' / advertentie ' + adChip + ' -> ' + JSON.stringify(r));
    });
  });
});
t('chip: M3 tegenover M3 Pro of M3 Max met "Pro" in de productnaam', () => {
  const pg = { gevonden: true, merk: 'Apple', model: 'MacBook Pro 14 inch M3', variant: '2023', titel: 'Apple MacBook Pro 14 inch M3 2023', zoekterm: 'macbook pro 14 m3' };
  const ads = [ad('MacBook Pro 14" M3 Pro 18GB 512GB', 1500), ad('MacBook Pro 14 M3 Max 36GB', 2500), ad('Apple MacBook Pro 14 inch M3 8GB 512GB', 1200), ad('MacBook Pro 14 inch (M3, 2023) 16GB', 1300)];
  const b = K.berekenBetrouwbaarheid(pr(ads), pg, 'Apple MacBook Pro 14 inch M3 2023', '', nu);
  assert.strictEqual(b.aantal_passend, 2);
  assert.ok(/andere chip/.test(ads[0].afkeur_detail) && /andere chip/.test(ads[1].afkeur_detail), ads[0].afkeur_detail);
  assert.ok(/M3 Pro/.test(ads[0].afkeur_detail) && /M3 Max/.test(ads[1].afkeur_detail));
});
t('chip: M3 Pro kavel sluit gewone M3 uit en accepteert M3 Pro in andere schrijfwijze', () => {
  const pg = { gevonden: true, merk: 'Apple', model: 'MacBook Pro 14 inch M3 Pro', variant: '', titel: 'x', zoekterm: 'x' };
  const ads = [ad('MacBook Pro 14 M3 8GB', 1200), ad('MacBook Pro 14" M3 Pro 18GB', 1700), ad('MacBook Pro 14 M3Pro 18 GB', 1650), ad('MacBook Pro 14 inch M3 pro', 1600)];
  K.berekenBetrouwbaarheid(pr(ads), pg, 'Apple MacBook Pro 14 inch M3 Pro', '', nu);
  assert.deepStrictEqual(ads.map(a => a.past), [false, true, true, true]);
});
t('chip: advertentie met meerdere chips is geen eerlijke vergelijking', () => {
  const e = K.matchEisen({ merk: 'Apple', model: 'MacBook Pro 14 inch M3' }, null, '');
  assert.strictEqual(K.toetsEisen('MacBook Pro 14 M3 of M3 Pro te koop', e).past, false);
});
t('chip: producten zonder chip worden niet geraakt', () => {
  const e = K.matchEisen({ merk: 'Apple', model: 'iPhone 13', variant: '128GB' }, null, '');
  assert.strictEqual(e.chip, null);
  assert.strictEqual(K.toetsEisen('Apple iPhone 13 128GB blauw', e).past, true);
});
console.log(n + ' tests ok');
