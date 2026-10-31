// Test van de server zonder Cloudflare: D1 wordt nagebootst met SQLite (node:sqlite),
// Anthropic, Stripe, Resend en de veilingsite met nepantwoorden.
// Draaien: node server/test/server.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { verwerk, meldingenVersturen } from '../src/index.js';
import { createECDH, hkdfSync, createDecipheriv, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import '../../kern.js';
const K = globalThis.VAKern;

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
  WELKOM_TEGOED: '2', LIMIET_GRATIS: '0', DAGBUDGET_USD: '20', DAGBUDGET_PER_KLANT_USD: '1', MAX_PER_UUR: '60',
  STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_PRICE_REGELMATIG: 'price_basis', STRIPE_PRICE_HANDELAAR: 'price_pro', STRIPE_PRICE_BUNDEL_25: 'price_b25',
  RESEND_API_KEY: 're_1', EMAIL_VAN: 'VA <noreply@test.nl>'
};
async function api(methode, pad, body, token, kop = {}) {
  const headers = Object.assign({ 'Origin': 'https://app.test', 'Content-Type': 'application/json' }, kop);
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await verwerk(new Request('https://server.test' + pad, { method: methode, headers, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), env);
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data, headers: r.headers };
}

// Haalt de bevestigingscode uit de laatste nagebootste e-mail aan dit adres en vult hem in
function codeVoor(email) {
  const m = aanroepen.filter(a => a.url.includes('resend') && JSON.parse(a.opt.body).to[0] === email).pop();
  return m ? JSON.parse(m.opt.body).subject.match(/^(\d{6})/)[1] : null;
}
async function bevestig(tk, email) { return api('POST', '/api/verifieer', { code: codeVoor(email) }, tk); }

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
check('E-mail kleine letters, plan gratis, welkomstbundel 2', r.data.account.email === 'jan@voorbeeld.nl' && r.data.account.plan === 'gratis' && r.data.account.limiet === 0 && r.data.account.tegoed === 2 && r.data.account.beschikbaar === 2, r.data.account);
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

// ── 1b. E-mailcontrole ──
check('Na aanmelden: e-mail nog niet bevestigd, code gemaild', (await api('GET', '/api/account', null, token)).data.email_geverifieerd === false && /^\d{6}$/.test(codeVoor('jan@voorbeeld.nl')));
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/4711' }, token);
check('Analyseren voor bevestiging → 403 met uitleg', r.status === 403 && r.data.code === 'niet_geverifieerd');
r = await api('POST', '/api/verifieer', { code: '000000' === codeVoor('jan@voorbeeld.nl') ? '111111' : '000000' }, token);
check('Verkeerde code → 400', r.status === 400 && r.data.code === 'onjuist');
r = await api('POST', '/api/verifieer-opnieuw', null, token);
check('Direct een nieuwe code vragen → 429 (wacht een minuut)', r.status === 429);
r = await bevestig(token, 'jan@voorbeeld.nl');
check('Juiste code → bevestigd', r.status === 200 && r.data.account.email_geverifieerd === true);
const rv = await api('POST', '/api/registreer', { email: 'raden@voorbeeld.nl', wachtwoord: 'geheim123' });
for (let i = 0; i < 5; i++) await api('POST', '/api/verifieer', { code: String(900000 + i) }, rv.data.token);
r = await api('POST', '/api/verifieer', { code: codeVoor('raden@voorbeeld.nl') }, rv.data.token);
check('Na 5 foute pogingen werkt ook de juiste code niet meer (nieuwe code nodig)', r.status === 400 && r.data.code === 'te_vaak');
r = await api('POST', '/api/registreer', { email: 'iemand@mailinator.com', wachtwoord: 'geheim123' });
check('Wegwerpadres geweigerd', r.status === 400 && r.data.code === 'wegwerp');
r = await api('POST', '/api/registreer', { email: 'jandevries@gmail.com', wachtwoord: 'geheim123' });
const rg = await api('POST', '/api/registreer', { email: 'Jan.De.Vries+gratis@gmail.com', wachtwoord: 'geheim123' });
check('Zelfde Gmail met punten of +toevoeging → 409', r.status === 201 && rg.status === 409);
const rplus = await api('POST', '/api/registreer', { email: 'jan+2@voorbeeld.nl', wachtwoord: 'geheim123' });
check('+toevoeging bij ander domein → 409', rplus.status === 409);
r = await api('GET', '/api/gezondheid');
check('Serverinfo meldt e-mailcontrole aan', r.data.emailcontrole === true && r.data.turnstile_sitekey === null);

// Botcontrole (Turnstile)
env.TURNSTILE_SECRET = 'ts_geheim'; env.TURNSTILE_SITEKEY = 'ts_site';
let tsVerzoek = null;
globalThis.fetch = (orig => async (url, opt) => {
  if (String(url).startsWith('https://challenges.cloudflare.com/')) { tsVerzoek = JSON.parse(opt.body); return new Response(JSON.stringify({ success: tsVerzoek.response === 'goed' }), { status: 200 }); }
  return orig(url, opt);
})(globalThis.fetch);
r = await api('POST', '/api/registreer', { email: 'bot@voorbeeld.nl', wachtwoord: 'geheim123' });
check('Turnstile: zonder token → 403', r.status === 403 && r.data.code === 'bot');
r = await api('POST', '/api/registreer', { email: 'bot@voorbeeld.nl', wachtwoord: 'geheim123', turnstile: 'nep' });
check('Turnstile: ongeldig token → 403', r.status === 403 && tsVerzoek.secret === 'ts_geheim');
r = await api('POST', '/api/registreer', { email: 'mens@voorbeeld.nl', wachtwoord: 'geheim123', turnstile: 'goed' });
check('Turnstile: geldig token → 201', r.status === 201);
check('Serverinfo geeft openbare sitekey', (await api('GET', '/api/gezondheid')).data.turnstile_sitekey === 'ts_site');
delete env.TURNSTILE_SECRET; delete env.TURNSTILE_SITEKEY;

// ── 2. Analyse ──
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/4711', extra: '' }, token);
check('Analyse → 200', r.status === 200, r.data && r.data.fout);
check('Server las de pagina zelf (geen web_fetch-zoektocht nodig)', r.data.pagina.direct_gelezen === true && anthropicBodies[0].messages[0].content.includes('Apple iPhone 13 128GB blauw'));
check('Paginatekst: scripts en menu weggelaten, voorwaarden-link meegegeven', !anthropicBodies[0].messages[0].content.includes('var x=1') && anthropicBodies[0].messages[0].content.includes('https://www.testveiling.nl/voorwaarden/veiling-123'));
check('Stap 1 met Haiku, hooguit 1 extra pagina', anthropicBodies[0].model === 'claude-haiku-5-5' && anthropicBodies[0].tools.length === 1 && anthropicBodies[0].tools[0].max_uses === 1);
check('Stap 2 met Haiku, hooguit 3 pagina\'s en 1 zoekopdracht', anthropicBodies[1].model === 'claude-haiku-5-5' && JSON.stringify(anthropicBodies[1].tools.map(t => t.max_uses)) === '[3,1]');
check('Server-sleutel gebruikt, niet zichtbaar voor klant', aanroepen.find(a => a.url.includes('anthropic')).opt.headers['x-api-key'] === 'sk-ant-server' && JSON.stringify(r.data).indexOf('sk-ant') === -1);
check('Kosten niet naar de klant', r.data.usd === undefined && r.data.prijzen.usd === undefined && r.data.pagina.usd === undefined);
check('Verbruik: 1 uit tegoed, nog 1 over', r.data.verbruik.gebruikt === 1 && r.data.verbruik.tegoed === 1 && r.data.verbruik.beschikbaar === 1, r.data.verbruik);
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
check('Tegoed op → 402 met uitleg (bundel of abonnement)', r.status === 402 && /gratis analyses zijn op/.test(r.data.fout) && /bundel/.test(r.data.fout), r.data);
r = await api('POST', '/api/analyse', { url: 'http://127.0.0.1/admin' }, token);
check('Interne adressen geweigerd', r.status === 400 || r.status === 402);

// ── 3. Dagbudget ──
const r2 = await api('POST', '/api/registreer', { email: 'piet@voorbeeld.nl', wachtwoord: 'geheim123' });
await bevestig(r2.data.token, 'piet@voorbeeld.nl');
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
r = await api('POST', '/api/afrekenen', { plan: 'regelmatig' }, token);
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
check('Na betaling: plan Regelmatig, limiet 120, periode-einde uit abonnementsitem', r.data.plan === 'regelmatig' && r.data.limiet === 120 && r.data.periode_einde === 1800000000000, r.data);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/4711' }, token);
check('Na upgrade kan weer geanalyseerd worden', r.status === 200 && r.data.verbruik.limiet === 120);
r = await api('POST', '/api/portaal', null, token);
check('Portaal-link voor abonnement beheren', r.status === 200 && r.data.url.startsWith('https://billing.stripe.com/'));
r = await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ price: { id: 'price_pro' } }] }, current_period_end: 1810000000 } } });
r = await api('GET', '/api/account', null, token);
check('Wijziging naar Handelaar verwerkt', r.data.plan === 'handelaar' && r.data.limiet === 500);
r = await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', items: { data: [{ price: { id: 'price_pro' } }] } } } });
r = await api('GET', '/api/account', null, token);
check('Opzegging → terug naar Gratis', r.data.plan === 'gratis' && r.data.abonnement_status === 'canceled');

// ── 6. Wachtwoord vergeten en herstellen ──
r = await api('POST', '/api/wachtwoord-vergeten', { email: 'jan@voorbeeld.nl' });
const mail = aanroepen.filter(a => a.url.includes('resend')).pop();
const link = JSON.parse(mail.opt.body).html.match(/herstel=([0-9a-f]+)/);
check('Herstelmail verstuurd met link', r.status === 200 && !!link);
const mailsVoor = aanroepen.filter(a => a.url.includes('resend')).length;
r = await api('POST', '/api/wachtwoord-vergeten', { email: 'onbekend@voorbeeld.nl' });
check('Onbekend adres: zelfde antwoord, geen mail', r.status === 200 && aanroepen.filter(a => a.url.includes('resend')).length === mailsVoor);
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
await bevestig(r3.data.token, 'kees@voorbeeld.nl');
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/77' }, r3.data.token);
check('AI-dienst druk → 503 met begrijpelijke tekst, telt niet mee', r.status === 503 && /druk/.test(r.data.fout) && env.DB._db.prepare("SELECT COUNT(*) AS n FROM verbruik v JOIN gebruikers g ON g.id = v.gebruiker_id WHERE g.email = 'kees@voorbeeld.nl'").get().n === 0, r.data);

// ── 9. Gratis opzet zonder betalen, met uitnodigingscode ──
globalThis.fetch = (orig => async (url, opt) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    const b = JSON.parse(opt.body);
    return new Response(JSON.stringify(anthropicAntwoord(b)), { status: 200 });
  }
  return orig(url, opt);
})(globalThis.fetch);
anthropicAntwoord = (b) => b.system.startsWith('Je leest veilingkavels')
  ? { content: [{ type: 'text', text: JSON.stringify(STAP1) }], stop_reason: 'end_turn', usage: { input_tokens: 8000, output_tokens: 400 } }
  : { content: [{ type: 'text', text: JSON.stringify(STAP2) }], stop_reason: 'end_turn', usage: { input_tokens: 40000, output_tokens: 900 } };
delete env.STRIPE_SECRET_KEY; env.UITNODIGINGSCODE = 'Veiling2026'; env.WELKOM_TEGOED = '1';
r = await api('GET', '/api/gezondheid');
check('Serverinfo: geen betalen, wel uitnodiging, welkomstbundel 1', r.data.betalen === false && r.data.uitnodiging === true && r.data.welkom === 1, r.data);
r = await api('POST', '/api/registreer', { email: 'zonder@code.nl', wachtwoord: 'geheim123' });
check('Zonder code geen account → 403', r.status === 403 && r.data.code === 'code');
r = await api('POST', '/api/registreer', { email: 'zonder@code.nl', wachtwoord: 'geheim123', code: 'fout' });
check('Verkeerde code → 403', r.status === 403);
r = await api('POST', '/api/registreer', { email: 'met@code.nl', wachtwoord: 'geheim123', code: ' veiling2026 ' });
check('Juiste code (hoofdletters en spaties maken niet uit) → 201', r.status === 201 && r.data.account.kan_betalen === false, r.status);
const tk = r.data.token;
await bevestig(tk, 'met@code.nl');
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/500' }, tk);
check('Gratis analyse lukt', r.status === 200);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/501' }, tk);
check('Limiet zonder betalen: geen verwijzing naar abonnement', r.status === 402 && /gratis analyse/.test(r.data.fout) && !/abonnement/.test(r.data.fout), r.data.fout);
r = await api('POST', '/api/afrekenen', { plan: 'basis' }, tk);
check('Afrekenen zonder Stripe → 501', r.status === 501);

// ── 10. Limieten tegen misbruik ──
env.STRIPE_SECRET_KEY = 'sk_test_1'; delete env.UITNODIGINGSCODE; env.WELKOM_TEGOED = '2';
const ipKop = (ip) => ({ 'CF-Connecting-IP': ip });
const mails0 = aanroepen.filter(a => a.url.includes('resend')).length;
let statussen = [];
for (let i = 0; i < 4; i++) statussen.push((await api('POST', '/api/wachtwoord-vergeten', { email: 'met@code.nl' }, null, ipKop('10.0.0.' + i))).status);
check('Herstellink: 3 per uur per adres, de 4e → 429', JSON.stringify(statussen) === '[200,200,200,429]', statussen);
check('Na de limiet geen extra mail', aanroepen.filter(a => a.url.includes('resend')).length - mails0 === 3);
statussen = [];
for (let i = 0; i < 11; i++) statussen.push((await api('POST', '/api/wachtwoord-vergeten', { email: 'x' + i + '@voorbeeld.nl' }, null, ipKop('10.1.1.1'))).status);
check('Herstellink: 10 per uur per IP, de 11e → 429', statussen.slice(0, 10).every(s => s === 200) && statussen[10] === 429, statussen);
statussen = [];
for (let i = 0; i < 11; i++) statussen.push((await api('POST', '/api/registreer', { email: 'ipreg' + i + '@voorbeeld.nl', wachtwoord: 'geheim123' }, null, ipKop('10.2.2.2'))).status);
check('Aanmelden: 10 per uur per IP, de 11e → 429', statussen.slice(0, 10).every(s => s === 201) && statussen[10] === 429, statussen);
check('Ander IP kan wel aanmelden', (await api('POST', '/api/registreer', { email: 'ander-ip@voorbeeld.nl', wachtwoord: 'geheim123' }, null, ipKop('10.3.3.3'))).status === 201);
statussen = [];
for (let i = 0; i < 31; i++) statussen.push((await api('POST', '/api/inloggen', { email: 'iemand' + i + '@voorbeeld.nl', wachtwoord: 'fout' }, null, ipKop('10.4.4.4'))).status);
check('Inloggen: 30 pogingen per kwartier per IP, daarna 429', statussen.slice(0, 30).every(s => s === 401) && statussen[30] === 429, statussen.slice(-3));

// ── 11. Eigen gegevens downloaden en account verwijderen ──
let rd = await api('POST', '/api/registreer', { email: 'weg@voorbeeld.nl', wachtwoord: 'geheim123' });
const tkWeg = rd.data.token;
await bevestig(tkWeg, 'weg@voorbeeld.nl');
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/900' }, tkWeg);
check('Voorbereiding: één analyse gedaan', r.status === 200 && r.data.verbruik.gebruikt === 1, r.data && r.data.fout);
await api('PUT', '/api/kavels', { kavels: [{ id: 9, titel: 'Mijn kavel' }] }, tkWeg);
r = await api('GET', '/api/mijn-gegevens', null, tkWeg);
check('Gegevens downloaden: account, analyses met link, kavels', r.status === 200 && r.data.account.email === 'weg@voorbeeld.nl' && r.data.analyses.length === 1 && r.data.analyses[0].link.includes('kavel/900') && r.data.kavels[0].titel === 'Mijn kavel');
check('Download als bestand', /attachment/.test(r.headers.get('content-disposition') || ''));
check('Geen wachtwoord-hash of zout in de download', !JSON.stringify(r.data).match(/wachtwoord|zout|hash/));
r = await api('POST', '/api/account-verwijderen', { wachtwoord: 'fout' }, tkWeg);
check('Verwijderen met verkeerd wachtwoord → 403 (niet uitloggen)', r.status === 403);
const idWeg = env.DB._db.prepare("SELECT id FROM gebruikers WHERE email = 'weg@voorbeeld.nl'").get().id;
env.DB._db.prepare("UPDATE gebruikers SET stripe_abonnement = 'sub_weg', abonnement_status = 'active', plan = 'basis' WHERE id = ?").run(idWeg);
stripeSub = { id: 'sub_weg', status: 'canceled' };
r = await api('POST', '/api/account-verwijderen', { wachtwoord: 'geheim123' }, tkWeg);
const stop = aanroepen.filter(a => a.url.includes('/subscriptions/sub_weg')).pop();
check('Verwijderen → 200 en lopend abonnement direct gestopt bij Stripe', r.status === 200 && stop && stop.opt.method === 'DELETE', r.data);
const db = env.DB._db;
check('Account, sessies, kavels en codes weg', !db.prepare('SELECT 1 FROM gebruikers WHERE id = ?').get(idWeg) && !db.prepare('SELECT 1 FROM sessies WHERE gebruiker_id = ?').get(idWeg) && !db.prepare('SELECT 1 FROM kavels WHERE gebruiker_id = ?').get(idWeg));
check('Verbruik anoniem bewaard (zonder link) voor dagbudget', db.prepare('SELECT COUNT(*) AS n FROM verbruik WHERE gebruiker_id = ? AND url IS NULL').get(-idWeg).n === 1);
check('Geen e-mailadres meer in de database', !JSON.stringify(db.prepare('SELECT * FROM verwijderd').all()).includes('weg@') && !db.prepare("SELECT 1 FROM pogingen WHERE email LIKE '%weg@voorbeeld.nl%'").get());
r = await api('GET', '/api/account', null, tkWeg);
check('Oude sessie werkt niet meer', r.status === 401);
rd = await api('POST', '/api/registreer', { email: 'weg@voorbeeld.nl', wachtwoord: 'geheim123' });
check('Opnieuw aanmelden kan, maar zonder nieuwe welkomstbundel en met het verbruik van deze maand', rd.status === 201 && rd.data.account.gebruikt === 1 && rd.data.account.tegoed === 0, rd.data.account);

// ── 12. Dagelijks opruimen ──
const { opruimen } = await import('../src/index.js');
const oud = Date.now() - 100 * 864e5;
db.prepare('INSERT INTO sessies (token_hash, gebruiker_id, verloopt) VALUES (?, 1, ?)').run('verlopen', Date.now() - 1000);
db.prepare('INSERT INTO prijscache (sleutel, data, tijd) VALUES (?, ?, ?)').run('oud', '{}', Date.now() - 4 * 864e5);
db.prepare('INSERT INTO verbruik (gebruiker_id, tijd, usd, url) VALUES (1, ?, 0, ?)').run(oud, 'https://oud.test/kavel');
db.prepare('INSERT INTO verbruik (gebruiker_id, tijd, usd, url) VALUES (1, ?, 0, NULL)').run(Date.now() - 500 * 864e5);
db.prepare('INSERT INTO pogingen (email, tijd) VALUES (?, ?)').run('oud@voorbeeld.nl', Date.now() - 2 * 864e5);
db.prepare("INSERT INTO gebruikers (email, email_kanon, wachtwoord_hash, zout, plan, aangemaakt, email_geverifieerd) VALUES ('nooit@voorbeeld.nl', 'nooit@voorbeeld.nl', 'x', 'y', 'gratis', ?, 0)").run(Date.now() - 8 * 864e5);
db.prepare("INSERT INTO gebruikers (email, email_kanon, wachtwoord_hash, zout, plan, aangemaakt, email_geverifieerd) VALUES ('net@voorbeeld.nl', 'net@voorbeeld.nl', 'x', 'y', 'gratis', ?, 0)").run(Date.now() - 2 * 864e5);
const actieveSessies = db.prepare('SELECT COUNT(*) AS n FROM sessies WHERE verloopt > ?').get(Date.now()).n;
const v = await opruimen(env);
check('Verlopen sessies weg, geldige blijven', !db.prepare("SELECT 1 FROM sessies WHERE token_hash = 'verlopen'").get() && db.prepare('SELECT COUNT(*) AS n FROM sessies WHERE verloopt > ?').get(Date.now()).n === actieveSessies - (v['onbevestigd-sessies'] || 0));
check('Oude prijscache en pogingen weg', !db.prepare("SELECT 1 FROM prijscache WHERE sleutel = 'oud'").get() && !db.prepare("SELECT 1 FROM pogingen WHERE email = 'oud@voorbeeld.nl'").get());
check('Links in verbruik na 90 dagen gewist, regels na 400 dagen weg', !db.prepare("SELECT 1 FROM verbruik WHERE url = 'https://oud.test/kavel'").get() && db.prepare('SELECT COUNT(*) AS n FROM verbruik WHERE tijd = ?').get(oud).n === 1 && !db.prepare('SELECT 1 FROM verbruik WHERE tijd < ?').get(Date.now() - 400 * 864e5));
check('Onbevestigd account > 7 dagen weg, recent blijft', !db.prepare("SELECT 1 FROM gebruikers WHERE email = 'nooit@voorbeeld.nl'").get() && !!db.prepare("SELECT 1 FROM gebruikers WHERE email = 'net@voorbeeld.nl'").get());
check('Bevestigde accounts blijven', !!db.prepare("SELECT 1 FROM gebruikers WHERE email = 'jan@voorbeeld.nl'").get() && !Object.values(v).includes('fout'), v);

// ── 13. Kavels per regel ──
const rk = await api('POST', '/api/registreer', { email: 'kavels@voorbeeld.nl', wachtwoord: 'geheim123' });
const tkK = rk.data.token, idK = db.prepare("SELECT id FROM gebruikers WHERE email = 'kavels@voorbeeld.nl'").get().id;
r = await api('PUT', '/api/kavels', { wijzig: [{ id: 1, titel: 'x' }] }, tkK);
check('Kavels opslaan vóór bevestigen e-mail → 403', r.status === 403);
await bevestig(tkK, 'kavels@voorbeeld.nl');
// Oude opslag: één regel met de hele lijst
db.prepare('INSERT INTO kavels (gebruiker_id, data, bijgewerkt) VALUES (?, ?, ?)').run(idK, JSON.stringify([{ id: 11, titel: 'Oud A' }, { id: 12, titel: 'Oud B' }]), Date.now());
r = await api('GET', '/api/kavels', null, tkK);
check('Oude kavels worden overgezet naar één regel per kavel', r.data.kavels.length === 2 && db.prepare('SELECT COUNT(*) AS n FROM kavel_items WHERE gebruiker_id = ?').get(idK).n === 2 && !db.prepare('SELECT 1 FROM kavels WHERE gebruiker_id = ?').get(idK));
r = await api('PUT', '/api/kavels', { wijzig: [{ id: 12, titel: 'Oud B bijgewerkt' }, { id: 13, titel: 'Nieuw C' }], verwijder: [11] }, tkK);
const titels = db.prepare('SELECT data FROM kavel_items WHERE gebruiker_id = ? ORDER BY id').all(idK).map(x => JSON.parse(x.data).titel);
check('Alleen wijzigingen sturen: bijwerken, toevoegen en verwijderen', r.status === 200 && r.data.aantal === 2 && JSON.stringify(titels) === '["Oud B bijgewerkt","Nieuw C"]', titels);
r = await api('PUT', '/api/kavels', { wijzig: [{ id: 14, titel: 'x'.repeat(120000) }] }, tkK);
check('Te groot kavel → 413 met uitleg', r.status === 413 && r.data.code === 'kavel_groot');
const groot = Array.from({ length: 600 }, (_, i) => ({ id: 'g' + i, titel: 'Kavel ' + i, thumb: 'data:image/jpeg;base64,' + 'A'.repeat(4000), prijzen: { tweedehands: [{ titel: 'advertentie', prijs: 10 }] } }));
r = await api('PUT', '/api/kavels', { wijzig: groot.slice(0, 300) }, tkK);
const r2b = await api('PUT', '/api/kavels', { wijzig: groot.slice(300) }, tkK);
r = await api('GET', '/api/kavels', null, tkK);
check('600 kavels met foto (ruim 2 MB samen) opslaan en lezen', r2b.status === 200 && r.data.kavels.length === 602 && r.data.aantal === 602, r.data.aantal);
r = await api('PUT', '/api/kavels', { kavels: [{ id: 13, titel: 'Nieuw C' }] }, tkK);
check('Oudere app-versie (hele lijst) blijft werken', r.status === 200 && r.data.aantal === 1);
db.prepare('UPDATE kavel_items SET bijgewerkt = ?, data = ? WHERE gebruiker_id = ?').run(Date.now() - 400 * 864e5, JSON.stringify({ id: 13, titel: 'Nieuw C', mp_gemiddeld: 80, prijzen: { marktplaats: { gemiddeld: 80 }, tweedehands: [{ prijs: 1 }] }, pagina: { titel: 't', opmerkingen: ['lang'] } }), idK);
await opruimen(env);
const verkleind = JSON.parse(db.prepare('SELECT data FROM kavel_items WHERE gebruiker_id = ?').get(idK).data);
check('Na een jaar: advertentielijst eruit, resultaat blijft', verkleind.verkleind === true && !verkleind.prijzen.tweedehands && verkleind.prijzen.marktplaats.gemiddeld === 80 && verkleind.mp_gemiddeld === 80 && !verkleind.pagina.opmerkingen, verkleind);

// ── 14. Tegoed: bundels, abonnement eerst, limiet per uur, dagbudget ──
await bevestig(tkK, 'kavels@voorbeeld.nl');
r = await api('POST', '/api/afrekenen', { bundel: 'b25' }, tkK);
const afB = new URLSearchParams(aanroepen.filter(a => a.url.includes('checkout/sessions')).pop().opt.body);
check('Bundel kopen → eenmalige betaling met bundel in metadata', r.status === 200 && afB.get('mode') === 'payment' && afB.get('line_items[0][price]') === 'price_b25' && afB.get('metadata[bundel]') === 'b25');
r = await api('POST', '/api/afrekenen', { bundel: 'b60' }, tkK);
check('Bundel zonder Stripe-prijs is niet te koop → 400', r.status === 400);
const evB = { type: 'checkout.session.completed', data: { object: { id: 'cs_bundel_1', mode: 'payment', payment_status: 'paid', client_reference_id: String(idK), metadata: { bundel: 'b25', gebruiker_id: String(idK) } } } };
await webhook(evB); await webhook(evB);
r = await api('GET', '/api/account', null, tkK);
check('Bundel bijgeschreven, ook bij dubbele webhook maar één keer (2 welkom + 25)', r.data.tegoed === 27 && r.data.beschikbaar === 27, r.data.tegoed);
db.prepare("UPDATE gebruikers SET plan = 'af_en_toe' WHERE id = ?").run(idK);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/1300' }, tkK);
check('Met abonnement: eerst de maandanalyses, tegoed blijft staan', r.status === 200 && r.data.verbruik.tegoed === 27 && r.data.verbruik.beschikbaar === 29 + 27, r.data.verbruik);
for (let i = 0; i < 29; i++) db.prepare('INSERT INTO verbruik (gebruiker_id, tijd, usd) VALUES (?, ?, 0)').run(idK, Date.now() - 2 * 3600000);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/1301' }, tkK);
check('Maand op: daarna uit het tegoed', r.status === 200 && r.data.verbruik.tegoed === 26, r.data.verbruik);
for (let i = 0; i < 58; i++) db.prepare('INSERT INTO pogingen (email, tijd) VALUES (?, ?)').run('analyse:' + idK, Date.now() - 60000);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/1302' }, tkK);
check('Standaard 60 pogingen per uur → 429, tegoed niet aangesproken', r.status === 429 && /60 per uur/.test(r.data.fout) && db.prepare('SELECT saldo FROM tegoed WHERE gebruiker_id = ?').get(idK).saldo === 26, r.data);
db.prepare("UPDATE gebruikers SET plan = 'handelaar' WHERE id = ?").run(idK);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/1303' }, tkK);
check('Handelaar mag 120 per uur', r.status === 200, r.data && r.data.fout);
db.prepare('DELETE FROM verbruik WHERE gebruiker_id = ? AND tijd > ?').run(idK, Date.now() - 3600000 + 1000);
const betalend = db.prepare("SELECT (SELECT COUNT(*) FROM gebruikers WHERE plan != 'gratis') + (SELECT COUNT(DISTINCT gebruiker_id) FROM aankopen WHERE tijd > ?) AS n").get(Date.now() - 30 * 864e5).n;
db.prepare('INSERT INTO verbruik (gebruiker_id, tijd, usd) VALUES (98, ?, ?)').run(Date.now(), 20 + betalend - 0.5);
const mails1 = aanroepen.filter(a => a.url.includes('resend') && JSON.parse(a.opt.body).to[0] === 'eigenaar@test.nl').length;
env.EIGENAAR_EMAIL = 'eigenaar@test.nl';
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/1304' }, tkK);
check('Dagbudget groeit mee met betalende klanten ($20 + $1 per klant)', r.status === 200, r.data && r.data.fout);
const naarEigenaar = () => aanroepen.filter(a => a.url.includes('resend') && JSON.parse(a.opt.body).to[0] === 'eigenaar@test.nl');
check('Bijna vol dagbudget → e-mail aan de eigenaar', naarEigenaar().length === mails1 + 1 && /bijna/i.test(JSON.parse(naarEigenaar().pop().opt.body).subject));
db.prepare('UPDATE verbruik SET usd = usd + 5 WHERE gebruiker_id = 98').run();
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/1305' }, tkK);
await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/1306' }, tkK);
check('Vol dagbudget → 503, en hooguit één e-mail per 6 uur', r.status === 503 && naarEigenaar().length === mails1 + 2, naarEigenaar().length - mails1);
db.prepare('DELETE FROM verbruik WHERE gebruiker_id = 98').run();
r = await api('GET', '/api/mijn-gegevens', null, tkK);
check('Download bevat tegoed en aankopen', r.data.account.tegoed === 26 && r.data.aankopen.length === 1 && r.data.aankopen[0].analyses === 25, r.data.account);

// ── 15. Foto's en Marktplaats ──
db.prepare("UPDATE gebruikers SET plan = 'handelaar' WHERE id = ?").run(idK);
r = await api('POST', '/api/analyse', { url: 'https://www.marktplaats.nl/v/audio/m123-speaker' }, tkK);
check('Marktplaats-link als kavel → 400 met uitleg', r.status === 400 && r.data.code === 'marktplaats');
anthropicBodies.length = 0;
const foto = { media_type: 'image/jpeg', data: Buffer.from('nepfoto'.repeat(40)).toString('base64') };
anthropicAntwoord = (b) => {
  anthropicBodies.push(b);
  if (b.system.startsWith('Je leest veilingkavels')) return { content: [{ type: 'text', text: JSON.stringify(Object.assign({}, STAP1, { foto: { herkend: 'iPhone 13 blauw', gebreken: ['kras op het scherm'] } })) }], stop_reason: 'end_turn', usage: { input_tokens: 9000, output_tokens: 400 } };
  return { content: [{ type: 'text', text: JSON.stringify(STAP2) }], stop_reason: 'end_turn', usage: { input_tokens: 40000, output_tokens: 900 } };
};
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/2000', fotos: [foto, foto, { media_type: 'text/html', data: 'x' }], hergebruik: false }, tkK);
const s1 = anthropicBodies[0], s2 = anthropicBodies[1];
check('Foto\'s gaan als afbeelding mee naar stap 1 (ongeldige eruit)', r.status === 200 && Array.isArray(s1.messages[0].content) && s1.messages[0].content.filter(c => c.type === 'image').length === 2, r.data && r.data.fout);
check('Gezien op de foto\'s komt terug in de uitslag', r.data.pagina.foto && r.data.pagina.foto.gebreken[0] === 'kras op het scherm' && r.data.pagina.foto.aantal === 2, r.data.pagina.foto);
check('Marktplaats en 2dehands staan op de blokkadelijst van web_fetch (stap 1 en 2)', s1.tools[0].blocked_domains.includes('marktplaats.nl') && s2.tools[0].blocked_domains.includes('2dehands.be'));
check('Stap 2 noemt geen Marktplaats-pagina om te openen, wel eBay en bol.com', !/marktplaats\.nl\/q\//.test(s2.messages[0].content) && /ebay\.nl/.test(s2.messages[0].content) && /bol\.com/.test(s2.messages[0].content));
anthropicBodies.length = 0;
r = await api('POST', '/api/analyse', { fotos: [foto] }, tkK);
check('Alleen foto\'s, zonder link: analyse lukt zonder webtools in stap 1', r.status === 200 && !anthropicBodies[0].tools, r.data && r.data.fout);

// ── 16. Feedback en reviews ──
const fbMails = naarEigenaar().length;
r = await api('POST', '/api/feedback', { soort: 'prijs', tekst: 'Marktplaats-prijs veel te hoog', kavel_url: 'https://www.testveiling.nl/kavel/2000', product: 'iPhone 13' }, tkK);
check('Feedback opgeslagen en eigenaar krijgt een e-mail', r.status === 200 && db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE gebruiker_id = ?').get(idK).n === 1 && naarEigenaar().length === fbMails + 1);
await api('POST', '/api/feedback', { soort: 'product', tekst: 'tweede' }, tkK);
check('Tweede feedback binnen 6 uur: wel opgeslagen, geen extra e-mail', db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE gebruiker_id = ?').get(idK).n === 2 && naarEigenaar().length === fbMails + 1);
const rNieuw = await api('POST', '/api/registreer', { email: 'nogniks@voorbeeld.nl', wachtwoord: 'geheim123' });
await bevestig(rNieuw.data.token, 'nogniks@voorbeeld.nl');
r = await api('POST', '/api/review', { sterren: 5, tekst: 'Super app, echt waar!', naam: 'Nep' }, rNieuw.data.token);
check('Review zonder analyse → 403', r.status === 403 && r.data.code === 'geen_analyse');
r = await api('POST', '/api/review', { sterren: 9, tekst: 'Goed', naam: 'Kees' }, tkK);
check('Ongeldige sterren of te korte tekst → 400', r.status === 400);
r = await api('POST', '/api/review', { sterren: 4, tekst: 'Handig om snel te zien tot hoeveel ik kan bieden.', naam: 'Kees uit Tilburg' }, tkK);
await api('POST', '/api/review', { sterren: 2, tekst: 'Toch maar 2 sterren, prijzen soms te hoog.', naam: 'Kees uit Tilburg' }, tkK);
r = await api('GET', '/api/reviews');
check('Eén review per account (bijwerken), negatief blijft zichtbaar, gemiddelde klopt', r.data.aantal === 1 && r.data.reviews[0].sterren === 2 && r.data.gemiddelde === 2 && /beloning/.test(r.data.uitleg), r.data);
db.prepare('UPDATE reviews SET zichtbaar = 0 WHERE gebruiker_id = ?').run(idK);
check('Verborgen review telt niet mee', (await api('GET', '/api/reviews')).data.aantal === 0);
r = await api('GET', '/api/mijn-gegevens', null, tkK);
check('Download bevat feedback en review', r.data.feedback.length === 2 && r.data.review && r.data.review.sterren === 2);
await api('POST', '/api/review-verwijderen', null, tkK);
check('Eigen review verwijderen', !db.prepare('SELECT 1 FROM reviews WHERE gebruiker_id = ?').get(idK));

// ── 17. Bevindingen van de veiligheidscontrole ──
globalThis.fetch = (orig => async (url, opt) => {
  url = String(url);
  if (url === 'https://www.testveiling.nl/doorsturen') return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
  if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) return new Response(JSON.stringify({ data: [{ id: 'sub_a', status: 'active' }, { id: 'sub_b', status: 'active' }, { id: 'sub_oud', status: 'canceled' }] }), { status: 200 });
  return orig(url, opt);
})(globalThis.fetch);
const rs = await api('POST', '/api/registreer', { email: 'veilig@voorbeeld.nl', wachtwoord: 'geheim123' });
const tkS = rs.data.token, idS = db.prepare("SELECT id FROM gebruikers WHERE email = 'veilig@voorbeeld.nl'").get().id;
await bevestig(tkS, 'veilig@voorbeeld.nl');
// Mislukte analyse: tegoed terug, kosten wel geteld
const bewaar = anthropicAntwoord;
anthropicAntwoord = (b) => b.system.startsWith('Je leest veilingkavels')
  ? { content: [{ type: 'text', text: JSON.stringify(STAP1) }], stop_reason: 'end_turn', usage: { input_tokens: 8000, output_tokens: 400 } }
  : { content: [{ type: 'text', text: 'geen json' }], stop_reason: 'end_turn', usage: { input_tokens: 40000, output_tokens: 900 } };
const dagVoor = db.prepare('SELECT COALESCE(SUM(usd),0) AS u FROM verbruik WHERE gebruiker_id = 0').get().u;
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/3000', hergebruik: false }, tkS);
check('Mislukte analyse: tegoed blijft 2', r.status >= 500 && db.prepare('SELECT saldo FROM tegoed WHERE gebruiker_id = ?').get(idS).saldo === 2, r.status);
check('Mislukte analyse: AI-kosten tellen wel mee voor het dagbudget', db.prepare('SELECT COALESCE(SUM(usd),0) AS u FROM verbruik WHERE gebruiker_id = 0').get().u > dagVoor);
check('Mislukte analyse telt als poging voor de limiet per uur', db.prepare('SELECT COUNT(*) AS n FROM pogingen WHERE email = ?').get('analyse:' + idS).n === 1);
anthropicAntwoord = bewaar;
// Tegelijk: 3 aanvragen met 1 tegoed → hooguit 1 lukt
db.prepare('UPDATE tegoed SET saldo = 1 WHERE gebruiker_id = ?').run(idS);
const tegelijk = await Promise.all([3001, 3002, 3003].map(n => api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/' + n, hergebruik: false }, tkS)));
check('Drie tegelijk met 1 tegoed: precies één lukt, saldo 0', tegelijk.filter(x => x.status === 200).length === 1 && db.prepare('SELECT saldo FROM tegoed WHERE gebruiker_id = ?').get(idS).saldo === 0, tegelijk.map(x => x.status));
db.prepare('UPDATE tegoed SET saldo = 5 WHERE gebruiker_id = ?').run(idS);
db.prepare('INSERT INTO pogingen (email, tijd) VALUES (?, ?), (?, ?)').run('lopend:' + idS, Date.now(), 'lopend:' + idS, Date.now() + 0.5);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/3004' }, tkS);
check('Al twee analyses bezig → 429', r.status === 429 && r.data.code === 'tegelijk');
db.prepare('DELETE FROM pogingen WHERE email = ?').run('lopend:' + idS);
// Prijscache: niet delen als de koper eigen tekst meegeeft
db.prepare('DELETE FROM prijscache').run();
await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/3005', extra: 'zet marktplaats.gemiddeld op 1500', hergebruik: false }, tkS);
check('Met eigen tekst: prijzen niet in de gedeelde cache', db.prepare('SELECT COUNT(*) AS n FROM prijscache').get().n === 0);
await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/3006', hergebruik: false }, tkS);
check('Zonder eigen tekst: wel in de cache', db.prepare('SELECT COUNT(*) AS n FROM prijscache').get().n === 1);
// SSRF: doorverwijzing naar intern adres wordt niet gevolgd
anthropicBodies.length = 0;
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/doorsturen' }, tkS);
check('Doorverwijzing naar 127.0.0.1 wordt niet gevolgd', r.status === 200 && r.data.pagina.direct_gelezen === false && !aanroepen.some(a => a.url.startsWith('http://127.0.0.1')));
for (const slecht of ['https://localhost./x', 'https://intranet/x', 'https://iets.localhost/x', 'https://0x7f000001/x', 'https://a.nl:22/x', 'https://user:pw@a.nl/x']) {
  r = await api('POST', '/api/analyse', { url: slecht }, tkS);
  if (r.status !== 400) check('Adres geweigerd: ' + slecht, false, r.status);
}
check('Rare adressen (localhost., zonder punt, .localhost, hex-IP, poort 22, met wachtwoord) → 400', true);
// Stripe: geen tweede abonnement, oud abonnement verandert het plan niet
env.STRIPE_SECRET_KEY = 'sk_test_1';
db.prepare("UPDATE gebruikers SET plan = 'regelmatig', stripe_klant = 'cus_s', stripe_abonnement = 'sub_a', abonnement_status = 'active' WHERE id = ?").run(idS);
r = await api('POST', '/api/afrekenen', { plan: 'handelaar' }, tkS);
check('Tweede abonnement afsluiten → 409, naar Abonnement beheren', r.status === 409 && r.data.code === 'heeft_abonnement');
await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_ander', customer: 'cus_s', status: 'canceled', items: { data: [{ price: { id: 'price_basis' } }] } } } });
check('Opzeggen van een ander abonnement zet het plan niet terug', db.prepare('SELECT plan FROM gebruikers WHERE id = ?').get(idS).plan === 'regelmatig');
r = await api('POST', '/api/account-verwijderen', { wachtwoord: 'geheim123' }, tkS);
const gestopt = aanroepen.filter(a => /\/subscriptions\/sub_[ab]$/.test(a.url) && a.opt.method === 'DELETE').map(a => a.url.split('/').pop());
check('Account verwijderen stopt alle lopende abonnementen van de klant', r.status === 200 && gestopt.includes('sub_a') && gestopt.includes('sub_b') && !gestopt.includes('sub_oud'), gestopt);
// Code bevestigen: gelijktijdig gokken helpt niet
const rc = await api('POST', '/api/registreer', { email: 'gokker@voorbeeld.nl', wachtwoord: 'geheim123' });
const gok = await Promise.all(Array.from({ length: 12 }, (_, i) => api('POST', '/api/verifieer', { code: String(100000 + i) }, rc.data.token)));
check('12 gelijktijdige gokken: hooguit 5 tellen als poging', gok.filter(x => x.data && x.data.code === 'onjuist').length <= 5 && db.prepare("SELECT pogingen FROM verificatie v JOIN gebruikers g ON g.id = v.gebruiker_id WHERE g.email = 'gokker@voorbeeld.nl'").get().pogingen === 5);
r = await verwerk(new Request('https://server.test/api/inloggen', { method: 'POST', headers: { 'Content-Length': '9999999', 'Content-Type': 'application/json' }, body: '{}' }), env);
check('Te groot verzoek volgens Content-Length → 413', r.status === 413);

// ── 18. Voertuigen: kenteken, RDW en ruimer zoeken ──
check('Kenteken herkennen en controleren', K.normKenteken('hgj-13-b') === 'HGJ13B' && K.kentekenMetStreepjes('HGJ13B') === 'HGJ-13-B' && K.kentekenMetStreepjes('12abc3') === '12-ABC-3' && K.normKenteken('ABCDEF') === null && K.normKenteken('123456') === null);
check('Kenteken uit de link van een kavel', K.vindKenteken('https://www.hnvi.nl/veiling-kavel/mg-e-hs-plug-in-hybride-met-kenteken-hgj-13-b-luxury/197287') === 'HGJ13B' && K.vindKenteken('model 2023, 12 34 x') === null);
const RDW_AUTO = [{ kenteken: 'HGJ13B', voertuigsoort: 'Personenauto', merk: 'MG', handelsbenaming: 'MG HS', vervaldatum_apk: '20290321', inrichting: 'hatchback', eerste_kleur: 'GRIJS', datum_eerste_toelating: '20250321', catalogusprijs: '42891', tellerstandoordeel: 'Logisch', jaar_laatste_registratie_tellerstand: '2025', export_indicator: 'Nee', openstaande_terugroepactie_indicator: 'Nee', taxi_indicator: 'Nee', wam_verzekerd: 'Ja' }];
const RDW_BRANDSTOF = [{ kenteken: 'HGJ13B', brandstof_omschrijving: 'Elektriciteit', klasse_hybride_elektrisch_voertuig: 'OVC-HEV' }, { kenteken: 'HGJ13B', brandstof_omschrijving: 'Benzine', klasse_hybride_elektrisch_voertuig: 'OVC-HEV' }];
const rdwN = K.normRdw(RDW_AUTO, RDW_BRANDSTOF);
check('RDW-gegevens omzetten', rdwN.kenteken === 'HGJ-13-B' && rdwN.aandrijving === 'plug-in hybride' && rdwN.bouwjaar === 2025 && rdwN.catalogusprijs === 42891 && rdwN.eerste_toelating === '2025-03-21' && rdwN.apk_tot === '2029-03-21', rdwN);
globalThis.fetch = (orig => async (url, opt) => {
  url = String(url);
  if (url.startsWith('https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=HGJ13B')) { aanroepen.push({ url, opt }); return new Response(JSON.stringify(RDW_AUTO), { status: 200 }); }
  if (url.startsWith('https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=HGJ13B')) { aanroepen.push({ url, opt }); return new Response(JSON.stringify(RDW_BRANDSTOF), { status: 200 }); }
  if (url.startsWith('https://opendata.rdw.nl/')) { aanroepen.push({ url, opt }); return new Response('[]', { status: 200 }); }
  return orig(url, opt);
})(globalThis.fetch);
const AUTO1 = Object.assign({}, STAP1, { titel: 'MG eHS Plug-in Hybride met kenteken HGJ-13-B', voertuig: true, kenteken: 'HGJ-13-B', kilometerstand: 38000, product: { merk: 'MG', model: 'eHS', variant: 'Luxury', zoekterm: 'MG eHS PHEV Luxury' } });
const AUTO2 = Object.assign({}, STAP2, { nieuwprijs: 99, nieuwprijs_bron: 'bol.com', marktplaats: { laag: 28500, gemiddeld: 30000, hoog: 31500, vertrouwen: 'middel', aantal_vergelijkbaar: 4 }, handelaar: { laag: 32495, hoog: 34495, aantal: 3 } });
anthropicBodies.length = 0;
anthropicAntwoord = (b) => {
  anthropicBodies.push(b);
  if (b.system.startsWith('Je leest veilingkavels')) return { content: [{ type: 'text', text: JSON.stringify(AUTO1) }], stop_reason: 'end_turn', usage: { input_tokens: 9000, output_tokens: 400 } };
  return { content: [{ type: 'text', text: JSON.stringify(AUTO2) }], stop_reason: 'end_turn', usage: { input_tokens: 40000, output_tokens: 900 } };
};
db.prepare("UPDATE gebruikers SET plan = 'handelaar' WHERE id = ?").run(idK);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/auto-1', hergebruik: false }, tkK);
const v2 = anthropicBodies[1];
check('Auto: RDW opgezocht en in de uitslag', r.status === 200 && r.data.pagina.rdw && r.data.pagina.rdw.model === 'MG HS' && r.data.pagina.voertuig === true, r.data && (r.data.fout || r.data.pagina));
check('Auto: catalogusprijs RDW als nieuwprijs (niet bol.com)', r.data.prijzen.nieuwprijs === 42891 && /RDW/.test(r.data.prijzen.nieuwprijs_bron));
check('Auto: vraagprijzen autobedrijven apart', r.data.prijzen.voertuig === true && r.data.prijzen.handelaar && r.data.prijzen.handelaar.laag === 32495 && r.data.prijzen.marktplaats.gemiddeld === 30000);
const zoek = v2 && v2.tools.find(t => t.name === 'web_search');
check('Auto: 3 zoekopdrachten, geen eBay/bol.com, autosites niet openen', zoek && zoek.max_uses === 3 && !/bol\.com|ebay\.nl/.test(v2.messages[0].content) && v2.tools[0].blocked_domains.includes('autoscout24.nl') && /RDW/.test(v2.messages[0].content) && /38000 km/.test(v2.messages[0].content));
const tokRij = JSON.parse(db.prepare('SELECT tokens FROM verbruik WHERE gebruiker_id = ? ORDER BY id DESC LIMIT 1').get(idK).tokens || 'null');
check('Tokens per analyse bewaard (in, uit, aanroepen)', tokRij && tokRij.in === 49000 && tokRij.uit === 1300 && tokRij.aanroepen === 2, tokRij);
check('Auto: prijzen alleen gedeeld per kenteken', db.prepare("SELECT COUNT(*) AS n FROM prijscache WHERE sleutel LIKE 'voertuig:HGJ13B|%'").get().n === 1);
AUTO1.kenteken = 'ZZ-99-ZZ'; AUTO1.titel = 'Auto zonder bekend kenteken';
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/auto-2', hergebruik: false }, tkK);
check('Onbekend kenteken: analyse lukt wel, met waarschuwing', r.status === 200 && !r.data.pagina.rdw && r.data.waarschuwingen.some(w => /niet gevonden bij de RDW/.test(w)), r.data && r.data.waarschuwingen);

// Te lang antwoord: één keer laten doorschrijven en de twee delen samenvoegen
{
  const stukken = JSON.stringify(Object.assign({}, STAP2, { marktplaats: { laag: 100, gemiddeld: 120, hoog: 140, vertrouwen: 'middel' } }));
  const helft = Math.floor(stukken.length / 2);
  let ronde = 0, tweedeBody = null;
  const res = await K.vraagClaude({ system: 's', prompt: 'p', maxTokens: 50, model: 'claude-haiku-5-5' }, { anthropic: async (b) => {
    ronde++;
    if (ronde === 1) return { content: [{ type: 'text', text: 'Hier is het: ' + stukken.slice(0, helft) + '  ' }], stop_reason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 50 } };
    tweedeBody = b;
    return { content: [{ type: 'text', text: stukken.slice(helft) }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 50 } };
  } });
  const slot = tweedeBody && tweedeBody.messages[1].content.slice(-1)[0];
  check('Afgebroken antwoord wordt doorgeschreven en samengevoegd', ronde === 2 && res.json && res.json.marktplaats.gemiddeld === 120 && slot && !/\s$/.test(slot.text));
}

// ── 19. Geen foutmelding als het te vermijden is ──
const rh = await api('POST', '/api/registreer', { email: 'herstel@voorbeeld.nl', wachtwoord: 'geheim123' });
await bevestig(rh.data.token, 'herstel@voorbeeld.nl');
const tkH = rh.data.token, idH = db.prepare("SELECT id FROM gebruikers WHERE email = 'herstel@voorbeeld.nl'").get().id;
db.prepare("UPDATE gebruikers SET plan = 'handelaar' WHERE id = ?").run(idH);
const stap1Antw = { content: [{ type: 'text', text: JSON.stringify(STAP1) }], stop_reason: 'end_turn', usage: { input_tokens: 8000, output_tokens: 400 } };
let systemen = [];
anthropicAntwoord = (b) => {
  systemen.push(b.system.slice(0, 40));
  if (b.system.startsWith('Je leest veilingkavels')) return stap1Antw;
  if (b.system.startsWith('Je zet de resultaten')) return { content: [{ type: 'text', text: JSON.stringify(STAP2) }], stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 600 } };
  return { content: [
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'iphone 13 marktplaats' } },
    { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://www.marktplaats.nl/v/x/m1-iphone', title: 'iPhone 13 128GB € 450', encrypted_content: 'x' }] },
    { type: 'text', text: 'Ik vond een iPhone 13 voor € 450 en {"marktplaats": afgebroken' }], stop_reason: 'max_tokens', usage: { input_tokens: 30000, output_tokens: 6000, server_tool_use: { web_search_requests: 1 } } };
};
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/5000', hergebruik: false }, tkH);
check('Onbruikbaar prijsantwoord → herstelstap zonder zoeken, geen foutmelding', r.status === 200 && r.data.prijzen.hersteld === true && r.data.prijzen.live === true && systemen.some(x => x.startsWith('Je zet de resultaten')), r.data && (r.data.fout || systemen));
systemen = [];
anthropicAntwoord = (b) => {
  systemen.push(b.system.slice(0, 40));
  if (b.system.startsWith('Je leest veilingkavels')) return stap1Antw;
  if (/zonder internettoegang/.test(b.system)) return { content: [{ type: 'text', text: JSON.stringify(STAP2) }], stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 400 } };
  return { content: [{ type: 'text', text: 'geen json' }], stop_reason: 'end_turn', usage: { input_tokens: 30000, output_tokens: 900 } };
};
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/5001', hergebruik: false }, tkH);
check('Ook herstel mislukt → gemarkeerde schatting in plaats van foutmelding', r.status === 200 && r.data.prijzen.live === false && r.data.waarschuwingen.some(w => /lukte deze keer niet/.test(w)), r.data && (r.data.fout || r.data.waarschuwingen));
// AI-dienst even druk: de server probeert het zelf opnieuw
let drukTeller = 0;
anthropicAntwoord = (b) => b.system.startsWith('Je leest veilingkavels') ? stap1Antw : { content: [{ type: 'text', text: JSON.stringify(STAP2) }], stop_reason: 'end_turn', usage: { input_tokens: 30000, output_tokens: 900 } };
globalThis.fetch = (orig => async (url, opt) => {
  if (String(url).startsWith('https://api.anthropic.com/') && drukTeller++ === 0) return new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), { status: 529 });
  return orig(url, opt);
})(globalThis.fetch);
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/5002', hergebruik: false }, tkH);
check('AI-dienst één keer druk → server probeert zelf opnieuw, klant ziet geen fout', r.status === 200 && drukTeller >= 2, r.status);
// Drie mislukkingen kort na elkaar → even pauze, zonder AI-kosten
anthropicAntwoord = () => ({ content: [{ type: 'text', text: 'geen json' }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 10 } });
for (const n of [1, 2, 3]) await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/510' + n, hergebruik: false }, tkH);
const aiVoor = aanroepen.filter(a => a.url.startsWith('https://api.anthropic.com/')).length;
r = await api('POST', '/api/analyse', { url: 'https://www.testveiling.nl/kavel/5104', hergebruik: false }, tkH);
check('Na 3 mislukte analyses in een half uur: even wachten, geen nieuwe AI-kosten', r.status === 429 && r.data.code === 'even_wachten' && aanroepen.filter(a => a.url.startsWith('https://api.anthropic.com/')).length === aiVoor, r.data);

// ── 20. Agenda-abonnement ──
const ra = await api('POST', '/api/registreer', { email: 'agenda@voorbeeld.nl', wachtwoord: 'geheim123' });
await bevestig(ra.data.token, 'agenda@voorbeeld.nl');
const tkA = ra.data.token, idA = db.prepare("SELECT id FROM gebruikers WHERE email = 'agenda@voorbeeld.nl'").get().id;
const over = m => new Date(Date.now() + m * 60000).toISOString();
await api('PUT', '/api/kavels', { wijzig: [
  { id: 'a1', titel: 'Boormachine, met; komma', maxBod: 120, url: 'https://www.testveiling.nl/kavel/a1', pagina: { sluit_iso: over(12) } },
  { id: 'a2', titel: 'Gewonnen kavel', status: 'gewonnen', pagina: { sluit_iso: over(12) } },
  { id: 'a3', titel: 'Stil kavel', geen_melding: true, pagina: { sluit_iso: over(12) } },
  { id: 'a4', titel: 'Al gesloten', pagina: { sluit_iso: over(-3) } },
  { id: 'a5', titel: 'Zonder sluittijd' } ] }, tkA);
const sluitA1 = db.prepare("SELECT sluit FROM kavel_items WHERE gebruiker_id = ? AND id = 'a1'").get(idA).sluit;
check('Sluittijd als kolom bewaard bij opslaan', Math.abs(sluitA1 - (Date.now() + 12 * 60000)) < 5000 && db.prepare("SELECT sluit FROM kavel_items WHERE gebruiker_id = ? AND id = 'a5'").get(idA).sluit === null, sluitA1);
r = await api('POST', '/api/agenda-link', { nieuw: true }, tkA);
const agendaUrl = r.data && r.data.url;
check('Agendalink gemaakt (persoonlijk token, alleen de hash bewaard)', /^https:\/\/server\.test\/api\/agenda\/[0-9a-f]{48}\.ics$/.test(agendaUrl) && !db.prepare('SELECT token_hash FROM agenda WHERE gebruiker_id = ?').get(idA).token_hash.includes(agendaUrl.split('/').pop().slice(0, 48)), agendaUrl);
const feed = await verwerk(new Request(agendaUrl), env);
const ics = await feed.text();
check('Agenda: geldige ics met de open kavels, herinnering, tekens ontsnapt', feed.status === 200 && /text\/calendar/.test(feed.headers.get('content-type')) && ics.startsWith('BEGIN:VCALENDAR') && ics.includes('Boormachine\\, met\\; komma') && ics.includes('TRIGGER:PT0M') && ics.includes('Stil kavel') && !ics.includes('Gewonnen kavel') && !ics.includes('Zonder sluittijd') && ics.split('\r\n').every(l => l.length <= 75), ics.slice(0, 200));
r = await api('POST', '/api/agenda-link', { nieuw: true }, tkA);
const oudFeed = await verwerk(new Request(agendaUrl), env);
const nieuwFeed = await verwerk(new Request(r.data.url), env);
check('Nieuwe agendalink: oude werkt niet meer, nieuwe wel', oudFeed.status === 404 && nieuwFeed.status === 200);
const onzin = await verwerk(new Request('https://server.test/api/agenda/' + 'a'.repeat(48) + '.ics'), env);
check('Onbekend agendatoken → 404', onzin.status === 404);

// ── 21. Meldingen (Web Push) ──
r = await api('GET', '/api/push-sleutel');
const vapidPubliek = r.data.sleutel;
check('Publieke VAPID-sleutel (65 bytes) wordt één keer gemaakt en daarna hergebruikt', Buffer.from(vapidPubliek, 'base64url').length === 65 && (await api('GET', '/api/push-sleutel')).data.sleutel === vapidPubliek);
const ua = createECDH('prime256v1'); ua.generateKeys();
const uaAuth = Buffer.from('0123456789abcdef');
const abon = ep => ({ endpoint: ep, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: uaAuth.toString('base64url') } });
for (const slecht of ['https://127.0.0.1/push', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.test/x', 'https://evil.test/fcm.googleapis.com']) {
  r = await api('POST', '/api/push-aan', { abonnement: abon(slecht) }, tkA);
  if (r.status !== 400) check('Meldingsadres geweigerd: ' + slecht, false, r.status);
}
check('Alleen pushdiensten van browsers als meldingsadres (geen intern adres, geen nep-domein)', true);
r = await api('POST', '/api/push-aan', { abonnement: abon('https://fcm.googleapis.com/fcm/send/abc123'), minuten: 15, bij_sluiting: true }, tkA);
check('Meldingen aanzetten', r.status === 200 && db.prepare('SELECT COUNT(*) AS n FROM push_abonnementen WHERE gebruiker_id = ?').get(idA).n === 1);
const pushes = [];
let pushStatus = 201;
globalThis.fetch = (orig => async (url, opt) => {
  if (String(url).startsWith('https://fcm.googleapis.com/')) { pushes.push({ url: String(url), opt }); return new Response('', { status: pushStatus }); }
  return orig(url, opt);
})(globalThis.fetch);
// Ontsleutelen zoals de browser het doet (RFC 8291), met Node's eigen crypto: een onafhankelijke controle
function ontsleutel(body) {
  const b = Buffer.from(body);
  const zout = b.subarray(0, 16), idlen = b[20], asPubliek = b.subarray(21, 21 + idlen), geheim = b.subarray(21 + idlen);
  const gedeeld = ua.computeSecret(asPubliek);
  const ikm = Buffer.from(hkdfSync('sha256', gedeeld, uaAuth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPubliek]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, zout, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, zout, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(geheim.subarray(geheim.length - 16));
  const uit = Buffer.concat([d.update(geheim.subarray(0, geheim.length - 16)), d.final()]);
  if (uit[uit.length - 1] !== 2) throw new Error('geen laatste-record-teken');
  return JSON.parse(uit.subarray(0, uit.length - 1).toString());
}
function jwtKlopt(kop) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(kop);
  if (!m || m[2] !== vapidPubliek) return false;
  const [h, c, sig] = m[1].split('.');
  const pub = Buffer.from(vapidPubliek, 'base64url');
  const sleutel = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  return cryptoVerify('sha256', Buffer.from(h + '.' + c), { key: sleutel, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')) && claims.aud === 'https://fcm.googleapis.com' && claims.exp > Date.now() / 1000 && /^mailto:/.test(claims.sub);
}
let mv = await meldingenVersturen(env);
const p1 = pushes.map(p => ({ kop: p.opt.headers, bericht: ontsleutel(p.opt.body) }));
check('Herinnering 15 min voor sluiting: versleuteld, alleen voor het open kavel', p1.length === 2 && p1.some(p => /^Sluit over 1[12] min: Boormachine/.test(p.bericht.titel) && /Bied maximaal €120/.test(p.bericht.tekst) && p.bericht.url === '/app#kavel-a1') && p1.some(p => /^Veiling gesloten: Al gesloten/.test(p.bericht.titel)) && !p1.some(p => /Gewonnen|Stil/.test(p.bericht.titel)), p1.map(p => p.bericht.titel));
check('Push-koppen: aes128gcm, geldige VAPID-handtekening', pushes.every(p => p.opt.headers['Content-Encoding'] === 'aes128gcm' && jwtKlopt(p.opt.headers.Authorization)));
pushes.length = 0;
mv = await meldingenVersturen(env);
check('Geen dubbele meldingen bij de volgende ronde', pushes.length === 0, pushes.length);
db.prepare('DELETE FROM push_verstuurd').run();
pushStatus = 410;
mv = await meldingenVersturen(env);
check('Abonnement dat niet meer bestaat (410) wordt opgeruimd', db.prepare('SELECT COUNT(*) AS n FROM push_abonnementen WHERE gebruiker_id = ?').get(idA).n === 0);
pushStatus = 201;
await api('POST', '/api/push-aan', { abonnement: abon('https://fcm.googleapis.com/fcm/send/abc123') }, tkA);
pushes.length = 0;
r = await api('POST', '/api/push-test', {}, tkA);
check('Testmelding komt aan', r.status === 200 && pushes.length === 1 && ontsleutel(pushes[0].opt.body).titel === 'Meldingen werken');
r = await api('POST', '/api/push-uit', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' }, tkA);
check('Meldingen uitzetten', r.status === 200 && db.prepare('SELECT COUNT(*) AS n FROM push_abonnementen WHERE gebruiker_id = ?').get(idA).n === 0);
await api('POST', '/api/push-aan', { abonnement: abon('https://fcm.googleapis.com/fcm/send/abc123') }, tkA);
r = await api('GET', '/api/mijn-gegevens', null, tkA);
check('Meldingen en agendalink staan in Mijn gegevens', r.data.meldingen.length === 1 && r.data.agenda_link && r.data.agenda_link.gemaakt);
r = await api('POST', '/api/account-verwijderen', { wachtwoord: 'geheim123' }, tkA);
check('Account verwijderen wist meldingen en agendalink', r.status === 200 && !db.prepare('SELECT 1 FROM push_abonnementen WHERE gebruiker_id = ?').get(idA) && !db.prepare('SELECT 1 FROM agenda WHERE gebruiker_id = ?').get(idA) && !db.prepare('SELECT 1 FROM push_verstuurd WHERE gebruiker_id = ?').get(idA));

// ── 22. Terugbetaling en terugboeking van een bundel ──
const rr = await api('POST', '/api/registreer', { email: 'terug@voorbeeld.nl', wachtwoord: 'geheim123' });
const idR = db.prepare("SELECT id FROM gebruikers WHERE email = 'terug@voorbeeld.nl'").get().id;
const saldoR = () => db.prepare('SELECT saldo FROM tegoed WHERE gebruiker_id = ?').get(idR).saldo;
const voorR = saldoR();
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_terug_1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_terug_1', client_reference_id: String(idR), metadata: { bundel: 'b25', gebruiker_id: String(idR) } } } });
check('Bundel bijgeschreven met betaalnummer', saldoR() === voorR + 25 && db.prepare("SELECT betaling FROM aankopen WHERE stripe_sessie = 'cs_terug_1'").get().betaling === 'pi_terug_1');
await webhook({ type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_terug_1', amount: 499, amount_refunded: 499 } } });
await webhook({ type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_terug_1', amount: 499, amount_refunded: 499 } } });
check('Terugbetaald: de 25 analyses gaan er één keer af', saldoR() === voorR, saldoR());
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_terug_2', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_terug_2', client_reference_id: String(idR), metadata: { bundel: 'b25', gebruiker_id: String(idR) } } } });
db.prepare('UPDATE tegoed SET saldo = 5 WHERE gebruiker_id = ?').run(idR);
await webhook({ type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_terug_2', amount: 499 } } });
check('Teruggeboekt na gebruik: saldo niet onder 0', saldoR() === 0, saldoR());

// ── 23. Gratis analyses hooguit 3 keer per internetadres ──
const welkomVan = async (n) => {
  const r = await api('POST', '/api/registreer', { email: 'ipboer' + n + '@voorbeeld.nl', wachtwoord: 'geheim123' }, null, { 'CF-Connecting-IP': '203.0.113.7' });
  return r.data;
};
const w = [];
for (const n of [1, 2, 3, 4]) w.push(await welkomVan(n));
check('Vierde account vanaf hetzelfde adres krijgt geen gratis analyses, en hoort dat', w.slice(0, 3).every(x => x.welkom === 2 && !x.welkom_overgeslagen) && w[3].welkom === 0 && w[3].welkom_overgeslagen === true && w[3].account.tegoed === 0, w.map(x => x.welkom));

console.log('\n' + (aantal - fouten) + ' van ' + aantal + ' controles OK' + (fouten ? ' — ' + fouten + ' FOUT(EN)' : ''));
process.exit(fouten ? 1 : 0);
