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
  assert.strictEqual(a.score, c.score); assert.strictEqual(a.niveau, 'laag');
});
t('verwachte prijs ver boven de gevonden prijzen kost punten', () => {
  const ads = [ad('DeWalt DCD791 a', 100), ad('DeWalt DCD791 b', 110), ad('DeWalt DCD791 c', 105)];
  const goed = K.berekenBetrouwbaarheid(pr(ads, { marktplaats: { gemiddeld: 100 } }), pagina, 'x', '', nu);
  const slecht = K.berekenBetrouwbaarheid(pr(ads, { marktplaats: { gemiddeld: 300 } }), pagina, 'x', '', nu);
  assert.ok(slecht.score === goed.score - 10, goed.score + ' vs ' + slecht.score);
});
t('oude advertenties verlagen de actualiteit', () => {
  const oud = new Date(nu - 400 * 864e5).toISOString().slice(0, 10);
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
console.log(n + ' tests ok');
