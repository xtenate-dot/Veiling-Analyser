// Maakt een leesbaar testrapport (markdown) uit de ruwe resultaten van run.mjs.
// Gebruik: node tests/testset/rapport.mjs resultaat.json > rapport.md
import { readFileSync } from 'node:fs';
const invoer = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const data = invoer.resultaten;
const eur = n => n == null ? '-' : '€' + Math.round(n);
const usd = n => n == null ? '-' : '$' + n.toFixed(3);
// A: herkend + voldoende, B: herkend maar onvoldoende terwijl er advertenties zijn gevonden (afgekeurd), C: verkeerd herkend, D: onvoldoende omdat er niets te vinden was
function klasse(r) {
  if (r.fout) return 'F';
  if (r.live === false) return 'Z';
  if (r.herkend.ai_naam_klopt === false) return 'C';
  if (r.betrouwbaarheid.niveau !== 'onvoldoende') return 'A';
  return r.vergelijkbaar.length ? 'B' : 'D';
}
const NAAM = { A: 'Herkend, voldoende vergelijkingen', B: 'Herkend, onvoldoende (advertenties gevonden maar afgekeurd)', C: 'Verkeerd herkend', D: 'Onvoldoende (niets gevonden)', F: 'Mislukt', Z: 'Zonder live zoeken' };
const modellen = [...new Set(data.map(r => r.model))];
const o = [];
o.push('# Testrapport fase 2\n');
o.push('> **Waarschuwing: dit is een test met alleen een productnaam als invoer.** Dat is niet hetzelfde als herkenning vanaf een echte veilingpagina of foto. Dit rapport zegt dus niets over hoe goed kavelpagina\'s of foto\'s worden gelezen; daarvoor zijn echte kavellinks of foto\'s nodig.\n');
if (invoer.mock) o.push('> **Dit is een droogloop met nagebootste antwoorden. Niet gebruiken voor de kwaliteitsbeoordeling.**\n');
o.push('## Volledigheid van de run\n');
const fouten = data.filter(r => r.fout), zonderLive = data.filter(r => r.live === false), ontbreekt = invoer.verwacht_aantal - data.length;
o.push('- Verwacht: ' + invoer.verwacht_aantal + ' analyses (' + invoer.modellen.join(' en ') + ' x ' + invoer.producten.join(', ') + '); uitgevoerd: ' + data.length + '.');
o.push('- Mislukt: ' + fouten.length + (fouten.length ? ' (' + fouten.map(r => r.id + ' ' + r.model + ': ' + r.fout).join('; ') + ')' : '') + '.');
o.push('- Niet uitgevoerd: ' + Math.max(0, ontbreekt) + (invoer.gestopt ? ' (' + invoer.gestopt + ')' : '') + '.');
o.push('- Zonder live zoeken (het model schatte zonder internet): ' + zonderLive.length + (zonderLive.length ? ' (' + zonderLive.map(r => r.id + ' ' + r.model).join(', ') + '). Deze tellen niet mee voor de kwaliteitsbeoordeling.' : '.'));
const zonderZoek = data.filter(r => !r.fout && r.telling && r.telling.zoekopdrachten === 0 && r.live !== false);
o.push('- Analyses zonder enige zoekopdracht: ' + zonderZoek.length + '.');
const kv = data.filter(r => r.waarschuwing_kosten);
o.push('- Analyses waarbij twee onafhankelijke kostenoptellingen verschillen: ' + kv.length + (kv.length ? ' (' + kv.map(r => r.id + ' ' + r.model + ': ' + r.waarschuwing_kosten).join('; ') + ')' : '') + '.');
const meer = data.filter(r => r.telling && (r.telling.verzoeken > 2 || r.telling.zoekopdrachten > 1 || r.telling.herhalingen > 0));
o.push('- Analyses met extra verzoeken, meer dan 1 zoekopdracht of herhalingen na een fout: ' + meer.length + (meer.length ? ' (' + meer.map(r => r.id + ' ' + r.model + ': ' + r.telling.verzoeken + ' verzoeken, ' + r.telling.zoekopdrachten + ' zoekopdrachten, ' + r.telling.herhalingen + ' herhalingen').join('; ') + ')' : '') + '.\n');
const metFouten = data.filter(r => r.boekhouding && r.boekhouding.fouten && r.boekhouding.fouten.length);
o.push('- API-fouten tijdens analyses (ook van pogingen die daarna herstelden): ' + metFouten.reduce((a, r) => a + r.boekhouding.fouten.length, 0) + (metFouten.length ? ' (' + metFouten.map(r => r.id + ' ' + r.model + ': ' + r.boekhouding.fouten.map(f => (f.status || f.soort) + ' "' + String(f.melding).replace(/\|/g, '/') + '"').join(', ')).join('; ') + ')' : '') + '.');
const gefaaldZoek = data.filter(r => (r.zoeklog || []).some(z => z.fout));
o.push('- Analyses met een mislukte zoek- of ophaalopdracht (fout van de zoekdienst, iets anders dan zoeken zonder resultaat): ' + gefaaldZoek.length + (gefaaldZoek.length ? ' (' + gefaaldZoek.map(r => r.id + ' ' + r.model + ': ' + r.zoeklog.filter(z => z.fout).map(z => z.soort + ' ' + z.fout).join(', ')).join('; ') + ')' : '') + '.');
const leegZoek = data.filter(r => (r.zoeklog || []).some(z => z.soort === 'zoeken' && z.resultaten === 0));
o.push('- Analyses met een geslaagde zoekopdracht zonder resultaten: ' + leegZoek.length + '.');
const tweede = data.filter(r => r.tweede_ronde);
o.push('- Analyses met een tweede zoekronde: ' + tweede.length + (tweede.length ? ' (' + tweede.map(r => r.id + ' ' + r.model + ': ' + (r.tweede_ronde_info || ('mislukt: ' + r.tweede_ronde_fout))).join('; ') + ')' : '') + '.');
const overgeslagen = data.filter(r => r.tweede_ronde_overgeslagen);
if (overgeslagen.length) o.push('- Tweede ronde overgeslagen wegens kostenbudget: ' + overgeslagen.map(r => r.id + ' ' + r.model + ' (' + r.tweede_ronde_overgeslagen + ')').join('; ') + '.');
o.push('Alle kosten zijn gemeten uit de API-gegevens. De klassen B en D zijn een automatische indeling; of een afkeuring terecht was moet per product met de lijst van vergelijkingen worden nagekeken.\n');
o.push('## Samenvatting per model\n');
o.push('| Model | Producten | A | B | C | D | Zonder live zoeken | Mislukt | Met referentie | Mediane afwijking | Gem. kosten | Hoogste kosten |\n|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const m of modellen) {
  const r = data.filter(x => x.model === m), k = {}; r.forEach(x => { const c = klasse(x); k[c] = (k[c] || 0) + 1; });
  const met = r.filter(x => x.afwijking_pct != null), afw = met.map(x => Math.abs(x.afwijking_pct)).sort((a, b) => a - b);
  const kosten = r.map(x => x.kosten_usd || 0);
  o.push(`| ${m} | ${r.length} | ${k.A || 0} | ${k.B || 0} | ${k.C || 0} | ${k.D || 0} | ${k.Z || 0} | ${k.F || 0} | ${met.length} | ${afw.length ? afw[Math.floor(afw.length / 2)] + '%' : 'geen referenties'} | ${usd(kosten.reduce((a, b) => a + b, 0) / (kosten.length || 1))} | ${usd(Math.max(0, ...kosten))} |`);
}
o.push('\nZ = zoeken lukte niet, het model schatte zonder internet (niet bruikbaar). A = herkend en voldoende vergelijkingen (er is advies). B, D = geen advies. C = AI interpreteerde de productnaam verkeerd.\n');
o.push('## Per product\n');
const ids = [...new Set(data.map(r => r.id))];
for (const id of ids) {
  const rs = data.filter(r => r.id === id), eerste = rs[0];
  o.push(`### ${id} · ${eerste.categorie} · ${eerste.invoer}\n`);
  const ref = rs.find(r => r.referentie); o.push('Referentie: ' + (ref ? eur(ref.referentie) : 'nog niet ingevuld') + '\n');
  o.push('| Model | Herkend als | Klasse | Niveau (indicatiescore) | Waarde laag / waarschijnlijk / hoog | Advies | Max bod | Kosten | Afwijking |\n|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    if (r.fout) { o.push(`| ${r.model} | - | F | - | - | - | - | ${usd(r.kosten_usd)} | MISLUKT: ${r.fout}${r.boekhouding && r.boekhouding.fouten.length ? ' (API: ' + r.boekhouding.fouten.map(f => f.melding).join(', ') + ')' : ''} |`); continue; }
    o.push(`| ${r.model} | ${r.ai_productnaam || '-'} | ${klasse(r)} | ${r.betrouwbaarheid.niveau} (${r.betrouwbaarheid.score}) | ${eur(r.waarde.laag)} / ${eur(r.waarde.waarschijnlijk)} / ${eur(r.waarde.hoog)} | ${r.waarde.getoond ? 'ja' : 'onvoldoende gemeld'} | ${eur(r.max_bod)} | ${usd(r.kosten_usd)} (${r.telling.verzoeken} verzoeken, ${r.telling.zoekopdrachten} zoekopdr.${r.live ? '' : ', ZONDER LIVE ZOEKEN'}) | ${r.afwijking_pct == null ? '-' : r.afwijking_pct + '%'} |`);
  }
  invoer.modellen.filter(m => !rs.some(r => r.model === m)).forEach(m => o.push(`| ${m} | NIET UITGEVOERD | - | - | - | - | - | - | - |`));
  for (const r of rs.filter(x => !x.fout)) {
    const bt = r.betrouwbaarheid;
    o.push(`\n${r.model}: kavel als defect gelezen: ${bt.kavel_defect ? 'ja ("' + bt.kavel_defect_woord + '")' : 'nee'}; modeljaar als eis: ${bt.jaar_eis || 'geen'}; score ${bt.score}${bt.begrensd ? ' (te weinig of niet bruikbaar bewijs: maximaal 24)' : ''}.`);
    if (bt.niveau === 'onvoldoende') o.push(`Reden onvoldoende: ${bt.reden || '-'}${bt.weigerreden ? ' [weigerregel: ' + bt.weigerreden + ']' : ''}`);
    // Diagnose van "link bevestigd": welke webadressen heeft het model gezien en hoe verhouden de advertentielinks zich daartoe?
    const bronnen = (r.ruw && r.ruw.prijzen && r.ruw.prijzen.bronnen) || [];
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return '?'; } };
    const hosts = {}; bronnen.forEach(b => hosts[host(b.url)] = (hosts[host(b.url)] || 0) + 1);
    const metUrl = r.vergelijkbaar.filter(a => a.url), zonderUrl = r.vergelijkbaar.length - metUrl.length;
    o.push(`Links: ${metUrl.filter(a => a.bevestigd).length} van ${metUrl.length} advertenties met link bevestigd; ${zonderUrl} zonder link. Het model zag ${bronnen.length} webadressen: ${Object.entries(hosts).map(([h, n]) => h + ' (' + n + ')').join(', ') || 'geen'}.`);
    metUrl.filter(a => !a.bevestigd).slice(0, 4).forEach(a => {
      const zelfde = bronnen.filter(b => host(b.url) === host(a.url));
      o.push(`- Niet bevestigd: ${a.url} | webadressen van dezelfde site die het model zag: ${zelfde.length}${zelfde.length ? ' (bijvoorbeeld ' + zelfde.slice(0, 2).map(b => b.url).join(' ; ') + ')' : ''}`);
    });
    const zl = r.zoeklog || [];
    o.push(`\n${r.model}: zoeklog (${zl.length} opdrachten): ` + (zl.length ? zl.map(z => (z.ronde ? 'ronde ' + z.ronde + ' ' : '') + z.soort + ' "' + String(z.vraag || z.url || '').slice(0, 60) + '" ' + (z.fout ? 'FOUT ' + z.fout : z.ok ? 'ok' : z.resultaten + ' resultaten')).join('; ') : 'geen zoekopdrachten') + '.');
    if (r.tweede_ronde) o.push(`Tweede ronde: ${r.tweede_ronde_info || 'mislukt: ' + r.tweede_ronde_fout}.`);
    if (r.onderbroken) o.push(`Zoekronde onderbroken door API-fout: ${r.onderbroken}.`);
    if (r.boekhouding) o.push(`Kosten: boekhouding ${usd(r.boekhouding.usd)} over ${r.boekhouding.verzoeken} verzoeken en ${r.boekhouding.zoekopdrachten} zoekopdrachten; onafhankelijke telling ${usd(r.kosten_controle_usd)}${r.boekhouding.fouten.length ? '; API-fouten: ' + r.boekhouding.fouten.map(f => (f.status || f.soort) + ' ' + f.melding).join(', ') : ''}.`);
    o.push(`\n${r.model}: ${r.vergelijkbaar.length} gevonden, ${r.betrouwbaarheid.passend} passend volgens de code, ${r.betrouwbaarheid.verkocht} verkocht.`);
    if (r.vergelijkbaar.length) {
      o.push('\n| Titel | Staat (volgens het model) | Soort | Prijs | Platform | Datum | Link bevestigd | Past (code) | Reden en detail van afkeuring |\n|---|---|---|---|---|---|---|---|---|');
      r.vergelijkbaar.forEach(a => o.push(`| ${String(a.titel).replace(/\|/g, '/')} | ${String(a.staat || '').replace(/\|/g, '/') || '-'} | ${a.soort} | ${eur(a.prijs)} | ${a.platform} | ${a.datum || '?'} | ${a.bevestigd ? 'ja' : 'nee'} | ${a.past === true ? 'ja' : a.past === false ? 'nee' : 'n.v.t.'} | ${a.afkeur ? a.afkeur + (a.afkeur_detail ? ': ' + String(a.afkeur_detail).replace(/\|/g, '/') : '') : ''} |`));
    }
  }
  o.push('');
}
console.log(o.join('\n'));
