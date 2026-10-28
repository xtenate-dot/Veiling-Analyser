// ═══ Veiling Analyser – startpagina ═══════════════════════════════════════════
// Het eerste scherm: direct een link plakken, kavels die binnenkort sluiten en recente analyses.

function groet() {
  var u = new Date().getHours();
  return u < 6 ? 'Goedenacht' : u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond';
}
function resterend(ms) {
  var min = Math.round((ms - Date.now()) / 60000);
  if (min < 1) return 'sluit nu';
  if (min < 60) return 'nog ' + min + ' min';
  var uur = Math.floor(min / 60);
  if (uur < 24) return 'nog ' + uur + ' u ' + (min % 60) + ' min';
  var dagen = Math.round(uur / 24);
  if (dagen > 14) return 'sluit ' + new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  return 'nog ' + dagen + (dagen === 1 ? ' dag' : ' dagen');
}
function sluitMs(k) { return k.pagina && k.pagina.sluit_iso ? Date.parse(k.pagina.sluit_iso) : NaN; }

// Een voorbeeld van het kavelkaartje, zodat nieuwe gebruikers direct zien wat de app oplevert
function voorbeeldKaartje() {
  return '<div class="home-voorbeeld" aria-hidden="true">' +
    '<div class="hv-kavel"><span class="pill pill-kopen">Aanrader</span><b>Bosch accuboormachine 18V</b><span>Huidig bod €40 · verwachte verkoop €80</span></div>' +
    '<div class="lot-tag"><div class="lt-l">Bied maximaal</div><div class="lt-v">€45</div><div class="lt-s">voor 20% marge<br>quitte bij €56</div></div></div>';
}

function zoWerktHet() {
  var h = '';
    h += '<section class="home-stappen"><h2>Zo werkt het</h2><ol>' +
      '<li><b>Plak de link</b><span>Van elke veilingsite. Op je telefoon kun je hem ook delen naar de app.</span></li>' +
      '<li><b>De app zoekt de prijzen</b><span>Echte advertenties en verkochte items van vandaag, en de nieuwprijs, met links erbij.</span></li>' +
      '<li><b>Bied tot het kaartje</b><span>Het maximale bod waarbij je na opgeld, btw en verkoopkosten je marge haalt.</span></li></ol></section>';
  return h;
}

function homeRij(k) {
  var a = partijOnbetrouwbaar(k) ? { key: 'wacht', label: 'Controle nodig' } : adviesInfo(k.advies);
  var idx = kavels.indexOf(k);
  var sl = sluitMs(k);
  var sub = [];
  if (isFinite(sl) && sl > Date.now()) sub.push('<span class="hr-tijd' + (sl - Date.now() < 3 * 3600000 ? ' snel' : '') + '">' + resterend(sl) + '</span>');
  sub.push(esc(veilingVan(k)));
  return '<button type="button" class="home-rij" onclick="openDetail(' + idx + ')">' +
    '<span class="kc-thumb">' + thumbHtml(k) + '</span>' +
    '<span class="hr-tekst"><b>' + esc(k.titel || 'Onbekend') + '</b><span>' + sub.join('<span class="hr-sep"></span>') + '</span></span>' +
    '<span class="hr-rechts"><span class="pill pill-' + a.key + '">' + a.label + '</span><span class="hr-bod">' + (k.maxBod > 0 ? 'max ' + fmt(k.maxBod) : '&nbsp;') + '</span></span></button>';
}

function renderHome() {
  var box = document.getElementById('home'); if (!box) return;
  var ingelogdNodig = serverModus() && !account;
  var actief = kavels.filter(function(k) { return k.status !== 'gewonnen'; });
  var nieuw = kavels.length === 0;
  var h = '<header class="home-kop"><p class="home-groet">' + groet() + '</p>' +
    '<h1 id="home-titel">' + (nieuw || ingelogdNodig ? 'Weet tot hoeveel je kunt bieden' : 'Welk kavel bekijken we?') + '</h1>' +
    (nieuw || ingelogdNodig ? '<p class="home-intro">Plak de link van een veilingkavel. De app leest de veilingpagina, zoekt echte prijzen van vandaag op Marktplaats, 2dehands en eBay, en rekent opgeld en btw voor je door.</p>' : '') +
    '</header>';

  if (ingelogdNodig) {
    h += '<div class="home-grid"><div class="card home-snel"><h2>Begin gratis</h2><p class="help" style="margin:0 0 16px">Maak een account en analyseer elke maand ' +
      (serverInfo && serverInfo.limiet_gratis ? serverInfo.limiet_gratis + ' kavels' : 'een aantal kavels') + ' gratis.</p>' +
      '<ul class="voordelen"><li>' + ic('check') + 'Echte prijzen van vandaag, met links naar de advertenties</li><li>' + ic('check') + 'Opgeld, vaste kosten en btw van de veiling doorgerekend</li><li>' + ic('check') + 'Je kavels op telefoon en computer</li></ul>' +
      '<div class="btns" id="welkom-knoppen"><button class="btn btn-primary btn-lg" onclick="vraagInloggen(\'registreren\')">Account maken</button><button class="btn btn-secondary btn-lg" onclick="vraagInloggen(\'inloggen\')">Inloggen</button></div></div>' +
      voorbeeldKaartje() + '</div>' + zoWerktHet();
    box.innerHTML = h + installKaart();
    return;
  }

  h += '<div class="home-grid"><form class="card home-snel" onsubmit="snelAnalyse(event)" novalidate>' +
    '<label for="snel-url" class="snel-l">Plak de link van een kavel</label>' +
    '<div class="snel-rij"><input class="input" id="snel-url" type="url" inputmode="url" autocomplete="off" placeholder="https://…" aria-describedby="snel-help">' +
    '<button type="button" class="btn btn-secondary" onclick="plakLink()">' + ic('clipboard') + 'Plakken</button></div>' +
    '<button type="submit" class="btn btn-primary btn-lg btn-block">Analyseer kavel</button>' +
    '<div class="help" id="snel-help">Werkt met elke veilingsite. Meerdere links? <button type="button" class="linkje" onclick="openBatch()">Plak een lijst</button></div>' +
    '<div class="msg err" id="snel-err" role="alert"></div></form>';
  if (nieuw) h += voorbeeldKaartje();
  else {
    var nKopen = actief.filter(function(k) { return k.advies === 'kopen' && !partijOnbetrouwbaar(k); }).length;
    var vandaag = actief.filter(function(k) { var s = sluitMs(k); return isFinite(s) && s > Date.now() && s - Date.now() < 864e5; }).length;
    var winst = 0, nVerkocht = 0;
    kavels.forEach(function(k) { var w = winstVan(k); if (w != null) { winst += w; nVerkocht++; } });
    h += '<div class="home-tegels">' +
      '<button type="button" class="tegel" onclick="actieveFilter=\'kopen\';switchTab(\'overzicht\')"><span>Aanraders</span><b class="pos">' + nKopen + '</b></button>' +
      '<button type="button" class="tegel" onclick="switchTab(\'overzicht\')"><span>Sluiten binnen 24 uur</span><b>' + vandaag + '</b></button>' +
      '<button type="button" class="tegel" onclick="switchTab(\'gewonnen\')"><span>Winst op verkochte kavels</span><b class="' + (winst > 0 ? 'pos' : '') + '">' + (nVerkocht ? fmtS(winst) : '-') + '</b></button>';
    if (serverModus() && account) {
      var pct = Math.min(100, Math.round(account.gebruikt / Math.max(1, account.limiet) * 100));
      h += '<button type="button" class="tegel" onclick="toonAccount()"><span>Analyses deze maand</span><b>' + account.gebruikt + ' van ' + account.limiet + '</b><span class="acc-meter' + (pct >= 100 ? ' vol' : '') + '" style="margin:6px 0 0"><i style="width:' + pct + '%"></i></span></button>';
    }
    h += '</div>';
  }
  h += '</div>';

  if (!nieuw) {
    var sluitend = actief.filter(function(k) { var s = sluitMs(k); return isFinite(s) && s > Date.now(); })
      .sort(function(a, b) { return sluitMs(a) - sluitMs(b); }).slice(0, 4);
    var gezien = {};
    sluitend.forEach(function(k) { gezien[k.id] = 1; });
    var recent = actief.filter(function(k) { return !gezien[k.id]; })
      .sort(function(a, b) { return (b.toegevoegd || 0) - (a.toegevoegd || 0); }).slice(0, 4);
    if (sluitend.length) h += '<section class="home-lijst"><div class="hl-kop"><h2>Sluit binnenkort</h2></div>' + sluitend.map(homeRij).join('') + '</section>';
    if (recent.length) h += '<section class="home-lijst"><div class="hl-kop"><h2>Recent geanalyseerd</h2><button type="button" class="linkje" onclick="switchTab(\'overzicht\')">Alle kavels</button></div>' + recent.map(homeRij).join('') + '</section>';
  } else {
    h += zoWerktHet();
  }
  var oud = document.getElementById('snel-url');
  var bewaard = oud ? oud.value : '';
  box.innerHTML = h + installKaart();
  if (bewaard && document.getElementById('snel-url')) document.getElementById('snel-url').value = bewaard;
}

async function snelAnalyse(e) {
  if (e) e.preventDefault();
  var veld = document.getElementById('snel-url');
  var url = (veld.value || '').trim();
  var m = url.match(/https?:\/\/[^\s<>"']+/i);
  if (!m && /^[\w-]+(\.[\w-]+)+\//.test(url)) m = ['https://' + url];
  if (!m) { toonMsg('snel-err', 'Plak de volledige link van het kavel, beginnend met https://.'); veld.focus(); return; }
  nieuwKavel();
  document.getElementById('kavel-url').value = m[0];
  syncVeilingVelden();
  analyseer();
}
async function plakLink() {
  try {
    var t = await navigator.clipboard.readText();
    var m = (t || '').match(/https?:\/\/[^\s<>"']+/i);
    if (!m) { toast('Er staat geen link op je klembord.', null, true); return; }
    document.getElementById('snel-url').value = m[0];
  } catch (e) { toast('Plakken lukt hier niet. Houd het veld ingedrukt en kies Plakken.', null, true); }
}

// ── App installeren (beginscherm) ──
var installPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) { e.preventDefault(); installPrompt = e; if (huidigeTab === 'home') renderHome(); });
window.addEventListener('appinstalled', function() { installPrompt = null; try { localStorage.setItem('va_install_weg', '1'); } catch (e) {} renderHome(); });
function isGeinstalleerd() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
function installKaart() {
  var weg = false; try { weg = localStorage.getItem('va_install_weg') === '1'; } catch (e) {}
  if (weg || isGeinstalleerd()) return '';
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!installPrompt && !ios) return '';
  return '<div class="card install-kaart"><div class="ik-ico">' + ic('download') + '</div><div class="ik-tekst"><b>Zet de app op je beginscherm</b><span>' +
    (installPrompt ? 'Dan open je hem met één tik, net als een gewone app.' : 'Tik onderin Safari op Delen en kies Zet op beginscherm.') + '</span></div>' +
    (installPrompt ? '<button class="btn btn-primary btn-sm" onclick="installeer()">Installeren</button>' : '') +
    '<button class="btn btn-ghost btn-icon btn-sm" onclick="installWeg()" aria-label="Niet meer tonen">' + ic('x') + '</button></div>';
}
async function installeer() {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch (e) {}
  installPrompt = null; renderHome();
}
function installWeg() { try { localStorage.setItem('va_install_weg', '1'); } catch (e) {} renderHome(); }

// Aftellen bijwerken zolang de startpagina open is
setInterval(function() { if (huidigeTab === 'home' && !document.hidden && !document.querySelector('#home :focus')) renderHome(); }, 60000);
