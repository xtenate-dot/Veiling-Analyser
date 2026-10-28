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
  var tekst = !account ? 'Niet ingelogd' : account.plan_naam + ': ' + account.gebruikt + ' van ' + account.limiet + ' deze maand';
  document.querySelectorAll('.js-acc-sub').forEach(function(e) {
    e.textContent = tekst;
    e.className = 'sub js-acc-sub' + (account ? (account.gebruikt >= account.limiet ? ' err' : ' ok') : '');
  });
  var w = document.getElementById('welkom-knoppen');
  if (w && serverModus()) {
    w.innerHTML = account
      ? '<button class="btn btn-primary btn-lg" onclick="nieuwKavel()">' + ic('plus') + 'Eerste kavel analyseren</button>'
      : '<button class="btn btn-primary btn-lg" onclick="vraagInloggen(\'registreren\')">Account maken</button><button class="btn btn-secondary btn-lg" onclick="vraagInloggen(\'inloggen\')">Inloggen</button>';
  }
}
function toonVerbruik(v) {
  if (!account || !v) return;
  account.gebruikt = v.gebruikt; account.limiet = v.limiet;
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
  if (modus === 'registreren') h += '<p class="help" style="margin:0 0 12px">Je krijgt elke maand ' + (serverInfo && serverInfo.limiet_gratis ? serverInfo.limiet_gratis + ' analyses' : 'een aantal analyses') + ' gratis.' + (serverInfo && serverInfo.betalen ? ' Een abonnement kies je later, als je wilt.' : '') + '</p>';
  if (modus === 'vergeten') h += '<p class="help" style="margin:0 0 12px">Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord te kiezen.</p>';
  h += '<div class="form-rij"><label for="li-email">E-mailadres</label><input class="input" id="li-email" type="email" autocomplete="email" onkeydown="if(event.key===\'Enter\')inlogVerstuur(\'' + modus + '\')"></div>';
  if (modus !== 'vergeten') {
    h += '<div class="form-rij"><label for="li-ww">Wachtwoord' + (modus === 'registreren' ? ' <span class="opt">(minstens 8 tekens)</span>' : '') + '</label>' +
      '<input class="input" id="li-ww" type="password" autocomplete="' + (modus === 'registreren' ? 'new-password' : 'current-password') + '" onkeydown="if(event.key===\'Enter\')inlogVerstuur(\'' + modus + '\')"></div>';
  }
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
    var data = await apiCall(modus === 'registreren' ? '/api/registreer' : '/api/inloggen', { method: 'POST', body: { email: email, wachtwoord: wwEl.value, code: codeEl ? codeEl.value : undefined } });
    zetSessie(data.token); account = data.account; werkAccountBij();
    closeModal();
    toast(modus === 'registreren' ? 'Welkom! Je account is klaar.' : 'Ingelogd als ' + account.email);
    await haalKavelsVanServer();
  } catch (e) {
    toonMsg('li-err', e.message);
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

// ── Accountoverzicht en abonnement ──
function toonAccount() {
  if (!account) { vraagInloggen('inloggen'); return; }
  var a = account, vol = a.gebruikt >= a.limiet;
  var prijzen = (window.VA_CONFIG && window.VA_CONFIG.prijzen) || {};
  var h = '<div class="acc-plan"><b>' + esc(a.plan_naam) + '</b><span class="kc-meta">' + esc(a.email) + '</span></div>';
  h += '<div class="acc-meter' + (vol ? ' vol' : '') + '"><i style="width:' + Math.min(100, Math.round(a.gebruikt / Math.max(1, a.limiet) * 100)) + '%"></i></div>';
  h += '<div class="help" style="margin:0">' + a.gebruikt + ' van ' + a.limiet + ' analyses gebruikt deze maand.' + (vol && !a.kan_betalen ? ' Vanaf de 1e van volgende maand kun je weer verder.' : '') +
    (a.periode_einde && a.plan !== 'gratis' ? ' Je abonnement loopt tot ' + new Date(a.periode_einde).toLocaleDateString('nl-NL') + ' en wordt automatisch verlengd.' : '') + '</div>';
  if (a.abonnement_status === 'past_due') h += '<div class="note">' + ic('alert') + '<span>De laatste betaling is niet gelukt. Werk je betaalgegevens bij via Abonnement beheren.</span></div>';
  if (a.kan_betalen) {
    h += '<div class="plan-grid">';
    a.plannen.filter(function(p) { return p.te_koop || p.id === a.plan; }).forEach(function(p) {
      var huidig = p.id === a.plan;
      var inhoud = '<b>' + esc(p.naam) + '</b><span>' + p.limiet + ' analyses per maand' + (prijzen[p.id] ? ', ' + esc(prijzen[p.id]) : '') + '</span>' + (huidig ? '<span>Je huidige abonnement</span>' : '');
      h += huidig || a.plan !== 'gratis'
        ? '<div class="plan-k' + (huidig ? ' huidig' : '') + '">' + inhoud + '</div>'
        : '<button type="button" class="plan-k" onclick="afrekenen(\'' + p.id + '\')">' + inhoud + '<span style="color:var(--link);font-weight:600">Kies ' + esc(p.naam) + '</span></button>';
    });
    h += '</div>';
    if (a.plan !== 'gratis') h += '<p class="help">Overstappen of opzeggen doe je via Abonnement beheren.</p>';
  }
  var acties = [{ label: 'Uitloggen', cls: 'btn-ghost', fn: uitloggen }];
  if (a.plan !== 'gratis' || a.abonnement_status) acties.push({ label: 'Abonnement beheren', cls: 'btn-secondary', keepOpen: true, fn: openPortaal });
  acties.push({ label: 'Sluiten', cls: 'btn-primary' });
  openModal('Account', h, acties);
}
async function afrekenen(plan) {
  try { var d = await apiCall('/api/afrekenen', { method: 'POST', body: { plan: plan } }); location.href = d.url; }
  catch (e) { toast(e.message, null, true); }
}
async function openPortaal() {
  try { var d = await apiCall('/api/portaal', { method: 'POST' }); location.href = d.url; }
  catch (e) { toast(e.message, null, true); }
}
async function uitloggen() {
  try { await apiCall('/api/uitloggen', { method: 'POST' }); } catch (e) {}
  zetSessie(''); account = null; werkAccountBij();
  toast('Uitgelogd. Je kavels blijven op dit apparaat staan.');
}

// ── Kavels synchroniseren met de server ──
var syncTimer = null;
function syncNaarServer() {
  if (!serverModus() || !account) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function() {
    apiCall('/api/kavels', { method: 'PUT', body: { kavels: kavels } }).catch(function(e) { console.error('Synchroniseren mislukt', e); });
  }, 1200);
}
// Na inloggen: kavels van de server en van dit apparaat samenvoegen (niets gaat verloren)
async function haalKavelsVanServer() {
  if (!serverModus() || !account) return;
  try {
    var d = await apiCall('/api/kavels');
    var opServer = {};
    (d.kavels || []).forEach(function(k) { opServer[k.id] = 1; });
    var alleenHier = kavels.filter(function(k) { return !opServer[k.id]; });
    kavels = (d.kavels || []).concat(alleenHier);
    try { localStorage.setItem('hnvi_kavels', JSON.stringify(kavels)); } catch (e) {}
    if (alleenHier.length) syncNaarServer();
    updateBadge(); renderOverzicht(); renderGewonnen();
  } catch (e) { console.error(e); }
}
