// ═══ Veiling Analyser ═══════════════════════════════════════════════════════
// Structuur: 1 state · 2 UI-helpers · 3 opslag & sync · 4 analyse · 5 resultaat
//            6 overzicht · 7 gewonnen · 8 selectie · 9 start
// ────────────────────────────────────────────────────────────────────────────

// Uit de gedeelde analysekern (kern.js)
var K = window.VAKern;
var REGELINGEN = K.REGELINGEN, normTarief = K.normTarief, kostenFactoren = K.kostenFactoren, berekenKosten = K.berekenKosten, bodVoorTotaal = K.bodVoorTotaal;
var apiKostenVan = K.apiKostenVan, parseBedrag = K.parseBedrag, num = K.num, kortTekst = K.kortTekst, veiligeUrl = K.veiligeUrl, normUrl = K.normUrl;
var hostVan = K.hostVan, parseJSON = K.parseJSON, naamUitUrl = K.naamUitUrl, korteZoekterm = K.korteZoekterm, isToolFout = K.isToolFout, cacheSleutel = K.cacheSleutel;

// ── 1. State ────────────────────────────────────────────────────────────────
var kavels = [];
var imgs = [];
var huidigeThumb = null;
var bodType = 'ander';
var actieveFilter = 'alles';
var zoekTerm = '';
var sorteerOp = (function() { try { var v = localStorage.getItem('va_sorteer'); return ['nieuw', 'veiling', 'sluit', 'advies', 'marge', 'prijs'].indexOf(v) !== -1 ? v : 'nieuw'; } catch (e) { return 'nieuw'; } })();
var selectieModus = false;
var geselecteerd = new Set();
var huidigGefilterd = [];
var vorigeLijstSig = '';
var huidigeTab = 'home';
var faseNu = 'invoer';

// ── 2. UI-helpers ───────────────────────────────────────────────────────────
var ICONS = {
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  folder: '<path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h4.5l2 2h7.5a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  brand: '<path d="M10.5 4.5h8a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-8L4 12z"/><circle cx="9.5" cy="12" r="1.6"/><path d="M13.5 9.5h3.5M13.5 14.5h3.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  gavel: '<rect x="11" y="2.5" width="5.5" height="10" rx="1.3" transform="rotate(-45 13.75 7.5)"/><path d="M11.8 9.5L4.2 17.1"/><path d="M13 20.5h8M15 18h4"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  clipboard: '<rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9.5 4.5V3.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.7M9 11h6M9 15h4"/>',
  euro: '<path d="M17.5 6.5A7 7 0 1 0 17.5 17.5M4 10h9M4 14h9"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8M10 17h4"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5v-15z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5v-15z"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9 4.5 4.5 0 0 0 7 18z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 4l9 16H3L12 4z"/><path d="M12 10v4M12 17.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  select: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'
};
function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>'; }
function ic(name) { return '<span class="ico">' + svg(name) + '</span>'; }
function hydrateIcons() {
  document.querySelectorAll('[data-i]').forEach(function(e) { e.innerHTML = svg(e.getAttribute('data-i')); });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtS(n) {
  if (n == null || !isFinite(n)) return '-';
  return n > 0 ? '+' + fmt(n) : n < 0 ? '−' + fmt(-n) : fmt(0);
}

// Thema
function themaActief() {
  var t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function themaLabels() {
  var dark = themaActief() === 'dark';
  document.querySelectorAll('.js-theme-lbl').forEach(function(e) { e.textContent = dark ? 'Lichte weergave' : 'Donkere weergave'; });
}
function toggleTheme() {
  var nxt = themaActief() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nxt);
  try { localStorage.setItem('va_theme', nxt); } catch (e) {}
  themaLabels();
}

// Modal & toast
var modalActies = [];
function openModal(titel, bodyHtml, acties) {
  document.getElementById('modal-title').textContent = titel;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  var box = document.getElementById('modal-actions');
  box.innerHTML = '';
  modalActies = acties || [];
  modalActies.forEach(function(a) {
    var b = document.createElement('button');
    b.className = 'btn ' + (a.cls || 'btn-secondary');
    b.textContent = a.label;
    b.onclick = function() { if (!a.keepOpen) closeModal(); if (a.fn) a.fn(); };
    box.appendChild(b);
  });
  document.getElementById('modal').classList.add('open');
  var focusEl = document.querySelector('#modal-body input') || box.lastChild;
  if (focusEl) setTimeout(function() { focusEl.focus(); }, 30);
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }
function bevestig(titel, tekst, label, gevaar, fn) {
  openModal(titel, esc(tekst), [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: label, cls: gevaar ? 'btn-danger' : 'btn-primary', fn: fn }
  ]);
}
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

function toast(msg, actie, fout) {
  var box = document.getElementById('toasts');
  var t = document.createElement('div');
  t.className = 'toast' + (fout ? ' err' : '');
  var s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
  if (actie) {
    var b = document.createElement('button'); b.className = 'ta'; b.textContent = actie.label;
    b.onclick = function() { actie.fn(); t.remove(); };
    t.appendChild(b);
  }
  box.appendChild(t);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(function() { if (t.parentNode) t.remove(); }, actie ? 7000 : 3500);
}

function toonMsg(id, msg) {
  var el = document.getElementById(id);
  el.innerHTML = ic('alert') + '<span></span>';
  el.lastChild.textContent = msg;
  el.style.display = 'flex';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function vriendelijkeFout(e) {
  if (e && e.serverFout) return e.message;
  var m = (e && e.message) ? e.message : '';
  var l = m.toLowerCase();
  if (l.indexOf('rate_limit') !== -1) return 'Je hebt te veel analyses kort achter elkaar gedaan. Wacht een minuut en probeer het opnieuw.';
  if (l.indexOf('credit balance') !== -1) return 'Je Anthropic-tegoed is op. Laad tegoed op via console.anthropic.com en probeer het opnieuw.';
  if (l.indexOf('authentication') !== -1 || l.indexOf('x-api-key') !== -1) return 'Je API-sleutel is niet geldig. Wijzig de sleutel via het menu en probeer het opnieuw.';
  if (l.indexOf('not_found') !== -1) return 'Het AI-model is niet beschikbaar. Neem contact op met de beheerder van deze app.';
  if (l.indexOf('overloaded') !== -1) return 'De analyseservice is even druk. Probeer het over een paar seconden opnieuw.';
  if (l.indexOf('failed to fetch') !== -1 || l.indexOf('networkerror') !== -1 || l.indexOf('load failed') !== -1) return 'Geen verbinding met de analyseservice. Controleer je internet en probeer het opnieuw.';
  if (l.indexOf('api key') !== -1 || l.indexOf('api-key') !== -1) return 'Voer eerst je API-sleutel in.';
  if (l.indexOf('marktprijzen') !== -1) return 'De marktprijzen konden niet worden opgehaald. Probeer het opnieuw.';
  return 'De analyse is mislukt. Probeer het opnieuw. (' + m.slice(0, 120) + ')';
}

// Navigatie
function switchTab(name) {
  var wissel = function() {
    huidigeTab = name;
    document.querySelectorAll('.nav-item, .tab-item').forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === name); });
    document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('tab-' + name).classList.add('active');
    if (name === 'home') renderHome();
    if (name === 'overzicht') renderOverzicht();
    if (name === 'gewonnen') renderGewonnen();
    window.scrollTo(0, 0);
  };
  // Vloeiende overgang tussen schermen waar de browser dat ondersteunt
  var rustig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !rustig && name !== huidigeTab) {
    var t = document.startViewTransition(wissel);
    // Snel na elkaar wisselen breekt de vorige overgang af; dat is geen fout
    [t.ready, t.finished, t.updateCallbackDone].forEach(function(p) { if (p && p.catch) p.catch(function() {}); });
  } else wissel();
}
function nieuwKavel() {
  var wasResultaat = faseNu === 'resultaat';
  switchTab('analyse');
  if (wasResultaat) resetFormulier();
  if (faseNu !== 'bezig') setFase('invoer');
}

// Fases van de analysepagina: invoer → bezig → resultaat
function setFase(f) {
  faseNu = f;
  document.getElementById('analyse-form').style.display = f === 'invoer' ? 'block' : 'none';
  document.getElementById('analyse-bezig').style.display = f === 'bezig' ? 'block' : 'none';
  document.getElementById('analyse-result').style.display = f === 'resultaat' ? 'block' : 'none';
  var st = { invoer: ['active', 'todo', 'todo'], bezig: ['done', 'active', 'todo'], resultaat: ['done', 'done', 'active'] }[f];
  document.querySelectorAll('#stepper li').forEach(function(li, i) {
    li.setAttribute('data-state', st[i]);
    var sn = li.querySelector('.sn');
    sn.innerHTML = st[i] === 'done' ? ic('check') : String(i + 1);
  });
}

function resetFormulier() {
  document.getElementById('kavel-url').value = '';
  document.getElementById('huidig-bod').value = '';
  document.getElementById('extra-txt').value = '';
  document.getElementById('previews').innerHTML = '';
  document.getElementById('analyse-err').style.display = 'none';
  imgs = []; huidigeThumb = null;
  setBodType('ander', document.getElementById('bod-ander'));
  vulVeilingKeuze(); document.getElementById('veiling-kies').value = 'auto'; vkHandmatigFlag = false;
  syncVeilingVelden();
}


// Foto's
function maakThumb(dataUrl, cb) {
  var img = new Image();
  img.onload = function() {
    try {
      var c = document.createElement('canvas'); c.width = 96; c.height = 96;
      var s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
      cb(c.toDataURL('image/jpeg', 0.6));
    } catch (e) { cb(null); }
  };
  img.onerror = function() { cb(null); };
  img.src = dataUrl;
}
function leesFiles(files) {
  Array.from(files).forEach(function(f) {
    if (!f.type.startsWith('image/')) return;
    var r = new FileReader();
    r.onload = function(e) {
      var id = Date.now() + Math.random();
      var eerste = imgs.length === 0;
      imgs.push({ id: id, base64: e.target.result.split(',')[1], mediaType: f.type });
      if (eerste) maakThumb(e.target.result, function(t) { if (imgs.length) huidigeThumb = t; });
      var d = document.createElement('div');
      d.className = 'prev'; d.id = 'prev-' + id;
      var img = document.createElement('img'); img.src = e.target.result; img.alt = '';
      var btn = document.createElement('button'); btn.className = 'prev-del'; btn.type = 'button';
      btn.setAttribute('aria-label', 'Foto verwijderen'); btn.textContent = '×';
      btn.onclick = function() { delImg(id); };
      d.appendChild(img); d.appendChild(btn);
      document.getElementById('previews').appendChild(d);
    };
    r.readAsDataURL(f);
  });
}
function delImg(id) {
  imgs = imgs.filter(function(i) { return i.id !== id; });
  var el = document.getElementById('prev-' + id);
  if (el) el.remove();
  if (imgs.length === 0) huidigeThumb = null;
  else maakThumb('data:' + imgs[0].mediaType + ';base64,' + imgs[0].base64, function(t) { huidigeThumb = t; });
}

function setBodType(type, btn) {
  bodType = type;
  document.querySelectorAll('.bod-btn').forEach(function(b) { b.classList.remove('active'); });
  (btn || document.getElementById('bod-' + type)).classList.add('active');
  document.getElementById('bod-hint').textContent = type === 'eigen'
    ? 'Jouw bod. Dit wordt gebruikt als inkoopprijs voor de margeberekening.'
    : 'Huidig hoogste bod op de veiling. Laat leeg om het van de kavelpagina te lezen.';
}

// Voortgang tijdens analyse
var STAP_LABELS = ['Product herkennen', 'Marktprijzen ophalen', 'Kosten en advies berekenen'];
var STAP_STATUS = ['Product wordt geïdentificeerd…', 'Marktprijzen worden verzameld…', 'Veilingkosten worden berekend en advies wordt samengesteld…'];
function setStap(n) {
  document.getElementById('bezig-status').textContent = STAP_STATUS[n - 1] || '';
  [1, 2, 3].forEach(function(i) {
    var el = document.getElementById('stap' + i);
    var st = i < n ? 'done' : i === n ? 'active' : '';
    el.className = 'step' + (st ? ' ' + st : '');
    el.innerHTML = '<span class="si">' + (st === 'done' ? ic('check') : '') + '</span><span>' + STAP_LABELS[i - 1] + '</span>';
  });
}
function verbergStappen() { /* voortgang wordt via setFase() verborgen */ }

function fmtC(n) { return (n != null && isFinite(n)) ? '\u20ac' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'; }
function fmtSC(n) { return n > 0 ? '+' + fmtC(n) : n < 0 ? '\u2212' + fmtC(-n) : fmtC(0); }
function fmt(n) { return (n != null && isFinite(n)) ? '\u20ac' + Math.round(n).toLocaleString('nl-NL') : '-'; }
function setBtn(id, txtId, disabled, html) {
  document.getElementById(id).disabled = disabled;
  document.getElementById(txtId).innerHTML = html;
}

// ── 3. API, opslag & sync ───────────────────────────────────────────────────
function getApiKey() { return localStorage.getItem('hnvi_apikey') || ''; }
function slaApiKeyOp() {
  var k = document.getElementById('apikey-input').value.trim();
  if (k.indexOf('sk-ant-') !== 0) { toast('Dit lijkt geen geldige API-sleutel. Een sleutel begint met sk-ant-.', null, true); return; }
  localStorage.setItem('hnvi_apikey', k);
  document.getElementById('apikey-input').value = '';
  checkApiKey();
  toast('API-sleutel opgeslagen');
}
function resetApiKey() {
  if (!getApiKey()) { document.getElementById('apikey-input').focus(); window.scrollTo(0, 0); return; }
  bevestig('API-sleutel wijzigen?', 'De huidige sleutel wordt van dit apparaat verwijderd. Je kunt daarna een nieuwe invoeren.', 'Sleutel verwijderen', false, function() {
    localStorage.removeItem('hnvi_apikey'); checkApiKey(); window.scrollTo(0, 0);
  });
}
function checkApiKey() {
  var k = getApiKey();
  document.getElementById('apikey-bar').style.display = k || serverModus() ? 'none' : 'flex';
  document.querySelectorAll('.js-key-sub').forEach(function(e) {
    e.textContent = k ? 'Ingesteld' : 'Ontbreekt';
    e.className = 'sub js-key-sub ' + (k ? 'ok' : 'err');
  });
}

var SHEETS_URL = localStorage.getItem('hnvi_sheets_url') || '';
function setSyncStatus(st) {
  var tekst = !SHEETS_URL ? 'Niet gekoppeld'
    : st === 'bezig' ? 'Synchroniseren…'
    : st === 'fout' ? 'Synchronisatie mislukt'
    : 'Gekoppeld · ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  document.querySelectorAll('.js-sync-sub').forEach(function(e) {
    e.textContent = tekst;
    e.className = 'sub js-sync-sub ' + (!SHEETS_URL ? '' : st === 'fout' ? 'err' : st === 'bezig' ? '' : 'ok');
  });
}
function setSheetsUrl() {
  openModal('Synchronisatie met Google Sheets',
    'Plak de Web App-URL van je Google Apps Script (eindigt op /exec). Daarmee houd je je kavels gelijk op telefoon en laptop.' +
    '<input class="input" id="sync-url" type="text" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(SHEETS_URL) + '" />',
    [
      { label: 'Annuleren', cls: 'btn-secondary' }
    ].concat(SHEETS_URL ? [{ label: 'Ontkoppelen', cls: 'btn-secondary', fn: function() {
      SHEETS_URL = ''; localStorage.removeItem('hnvi_sheets_url'); setSyncStatus('ok'); toast('Synchronisatie ontkoppeld');
    } }] : []).concat([
      { label: 'Opslaan en synchroniseren', cls: 'btn-primary', fn: function() {
        var url = document.getElementById('sync-url').value.trim();
        if (url) {
          SHEETS_URL = url;
          localStorage.setItem('hnvi_sheets_url', SHEETS_URL);
          syncVanSheets();
        }
      } }
    ]));
}

function syncNaarSheets() {
  if (!SHEETS_URL) return Promise.resolve();
  setSyncStatus('bezig');
  return fetch(SHEETS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ actie: 'opslaan', kavels: kavels })
  }).then(function(r) { return r.json(); }).then(function(r) {
    setSyncStatus('ok'); return r;
  }).catch(function(e) {
    console.error('Sync naar Sheets mislukt:', e);
    setSyncStatus('fout');
  });
}

function syncVanSheets() {
  if (!SHEETS_URL) return Promise.resolve();
  setSyncStatus('bezig');
  return fetch(SHEETS_URL)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.kavels) {
        // Parse JSON velden terug (kosten en prijzen waren als string opgeslagen)
        kavels = data.kavels.map(function(k) {
          try { if (typeof k.kosten === 'string' && k.kosten) k.kosten = JSON.parse(k.kosten); } catch(e) {}
          try { if (typeof k.prijzen === 'string' && k.prijzen) k.prijzen = JSON.parse(k.prijzen); } catch(e) {}
          k.eigen_bod = k.eigen_bod === true || k.eigen_bod === 'true' || k.eigen_bod === 'TRUE';
          return k;
        });
        localStorage.setItem('hnvi_kavels', JSON.stringify(kavels));
        updateBadge();
        renderOverzicht();
        renderGewonnen();
      }
      setSyncStatus('ok');
    }).catch(function(e) {
      console.error('Sync van Sheets mislukt:', e);
      setSyncStatus('fout');
    });
}

function laadKavels() {
  try { kavels = JSON.parse(localStorage.getItem('hnvi_kavels') || '[]'); } catch(e) { kavels = []; }
}
function slaKavelsOp() {
  try { localStorage.setItem('hnvi_kavels', JSON.stringify(kavels)); } catch (e) { toast('Opslaan op dit apparaat lukt niet: de opslag is vol of geblokkeerd.', null, true); }
  if (serverModus()) syncNaarServer(); else syncNaarSheets();
}

// ── 4. Analyse ──────────────────────────────────────────────────────────────

// ── Instellingen voor de berekening ──
var MODELLEN = [
  { id: 'claude-haiku-5-5', label: 'Zuinig: Claude Haiku 5.5 (standaard)' },
  { id: 'claude-sonnet-5-5', label: 'Grondig: Claude Sonnet 5.5 (circa 20× duurder)' },
  { id: 'claude-opus-5-5', label: 'Zeer grondig: Claude Opus 5.5 (circa 40× duurder)' }
];
// Het lezen van de kavelpagina is overnemen van gegevens; daarvoor is het goedkoopste model genoeg.
var MODEL_PAGINA = 'claude-haiku-5-5';
var INST_STD = { doelmarge: 0.20, verkoopkosten: 0, model: 'claude-haiku-5-5' };
// API-prijzen in dollar per miljoen tokens (platform.claude.com/docs/en/about-claude/pricing, oktober 2026).
// Haiku 5.5 kost meer zodra één verzoek boven 100.000 tokens komt.
function usdTxt(x) { return '$' + (x || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: x < 0.1 ? 3 : 2 }); }
function telApiKosten(usd) {
  try {
    var t = JSON.parse(localStorage.getItem('va_api_totaal') || 'null') || { usd: 0, n: 0, sinds: Date.now() };
    t.usd += usd; t.n++;
    localStorage.setItem('va_api_totaal', JSON.stringify(t));
  } catch (e) {}
}
function apiTotaal() { try { return JSON.parse(localStorage.getItem('va_api_totaal') || 'null'); } catch (e) { return null; } }

// ── Prijzen hergebruiken: hetzelfde product in dezelfde staat binnen 3 dagen ──
var CACHE_DAGEN = 3;
function leesPrijsCache(sleutel) {
  try {
    var c = JSON.parse(localStorage.getItem('va_prijscache') || '{}');
    var e = c[sleutel];
    if (e && Date.now() - e.op < CACHE_DAGEN * 864e5) return kopie(e.p);
  } catch (e2) {}
  return null;
}
function bewaarPrijsCache(sleutel, p) {
  try {
    var c = JSON.parse(localStorage.getItem('va_prijscache') || '{}');
    c[sleutel] = { op: Date.now(), p: p };
    var keys = Object.keys(c).sort(function(a, b) { return c[b].op - c[a].op; });
    keys.slice(40).forEach(function(k) { delete c[k]; });
    localStorage.setItem('va_prijscache', JSON.stringify(c));
  } catch (e) {}
}
var instCache = null;
function getInst() {
  if (instCache) return instCache;
  var i = kopie(INST_STD);
  try {
    var raw = JSON.parse(localStorage.getItem('va_instellingen') || 'null');
    if (raw) {
      if (typeof raw.doelmarge === 'number' && raw.doelmarge >= 0 && raw.doelmarge <= 0.8) i.doelmarge = raw.doelmarge;
      if (typeof raw.verkoopkosten === 'number' && raw.verkoopkosten >= 0 && raw.verkoopkosten <= 10000) i.verkoopkosten = raw.verkoopkosten;
      if (MODELLEN.some(function(m) { return m.id === raw.model; })) i.model = raw.model;
    }
  } catch (e) {}
  instCache = i;
  return i;
}
function bewaarInst(i) {
  try { localStorage.setItem('va_instellingen', JSON.stringify(i)); } catch (e) { return false; }
  instCache = i;
  return true;
}
function doelPct() { return Math.round(getInst().doelmarge * 1000) / 10; }

// ── Kostenmodel ──
// Totale kosten = bod + opgeld + vaste kosten + btw.
// De btw-regeling bepaalt waarover btw wordt berekend:
//   volledig: over bod, opgeld en vaste kosten (normale btw-kavel)
//   opgeld:   alleen over opgeld en vaste kosten (margeregeling, opgeld exclusief btw)
//   geen:     geen btw (opgeld is al inclusief btw, of btw verlegd / 0%)
function regelingOpties() {
  var h = '';
  Object.keys(REGELINGEN).forEach(function(k) { h += '<option value="' + k + '">' + REGELINGEN[k] + '</option>'; });
  return h;
}
// Totaal is lineair in het bod: totaal = bod × A + B
// Hoogste bod waarbij de totale kosten niet boven 'totaal' uitkomen (nooit negatief)
function verkoopkostenVan(k) {
  return (typeof k.verkoopkosten === 'number' && isFinite(k.verkoopkosten) && k.verkoopkosten >= 0) ? k.verkoopkosten : getInst().verkoopkosten;
}
function verkoopprijsVan(k) {
  var mp = k.prijzen && k.prijzen.marktplaats ? k.prijzen.marktplaats : null;
  var g = k.controle ? k.controle.mp_gem : (mp ? mp.gemiddeld : k.mp_gemiddeld);
  return (typeof g === 'number' && isFinite(g) && g > 0) ? g : null;
}

// Rekent kosten, maximaal bod en advies door. Alle bedragen komen hier vandaan, niet van het AI-model.
function herberekenKosten(k) {
  var t = tariefVan(k);
  var doel = getInst().doelmarge;
  var vkst = verkoopkostenVan(k);
  var gem = verkoopprijsVan(k);
  k.maxBod = gem ? Math.floor(bodVoorTotaal(gem * (1 - doel) - vkst, t)) : null;
  k.breakEvenBod = gem ? Math.floor(bodVoorTotaal(gem - vkst, t)) : null;

  var bod = k.huidig_bod > 0 ? k.huidig_bod : (k.kosten && k.kosten.bod > 0 ? k.kosten.bod : null);
  if (!bod) {
    k.kosten = null; k.advies = 'twijfel'; k.roi = 50;
    k.adviesReden = k.maxBod == null ? 'Vul het bod in voor de margeberekening.'
      : k.maxBod > 0 ? 'Bied maximaal ' + fmt(k.maxBod) + ' voor ' + pctTxt(doel * 100) + '% marge (break-even bij ' + fmt(k.breakEvenBod) + ').'
      : 'Zelfs bij een heel laag bod blijft er na kosten te weinig marge over.';
    return;
  }
  var kk = berekenKosten(bod, t);
  kk.site = veilingVan(k);
  kk.opgeld_pct = Math.round(t.opgeld * 1000) / 10;
  kk.btw_pct = Math.round(t.btw * 1000) / 10;
  kk.regeling = t.regeling;
  kk.verkoopkosten = vkst;
  kk.marge = gem ? gem - kk.totaal - vkst : null;
  k.kosten = kk;
  if (kk.marge == null) {
    k.advies = 'twijfel'; k.roi = 50;
    k.adviesReden = 'Totale kosten ' + fmt(kk.totaal) + '. Er is geen marktwaarde bekend, dus de marge is niet te berekenen.';
    return;
  }
  var m = kk.marge, pctExact = m / gem * 100, pct = Math.round(pctExact), advies = 'twijfel', roi;
  if (m > 0 && pctExact >= doel * 100 - 1e-9) { advies = 'kopen'; roi = Math.min(93, 55 + pct); }
  else if (m < -50 || pctExact < -10) { advies = 'skip'; roi = Math.max(8, 50 + pct / 2); }
  else { roi = Math.max(25, Math.min(68, 50 + pct / 2)); }
  k.advies = advies; k.roi = Math.round(roi);
  k.adviesReden = (m > 0
    ? 'Kosten ' + fmt(kk.totaal) + (vkst ? ' + ' + fmt(vkst) + ' verkoopkosten' : '') + ' tegenover verwachte verkoop ~' + fmt(gem) + ': marge ' + fmt(m) + ' (' + pct + '%).'
    : 'Kosten ' + fmt(kk.totaal) + (vkst ? ' + ' + fmt(vkst) + ' verkoopkosten' : '') + ' liggen ' + fmt(Math.abs(m)) + ' boven de verwachte verkoop van ' + fmt(gem) + ' (' + pct + '%).') +
    (k.maxBod != null ? ' Max. bod ' + fmt(k.maxBod) + '.' : '');
}

// ── Veilinghuizen en percentages ──
// Let op: veilingkosten verschillen per veilinghuis én per veiling. Alleen HNVI is door de gebruiker bevestigd;
// de rest zijn startwaarden. Bij een analyse leest de app de kosten bij voorkeur van de kavelpagina zelf.
var VEILING_STD = [
  { naam: 'HNVI', match: 'hnvi.nl', opgeld: 0.19, btw: 0.21, vast: 0, regeling: 'volledig' },
  { naam: 'Troostwijk', match: 'troostwijk', opgeld: 0.18, btw: 0.21, vast: 0, regeling: 'volledig' },
  { naam: 'BVA Auctions', match: 'bva-auctions, bva.nl', opgeld: 0.17, btw: 0.21, vast: 0, regeling: 'volledig' },
  { naam: 'Vavato', match: 'vavato', opgeld: 0.18, btw: 0.21, vast: 0, regeling: 'volledig' },
  { naam: 'DTZ', match: 'dtz', opgeld: 0.15, btw: 0.21, vast: 0, regeling: 'volledig' }
];
// Mediaan van 29 gemeten veilinghuizen (geveild.com, oktober 2026): 18%. Bandbreedte 4% tot 25%.
var VEILING_ONBEKEND_STD = { opgeld: 0.18, btw: 0.21, vast: 0, regeling: 'volledig' };
// Alleen voor herkenning van de naam; de kosten komen van de kavelpagina of de standaardwaarde.
var VEILING_HERKENNING = [
  { naam: 'Onlineveilingmeester', match: 'onlineveilingmeester' },
  { naam: 'Catawiki', match: 'catawiki' },
  { naam: 'Klaz', match: 'klaz.' },
  { naam: 'Surplex', match: 'surplex' },
  { naam: 'Venduehuis', match: 'venduehuis' },
  { naam: 'XL Auctions', match: 'xlauctions' },
  { naam: 'Nedveiling', match: 'nedveiling' },
  { naam: 'Openbare Verkopen', match: 'openbareverkopen' },
  { naam: 'Dome Auctions', match: 'domeauctions' },
  { naam: 'Auctelia', match: 'auctelia' },
  { naam: 'Industrial Auctions', match: 'industrial-auctions' },
  { naam: 'Euro Auctions', match: 'euroauctions' },
  { naam: 'Lot-tissimo', match: 'lot-tissimo' },
  { naam: 'Dorotheum', match: 'dorotheum' },
  { naam: 'eBay', match: 'ebay.' }
];
var veilingCfg = null;
var vkHandmatigFlag = false;

function pctTxt(x) { return String(Math.round(x * 10) / 10).replace('.', ','); }
function bedragTxt(x) { return x ? String(Math.round(x * 100) / 100).replace('.', ',') : '0'; }
function leesPct(txt) {
  var s = String(txt == null ? '' : txt).replace(/[%\s]/g, '');
  if (!s) return null;
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(s)) return NaN;
  return parseFloat(s.replace(',', '.'));
}
function leesEuro(txt) {
  var s = String(txt == null ? '' : txt).trim();
  if (!s) return 0;
  return /^[\d.,\s€]+$/.test(s) ? parseBedrag(s) : NaN;
}
function geldigTarief(o, b) { return typeof o === 'number' && typeof b === 'number' && isFinite(o) && isFinite(b) && o >= 0 && o <= 0.5 && b >= 0 && b <= 0.3; }
function geldigVast(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 5000; }

function getVeilingCfg() {
  if (veilingCfg) return veilingCfg;
  var cfg = { huizen: kopie(VEILING_STD), standaard: kopie(VEILING_ONBEKEND_STD) };
  try {
    var raw = JSON.parse(localStorage.getItem('va_veilingen') || 'null');
    if (raw && Array.isArray(raw.huizen)) {
      var lijst = [];
      raw.huizen.forEach(function(h) {
        if (h && typeof h.naam === 'string' && h.naam.trim() && geldigTarief(h.opgeld, h.btw)) {
          lijst.push({ naam: h.naam.trim(), match: typeof h.match === 'string' ? h.match : h.naam.toLowerCase(), opgeld: h.opgeld, btw: h.btw,
            vast: geldigVast(h.vast) ? h.vast : 0, regeling: REGELINGEN[h.regeling] ? h.regeling : 'volledig' });
        }
      });
      cfg.huizen = lijst;
      if (raw.standaard && geldigTarief(raw.standaard.opgeld, raw.standaard.btw)) {
        cfg.standaard = { opgeld: raw.standaard.opgeld, btw: raw.standaard.btw,
          vast: geldigVast(raw.standaard.vast) ? raw.standaard.vast : 0, regeling: REGELINGEN[raw.standaard.regeling] ? raw.standaard.regeling : 'volledig' };
      }
    }
  } catch (e) {}
  veilingCfg = cfg;
  return cfg;
}
function bewaarVeilingCfg(cfg) {
  try { localStorage.setItem('va_veilingen', JSON.stringify(cfg)); } catch (e) { return false; }
  veilingCfg = cfg;
  return true;
}
function huisOpNaam(naam) {
  var l = getVeilingCfg().huizen;
  for (var i = 0; i < l.length; i++) { if (l[i].naam === naam) return l[i]; }
  return null;
}
function tariefKopie(h, naam, bron) {
  return { naam: naam || h.naam, opgeld: h.opgeld, btw: h.btw, vast: h.vast || 0, regeling: h.regeling || 'volledig', bron: bron };
}
function detecteerVeiling(url) {
  var cfg = getVeilingCfg();
  var host = hostVan(url);
  if (host) {
    for (var i = 0; i < cfg.huizen.length; i++) {
      var keys = String(cfg.huizen[i].match || '').toLowerCase().split(',');
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j].trim();
        if (key && host.indexOf(key) !== -1) return tariefKopie(cfg.huizen[i], null, 'huis');
      }
    }
    for (var n = 0; n < VEILING_HERKENNING.length; n++) {
      if (host.indexOf(VEILING_HERKENNING[n].match) !== -1) return tariefKopie(cfg.standaard, VEILING_HERKENNING[n].naam, 'standaard');
    }
  }
  return tariefKopie(cfg.standaard, 'Onbekend', 'standaard');
}
function bronLabel(h) {
  for (var i = 0; i < VEILING_STD.length; i++) {
    var s = VEILING_STD[i];
    if (s.naam === h.naam) {
      var gelijk = Math.abs(s.opgeld - h.opgeld) < 1e-9 && Math.abs(s.btw - h.btw) < 1e-9 && (h.vast || 0) === s.vast && (h.regeling || 'volledig') === s.regeling;
      if (gelijk) return s.naam === 'HNVI' ? 'bevestigd' : 'niet geverifieerd';
      return 'door jou ingesteld';
    }
  }
  return 'door jou ingesteld';
}

// Tarief van een opgeslagen kavel: eigen tarief, anders afgeleid van de opgeslagen kosten, anders de huidige instelling
function tariefVan(k) {
  if (k.veiling_tarief && geldigTarief(k.veiling_tarief.opgeld, k.veiling_tarief.btw)) return normTarief(k.veiling_tarief);
  if (k.kosten && k.kosten.opgeld_pct != null && isFinite(k.kosten.opgeld_pct)) {
    var btw = 0.21;
    if (k.kosten.bod != null && (k.kosten.bod + k.kosten.vk) > 0) {
      var b = k.kosten.btw / (k.kosten.bod + k.kosten.vk);
      if (isFinite(b) && b >= 0 && b <= 0.3) btw = Math.round(b * 1000) / 1000;
    }
    return normTarief({ opgeld: k.kosten.opgeld_pct / 100, btw: btw });
  }
  var d = detecteerVeiling(k.url);
  if (d.naam === 'Onbekend' && k.veiling && huisOpNaam(k.veiling)) d = tariefKopie(huisOpNaam(k.veiling), null, 'huis');
  return normTarief(d);
}

// ── Formulier: keuze veilinghuis ──
function vulVeilingKeuze() {
  var sel = document.getElementById('veiling-kies');
  var cur = sel.value || 'auto';
  var h = '<option value="auto">Automatisch herkennen (uit de link)</option>';
  getVeilingCfg().huizen.forEach(function(v) {
    h += '<option value="' + esc(v.naam) + '">' + esc(v.naam) + ' (' + pctTxt(v.opgeld * 100) + '%)</option>';
  });
  h += '<option value="anders">Anders / onbekend</option>';
  sel.innerHTML = h;
  var ok = cur === 'auto' || cur === 'anders' || !!huisOpNaam(cur);
  sel.value = ok ? cur : 'auto';
  var reg = document.getElementById('vk-regeling');
  if (!reg.options.length) reg.innerHTML = regelingOpties();
}
function basisVeiling(url) {
  var keuze = document.getElementById('veiling-kies').value;
  if (keuze === 'auto') return detecteerVeiling(url);
  if (keuze === 'anders') return tariefKopie(getVeilingCfg().standaard, 'Onbekend', 'standaard');
  var h = huisOpNaam(keuze);
  return h ? tariefKopie(h, null, 'huis') : detecteerVeiling(url);
}
function kiesVeiling() { vkHandmatigFlag = false; syncVeilingVelden(); }
function vkHandmatig() { vkHandmatigFlag = true; updateVeilingHint(); }
function syncVeilingVelden() {
  var v = basisVeiling(document.getElementById('kavel-url').value.trim());
  if (!vkHandmatigFlag) {
    document.getElementById('vk-opgeld').value = pctTxt(v.opgeld * 100);
    document.getElementById('vk-btw').value = pctTxt(v.btw * 100);
    document.getElementById('vk-vast').value = v.vast ? bedragTxt(v.vast) : '';
    document.getElementById('vk-regeling').value = v.regeling || 'volledig';
  }
  updateVeilingHint();
  return v;
}
function formTarief(url) {
  var o = leesPct(document.getElementById('vk-opgeld').value);
  var b = leesPct(document.getElementById('vk-btw').value);
  var vast = leesEuro(document.getElementById('vk-vast').value);
  var base = basisVeiling(url);
  if (o === null || !isFinite(o) || o > 50) return { fout: 'Vul bij veilingkosten een percentage tussen 0 en 50 in, bijvoorbeeld 19.' };
  if (b === null || !isFinite(b) || b > 30) return { fout: 'Vul bij btw een percentage tussen 0 en 30 in, bijvoorbeeld 21.' };
  if (!geldigVast(vast)) return { fout: 'Vul bij vaste kosten een bedrag in euro in, of laat het veld leeg.' };
  return { naam: base.naam, opgeld: o / 100, btw: b / 100, vast: vast, regeling: document.getElementById('vk-regeling').value || 'volledig',
    handmatig: vkHandmatigFlag, bron: vkHandmatigFlag ? 'handmatig' : base.bron };
}
function updateVeilingHint() {
  var url = document.getElementById('kavel-url').value.trim();
  var keuze = document.getElementById('veiling-kies').value;
  var box = document.getElementById('veiling-hint');
  var v = basisVeiling(url);
  var o = leesPct(document.getElementById('vk-opgeld').value);
  var b = leesPct(document.getElementById('vk-btw').value);
  if (keuze === 'auto' && !url) { box.className = 'veiling-hint'; box.innerHTML = ''; return; }
  var tekst, waarschuw = false;
  var huis = huisOpNaam(v.naam);
  if (keuze === 'auto' && v.naam === 'Onbekend') {
    tekst = 'Veilinghuis niet herkend. De kosten worden van de kavelpagina gelezen; lukt dat niet, dan rekent de app met de standaardwaarde hieronder.'; waarschuw = true;
  } else {
    tekst = (keuze === 'auto' ? 'Herkend: ' : 'Gekozen: ') + '<strong>' + esc(v.naam) + '</strong>';
    if (o != null && b != null && isFinite(o) && isFinite(b)) tekst += ' &middot; reserve: ' + pctTxt(o) + '% opgeld + ' + pctTxt(b) + '% btw';
    if (vkHandmatigFlag) tekst += ' (door jou aangepast, gaat voor de kavelpagina)';
    else if (huis && bronLabel(huis) === 'niet geverifieerd') { tekst += ' &middot; startwaarde niet geverifieerd'; waarschuw = true; }
    else if (!huis) { tekst += ' &middot; standaardwaarde'; waarschuw = true; }
  }
  box.className = 'veiling-hint on' + (waarschuw ? ' unknown' : '');
  box.innerHTML = ic(waarschuw ? 'alert' : 'check') + '<span>' + tekst + '</span>';
}
function zetTariefFormulier(k) {
  vulVeilingKeuze();
  var det = detecteerVeiling(k.url);
  var naam = veilingVan(k);
  var sel = document.getElementById('veiling-kies');
  if (det.naam !== 'Onbekend' && naam === det.naam) sel.value = 'auto';
  else if (huisOpNaam(naam)) sel.value = naam;
  else sel.value = 'auto';
  vkHandmatigFlag = false;
  syncVeilingVelden();
  if (k.tarief_handmatig) {
    var t = tariefVan(k);
    document.getElementById('vk-opgeld').value = pctTxt(t.opgeld * 100);
    document.getElementById('vk-btw').value = pctTxt(t.btw * 100);
    document.getElementById('vk-vast').value = t.vast ? bedragTxt(t.vast) : '';
    document.getElementById('vk-regeling').value = t.regeling;
    vkHandmatigFlag = true;
    updateVeilingHint();
  }
}

// ── Kosten van één kavel aanpassen ──
function kostenVeldenHtml(prefix, t, vkst) {
  return '<div class="vk-grid">' +
    '<div><label class="ctl-l" for="' + prefix + '-opgeld">Veilingkosten (opgeld)</label><div class="money pct"><input class="input" id="' + prefix + '-opgeld" type="text" inputmode="decimal" value="' + pctTxt(t.opgeld * 100) + '"><span>%</span></div></div>' +
    '<div><label class="ctl-l" for="' + prefix + '-btw">Btw</label><div class="money pct"><input class="input" id="' + prefix + '-btw" type="text" inputmode="decimal" value="' + pctTxt(t.btw * 100) + '"><span>%</span></div></div>' +
    '<div><label class="ctl-l" for="' + prefix + '-vast">Vaste kosten per kavel</label><div class="money"><span>&euro;</span><input class="input" id="' + prefix + '-vast" type="text" inputmode="decimal" value="' + (t.vast ? bedragTxt(t.vast) : '') + '"></div></div>' +
    '<div><label class="ctl-l" for="' + prefix + '-reg">Btw-regeling</label><select class="input select" id="' + prefix + '-reg">' + regelingOpties() + '</select></div>' +
    (vkst !== undefined ? '<div><label class="ctl-l" for="' + prefix + '-vkst">Verkoopkosten</label><div class="money"><span>&euro;</span><input class="input" id="' + prefix + '-vkst" type="text" inputmode="decimal" value="' + (vkst ? bedragTxt(vkst) : '') + '"></div></div>' : '') +
    '</div>';
}
function leesKostenVelden(prefix, metVkst) {
  var o = leesPct(document.getElementById(prefix + '-opgeld').value), b = leesPct(document.getElementById(prefix + '-btw').value);
  var vast = leesEuro(document.getElementById(prefix + '-vast').value);
  var r = { opgeld: o / 100, btw: b / 100, vast: vast, regeling: document.getElementById(prefix + '-reg').value };
  if (o === null || !isFinite(o) || o > 50) r.fout = 'Vul bij veilingkosten een percentage tussen 0 en 50 in.';
  else if (b === null || !isFinite(b) || b > 30) r.fout = 'Vul bij btw een percentage tussen 0 en 30 in.';
  else if (!geldigVast(vast)) r.fout = 'Vul bij vaste kosten een geldig bedrag in, of laat het leeg.';
  if (metVkst) {
    r.vkst = leesEuro(document.getElementById(prefix + '-vkst').value);
    if (!r.fout && !geldigVast(r.vkst)) r.fout = 'Vul bij verkoopkosten een geldig bedrag in, of laat het leeg.';
  }
  return r;
}
function pasTariefAan(idx) {
  var k = kavels[idx]; if (!k) return;
  var t = tariefVan(k);
  var opts = '<option value="">Kies een veilinghuis om over te nemen…</option>';
  getVeilingCfg().huizen.forEach(function(v) { opts += '<option value="' + esc(v.naam) + '">' + esc(v.naam) + ' (' + pctTxt(v.opgeld * 100) + '% + ' + pctTxt(v.btw * 100) + '% btw)</option>'; });
  var h = '<p class="help" style="margin:0 0 12px">Geldt alleen voor dit kavel. Kosten, maximaal bod en advies worden direct opnieuw berekend. Verkoopkosten zijn je eigen kosten bij doorverkoop, zoals verzending of platformkosten.</p>' +
    (k.tarief_citaat ? '<div class="note" style="margin:0 0 12px">' + ic('info') + '<span>Op de kavelpagina gevonden: ' + esc(k.tarief_citaat) + '</span></div>' : '') +
    '<div class="field"><select class="input select" id="pt-huis" onchange="ptNeemOver()">' + opts + '</select></div>' +
    kostenVeldenHtml('pt', t, verkoopkostenVan(k)) +
    '<div class="msg err" id="pt-err" role="alert"></div>';
  openModal('Kosten aanpassen', h, [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: 'Opslaan en herberekenen', cls: 'btn-primary', keepOpen: true, fn: function() { ptOpslaan(idx); } }
  ]);
  document.getElementById('pt-reg').value = t.regeling;
}
function ptNeemOver() {
  var h = huisOpNaam(document.getElementById('pt-huis').value);
  if (!h) return;
  document.getElementById('pt-opgeld').value = pctTxt(h.opgeld * 100);
  document.getElementById('pt-btw').value = pctTxt(h.btw * 100);
  document.getElementById('pt-vast').value = h.vast ? bedragTxt(h.vast) : '';
  document.getElementById('pt-reg').value = h.regeling || 'volledig';
}
function ptOpslaan(idx) {
  var k = kavels[idx]; if (!k) { closeModal(); return; }
  var r = leesKostenVelden('pt', true);
  var box = document.getElementById('pt-err');
  if (r.fout) { box.textContent = r.fout; box.style.display = 'block'; return; }
  k.veiling_tarief = { opgeld: r.opgeld, btw: r.btw, vast: r.vast, regeling: r.regeling };
  k.tarief_handmatig = true;
  k.tarief_bron = 'handmatig';
  k.verkoopkosten = r.vkst;
  var gekozen = document.getElementById('pt-huis').value;
  if (gekozen && huisOpNaam(gekozen)) { k.veiling = gekozen; if (k.kosten) k.kosten.site = gekozen; }
  herberekenKosten(k);
  closeModal();
  slaKavelsOp(); renderOverzicht();
  toonAnalyseResultaat(k, true);
  toast('Kosten bijgewerkt en herberekend');
}

// ── Veilinghuizen en berekening beheren ──
var bhDraft = null;
function beheerVeilingen() {
  var cfg = getVeilingCfg();
  bhDraft = { huizen: kopie(cfg.huizen), standaard: kopie(cfg.standaard), inst: kopie(getInst()) };
  openModal('Veilinghuizen en berekening', bhHtml(), [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: 'Opslaan', cls: 'btn-primary', keepOpen: true, fn: bhOpslaan }
  ]);
  bhZetSelects();
}
function bhHtml() {
  var inst = bhDraft.inst;
  var h = '<div class="bh-row"><div class="ctl-l">Berekening</div><div class="vk-grid">' +
    '<div><label class="ctl-l" for="bh-doel">Gewenste marge</label><div class="money pct"><input class="input" id="bh-doel" type="text" inputmode="decimal" value="' + pctTxt(inst.doelmarge * 100) + '"><span>%</span></div></div>' +
    '<div><label class="ctl-l" for="bh-vkst">Verkoopkosten per kavel</label><div class="money"><span>&euro;</span><input class="input" id="bh-vkst" type="text" inputmode="decimal" value="' + (inst.verkoopkosten ? bedragTxt(inst.verkoopkosten) : '') + '"></div></div></div>' +
    (serverModus() ? '' : '<label class="ctl-l" for="bh-model" style="margin-top:10px">AI-model</label><select class="input select" id="bh-model">' +
    MODELLEN.map(function(m) { return '<option value="' + m.id + '">' + m.label + '</option>'; }).join('') + '</select>') +
    (!serverModus() && apiTotaal() ? '<div class="help">Gebruikt sinds ' + new Date(apiTotaal().sinds).toLocaleDateString('nl-NL') + ': ' + apiTotaal().n + ' analyses, samen ongeveer ' + usdTxt(apiTotaal().usd) + ' (berekend uit wat de API terugmeldt).</div>' : '') +
    '<div class="help">De gewenste marge is het deel van de verkoopprijs dat overblijft na alle kosten. Een kavel is een Aanrader vanaf deze marge, en het maximale bod is daarop berekend. Verkoopkosten zijn je eigen kosten bij doorverkoop (verzending, platformkosten).</div></div>';
  h += '<p class="help" style="margin:4px 0 12px">Veilingkosten verschillen per veiling. De app leest ze bij een analyse van de kavelpagina; onderstaande waarden zijn de reserve als de pagina ze niet vermeldt. Alleen HNVI (19% + 21% btw) is door jou bevestigd. Herkenning: delen van het webadres (gescheiden met komma\'s) waaraan de app het veilinghuis herkent.</p>';
  bhDraft.huizen.forEach(function(v, i) {
    h += '<div class="bh-row"><div class="bh-top"><input class="input" id="bh-n-' + i + '" type="text" value="' + esc(v.naam) + '" aria-label="Naam veilinghuis">' +
      '<button class="btn btn-ghost btn-icon btn-sm" type="button" onclick="bhVerwijder(' + i + ')" aria-label="Verwijder ' + esc(v.naam) + '">' + ic('trash') + '</button></div>' +
      '<label class="ctl-l" for="bh-m-' + i + '">Herkenning in de link</label><input class="input" id="bh-m-' + i + '" type="text" value="' + esc(v.match) + '" placeholder="bijv. hnvi.nl">' +
      kostenVeldenHtml('bh-' + i, { opgeld: v.opgeld, btw: v.btw, vast: v.vast, regeling: v.regeling }) +
      '<div class="help">' + esc(bronLabel(v)) + '</div></div>';
  });
  h += '<button class="btn btn-secondary btn-sm" type="button" onclick="bhVoegToe()">' + ic('plus') + 'Veilinghuis toevoegen</button>';
  h += '<div class="bh-row" style="margin-top:14px"><div class="ctl-l">Onbekend veilinghuis (standaard)</div>' +
    kostenVeldenHtml('bh-s', bhDraft.standaard) +
    '<div class="help">18% is de mediaan van 29 gemeten veilinghuizen (bandbreedte 4% tot 25%).</div></div>';
  h += '<div class="bh-reset"><button class="btn btn-ghost btn-sm" type="button" onclick="bhHerstel()">' + ic('undo') + 'Standaardwaarden herstellen</button></div>';
  h += '<div class="msg err" id="bh-err" role="alert"></div>';
  return h;
}
function bhZetSelects() {
  if (document.getElementById('bh-model')) document.getElementById('bh-model').value = bhDraft.inst.model;
  bhDraft.huizen.forEach(function(v, i) { document.getElementById('bh-' + i + '-reg').value = v.regeling || 'volledig'; });
  document.getElementById('bh-s-reg').value = bhDraft.standaard.regeling || 'volledig';
}
function bhLeesRij(prefix) {
  return { _o: document.getElementById(prefix + '-opgeld').value, _b: document.getElementById(prefix + '-btw').value,
    _v: document.getElementById(prefix + '-vast').value, regeling: document.getElementById(prefix + '-reg').value };
}
function bhLees() {
  bhDraft.huizen.forEach(function(v, i) {
    var n = document.getElementById('bh-n-' + i); if (!n) return;
    v.naam = n.value; v.match = document.getElementById('bh-m-' + i).value;
    var r = bhLeesRij('bh-' + i); v._o = r._o; v._b = r._b; v._v = r._v; v.regeling = r.regeling;
  });
  var s = bhLeesRij('bh-s');
  bhDraft._s = s; bhDraft.standaard.regeling = s.regeling;
  bhDraft._doel = document.getElementById('bh-doel').value;
  bhDraft._vkst = document.getElementById('bh-vkst').value;
  if (document.getElementById('bh-model')) bhDraft.inst.model = document.getElementById('bh-model').value;
}
function bhRender() {
  document.getElementById('modal-body').innerHTML = bhHtml();
  // behoud ingevoerde (nog niet gevalideerde) tekst
  bhDraft.huizen.forEach(function(v, i) {
    if (v._o != null) document.getElementById('bh-' + i + '-opgeld').value = v._o;
    if (v._b != null) document.getElementById('bh-' + i + '-btw').value = v._b;
    if (v._v != null) document.getElementById('bh-' + i + '-vast').value = v._v;
  });
  if (bhDraft._s) {
    document.getElementById('bh-s-opgeld').value = bhDraft._s._o;
    document.getElementById('bh-s-btw').value = bhDraft._s._b;
    document.getElementById('bh-s-vast').value = bhDraft._s._v;
  }
  if (bhDraft._doel != null) document.getElementById('bh-doel').value = bhDraft._doel;
  if (bhDraft._vkst != null) document.getElementById('bh-vkst').value = bhDraft._vkst;
  bhZetSelects();
}
function bhVoegToe() { bhLees(); bhDraft.huizen.push({ naam: '', match: '', opgeld: 0.18, btw: 0.21, vast: 0, regeling: 'volledig', _o: '18', _b: '21', _v: '' }); bhRender(); var n = document.getElementById('bh-n-' + (bhDraft.huizen.length - 1)); if (n) n.focus(); }
function bhVerwijder(i) { bhLees(); bhDraft.huizen.splice(i, 1); bhRender(); }
function bhHerstel() {
  bhLees();
  bhDraft = { huizen: kopie(VEILING_STD), standaard: kopie(VEILING_ONBEKEND_STD), inst: bhDraft.inst, _doel: bhDraft._doel, _vkst: bhDraft._vkst };
  bhRender();
}
function bhOpslaan() {
  bhLees();
  var box = document.getElementById('bh-err');
  var fout = '', huizen = [], namen = {};
  var doel = leesPct(bhDraft._doel), vkst = leesEuro(bhDraft._vkst);
  if (doel === null || !isFinite(doel) || doel > 80) fout = 'Vul bij gewenste marge een percentage tussen 0 en 80 in, bijvoorbeeld 20.';
  else if (!geldigVast(vkst)) fout = 'Vul bij verkoopkosten een geldig bedrag in, of laat het leeg.';
  function tarief(r, wie) {
    var o = leesPct(r._o), b = leesPct(r._b), v = leesEuro(r._v);
    if (o === null || !isFinite(o) || o > 50) return 'Controleer het percentage veilingkosten van ' + wie + ' (0 tot 50).';
    if (b === null || !isFinite(b) || b > 30) return 'Controleer het btw-percentage van ' + wie + ' (0 tot 30).';
    if (!geldigVast(v)) return 'Controleer de vaste kosten van ' + wie + '.';
    return { opgeld: o / 100, btw: b / 100, vast: v, regeling: REGELINGEN[r.regeling] ? r.regeling : 'volledig' };
  }
  for (var i = 0; i < bhDraft.huizen.length && !fout; i++) {
    var v = bhDraft.huizen[i];
    var naam = String(v.naam || '').trim();
    var sleutel = naam.toLowerCase();
    if (!naam) { fout = 'Geef elk veilinghuis een naam.'; break; }
    if (sleutel === 'auto' || sleutel === 'anders' || sleutel === 'onbekend') { fout = '"' + naam + '" is geen toegestane naam. Kies een andere naam.'; break; }
    if (namen[sleutel]) { fout = 'De naam "' + naam + '" komt twee keer voor.'; break; }
    var t = tarief({ _o: v._o != null ? v._o : pctTxt(v.opgeld * 100), _b: v._b != null ? v._b : pctTxt(v.btw * 100), _v: v._v != null ? v._v : bedragTxt(v.vast), regeling: v.regeling }, naam);
    if (typeof t === 'string') { fout = t; break; }
    namen[sleutel] = 1;
    huizen.push({ naam: naam, match: String(v.match || '').trim() || sleutel.replace(/\s+/g, ''), opgeld: t.opgeld, btw: t.btw, vast: t.vast, regeling: t.regeling });
  }
  var std = fout ? null : tarief(bhDraft._s, 'het onbekende veilinghuis');
  if (typeof std === 'string') fout = std;
  if (fout) { box.textContent = fout; box.style.display = 'block'; return; }
  var oudeInst = JSON.stringify(getInst());
  if (!bewaarVeilingCfg({ huizen: huizen, standaard: std }) || !bewaarInst({ doelmarge: doel / 100, verkoopkosten: vkst, model: bhDraft.inst.model })) {
    box.textContent = 'Opslaan lukt niet in deze browser (opslag geblokkeerd).'; box.style.display = 'block'; return;
  }
  closeModal();
  vulVeilingKeuze(); syncVeilingVelden();
  if (JSON.stringify(getInst()) !== oudeInst) {
    // Marge en verkoopkosten gelden voor alle kavels: alles direct opnieuw doorrekenen
    kavels.forEach(function(k) { if (k.status !== 'gewonnen') herberekenKosten(k); });
    slaKavelsOp(); updateBadge(); renderOverzicht();
  }
  toast('Instellingen opgeslagen');
  controleerTarieven(true);
}

// Lopende kavels die nog met een ander tarief dan de huidige instelling van hun veilinghuis zijn doorgerekend
function verouderdeKavels() {
  return kavels.filter(function(k) {
    if (k.status === 'gewonnen' || k.tarief_handmatig || k.tarief_bron === 'pagina') return false;
    var h = huisOpNaam(veilingVan(k)); if (!h) return false;
    var t = tariefVan(k), hn = normTarief(h);
    return Math.abs(t.opgeld - hn.opgeld) > 1e-9 || Math.abs(t.btw - hn.btw) > 1e-9 || t.vast !== hn.vast || t.regeling !== hn.regeling;
  });
}
function controleerTarieven(altijd) {
  var lijst = verouderdeKavels();
  if (!lijst.length) return;
  var sig = JSON.stringify(getVeilingCfg()) + '|' + lijst.length;
  var gezien = null;
  try { gezien = localStorage.getItem('va_tarief_gevraagd'); } catch (e) {}
  if (!altijd && gezien === sig) return;
  var per = {};
  lijst.forEach(function(k) {
    var n = veilingVan(k), t = tariefVan(k), h = huisOpNaam(n);
    if (!per[n]) per[n] = { n: 0, oud: t.opgeld, nieuw: h.opgeld };
    per[n].n++;
  });
  var tekst = '<p>Deze lopende kavels rekenen nog met andere kosten dan nu is ingesteld:</p><ul class="bh-list">';
  Object.keys(per).forEach(function(n) {
    tekst += '<li><strong>' + esc(n) + '</strong>: ' + per[n].n + (per[n].n === 1 ? ' kavel' : ' kavels') + ', nu ' + pctTxt(per[n].oud * 100) + '%, wordt ' + pctTxt(per[n].nieuw * 100) + '%</li>';
  });
  tekst += '</ul><p class="help">Kosten, maximaal bod en advies worden opnieuw berekend. Gewonnen kavels, kavels waarvan je zelf de kosten hebt aangepast en kavels met kosten van de kavelpagina blijven ongewijzigd.</p>';
  try { localStorage.setItem('va_tarief_gevraagd', sig); } catch (e) {}
  openModal('Bestaande kavels herberekenen?', tekst, [
    { label: 'Nu niet', cls: 'btn-secondary' },
    { label: 'Herberekenen', cls: 'btn-primary', fn: function() {
      var l = verouderdeKavels();
      l.forEach(function(k) { var h = huisOpNaam(veilingVan(k)); k.veiling_tarief = { opgeld: h.opgeld, btw: h.btw, vast: h.vast || 0, regeling: h.regeling || 'volledig' }; k.tarief_bron = 'huis'; herberekenKosten(k); });
      slaKavelsOp(); updateBadge(); renderOverzicht();
      toast(l.length + (l.length === 1 ? ' kavel herberekend' : ' kavels herberekend'));
    } }
  ]);
}

// ── Claude API ──
// Fout doordat web_search / web_fetch niet beschikbaar is (bijvoorbeeld uitgezet voor je organisatie)
// Stuurt één beurt naar Claude, inclusief vervolgverzoeken bij pause_turn.
// ── Analyse uitvoeren: via de server (abonnement) of rechtstreeks met een eigen API-sleutel ──
function serverModus() { return !!(window.VA_CONFIG && window.VA_CONFIG.api); }
async function anthropicDirect(body) {
  var resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': getApiKey(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body)
  });
  var data = null;
  try { data = await resp.json(); } catch (e) {}
  if (!resp.ok || !data || data.error) throw K.apiFout(data, resp.status);
  return data;
}
async function voerAnalyseUit(input) {
  if (serverModus()) {
    // De server doet hetzelfde als hieronder, met de sleutel van de app-eigenaar en een gedeelde prijscache
    var t1 = setTimeout(function() { setStap(2); }, 7000), t2 = setTimeout(function() { setStap(3); }, 30000);
    try { return await apiCall('/api/analyse', { method: 'POST', body: input }); }
    finally { clearTimeout(t1); clearTimeout(t2); }
  }
  if (!getApiKey()) throw new Error('Voer eerst een API key in.');
  return K.analyseer(input, {
    anthropic: anthropicDirect,
    modelPagina: MODEL_PAGINA,
    modelPrijzen: getInst().model,
    rdw: function(k) { return K.rdwOpzoeken(k, function(u, o) { return fetch(u, o); }); },
    cacheLees: function(sl) { return leesPrijsCache(sl); },
    cacheSchrijf: function(sl, pr) { bewaarPrijsCache(sl, pr); },
    opStap: setStap
  });
}

// Zet het resultaat van een analyse om naar een opgeslagen kavel
// Kosten: eigen invoer > kavelpagina > instelling veilinghuis > standaard
function bouwKavel(res, inv) {
  var pagina = res.pagina, prijzen = res.prijzen, veilingInfo = inv.tarief, url = inv.url;
  var tarief = { opgeld: veilingInfo.opgeld, btw: veilingInfo.btw, vast: veilingInfo.vast, regeling: veilingInfo.regeling };
  var tariefBron = veilingInfo.bron, vanPagina = [];
  var pk = pagina && pagina.kosten;
  if (!veilingInfo.handmatig && inv.leesKosten && pk) {
    if (pk.opgeld_pct != null && pk.opgeld_pct >= 0 && pk.opgeld_pct <= 50) { tarief.opgeld = pk.opgeld_pct / 100; vanPagina.push('opgeld'); }
    if (pk.btw_pct != null && pk.btw_pct >= 0 && pk.btw_pct <= 30) { tarief.btw = pk.btw_pct / 100; vanPagina.push('btw'); }
    if (pk.vaste_kosten != null && geldigVast(pk.vaste_kosten)) { tarief.vast = pk.vaste_kosten; vanPagina.push('vaste kosten'); }
    if (pk.btw_regeling) { tarief.regeling = pk.btw_regeling; vanPagina.push('btw-regeling'); }
    if (vanPagina.length) tariefBron = 'pagina';
  }
  var bod = inv.bod, bodVanPagina = false, type = inv.bodType;
  if (!bod && pagina && pagina.huidig_bod) { bod = pagina.huidig_bod; bodVanPagina = true; type = 'ander'; }
  var naam = veilingInfo.naam;
  if (naam === 'Onbekend' && pagina && pagina.veilinghuis) naam = pagina.veilinghuis;
  var mp = prijzen.marktplaats;
  var idx = url ? kavels.findIndex(function(k) { return k.url === url; }) : -1;
  var k = {
    id: Date.now() + Math.floor(Math.random() * 1000), url: url, titel: prijzen.productnaam || (pagina && pagina.titel) || res.product,
    veiling: naam, veiling_tarief: tarief, tarief_handmatig: !!veilingInfo.handmatig, tarief_bron: tariefBron,
    tarief_pagina_velden: vanPagina, tarief_citaat: vanPagina.length && pk ? pk.bron : '',
    kavelnummer: (pagina && pagina.kavelnummer) || (url ? ((url.match(/\/(\d+)\/?(?:[?#]|$)/) || [])[1]) : null) || null,
    huidig_bod: bod, bod_van_pagina: bodVanPagina,
    mp_gemiddeld: mp.gemiddeld, mp_laag: mp.laag, mp_hoog: mp.hoog,
    ebay_gemiddeld: prijzen.ebay ? prijzen.ebay.gemiddeld : null,
    nieuwprijs: prijzen.nieuwprijs, prijzen: prijzen, live: prijzen.live,
    pagina: pagina ? { titel: pagina.titel, staat: pagina.staat, staat_toelichting: pagina.staat_toelichting, aantal_stuks: pagina.aantal_stuks,
      aantal_biedingen: pagina.aantal_biedingen, sluit: pagina.sluit, sluit_iso: pagina.sluit_iso, veiling_naam: pagina.veiling_naam || null, locatie: pagina.locatie, opmerkingen: pagina.opmerkingen, foto: pagina.foto || null,
      voertuig: !!pagina.voertuig, kenteken: pagina.kenteken || null, kilometerstand: pagina.kilometerstand || null, bouwjaar: pagina.bouwjaar || null, rdw: pagina.rdw || null } : null,
    zoekterm: (pagina && pagina.zoekterm) || null,
    waarschuwingen: res.waarschuwingen || [],
    api_usd: typeof res.usd === 'number' ? res.usd : null,
    eigen_bod: type === 'eigen', toegevoegd: Date.now(), status: 'klaar'
  };
  if (idx >= 0) {
    var oud = kavels[idx];
    if (typeof oud.verkoopkosten === 'number') k.verkoopkosten = oud.verkoopkosten;
    if (oud.thumb) k.thumb = oud.thumb;
    if (oud.groep) k.groep = oud.groep;
    if (oud.geen_melding) k.geen_melding = true;
    if (oud.notitie) k.notitie = oud.notitie;
  }
  herberekenKosten(k);
  if (k.api_usd != null && !serverModus()) telApiKosten(k.api_usd);
  if (idx >= 0) kavels[idx] = k; else kavels.unshift(k);
  return k;
}

function leesLink(veld) {
  var url = document.getElementById(veld).value.trim();
  if (url && !/^https?:\/\//i.test(url) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(url)) { url = 'https://' + url; document.getElementById(veld).value = url; }
  return url;
}

var FOTO_GRENS = 'De app bekijkt de foto\'s om het product te herkennen, maar ziet niet elk detail. Controleer zelf of er geen schade of defecte onderdelen zijn, het liefst op de kijkdag.';
// Foto verkleinen tot hooguit 1024 pixels (JPEG), zodat het versturen snel gaat en weinig kost
function verkleinFoto(img) {
  return new Promise(function(resolve) {
    var el = new Image();
    el.onload = function() {
      try {
        var max = 1024, sc = Math.min(1, max / Math.max(el.width, el.height));
        var c = document.createElement('canvas'); c.width = Math.round(el.width * sc); c.height = Math.round(el.height * sc);
        c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
        resolve({ media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] });
      } catch (e) { resolve(null); }
    };
    el.onerror = function() { resolve(null); };
    el.src = 'data:' + img.mediaType + ';base64,' + img.base64;
  });
}
async function fotosVoorAnalyse() {
  var lijst = await Promise.all(imgs.slice(0, K.MAX_FOTOS).map(verkleinFoto));
  return lijst.filter(Boolean);
}
async function analyseer() {
  var url = leesLink('kavel-url');
  var bodStr = document.getElementById('huidig-bod').value.trim();
  var extra = document.getElementById('extra-txt').value.trim();

  if (!url && !extra && !imgs.length) { toonMsg('analyse-err', 'Plak de link naar het kavel, vul een productnaam in of voeg foto\'s toe.'); return; }
  if (url && !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(url)) { toonMsg('analyse-err', 'De link moet beginnen met https:// en naar een webpagina wijzen.'); return; }
  if (url && K.nietOpenen(url)) { toonMsg('analyse-err', 'Links van Marktplaats en 2dehands lezen we niet. Plak de link van een veilingkavel, of vul de productnaam in.'); return; }
  var bod = null;
  if (bodStr) {
    bod = /^[\d.,\s€]+$/.test(bodStr) ? parseBedrag(bodStr) : NaN;
    if (!isFinite(bod) || bod <= 0) { toonMsg('analyse-err', 'Voer een geldig bedrag in, bijvoorbeeld 250.'); return; }
  }
  var veilingInfo = formTarief(url);
  if (veilingInfo.fout) { toonMsg('analyse-err', veilingInfo.fout); return; }
  if (serverModus() && !account) { vraagInloggen(); return; }
  if (!serverModus() && !getApiKey()) { toonMsg('analyse-err', 'Voer eerst je API-sleutel in (bovenaan de pagina).'); return; }
  var inv = { url: url, bod: bod, bodType: bodType, tarief: veilingInfo, leesKosten: document.getElementById('vk-lees').checked };
  var thumb = huidigeThumb;

  document.getElementById('analyse-err').style.display = 'none';
  setBtn('analyse-btn', 'analyse-btn-txt', true, '<span class="spinner"></span> Analyseren...');
  setFase('bezig');
  setStap(1);
  try {
    var fotos = imgs.length ? await fotosVoorAnalyse() : [];
    var res = await voerAnalyseUit({ url: url, extra: extra, fotos: fotos.length ? fotos : undefined, hergebruik: document.getElementById('prijs-hergebruik').checked });
    var k = bouwKavel(res, inv);
    if (thumb) k.thumb = thumb;
    slaKavelsOp();
    updateBadge();
    if (res.verbruik) toonVerbruik(res.verbruik);
    toonAnalyseResultaat(k);
    toast('Analyse opgeslagen in je overzicht', huidigeTab !== 'analyse' ? { label: 'Bekijk', fn: function() { switchTab('analyse'); } } : null);
  } catch (e) {
    console.error('Analyse fout:', e);
    setFase('invoer');
    toonMsg('analyse-err', vriendelijkeFout(e));
    if (e.status === 402) setTimeout(toonAccount, 400);
    if (e.code === 'niet_geverifieerd') setTimeout(function() { vraagCode(); }, 300);
  } finally {
    setBtn('analyse-btn', 'analyse-btn-txt', false, 'Analyseer kavel');
  }
}

// ── 5. Resultaat ────────────────────────────────────────────────────────────
function adviesInfo(a) {
  if (a === 'kopen') return { key: 'kopen', label: 'Aanrader', tekst: 'Dit kavel is interessant: wat het tweedehands opbrengt ligt ruim boven je totale kosten.' };
  if (a === 'skip') return { key: 'skip', label: 'Skip', tekst: 'Na alle kosten blijft er bij de huidige prijzen geen winst over.' };
  if (a === 'twijfel') return { key: 'twijfel', label: 'Twijfel', tekst: 'Dit kavel is een grensgeval. Controleer de marktprijs zelf voordat je biedt.' };
  return { key: 'wacht', label: 'Niet geanalyseerd', tekst: '' };
}
function vertrouwenInfo(v) {
  if (v === 'hoog') return { label: 'Hoog', cls: 'pos' };
  if (v === 'middel') return { label: 'Gemiddeld', cls: 'warn' };
  return { label: 'Laag', cls: 'neg' };
}
function veilingVan(k) { return k.veiling || (k.kosten && k.kosten.site) || 'Onbekend'; }

function adviesRedenen(d) {
  var r = [];
  if (partijOnbetrouwbaar(d)) r.push(['warn', 'Dit lijkt een partij van meerdere stuks' + (partijAantal(d) ? ' (ongeveer ' + partijAantal(d) + ')' : '') + '. De prijs geldt voor één stuk, dus het kavel is niet zonder meer te beoordelen. Controleer onder Prijzen controleren de opbrengst per stuk.']);
  (d.waarschuwingen || []).forEach(function(w) { r.push(['warn', w]); });
  if (partijOnbetrouwbaar(d)) return r;
  var mp = d.prijzen && d.prijzen.marktplaats;
  var k = d.kosten;
  var gem = verkoopprijsVan(d);
  var doel = doelPct();
  var vkst = verkoopkostenVan(d);
  if (k && gem && k.marge != null) {
    var m = k.marge, pctExact = m / gem * 100, pct = Math.round(pctExact);
    if (m > 0) r.push(['ok', 'De verwachte verkoopprijs (' + fmt(gem) + ') ligt boven de totale kosten (' + fmt(k.totaal) + (vkst ? ' plus ' + fmt(vkst) + ' verkoopkosten' : '') + ').']);
    else r.push(['bad', 'De totale kosten (' + fmt(k.totaal) + (vkst ? ' plus ' + fmt(vkst) + ' verkoopkosten' : '') + ') liggen niet onder de verwachte verkoopprijs (' + fmt(gem) + ').']);
    if (m > 0 && pctExact >= doel - 1e-9) r.push(['ok', 'De verwachte marge is ' + pct + '% van de verkoopprijs, minstens de ' + pctTxt(doel) + '% die je als gewenste marge hebt ingesteld.']);
    else if (m > 0) r.push(['warn', 'De verwachte marge is ' + pct + '% van de verkoopprijs, onder je gewenste marge van ' + pctTxt(doel) + '%.']);
    else if (m < -50 || pctExact < -10) r.push(['bad', 'Het verwachte verlies is ' + fmt(-m) + ' (' + Math.abs(pct) + '% van de verkoopprijs).']);
    else r.push(['warn', 'De marge is negatief maar klein (' + fmtS(m) + ').']);
    if (mp && mp.laag && !(d.controle && !d.controle.mp_laag)) {
      var laag = d.controle ? d.controle.mp_laag : mp.laag;
      var lm = laag - k.totaal - vkst;
      if (lm > 0) r.push(['ok', 'Ook bij de laagste verwachte prijs (' + fmt(laag) + ') blijft er winst over (' + fmtS(lm) + ').']);
      else r.push(['warn', 'Bij de laagste verwachte prijs (' + fmt(laag) + ') is er geen winst meer (' + fmtS(lm) + ').']);
    }
  } else if (!k) {
    r.push(['warn', 'Er is nog geen bod bekend, dus de marge kan niet worden berekend.']);
  }
  if (d.maxBod != null) {
    r.push(['info', d.maxBod > 0
      ? 'Tot een bod van ' + fmt(d.maxBod) + ' houd je minstens ' + pctTxt(doel) + '% marge over. Bij ' + fmt(d.breakEvenBod) + ' speel je quitte.'
      : 'Ook bij een heel laag bod blijft er na alle kosten geen ' + pctTxt(doel) + '% marge over.']);
  }
  if (d.tarief_bron === 'pagina') r.push(['ok', 'De veilingkosten (' + (d.tarief_pagina_velden || []).join(', ') + ') zijn van de kavelpagina gelezen.']);
  else if (d.tarief_bron === 'handmatig') r.push(['info', 'De veilingkosten zijn door jou ingesteld.']);
  else if (d.tarief_bron === 'standaard') r.push(['warn', 'De veilingkosten stonden niet op de kavelpagina; er is gerekend met de standaardwaarde. Controleer het opgeld bij de veiling.']);
  else if (d.tarief_bron === 'huis') r.push(['warn', 'De veilingkosten stonden niet op de kavelpagina; er is gerekend met jouw instelling voor ' + veilingVan(d) + '.']);
  if (d.controle) {
    r.push(['ok', 'De verkoopprijs komt uit jouw controle van vergelijkbare advertenties (' + new Date(d.controle.op).toLocaleDateString('nl-NL') + ').']);
    if (d.prijzen && d.prijzen.nieuwprijs && gem >= d.prijzen.nieuwprijs) r.push(['warn', 'De tweedehands prijs ligt niet onder de nieuwprijs. Controleer beide bedragen.']);
  } else if (mp) {
    if (mp.vertrouwen === 'hoog') r.push(['ok', 'Er zijn genoeg vergelijkbare advertenties gevonden; de verkoopprijs is goed onderbouwd.']);
    else if (mp.vertrouwen === 'middel') r.push(['warn', 'De verkoopprijs is indicatief: er zijn maar enkele vergelijkbare advertenties.']);
    else r.push(['warn', 'De verkoopprijs is onzeker: er is weinig vergelijkbaar aanbod gevonden.']);
    if (mp.hoog && mp.laag && mp.gemiddeld && (mp.hoog - mp.laag) / mp.gemiddeld > 0.6) r.push(['warn', 'De prijzen lopen sterk uiteen (' + fmt(mp.laag) + ' tot ' + fmt(mp.hoog) + ').']);
    ((d.prijzen && d.prijzen.controles) || []).forEach(function(c) { r.push(['warn', c]); });
  }
  if (!d.controle) {
    if (d.prijzen && d.prijzen.live) r.push(['ok', 'De prijzen komen van echte advertenties en verkochte items, opgezocht op ' + new Date(d.prijzen.opgehaald_op).toLocaleDateString('nl-NL') + '. De links staan hieronder bij Prijzen van vandaag.']);
    else r.push(['info', 'Prijzen zijn een schatting van het AI-model en niet live opgehaald. Controleer vergelijkbare advertenties voordat je biedt.']);
  }
  return r;
}

function kostenBalk(k, mpGem) {
  var vkst = k.verkoopkosten || 0;
  var uit = k.totaal + vkst;
  var schaal = Math.max(uit, mpGem);
  var p = function(v) { return (v / schaal * 100).toFixed(2); };
  var pos = mpGem / schaal * 100;
  var stand = pos < 18 ? 'l' : pos > 82 ? 'r' : '';
  var h = '<div class="fbar" role="img" aria-label="Totale kosten ' + fmt(uit) + ' tegenover verwachte verkoopprijs ' + fmt(mpGem) + '">';
  h += '<div class="fbar-mark ' + stand + '" style="left:' + pos.toFixed(2) + '%">Verkoopprijs ' + fmt(mpGem) + '</div>';
  h += '<div class="fbar-line" style="left:' + pos.toFixed(2) + '%"></div>';
  h += '<div class="fbar-track">';
  h += '<div class="s-bod" style="width:' + p(k.bod) + '%"></div>';
  h += '<div class="s-vk" style="width:' + p(k.vk + (k.vast || 0)) + '%"></div>';
  h += '<div class="s-btw" style="width:' + p(k.btw) + '%"></div>';
  if (vkst) h += '<div class="s-vkst" style="width:' + p(vkst) + '%"></div>';
  if (k.marge > 0) h += '<div class="s-winst" style="width:' + p(k.marge) + '%"></div>';
  else if (k.marge < 0) h += '<div class="s-verlies" style="left:' + pos.toFixed(2) + '%;width:' + p(-k.marge) + '%"></div>';
  h += '</div></div>';
  h += '<div class="legend">' +
    '<span><i style="background:var(--seg-bod)"></i>Bod</span>' +
    '<span><i style="background:var(--seg-vk)"></i>Veilingkosten</span>' +
    '<span><i style="background:var(--seg-btw)"></i>Btw</span>' +
    (vkst ? '<span><i style="background:var(--seg-vkst)"></i>Verkoopkosten</span>' : '') +
    (k.marge > 0 ? '<span><i style="background:var(--pos)"></i>Verwachte winst</span>' : '') +
    (k.marge < 0 ? '<span><i style="background:var(--neg)"></i>Verwacht verlies</span>' : '') +
    '</div>';
  return h;
}

function platformKaart(naam, p, tagsLabel, tags, ctl) {
  var c = vertrouwenInfo(p.vertrouwen);
  var h = '<div class="card"><div class="plat-h"><h3>' + naam + '</h3>' + (ctl ? '<span class="conf pos"><i></i>Gecontroleerd</span>' : '<span class="conf ' + c.cls + '"><i></i>Betrouwbaarheid ' + c.label.toLowerCase() + '</span>') + '</div>';
  if (ctl) {
    h += '<div class="range">' + (ctl.mp_laag ? '<span>' + fmt(ctl.mp_laag) + '</span>' : '') + '<b>' + fmt(p.gemiddeld) + '</b></div>';
    h += '<div class="kc-meta">' + (ctl.mp_laag ? 'Laagste &middot; gemiddeld &middot; ' : 'Gemiddeld &middot; ') + 'door jou gecontroleerd op ' + new Date(ctl.op).toLocaleDateString('nl-NL') + '. Verkooptijd (schatting): ' + esc(p.verkooptijd || '-') + '</div>';
  } else {
    h += '<div class="range"><span>' + fmt(p.laag) + '</span><b>' + fmt(p.gemiddeld) + '</b><span>' + fmt(p.hoog) + '</span></div>';
    h += '<div class="kc-meta">Laag &middot; gemiddeld &middot; hoog &middot; verkooptijd ' + esc(p.verkooptijd || '-') + '</div>';
  }
  if (p.tip) h += '<div class="tip">' + esc(p.tip) + '</div>';
  if (tags && tags.length) { h += '<div class="tags">'; tags.forEach(function(t) { h += '<span class="tag">' + esc(t) + '</span>'; }); h += '</div>'; }
  return h + '</div>';
}

// ── Zoekterm en partij-detectie ──────────────────────────────────────────────
// null = geen partij, 0 = partij met onbekend aantal, anders het aantal stuks
function partijAantal(d) {
  if (d.prijzen && d.prijzen.partij && d.prijzen.partij.aantal > 1) return d.prijzen.partij.aantal;
  if (d.pagina && d.pagina.aantal_stuks > 1) return d.pagina.aantal_stuks;
  var tekst = (d.titel || '') + ' ' + naamUitUrl(d.url || '');
  var m = tekst.match(/\b(\d{2,})\s*(stuks|stuk|st|pcs|pieces|artikelen|items)\b/i);
  if (m) return parseInt(m[1], 10);
  return /\b(partij|pallet|assortiment)\b/i.test(tekst) ? 0 : null;
}
function partijOnbetrouwbaar(d) { return partijAantal(d) !== null && !d.controle; }

// ── Prijzen controleren (handmatig, gratis) ─────────────────────────────────
var BACKUP_KEYS = ['prijzen', 'kosten', 'advies', 'adviesReden', 'roi', 'maxBod', 'mp_gemiddeld', 'mp_laag', 'mp_hoog', 'nieuwprijs'];
function kopie(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function herstelBasis(k) {
  BACKUP_KEYS.forEach(function(key) {
    if (k.ai_backup[key] === undefined) delete k[key]; else k[key] = kopie(k.ai_backup[key]);
  });
}
function openZoek(site) {
  var t = document.getElementById('ctl-zoek').value.trim();
  if (!t) { toast('Vul eerst een zoekterm in.', null, true); return; }
  var q = encodeURIComponent(t);
  var urls = {
    mp: 'https://www.marktplaats.nl/q/' + t.split(/\s+/).map(encodeURIComponent).join('+') + '/',
    ebay: 'https://www.ebay.nl/sch/i.html?_nkw=' + q,
    bol: 'https://www.bol.com/nl/nl/s/?searchtext=' + q,
    google: 'https://www.google.com/search?tbm=shop&q=' + q
  };
  window.open(urls[site], '_blank', 'noopener');
}
function controleKaart(d, idx) {
  if (idx < 0) return '';
  var c = d.controle;
  var val = function(v) { return v ? esc(String(v)) : ''; };
  var h = '<div class="card" id="controle-kaart"><div class="card-h"><h2>Prijzen controleren</h2>' +
    (c ? '<span class="conf pos"><i></i>Gecontroleerd op ' + new Date(c.op).toLocaleDateString('nl-NL') + '</span>' : '<span class="conf warn"><i></i>Nog niet gecontroleerd</span>') + '</div>';
  h += '<p class="card-sub">' + (d.prijzen && d.prijzen.live ? 'Heb je zelf betere vergelijkingen, bijvoorbeeld voor een afwijkende staat of uitvoering?' : 'De prijzen in deze analyse zijn een schatting, omdat live zoeken niet lukte.') + ' Wil je zeker zijn, zoek dan zelf vergelijkbare advertenties op en vul het gemiddelde in. Marge en advies worden dan opnieuw berekend.</p>';
  var kort = korteZoekterm(d.titel || '');
  h += '<div class="field"><label for="ctl-zoek">Zoekterm</label><input class="input" id="ctl-zoek" type="text" value="' + esc(kort) + '"><div class="help">' +
    (kort !== (d.titel || '').trim() ? 'De titel is ingekort, want lange titels vinden op Marktplaats vaak niets. Pas de zoekterm aan als dat nodig is. ' : '') +
    'Maak de zoekterm preciezer met type, model of opslag.</div></div>';
  h += '<div class="ctl-links">' +
    '<button class="btn btn-secondary btn-sm" onclick="openZoek(\'mp\')">' + ic('external') + 'Marktplaats</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="openZoek(\'ebay\')">' + ic('external') + 'eBay</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="openZoek(\'bol\')">' + ic('external') + 'bol.com</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="openZoek(\'google\')">' + ic('external') + 'Google Shopping</button></div>';
  h += '<div class="note">' + ic('info') + '<span>Kijk naar 5 tot 10 advertenties met dezelfde specificaties en staat. Let op verschillen binnen één productnaam (bijvoorbeeld M3, M3 Pro en M3 Max) en laat &ldquo;gezocht&rdquo;-advertenties, accessoires en uitschieters buiten beschouwing.</span></div>';
  var pa = partijAantal(d);
  var isPartij = c ? !!c.partij : pa !== null;
  var pc = (c && c.partij) || {};
  if (!c && d.prijzen && d.prijzen.partij && d.prijzen.partij.prijs_per_stuk) pc = { aantal: d.prijzen.partij.aantal, per_stuk: d.prijzen.partij.prijs_per_stuk };
  h += '<label class="ctl-check"><input type="checkbox" id="ctl-partij" onchange="togglePartij()"' + (isPartij ? ' checked' : '') + '> Dit kavel bestaat uit meerdere stuks (partij)</label>';
  h += '<div id="ctl-partijvel" style="display:' + (isPartij ? 'block' : 'none') + '"><div class="note">' + ic('info') + '<span>Zoek een paar losse stuks uit deze partij op en kijk wat ze gemiddeld opbrengen. De marktwaarde van de partij is dan aantal &times; opbrengst per stuk &times; het deel dat je verwacht te verkopen.</span></div>' +
    '<div class="ctl-grid">' +
    '<div><label class="ctl-l" for="ctl-aantal">Aantal stuks</label><input class="input" id="ctl-aantal" type="text" inputmode="numeric" oninput="updatePartijTotaal()" value="' + val(pc.aantal || (pa || '')) + '"></div>' +
    '<div><label class="ctl-l" for="ctl-stuk">Opbrengst per stuk</label><div class="money"><span>&euro;</span><input class="input" id="ctl-stuk" type="text" inputmode="decimal" oninput="updatePartijTotaal()" value="' + val(pc.per_stuk) + '"></div></div>' +
    '<div><label class="ctl-l" for="ctl-pct">Verwacht verkocht <span class="opt">(%)</span></label><input class="input" id="ctl-pct" type="text" inputmode="numeric" placeholder="100" oninput="updatePartijTotaal()" value="' + val(pc.verkocht_pct) + '"></div></div>' +
    '<div class="help" id="ctl-totaal"></div></div>';
  h += '<div id="ctl-normaal" style="display:' + (isPartij ? 'none' : 'block') + '"><div class="ctl-grid">' +
    '<div><label class="ctl-l" for="ctl-gem">Marktplaats gemiddeld</label><div class="money"><span>&euro;</span><input class="input" id="ctl-gem" type="text" inputmode="decimal" placeholder="bijv. 1250" value="' + val(c && c.mp_gem) + '"></div></div>' +
    '<div><label class="ctl-l" for="ctl-laag">Laagste vergelijkbare <span class="opt">(optioneel)</span></label><div class="money"><span>&euro;</span><input class="input" id="ctl-laag" type="text" inputmode="decimal" value="' + val(c && c.mp_laag) + '"></div></div>' +
    '<div><label class="ctl-l" for="ctl-nieuw">Nieuwprijs <span class="opt">(optioneel)</span></label><div class="money"><span>&euro;</span><input class="input" id="ctl-nieuw" type="text" inputmode="decimal" value="' + val(c && c.nieuw) + '"></div></div></div></div>';
  h += '<div class="help">Het maximale bod rekent met je gecontroleerde gemiddelde en je gewenste marge van ' + pctTxt(doelPct()) + '%.' + (pc.per_stuk && !c ? ' De opbrengst per stuk is voorgesteld door de analyse; controleer hem.' : '') + '</div>';
  h += '<div class="msg err" id="ctl-err" role="alert"></div>';
  h += '<div class="ctl-actions"><button class="btn btn-primary" onclick="bewaarControle(' + idx + ')">' + ic('check') + 'Opslaan en herberekenen</button>' +
    (c ? '<button class="btn btn-secondary" onclick="herstelAiSchatting(' + idx + ')">' + ic('undo') + 'Terug naar AI-schatting</button>' : '') + '</div></div>';
  // Bij echte prijzen hoeft niemand eerst te controleren: ingeklapt als optie
  var kop = '<div class="card" id="controle-kaart"><div class="card-h"><h2>Prijzen controleren</h2><span class="conf warn"><i></i>Nog niet gecontroleerd</span></div>';
  if (d.prijzen && d.prijzen.live && !c && h.indexOf(kop) === 0 && h.slice(-6) === '</div>') {
    h = '<details class="card ctl-inklap" id="controle-kaart"><summary><span><b>Prijzen zelf aanpassen</b><span class="kc-meta">Alleen nodig als je betere vergelijkingen hebt</span></span></summary>' + h.slice(kop.length, -6) + '</details>';
  }
  return h;
}
function pasControleToe(k, gem, laag, nieuw, partij) {
  if (!k.ai_backup) {
    k.ai_backup = {};
    BACKUP_KEYS.forEach(function(key) { k.ai_backup[key] = kopie(k[key]); });
  }
  herstelBasis(k);
  k.prijzen = k.prijzen || {};
  var mp = k.prijzen.marktplaats = k.prijzen.marktplaats || {};
  mp.gemiddeld = gem;
  k.mp_gemiddeld = gem;
  if (laag != null) { mp.laag = laag; k.mp_laag = laag; }
  if (nieuw != null) { k.prijzen.nieuwprijs = nieuw; k.nieuwprijs = nieuw; k.prijzen.nieuwprijs_bron = 'Door jou gecontroleerd'; }
  k.controle = { mp_gem: gem, mp_laag: laag, nieuw: nieuw, partij: partij || null, op: Date.now() };
  herberekenKosten(k);
}
function togglePartij() {
  var aan = document.getElementById('ctl-partij').checked;
  document.getElementById('ctl-partijvel').style.display = aan ? 'block' : 'none';
  document.getElementById('ctl-normaal').style.display = aan ? 'none' : 'block';
  updatePartijTotaal();
}
function leesBedragVeld(id) {
  var v = document.getElementById(id).value.trim();
  if (!v) return null;
  return /^[\d.,\s€]+$/.test(v) ? parseBedrag(v) : NaN;
}
function updatePartijTotaal() {
  var el = document.getElementById('ctl-totaal');
  if (!el) return;
  var n = leesBedragVeld('ctl-aantal'), p = leesBedragVeld('ctl-stuk'), pct = leesBedragVeld('ctl-pct');
  if (pct === null) pct = 100;
  el.textContent = (n > 0 && p > 0 && pct > 0 && pct <= 100 && isFinite(n) && isFinite(p) && isFinite(pct))
    ? 'Marktwaarde partij: ' + fmt(n * p * pct / 100) + ' (' + n + ' × ' + fmt(p) + (pct < 100 ? ' × ' + pct + '%' : '') + ')'
    : '';
}
function bewaarControle(idx) {
  var k = kavels[idx];
  var partijAan = document.getElementById('ctl-partij').checked;
  var gem, laag = null, nieuw = null, partij = null, fout = '';
  if (partijAan) {
    var n = leesBedragVeld('ctl-aantal'), p = leesBedragVeld('ctl-stuk'), pct = leesBedragVeld('ctl-pct');
    if (pct === null) pct = 100;
    if (n === null || !isFinite(n) || n < 1 || Math.round(n) !== n) fout = 'Voer het aantal stuks in als geheel getal, bijvoorbeeld 280.';
    else if (p === null || !isFinite(p) || p <= 0) fout = 'Voer de gemiddelde opbrengst per stuk in als geldig bedrag, bijvoorbeeld 15.';
    else if (!isFinite(pct) || pct <= 0 || pct > 100) fout = 'Voer bij verwacht verkocht een percentage tussen 1 en 100 in, of laat het leeg voor 100%.';
    else { gem = n * p * pct / 100; partij = { aantal: n, per_stuk: p, verkocht_pct: pct === 100 ? null : pct }; }
  } else {
    gem = leesBedragVeld('ctl-gem'); laag = leesBedragVeld('ctl-laag'); nieuw = leesBedragVeld('ctl-nieuw');
    if (gem === null || !isFinite(gem) || gem <= 0) fout = 'Voer de gemiddelde Marktplaats-prijs in als geldig bedrag, bijvoorbeeld 1250.';
    else if (laag !== null && (!isFinite(laag) || laag <= 0)) fout = 'Voer de laagste prijs als geldig bedrag in, of laat het veld leeg.';
    else if (laag !== null && laag > gem) fout = 'De laagste prijs kan niet hoger zijn dan het gemiddelde.';
    else if (nieuw !== null && (!isFinite(nieuw) || nieuw <= 0)) fout = 'Voer de nieuwprijs als geldig bedrag in, of laat het veld leeg.';
  }
  if (fout) { toonMsg('ctl-err', fout); return; }
  pasControleToe(k, gem, laag, nieuw, partij);
  slaKavelsOp(); renderOverzicht();
  toonAnalyseResultaat(k, true);
  toast('Prijzen opgeslagen. Marge en advies zijn opnieuw berekend.');
}
function herstelAiSchatting(idx) {
  var k = kavels[idx];
  if (!k.ai_backup) return;
  herstelBasis(k);
  delete k.controle; delete k.ai_backup;
  herberekenKosten(k);
  slaKavelsOp(); renderOverzicht();
  toonAnalyseResultaat(k, true);
  toast('Teruggezet naar de AI-schatting');
}

function bronLink(url, tekst, bevestigd) {
  var u = veiligeUrl(url);
  if (!u) return esc(tekst);
  return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(tekst) + '</a>' + (bevestigd === false ? ' <span class="tag-warn" title="Deze link kwam niet letterlijk voor in de opgehaalde resultaten">niet bevestigd</span>' : '');
}
function domeinVan(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
var TARIEF_BRON_TXT = { pagina: 'van de kavelpagina', handmatig: 'door jou ingesteld', huis: 'jouw instelling voor dit veilinghuis', standaard: 'standaardwaarde, niet geverifieerd' };

function toonAnalyseResultaat(d, behoudScroll) {
  var mp = d.prijzen && d.prijzen.marktplaats ? d.prijzen.marktplaats : null;
  var eb = d.prijzen && d.prijzen.ebay ? d.prijzen.ebay : null;
  var ond = partijOnbetrouwbaar(d);
  var a = ond ? { key: 'wacht', label: 'Controle nodig', tekst: '' } : adviesInfo(d.advies);
  var idx = kavels.indexOf(d);
  var conf = vertrouwenInfo(mp ? mp.vertrouwen : null);
  var url = veiligeUrl(d.url);
  var gem = verkoopprijsVan(d);
  var pg = d.pagina || {};

  var h = '<div class="res-bar"><button class="btn btn-ghost btn-sm" onclick="switchTab(\'overzicht\')">' + ic('back') + 'Mijn kavels</button><div class="grp">';
  if (idx >= 0) h += '<button class="btn btn-secondary btn-sm" onclick="wijzigBod(' + idx + ')">' + ic('tag') + 'Bod wijzigen</button>';
  if (idx >= 0) h += '<button class="btn btn-secondary btn-sm" onclick="heranalyseer(' + idx + ')">' + ic('refresh') + 'Opnieuw analyseren</button>';
  if (idx >= 0 && d.status !== 'gewonnen') h += '<button class="btn btn-secondary btn-sm" onclick="markeerGewonnen(' + idx + ',function(){switchTab(\'overzicht\')})">' + ic('trophy') + 'Markeer als gewonnen</button>';
  h += '<button class="btn btn-primary btn-sm" onclick="nieuwKavel()">' + ic('plus') + 'Nieuwe analyse</button></div></div>';

  // Hero: het advies met het kavelkaartje (maximaal bod)
  var meta = [esc(veilingVan(d))];
  if (d.kavelnummer) meta.push('Kavel ' + esc(d.kavelnummer));
  if (pg.sluit) meta.push('Sluit ' + esc(pg.sluit));
  if (pg.aantal_biedingen != null) meta.push(pg.aantal_biedingen + (pg.aantal_biedingen === 1 ? ' bod' : ' biedingen'));
  if (url) meta.push('<a href="' + esc(url) + '" target="_blank" rel="noopener">Bekijk kavel</a>');
  h += '<div class="card hero v-' + a.key + '"><div class="verdict"><div>';
  h += '<div class="hero-top"><span class="pill pill-lg pill-' + a.key + '">' + a.label + '</span>';
  if (d.controle) h += '<span class="conf pos"><i></i>Prijzen gecontroleerd</span>';
  else if (d.prijzen && d.prijzen.live) h += '<span class="conf pos"><i></i>Echte prijzen van ' + new Date(d.prijzen.opgehaald_op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) + '</span>';
  else if (d.prijzen) h += '<span class="conf warn"><i></i>Schatting zonder internet</span>';
  h += '</div>';
  h += '<h2>' + esc(d.titel || 'Onbekend product') + '</h2>';
  h += '<div class="hero-meta" style="margin-top:6px">' + meta.map(function(m) { return '<span>' + m + '</span>'; }).join('') + '</div>';
  if (pg.staat && pg.staat !== 'onbekend') h += '<p class="hero-meta" style="margin-top:4px">Staat volgens de veiling: ' + esc(pg.staat) + (pg.staat_toelichting ? ', ' + esc(pg.staat_toelichting) : '') + '</p>';
  h += '<p class="uitleg">' + (ond ? 'Dit lijkt een partij van meerdere stuks' + (partijAantal(d) ? ' (ongeveer ' + partijAantal(d) + ')' : '') + '. De prijzen gelden voor één stuk, dus er is nog geen betrouwbaar advies. Controleer hieronder bij Prijzen controleren de opbrengst per stuk.' : d.kosten ? esc(a.tekst) : 'Er is nog geen bod bekend, dus de marge kan niet worden berekend.') + '</p>';
  if (d.adviesReden && !ond) h += '<p class="reden">' + esc(d.adviesReden) + '</p>';
  h += '</div>';
  var rendabel = !ond && d.maxBod != null && d.maxBod > 0;
  h += '<div class="lot-tag" role="img" aria-label="' + (rendabel ? 'Bied maximaal ' + fmt(d.maxBod) : 'Geen rendabel bod') + '"><div class="lt-l">' + (rendabel ? 'Bied maximaal' : 'Maximaal bod') + '</div>' +
    '<div class="lt-v' + (rendabel ? '' : ' klein') + '">' + (ond || d.maxBod == null ? 'Nog onbekend' : rendabel ? fmt(d.maxBod) : 'Niet rendabel') + '</div>' +
    '<div class="lt-s">' + (ond || d.maxBod == null ? 'Eerst de prijs controleren' : 'voor ' + pctTxt(doelPct()) + '% marge<br>quitte bij ' + fmt(d.breakEvenBod)) + '</div></div>';
  h += '</div>';
  h += standVanZaken(d);
  h += '<div class="hero-kpis">';
  h += '<div class="kpi"><div class="kpi-l">Handelspotentieel</div><div class="kpi-v">' + (ond ? '-' : (d.roi || 0) + '<span style="font-size:13px;font-weight:500;color:var(--ink-3)"> / 100</span>') + '</div>' + (ond ? '<div class="kpi-s">Pas beschikbaar na controle van de prijs</div>' : '<div class="meter"><i data-w="' + (d.roi || 0) + '"></i></div>') + '</div>';
  var aantalAdv = d.prijzen && d.prijzen.tweedehands ? d.prijzen.tweedehands.length : 0;
  h += '<div class="kpi"><div class="kpi-l">Betrouwbaarheid prijzen</div><div class="kpi-v"><span class="conf ' + (d.controle ? 'pos' : ond ? 'warn' : conf.cls) + '" style="font-size:20px;font-weight:700;color:var(--ink)"><i></i>' + (d.controle ? 'Gecontroleerd' : ond ? 'Niet bruikbaar' : conf.label) + '</span></div><div class="kpi-s">' +
    (d.controle ? 'Marktprijs door jou nagekeken' : ond ? 'Prijs geldt voor één stuk' : d.prijzen && d.prijzen.live ? aantalAdv + (aantalAdv === 1 ? ' echte advertentie' : ' echte advertenties') + ' van vandaag' : 'Schatting van het AI-model, geen live data') + '</div></div>';
  h += '</div>';
  if (idx >= 0) {
    h += '<div class="kc-actions" style="margin-top:16px">';
    if (pg.sluit_iso && Date.parse(pg.sluit_iso) > Date.now()) {
      h += '<button class="btn btn-secondary btn-sm" onclick="agendaKeuze(' + idx + ')">' + ic('calendar') + 'In agenda</button>';
      if (serverModus() && account) h += '<button class="btn btn-secondary btn-sm" onclick="' + (d.geen_melding ? 'wisselKavelMelding(' + idx + ')' : 'meldingenScherm()') + '">' + ic('bell') + (d.geen_melding ? 'Meldingen aanzetten' : 'Meldingen') + '</button>';
    }
    h += '<button class="btn btn-secondary btn-sm" onclick="kiesGroep(' + idx + ')">' + ic('folder') + (d.groep ? esc(d.groep) : 'Groep') + '</button>';
    h += '<button class="btn btn-secondary btn-sm" onclick="deelKavel(' + idx + ')">' + ic('share') + 'Delen</button></div>';
  }
  h += '</div>';

  // Financiële analyse
  var vkst = verkoopkostenVan(d);
  h += '<div class="card"><div class="card-h"><h2>Financiële analyse</h2>';
  h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  if (d.kosten && d.kosten.site) h += '<span class="kc-meta">' + esc(d.kosten.site) + ' &middot; ' + (d.eigen_bod ? 'Mijn bod' : 'Huidig bod') + '</span>';
  if (idx >= 0) h += '<button class="btn btn-secondary btn-sm" onclick="pasTariefAan(' + idx + ')">' + ic('percent') + 'Kosten aanpassen</button>';
  h += '</div></div>';
  function kostenRijen(k) {
    var t = tariefVan(d);
    var r = '<tr><td>' + (d.eigen_bod ? 'Mijn bod' : 'Huidig bod') + (d.bod_van_pagina ? '<small>Van de kavelpagina gelezen</small>' : '') + '</td><td>' + fmtC(k.bod) + '</td></tr>';
    r += '<tr class="sub"><td>+ Veilingkosten (' + pctTxt(t.opgeld * 100) + '% opgeld)<small>' + esc(TARIEF_BRON_TXT[d.tarief_bron] || 'instelling') + '</small></td><td>' + fmtC(k.vk) + '</td></tr>';
    if (k.vast) r += '<tr class="sub"><td>+ Vaste kosten per kavel</td><td>' + fmtC(k.vast) + '</td></tr>';
    r += '<tr class="sub"><td>+ Btw' + (t.regeling === 'geen' ? '' : ' (' + pctTxt(t.btw * 100) + '%)') + '<small>' + esc(REGELINGEN[t.regeling]) + '</small></td><td>' + fmtC(k.btw) + '</td></tr>';
    r += '<tr class="tot"><td>= Totale kosten</td><td>' + fmtC(k.totaal) + '</td></tr>';
    return r;
  }
  if (d.kosten && gem && !ond) {
    var k = d.kosten, pct = Math.round(k.marge / gem * 100);
    var margeCls = k.marge > 0 ? 'pos' : k.marge < 0 ? 'neg' : '';
    h += '<div class="metrics">';
    h += '<div class="metric"><div class="metric-l">Verwachte verkoop</div><div class="metric-v">' + fmt(gem) + '</div><div class="metric-s">' + (d.controle && d.controle.partij ? d.controle.partij.aantal + ' × ' + fmt(d.controle.partij.per_stuk) + (d.controle.partij.verkocht_pct ? ' × ' + d.controle.partij.verkocht_pct + '%' : '') : d.controle ? 'Door jou gecontroleerd' : d.prijzen && d.prijzen.live ? 'Op basis van echte advertenties' : 'Schatting') + '</div></div>';
    h += '<div class="metric"><div class="metric-l">Totale kosten</div><div class="metric-v">' + fmt(k.totaal) + '</div><div class="metric-s">Incl. veilingkosten en btw</div></div>';
    h += '<div class="metric"><div class="metric-l">Verwachte winst</div><div class="metric-v ' + margeCls + '">' + fmtS(k.marge) + '</div><div class="metric-s">' + (vkst ? 'Na ' + fmt(vkst) + ' verkoopkosten' : 'Verkoop min kosten') + '</div></div>';
    h += '<div class="metric"><div class="metric-l">Marge</div><div class="metric-v ' + margeCls + '">' + pct + '%</div><div class="metric-s">Van de verkoopprijs (doel ' + pctTxt(doelPct()) + '%)</div></div>';
    h += '</div>';
    h += kostenBalk(k, gem);
    h += '<table class="ctable"><tbody>' + kostenRijen(k);
    h += '<tr class="sub"><td>Verwachte verkoopprijs</td><td>' + fmtC(gem) + '</td></tr>';
    if (vkst) h += '<tr class="sub"><td>&minus; Verkoopkosten<small>Verzending, platform- of andere kosten bij doorverkoop</small></td><td>' + fmtC(vkst) + '</td></tr>';
    h += '<tr class="res"><td>Verwachte winst</td><td class="' + margeCls + '">' + fmtSC(k.marge) + '</td></tr>';
    h += '</tbody></table>';
  } else if (d.kosten) {
    h += '<table class="ctable"><tbody>' + kostenRijen(d.kosten) + '</tbody></table>';
    h += '<div class="note">' + ic('alert') + '<span>' + (ond ? 'Verkoopprijs en marge worden pas getoond nadat je onder Prijzen controleren de opbrengst per stuk hebt ingevuld.' : 'Er is geen verkoopprijs bekend, dus de marge kan niet worden berekend.') + '</span></div>';
  } else {
    h += '<div class="empty small" style="border-style:solid"><h3>Nog geen bod bekend</h3><p>Vul een bod in om de totale kosten en de marge te zien.' + (d.maxBod > 0 ? ' Bied maximaal ' + fmt(d.maxBod) + ' voor ' + pctTxt(doelPct()) + '% marge.' : '') + '</p>' +
         (idx >= 0 ? '<button class="btn btn-primary" onclick="wijzigBod(' + idx + ')">Bod invullen</button>' : '') + '</div>';
  }
  if (!ond) h += biedLadderHtml(d, idx);
  if (d.tarief_citaat) h += '<div class="note">' + ic('info') + '<span>Kosten op de kavelpagina: ' + esc(d.tarief_citaat) + '</span></div>';
  h += '</div>';

  h += controleKaart(d, idx);

  // Waarom dit advies
  h += '<div class="card"><div class="card-h"><h2>Waarom dit advies?</h2></div><ul class="why">';
  adviesRedenen(d).forEach(function(r) {
    var icn = r[0] === 'ok' ? 'check' : r[0] === 'bad' ? 'x' : r[0] === 'warn' ? 'alert' : 'info';
    h += '<li class="' + r[0] + '"><span class="wi">' + ic(icn) + '</span><span>' + esc(r[1]) + '</span></li>';
  });
  h += '</ul><div class="note">' + ic('info') + '<span>' + (d.prijzen && d.prijzen.live
    ? 'Het advies rekent met echte advertenties en verkochte items van vandaag. Wat je kavel uiteindelijk opbrengt, hangt nog af van de staat en het moment van verkoop.'
    : 'Het advies rekent met een schatting, omdat live zoeken niet lukte. Controleer de prijs zelf voordat je biedt.') + '</span></div></div>';

  // Marktprijzen
  if (d.prijzen) {
    var pr = d.prijzen;
    var meta = [];
    if (pr.live) meta.push((pr.hergebruikt ? 'Hergebruikt van ' : 'Opgezocht op ') + new Date(pr.opgehaald_op).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
    if (typeof d.api_usd === 'number') meta.push('analyse kostte ~' + usdTxt(d.api_usd));
    h += '<div class="card"><div class="card-h"><h2>' + (pr.live ? 'Prijzen van vandaag' : 'Geschatte prijzen') + '</h2>' + (meta.length ? '<span class="kc-meta">' + meta.join(' &middot; ') + '</span>' : '') + '</div>';
    if (pr.hergebruikt) h += '<div class="note" style="margin:0 0 14px">' + ic('info') + '<span>Dit product is kort geleden al opgezocht; die prijzen zijn hergebruikt om kosten te besparen. Kies Opnieuw analyseren en zet hergebruiken uit voor verse prijzen.</span></div>';
    if (ond) h += '<div class="note" style="margin:0 0 14px">' + ic('alert') + '<span>Deze prijzen gelden voor één stuk, niet voor de hele partij.</span></div>';
    h += '<div class="prices-strip">';
    h += '<div class="ps"><div class="ps-l">Nieuwprijs</div><div class="ps-v">' + (pr.nieuwprijs ? fmt(pr.nieuwprijs) : '-') + '</div><div class="ps-s">' +
      (pr.nieuwprijs_url ? bronLink(pr.nieuwprijs_url, pr.nieuwprijs_bron || domeinVan(pr.nieuwprijs_url), pr.live ? pr.nieuwprijs_bevestigd : undefined) : esc(pr.nieuwprijs_bron || '')) + '</div></div>';
    if (mp) h += '<div class="ps"><div class="ps-l">' + (pr.voertuig ? 'Verkoop aan particulier' : 'Tweedehands (Marktplaats / 2dehands)') + '</div><div class="ps-v">' + fmt(mp.gemiddeld) + '</div><div class="ps-s">' + (d.controle ? 'Door jou gecontroleerd' : (mp.laag ? fmt(mp.laag) + ' tot ' + fmt(mp.hoog) : 'Verwachte verkoopprijs')) + '</div></div>';
    if (pr.handelaar) h += '<div class="ps"><div class="ps-l">Vraagprijs autobedrijven</div><div class="ps-v">' + fmt(pr.handelaar.laag) + (pr.handelaar.hoog > pr.handelaar.laag ? ' – ' + fmt(pr.handelaar.hoog) : '') + '</div><div class="ps-s">Incl. garantie en afleverkosten' + (pr.handelaar.aantal ? ' &middot; ' + pr.handelaar.aantal + ' gevonden' : '') + '</div></div>';
    if (eb) h += '<div class="ps"><div class="ps-l">eBay</div><div class="ps-v">' + fmt(eb.gemiddeld) + '</div><div class="ps-s">' + (eb.laag ? fmt(eb.laag) + ' tot ' + fmt(eb.hoog) : '') + '</div></div>';
    h += '</div>';
    if (pr.toelichting) h += '<div class="tip">' + esc(pr.toelichting) + '</div>';
    if (pr.voertuig) h += '<div class="note" style="margin:12px 0 0">' + ic('info') + '<span>Een autobedrijf vraagt meer omdat het garantie, aflevering en onderhoud meelevert. Verkoop je zelf aan een particulier, dan krijg je meestal 8 tot 15% minder dan de vraagprijs bij een autobedrijf. Verkoop je aan een handelaar of als inruil, dan nog minder. Het advies rekent met de verkoop aan een particulier.</span></div>';
    h += '<div class="help" style="margin-top:10px"><a href="https://veilinganalyser.nl/hoe-we-rekenen" target="_blank" rel="noopener">Zo rekent de app: wat wel en niet is meegerekend</a></div>';
    if (pr.tweedehands && pr.tweedehands.length) {
      h += '<h3 style="font-size:15px;margin:18px 0 6px">Gevonden advertenties</h3><table class="ctable adv"><tbody>';
      pr.tweedehands.forEach(function(x) {
        h += '<tr><td>' + bronLink(x.url, x.titel || x.platform || 'Advertentie', pr.live ? x.bevestigd : undefined) +
          '<small>' + esc([x.platform, x.soort === 'verkocht' ? 'verkocht' : 'vraagprijs', x.staat].filter(Boolean).join(' · ')) + '</small></td><td>' + fmt(x.prijs) + '</td></tr>';
      });
      h += '</tbody></table>';
      if (pr.mediaan_advertenties) h += '<div class="help">Mediaan van deze advertenties: ' + fmt(pr.mediaan_advertenties) + '. Vraagprijzen liggen meestal hoger dan wat er echt betaald wordt.</div>';
    }
    var zl = K.marktplaatsLinks(d.zoekterm || pr.productnaam || d.titel);
    if (zl) h += '<div class="zelf-kijken"><span>Zelf kijken:</span><a class="btn btn-secondary btn-sm" href="' + esc(zl.marktplaats) + '" target="_blank" rel="noopener">' + ic('external') + 'Marktplaats</a><a class="btn btn-secondary btn-sm" href="' + esc(zl.tweedehands) + '" target="_blank" rel="noopener">' + ic('external') + '2dehands</a></div>';
    h += '</div>';
    h += '<div class="pgrid">';
    if (mp) h += platformKaart(pr.voertuig ? 'Verkoop aan particulier' : 'Tweedehands NL/BE', mp, 'Zoekwoorden', mp.zoekwoorden, d.controle);
    if (eb) h += platformKaart('eBay', eb, 'Keywords', eb.keywords);
    h += '</div>';
    var punten = (pr.aandachtspunten || []).concat(pg.opmerkingen || []);
    if (punten.length) {
      h += '<div class="card"><div class="card-h"><h2>Let op</h2></div><ul class="attn">';
      punten.forEach(function(p) { h += '<li>' + esc(p) + '</li>'; });
      h += '</ul></div>';
    }
    if ((pr.bronnen && pr.bronnen.length) || (pr.zoekvragen && pr.zoekvragen.length)) {
      h += '<details class="faq" style="margin-top:16px"><summary>Geraadpleegde bronnen (' + (pr.bronnen || []).length + ')</summary><div class="fb">';
      if (pr.zoekvragen && pr.zoekvragen.length) h += '<p>Zoekopdrachten: ' + pr.zoekvragen.map(function(q) { return '&ldquo;' + esc(q) + '&rdquo;'; }).join(', ') + '</p>';
      if (pr.bronnen && pr.bronnen.length) {
        h += '<ul>';
        pr.bronnen.forEach(function(b) { h += '<li>' + bronLink(b.url, b.titel || domeinVan(b.url)) + (b.opgehaald ? ' <span class="opt">(pagina gelezen)</span>' : '') + '</li>'; });
        h += '</ul>';
      }
      h += '</div></details>';
    }
  }

  // Voertuiggegevens uit de RDW (open data)
  if (pg.rdw) {
    var rd = pg.rdw, rij = [];
    var rr = function(l, v) { if (v) rij.push('<tr><td>' + l + '</td><td>' + esc(String(v)) + '</td></tr>'); };
    rr('Kenteken', rd.kenteken); rr('Merk en model', [rd.merk, rd.model && rd.model.toUpperCase().indexOf((rd.merk || '').toUpperCase()) === 0 ? rd.model.slice((rd.merk || '').length).trim() : rd.model].filter(Boolean).join(' '));
    rr('Aandrijving', rd.aandrijving); rr('Carrosserie', rd.inrichting); rr('Kleur', rd.kleur && rd.kleur.charAt(0) + rd.kleur.slice(1).toLowerCase());
    rr('Eerste toelating', rd.eerste_toelating && new Date(rd.eerste_toelating).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }));
    rr('Catalogusprijs (nieuw)', rd.catalogusprijs && fmt(rd.catalogusprijs));
    rr('Kilometerstand (veiling)', pg.kilometerstand && pg.kilometerstand.toLocaleString('nl-NL') + ' km');
    rr('Oordeel tellerstand', rd.tellerstand && rd.tellerstand + (rd.tellerstand_jaar ? ' (laatst geregistreerd ' + rd.tellerstand_jaar + ')' : ''));
    rr('APK geldig tot', rd.apk_tot && new Date(rd.apk_tot).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }));
    h += '<div class="card"><div class="card-h"><h2>Voertuig volgens de RDW</h2><span class="kc-meta">open data RDW</span></div><table class="ctable"><tbody>' + rij.join('') + '</tbody></table>' +
      '<div class="note">' + ic('info') + '<span>Dit komt uit het kentekenregister. Schade, onderhoud en de echte staat staan daar niet in: kijk dat zelf na of vraag het de veiling.</span></div></div>';
  }

  // Wat de app op de foto's zag, met de grens daarvan
  if (pg.foto) {
    h += '<div class="card"><div class="card-h"><h2>Gezien op je foto\'s</h2><span class="kc-meta">' + pg.foto.aantal + (pg.foto.aantal === 1 ? ' foto' : ' foto\'s') + '</span></div>';
    if (pg.foto.herkend) h += '<p style="margin:0 0 8px">' + esc(pg.foto.herkend) + '</p>';
    h += pg.foto.gebreken && pg.foto.gebreken.length
      ? '<ul class="attn">' + pg.foto.gebreken.map(function(g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>'
      : '<p class="help" style="margin:0 0 8px">Geen duidelijke gebreken gezien.</p>';
    h += '<div class="note">' + ic('alert') + '<span>' + FOTO_GRENS + '</span></div></div>';
  }
  if (idx >= 0 && serverModus() && account) h += '<div class="feedback-rij"><button type="button" class="linkje" onclick="vraagFeedback(' + idx + ')">' + ic('flag') + 'Klopt er iets niet aan deze analyse?</button></div>';

  var box = document.getElementById('analyse-result');
  box.innerHTML = h;
  setFase('resultaat');
  if (!behoudScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      box.querySelectorAll('.meter > i').forEach(function(i) { i.style.width = i.getAttribute('data-w') + '%'; });
    });
  });
}

// ── 6. Overzicht ────────────────────────────────────────────────────────────
function setFilter(f) { actieveFilter = f; renderOverzicht(); }
function setZoek(v) { zoekTerm = v.trim().toLowerCase(); renderOverzicht(); }
function setSorteer(v) { sorteerOp = v; try { localStorage.setItem('va_sorteer', v); } catch (e) {} renderOverzicht(); }

function adviesVolgorde(k) { return k.advies === 'kopen' ? 0 : k.advies === 'twijfel' ? 1 : k.advies === 'skip' ? 2 : 3; }
function sorteerKavels(lijst) {
  var l = lijst.slice();
  if (sorteerOp === 'advies') l.sort(function(a, b) { return adviesVolgorde(a) - adviesVolgorde(b) || (b.toegevoegd || 0) - (a.toegevoegd || 0); });
  else if (sorteerOp === 'marge') l.sort(function(a, b) {
    var ma = a.kosten && a.kosten.marge != null ? a.kosten.marge : -Infinity;
    var mb = b.kosten && b.kosten.marge != null ? b.kosten.marge : -Infinity;
    return mb - ma;
  });
  else if (sorteerOp === 'sluit' || sorteerOp === 'veiling') l.sort(function(a, b) {
    var ta = sluitMs(a), tb = sluitMs(b), nu = Date.now();
    var va = ta && ta > nu ? ta : Infinity, vb = tb && tb > nu ? tb : Infinity;
    return va - vb || (b.toegevoegd || 0) - (a.toegevoegd || 0);
  });
  else if (sorteerOp === 'prijs') l.sort(function(a, b) {
    var pa = a.huidig_bod != null ? a.huidig_bod : Infinity;
    var pb = b.huidig_bod != null ? b.huidig_bod : Infinity;
    return pa - pb;
  });
  else l.sort(function(a, b) { return (b.toegevoegd || 0) - (a.toegevoegd || 0); });
  return l;
}

function thumbHtml(k) {
  if (k.thumb && /^data:image\//.test(k.thumb)) return '<img src="' + esc(k.thumb) + '" alt="">';
  var v = veilingVan(k);
  return esc(v === 'Onbekend' ? '?' : v.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase());
}

function maakKavelKaart(k, i, opts) {
  opts = opts || {};
  var echteIdx = kavels.indexOf(k);
  var ond = !opts.gewonnen && partijOnbetrouwbaar(k);
  var a = ond ? { key: 'wacht', label: 'Controle nodig' } : adviesInfo(k.advies);
  var mp = k.prijzen && k.prijzen.marktplaats;
  var url = veiligeUrl(k.url);
  var card = document.createElement('article');
  card.className = 'kavel-row' + (!opts.gewonnen && geselecteerd.has(i) ? ' geselecteerd' : '');

  var h = '<div class="kc-top">';
  if (!opts.gewonnen) h += '<div class="selectie-col"><input type="checkbox" class="kavel-checkbox" aria-label="Selecteer kavel"' + (geselecteerd.has(i) ? ' checked' : '') + '></div>';
  h += '<div class="kc-thumb">' + thumbHtml(k) + '</div><div class="kc-head"><div class="kc-title">' + esc(k.titel || 'Onbekend') + '</div>';
  h += '<div class="kc-meta">' + esc(veilingVan(k)) + (k.kavelnummer ? ' &middot; Kavel ' + esc(k.kavelnummer) : '');
  var kSluit = sluitMs(k);
  if (!opts.gewonnen && kSluit) h += ' &middot; <span class="kc-sluit' + (kSluit > Date.now() && kSluit - Date.now() < 3 * 3600000 ? ' bijna' : '') + '">' + ic('clock') + (kSluit > Date.now() ? 'Sluit ' : '') + esc(sluitRelatief(kSluit)) + '</span>';
  if (opts.gewonnen) h += ' &middot; Gewonnen op ' + (k.gewonnen_op ? new Date(k.gewonnen_op).toLocaleDateString('nl-NL') : '-');
  if (url) h += ' &middot; <a href="' + esc(url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Bekijk kavel</a>';
  h += '</div>';
  if (k.eigen_bod) h += '<span class="kc-tag">Mijn bod</span>';
  h += '</div>';
  if (!opts.gewonnen) h += '<span class="pill pill-' + a.key + '">' + a.label + '</span>';
  h += '</div>';

  h += '<div class="kc-figs">';
  if (opts.gewonnen) {
    var verkocht = typeof k.verkocht_voor === 'number';
    h += '<div><div class="fig-l">Totaal betaald</div><div class="fig-v">' + fmt(betaaldVan(k)) + '</div></div>';
    h += '<div><div class="fig-l">' + (verkocht ? 'Verkocht voor' : 'Verwachte verkoop') + '</div><div class="fig-v">' + (verkocht ? fmt(k.verkocht_voor) : fmt(verkoopprijsVan(k))) + '</div></div>';
    var w = winstVan(k);
    h += '<div><div class="fig-l">Winst</div><div class="fig-v' + (w > 0 ? ' verkocht' : '') + '">' + (w != null ? fmtS(w) : 'Nog niet verkocht') + '</div></div>';
  } else {
    h += '<div><div class="fig-l">' + (k.eigen_bod ? 'Mijn bod' : 'Huidig bod') + '</div><div class="fig-v">' + (k.huidig_bod ? fmt(k.huidig_bod) : '-') + '</div></div>';
    h += '<div><div class="fig-l">Totale kosten</div><div class="fig-v">' + (k.kosten ? fmt(k.kosten.totaal) : '-') + '</div></div>';
    h += '<div><div class="fig-l">Bied maximaal</div><div class="fig-v">' + (ond || k.maxBod == null ? '-' : k.maxBod > 0 ? fmt(k.maxBod) : 'Niet') + '</div></div>';
  }
  h += '</div>';

  if (ond) {
    h += '<div class="kc-result"><span class="kc-meta">Partij van meerdere stuks: controleer eerst de opbrengst per stuk.</span></div>';
  } else if (k.kosten && k.kosten.marge != null) {
    var pct = k.mp_gemiddeld ? Math.round(k.kosten.marge / k.mp_gemiddeld * 100) : null;
    var c = mp ? vertrouwenInfo(mp.vertrouwen) : null;
    h += '<div class="kc-result"><span class="marge ' + (k.kosten.marge > 0 ? 'pos' : k.kosten.marge < 0 ? 'neg' : '') + '">' + fmtS(k.kosten.marge) + ' marge' + (pct != null ? ' &middot; ' + pct + '%' : '') + '</span>';
    if (k.controle) h += '<span class="conf pos"><i></i>Prijs gecontroleerd</span>';
    else if (c) h += '<span class="conf ' + c.cls + '"><i></i>Betrouwbaarheid ' + c.label.toLowerCase() + '</span>';
    h += '</div>';
  } else if (!opts.gewonnen && k.maxBod) {
    h += '<div class="kc-result"><span class="kc-meta">Nog geen bod bekend</span></div>';
  }
  if (!opts.gewonnen && k.adviesReden && !ond) h += '<div class="kc-reden">' + esc(k.adviesReden) + '</div>';

  h += '<div class="kc-actions"></div>';
  card.innerHTML = h;

  var acties = card.querySelector('.kc-actions');
  function knop(cls, html, label, fn) {
    var b = document.createElement('button');
    b.className = cls; b.innerHTML = html;
    if (label) b.setAttribute('aria-label', label);
    b.onclick = function(e) { e.stopPropagation(); fn(); };
    acties.appendChild(b);
  }
  knop('btn btn-secondary btn-sm', 'Details', null, function() { openDetail(echteIdx); });
  if (opts.gewonnen) {
    knop('btn btn-secondary btn-sm', ic('euro') + (typeof k.verkocht_voor === 'number' ? 'Verkoop' : 'Verkocht'), 'Verkoop vastleggen', function() { legVerkoopVast(echteIdx); });
    knop('btn btn-ghost btn-sm', ic('undo') + 'Herstel', 'Terug naar overzicht', function() { herstelUitGewonnen(echteIdx); });
    knop('btn btn-ghost btn-sm btn-icon btn-del', ic('trash'), 'Verwijderen', function() {
      bevestig('Kavel definitief verwijderen?', 'Dit verwijdert "' + (k.titel || 'dit kavel') + '" ook uit je gewonnen kavels.', 'Verwijderen', true, function() { verwijderKavel(echteIdx); });
    });
  } else {
    knop('btn btn-ghost btn-sm', ic('trophy') + 'Gewonnen', null, function() { markeerGewonnen(echteIdx); });
    knop('btn btn-ghost btn-sm', ic('tag') + 'Bod', 'Bod wijzigen', function() { wijzigBod(echteIdx); });
    knop('btn btn-ghost btn-sm', ic('folder') + 'Groep', 'Groep kiezen', function() { kiesGroep(echteIdx); });
    knop('btn btn-ghost btn-sm btn-icon btn-del', ic('trash'), 'Verwijderen', function() { verwijderKavel(echteIdx); });
    card.onclick = function() { if (selectieModus) selecteerRij(i); };
    var cb = card.querySelector('.kavel-checkbox');
    cb.onclick = function(e) { e.stopPropagation(); };
    cb.onchange = function() { selecteerRij(i); };
  }
  return card;
}

function renderOverzicht() {
  var leeg = document.getElementById('ov-leeg');
  var inhoud = document.getElementById('ov-inhoud');
  var sorteerSel = document.getElementById('sorteer'); if (sorteerSel && sorteerSel.value !== sorteerOp) sorteerSel.value = sorteerOp;
  document.getElementById('selecteer-btn').style.display = kavels.length === 0 ? 'none' : '';
  document.getElementById('export-btn').style.display = kavels.length === 0 ? 'none' : '';
  if (kavels.length === 0) { leeg.style.display = 'block'; inhoud.style.display = 'none'; return; }
  leeg.style.display = 'none'; inhoud.style.display = 'block';

  var actieveKavels = kavels.filter(function(k) { return k.status !== 'gewonnen'; });
  var nWacht = actieveKavels.filter(function(k) { return !k.advies || k.status === 'wacht'; }).length;
  var nKopen = actieveKavels.filter(function(k) { return k.advies === 'kopen'; }).length;
  var nTwij = actieveKavels.filter(function(k) { return k.advies === 'twijfel'; }).length;
  var nSkip = actieveKavels.filter(function(k) { return k.advies === 'skip'; }).length;
  var nEigen = actieveKavels.filter(function(k) { return k.eigen_bod === true; }).length;
  var nGew = kavels.length - actieveKavels.length;

  var gefilterd = actieveKavels.filter(function(k) {
    if (actieveFilter === 'alles') return true;
    if (actieveFilter === 'wacht') return !k.advies || k.status === 'wacht';
    if (actieveFilter === 'eigen') return k.eigen_bod === true;
    return k.advies === actieveFilter;
  }).filter(function(k) {
    return !zoekTerm || (k.titel || '').toLowerCase().indexOf(zoekTerm) !== -1;
  });
  gefilterd = sorteerKavels(gefilterd);
  var groepen = sorteerOp === 'veiling' ? groepeerKavels(gefilterd) : null;
  if (groepen) gefilterd = groepen.reduce(function(l, g) { return l.concat(g.kavels); }, []);
  huidigGefilterd = gefilterd;

  // Selectie ongeldig als de lijst veranderd is
  var sig = gefilterd.map(function(k) { return k.id; }).join(',');
  if (sig !== vorigeLijstSig) { geselecteerd.clear(); vorigeLijstSig = sig; }
  document.getElementById('sel-aantal').textContent = geselecteerd.size + ' geselecteerd';

  document.getElementById('stats-row').innerHTML =
    '<div class="stat"><div class="stat-lbl">Totaal aantal kavels</div><div class="stat-num">' + actieveKavels.length + '</div></div>' +
    '<div class="stat"><div class="stat-lbl">Nog te analyseren</div><div class="stat-num">' + nWacht + '</div></div>' +
    '<div class="stat"><div class="stat-lbl">Aanraders</div><div class="stat-num pos">' + nKopen + '</div></div>' +
    '<div class="stat"><div class="stat-lbl">Gewonnen kavels</div><div class="stat-num">' + nGew + '</div></div>';

  var chipDefs = [['alles', 'Alles', actieveKavels.length], ['kopen', 'Aanraders', nKopen], ['twijfel', 'Twijfel', nTwij], ['skip', 'Skip', nSkip], ['wacht', 'Niet geanalyseerd', nWacht], ['eigen', 'Mijn kavels', nEigen]];
  var chips = document.getElementById('chips');
  chips.innerHTML = '';
  chipDefs.forEach(function(c) {
    var b = document.createElement('button');
    b.className = 'chip' + (actieveFilter === c[0] ? ' active' : '');
    b.innerHTML = c[1] + ' <span class="n">' + c[2] + '</span>';
    b.onclick = function() { setFilter(c[0]); };
    chips.appendChild(b);
  });

  var list = document.getElementById('kavel-list');
  list.innerHTML = '';
  list.classList.toggle('selectie-modus', selectieModus);

  if (gefilterd.length === 0) {
    var msg = document.createElement('div');
    msg.style.gridColumn = '1 / -1';
    if (actieveKavels.length === 0) {
      msg.innerHTML = '<div class="empty small"><div class="empty-ico">' + ic('trophy') + '</div><h3>Al je kavels staan bij Gewonnen</h3><p>Er zijn geen kavels meer om op te bieden. Voeg een nieuw kavel toe om verder te gaan.</p><div class="btns"><button class="btn btn-primary" onclick="nieuwKavel()">' + ic('plus') + 'Kavel toevoegen</button></div></div>';
    } else {
      msg.innerHTML = '<div class="empty small"><div class="empty-ico">' + ic('search') + '</div><h3>Geen kavels gevonden</h3><p>Er zijn geen kavels die bij deze filter of zoekopdracht passen.</p><div class="btns"><button class="btn btn-secondary" id="reset-filters">Filters wissen</button></div></div>';
    }
    list.appendChild(msg);
    var rb = document.getElementById('reset-filters');
    if (rb) rb.onclick = function() {
      actieveFilter = 'alles'; zoekTerm = ''; document.getElementById('zoek').value = ''; renderOverzicht();
    };
    return;
  }

  if (groepen) {
    var i = 0;
    groepen.forEach(function(g) {
      var kop = document.createElement('div');
      kop.style.gridColumn = '1 / -1';
      kop.innerHTML = groepKopHtml(g);
      list.appendChild(kop);
      g.kavels.forEach(function(k) { list.appendChild(maakKavelKaart(k, i++)); });
    });
    return;
  }
  gefilterd.forEach(function(k, i) { list.appendChild(maakKavelKaart(k, i)); });
}

function openDetail(idx) {
  var k = kavels[idx];
  switchTab('analyse');
  if (k.prijzen) toonAnalyseResultaat(k);
  else heranalyseer(idx);
}

// Bod aanpassen zonder nieuwe analyse: alles wordt lokaal doorgerekend, kost niets
function wijzigBod(idx) {
  var k = kavels[idx]; if (!k) return;
  var h = '<p class="help" style="margin:0 0 12px">Het bod is gestegen of je wilt een ander bedrag doorrekenen? Kosten, marge en advies worden direct herberekend met de prijzen die er al zijn. Dit kost geen API-tegoed.</p>' +
    '<div class="seg" role="group" aria-label="Soort bod"><button type="button" id="wb-ander" class="' + (k.eigen_bod ? '' : 'active') + '" onclick="wbType(false)">Huidig bod</button><button type="button" id="wb-eigen" class="' + (k.eigen_bod ? 'active' : '') + '" onclick="wbType(true)">Mijn bod</button></div>' +
    '<div class="money"><span>&euro;</span><input class="input" id="wb-bod" type="text" inputmode="decimal" value="' + (k.huidig_bod ? bedragTxt(k.huidig_bod) : '') + '" aria-label="Bod in euro"></div>' +
    (k.maxBod != null ? '<div class="help">Maximaal bod voor ' + pctTxt(doelPct()) + '% marge: <strong>' + (k.maxBod > 0 ? fmt(k.maxBod) : 'niet rendabel') + '</strong></div>' : '') +
    '<div class="msg err" id="wb-err" role="alert"></div>';
  openModal('Bod wijzigen', h, [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: 'Herberekenen', cls: 'btn-primary', keepOpen: true, fn: function() { wbOpslaan(idx); } }
  ]);
}
function wbType(eigen) {
  document.getElementById('wb-eigen').classList.toggle('active', eigen);
  document.getElementById('wb-ander').classList.toggle('active', !eigen);
}
function wbOpslaan(idx) {
  var k = kavels[idx]; if (!k) { closeModal(); return; }
  var v = document.getElementById('wb-bod').value.trim();
  var bod = v ? (/^[\d.,\s\u20ac]+$/.test(v) ? parseBedrag(v) : NaN) : null;
  if (bod !== null && (!isFinite(bod) || bod <= 0)) { toonMsg('wb-err', 'Voer een geldig bedrag in, bijvoorbeeld 250, of laat het leeg.'); return; }
  k.huidig_bod = bod;
  k.eigen_bod = document.getElementById('wb-eigen').classList.contains('active');
  k.bod_van_pagina = false;
  if (!bod) k.kosten = null;
  herberekenKosten(k);
  closeModal();
  slaKavelsOp(); renderOverzicht();
  if (huidigeTab === 'analyse') toonAnalyseResultaat(k, true);
  toast('Bod bijgewerkt: ' + adviesInfo(k.advies).label);
}

function heranalyseer(idx) {
  var k = kavels[idx];
  switchTab('analyse');
  resetFormulier();
  document.getElementById('kavel-url').value = k.url || '';
  if (k.huidig_bod) document.getElementById('huidig-bod').value = String(k.huidig_bod);
  var type = k.eigen_bod ? 'eigen' : 'ander';
  setBodType(type, document.getElementById('bod-' + type));
  zetTariefFormulier(k);
  setFase('invoer');
}

function verwijderKavel(idx) {
  var k = kavels[idx];
  kavels.splice(idx, 1);
  slaKavelsOp(); updateBadge(); renderOverzicht(); renderGewonnen();
  toast('Kavel verwijderd', { label: 'Ongedaan maken', fn: function() {
    kavels.splice(Math.min(idx, kavels.length), 0, k);
    slaKavelsOp(); updateBadge(); renderOverzicht(); renderGewonnen();
  } });
}

function markeerGewonnen(idx, naKlaar) {
  var k = kavels[idx];
  bevestig('Markeren als gewonnen?', '"' + (k.titel || 'Dit kavel') + '" verdwijnt uit het overzicht en staat daarna bij Gewonnen.', 'Markeer als gewonnen', false, function() {
    k.status = 'gewonnen';
    k.gewonnen_op = Date.now();
    slaKavelsOp(); updateBadge(); renderOverzicht();
    toast('Verplaatst naar Gewonnen');
    if (naKlaar) naKlaar();
  });
}

function herstelUitGewonnen(idx) {
  var k = kavels[idx];
  k.status = k.advies === 'kopen' ? 'klaar' : (k.advies === 'skip' ? 'skip' : 'klaar');
  delete k.gewonnen_op;
  slaKavelsOp(); updateBadge(); renderGewonnen();
}

// ── 7. Gewonnen ─────────────────────────────────────────────────────────────
function renderGewonnen() {
  var gewonnenKavels = kavels.filter(function(k) { return k.status === 'gewonnen'; });
  var leeg = document.getElementById('gew-leeg');
  var inhoud = document.getElementById('gew-inhoud');

  if (gewonnenKavels.length === 0) {
    leeg.style.display = 'block'; inhoud.style.display = 'none'; return;
  }
  leeg.style.display = 'none'; inhoud.style.display = 'block';

  var list = document.getElementById('gewonnen-list');
  list.innerHTML = '';
  gewonnenKavels.sort(function(a, b) { return (b.gewonnen_op || 0) - (a.gewonnen_op || 0); });
  renderWinstStrip(gewonnenKavels);
  gewonnenKavels.forEach(function(k, i) { list.appendChild(maakKavelKaart(k, i, { gewonnen: true })); });
}

// ── 8. Selectie ─────────────────────────────────────────────────────────────
function toggleSelectie() {
  selectieModus = !selectieModus;
  geselecteerd.clear();
  document.getElementById('sel-balk').style.display = selectieModus ? 'flex' : 'none';
  document.getElementById('selecteer-lbl').textContent = selectieModus ? 'Annuleren' : 'Selecteren';
  document.getElementById('selecteer-btn').setAttribute('aria-pressed', selectieModus ? 'true' : 'false');
  renderOverzicht();
}


function selecteerRij(i) {
  if (geselecteerd.has(i)) geselecteerd.delete(i); else geselecteerd.add(i);
  document.getElementById('sel-aantal').textContent = geselecteerd.size + ' geselecteerd';
  var rijen = document.querySelectorAll('#kavel-list .kavel-row');
  if (rijen[i]) rijen[i].classList.toggle('geselecteerd', geselecteerd.has(i));
  var cbs = document.querySelectorAll('#kavel-list .kavel-checkbox');
  if (cbs[i]) cbs[i].checked = geselecteerd.has(i);
}

function allesAanvinken() {
  document.querySelectorAll('#kavel-list .kavel-row').forEach(function(r, i) { r.classList.add('geselecteerd'); geselecteerd.add(i); });
  document.querySelectorAll('#kavel-list .kavel-checkbox').forEach(function(cb) { cb.checked = true; });
  document.getElementById('sel-aantal').textContent = geselecteerd.size + ' geselecteerd';
}

function allesUitvinken() {
  geselecteerd.clear();
  document.querySelectorAll('#kavel-list .kavel-row').forEach(function(r) { r.classList.remove('geselecteerd'); });
  document.querySelectorAll('#kavel-list .kavel-checkbox').forEach(function(cb) { cb.checked = false; });
  document.getElementById('sel-aantal').textContent = '0 geselecteerd';
}

function verwijderSelectie() {
  if (geselecteerd.size === 0) { toast('Vink eerst kavels aan om te verwijderen.', null, true); return; }
  var n = geselecteerd.size;
  bevestig(n + ' kavel(s) verwijderen?', 'Dit kan niet ongedaan worden gemaakt.', 'Verwijderen', true, function() {
    var teVerwijderen = new Set(Array.from(geselecteerd).map(function(i) { return huidigGefilterd[i]; }).filter(Boolean));
    kavels = kavels.filter(function(k) { return !teVerwijderen.has(k); });
    geselecteerd.clear();
    selectieModus = false;
    document.getElementById('sel-balk').style.display = 'none';
    document.getElementById('selecteer-lbl').textContent = 'Selecteren';
    document.getElementById('selecteer-btn').setAttribute('aria-pressed', 'false');
    slaKavelsOp(); updateBadge(); renderOverzicht();
    toast(n + ' kavel(s) verwijderd');
  });
}

function updateBadge() {
  var actief = kavels.filter(function(k) { return k.status !== 'gewonnen'; }).length;
  var gewonnen = kavels.filter(function(k) { return k.status === 'gewonnen'; }).length;
  document.querySelectorAll('.js-badge').forEach(function(e) { e.textContent = actief; });
  document.querySelectorAll('.js-badge-gewonnen').forEach(function(e) { e.textContent = gewonnen; });
}

