// Draait de server lokaal (Node + SQLite) met nagebootste AI-antwoorden, voor tests van de app in servermodus.
// Gebruik: node server/test/lokaal.mjs [poort] [app-herkomst]
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { verwerk } from '../src/index.js';

const poort = Number(process.argv[2] || 8787);
const herkomst = process.argv[3] || 'http://localhost:8080';
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
function stmt(sql, args = []) {
  return {
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }
  };
}
const env = { DB: { prepare: s => stmt(s), batch: async l => { for (const s of l) await s.run(); } },
  ANTHROPIC_API_KEY: 'sk-ant-lokaal', STRIPE_SECRET_KEY: 'sk_test_lokaal', STRIPE_PRICE_BASIS: 'price_b', STRIPE_PRICE_PRO: 'price_p', APP_URL: herkomst + '/app.html', APP_ORIGIN: herkomst, LIMIET_GRATIS: '3' };

const echteFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url.startsWith('https://api.anthropic.com/')) {
    const b = JSON.parse(opt.body);
    const tekst = b.system.startsWith('Je leest veilingkavels')
      ? { gevonden: true, titel: 'Bosch boormachine GSB 18V', veilinghuis: 'Testveiling', kavelnummer: '88', product: { zoekterm: 'Bosch GSB 18V' }, staat: 'gebruikt', huidig_bod: 40, aantal_biedingen: 3, sluit: 'vr 31 okt 19:00', sluit_iso: '2099-10-31T19:00:00+01:00', kosten: { opgeld_pct: 17, vaste_kosten: null, btw_pct: 21, btw_regeling: 'volledig', bron: '17% opgeld' } }
      : { productnaam: 'Bosch GSB 18V-21', nieuwprijs: 129, tweedehands: [{ platform: 'Marktplaats', titel: 'Bosch GSB 18V', prijs: 85, soort: 'vraagprijs', url: null }], marktplaats: { laag: 65, gemiddeld: 80, hoog: 95, vertrouwen: 'middel' }, toelichting: 'test' };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(tekst) }], stop_reason: 'end_turn', usage: { input_tokens: 9000, output_tokens: 500 } }), { status: 200 });
  }
  if (url.startsWith('https://www.testveiling.nl/')) return new Response('<html><title>Kavel 88</title><body>' + '<p>Bosch boormachine GSB 18V, gebruikt, met accu. </p>'.repeat(20) + '</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  return echteFetch(url, opt);
};

http.createServer(async (req, res) => {
  const delen = [];
  for await (const d of req) delen.push(d);
  const body = Buffer.concat(delen);
  const r = await verwerk(new Request('http://localhost:' + poort + req.url, { method: req.method, headers: req.headers, body: body.length ? body : undefined }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(poort, () => console.log('Server lokaal op http://localhost:' + poort));
