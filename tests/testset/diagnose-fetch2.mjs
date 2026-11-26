// Diagnose deel 2: (1) wat staat er precies in de robots.txt van eBay en bol.com over zoekpagina's, (2) werkt "zoeken en dan de gevonden advertentie openen" voor verkochte eBay-items,
// (3) welke andere bronnen voor verkochte of actuele prijzen zijn bereikbaar.
import { createRequire } from 'node:module';
globalThis.global = globalThis;
const require = createRequire(import.meta.url);
require('../../kern.js');
const K = globalThis.VAKern;
const SLEUTEL = process.env.ANTHROPIC_API_KEY;
if (!SLEUTEL) { console.error('Zet ANTHROPIC_API_KEY'); process.exit(1); }
const MODEL = 'claude-haiku-5-5';
const schoon = t => String(t).split(SLEUTEL).join('[sleutel verborgen]').replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, '[sleutel verborgen]');
let totaal = 0;
async function api(body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(180000), headers: { 'content-type': 'application/json', 'x-api-key': SLEUTEL, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) return { fout: schoon(JSON.stringify((j && j.error) || { status: r.status })).slice(0, 300) };
  totaal += K.apiKostenVan(body.model, j.usage);
  return j;
}
const WF = (extra) => Object.assign({ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 1, max_content_tokens: 12000 }, extra);
// 1. robots.txt volledig, daarna alleen de regels die zoekpagina's raken
for (const u of ['https://www.ebay.nl/robots.txt', 'https://www.ebay.com/robots.txt', 'https://www.bol.com/robots.txt']) {
  const j = await api({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: 'Open met web_fetch: ' + u }], tools: [WF()] });
  if (j.fout) { console.log('ROBOTS', u, 'FOUT', j.fout); continue; }
  const b = j.content.find(x => x.type === 'web_fetch_tool_result');
  const tekst = b && b.content && b.content.content && b.content.content.source ? String(b.content.content.source.data) : '';
  console.log('ROBOTS', u, tekst.length + ' tekens');
  // groepen per User-agent; toon alleen de groepen "*", Claude-achtige agents en de regels die /sch/ of zoeken raken
  const regels = tekst.split(/\r?\n/);
  let agent = '', uit = [];
  for (const r of regels) {
    const m = r.match(/^\s*user-agent:\s*(.+)$/i); if (m) { agent = m[1].trim(); if (/^\*$|claude|anthropic/i.test(agent)) uit.push('[' + agent + ']'); continue; }
    if (/^\s*(dis)?allow:/i.test(r) && (/^\*$|claude|anthropic/i.test(agent)) && /(sch|search|zoek|\/s\/|\/s\b|itm|LH_|_nkw|^\s*(dis)?allow:\s*\/\s*$)/i.test(r)) uit.push('  ' + r.trim());
  }
  console.log(uit.slice(0, 40).join('\n'));
}
// 2. zoeken en dan een gevonden eBay-advertentie openen (de URL komt dan uit een zoekresultaat en staat dus in de context)
const j2 = await api({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: 'Zoek een verkochte iPhone 13 128GB op eBay. Open daarna met web_fetch één van de gevonden eBay-advertenties en meld: prijs, of het item verkocht is, en de verkoopdatum. Zeg eerlijk als het openen niet lukte.' }],
  tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1, allowed_domains: ['ebay.com', 'ebay.nl'] }, WF({ max_uses: 2, max_content_tokens: 4000 })] });
if (j2.fout) console.log('ZOEK+OPEN FOUT', j2.fout); else {
  console.log('ZOEK+OPEN ophalen:', JSON.stringify(j2.content.filter(b => b.type === 'web_fetch_tool_result').map(b => b.content && b.content.type === 'web_fetch_result' ? { ok: true, url: b.content.url, begin: String((b.content.content && b.content.content.source && b.content.content.source.data) || '').slice(0, 400) } : { ok: false, fout: b.content && b.content.error_code })));
  console.log('ZOEK+OPEN antwoord:', schoon(j2.content.filter(b => b.type === 'text').map(b => b.text).join('')).slice(0, 700));
}
// 3. andere bronnen
const bronnen = [
  ['pricecharting (verkochte prijzen verzamelkaarten)', 'https://www.pricecharting.com/search-products?q=pokemon+scarlet+violet+booster&type=prices'],
  ['backmarket.nl (refurbished prijzen)', 'https://www.backmarket.nl/nl-nl/search?q=iphone%2013'],
  ['catawiki zoekpagina (gesloten loten)', 'https://www.catawiki.com/nl/s?q=iphone%2013'],
  ['tweakers pricewatch (nieuwprijs)', 'https://tweakers.net/pricewatch/zoeken/?keyword=iphone+13'],
  ['kieskeurig (nieuwprijs)', 'https://www.kieskeurig.nl/zoeken?q=iphone+13'],
  ['coolblue (nieuwprijs)', 'https://www.coolblue.nl/zoeken?query=iphone+13'],
  ['vinted (actuele vraagprijzen)', 'https://www.vinted.nl/catalog?search_text=iphone+13']
];
for (const [naam, url] of bronnen) {
  const j = await api({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: 'Open met web_fetch en meld in één zin of er prijzen van producten zichtbaar zijn: ' + url }], tools: [WF({ max_content_tokens: 4000 })] });
  if (j.fout) { console.log('BRON', naam, 'FOUT', j.fout); continue; }
  const r = j.content.filter(b => b.type === 'web_fetch_tool_result').map(b => b.content && b.content.type === 'web_fetch_result' ? { ok: true, lengte: String((b.content.content && b.content.content.source && b.content.content.source.data) || '').length, heeft_euro: /€\s?\d|\d\s?€|EUR/.test(String((b.content.content && b.content.content.source && b.content.content.source.data) || '')) } : { ok: false, fout: b.content && b.content.error_code });
  console.log('BRON', naam, JSON.stringify(r), '|', schoon(j.content.filter(b => b.type === 'text').map(b => b.text).join('')).slice(0, 160));
}
console.log('Totale kosten diagnose 2: $' + totaal.toFixed(4));
