// Test van de server zonder Cloudflare: D1 wordt nagebootst met SQLite (node:sqlite),
// Anthropic, Stripe, Resend en de veilingsite met nepantwoorden.
// Draaien: node server/test/server.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { verwerk } from '../src/index.js';

let fouten = 0, aantal = 0;
function check(naam, ok, extra) { aantal++; console.log((ok ? 'OK   ' : 'FOUT ') + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!ok) fouten++; }

// ── D1-nabootsing ──
function maakD1() {
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
  return { prepare: (sql) => stmt(sql), batch: async (lijst) => { for (const s of lijst) await s.run(); }, _db: db };
}

// ── Nepdiensten ──
const aanroepen = [];
let anthropicAntwoord = null, paginaHtml = '', stripeSub = null;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  aanroepen.push({ url, opt });
  const body = opt.body ? (typeof opt.body === 'string' ? opt.body : '') : '';
  if (url.startsWith('https://api.anthropic.com/')) {
    const b = JSON.parse(body);
    return new Response(JSON.stringify(anthropicAntwoord(b)), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }), { status: 200 });
  if (url.startsWith('https://api.stripe.com/v1/billing_portal/sessions')) return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/1' }), { status: 200 });
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return new Response(JSON.stringify(stripeSub), { status: 200 });
  if (url.startsWith('https://api.resend.com/')) return new Response('{"id":"e1"}', { status: 200 });
  if (url.startsWith('https://www.testveiling.nl/')) return new Response(paginaHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  return new Response('niet gevonden', { status: 404, headers: { 'content-type': 'text/plain' } });
};

const env = {
  DB: maakD1(), ANTHROPIC_API_KEY: 'sk-ant-server', APP_URL: 'https://app.test/app.html', APP_ORIGIN: 'https://app.test',
  LIMIET_GRATIS: '2', LIMIET_BASIS: '100', DAGBUDGET_USD: '20', MAX_PER_UUR: '40',
  STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_PRICE_BASIS: 'price_basis', STRIPE_PRICE_PRO: 'price_pro',
  RESEND_API_KEY: 're_1', EMAIL_VAN: 'VA <noreply@test.nl>'
};
async function api(methode, pad, body, token, kop = {}) {
  const headers = Object.assign({ 'Origin': 'https://app.test', 'Content-Type': 'application/json' }, kop);
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await verwerk(new Request('https://server.test' + pad, { method: methode, headers, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), env);
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data, headers: r.headers };
}

const STAP1 = { gevonden: true, titel: 'Apple iPhone 13 128GB', veilinghuis: 'Testveiling', kavelnummer: '4711', product: { zoekterm: 'iPhone 13 128GB' }, staat: 'gebruikt',
  aantal_stuks: 1, huidig_bod: 300, aantal_biedingen: 7, sluit: 'do 30 okt 20:00', sluit_iso: '2026-10-30T20:00:00+01:00',
  kosten: { opgeld_pct: 18, vaste_kosten: 2.5, btw_pct: 21, btw_regeling: 'volledig', bron: 'Opgeld 18%' }, opmerkingen: [] };
const STAP2 = { productnaam: 'Apple iPhone 13 128GB', nieuwprijs: 899, tweedehands: [{ platform: 'Marktplaats', titel: 'iPhone 13', prijs: 575, soort: 'vraagprijs', url: 'https://www.marktplaats.nl/v/x/m1-iphone' }],
  marktplaats: { laag: 500, gemiddeld: 600, hoog: 700, vertrouwen: 'middel' }, ebay: null, toelichting: 'test' };
let anthropicBodies = [];
anthropicAntwoord = (b) => {
  anthropicBodies.push(b);
  if (b.system.startsWith('Je leest veilingkavels')) return { content: [{ type: 'text', text: JSON.stringify(STAP1) }], stop_reason: 'end_turn', usage: { input_tokens: 8000, output_tokens: 400 } };
  return { content: [{ type: 'text', text: JSON.stringify(STAP2) }], stop_reason: 'end_turn', usage: { input_tokens: 40000, output_tokens: 900, server_tool_use: { web_search_requests: 1 } } };
};
paginaHtml = '<html><head><title>Kavel 4711 – iPhone 13</title><meta property="og:description" content="Apple iPhone 13 128GB blauw, gebruikt"><script>var x=1;</script></head>' +
  '<body><nav>menu</nav><h1>Apple iPhone 13 128GB</h1><p>Huidig bod: &euro; 300</p><p>Sluit do 30 okt 20:00</p>' + '<p>Omschrijving van het kavel met veel details. </p>'.repeat(20) +
  '<a href="/voorwaarden/veiling-123">Veilingvoorwaarden en kosten</a></body></html>';

// ── 1. Registreren en inloggen ──
let r = await api('POST', '/api/registreer', { email: 'Jan@Voorbeeld.nl', wachtwoord: 'geheim123' });
check('Registreren → 201 met token', r.status === 201 && /^[0-9a-f]{64}$/.test(r.data.token), r.status);
check('E-mail kleine letters, plan gratis, limiet 2', r.data.account.email === 'jan@voorbeeld.nl' && r.data.account.plan === 'gratis' && r.data.account.limiet === 2);
const token = r.data.token;
check('CORS-kop voor toegestane herkomst', r.headers.get('access-control-allow-origin') === 'https://app.test');
r = await api('POST', '/api/registreer', { email: 'jan@voorbeeld.nl', wachtwoord: 'anders123' });
check('Dubbel registreren → 409', r.status === 409);
r = await api('POST', '/api/registreer', { email: 'geen-email', wachtwoord: 'geheim123' });
check('Ongeldig e-mailadres → 400', r.status === 400);
r = await api('POST', '/api/registreer', { email: 'a@b.nl', wachtwoord: 'kort' });
check('Te kort wachtwoord → 400', r.status === 400);
const rij = env.DB._db.prepare('SELECT wachtwoord_hash FROM gebruikers WHERE email = ?').get('jan@voorbeeld.nl');
check('Wachtwoord niet leesbaar opgeslagen', rij.wachtwoord_hash.length === 64 && rij.wachtwoord_hash.indexOf('geheim') === -1);
r = await api('POST', '/api/inloggen', { email: 'jan@voorbeeld.nl', wachtwoord: 'fout' });
check('Verkeerd wachtwoord → 401', r.status === 401);
r = await api('POST', '/api/inloggen', { email: ' JAN@voorbeeld.nl ', wachtwoord: 'geheim123' });
check('Inloggen → 200 met nieuw token', r.status === 200 && r.data.token !== token);
r = await api('GET', '/api/account', null, 'onzin');
check('Ongeldig token → 401', r.status === 401);
r = await api('OPTIONS', '/api/analyse', null, null, { 'Access-Control-Request-Method': 'POST' });
check('Preflight → 204', r.status === 204 && r.headers.get('access-control-allow-methods').includes('POST'));
r = await verwerk(new Request('https://server.test/api/account', { headers: { Origin: 'https://kwaadaardig.test' } }), env);
check('Geen CORS voor onbekende herkomst', !r.headers.get('access-control-allow-origin'));

// ── 2. Analyse ──
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/4711', extra: '' }, token);
check('Analyse → 200', r.status === 200, r.data && r.data.fout);
check('Server las de pagina zelf (geen web_fetch-zoektocht nodig)', r.data.pagina.direct_gelezen === true && anthropicBodies[0].messages[0].content.includes('Apple iPhone 13 128GB blauw'));
check('Paginatekst: scripts en menu weggelaten, voorwaarden-link meegegeven', !anthropicBodies[0].messages[0].content.includes('var x=1') && anthropicBodies[0].messages[0].content.includes('https://www.testveiling.nl/voorwaarden/veiling-123'));
check('Stap 1 met Haiku, hooguit 1 extra pagina', anthropicBodies[0].model === 'claude-haiku-5-5' && anthropicBodies[0].tools.length === 1 && anthropicBodies[0].tools[0].max_uses === 1);
check('Stap 2 met Haiku, hooguit 3 pagina\'s en 1 zoekopdracht', anthropicBodies[1].model === 'claude-haiku-5-5' && JSON.stringify(anthropicBodies[1].tools.map(t => t.max_uses)) === '[3,1]');
check('Server-sleutel gebruikt, niet zichtbaar voor klant', aanroepen.find(a => a.url.includes('anthropic')).opt.headers['x-api-key'] === 'sk-ant-server' && JSON.stringify(r.data).indexOf('sk-ant') === -1);
check('Kosten niet naar de klant', r.data.usd === undefined && r.data.prijzen.usd === undefined && r.data.pagina.usd === undefined);
check('Verbruik 1 van 2', r.data.verbruik.gebruikt === 1 && r.data.verbruik.limiet === 2);
const kosten1 = env.DB._db.prepare('SELECT usd FROM verbruik').get().usd;
// Haiku: 8000×0,10 + 400×0,50 + 40000×0,10 + 900×0,50 per miljoen + 1 zoekopdracht = $0,015450
check('Kosten per analyse: $0,01545 (onder 2 cent)', Math.abs(kosten1 - 0.01545) < 1e-9, kosten1);
check('Sluitingstijd als ISO', r.data.pagina.sluit_iso === '2026-10-30T19:00:00.000Z', r.data.pagina.sluit_iso);

const n = anthropicBodies.length;
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/4711' }, token);
check('Tweede keer: prijzen uit gedeelde cache (alleen stap 1)', r.status === 200 && anthropicBodies.length - n === 1 && r.data.prijzen.hergebruikt === true);
const kosten2 = env.DB._db.prepare('SELECT usd FROM verbruik ORDER BY id DESC').get().usd;
check('Kosten met cache: $0,001 (alleen pagina lezen)', Math.abs(kosten2 - 0.001) < 1e-9, kosten2);

r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/4711' }, token);
check('Limiet bereikt → 402 met uitleg', r.status === 402 && /alle 2 analyses/.test(r.data.fout), r.data);
r = await api('POST', '/api/analyse', { url: 'http://127.0.0.1/admin' }, token);
check('Interne adressen geweigerd', r.status === 400 || r.status === 402);

// ── 3. Dagbudget ──
const r2 = await api('POST', '/api/registreer', { email: 'piet@voorbeeld.nl', wachtwoord: 'geheim123' });
env.DB._db.prepare('INSERT INTO verbruik (gebruiker_id, tijd, usd) VALUES (99, ?, 25)').run(Date.now());
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/1' }, r2.data.token);
check('Dagbudget overschreden → 503', r.status === 503 && r.data.code === 'budget');
env.DB._db.prepare('DELETE FROM verbruik WHERE gebruiker_id = 99').run();

// ── 4. Kavels synchroniseren ──
r = await api('PUT', '/api/kavels', { kavels: [{ id: 1, titel: 'Test' }] }, token);
check('Kavels opslaan', r.status === 200 && r.data.bijgewerkt > 0);
r = await api('GET', '/api/kavels', null, token);
check('Kavels lezen', r.data.kavels.length === 1 && r.data.kavels[0].titel === 'Test');
r = await api('GET', '/api/kavels', null, r2.data.token);
check('Andere gebruiker ziet ze niet', r.data.kavels.length === 0);

// ── 5. Stripe ──
r = await api('POST', '/api/afrekenen', { plan: 'basis' }, token);
const af = aanroepen.filter(a => a.url.includes('checkout/sessions')).pop();
const velden = new URLSearchParams(af.opt.body);
check('Afrekenen → Stripe Checkout-link', r.status === 200 && r.data.url.startsWith('https://checkout.stripe.com/'));
check('Checkout: abonnement, juiste prijs, gebruiker gekoppeld', velden.get('mode') === 'subscription' && velden.get('line_items[0][price]') === 'price_basis' && velden.get('client_reference_id') === '1' && velden.get('customer_email') === 'jan@voorbeeld.nl');
r = await api('POST', '/api/afrekenen', { plan: 'gratis' }, token);
check('Gratis plan is niet te koop → 400', r.status === 400);

async function webhook(ev, geheim = 'whsec_test', t = Math.floor(Date.now() / 1000)) {
  const ruw = JSON.stringify(ev);
  const sig = createHmac('sha256', geheim).update(t + '.' + ruw).digest('hex');
  return api('POST', '/api/stripe-webhook', ruw, null, { 'Stripe-Signature': 't=' + t + ',v1=' + sig });
}
stripeSub = { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ price: { id: 'price_basis' }, current_period_end: 1800000000 }] } };
r = await webhook({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1', client_reference_id: '1', customer: 'cus_1' } } }, 'verkeerd');
check('Webhook met verkeerde handtekening → 400', r.status === 400);
r = await webhook({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1', client_reference_id: '1' } } }, 'whsec_test', Math.floor(Date.now() / 1000) - 3600);
check('Webhook met oude tijd → 400', r.status === 400);
r = await webhook({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1', client_reference_id: '1', customer: 'cus_1' } } });
check('Webhook checkout → 200', r.status === 200);
r = await api('GET', '/api/account', null, token);
check('Na betaling: plan Basis, limiet 100, periode-einde uit abonnementsitem', r.data.plan === 'basis' && r.data.limiet === 100 && r.data.periode_einde === 1800000000000, r.data);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/4711' }, token);
check('Na upgrade kan weer geanalyseerd worden', r.status === 200 && r.data.verbruik.limiet === 100);
r = await api('POST', '/api/portaal', null, token);
check('Portaal-link voor abonnement beheren', r.status === 200 && r.data.url.startsWith('https://billing.stripe.com/'));
r = await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ price: { id: 'price_pro' } }] }, current_period_end: 1810000000 } } });
r = await api('GET', '/api/account', null, token);
check('Wijziging naar Pro verwerkt', r.data.plan === 'pro' && r.data.limiet === 500);
r = await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', items: { data: [{ price: { id: 'price_pro' } }] } } } });
r = await api('GET', '/api/account', null, token);
check('Opzegging → terug naar Gratis', r.data.plan === 'gratis' && r.data.abonnement_status === 'canceled');

// ── 6. Wachtwoord vergeten en herstellen ──
r = await api('POST', '/api/wachtwoord-vergeten', { email: 'jan@voorbeeld.nl' });
const mail = aanroepen.filter(a => a.url.includes('resend')).pop();
const link = JSON.parse(mail.opt.body).html.match(/herstel=([0-9a-f]+)/);
check('Herstelmail verstuurd met link', r.status === 200 && !!link);
r = await api('POST', '/api/wachtwoord-vergeten', { email: 'onbekend@voorbeeld.nl' });
check('Onbekend adres: zelfde antwoord, geen mail', r.status === 200 && aanroepen.filter(a => a.url.includes('resend')).length === 1);
r = await api('POST', '/api/wachtwoord-herstellen', { token: link[1], wachtwoord: 'nieuwgeheim1' });
check('Nieuw wachtwoord ingesteld', r.status === 200 && !!r.data.token);
r = await api('GET', '/api/account', null, token);
check('Oude sessies ongeldig na herstel', r.status === 401);
r = await api('POST', '/api/wachtwoord-herstellen', { token: link[1], wachtwoord: 'nogeenkeer1' });
check('Herstellink werkt maar één keer', r.status === 400);
r = await api('POST', '/api/inloggen', { email: 'jan@voorbeeld.nl', wachtwoord: 'nieuwgeheim1' });
check('Inloggen met nieuw wachtwoord', r.status === 200);

// ── 7. Raden van wachtwoorden ──
for (let i = 0; i < 10; i++) await api('POST', '/api/inloggen', { email: 'piet@voorbeeld.nl', wachtwoord: 'fout' + i });
r = await api('POST', '/api/inloggen', { email: 'piet@voorbeeld.nl', wachtwoord: 'geheim123' });
check('Na 10 mislukte pogingen tijdelijk geblokkeerd → 429', r.status === 429);

// ── 8. Fout bij de AI-dienst ──
anthropicAntwoord = () => ({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
globalThis.fetch = (orig => async (url, opt) => {
  if (String(url).startsWith('https://api.anthropic.com/')) return new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), { status: 529 });
  return orig(url, opt);
})(globalThis.fetch);
const r3 = await api('POST', '/api/registreer', { email: 'kees@voorbeeld.nl', wachtwoord: 'geheim123' });
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/77' }, r3.data.token);
check('AI-dienst druk → 503 met begrijpelijke tekst, telt niet mee', r.status === 503 && /druk/.test(r.data.fout) && env.DB._db.prepare("SELECT COUNT(*) AS n FROM verbruik v JOIN gebruikers g ON g.id = v.gebruiker_id WHERE g.email = 'kees@voorbeeld.nl'").get().n === 0, r.data);

console.log('\n' + (aantal - fouten) + ' van ' + aantal + ' controles OK' + (fouten ? ' — ' + fouten + ' FOUT(EN)' : ''));
process.exit(fouten ? 1 : 0);
