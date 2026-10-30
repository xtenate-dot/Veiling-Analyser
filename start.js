// ═══ Veiling Analyser – opstarten ═══════════════════════════════════════════
// ── 9. Start ────────────────────────────────────────────────────────────────
var zone = document.getElementById('upload-zone');
document.getElementById('foto-input').addEventListener('change', function(e) { leesFiles(e.target.files); e.target.value = ''; });
zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag'); });
zone.addEventListener('dragleave', function() { zone.classList.remove('drag'); });
zone.addEventListener('drop', function(e) { e.preventDefault(); zone.classList.remove('drag'); leesFiles(e.dataTransfer.files); });

hydrateIcons();
themaLabels();
document.body.classList.toggle('modus-server', serverModus());
checkApiKey();
laadKavels();
updateBadge();
setSyncStatus('ok');
setStap(1);
setFase('invoer');
renderOverzicht();
renderHome();
vulVeilingKeuze(); syncVeilingVelden();
if (!serverModus() && SHEETS_URL) { syncVanSheets(); }
werkAccountBij();
var bh = document.getElementById('bladwijzer'); if (bh) bh.innerHTML = bladwijzerHtml();
(async function() {
  var p = new URLSearchParams(location.search);
  var gedeeld = linkUitParameters();
  if (p.get('betaald') || p.get('herstel') || gedeeld) history.replaceState(null, '', location.pathname);
  if (serverModus()) {
    await laadServerInfo();
    await laadAccount();
    if (account) await haalKavelsVanServer();
    if (p.get('betaald') === '1') { toast('Bedankt! Je abonnement is actief.'); setTimeout(laadAccount, 2500); }
    if (p.get('betaald') === 'bundel') { toast('Bedankt! Je bundel wordt bijgeschreven.'); setTimeout(laadAccount, 2500); }
    if (p.get('betaald') === '0') toast('Betaling geannuleerd. Er is niets afgeschreven.');
    if (p.get('herstel')) vraagNieuwWachtwoord(p.get('herstel'));
  }
  openKavelUitHash();
  if (gedeeld) {
    nieuwKavel();
    document.getElementById('kavel-url').value = gedeeld;
    syncVeilingVelden();
    toast('Link ontvangen. Controleer het bod en kies Analyseer kavel.');
  }
})();
setTimeout(function() { controleerTarieven(false); }, 600);
// Een melding opent de app op /app#kavel-<id>: dan meteen dat kavel tonen
function openKavelUitHash() {
  var m = /^#kavel-(.+)$/.exec(location.hash || '');
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  var id = decodeURIComponent(m[1]);
  var idx = kavels.findIndex(function(k) { return String(k.id) === id; });
  if (idx >= 0) openDetail(idx);
}
window.addEventListener('hashchange', openKavelUitHash);

// Service worker: app opent ook zonder internet en is installeerbaar
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function(e) { console.warn('Service worker niet geregistreerd', e); });
}
