// Meetscript: draait de testset door de echte analyse en legt per product de gevraagde gegevens vast.
//
// LET OP: dit is een test met alleen een PRODUCTNAAM als invoer. Dat is niet hetzelfde als herkenning vanaf een echte
// veilingpagina of foto. Het meet waardering, vergelijkingen, betrouwbaarheid en kosten, niet of een kavelpagina of foto goed wordt gelezen.
//
// Gebruik:  ANTHROPIC_API_KEY=... node tests/testset/run.mjs --model haiku|sonnet|both [--ids T01,T05 | --limit 3] [--uit bestand.json] [--max-usd 8]
//           node tests/testset/run.mjs --mock      (droogloop met nagebootst antwoord, kost niets, niet bruikbaar voor kwaliteitsbeoordeling)
// Kosten zijn GEMETEN: tokens en zoekopdrachten uit de usage-gegevens van elk API-antwoord × de officiële prijslijst (kern.js).
// Ze komen niet uit een schatting, maar zijn ook niet de factuur van Anthropic.
// Het script telt elk API-verzoek en elke zoekopdracht per analyse, zodat extra verzoeken (vervolgbeurten, tweede zoekronde) zichtbaar zijn.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.global = globalThis;
require('../../kern.js');
const K = globalThis.VAKern;
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const MODELLEN = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5' };
const mock = !!arg('mock', false);
const keuze = mock ? 'haiku' : arg('model', 'both');
if (!mock && keuze !== 'both' && !MODELLEN[keuze]) { console.error('--model moet haiku, sonnet of both zijn'); process.exit(1); }
const lijst = keuze === 'both' ? ['haiku', 'sonnet'] : [keuze];
const alle = JSON.parse(readFileSync(new URL('./producten.json', import.meta.url))).producten;
let set;
if (arg('ids', false) && arg('ids') !== true && arg('ids') !== 'alle') {
  const ids = String(arg('ids')).split(',').map(s => s.trim()).filter(Boolean);
  const onbekend = ids.filter(i => !alle.some(p => p.id === i));
  if (onbekend.length) { console.error('Onbekende producten: ' + onbekend.join(', ')); process.exit(1); }
  set = ids.map(i => alle.find(p => p.id === i));
} else {
  const n = Number(arg('limit', 30));
  if (!Number.isInteger(n) || n < 1 || n > 30) { console.error('--limit moet een geheel getal van 1 tot 30 zijn'); process.exit(1); }
  set = alle.slice(0, n);
}
const TARIEF = { opgeld: 0.18, btw: 0.21, vast: 0, regeling: 'volledig' }; // rekenaanname voor het maximaal bod
const DOEL = 0.20;
const MAX_USD = Number(arg('max-usd', 8));
const MAX_USD_ANALYSE = arg('max-usd-analyse', null) != null ? Number(arg('max-usd-analyse', null)) : undefined; // optioneel kostenbudget per analyse (bepaalt of een tweede zoekronde mag)
const SLEUTEL = process.env.ANTHROPIC_API_KEY || '';
if (!mock && !SLEUTEL) { console.error('Zet ANTHROPIC_API_KEY, of gebruik --mock voor een droogloop.'); process.exit(1); }
// Nooit een sleutel in uitvoer, logbestanden of resultaten
const schoon = t => { let s = String(t); if (SLEUTEL) s = s.split(SLEUTEL).join('[sleutel verborgen]'); return s.replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, '[sleutel verborgen]'); };
const log = (...a) => console.log(schoon(a.join(' ')));

const bestand = arg('uit', mock ? '/tmp/testset-mock.json' : 'tests/testset/resultaat-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
if (existsSync(bestand) || existsSync(bestand + 'l')) { console.error('Uitvoerbestand bestaat al; ik overschrijf geen bestaande resultaten: ' + bestand); process.exit(1); }
const regels = bestand + 'l'; // .jsonl: elk resultaat direct bewaard, ook als de run halverwege stopt

// Tellers per analyse: echte verzoeken, zoekopdrachten, tokens en pogingen na een fout
let tel;
const nieuweTel = () => ({ verzoeken: 0, zoekopdrachten: 0, fetches: 0, invoer: 0, uitvoer: 0, herhalingen: 0, usd: 0 });
async function anthropic(body) {
  if (mock) {
    tel.verzoeken++; tel.zoekopdrachten++; tel.usd += K.apiKostenVan(body.model, { input_tokens: 20000, output_tokens: 800, server_tool_use: { web_search_requests: 1 } });
    if (process.env.MOCK_FOUT) throw new Error('mock fout met ' + (SLEUTEL || 'sk-ant-api03-geheimgeheim'));
    return { id: 'm', type: 'message', role: 'assistant', stop_reason: 'end_turn', usage: { input_tokens: 20000, output_tokens: 800, server_tool_use: { web_search_requests: 1 } }, content: [{ type: 'text', text: JSON.stringify({ productnaam: 'Mock', tweedehands: [{ platform: 'Marktplaats', titel: 'Mock 100', prijs: 100, soort: 'vraagprijs', url: null }], marktplaats: { laag: 80, gemiddeld: 100, hoog: 120, vertrouwen: 'hoog' }, toelichting: 'mock' }) }] };
  }
  for (let poging = 0; poging < 3; poging++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(240000), headers: { 'content-type': 'application/json', 'x-api-key': SLEUTEL, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (r.ok && j && !j.error) {
      tel.verzoeken++; tel.usd += K.apiKostenVan(body.model, j.usage);
      const u = j.usage || {}, s = u.server_tool_use || {};
      tel.zoekopdrachten += s.web_search_requests || 0; tel.fetches += s.web_fetch_requests || 0;
      tel.invoer += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0); tel.uitvoer += u.output_tokens || 0;
      return j;
    }
    if (r.status === 429 || r.status >= 500) { tel.herhalingen++; await new Promise(s => setTimeout(s, 4000 * (poging + 1))); continue; }
    throw K.apiFout(j, r.status);
  }
  throw new Error('API niet bereikbaar na 3 pogingen');
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
log('TESTSET: alleen productnamen als invoer. Dit is NIET hetzelfde als herkenning vanaf een echte veilingpagina of foto.');
log('Modellen: ' + lijst.map(n => MODELLEN[n]).join(', ') + ' | producten: ' + set.map(p => p.id).join(',') + ' | zoeken: standaard max 1 opdracht per analyse, tweede ronde als de code minder dan 2 passende advertenties telt | budgetgrens $' + MAX_USD);
const uit = [];
let totaal = 0, gestopt = null;
buiten: for (const naam of lijst) {
  for (const p of set) {
    if (totaal >= MAX_USD) { gestopt = 'Budgetgrens van $' + MAX_USD + ' bereikt; de resterende analyses zijn niet uitgevoerd.'; break buiten; }
    const t0 = Date.now(); tel = nieuweTel();
    let rec = { id: p.id, categorie: p.categorie, invoer: p.invoer, model: MODELLEN[naam], mock: mock || undefined };
    try {
      const res = await K.analyseer({ url: '', extra: p.invoer, hergebruik: false }, { anthropic, modelPagina: MODELLEN.haiku, modelPrijzen: MODELLEN[naam], cacheLees: null, cacheSchrijf: null, maxUsdPerAnalyse: MAX_USD_ANALYSE });
      const pr = res.prijzen, b = pr.betrouwbaarheid, mp = pr.marktplaats;
      const gem = b.niveau === 'onvoldoende' ? null : mp.gemiddeld;
      const ref = p.referentie && p.referentie.verkoopprijs_eur;
      Object.assign(rec, {
        live: pr.live !== false, // false = zoeken lukte niet en het model schatte zonder internet: niet bruikbaar voor de kwaliteitsbeoordeling
        ai_productnaam: pr.productnaam,
        herkend: { naam: res.herkenning.naam, ai_naam_klopt: p.verwacht_model ? String(p.verwacht_model).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2).every(w => norm(pr.productnaam).includes(w)) : null, zekerheid: res.herkenning.zekerheid },
        vergelijkbaar: pr.tweedehands.map(a => ({ titel: a.titel, prijs: a.prijs, soort: a.soort, platform: a.platform, staat: a.staat, datum: a.datum, url: a.url, bevestigd: a.bevestigd, past: a.past, afkeur: a.afkeur || null, afkeur_detail: a.afkeur_detail || null })),
        waarde: { laag: mp.laag, waarschijnlijk: mp.gemiddeld, hoog: mp.hoog, getoond: gem != null },
        betrouwbaarheid: { niveau: b.niveau, score: b.score, ai_zei: mp.vertrouwen_ai, passend: b.aantal_passend, verkocht: b.aantal_verkocht, aantal_gevonden: b.aantal_gevonden, begrensd: b.begrensd, kavel_defect: b.kavel_defect, kavel_defect_woord: b.kavel_defect_woord, jaar_eis: b.jaar_eis, factoren: b.factoren },
        max_bod: gem ? Math.floor(K.bodVoorTotaal(gem * (1 - DOEL), TARIEF)) : null,
        kosten_usd: res.usd, // gemeten uit de usage van alle verzoeken van deze analyse (berekend door de analyse zelf)
        kosten_controle_usd: tel.usd, // tweede, onafhankelijke optelling per verzoek in dit script; moet gelijk zijn
        telling: Object.assign({}, tel), tweede_ronde: !!pr.tweede_ronde, hersteld: !!pr.hersteld,
        tweede_ronde_info: pr.tweede_ronde_info || null, tweede_ronde_overgeslagen: pr.tweede_ronde_overgeslagen || null, tweede_ronde_fout: pr.tweede_ronde_fout || null,
        onderbroken: pr.onderbroken || null, // zoekronde afgebroken door een API-fout; wat al gevonden was is nog gebruikt
        zoeklog: pr.zoeklog || [], boekhouding: res.boekhouding, // boekhouding: kosten, verzoeken en alle API-fouten (ook mislukte pogingen) van deze analyse
        onderbouwing: pr.toelichting, waarschuwingen: res.waarschuwingen,
        referentie: ref || null, afwijking_pct: ref && mp.gemiddeld ? Math.round((mp.gemiddeld - ref) / ref * 100) : null,
        seconden: Math.round((Date.now() - t0) / 100) / 10,
        ruw: res
      });
    } catch (e) { rec.fout = schoon(e.message || e).slice(0, 300); rec.kosten_usd = Math.max(tel.usd || 0, e.usd || 0) || null; rec.kosten_controle_usd = tel.usd; rec.boekhouding = e.boekhouding; rec.telling = Object.assign({}, tel); }
    if (rec.kosten_controle_usd != null && Math.abs(rec.kosten_controle_usd - rec.kosten_usd) > 0.0005) { rec.waarschuwing_kosten = 'De twee kostenoptellingen verschillen: ' + rec.kosten_usd + ' tegenover ' + rec.kosten_controle_usd; }
    totaal += Math.max(rec.kosten_usd || 0, tel.usd || 0);
    const tekst = schoon(JSON.stringify(rec));
    appendFileSync(regels, tekst + '\n');
    uit.push(JSON.parse(tekst));
    log(naam, p.id, rec.fout ? 'FOUT ' + rec.fout : (rec.live ? '' : 'ZONDER LIVE ZOEKEN ') + rec.betrouwbaarheid.niveau + ' ' + (rec.waarde.waarschijnlijk || '-') + ' $' + (rec.kosten_usd || 0).toFixed(4) + ' verzoeken ' + rec.telling.verzoeken + ' zoekopdrachten ' + rec.telling.zoekopdrachten + (rec.tweede_ronde ? ' | tweede ronde: ' + (rec.tweede_ronde_info || rec.tweede_ronde_fout) : '') + (rec.boekhouding && rec.boekhouding.fouten.length ? ' | API-fouten: ' + rec.boekhouding.fouten.map(f => f.melding).join('; ') : ''));
  }
}
const verwacht = lijst.length * set.length;
writeFileSync(bestand, JSON.stringify({ gemaakt: new Date().toISOString(), modellen: lijst.map(n => MODELLEN[n]), producten: set.map(p => p.id), verwacht_aantal: verwacht, uitgevoerd: uit.length, gestopt, mock: mock || undefined, resultaten: uit }, null, 1));
for (const naam of lijst) {
  const alles = uit.filter(x => x.model === MODELLEN[naam]), r = alles.filter(x => !x.fout), kosten = r.map(x => x.kosten_usd || 0);
  const niv = {}; r.forEach(x => niv[x.betrouwbaarheid.niveau] = (niv[x.betrouwbaarheid.niveau] || 0) + 1);
  log('\n' + MODELLEN[naam] + ': ' + r.length + ' gelukt, ' + (alles.length - r.length) + ' mislukt, ' + (set.length - alles.length) + ' niet uitgevoerd; zonder live zoeken: ' + r.filter(x => !x.live).length);
  log('  gemeten kosten gemiddeld $' + (kosten.reduce((a, b) => a + b, 0) / (kosten.length || 1)).toFixed(4) + ', hoogste $' + Math.max(0, ...kosten).toFixed(4));
  log('  betrouwbaarheid door de code: ' + JSON.stringify(niv));
}
if (gestopt) log('\n' + gestopt);
log('\nUitvoer: ' + bestand);
if (!mock && (uit.length < verwacht || uit.some(x => x.fout) || uit.some(x => x.live === false))) process.exitCode = 2; // zichtbaar als "mislukt" in GitHub, de resultaten blijven bewaard
