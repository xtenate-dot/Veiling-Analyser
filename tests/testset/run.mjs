// Meetscript: draait de testset door de echte analyse en legt per product de 8 gevraagde gegevens vast.
// Gebruik:  ANTHROPIC_API_KEY=sk-ant-... node tests/testset/run.mjs --model haiku|sonnet|both [--limit 5] [--uit uitvoer.json]
//           node tests/testset/run.mjs --mock      (droogloop met nagebootst antwoord, kost niets)
// De kosten die hier staan zijn GEMETEN: ze komen uit de usage-gegevens van de API-antwoorden en de officiële prijslijst (kern.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.global = globalThis;
require('../../kern.js');
const K = globalThis.VAKern;
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const MODELLEN = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5' };
const mock = !!arg('mock', false);
const keuze = mock ? 'haiku' : arg('model', 'both');
const lijst = keuze === 'both' ? ['haiku', 'sonnet'] : [keuze];
const set = JSON.parse(readFileSync(new URL('./producten.json', import.meta.url))).producten.slice(0, Number(arg('limit', 30)));
const TARIEF = { opgeld: 0.18, btw: 0.21, vast: 0, regeling: 'volledig' }; // rekenaanname voor het maximaal bod
const DOEL = 0.20;
if (!mock && !process.env.ANTHROPIC_API_KEY) { console.error('Zet ANTHROPIC_API_KEY, of gebruik --mock voor een droogloop.'); process.exit(1); }

async function anthropic(body) {
  if (mock) return { id: 'm', type: 'message', role: 'assistant', stop_reason: 'end_turn', usage: { input_tokens: 20000, output_tokens: 800, server_tool_use: { web_search_requests: 1 } }, content: [{ type: 'text', text: JSON.stringify({ productnaam: 'Mock', tweedehands: [{ platform: 'Marktplaats', titel: 'Mock 100', prijs: 100, soort: 'vraagprijs', url: null }], marktplaats: { laag: 80, gemiddeld: 100, hoog: 120, vertrouwen: 'hoog' }, toelichting: 'mock' }) }] };
  for (let poging = 0; poging < 3; poging++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (r.ok && j && !j.error) return j;
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 4000 * (poging + 1))); continue; }
    throw K.apiFout(j, r.status);
  }
  throw new Error('API niet bereikbaar');
}

const uit = [];
for (const naam of lijst) {
  for (const p of set) {
    const t0 = Date.now();
    let rec = { id: p.id, categorie: p.categorie, invoer: p.invoer, model: MODELLEN[naam] };
    try {
      const res = await K.analyseer({ url: '', extra: p.invoer, hergebruik: false }, { anthropic, modelPagina: MODELLEN.haiku, modelPrijzen: MODELLEN[naam], cacheLees: null, cacheSchrijf: null });
      const pr = res.prijzen, b = pr.betrouwbaarheid, mp = pr.marktplaats;
      const gem = b.niveau === 'onvoldoende' ? null : mp.gemiddeld;
      const ref = p.referentie && p.referentie.verkoopprijs_eur;
      Object.assign(rec, {
        // 1 herkenning, 2 vergelijkbare producten, 3 waardebereik, 4 betrouwbaarheid, 5 maximaal bod, 6 kosten, 7 onderbouwing, 8 afwijking van de referentie
        herkend: { naam: res.herkenning.naam, zekerheid: res.herkenning.zekerheid, merk_klopt: p.verwacht_merk ? (res.product + ' ' + (res.herkenning.merk || '')).toLowerCase().includes(p.verwacht_merk.toLowerCase()) : null },
        vergelijkbaar: pr.tweedehands.map(a => ({ titel: a.titel, prijs: a.prijs, soort: a.soort, platform: a.platform, datum: a.datum, url: a.url, bevestigd: a.bevestigd, past: a.past })),
        waarde: { laag: mp.laag, waarschijnlijk: mp.gemiddeld, hoog: mp.hoog, getoond: gem != null },
        betrouwbaarheid: { niveau: b.niveau, score: b.score, ai_zei: mp.vertrouwen_ai, passend: b.aantal_passend, verkocht: b.aantal_verkocht },
        max_bod: gem ? Math.floor(K.bodVoorTotaal(gem * (1 - DOEL), TARIEF)) : null,
        kosten_usd: res.usd, tweede_ronde: !!pr.tweede_ronde, zoekopdrachten: (pr.zoekvragen || []).length,
        onderbouwing: pr.toelichting,
        referentie: ref || null, afwijking_pct: ref && mp.gemiddeld ? Math.round((mp.gemiddeld - ref) / ref * 100) : null,
        seconden: Math.round((Date.now() - t0) / 100) / 10
      });
    } catch (e) { rec.fout = String(e.message || e).slice(0, 200); rec.kosten_usd = e.usd || null; }
    uit.push(rec);
    console.log(naam, p.id, rec.fout ? 'FOUT ' + rec.fout : rec.betrouwbaarheid.niveau + ' ' + (rec.waarde.waarschijnlijk || '-') + ' $' + (rec.kosten_usd || 0).toFixed(4));
  }
}
const bestand = arg('uit', mock ? '/tmp/testset-mock.json' : 'tests/testset/resultaat-' + new Date().toISOString().slice(0, 10) + '.json');
writeFileSync(bestand, JSON.stringify(uit, null, 1));
// Samenvatting per model
for (const naam of lijst) {
  const r = uit.filter(x => x.model === MODELLEN[naam] && !x.fout);
  const kosten = r.map(x => x.kosten_usd || 0), met = r.filter(x => x.referentie);
  const niv = {}; r.forEach(x => niv[x.betrouwbaarheid.niveau] = (niv[x.betrouwbaarheid.niveau] || 0) + 1);
  console.log('\n' + MODELLEN[naam] + ': ' + r.length + ' gelukt, ' + (uit.filter(x => x.model === MODELLEN[naam]).length - r.length) + ' mislukt');
  console.log('  gemeten kosten gemiddeld $' + (kosten.reduce((a, b) => a + b, 0) / (kosten.length || 1)).toFixed(4) + ', hoogste $' + Math.max(0, ...kosten).toFixed(4));
  console.log('  betrouwbaarheid door de code: ' + JSON.stringify(niv));
  console.log('  met referentieprijs: ' + met.length + (met.length ? ', mediane afwijking ' + Math.round(met.map(x => Math.abs(x.afwijking_pct)).sort((a, b) => a - b)[Math.floor(met.length / 2)]) + '%' : ' (nog niets te vergelijken: vul referenties in)'));
}
console.log('\nUitvoer: ' + bestand);
