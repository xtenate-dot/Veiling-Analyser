// Veiling Analyser – server (Cloudflare Worker)
// Houdt de Anthropic-sleutel geheim, regelt accounts en abonnementen (Stripe),
// bewaakt de maandlimiet per abonnement en een dagbudget, en synchroniseert kavels.
import '../../kern.js';

const K = globalThis.VAKern;
const MAAND_MS = 30 * 864e5;
const SESSIE_DAGEN = 60;
const CACHE_DAGEN = 3;

// ── Abonnementen ─────────────────────────────────────────────────────────────
// limiet = analyses per kalendermaand; perUur = maximaal aantal per uur (tegen misbruik)
function plannen(env) {
  const uur = Number(env.MAX_PER_UUR || 60);
  return {
    gratis: { naam: 'Gratis', limiet: Number(env.LIMIET_GRATIS || 0), perUur: uur },
    af_en_toe: { naam: 'Af en toe', limiet: Number(env.LIMIET_AF_EN_TOE || 30), perUur: uur, prijs: env.STRIPE_PRICE_AF_EN_TOE },
    regelmatig: { naam: 'Regelmatig', limiet: Number(env.LIMIET_REGELMATIG || 120), perUur: uur, prijs: env.STRIPE_PRICE_REGELMATIG },
    handelaar: { naam: 'Handelaar', limiet: Number(env.LIMIET_HANDELAAR || 500), perUur: Math.max(uur, 120), prijs: env.STRIPE_PRICE_HANDELAAR },
    handelaar_plus: { naam: 'Handelaar Plus', limiet: Number(env.LIMIET_HANDELAAR_PLUS || 1500), perUur: Math.max(uur, 200), prijs: env.STRIPE_PRICE_HANDELAAR_PLUS }
  };
}
// Losse bundels: eenmalig betalen, tegoed verloopt niet
function bundels(env) {
  return {
    b25: { naam: '25 analyses', analyses: 25, prijs: env.STRIPE_PRICE_BUNDEL_25 },
    b60: { naam: '60 analyses', analyses: 60, prijs: env.STRIPE_PRICE_BUNDEL_60 }
  };
}
const WELKOM = env => Number(env.WELKOM_TEGOED != null ? env.WELKOM_TEGOED : 10);
function planVanPrijs(env, prijsId) {
  const p = plannen(env);
  for (const k of Object.keys(p)) if (p[k].prijs && p[k].prijs === prijsId) return k;
  return null;
}
function planVan(env, g) { const p = plannen(env); return p[g.plan] ? g.plan : 'gratis'; }
async function saldoVan(env, id) {
  const r = await env.DB.prepare('SELECT saldo FROM tegoed WHERE gebruiker_id = ?').bind(id).first();
  return r ? r.saldo : 0;
}
async function tegoedErbij(env, id, n) {
  await env.DB.prepare('INSERT INTO tegoed (gebruiker_id, saldo, bijgewerkt) VALUES (?, ?, ?) ON CONFLICT(gebruiker_id) DO UPDATE SET saldo = saldo + excluded.saldo, bijgewerkt = excluded.bijgewerkt')
    .bind(id, n, Date.now()).run();
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
  const lengte = Number(request.headers.get('Content-Length') || 0);
  if (lengte > (max || 100000)) throw new Fout(413, 'te_groot', 'Het verzoek is te groot.');
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
// ── Limieten tegen misbruik ──────────────────────────────────────────────────
// Telt pogingen per sleutel (bijv. "herstel:jan@x.nl" of "ip-reg:1.2.3.4") in de tabel pogingen.
// Sleutels met een voorvoegsel botsen niet met de gewone inlogpogingen (die gebruiken het kale adres).
async function limiet(env, sleutel, max, vensterMs, bericht) {
  const nu = Date.now();
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM pogingen WHERE email = ? AND tijd > ?').bind(sleutel, nu - vensterMs).first();
  if (r && r.n >= max) throw new Fout(429, 'te_vaak', bericht);
  await env.DB.prepare('INSERT INTO pogingen (email, tijd) VALUES (?, ?)').bind(sleutel, nu).run();
}
// IPv6 per /64 (één aansluiting heeft er vaak duizenden), IPv4 per adres
function ipVan(request) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!ip.includes(':')) return ip;
  const delen = ip.split('::')[0].split(':');
  return delen.slice(0, 4).join(':') + '::/64';
}

// ── E-mailcontrole ───────────────────────────────────────────────────────────
// Actief zodra de server e-mail kan versturen (Resend), tenzij EMAILCONTROLE = "uit".
function emailControle(env) { return !!(env.RESEND_API_KEY && env.EMAIL_VAN) && env.EMAILCONTROLE !== 'uit'; }
// Bekende wegwerpdiensten: daarmee kan iemand eindeloos nieuwe accounts maken
const WEGWERP = new Set(['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la', '10minutemail.com', '10minutemail.net',
  'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'yopmail.com', 'yopmail.fr', 'trashmail.com', 'trashmail.de', 'getnada.com', 'nada.email',
  'maildrop.cc', 'dispostable.com', 'throwawaymail.com', 'fakeinbox.com', 'mohmal.com', 'emailondeck.com', 'mintemail.com', 'mailnesia.com', 'spamgourmet.com',
  'tempail.com', 'tempr.email', 'discard.email', 'mailcatch.com', 'burnermail.io', 'inboxkitten.com', 'mail.tm', 'moakt.com', 'emailfake.com', 'byom.de', 'wegwerfmail.de']);
function emailKanon(email) {
  let [lokaal, domein] = email.toLowerCase().split('@');
  lokaal = lokaal.split('+')[0];
  if (domein === 'gmail.com' || domein === 'googlemail.com') { lokaal = lokaal.replace(/\./g, ''); domein = 'gmail.com'; }
  return lokaal + '@' + domein;
}
async function stuurCode(env, g) {
  if (!emailControle(env)) return;
  const nu = Date.now(), dag = new Date(nu).toISOString().slice(0, 10);
  const oud = await env.DB.prepare('SELECT * FROM verificatie WHERE gebruiker_id = ?').bind(g.id).first();
  if (oud && nu - oud.verstuurd < 60000) throw new Fout(429, 'wacht', 'Er is net een code verstuurd. Wacht een minuut voordat je een nieuwe vraagt.');
  const aantal = oud && oud.dag === dag ? oud.aantal_dag + 1 : 1;
  if (aantal > 5) throw new Fout(429, 'te_vaak', 'Je hebt vandaag al vijf codes gevraagd. Probeer het morgen opnieuw.');
  const buf = new Uint32Array(1); crypto.getRandomValues(buf);
  const code = String(buf[0] % 1000000).padStart(6, '0');
  await env.DB.prepare('INSERT OR REPLACE INTO verificatie (gebruiker_id, code_hash, verloopt, pogingen, verstuurd, dag, aantal_dag) VALUES (?, ?, ?, 0, ?, ?, ?)')
    .bind(g.id, await sha256(g.id + ':' + code), nu + 30 * 60000, nu, dag, aantal).run();
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_VAN, to: [g.email], subject: code + ' is je code voor Veiling Analyser',
      text: 'Je code is ' + code + '. Vul hem in de app in om je e-mailadres te bevestigen. De code werkt 30 minuten.\n\nHeb je geen account gemaakt? Dan kun je deze e-mail negeren.',
      html: '<p>Je code voor Veiling Analyser:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">' + code + '</p><p>Vul hem in de app in om je e-mailadres te bevestigen. De code werkt 30 minuten.</p><p style="color:#666">Heb je geen account gemaakt? Dan kun je deze e-mail negeren.</p>'
    })
  });
  if (!r.ok) { console.error('Resend fout', r.status, await r.text()); throw new Fout(502, 'mail', 'De e-mail kon niet worden verstuurd. Probeer het zo opnieuw.'); }
}
async function verifieer(request, env) {
  const g = await huidigeGebruiker(request, env);
  const b = await leesJson(request);
  if (!g.email_geverifieerd) {
    const v = await env.DB.prepare('SELECT * FROM verificatie WHERE gebruiker_id = ?').bind(g.id).first();
    if (!v || v.verloopt < Date.now()) throw new Fout(400, 'verlopen', 'Deze code is verlopen. Vraag een nieuwe code aan.');
    // Eerst de poging tellen (in één stap), dan pas vergelijken: zo helpt gelijktijdig gokken niet
    const telt = await env.DB.prepare('UPDATE verificatie SET pogingen = pogingen + 1 WHERE gebruiker_id = ? AND pogingen < 5').bind(g.id).run();
    if (!telt.meta || !telt.meta.changes) throw new Fout(400, 'te_vaak', 'Te vaak een verkeerde code ingevuld. Vraag een nieuwe code aan.');
    const code = String(b.code || '').replace(/\D/g, '');
    if (!gelijk(await sha256(g.id + ':' + code), v.code_hash)) {
      throw new Fout(400, 'onjuist', 'Deze code klopt niet. Controleer de e-mail en probeer het opnieuw.');
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE gebruikers SET email_geverifieerd = 1 WHERE id = ?').bind(g.id),
      env.DB.prepare('DELETE FROM verificatie WHERE gebruiker_id = ?').bind(g.id)
    ]);
    g.email_geverifieerd = 1;
  }
  return json({ account: await accountInfo(env, g) });
}
async function codeOpnieuw(request, env) {
  const g = await huidigeGebruiker(request, env);
  if (g.email_geverifieerd || !emailControle(env)) return json({ ok: true, al_bevestigd: true });
  await stuurCode(env, g);
  return json({ ok: true });
}
// Cloudflare Turnstile: onzichtbare controle of er een mens aanmeldt
async function controleerTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return;
  if (!token) throw new Fout(403, 'bot', 'De controle of je een mens bent is niet gelukt. Ververs de pagina en probeer het opnieuw.');
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: String(token), remoteip: ip || undefined })
  });
  const d = await r.json().catch(() => ({}));
  if (!d.success) throw new Fout(403, 'bot', 'De controle of je een mens bent is niet gelukt. Ververs de pagina en probeer het opnieuw.');
}

// Wat iemand nog kan: eerst de analyses van het abonnement deze maand, daarna het tegoed
function beschikbaarVan(limiet, gebruikt, saldo) { return Math.max(0, limiet - gebruikt) + Math.max(0, saldo); }
async function accountInfo(env, g) {
  const p = plannen(env), b = bundels(env);
  const plan = planVan(env, g);
  const gebruikt = await verbruikDezeMaand(env, g.id), saldo = await saldoVan(env, g.id);
  const kanBetalen = !!env.STRIPE_SECRET_KEY;
  return {
    email: g.email, plan: plan, plan_naam: p[plan].naam,
    gebruikt: gebruikt, limiet: p[plan].limiet, tegoed: saldo, beschikbaar: beschikbaarVan(p[plan].limiet, gebruikt, saldo),
    abonnement_status: g.abonnement_status || null, periode_einde: g.periode_einde || null,
    kan_betalen: kanBetalen,
    email_geverifieerd: !!g.email_geverifieerd || !emailControle(env),
    plannen: Object.keys(p).map(k => ({ id: k, naam: p[k].naam, limiet: p[k].limiet, te_koop: kanBetalen && !!p[k].prijs })),
    bundels: Object.keys(b).map(k => ({ id: k, naam: b[k].naam, analyses: b[k].analyses, te_koop: kanBetalen && !!b[k].prijs }))
  };
}

async function registreer(request, env) {
  const b = await leesJson(request);
  const email = String(b.email || '').trim().toLowerCase();
  const ww = String(b.wachtwoord || '');
  if (!geldigEmail(email)) throw new Fout(400, 'email', 'Vul een geldig e-mailadres in.');
  if (WEGWERP.has(email.split('@')[1])) throw new Fout(400, 'wegwerp', 'Gebruik je gewone e-mailadres; tijdelijke adressen worden niet geaccepteerd.');
  if (ww.length < 8 || ww.length > 200) throw new Fout(400, 'wachtwoord', 'Kies een wachtwoord van minstens 8 tekens.');
  const ip = ipVan(request);
  if (ip) await limiet(env, 'ip-reg:' + ip, 10, 3600000, 'Er zijn vanaf dit internetadres veel accounts aangemaakt. Probeer het over een uur opnieuw.');
  await controleerTurnstile(env, b.turnstile, ip);
  // Optioneel: alleen mensen met de uitnodigingscode kunnen een account maken
  if (env.UITNODIGINGSCODE && !gelijk(String(b.code || '').trim().toLowerCase(), String(env.UITNODIGINGSCODE).trim().toLowerCase())) {
    throw new Fout(403, 'code', 'Vul de juiste uitnodigingscode in. Die krijg je van de beheerder van de app.');
  }
  const kanon = emailKanon(email);
  const bestaat = await env.DB.prepare('SELECT id FROM gebruikers WHERE email = ? OR email_kanon = ?').bind(email, kanon).first();
  if (bestaat) throw new Fout(409, 'bestaat', 'Er is al een account met dit e-mailadres. Log in of herstel je wachtwoord.');
  const zout = willekeurig(16);
  const res = await env.DB.prepare('INSERT INTO gebruikers (email, email_kanon, wachtwoord_hash, zout, plan, aangemaakt) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(email, kanon, await hashWachtwoord(ww, zout), zout, 'gratis', Date.now()).run();
  const id = res.meta.last_row_id;
  // Welkomstbundel, maar niet opnieuw voor wie zijn account verwijdert en direct een nieuw maakt.
  // Diegene houdt ook het verbruik van deze maand, anders is de maandlimiet te omzeilen.
  let eerder = null;
  try {
    eerder = await env.DB.prepare('SELECT oud_id, tijd FROM verwijderd WHERE kanon_hash = ?').bind(await sha256('kanon:' + kanon)).first();
    if (eerder && eerder.tijd >= maandBegin()) await env.DB.prepare('UPDATE verbruik SET gebruiker_id = ? WHERE gebruiker_id = ? AND tijd >= ?').bind(id, -eerder.oud_id, maandBegin()).run();
  } catch (e) { console.error('verwijderd-controle', e); }
  if (!eerder && WELKOM(env) > 0) await tegoedErbij(env, id, WELKOM(env));
  const g = await env.DB.prepare('SELECT * FROM gebruikers WHERE id = ?').bind(id).first();
  let mailFout = null;
  try { await stuurCode(env, g); } catch (e) { mailFout = e.message; }
  return json({ token: await maakSessie(env, id), account: await accountInfo(env, g), mail_fout: mailFout }, 201);
}
async function inloggen(request, env) {
  const b = await leesJson(request);
  const email = String(b.email || '').trim().toLowerCase();
  const ww = String(b.wachtwoord || '');
  const kwartier = Date.now() - 15 * 60000;
  const p = await env.DB.prepare('SELECT COUNT(*) AS n FROM pogingen WHERE email = ? AND tijd > ?').bind(email, kwartier).first();
  if (p && p.n >= 10) throw new Fout(429, 'te_vaak', 'Te veel mislukte pogingen. Probeer het over een kwartier opnieuw.');
  const ip = ipVan(request);
  if (ip) await limiet(env, 'ip-login:' + ip, 30, 15 * 60000, 'Te veel inlogpogingen vanaf dit internetadres. Probeer het over een kwartier opnieuw.');
  const g = await env.DB.prepare('SELECT * FROM gebruikers WHERE email = ?').bind(email).first();
  // Ook bij een onbekend adres hashen, zodat de antwoordtijd niet verraadt of er een account is
  const ok = g ? gelijk(await hashWachtwoord(ww, g.zout), g.wachtwoord_hash) : (await hashWachtwoord(ww, 'geen-account'), false);
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
  // Zonder limiet kan iemand andermans inbox volspammen en het e-mailtegoed opmaken.
  // De limiet geldt ook voor adressen zonder account, zodat het antwoord niets verraadt.
  const ip = ipVan(request);
  if (ip) await limiet(env, 'ip-herstel:' + ip, 10, 3600000, 'Er zijn vanaf dit internetadres veel herstellinks gevraagd. Probeer het over een uur opnieuw.');
  if (geldigEmail(email)) await limiet(env, 'herstel:' + email, 3, 3600000, 'Er zijn voor dit adres al drie herstellinks gestuurd. Kijk ook bij ongewenste e-mail, of probeer het over een uur opnieuw.');
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
    env.DB.prepare('UPDATE gebruikers SET wachtwoord_hash = ?, zout = ?, email_geverifieerd = 1 WHERE id = ?').bind(await hashWachtwoord(ww, zout), zout, r.gebruiker_id),
    env.DB.prepare('DELETE FROM herstel WHERE gebruiker_id = ?').bind(r.gebruiker_id),
    env.DB.prepare('DELETE FROM sessies WHERE gebruiker_id = ?').bind(r.gebruiker_id)
  ]);
  const g = await env.DB.prepare('SELECT * FROM gebruikers WHERE id = ?').bind(r.gebruiker_id).first();
  return json({ token: await maakSessie(env, g.id), account: await accountInfo(env, g) });
}

// ── Eigen gegevens (AVG): inzien en verwijderen ──────────────────────────────
async function mijnGegevens(request, env) {
  const g = await huidigeGebruiker(request, env);
  await zetOudeKavelsOver(env, g.id);
  const iso = t => t ? new Date(t).toISOString() : null;
  const verbruik = await env.DB.prepare('SELECT tijd, url FROM verbruik WHERE gebruiker_id = ? ORDER BY tijd').bind(g.id).all();
  const kv = await env.DB.prepare('SELECT data, bijgewerkt FROM kavel_items WHERE gebruiker_id = ? ORDER BY bijgewerkt').bind(g.id).all();
  const aankopen = await env.DB.prepare('SELECT bundel, analyses, tijd FROM aankopen WHERE gebruiker_id = ? ORDER BY tijd').bind(g.id).all();
  const fb = await env.DB.prepare('SELECT tijd, soort, tekst, kavel_url, product FROM feedback WHERE gebruiker_id = ? ORDER BY tijd').bind(g.id).all();
  const rv = await env.DB.prepare('SELECT sterren, tekst, naam, tijd FROM reviews WHERE gebruiker_id = ?').bind(g.id).first();
  return json({
    gemaakt_op: new Date().toISOString(),
    account: {
      email: g.email, aangemaakt: iso(g.aangemaakt), email_bevestigd: !!g.email_geverifieerd,
      abonnement: g.plan, abonnement_status: g.abonnement_status || null, abonnement_loopt_tot: iso(g.periode_einde),
      tegoed: await saldoVan(env, g.id)
    },
    analyses: (verbruik.results || []).map(v => ({ tijd: iso(v.tijd), link: v.url || null })),
    aankopen: (aankopen.results || []).map(a => ({ bundel: a.bundel, analyses: a.analyses, tijd: iso(a.tijd) })),
    kavels: (kv.results || []).map(x => { try { return JSON.parse(x.data); } catch (e) { return null; } }).filter(Boolean),
    feedback: (fb.results || []).map(f => ({ tijd: iso(f.tijd), soort: f.soort, tekst: f.tekst, link: f.kavel_url, product: f.product })),
    review: rv ? { sterren: rv.sterren, tekst: rv.tekst, naam: rv.naam, tijd: iso(rv.tijd) } : null
  }, 200, { 'Content-Disposition': 'attachment; filename="veiling-analyser-gegevens.json"' });
}
async function accountVerwijderen(request, env) {
  const g = await huidigeGebruiker(request, env);
  const b = await leesJson(request);
  if (!gelijk(await hashWachtwoord(String(b.wachtwoord || ''), g.zout), g.wachtwoord_hash)) {
    // 403 en niet 401: de app logt bij 401 uit, en dat is hier niet de bedoeling
    await limiet(env, 'verwijder:' + g.id, 5, 15 * 60000, 'Te vaak een verkeerd wachtwoord. Probeer het over een kwartier opnieuw.');
    throw new Fout(403, 'onjuist', 'Dit wachtwoord klopt niet.');
  }
  // Een lopend abonnement direct stoppen, anders betaalt de klant door zonder account
  // Alle lopende abonnementen van deze klant stoppen, ook een eventueel tweede
  if (env.STRIPE_SECRET_KEY && (g.stripe_klant || g.stripe_abonnement)) {
    const ids = new Set();
    if (g.stripe_abonnement && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(g.abonnement_status)) ids.add(g.stripe_abonnement);
    if (g.stripe_klant) {
      const lijst = await stripe(env, 'GET', 'subscriptions?customer=' + encodeURIComponent(g.stripe_klant) + '&status=all&limit=20');
      (lijst.data || []).filter(x => ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(x.status)).forEach(x => ids.add(x.id));
    }
    for (const id of ids) await stripe(env, 'DELETE', 'subscriptions/' + encodeURIComponent(id));
  }
  const kanon = g.email_kanon || emailKanon(g.email);
  await env.DB.batch([
    // Alleen een vingerafdruk (hash) van het adres, een jaar, zodat opnieuw aanmelden geen nieuwe welkomstbundel geeft
    env.DB.prepare('INSERT OR REPLACE INTO verwijderd (kanon_hash, oud_id, tijd) VALUES (?, ?, ?)').bind(await sha256('kanon:' + kanon), g.id, Date.now()),
    // Verbruik blijft anoniem bestaan voor het dagbudget en de maandlimiet; de links gaan weg
    env.DB.prepare('UPDATE verbruik SET gebruiker_id = ?, url = NULL WHERE gebruiker_id = ?').bind(-g.id, g.id),
    env.DB.prepare('DELETE FROM kavels WHERE gebruiker_id = ?').bind(g.id),
    env.DB.prepare('DELETE FROM kavel_items WHERE gebruiker_id = ?').bind(g.id),
    env.DB.prepare('DELETE FROM tegoed WHERE gebruiker_id = ?').bind(g.id),
    env.DB.prepare('DELETE FROM feedback WHERE gebruiker_id = ?').bind(g.id),
    env.DB.prepare('DELETE FROM reviews WHERE gebruiker_id = ?').bind(g.id),
    // Aankopen blijven voor de boekhouding (7 jaar), maar zonder koppeling aan een account
    env.DB.prepare('UPDATE aankopen SET gebruiker_id = ? WHERE gebruiker_id = ?').bind(-g.id, g.id),
    env.DB.prepare('DELETE FROM sessies WHERE gebruiker_id = ?').bind(g.id),
    env.DB.prepare('DELETE FROM herstel WHERE gebruiker_id = ?').bind(g.id),
    env.DB.prepare('DELETE FROM verificatie WHERE gebruiker_id = ?').bind(g.id),
    env.DB.prepare('DELETE FROM pogingen WHERE email = ? OR email = ?').bind(g.email, 'herstel:' + g.email),
    env.DB.prepare('DELETE FROM gebruikers WHERE id = ?').bind(g.id)
  ]);
  return json({ ok: true });
}

// ── Dagelijks opruimen (cron) ────────────────────────────────────────────────
export async function opruimen(env, nu = Date.now()) {
  const dag = 864e5;
  const stappen = [
    ['sessies', 'DELETE FROM sessies WHERE verloopt < ?', [nu]],
    ['herstel', 'DELETE FROM herstel WHERE verloopt < ?', [nu]],
    ['verificatie', 'DELETE FROM verificatie WHERE verloopt < ?', [nu - dag]],
    ['pogingen', 'DELETE FROM pogingen WHERE tijd < ?', [nu - dag]],
    ['prijscache', 'DELETE FROM prijscache WHERE tijd < ?', [nu - CACHE_DAGEN * dag]],
    ['links', 'UPDATE verbruik SET url = NULL WHERE url IS NOT NULL AND tijd < ?', [nu - 90 * dag]],
    ['verbruik', 'DELETE FROM verbruik WHERE tijd < ?', [nu - 400 * dag]],
    ['verwijderd', 'DELETE FROM verwijderd WHERE tijd < ?', [nu - 365 * dag]],
    ['meldingen', 'DELETE FROM meldingen WHERE tijd < ?', [nu - 30 * dag]],
    ['feedback', 'DELETE FROM feedback WHERE tijd < ?', [nu - 730 * dag]],
    // Kavels die een jaar niet zijn aangeraakt: de lijst met gevonden advertenties en de opmerkingen eruit, het resultaat blijft
    ['kavels-verkleind', "UPDATE kavel_items SET data = json_set(json_remove(data, '$.prijzen.tweedehands', '$.pagina.opmerkingen', '$.waarschuwingen'), '$.verkleind', json('true')) WHERE bijgewerkt < ? AND json_extract(data, '$.verkleind') IS NULL", [nu - 365 * dag]]
  ];
  // Nooit bevestigde accounts na 7 dagen weg (alleen als de e-mailcontrole aanstaat)
  if (emailControle(env)) {
    const grens = nu - 7 * dag;
    const sub = 'SELECT id FROM gebruikers WHERE email_geverifieerd = 0 AND aangemaakt < ' + Number(grens);
    stappen.push(['onbevestigd-sessies', 'DELETE FROM sessies WHERE gebruiker_id IN (' + sub + ')', []]);
    stappen.push(['onbevestigd-kavels', 'DELETE FROM kavels WHERE gebruiker_id IN (' + sub + ')', []]);
    stappen.push(['onbevestigd-codes', 'DELETE FROM verificatie WHERE gebruiker_id IN (' + sub + ')', []]);
    stappen.push(['onbevestigd-items', 'DELETE FROM kavel_items WHERE gebruiker_id IN (' + sub + ')', []]);
    stappen.push(['onbevestigd-tegoed', 'DELETE FROM tegoed WHERE gebruiker_id IN (' + sub + ')', []]);
    stappen.push(['onbevestigd-feedback', 'DELETE FROM feedback WHERE gebruiker_id IN (' + sub + ')', []]);
    stappen.push(['onbevestigd-herstel', 'DELETE FROM herstel WHERE gebruiker_id IN (' + sub + ')', []]);
    stappen.push(['onbevestigd-verbruik', 'UPDATE verbruik SET gebruiker_id = 0, url = NULL WHERE gebruiker_id IN (' + sub + ')', []]);
    stappen.push(['onbevestigd', 'DELETE FROM gebruikers WHERE email_geverifieerd = 0 AND aangemaakt < ?', [grens]]);
  }
  const verslag = {};
  for (const [naam, sql, args] of stappen) {
    try { const r = await env.DB.prepare(sql).bind(...args).run(); verslag[naam] = (r.meta && r.meta.changes) || 0; }
    catch (e) { console.error('opruimen ' + naam, e); verslag[naam] = 'fout'; }
  }
  console.log('Opgeruimd', JSON.stringify(verslag));
  return verslag;
}

// ── Feedback en reviews ──────────────────────────────────────────────────────
const FEEDBACK_SOORTEN = { prijs: 'De prijzen kloppen niet', product: 'Verkeerd product herkend', kosten: 'De veilingkosten kloppen niet', anders: 'Iets anders' };
async function feedbackGeven(request, env) {
  const g = await huidigeGebruiker(request, env);
  if (emailControle(env) && !g.email_geverifieerd) throw new Fout(403, 'niet_geverifieerd', 'Bevestig eerst je e-mailadres.');
  const b = await leesJson(request);
  const soort = FEEDBACK_SOORTEN[b.soort] ? b.soort : 'anders';
  const tekst = String(b.tekst || '').trim().slice(0, 1000);
  if (!tekst && soort === 'anders') throw new Fout(400, 'leeg', 'Schrijf kort wat er niet klopt.');
  await limiet(env, 'feedback:' + g.id, 20, 864e5, 'Je hebt vandaag al veel feedback gestuurd. Dank je wel! Probeer het morgen opnieuw.');
  const link = String(b.kavel_url || '').slice(0, 500), product = String(b.product || '').slice(0, 200);
  await env.DB.prepare('INSERT INTO feedback (gebruiker_id, tijd, soort, tekst, kavel_url, product) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(g.id, Date.now(), soort, tekst || null, link && veiligAdres(link) ? link : null, product || null).run();
  await meldEigenaar(env, 'feedback', 'Nieuwe feedback', 'Soort: ' + FEEDBACK_SOORTEN[soort] + '\nProduct: ' + (product || '-') + '\nLink: ' + (link || '-') + '\n\n' + (tekst || '(geen toelichting)') +
    '\n\nAlle feedback staat in de database (tabel feedback). Je krijgt hooguit één e-mail per 6 uur.');
  return json({ ok: true });
}
async function reviewsLijst(request, env) {
  const r = await env.DB.prepare('SELECT sterren, tekst, naam, tijd FROM reviews WHERE zichtbaar = 1 ORDER BY tijd DESC LIMIT 50').all();
  const s = await env.DB.prepare('SELECT COUNT(*) AS n, AVG(sterren) AS gem FROM reviews WHERE zichtbaar = 1').first();
  return json({
    aantal: s ? s.n : 0, gemiddelde: s && s.n ? Math.round(s.gem * 10) / 10 : null,
    reviews: (r.results || []).map(x => ({ sterren: x.sterren, tekst: x.tekst, naam: x.naam, datum: new Date(x.tijd).toISOString().slice(0, 10) })),
    uitleg: 'Alleen gebruikers met een bevestigd e-mailadres die minstens één analyse hebben gedaan, kunnen een review schrijven, één per account. We plaatsen positieve en negatieve reviews; we verwijderen alleen reviews met beledigingen, persoonsgegevens of reclame. Niemand krijgt een beloning voor een review. Het gemiddelde is het gewone gemiddelde van alle geplaatste reviews.'
  }, 200, { 'Cache-Control': 'public, max-age=300' });
}
async function reviewSchrijven(request, env) {
  const g = await huidigeGebruiker(request, env);
  const b = await leesJson(request);
  if (emailControle(env) && !g.email_geverifieerd) throw new Fout(403, 'niet_geverifieerd', 'Bevestig eerst je e-mailadres.');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM verbruik WHERE gebruiker_id = ?').bind(g.id).first();
  if (!n || n.n < 1) throw new Fout(403, 'geen_analyse', 'Je kunt een review schrijven nadat je minstens één kavel hebt laten analyseren.');
  const sterren = Math.round(Number(b.sterren));
  if (!(sterren >= 1 && sterren <= 5)) throw new Fout(400, 'sterren', 'Kies 1 tot 5 sterren.');
  const tekst = String(b.tekst || '').trim();
  if (tekst.length < 10 || tekst.length > 600) throw new Fout(400, 'tekst', 'Schrijf tussen de 10 en 600 tekens.');
  const naam = String(b.naam || '').trim().slice(0, 40) || 'Anonieme gebruiker';
  await env.DB.prepare('INSERT OR REPLACE INTO reviews (gebruiker_id, sterren, tekst, naam, analyses, tijd, zichtbaar) VALUES (?, ?, ?, ?, ?, ?, 1)')
    .bind(g.id, sterren, tekst, naam, n.n, Date.now()).run();
  await meldEigenaar(env, 'review', 'Nieuwe review', sterren + ' sterren van ' + naam + ':\n\n' + tekst + '\n\nOngepast? Zet in de database (tabel reviews) zichtbaar op 0. Je krijgt hooguit één e-mail per 6 uur.');
  return json({ ok: true });
}
async function mijnReview(request, env) {
  const g = await huidigeGebruiker(request, env);
  const r = await env.DB.prepare('SELECT sterren, tekst, naam, tijd FROM reviews WHERE gebruiker_id = ?').bind(g.id).first();
  return json({ review: r || null });
}
async function reviewVerwijderen(request, env) {
  const g = await huidigeGebruiker(request, env);
  await env.DB.prepare('DELETE FROM reviews WHERE gebruiker_id = ?').bind(g.id).run();
  return json({ ok: true });
}

// ── Meldingen aan de eigenaar ────────────────────────────────────────────────
// Per soort hooguit één e-mail per 6 uur. Werkt alleen met Resend en EIGENAAR_EMAIL.
async function meldEigenaar(env, soort, onderwerp, tekst) {
  if (!env.RESEND_API_KEY || !env.EMAIL_VAN || !env.EIGENAAR_EMAIL) return false;
  try {
    const nu = Date.now();
    const r = await env.DB.prepare('SELECT tijd FROM meldingen WHERE soort = ?').bind(soort).first();
    if (r && nu - r.tijd < 6 * 3600000) return false;
    await env.DB.prepare('INSERT OR REPLACE INTO meldingen (soort, tijd) VALUES (?, ?)').bind(soort, nu).run();
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_VAN, to: [env.EIGENAAR_EMAIL], subject: 'Veiling Analyser: ' + onderwerp,
        text: tekst + '\n\nTijd: ' + new Date(nu).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) + '\nKijk voor details in Cloudflare: Workers & Pages → veiling-analyser → Observability (logboeken).' })
    });
    return resp.ok;
  } catch (e) { console.error('melding mislukt', e); return false; }
}
// Dagbudget groeit mee met het aantal betalende klanten
async function dagbudget(env) {
  const basis = Number(env.DAGBUDGET_USD || 20), perKlant = Number(env.DAGBUDGET_PER_KLANT_USD != null ? env.DAGBUDGET_PER_KLANT_USD : 1);
  let klanten = 0;
  try {
    const r = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM gebruikers WHERE plan != 'gratis') + (SELECT COUNT(DISTINCT gebruiker_id) FROM aankopen WHERE tijd > ?) AS n").bind(Date.now() - MAAND_MS).first();
    klanten = r ? r.n : 0;
  } catch (e) { console.error('dagbudget', e); }
  return basis + perKlant * klanten;
}
async function dagbudgetOp(env) {
  const dag = await env.DB.prepare('SELECT COALESCE(SUM(usd), 0) AS usd FROM verbruik WHERE tijd > ?').bind(Date.now() - 864e5).first();
  const besteed = dag ? dag.usd : 0, budget = await dagbudget(env);
  if (besteed >= budget * 0.8 && besteed < budget) {
    await meldEigenaar(env, 'budget-bijna', 'Dagbudget bijna bereikt', 'In de afgelopen 24 uur is $' + besteed.toFixed(2) + ' van het dagbudget van $' + budget.toFixed(2) + ' aan AI-kosten gebruikt.');
  }
  return besteed >= budget;
}
// Mislukte analyses tellen; bij 10 of meer in een uur een e-mail
async function telFout(env, bericht) {
  try {
    await env.DB.prepare('INSERT INTO pogingen (email, tijd) VALUES (?, ?)').bind('fout-analyse', Date.now()).run();
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM pogingen WHERE email = 'fout-analyse' AND tijd > ?").bind(Date.now() - 3600000).first();
    if (r && r.n >= 10) await meldEigenaar(env, 'fouten', 'Veel mislukte analyses', r.n + ' analyses zijn in het afgelopen uur mislukt. Laatste fout: ' + String(bericht || '').slice(0, 300));
  } catch (e) { console.error('telFout', e); }
}

// ── Analyse ──────────────────────────────────────────────────────────────────
function veiligAdres(url) {
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h.includes('.') || h === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(h) || /^[\d.]+$/.test(h) || /^0x/i.test(h) || h.includes(':') || h.includes('[')) return false;
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return false;
  return true;
}
// Haalt de kavelpagina zelf op (gratis) zodat het model alleen een compacte versie hoeft te lezen
async function haalPagina(url) {
  if (!veiligAdres(url) || K.nietOpenen(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    // Doorverwijzingen zelf volgen (hooguit 3) en elke stap opnieuw controleren
    let r = null, adres = url;
    for (let stap = 0; stap < 4; stap++) {
      r = await fetch(adres, {
        signal: ctrl.signal, redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VeilingAnalyser/1.0)', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.5' }
      });
      if (r.status < 300 || r.status > 399) break;
      const naar = r.headers.get('location');
      if (!naar || stap === 3) return null;
      adres = new URL(naar, adres).toString();
      if (!veiligAdres(adres) || K.nietOpenen(adres)) return null;
    }
    if (!r || !r.ok || !/html/i.test(r.headers.get('content-type') || '')) return null;
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
function anthropicVia(env, teller) {
  return async function (body) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body)
    });
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (data && data.usage && teller) teller.usd += K.apiKostenVan(body.model, data.usage);
    if (!r.ok || !data || data.error) throw K.apiFout(data, r.status);
    return data;
  };
}
async function analyse(request, env) {
  const g = await huidigeGebruiker(request, env);
  const b = await leesJson(request, 6500000);
  const url = String(b.url || '').trim();
  const extra = String(b.extra || '').trim().slice(0, 500);
  // Foto's: hooguit 4, elk hooguit ~1,1 MB (de app verkleint ze vooraf)
  const fotos = (Array.isArray(b.fotos) ? b.fotos : []).slice(0, K.MAX_FOTOS)
    .filter(f => f && /^image\/(jpeg|png|webp|gif)$/.test(f.media_type) && typeof f.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(f.data) && f.data.length < 1500000)
    .map(f => ({ media_type: f.media_type, data: f.data }));
  if (!url && !extra && !fotos.length) throw new Fout(400, 'leeg', 'Plak de link naar het kavel, vul een productnaam in of voeg foto\'s toe.');
  if (url && (!veiligAdres(url) || url.length > 1000)) throw new Fout(400, 'link', 'Deze link kan niet worden gelezen. Gebruik de gewone https-link van het kavel.');
  if (url && K.nietOpenen(url)) throw new Fout(400, 'marktplaats', 'Links van Marktplaats en 2dehands lezen we niet. Plak de link van een veilingkavel, of vul de productnaam in.');

  if (emailControle(env) && !g.email_geverifieerd) throw new Fout(403, 'niet_geverifieerd', 'Bevestig eerst je e-mailadres met de code die we je hebben gestuurd.');
  const p = plannen(env);
  const plan = planVan(env, g);
  const gebruikt = await verbruikDezeMaand(env, g.id);
  const saldo = await saldoVan(env, g.id);
  const uitTegoed = gebruikt >= p[plan].limiet;
  const geenTegoed = () => new Fout(402, 'limiet', plan === 'gratis'
    ? (env.STRIPE_SECRET_KEY ? 'Je gratis analyses zijn op. Koop een losse bundel of kies een abonnement om verder te gaan.' : 'Je gratis analyses zijn op. Een ander bod doorrekenen kan wel gewoon.')
    : 'Je hebt deze maand alle ' + p[plan].limiet + ' analyses van je abonnement gebruikt. Koop een losse bundel, kies een groter abonnement of wacht tot de 1e van volgende maand.');
  if (uitTegoed && saldo <= 0) throw geenTegoed();
  // Hooguit 2 analyses tegelijk per gebruiker; een aanvraag die vastloopt telt na 3 minuten niet meer mee
  const lopend = await env.DB.prepare('SELECT COUNT(*) AS n FROM pogingen WHERE email = ? AND tijd > ?').bind('lopend:' + g.id, Date.now() - 180000).first();
  if (lopend && lopend.n >= 2) throw new Fout(429, 'tegelijk', 'Er lopen al twee analyses tegelijk. Wacht tot een ervan klaar is.');
  // Elke poging telt mee voor de limiet per uur, ook als hij mislukt
  await limiet(env, 'analyse:' + g.id, p[plan].perUur, 3600000, 'Je doet veel analyses kort na elkaar (meer dan ' + p[plan].perUur + ' per uur). Wacht een paar minuten.');
  if (await dagbudgetOp(env)) {
    await meldEigenaar(env, 'budget', 'Dagbudget bereikt', 'De server heeft het dagbudget voor AI-kosten bereikt. Analyses worden geweigerd tot het budget weer vrij is. Verhoog DAGBUDGET_USD in wrangler.toml als dit door echte klanten komt.');
    throw new Fout(503, 'budget', 'De analyseservice is voor vandaag even vol. Probeer het later opnieuw.');
  }
  // Tegoed vooraf vastleggen (in één stap, dus niet dubbel te gebruiken); bij een mislukte analyse komt het terug
  if (uitTegoed) {
    const af = await env.DB.prepare('UPDATE tegoed SET saldo = saldo - 1, bijgewerkt = ? WHERE gebruiker_id = ? AND saldo > 0').bind(Date.now(), g.id).run();
    if (!af.meta || !af.meta.changes) throw geenTegoed();
  }
  const lopendTijd = Date.now() + Math.random();
  await env.DB.prepare('INSERT INTO pogingen (email, tijd) VALUES (?, ?)').bind('lopend:' + g.id, lopendTijd).run();
  const teller = { usd: 0 };
  let res;
  try {
    res = await K.analyseer({ url, extra, fotos, hergebruik: b.hergebruik !== false }, {
      anthropic: anthropicVia(env, teller),
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
  } catch (e) {
    // Mislukt: geen tegoed kwijt, maar de gemaakte AI-kosten tellen wel mee voor het dagbudget (gebruiker 0 = geen klant)
    if (uitTegoed) await tegoedErbij(env, g.id, 1);
    if (teller.usd > 0) await env.DB.prepare('INSERT INTO verbruik (gebruiker_id, tijd, usd, url) VALUES (0, ?, ?, NULL)').bind(Date.now(), teller.usd).run();
    throw e;
  } finally {
    await env.DB.prepare('DELETE FROM pogingen WHERE email = ? AND tijd = ?').bind('lopend:' + g.id, lopendTijd).run();
  }
  await env.DB.prepare('INSERT INTO verbruik (gebruiker_id, tijd, usd, url) VALUES (?, ?, ?, ?)').bind(g.id, Date.now(), Math.max(teller.usd, res.usd || 0), url.slice(0, 500)).run();
  const nieuwSaldo = uitTegoed ? Math.max(0, saldo - 1) : saldo;
  res.verbruik = { gebruikt: gebruikt + 1, limiet: p[plan].limiet, plan: plan, tegoed: nieuwSaldo, beschikbaar: beschikbaarVan(p[plan].limiet, gebruikt + 1, nieuwSaldo) };
  // De kosten zijn een zaak van de app-eigenaar, niet van de klant
  delete res.usd;
  if (res.pagina) delete res.pagina.usd;
  if (res.prijzen) delete res.prijzen.usd;
  return json(res);
}

// ── Kavels synchroniseren ────────────────────────────────────────────────────
// Eén regel per kavel. De app stuurt alleen wat veranderd is ({ wijzig: [...], verwijder: [id, ...] }).
// Alles gebeurt met json_each in een paar queries, zodat ook grote lijsten binnen de limieten van D1 blijven.
const MAX_KAVELS = 5000, WAARSCHUW_KAVELS = 4000, MAX_KAVEL_BYTES = 100000, MAX_KAVELS_TOTAAL = 20000000; // 20 MB per gebruiker
function kavelId(k) { const id = k && k.id; return (typeof id === 'string' || typeof id === 'number') && String(id).length <= 64 ? String(id) : null; }
// Oude opslag (één regel per gebruiker) eenmalig overzetten
async function zetOudeKavelsOver(env, gebruikerId) {
  let oud = null;
  try { oud = await env.DB.prepare('SELECT data FROM kavels WHERE gebruiker_id = ?').bind(gebruikerId).first(); } catch (e) { return; }
  if (!oud) return;
  const lijst = (JSON.parse(oud.data) || []).filter(k => kavelId(k));
  if (lijst.length) {
    await env.DB.prepare("INSERT OR IGNORE INTO kavel_items (gebruiker_id, id, data, bijgewerkt) SELECT ?, CAST(json_extract(value, '$.id') AS TEXT), value, ? FROM json_each(?)")
      .bind(gebruikerId, Date.now(), JSON.stringify(lijst)).run();
  }
  await env.DB.prepare('DELETE FROM kavels WHERE gebruiker_id = ?').bind(gebruikerId).run();
}
async function aantalKavels(env, id) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM kavel_items WHERE gebruiker_id = ?').bind(id).first();
  return r ? r.n : 0;
}
function kavelStatus(n) {
  return { aantal: n, max: MAX_KAVELS, waarschuwing: n >= WAARSCHUW_KAVELS ? 'Je hebt ' + n + ' kavels opgeslagen; het maximum is ' + MAX_KAVELS + '. Verwijder kavels die je niet meer nodig hebt.' : null };
}
async function kavelsLezen(request, env) {
  const g = await huidigeGebruiker(request, env);
  await zetOudeKavelsOver(env, g.id);
  const r = await env.DB.prepare('SELECT data, bijgewerkt FROM kavel_items WHERE gebruiker_id = ? ORDER BY bijgewerkt DESC').bind(g.id).all();
  const rijen = r.results || [];
  const kavels = [];
  for (const x of rijen) { try { kavels.push(JSON.parse(x.data)); } catch (e) {} }
  return json(Object.assign({ kavels, bijgewerkt: rijen.reduce((m, x) => Math.max(m, x.bijgewerkt), 0) }, kavelStatus(kavels.length)));
}
async function kavelsOpslaan(request, env) {
  const g = await huidigeGebruiker(request, env);
  if (emailControle(env) && !g.email_geverifieerd) throw new Fout(403, 'niet_geverifieerd', 'Bevestig eerst je e-mailadres; daarna worden je kavels bewaard.');
  await limiet(env, 'kavels:' + g.id, 600, 3600000, 'Je kavels worden erg vaak opgeslagen. Probeer het over een paar minuten opnieuw.');
  const b = await leesJson(request, 1500000);
  await zetOudeKavelsOver(env, g.id);
  const nu = Date.now();
  let wijzig = b.wijzig, verwijder = b.verwijder, alles = false;
  if (Array.isArray(b.kavels)) { wijzig = b.kavels; alles = true; } // oudere app-versies sturen de hele lijst
  if (!Array.isArray(wijzig)) wijzig = [];
  if (!Array.isArray(verwijder)) verwijder = [];
  if (wijzig.length > MAX_KAVELS || verwijder.length > MAX_KAVELS) throw new Fout(400, 'ongeldig', 'Ongeldige kavellijst.');
  const goed = [];
  for (const k of wijzig) {
    const id = kavelId(k);
    if (!id || typeof k !== 'object') throw new Fout(400, 'ongeldig', 'Ongeldige kavellijst.');
    if (JSON.stringify(k).length > MAX_KAVEL_BYTES) throw new Fout(413, 'kavel_groot', 'Eén kavel is te groot om op te slaan. Verwijder een paar foto’s of notities.');
    goed.push(Object.assign({}, k, { id: k.id }));
  }
  const ids = verwijder.map(x => String(x)).filter(x => x.length <= 64);
  if (alles) {
    await env.DB.prepare("DELETE FROM kavel_items WHERE gebruiker_id = ? AND id NOT IN (SELECT CAST(json_extract(value, '$.id') AS TEXT) FROM json_each(?))")
      .bind(g.id, JSON.stringify(goed)).run();
  }
  if (ids.length) await env.DB.prepare('DELETE FROM kavel_items WHERE gebruiker_id = ? AND id IN (SELECT value FROM json_each(?))').bind(g.id, JSON.stringify(ids)).run();
  if (goed.length) {
    const nieuw = await env.DB.prepare("SELECT COUNT(*) AS n FROM json_each(?) WHERE CAST(json_extract(value, '$.id') AS TEXT) NOT IN (SELECT id FROM kavel_items WHERE gebruiker_id = ?)")
      .bind(JSON.stringify(goed), g.id).first();
    if ((await aantalKavels(env, g.id)) + (nieuw ? nieuw.n : 0) > MAX_KAVELS) throw new Fout(413, 'te_veel', 'Je hebt het maximum van ' + MAX_KAVELS + ' opgeslagen kavels bereikt. Verwijder kavels die je niet meer nodig hebt.');
    const ids2 = JSON.stringify(goed.map(k => String(k.id)));
    const ruimte = await env.DB.prepare('SELECT COALESCE(SUM(length(data)), 0) AS n FROM kavel_items WHERE gebruiker_id = ? AND id NOT IN (SELECT value FROM json_each(?))').bind(g.id, ids2).first();
    const erbij = goed.reduce((t, k) => t + JSON.stringify(k).length, 0);
    if ((ruimte ? ruimte.n : 0) + erbij > MAX_KAVELS_TOTAAL) throw new Fout(413, 'te_veel', 'Je opgeslagen kavels nemen te veel ruimte in (maximaal 20 MB). Verwijder oude kavels of foto\'s.');
    await env.DB.prepare("INSERT OR REPLACE INTO kavel_items (gebruiker_id, id, data, bijgewerkt) SELECT ?, CAST(json_extract(value, '$.id') AS TEXT), value, ? FROM json_each(?)")
      .bind(g.id, nu, JSON.stringify(goed)).run();
  }
  return json(Object.assign({ ok: true, bijgewerkt: nu }, kavelStatus(await aantalKavels(env, g.id))));
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
  const terug = String(env.APP_URL || '').replace(/[?#].*$/, '');
  const bundel = b.bundel ? bundels(env)[b.bundel] : null;
  const plan = b.plan ? plannen(env)[b.plan] : null;
  let velden;
  if (bundel) {
    if (!bundel.prijs) throw new Fout(400, 'bundel', 'Deze bundel is niet te koop.');
    // Losse bundel: eenmalige betaling; het tegoed komt erbij via de webhook
    velden = {
      'mode': 'payment',
      'line_items[0][price]': bundel.prijs,
      'line_items[0][quantity]': '1',
      'success_url': terug + '?betaald=bundel',
      'cancel_url': terug + '?betaald=0',
      'client_reference_id': String(g.id),
      'metadata[gebruiker_id]': String(g.id),
      'metadata[bundel]': String(b.bundel),
      'locale': 'nl'
    };
  } else {
    if (!plan || !plan.prijs) throw new Fout(400, 'plan', 'Onbekend abonnement.');
    if (g.stripe_abonnement && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(g.abonnement_status)) {
      throw new Fout(409, 'heeft_abonnement', 'Je hebt al een abonnement. Overstappen doe je via Abonnement beheren.');
    }
    velden = {
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
  }
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
// nieuw = true bij een net afgesloten abonnement; anders alleen bijwerken als het om het opgeslagen abonnement gaat,
// zodat een oud of tweede abonnement het plan niet kan terugzetten
async function verwerkAbonnement(env, sub, gebruikerId, nieuw) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const prijsId = item && item.price ? item.price.id : null;
  // Nieuwere Stripe-versies zetten current_period_end op het abonnementsitem
  const einde = (sub.current_period_end || (item && item.current_period_end) || 0) * 1000 || null;
  const actief = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
  const plan = actief ? (planVanPrijs(env, prijsId) || 'gratis') : 'gratis';
  const q = nieuw && gebruikerId
    ? env.DB.prepare('UPDATE gebruikers SET plan = ?, stripe_klant = ?, stripe_abonnement = ?, abonnement_status = ?, periode_einde = ? WHERE id = ?').bind(plan, sub.customer, sub.id, sub.status, einde, gebruikerId)
    : env.DB.prepare('UPDATE gebruikers SET plan = ?, stripe_abonnement = ?, abonnement_status = ?, periode_einde = ? WHERE (id = ? OR stripe_klant = ?) AND (stripe_abonnement IS NULL OR stripe_abonnement = ?)')
        .bind(plan, sub.id, sub.status, einde, gebruikerId || 0, sub.customer || '', sub.id);
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
  const afgerond = ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded';
  if (afgerond && o.mode === 'payment' && o.metadata && o.metadata.bundel) {
    const bundel = bundels(env)[o.metadata.bundel];
    const id = Number(o.client_reference_id || o.metadata.gebruiker_id) || 0;
    if (bundel && id > 0 && o.payment_status === 'paid') {
      // INSERT OR IGNORE: Stripe kan dezelfde webhook vaker sturen; dan maar één keer bijschrijven
      const r = await env.DB.prepare('INSERT OR IGNORE INTO aankopen (stripe_sessie, gebruiker_id, bundel, analyses, tijd) VALUES (?, ?, ?, ?, ?)')
        .bind(String(o.id), id, o.metadata.bundel, bundel.analyses, Date.now()).run();
      if (r.meta && r.meta.changes) await tegoedErbij(env, id, bundel.analyses);
    }
  } else if (afgerond && o.mode === 'subscription' && o.subscription) {
    const sub = await stripe(env, 'GET', 'subscriptions/' + o.subscription);
    await verwerkAbonnement(env, sub, Number(o.client_reference_id) || null, true);
  } else if (ev.type === 'customer.subscription.created' || ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') {
    const id = o.metadata && Number(o.metadata.gebruiker_id);
    await verwerkAbonnement(env, o, id || null, false);
  }
  return json({ ontvangen: true });
}

// ── Router ───────────────────────────────────────────────────────────────────
const ROUTES = {
  // Openbare informatie voor de app: is betalen ingesteld, is een uitnodigingscode nodig
  'GET /api/gezondheid': async (req, env) => json({ ok: true, betalen: !!env.STRIPE_SECRET_KEY, uitnodiging: !!env.UITNODIGINGSCODE, welkom: WELKOM(env), limiet_gratis: plannen(env).gratis.limiet,
    emailcontrole: emailControle(env), turnstile_sitekey: env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY ? env.TURNSTILE_SITEKEY : null }),
  'POST /api/registreer': registreer,
  'POST /api/inloggen': inloggen,
  'POST /api/uitloggen': uitloggen,
  'POST /api/wachtwoord-vergeten': wachtwoordVergeten,
  'POST /api/verifieer': verifieer,
  'POST /api/verifieer-opnieuw': codeOpnieuw,
  'POST /api/wachtwoord-herstellen': wachtwoordHerstellen,
  'GET /api/account': async (req, env) => json(await accountInfo(env, await huidigeGebruiker(req, env))),
  'GET /api/mijn-gegevens': mijnGegevens,
  'POST /api/account-verwijderen': accountVerwijderen,
  'POST /api/feedback': feedbackGeven,
  'GET /api/reviews': reviewsLijst,
  'GET /api/mijn-review': mijnReview,
  'POST /api/review': reviewSchrijven,
  'POST /api/review-verwijderen': reviewVerwijderen,
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
      if (pad === '/api/analyse') await telFout(env, e && e.message);
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

export default {
  fetch: (request, env) => verwerk(request, env),
  scheduled: (event, env, ctx) => { ctx.waitUntil(opruimen(env)); }
};
