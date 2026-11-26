// Maakt een leesbaar testrapport (markdown) uit de ruwe resultaten van run.mjs.
// Gebruik: node tests/testset/rapport.mjs resultaat.json > rapport.md
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const eur = n => n == null ? '-' : '€' + Math.round(n);
const usd = n => n == null ? '-' : '$' + n.toFixed(3);
// A: herkend + voldoende, B: herkend maar onvoldoende terwijl er advertenties zijn gevonden (afgekeurd), C: verkeerd herkend, D: onvoldoende omdat er niets te vinden was
function klasse(r) {
  if (r.fout) return 'F';
  if (r.herkend.ai_naam_klopt === false) return 'C';
  if (r.betrouwbaarheid.niveau !== 'onvoldoende') return 'A';
  return r.vergelijkbaar.length ? 'B' : 'D';
}
const NAAM = { A: 'Herkend, voldoende vergelijkingen', B: 'Herkend, onvoldoende (advertenties gevonden maar afgekeurd)', C: 'Verkeerd herkend', D: 'Onvoldoende (niets gevonden)', F: 'Mislukt' };
const modellen = [...new Set(data.map(r => r.model))];
const o = [];
o.push('# Testrapport fase 2\n');
o.push('Alle kosten zijn gemeten uit de API-gegevens. De klassen B en D zijn een automatische indeling; of een afkeuring terecht was moet per product met de lijst van vergelijkingen worden nagekeken.\n');
o.push('## Samenvatting per model\n');
o.push('| Model | Producten | A | B | C | D | Mislukt | Met referentie | Mediane afwijking | Gem. kosten | Hoogste kosten |\n|---|---|---|---|---|---|---|---|---|---|---|');
for (const m of modellen) {
  const r = data.filter(x => x.model === m), k = {}; r.forEach(x => { const c = klasse(x); k[c] = (k[c] || 0) + 1; });
  const met = r.filter(x => x.afwijking_pct != null), afw = met.map(x => Math.abs(x.afwijking_pct)).sort((a, b) => a - b);
  const kosten = r.map(x => x.kosten_usd || 0);
  o.push(`| ${m} | ${r.length} | ${k.A || 0} | ${k.B || 0} | ${k.C || 0} | ${k.D || 0} | ${k.F || 0} | ${met.length} | ${afw.length ? afw[Math.floor(afw.length / 2)] + '%' : 'geen referenties'} | ${usd(kosten.reduce((a, b) => a + b, 0) / (kosten.length || 1))} | ${usd(Math.max(0, ...kosten))} |`);
}
o.push('\nA = herkend en voldoende vergelijkingen (er is advies). B, D = geen advies. C = AI interpreteerde de productnaam verkeerd.\n');
o.push('## Per product\n');
const ids = [...new Set(data.map(r => r.id))];
for (const id of ids) {
  const rs = data.filter(r => r.id === id), eerste = rs[0];
  o.push(`### ${id} · ${eerste.categorie} · ${eerste.invoer}\n`);
  const ref = rs.find(r => r.referentie); o.push('Referentie: ' + (ref ? eur(ref.referentie) : 'nog niet ingevuld') + '\n');
  o.push('| Model | Herkend als | Klasse | Niveau (score) | Waarde laag / waarschijnlijk / hoog | Advies | Max bod | Kosten | Afwijking |\n|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    if (r.fout) { o.push(`| ${r.model} | - | F | - | - | - | - | - | ${r.fout} |`); continue; }
    o.push(`| ${r.model} | ${r.ai_productnaam || '-'} | ${klasse(r)} | ${r.betrouwbaarheid.niveau} (${r.betrouwbaarheid.score}) | ${eur(r.waarde.laag)} / ${eur(r.waarde.waarschijnlijk)} / ${eur(r.waarde.hoog)} | ${r.waarde.getoond ? 'ja' : 'onvoldoende gemeld'} | ${eur(r.max_bod)} | ${usd(r.kosten_usd)} | ${r.afwijking_pct == null ? '-' : r.afwijking_pct + '%'} |`);
  }
  for (const r of rs.filter(x => !x.fout)) {
    o.push(`\n${r.model}: ${r.vergelijkbaar.length} gevonden, ${r.betrouwbaarheid.passend} passend volgens de code, ${r.betrouwbaarheid.verkocht} verkocht.`);
    if (r.vergelijkbaar.length) {
      o.push('\n| Titel | Soort | Prijs | Platform | Datum | Link bevestigd | Past (code) |\n|---|---|---|---|---|---|---|');
      r.vergelijkbaar.forEach(a => o.push(`| ${String(a.titel).replace(/\|/g, '/')} | ${a.soort} | ${eur(a.prijs)} | ${a.platform} | ${a.datum || '?'} | ${a.bevestigd ? 'ja' : 'nee'} | ${a.past === true ? 'ja' : a.past === false ? 'nee' : 'n.v.t.'} |`));
    }
  }
  o.push('');
}
console.log(o.join('\n'));
