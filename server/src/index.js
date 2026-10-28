// Veiling Analyser – server (Cloudflare Worker)
// Houdt de Anthropic-sleutel geheim, regelt accounts en abonnementen (Stripe),
// bewaakt de maandlimiet per abonnement en een dagbudget, en synchroniseert kavels.
import '../../kern.js';

const K = globalThis.VAKern;
const MAAND_MS = 30 * 864e5;
const SESSIE_DAGEN = 60;
const CACHE_DAGEN = 3;

// ── Abonnementen ─────────────────────────────────────────────────────────────
function plannen(env) {
  return {
    gratis: { naam: 'Gratis', limiet: Number(env.LIMIET_GRATIS || 5) },
    basis: { naam: 'Basis', limiet: Number(env.LIMIET_BASIS || 100), prijs: env.STRIPE_PRICE_BASIS },
    pro: { naam: 'Pro', limiet: Number(env.LIMIET_PRO || 500), prijs: env.STRIPE_PRICE_PRO }
  };
}
function planVanPrijs(env, prijsId) {
  const p = plannen(env);
  for (const k of Object.keys(p)) if (p[k].prijs && p[k].prijs === prijsId) return k;
  return null;
}

// ── HTTP-hulpjes ─────────────────────────────────────────────────────────────
class Fout extends Error {
  constructor(status, code, bericht) { super(bericht); this.status = status; this.code = code; }
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const toegestaan = String(env.APP_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = toegestaan.includes('*') || toegestaan.includes(origin);
  return ok ? {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  } : { 'Vary': 'Origin' };
}
function json(data, status, extra) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra || {}) });
}
async function leesJson(request, max) {
  const tekst = await request.text();
  if (tekst.length > (max || 100000)) throw new Fout(413, 'te_groot', 'Het verzoek is te groot.');
  try { return tekst ? JSON.parse(tekst) : {}; } catch (e) { throw new Fout(400, 'ongeldig', 'Ongeldige gegevens.'); }
}

// ── Crypto ───────────────────────────────────────────────────────────────────
const enc = new TextEncoder();
function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function willekeurig(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); }
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
// PBKDF2 met 100.000 rondes: het maximum dat Cloudflare Workers toestaat
async function hashWachtwoord(wachtwoord, zout) {
  const sleutel = await crypto.subtle.importKey('raw', enc.encode(wachtwoord), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(zout), iterations: 100000 }, sleutel, 256);
  return hex(bits);
}
function gelijk(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
async function hmacHex(geheim, bericht) {
  const sleutel = await crypto.subtle.importKey('raw', enc.encode(geheim), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', sleutel, enc.encode(bericht)));
}

// ── Accounts ─────────────────────────────────────────────────────────────────
function geldigEmail(e) { return typeof e === 'string' && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
async function maakSessie(env, gebruikerId) {
  const token = willekeurig(32);
  await env.DB.prepare('INSERT INTO sessies (token_hash, gebruiker_id, verloopt) VALUES (?, ?, ?)')
    .bind(await sha256(token), gebruikerId, Date.now() + SESSIE_DAGEN * 864e5).run();
  return token;
}
async function huidigeGebruiker(request, env) {
  const kop = request.headers.get('Authorization') || '';
  const token = kop.startsWith('Bearer ') ? kop.slice(7).trim() : '';
  if (!token) throw new Fout(401, 'niet_ingelogd', 'Log in om verder te gaan.');
  const rij = await env.DB.prepare('SELECT g.* FROM sessies s JOIN gebruikers g ON g.id = s.gebruiker_id WHERE s.token_hash = ? AND s.verloopt > ?')
    .bind(await sha256(token), Date.now()).first();
  if (!rij) throw new Fout(401, 'niet_ingelogd', 'Je sessie is verlopen. Log opnieuw in.');
  rij._token = token;
  return rij;
}
function maandBegin() { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); }
async function verbruikDezeMaand(env, gebruikerId) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM verbruik WHERE gebruiker_id = ? AND tijd >= ?').bind(gebruikerId, maandBegin()).first();
  return r ? r.n : 0;
}
async function accountInfo(env, g) {
  const p = plannen(env);
  const plan = p[g.plan] ? g.plan : 'gratis';
  return {
    email: g.email, plan: plan, plan_naam: p[plan].naam,
    gebruikt: await verbruikDezeMaand(env, g.id), limiet: p[plan].limiet,
    abonnement_status: g.abonnement_status || null, periode_einde: g.periode_einde || null,
    kan_betalen: !!env.STRIPE_SECRET_KEY,
    plannen: Object.keys(p).map(k => ({ id: k, naam: p[k].naam, limiet: p[k].limiet, te_koop: !!p[k].prijs }))
  };
}

async function registreer(request, env) {
  const b = await leesJson(request);
  const email = String(b.email || '').trim().toLowerCase();
  const ww = String(b.wachtwoord || '');
  if (!geldigEmail(email)) throw new Fout(400, 'email', 'Vul een geldig e-mailadres in.');
  if (ww.length < 8 || ww.length > 200) throw new Fout(400, 'wachtwoord', 'Kies een wachtwoord van minstens 8 tekens.');
  const bestaat = await env.DB.prepare('SELECT id FROM gebruikers WHERE email = ?').bind(email).first();
  if (bestaat) throw new Fout(409, 'bestaat', 'Er is al een account met dit e-mailadres. Log in of herstel je wachtwoord.');
  const zout = willekeurig(16);
  const res = await env.DB.prepare('INSERT INTO gebruikers (email, wachtwoord_hash, zout, plan, aangemaakt) VALUES (?, ?, ?, ?, ?)')
    .bind(email, await hashWachtwoord(ww, zout), zout, 'gratis', Date.now()).run();
  const id = res.meta.last_row_id;
  const g = await env.DB.prepare('SELECT * FROM gebruikers WHERE id = ?').bind(id).first();
  return json({ token: await maakSessie(env, id), account: await accountInfo(env, g) }, 201);
}
async function inloggen(request, env) {
  const b = await leesJson(request);
  const email = String(b.email || '').trim().toLowerCase();
  const ww = String(b.wachtwoord || '');
  const kwartier = Date.now() - 15 * 60000;
  const p = await env.DB.prepare('SELECT COUNT(*) AS n FROM pogingen WHERE email = ? AND tijd > ?').bind(email, kwartier).first();
  if (p && p.n >= 10) throw new Fout(429, 'te_vaak', 'Te veel mislukte pogingen. Probeer het over een kwartier opnieuw.');
  const g = await env.DB.prepare('SELECT * FROM gebruikers WHERE email = ?').bind(email).first();
  const ok = g && gelijk(await hashWachtwoord(ww, g.zout), g.wachtwoord_hash);
  if (!ok) {
    await env.DB.prepare('INSERT INTO pogingen (email, tijd) VALUES (?, ?)').bind(email, Date.now()).run();
    throw new Fout(401, 'onjuist', 'E-mailadres of wachtwoord klopt niet.');
  }
  await env.DB.prepare('DELETE FROM pogingen WHERE email = ?').bind(email).run();
  return json({ token: await maakSessie(env, g.id), account: await accountInfo(env, g) });
}
async function uitloggen(request, env) {
  const g = await huidigeGebruiker(request, env);
  await env.DB.prepare('DELETE FROM sessies WHERE token_hash = ?').bind(await sha256(g._token)).run();
  return json({ ok: true });
}
async function wachtwoordVergeten(request, env) {
  const b = await leesJson(request);
  const email = String(b.email || '').trim().toLowerCase();
  if (!env.RESEND_API_KEY || !env.EMAIL_VAN) throw new Fout(501, 'geen_email', 'Wachtwoord herstellen per e-mail is nog niet ingesteld. Neem contact op met de beheerder.');
  const g = geldigEmail(email) ? await env.DB.prepare('SELECT id FROM gebruikers WHERE email = ?').bind(email).first() : null;
  if (g) {
    const token = willekeurig(24);
    await env.DB.prepare('INSERT INTO herstel (token_hash, gebruiker_id, verloopt) VALUES (?, ?, ?)').bind(await sha256(token), g.id, Date.now() + 3600000).run();
    const link = String(env.APP_URL || '').replace(/[?#].*$/, '') + '?herstel=' + token;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_VAN, to: [email], subject: 'Wachtwoord herstellen',
        html: '<p>Je hebt gevraagd om je wachtwoord voor Veiling Analyser te herstellen.</p><p><a href="' + link + '">Kies een nieuw wachtwoord</a></p><p>Deze link werkt één uur. Heb je dit niet gevraagd, dan kun je deze e-mail negeren.</p>'
      })
    });
    if (!r.ok) console.error('Resend fout', r.status, await r.text());
  }
  // Altijd hetzelfde antwoord, zodat niemand kan uitzoeken welke e-mailadressen een account hebben
  return json({ ok: true });
}
async function wachtwoordHerstellen(request, env) {
  const b = await leesJson(request);
  const ww = String(b.wachtwoord || '');
  if (ww.length < 8 || ww.length > 200) throw new Fout(400, 'wachtwoord', 'Kies een wachtwoord van minstens 8 tekens.');
  const h = await sha256(String(b.token || ''));
  const r = await env.DB.prepare('SELECT gebruiker_id FROM herstel WHERE token_hash = ? AND verloopt > ?').bind(h, Date.now()).first();
  if (!r) throw new Fout(400, 'verlopen', 'Deze herstellink is verlopen of al gebruikt. Vraag een nieuwe aan.');
  const zout = willekeurig(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE gebruikers SET wachtwoord_hash = ?, zout = ? WHERE id = ?').bind(await hashWachtwoord(ww, zout), zout, r.gebruiker_id),
    env.DB.prepare('DELETE FROM herstel WHERE gebruiker_id = ?').bind(r.gebruiker_id),
    env.DB.prepare('DELETE FROM sessies WHERE gebruiker_id = ?').bind(r.gebruiker_id)
  ]);
  const g = await env.DB.prepare('SELECT * FROM gebruikers WHERE id = ?').bind(r.gebruiker_id).first();
  return json({ token: await maakSessie(env, g.id), account: await accountInfo(env, g) });
}

// ── Analyse ──────────────────────────────────────────────────────────────────
function veiligAdres(url) {
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return false;
  return true;
}
// Haalt de kavelpagina zelf op (gratis) zodat het model alleen een compacte versie hoeft te lezen
async function haalPagina(url) {
  if (!veiligAdres(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VeilingAnalyser/1.0)', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.5' }
    });
    if (!r.ok || !/html/i.test(r.headers.get('content-type') || '')) return null;
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let html = '', totaal = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totaal += value.length;
      html += dec.decode(value, { stream: true });
      if (totaal > 2500000) { try { await reader.cancel(); } catch (e) {} break; }
    }
    return K.htmlNaarTekst(html, url, 24000);
  } catch (e) {
    return null;
  } finally { clearTimeout(timer); }
}
function anthropicVia(env) {
  return async function (body) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body)
    });
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (!r.ok || !data || data.error) throw K.apiFout(data, r.status);
    return data;
  };
}
async function analyse(request, env) {
  const g = await huidigeGebruiker(request, env);
  const b = await leesJson(request, 20000);
  const url = String(b.url || '').trim();
  const extra = String(b.extra || '').trim().slice(0, 500);
  if (!url && !extra) throw new Fout(400, 'leeg', 'Plak de link naar het kavel of vul een productnaam in.');
  if (url && (!veiligAdres(url) || url.length > 1000)) throw new Fout(400, 'link', 'Deze link kan niet worden gelezen. Gebruik de gewone https-link van het kavel.');

  const p = plannen(env);
  const plan = p[g.plan] ? g.plan : 'gratis';
  const gebruikt = await verbruikDezeMaand(env, g.id);
  if (gebruikt >= p[plan].limiet) throw new Fout(402, 'limiet', 'Je hebt deze maand alle ' + p[plan].limiet + ' analyses van je abonnement gebruikt. Kies een groter abonnement of wacht tot volgende maand.');
  const uur = await env.DB.prepare('SELECT COUNT(*) AS n FROM verbruik WHERE gebruiker_id = ? AND tijd > ?').bind(g.id, Date.now() - 3600000).first();
  if (uur && uur.n >= Number(env.MAX_PER_UUR || 40)) throw new Fout(429, 'te_snel', 'Je doet veel analyses kort na elkaar. Wacht een paar minuten.');
  const dag = await env.DB.prepare('SELECT COALESCE(SUM(usd), 0) AS usd FROM verbruik WHERE tijd > ?').bind(Date.now() - 864e5).first();
  if (dag && dag.usd >= Number(env.DAGBUDGET_USD || 20)) throw new Fout(503, 'budget', 'De analyseservice heeft het dagbudget bereikt. Probeer het later opnieuw.');

  const res = await K.analyseer({ url, extra, hergebruik: b.hergebruik !== false }, {
    anthropic: anthropicVia(env),
    haalPagina: haalPagina,
    modelPagina: env.MODEL_PAGINA || 'claude-haiku-5-5',
    modelPrijzen: env.MODEL_PRIJZEN || 'claude-haiku-5-5',
    maxZoek: env.ZOEKOPDRACHTEN != null ? Number(env.ZOEKOPDRACHTEN) : 1,
    cacheLees: async (sl) => {
      const r = await env.DB.prepare('SELECT data FROM prijscache WHERE sleutel = ? AND tijd > ?').bind(sl, Date.now() - CACHE_DAGEN * 864e5).first();
      return r ? JSON.parse(r.data) : null;
    },
    cacheSchrijf: async (sl, pr) => {
      await env.DB.prepare('INSERT OR REPLACE INTO prijscache (sleutel, data, tijd) VALUES (?, ?, ?)').bind(sl, JSON.stringify(pr), Date.now()).run();
    }
  });
  await env.DB.prepare('INSERT INTO verbruik (gebruiker_id, tijd, usd, url) VALUES (?, ?, ?, ?)').bind(g.id, Date.now(), res.usd || 0, url.slice(0, 500)).run();
  res.verbruik = { gebruikt: gebruikt + 1, limiet: p[plan].limiet, plan: plan };
  // De kosten zijn een zaak van de app-eigenaar, niet van de klant
  delete res.usd;
  if (res.pagina) delete res.pagina.usd;
  if (res.prijzen) delete res.prijzen.usd;
  return json(res);
}

// ── Kavels synchroniseren ────────────────────────────────────────────────────
async function kavelsLezen(request, env) {
  const g = await huidigeGebruiker(request, env);
  const r = await env.DB.prepare('SELECT data, bijgewerkt FROM kavels WHERE gebruiker_id = ?').bind(g.id).first();
  return json({ kavels: r ? JSON.parse(r.data) : [], bijgewerkt: r ? r.bijgewerkt : 0 });
}
async function kavelsOpslaan(request, env) {
  const g = await huidigeGebruiker(request, env);
  const b = await leesJson(request, 5000000);
  if (!Array.isArray(b.kavels) || b.kavels.length > 5000) throw new Fout(400, 'ongeldig', 'Ongeldige kavellijst.');
  const nu = Date.now();
  await env.DB.prepare('INSERT OR REPLACE INTO kavels (gebruiker_id, data, bijgewerkt) VALUES (?, ?, ?)').bind(g.id, JSON.stringify(b.kavels), nu).run();
  return json({ ok: true, bijgewerkt: nu });
}

// ── Stripe ───────────────────────────────────────────────────────────────────
async function stripe(env, methode, pad, velden) {
  const r = await fetch('https://api.stripe.com/v1/' + pad, {
    method: methode,
    headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: velden ? new URLSearchParams(velden).toString() : undefined
  });
  const data = await r.json();
  if (!r.ok) { console.error('Stripe fout', r.status, JSON.stringify(data)); throw new Fout(502, 'stripe', 'De betaalservice gaf een fout. Probeer het later opnieuw.'); }
  return data;
}
async function afrekenen(request, env) {
  const g = await huidigeGebruiker(request, env);
  if (!env.STRIPE_SECRET_KEY) throw new Fout(501, 'geen_betaling', 'Betalen is nog niet ingesteld.');
  const b = await leesJson(request);
  const plan = plannen(env)[b.plan];
  if (!plan || !plan.prijs) throw new Fout(400, 'plan', 'Onbekend abonnement.');
  const terug = String(env.APP_URL || '').replace(/[?#].*$/, '');
  const velden = {
    'mode': 'subscription',
    'line_items[0][price]': plan.prijs,
    'line_items[0][quantity]': '1',
    'success_url': terug + '?betaald=1',
    'cancel_url': terug + '?betaald=0',
    'client_reference_id': String(g.id),
    'subscription_data[metadata][gebruiker_id]': String(g.id),
    'allow_promotion_codes': 'true',
    'locale': 'nl'
  };
  if (g.stripe_klant) velden.customer = g.stripe_klant; else velden.customer_email = g.email;
  const sessie = await stripe(env, 'POST', 'checkout/sessions', velden);
  return json({ url: sessie.url });
}
async function portaal(request, env) {
  const g = await huidigeGebruiker(request, env);
  if (!g.stripe_klant) throw new Fout(400, 'geen_klant', 'Je hebt nog geen abonnement.');
  const s = await stripe(env, 'POST', 'billing_portal/sessions', { customer: g.stripe_klant, return_url: String(env.APP_URL || '') });
  return json({ url: s.url });
}
// Zet de abonnementsgegevens van Stripe over naar de gebruiker
async function verwerkAbonnement(env, sub, gebruikerId) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const prijsId = item && item.price ? item.price.id : null;
  // Nieuwere Stripe-versies zetten current_period_end op het abonnementsitem
  const einde = (sub.current_period_end || (item && item.current_period_end) || 0) * 1000 || null;
  const actief = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
  const plan = actief ? (planVanPrijs(env, prijsId) || 'gratis') : 'gratis';
  const q = gebruikerId
    ? env.DB.prepare('UPDATE gebruikers SET plan = ?, stripe_klant = ?, stripe_abonnement = ?, abonnement_status = ?, periode_einde = ? WHERE id = ?').bind(plan, sub.customer, sub.id, sub.status, einde, gebruikerId)
    : env.DB.prepare('UPDATE gebruikers SET plan = ?, stripe_abonnement = ?, abonnement_status = ?, periode_einde = ? WHERE stripe_klant = ?').bind(plan, sub.id, sub.status, einde, sub.customer);
  await q.run();
}
async function stripeWebhook(request, env) {
  const ruw = await request.text();
  const kop = request.headers.get('Stripe-Signature') || '';
  const delen = Object.create(null);
  kop.split(',').forEach(d => { const i = d.indexOf('='); if (i > 0) { const k = d.slice(0, i).trim(); (delen[k] = delen[k] || []).push(d.slice(i + 1).trim()); } });
  const t = delen.t && delen.t[0];
  if (!t || !env.STRIPE_WEBHOOK_SECRET) throw new Fout(400, 'handtekening', 'Ongeldige handtekening.');
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Fout(400, 'handtekening', 'Verlopen handtekening.');
  const verwacht = await hmacHex(env.STRIPE_WEBHOOK_SECRET, t + '.' + ruw);
  if (!(delen.v1 || []).some(v => gelijk(v, verwacht))) throw new Fout(400, 'handtekening', 'Ongeldige handtekening.');
  const ev = JSON.parse(ruw);
  const o = ev.data && ev.data.object;
  if (ev.type === 'checkout.session.completed' && o.mode === 'subscription' && o.subscription) {
    const sub = await stripe(env, 'GET', 'subscriptions/' + o.subscription);
    await verwerkAbonnement(env, sub, Number(o.client_reference_id) || null);
  } else if (ev.type === 'customer.subscription.created' || ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') {
    const id = o.metadata && Number(o.metadata.gebruiker_id);
    await verwerkAbonnement(env, o, id || null);
  }
  return json({ ontvangen: true });
}

// ── Router ───────────────────────────────────────────────────────────────────
const ROUTES = {
  'GET /api/gezondheid': async () => json({ ok: true }),
  'POST /api/registreer': registreer,
  'POST /api/inloggen': inloggen,
  'POST /api/uitloggen': uitloggen,
  'POST /api/wachtwoord-vergeten': wachtwoordVergeten,
  'POST /api/wachtwoord-herstellen': wachtwoordHerstellen,
  'GET /api/account': async (req, env) => json(await accountInfo(env, await huidigeGebruiker(req, env))),
  'POST /api/analyse': analyse,
  'GET /api/kavels': kavelsLezen,
  'PUT /api/kavels': kavelsOpslaan,
  'POST /api/afrekenen': afrekenen,
  'POST /api/portaal': portaal,
  'POST /api/stripe-webhook': stripeWebhook
};

export async function verwerk(request, env) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const pad = new URL(request.url).pathname.replace(/\/+$/, '');
  const route = ROUTES[request.method + ' ' + pad];
  let resp;
  try {
    if (!route) throw new Fout(404, 'onbekend', 'Onbekend adres.');
    resp = await route(request, env);
  } catch (e) {
    if (e instanceof Fout) resp = json({ fout: e.message, code: e.code }, e.status);
    else {
      console.error(e && e.stack || e);
      // Fouten van de AI-dienst doorgeven in begrijpelijke vorm, zonder interne details
      const t = e && e.apiType;
      const bericht = t === 'overloaded_error' ? 'De analyseservice is even druk. Probeer het over een paar seconden opnieuw.'
        : t === 'rate_limit_error' ? 'De analyseservice is even druk. Probeer het over een minuut opnieuw.'
        : 'De analyse is mislukt. Probeer het opnieuw.';
      resp = json({ fout: bericht, code: t || 'serverfout' }, t ? 503 : 500);
    }
  }
  Object.entries(cors).forEach(([k, v]) => resp.headers.set(k, v));
  return resp;
}

export default { fetch: (request, env) => verwerk(request, env) };
