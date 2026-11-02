// ═══ Veiling Analyser – account, abonnement en synchronisatie ════════════════
// Alleen actief als config.js een serveradres bevat (servermodus).

var account = null;
var serverInfo = null; // { betalen, uitnodiging, limiet_gratis } van /api/gezondheid
async function laadServerInfo() {
  try { serverInfo = await apiCall('/api/gezondheid'); } catch (e) { serverInfo = null; }
  document.body.classList.toggle('betalen-aan', !!(serverInfo && serverInfo.betalen));
}
function sessieToken() { try { return localStorage.getItem('va_sessie') || ''; } catch (e) { return ''; } }
function zetSessie(t) { try { if (t) localStorage.setItem('va_sessie', t); else localStorage.removeItem('va_sessie'); } catch (e) {} }

async function apiCall(pad, opt) {
  opt = opt || {};
  var headers = { 'Content-Type': 'application/json' };
  var t = sessieToken();
  if (t) headers.Authorization = 'Bearer ' + t;
  var r;
  try {
    r = await fetch(String(window.VA_CONFIG.api).replace(/\/+$/, '') + pad, { method: opt.method || 'GET', headers: headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
  } catch (e) {
    var f = new Error('Geen verbinding met de server. Controleer je internet en probeer het opnieuw.'); f.serverFout = true; throw f;
  }
  var data = null;
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) {
    var err = new Error((data && data.fout) || 'Er ging iets mis (foutcode ' + r.status + ').');
    err.serverFout = true; err.code = data && data.code; err.status = r.status;
    if (r.status === 401 && pad !== '/api/inloggen') { zetSessie(''); account = null; werkAccountBij(); }
    throw err;
  }
  return data;
}

function werkAccountBij() {
  var tekst = !account ? 'Niet ingelogd' : !account.email_geverifieerd ? 'E-mailadres nog bevestigen' : account.plan_naam + ': nog ' + beschikbaar() + ' ' + (beschikbaar() === 1 ? 'analyse' : 'analyses');
  var balk = document.getElementById('bevestig-bar');
  if (balk) balk.style.display = account && !account.email_geverifieerd ? 'flex' : 'none';
  if (typeof renderHome === 'function') renderHome();
  document.querySelectorAll('.js-acc-sub').forEach(function(e) {
    e.textContent = tekst;
    e.className = 'sub js-acc-sub' + (account ? (beschikbaar() <= 0 ? ' err' : ' ok') : '');
  });
  var w = document.getElementById('welkom-knoppen');
  if (w && serverModus()) {
    w.innerHTML = account
      ? '<button class="btn btn-primary btn-lg" onclick="nieuwKavel()">' + ic('plus') + 'Eerste kavel analyseren</button>'
      : '<button class="btn btn-primary btn-lg" onclick="vraagInloggen(\'registreren\')">Account maken</button><button class="btn btn-secondary btn-lg" onclick="vraagInloggen(\'inloggen\')">Inloggen</button>';
  }
}
// Nog te gebruiken: de rest van de maand (abonnement) plus het tegoed dat niet verloopt
function beschikbaar() {
  if (!account) return 0;
  if (typeof account.beschikbaar === 'number') return account.beschikbaar;
  return Math.max(0, (account.limiet || 0) - (account.gebruikt || 0)) + (account.tegoed || 0);
}
function toonVerbruik(v) {
  if (!account || !v) return;
  account.gebruikt = v.gebruikt; account.limiet = v.limiet;
  if (typeof v.tegoed === 'number') account.tegoed = v.tegoed;
  if (typeof v.beschikbaar === 'number') account.beschikbaar = v.beschikbaar;
  werkAccountBij();
}
async function laadAccount() {
  if (!sessieToken()) { account = null; werkAccountBij(); return; }
  try { account = await apiCall('/api/account'); } catch (e) { if (e.status !== 401) console.error(e); }
  werkAccountBij();
}

// ── Inloggen, account maken, wachtwoord vergeten ──
function vraagInloggen(modus) {
  modus = modus || 'inloggen';
  var titel = { inloggen: 'Inloggen', registreren: 'Account maken', vergeten: 'Wachtwoord vergeten' }[modus];
  var h = '';
  if (modus !== 'vergeten') {
    h += '<div class="tabs" role="tablist">' +
      '<button type="button" role="tab" class="' + (modus === 'inloggen' ? 'active' : '') + '" onclick="vraagInloggen(\'inloggen\')">Inloggen</button>' +
      '<button type="button" role="tab" class="' + (modus === 'registreren' ? 'active' : '') + '" onclick="vraagInloggen(\'registreren\')">Account maken</button></div>';
  }
  if (modus === 'registreren') h += '<p class="help" style="margin:0 0 12px">' + welkomTekst() + (serverInfo && serverInfo.betalen ? ' Een bundel of abonnement kies je later, als je wilt.' : '') + '</p>';
  if (modus === 'vergeten') h += '<p class="help" style="margin:0 0 12px">Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord te kiezen.</p>';
  h += '<div class="form-rij"><label for="li-email">E-mailadres</label><input class="input" id="li-email" type="email" autocomplete="email" onkeydown="if(event.key===\'Enter\')inlogVerstuur(\'' + modus + '\')"></div>';
  if (modus !== 'vergeten') {
    h += '<div class="form-rij"><label for="li-ww">Wachtwoord' + (modus === 'registreren' ? ' <span class="opt">(minstens 8 tekens)</span>' : '') + '</label>' +
      '<input class="input" id="li-ww" type="password" autocomplete="' + (modus === 'registreren' ? 'new-password' : 'current-password') + '" onkeydown="if(event.key===\'Enter\')inlogVerstuur(\'' + modus + '\')"></div>';
  }
  if (modus === 'registreren' && serverInfo && serverInfo.turnstile_sitekey) h += '<div id="ts-widget" style="margin:4px 0 10px;min-height:65px"></div>';
  if (modus === 'registreren' && serverInfo && serverInfo.uitnodiging) {
    h += '<div class="form-rij"><label for="li-code">Uitnodigingscode</label><input class="input" id="li-code" type="text" autocomplete="off" onkeydown="if(event.key===\'Enter\')inlogVerstuur(\'registreren\')"></div>';
  }
  if (modus === 'inloggen') h += '<button type="button" class="linkje" onclick="vraagInloggen(\'vergeten\')">Wachtwoord vergeten?</button>';
  if (modus === 'vergeten') h += '<button type="button" class="linkje" onclick="vraagInloggen(\'inloggen\')">Terug naar inloggen</button>';
  if (modus === 'registreren' && window.VA_CONFIG.voorwaarden) h += '<p class="help">Door een account te maken ga je akkoord met de <a href="' + esc(window.VA_CONFIG.voorwaarden) + '" target="_blank" rel="noopener">voorwaarden</a>' + (window.VA_CONFIG.privacy ? ' en het <a href="' + esc(window.VA_CONFIG.privacy) + '" target="_blank" rel="noopener">privacybeleid</a>' : '') + '.</p>';
  h += '<div class="msg err" id="li-err" role="alert"></div>';
  openModal(titel, h, [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: modus === 'inloggen' ? 'Inloggen' : modus === 'registreren' ? 'Account maken' : 'Stuur herstellink', cls: 'btn-primary', keepOpen: true, fn: function() { inlogVerstuur(modus); } }
  ]);
  if (modus === 'registreren' && serverInfo && serverInfo.turnstile_sitekey) toonTurnstile();
}

// ── Cloudflare Turnstile: onzichtbare controle of er een mens aanmeldt ──
var tsToken = null, tsWidget = null;
function toonTurnstile() {
  tsToken = null;
  function render() {
    var el = document.getElementById('ts-widget'); if (!el || !window.turnstile) return;
    tsWidget = window.turnstile.render(el, {
      sitekey: serverInfo.turnstile_sitekey, language: 'nl', theme: themaActief() === 'dark' ? 'dark' : 'light',
      callback: function(t) { tsToken = t; }, 'expired-callback': function() { tsToken = null; }, 'error-callback': function() { tsToken = null; }
    });
  }
  if (window.turnstile) { render(); return; }
  if (!document.getElementById('ts-script')) {
    var sc = document.createElement('script');
    sc.id = 'ts-script'; sc.async = true;
    sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    sc.onload = render;
    document.head.appendChild(sc);
  }
}

// ── E-mailadres bevestigen met de code van 6 cijfers ──
function vraagCode(melding) {
  if (!account) return;
  var h = '<p style="margin:0 0 14px">We hebben een code van 6 cijfers gestuurd naar <strong>' + esc(account.email) + '</strong>. Vul hem hieronder in. Zie je niets? Kijk ook bij ongewenste e-mail.</p>' +
    '<input class="input code-veld" id="code-in" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Code van 6 cijfers" oninput="this.value=this.value.replace(/\\D/g,\'\');if(this.value.length===6)codeVerstuur()">' +
    '<div class="msg err" id="code-err" role="alert"></div>';
  openModal('Bevestig je e-mailadres', h, [
    { label: 'Nieuwe code sturen', cls: 'btn-ghost', keepOpen: true, fn: codeOpnieuwVragen },
    { label: 'Bevestigen', cls: 'btn-primary', keepOpen: true, fn: codeVerstuur }
  ]);
  if (melding) toonMsg('code-err', melding);
}
var codeBezig = false;
async function codeVerstuur() {
  var v = (document.getElementById('code-in') || {}).value || '';
  if (v.length !== 6) { toonMsg('code-err', 'Vul de 6 cijfers uit de e-mail in.'); return; }
  if (codeBezig) return; codeBezig = true;
  try {
    var d = await apiCall('/api/verifieer', { method: 'POST', body: { code: v } });
    account = d.account; werkAccountBij(); closeModal();
    toast('E-mailadres bevestigd. Je kunt nu analyseren.');
  } catch (e) { toonMsg('code-err', e.message); var el = document.getElementById('code-in'); if (el) el.select(); }
  finally { codeBezig = false; }
}
async function codeOpnieuwVragen() {
  try { await apiCall('/api/verifieer-opnieuw', { method: 'POST' }); toast('Nieuwe code verstuurd naar ' + account.email); }
  catch (e) { toonMsg('code-err', e.message); }
}
async function inlogVerstuur(modus) {
  var email = document.getElementById('li-email').value.trim();
  var wwEl = document.getElementById('li-ww');
  var knop = document.querySelector('#modal-actions .btn-primary');
  if (knop) knop.disabled = true;
  try {
    if (modus === 'vergeten') {
      await apiCall('/api/wachtwoord-vergeten', { method: 'POST', body: { email: email } });
      closeModal();
      toast('Als er een account bij dit adres hoort, is er een herstellink gestuurd.');
      return;
    }
    var codeEl = document.getElementById('li-code');
    var data = await apiCall(modus === 'registreren' ? '/api/registreer' : '/api/inloggen', { method: 'POST', body: { email: email, wachtwoord: wwEl.value, code: codeEl ? codeEl.value : undefined, turnstile: tsToken || undefined } });
    zetSessie(data.token); account = data.account; werkAccountBij();
    closeModal();
    await haalKavelsVanServer();
    if (!account.email_geverifieerd) vraagCode(data.mail_fout);
    else toast(modus === 'registreren' ? 'Welkom! Je account is klaar.' : 'Ingelogd als ' + account.email);
    if (data.welkom_overgeslagen) toast('Vanaf dit internetadres zijn al meerdere accounts met gratis analyses gemaakt, dus dit account krijgt ze niet. Je kunt wel een bundel kopen.', null, true);
  } catch (e) {
    toonMsg('li-err', e.message);
    if (e.code === 'bot' && window.turnstile && tsWidget != null) { try { window.turnstile.reset(tsWidget); } catch (x) {} tsToken = null; }
  } finally { if (knop) knop.disabled = false; }
}
function vraagNieuwWachtwoord(token) {
  openModal('Nieuw wachtwoord kiezen',
    '<div class="form-rij"><label for="nw-ww">Nieuw wachtwoord <span class="opt">(minstens 8 tekens)</span></label><input class="input" id="nw-ww" type="password" autocomplete="new-password"></div><div class="msg err" id="nw-err" role="alert"></div>',
    [{ label: 'Annuleren', cls: 'btn-secondary' }, { label: 'Wachtwoord opslaan', cls: 'btn-primary', keepOpen: true, fn: async function() {
      try {
        var d = await apiCall('/api/wachtwoord-herstellen', { method: 'POST', body: { token: token, wachtwoord: document.getElementById('nw-ww').value } });
        zetSessie(d.token); account = d.account; werkAccountBij(); closeModal();
        toast('Wachtwoord opgeslagen. Je bent ingelogd.');
        await haalKavelsVanServer();
      } catch (e) { toonMsg('nw-err', e.message); }
    } }]);
}

function welkomTekst() {
  var n = serverInfo && serverInfo.welkom;
  return n ? 'Je krijgt ' + n + ' analyses cadeau. Ze verlopen niet: je gebruikt ze wanneer je wilt.' : 'Je krijgt een aantal analyses cadeau.';
}

// ── Accountoverzicht, tegoed, bundels en abonnement ──
function toonAccount() {
  if (!account) { vraagInloggen('inloggen'); return; }
  var a = account, nog = beschikbaar(), vol = nog <= 0;
  var prijzen = (window.VA_CONFIG && window.VA_CONFIG.prijzen) || {};
  var h = '<div class="acc-plan"><b>' + esc(a.plan_naam) + '</b><span class="kc-meta">' + esc(a.email) + '</span></div>';
  h += '<div class="acc-saldo"><b class="' + (vol ? 'neg' : '') + '">' + nog + '</b><span>' + (nog === 1 ? 'analyse' : 'analyses') + ' te gebruiken</span></div>';
  var uitleg = [];
  if (a.limiet > 0) uitleg.push(Math.max(0, a.limiet - a.gebruikt) + ' van de ' + a.limiet + ' van je abonnement deze maand');
  if (a.tegoed > 0 || a.limiet === 0) uitleg.push((a.tegoed || 0) + ' tegoed dat niet verloopt');
  h += '<div class="help" style="margin:0">' + esc(uitleg.join(' en ')) + '.' +
    (a.periode_einde && a.plan !== 'gratis' ? ' Je abonnement loopt tot ' + new Date(a.periode_einde).toLocaleDateString('nl-NL') + ' en wordt automatisch verlengd.' : '') +
    (vol && !a.kan_betalen ? ' Een ander bod doorrekenen kan wel gewoon.' : '') + '</div>';
  if (a.abonnement_status === 'past_due') h += '<div class="note">' + ic('alert') + '<span>De laatste betaling is niet gelukt. Werk je betaalgegevens bij via Abonnement beheren.</span></div>';
  if (a.kan_betalen) {
    var bund = (a.bundels || []).filter(function(b) { return b.te_koop; });
    if (bund.length) {
      h += '<h3 class="acc-kop">Losse bundel</h3><p class="help" style="margin:0 0 8px">Eén keer betalen, verloopt niet.</p><div class="plan-grid">';
      bund.forEach(function(b) {
        h += '<button type="button" class="plan-k" onclick="koopBundel(\'' + b.id + '\')">' + planInhoud(b.naam, prijzen[b.id], 'eenmalig', b.analyses) + '<span class="pk-actie">Koop bundel</span></button>';
      });
      h += '</div>';
    }
    var abos = a.plannen.filter(function(p) { return p.id !== 'gratis' && (p.te_koop || p.id === a.plan); });
    if (abos.length) {
      h += '<h3 class="acc-kop">Abonnement</h3><p class="help" style="margin:0 0 8px">Elke maand nieuwe analyses. Maandelijks opzegbaar.</p><div class="plan-grid">';
      abos.forEach(function(p) {
        var huidig = p.id === a.plan;
        var inhoud = planInhoud(p.naam, prijzen[p.id], 'per maand', p.limiet, true);
        h += huidig || a.plan !== 'gratis'
          ? '<div class="plan-k' + (huidig ? ' huidig' : '') + '">' + inhoud + '<span class="pk-actie">' + (huidig ? 'Je huidige abonnement' : '') + '</span></div>'
          : '<button type="button" class="plan-k" onclick="afrekenen(\'' + p.id + '\')">' + inhoud + '<span class="pk-actie">Kies ' + esc(p.naam) + '</span></button>';
      });
      h += '</div>';
      if (a.plan !== 'gratis') h += '<p class="help">Overstappen of opzeggen doe je via Abonnement beheren.</p>';
    }
    h += '<p class="help betaalmiddelen">Betalen kan met iDEAL, Bancontact of creditcard. Alle prijzen zijn inclusief btw.</p>';
  }
  h += '<h3 class="acc-kop">Sluittijden</h3><div class="acc-privacy" style="margin-top:6px"><button type="button" class="linkje" onclick="meldingenScherm()">' + ic('bell') + 'Meldingen op dit apparaat</button><button type="button" class="linkje" onclick="agendaKoppelen()">' + ic('calendar') + 'Agenda koppelen</button></div>';
  h += '<div class="acc-privacy"><button type="button" class="linkje" onclick="vraagReview()">' + ic('star') + 'Review schrijven</button><button type="button" class="linkje" onclick="downloadGegevens()">' + ic('download') + 'Mijn gegevens downloaden</button>' +
    '<button type="button" class="linkje gevaar" onclick="vraagVerwijderen()">Account verwijderen</button></div>';
  var acties = [{ label: 'Uitloggen', cls: 'btn-ghost', fn: uitloggen }];
  if (a.plan !== 'gratis' || a.abonnement_status) acties.push({ label: 'Abonnement beheren', cls: 'btn-secondary', keepOpen: true, fn: openPortaal });
  acties.push({ label: 'Sluiten', cls: 'btn-primary' });
  openModal('Account', h, acties);
}
async function afrekenen(plan) {
  try { var d = await apiCall('/api/afrekenen', { method: 'POST', body: { plan: plan } }); location.href = d.url; }
  catch (e) { toast(e.message, null, true); }
}
// Eén kaart: naam, prijs, aantal met prijs per analyse, en onderaan de actie (op gelijke hoogte via subgrid)
function planInhoud(naam, prijsTekst, per, aantal, perMaand) {
  var bedrag = prijsTekst ? String(prijsTekst).replace(/\s*per maand$/, '') : '';
  var getal = bedrag ? Number(bedrag.replace(/[^\d,]/g, '').replace(',', '.')) : 0;
  var stuk = getal && aantal ? '€' + (Math.round(getal / aantal * 100) / 100).toFixed(2).replace('.', ',') + ' per analyse' : '';
  return '<b>' + esc(naam) + '</b>' +
    '<span class="pk-prijs">' + (bedrag ? esc(bedrag) + ' <small>' + esc(per) + '</small>' : '') + '</span>' +
    '<span>' + (perMaand && aantal ? aantal.toLocaleString('nl-NL') + ' analyses per maand<br>' : '') + stuk + '</span>';
}
async function koopBundel(bundel) {
  try { var d = await apiCall('/api/afrekenen', { method: 'POST', body: { bundel: bundel } }); location.href = d.url; }
  catch (e) { toast(e.message, null, true); }
}
async function openPortaal() {
  try { var d = await apiCall('/api/portaal', { method: 'POST' }); location.href = d.url; }
  catch (e) { toast(e.message, null, true); }
}
// ── "Klopt er iets niet?" bij een analyse ──
function vraagFeedback(idx) {
  var k = kavels[idx]; if (!k) return;
  var h = '<p style="margin:0 0 12px">Wat klopt er niet aan de analyse van <strong>' + esc(k.titel || 'dit kavel') + '</strong>? Hiermee maken we de app beter.</p>' +
    '<div class="form-rij"><label for="fb-soort">Wat is er mis?</label><select class="input" id="fb-soort">' +
    '<option value="prijs">De prijzen kloppen niet</option><option value="product">Verkeerd product herkend</option><option value="kosten">De veilingkosten kloppen niet</option><option value="anders">Iets anders</option></select></div>' +
    '<div class="form-rij"><label for="fb-tekst">Toelichting <span class="opt">(optioneel)</span></label><textarea class="input" id="fb-tekst" rows="4" maxlength="1000" placeholder="Bijvoorbeeld: dit model verkoopt eerder voor €60"></textarea></div>' +
    '<div class="msg err" id="fb-err" role="alert"></div>';
  openModal('Klopt er iets niet?', h, [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: 'Versturen', cls: 'btn-primary', keepOpen: true, fn: async function() {
      try {
        await apiCall('/api/feedback', { method: 'POST', body: { soort: document.getElementById('fb-soort').value, tekst: document.getElementById('fb-tekst').value, kavel_url: k.url || '', product: k.titel || '' } });
        closeModal(); toast('Dank je wel! We kijken ernaar.');
      } catch (e) { toonMsg('fb-err', e.message); }
    } }
  ]);
}

// ── Review schrijven ──
var reviewSterren = 0;
async function vraagReview() {
  var bestaand = null;
  try { bestaand = (await apiCall('/api/mijn-review')).review; } catch (e) {}
  reviewSterren = bestaand ? bestaand.sterren : 0;
  var h = '<p style="margin:0 0 12px">Hoe bevalt Veiling Analyser? Je review komt op de website, ook als hij kritisch is.</p>' +
    '<fieldset class="sterren"><legend>Aantal sterren</legend>' + [1, 2, 3, 4, 5].map(function(n) {
      return '<button type="button" class="ster" data-n="' + n + '" aria-label="' + n + (n === 1 ? ' ster' : ' sterren') + '" onclick="kiesSterren(' + n + ')">' + ic('star') + '</button>';
    }).join('') + '</fieldset>' +
    '<div class="form-rij"><label for="rv-tekst">Je ervaring</label><textarea class="input" id="rv-tekst" rows="4" maxlength="600"></textarea></div>' +
    '<div class="form-rij"><label for="rv-naam">Naam op de website <span class="opt">(bijv. voornaam en woonplaats)</span></label><input class="input" id="rv-naam" maxlength="40" autocomplete="off"></div>' +
    '<p class="help">Zet geen achternaam, e-mailadres of telefoonnummer in je review.</p><div class="msg err" id="rv-err" role="alert"></div>';
  var acties = [{ label: 'Annuleren', cls: 'btn-secondary' }];
  if (bestaand) acties.unshift({ label: 'Review verwijderen', cls: 'btn-ghost', fn: async function() { try { await apiCall('/api/review-verwijderen', { method: 'POST' }); toast('Je review is verwijderd.'); } catch (e) { toast(e.message, null, true); } } });
  acties.push({ label: 'Plaatsen', cls: 'btn-primary', keepOpen: true, fn: async function() {
    if (!reviewSterren) { toonMsg('rv-err', 'Kies eerst het aantal sterren.'); return; }
    try {
      await apiCall('/api/review', { method: 'POST', body: { sterren: reviewSterren, tekst: document.getElementById('rv-tekst').value, naam: document.getElementById('rv-naam').value } });
      closeModal(); toast('Dank je wel voor je review!');
    } catch (e) { toonMsg('rv-err', e.message); }
  } });
  openModal(bestaand ? 'Je review aanpassen' : 'Review schrijven', h, acties);
  if (bestaand) { document.getElementById('rv-tekst').value = bestaand.tekst; document.getElementById('rv-naam').value = bestaand.naam; }
  kiesSterren(reviewSterren);
}
function kiesSterren(n) {
  reviewSterren = n;
  document.querySelectorAll('.sterren .ster').forEach(function(b) { var aan = Number(b.getAttribute('data-n')) <= n; b.classList.toggle('aan', aan); b.setAttribute('aria-pressed', aan ? 'true' : 'false'); });
}

// ── Eigen gegevens (AVG) ──
async function downloadGegevens() {
  try {
    var d = await apiCall('/api/mijn-gegevens');
    var blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'veiling-analyser-gegevens.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
  } catch (e) { toast(e.message, null, true); }
}
function vraagVerwijderen() {
  if (!account) return;
  var abo = account.plan !== 'gratis' && account.abonnement_status && account.abonnement_status !== 'canceled';
  var h = '<p style="margin:0 0 10px">Hiermee verwijder je je account <strong>' + esc(account.email) + '</strong> en de kavels die op de server staan. Dit kan niet ongedaan worden gemaakt.</p>' +
    (abo ? '<div class="note">' + ic('alert') + '<span>Je abonnement stopt direct. De lopende periode wordt niet terugbetaald.</span></div>' : '') +
    '<p class="help" style="margin:0 0 12px">De kavels op dit apparaat blijven staan. Wil je ze bewaren, download dan eerst je gegevens.</p>' +
    '<div class="form-rij"><label for="vw-ww">Vul je wachtwoord in om te bevestigen</label><input class="input" id="vw-ww" type="password" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')verwijderAccount()"></div>' +
    '<div class="msg err" id="vw-err" role="alert"></div>';
  openModal('Account verwijderen', h, [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: 'Definitief verwijderen', cls: 'btn-danger', keepOpen: true, fn: verwijderAccount }
  ]);
}
var verwijderBezig = false;
async function verwijderAccount() {
  var ww = (document.getElementById('vw-ww') || {}).value || '';
  if (!ww) { toonMsg('vw-err', 'Vul je wachtwoord in.'); return; }
  if (verwijderBezig) return; verwijderBezig = true;
  try {
    await apiCall('/api/account-verwijderen', { method: 'POST', body: { wachtwoord: ww } });
    zetSessie(''); account = null; syncStand = {}; bewaarSyncStand(); werkAccountBij(); closeModal();
    toast('Je account is verwijderd.');
  } catch (e) { toonMsg('vw-err', e.message); }
  finally { verwijderBezig = false; }
}
async function uitloggen() {
  // Meldingen van dit account horen niet meer op dit apparaat te komen
  try { var ab = await huidigAbonnement(); if (ab) { await apiCall('/api/push-uit', { method: 'POST', body: { endpoint: ab.endpoint } }); await ab.unsubscribe(); } } catch (e) {}
  try { localStorage.removeItem('va_agenda_url'); localStorage.removeItem('va_meldingen'); } catch (e) {}
  try { await apiCall('/api/uitloggen', { method: 'POST' }); } catch (e) {}
  zetSessie(''); account = null; syncStand = {}; bewaarSyncStand(); werkAccountBij();
  toast('Uitgelogd. Je kavels blijven op dit apparaat staan.');
}

// ── Kavels synchroniseren met de server ──
// Alleen wat veranderd is gaat naar de server: per kavel wordt de laatst verstuurde versie onthouden.
var syncTimer = null, syncBezig = false, syncNogEens = false;
var syncStand = {}; // kavel-id → JSON zoals de server hem heeft
function laadSyncStand() { try { syncStand = JSON.parse(localStorage.getItem('va_sync_stand') || '{}') || {}; } catch (e) { syncStand = {}; } }
function bewaarSyncStand() { try { localStorage.setItem('va_sync_stand', JSON.stringify(syncStand)); } catch (e) {} }
laadSyncStand();
function syncNaarServer() {
  if (!serverModus() || !account) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(stuurWijzigingen, 1200);
}
async function stuurWijzigingen() {
  if (!serverModus() || !account) return;
  if (syncBezig) { syncNogEens = true; return; }
  syncBezig = true;
  try {
    var nu = {}, wijzig = [], verwijder = [];
    kavels.forEach(function(k) { if (k && k.id != null) { var s = JSON.stringify(k); nu[k.id] = s; if (syncStand[k.id] !== s) wijzig.push(k); } });
    Object.keys(syncStand).forEach(function(id) { if (!(id in nu)) verwijder.push(id); });
    // In stukken van hooguit ~900 kB per verzoek
    var stuk = [], grootte = 0, stukken = [];
    wijzig.forEach(function(k) { var n = nu[k.id].length; if (stuk.length && grootte + n > 900000) { stukken.push(stuk); stuk = []; grootte = 0; } stuk.push(k); grootte += n; });
    if (stuk.length || verwijder.length) stukken.push(stuk);
    for (var i = 0; i < stukken.length; i++) {
      var body = { wijzig: stukken[i] };
      if (i === 0 && verwijder.length) body.verwijder = verwijder;
      var d = await apiCall('/api/kavels', { method: 'PUT', body: body });
      stukken[i].forEach(function(k) { syncStand[k.id] = nu[k.id]; });
      if (i === 0) verwijder.forEach(function(id) { delete syncStand[id]; });
      toonKavelWaarschuwing(d);
    }
    bewaarSyncStand();
  } catch (e) {
    console.error('Synchroniseren mislukt', e);
    if (e.status === 413) toast(e.message, null, true);
  } finally {
    syncBezig = false;
    if (syncNogEens) { syncNogEens = false; syncNaarServer(); }
  }
}
var kavelWaarschuwingGetoond = false;
function toonKavelWaarschuwing(d) {
  if (d && d.waarschuwing && !kavelWaarschuwingGetoond) { kavelWaarschuwingGetoond = true; toast(d.waarschuwing, null, true); }
}
// Na inloggen: kavels van de server en van dit apparaat samenvoegen (niets gaat verloren)
async function haalKavelsVanServer() {
  if (!serverModus() || !account) return;
  try {
    var d = await apiCall('/api/kavels');
    var opServer = {};
    syncStand = {};
    (d.kavels || []).forEach(function(k) { opServer[k.id] = 1; syncStand[k.id] = JSON.stringify(k); });
    bewaarSyncStand();
    var alleenHier = kavels.filter(function(k) { return !opServer[k.id]; });
    kavels = (d.kavels || []).concat(alleenHier);
    herberekenAlles();
    try { localStorage.setItem('hnvi_kavels', JSON.stringify(kavels)); } catch (e) {}
    if (alleenHier.length) syncNaarServer();
    toonKavelWaarschuwing(d);
    updateBadge(); renderOverzicht(); renderGewonnen();
  } catch (e) { console.error(e); }
}
