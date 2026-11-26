// Diagnose: waarom geeft web_fetch 'url_not_allowed' op eBay en bol.com? Elk geval is één kleine Haiku-aanvraag met alleen het opgegeven hulpmiddel.
// Gebruik: ANTHROPIC_API_KEY=... node tests/testset/diagnose-fetch.mjs
// Het script toont alleen foutcodes en korte stukjes van openbare pagina's (robots.txt); de sleutel komt nergens in de uitvoer.
import { createRequire } from 'node:module';
globalThis.global = globalThis;
const require = createRequire(import.meta.url);
require('../../kern.js');
const K = globalThis.VAKern;
const SLEUTEL = process.env.ANTHROPIC_API_KEY;
if (!SLEUTEL) { console.error('Zet ANTHROPIC_API_KEY'); process.exit(1); }
const MODEL = 'claude-haiku-5-5';
const schoon = t => String(t).split(SLEUTEL).join('[sleutel verborgen]').replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, '[sleutel verborgen]');
const NIET = ['marktplaats.nl', '2dehands.be', '2ememain.be'];
let totaal = 0;
async function api(body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(120000), headers: { 'content-type': 'application/json', 'x-api-key': SLEUTEL, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) return { fout: schoon(JSON.stringify((j && j.error) || { status: r.status })).slice(0, 300) };
  totaal += K.apiKostenVan(body.model, j.usage);
  return j;
}
async function haal(naam, url, tool) {
  const body = { model: MODEL, max_tokens: 600, messages: [{ role: 'user', content: 'Open met web_fetch precies deze pagina en zeg in één zin of dat lukte: ' + url }], tools: [Object.assign({ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 1, max_content_tokens: 3000 }, tool)] };
  const j = await api(body);
  if (j.fout) return { naam, url, fout: j.fout };
  const res = j.content.filter(b => b.type === 'web_fetch_tool_result').map(b => b.content && b.content.type === 'web_fetch_result'
    ? { ok: true, tekst: robots(url) ? String((b.content.content && b.content.content.source && b.content.content.source.data) || '').slice(0, 2500) : String((b.content.content && b.content.content.title) || '').slice(0, 100) }
    : { ok: false, fout: b.content && (b.content.error_code || b.content.type) });
  return { naam, url, resultaat: res.length ? res : 'geen ophaalopdracht uitgevoerd', modelzegt: j.content.filter(b => b.type === 'text').map(b => b.text).join('').slice(0, 200) };
}
const robots = u => /robots\.txt$/.test(u);
const zonder = {}, onze = { blocked_domains: NIET };
const gevallen = [
  ['controle: wikipedia (moet lukken)', 'https://nl.wikipedia.org/wiki/IPhone_13', zonder],
  ['ebay.nl robots.txt', 'https://www.ebay.nl/robots.txt', zonder],
  ['ebay.com robots.txt', 'https://www.ebay.com/robots.txt', zonder],
  ['bol.com robots.txt', 'https://www.bol.com/robots.txt', zonder],
  ['ebay.nl startpagina', 'https://www.ebay.nl/', zonder],
  ['ebay.nl verkochte items (zonder onze filter)', 'https://www.ebay.nl/sch/i.html?_nkw=iphone%2013%20128gb&LH_Sold=1&LH_Complete=1', zonder],
  ['ebay.nl verkochte items (met onze filter)', 'https://www.ebay.nl/sch/i.html?_nkw=iphone%2013%20128gb&LH_Sold=1&LH_Complete=1', onze],
  ['ebay.com verkochte items', 'https://www.ebay.com/sch/i.html?_nkw=iphone+13+128gb&LH_Sold=1&LH_Complete=1', zonder],
  ['bol.com startpagina', 'https://www.bol.com/nl/nl/', zonder],
  ['bol.com zoekpagina (zonder onze filter)', 'https://www.bol.com/nl/nl/s/?searchtext=iphone%2013', zonder],
  ['bol.com zoekpagina (met onze filter)', 'https://www.bol.com/nl/nl/s/?searchtext=iphone%2013', onze],
  ['cardmarket (verzamelkaarten)', 'https://www.cardmarket.com/en/Pokemon', zonder],
  ['tcgplayer (verzamelkaarten)', 'https://www.tcgplayer.com/search/pokemon/product?q=scarlet+violet+booster', zonder],
  ['vinted zoekpagina', 'https://www.vinted.nl/catalog?search_text=iphone+13', zonder],
  ['catawiki startpagina', 'https://www.catawiki.com/nl/', zonder]
];
const uit = [];
for (const [naam, url, tool] of gevallen) { const r = await haal(naam, url, tool); uit.push(r); console.log(schoon(JSON.stringify(r))); }
// Kan de zoekfunctie wel eBay-resultaten leveren (zonder de pagina te hoeven openen)?
const zoek = await api({ model: MODEL, max_tokens: 800, messages: [{ role: 'user', content: 'Zoek verkochte iPhone 13 128GB op eBay en noem hooguit drie resultaten met prijs.' }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1, allowed_domains: ['ebay.nl', 'ebay.com', 'ebay.de'] }] });
console.log('ZOEKEN op eBay-domeinen:', zoek.fout ? zoek.fout : schoon(JSON.stringify(zoek.content.filter(b => b.type === 'web_search_tool_result').map(b => Array.isArray(b.content) ? b.content.slice(0, 5).map(x => x.url) : b.content)) + ' | ' + zoek.content.filter(b => b.type === 'text').map(b => b.text).join('').slice(0, 400)));
console.log('Totale kosten diagnose: $' + totaal.toFixed(4));
