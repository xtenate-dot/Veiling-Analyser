/**
 * app.js
 * Startpunt van de applicatie: koppelt alle event listeners en initialiseert
 * de modules bij het laden van de pagina. Bevat geen business-logica zelf —
 * dat hoort in de andere modules.
 */
(function (App) {
  'use strict';

  var h = App.helpers;

  // ── API-key balk ─────────────────────────────────────────────────────────
  function checkApiKey() {
    var k = App.api.getApiKey();
    h.byId('apikey-bar').style.display = k ? 'none' : 'flex';
    h.byId('apikey-ok').style.display = k ? 'flex' : 'none';
  }
  function slaApiKeyOp() {
    var k = h.byId('apikey-input').value.trim();
    if (k.indexOf('sk-ant-') !== 0) { App.ui.showError('Dit lijkt geen geldige Anthropic API key (moet beginnen met sk-ant-).'); return; }
    App.api.setApiKey(k);
    h.byId('apikey-input').value = '';
    checkApiKey();
  }
  function resetApiKey() { App.api.clearApiKey(); checkApiKey(); }

  // ── Google Sheets ────────────────────────────────────────────────────────
  function setSheetsUrl() {
    var url = prompt('Plak je Google Apps Script Web App URL (eindigt op /exec):', App.state.sheetsUrl);
    if (url) {
      App.sheets.setUrl(url.trim());
      App.sheets.syncVanSheets();
    }
  }

  // ── PWA install prompt ───────────────────────────────────────────────────
  var uitgesteldInstallEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    uitgesteldInstallEvent = e;
    var btn = h.byId('install-btn');
    if (btn) btn.style.display = 'inline-flex';
  });
  function installeerApp() {
    if (!uitgesteldInstallEvent) return;
    uitgesteldInstallEvent.prompt();
    uitgesteldInstallEvent.userChoice.finally(function () {
      uitgesteldInstallEvent = null;
      var btn = h.byId('install-btn');
      if (btn) btn.style.display = 'none';
    });
  }

  // ── Event wiring ─────────────────────────────────────────────────────────
  function koppelEvents() {
    h.byId('apikey-save-btn').addEventListener('click', slaApiKeyOp);
    h.byId('apikey-reset-link').addEventListener('click', function (e) { e.preventDefault(); resetApiKey(); });

    h.byId('sync-btn').addEventListener('click', setSheetsUrl);
    var installBtn = h.byId('install-btn');
    if (installBtn) installBtn.addEventListener('click', installeerApp);
    h.byId('selecteer-btn').addEventListener('click', App.ui.toggleSelectie);
    h.byId('add-kavel-btn').addEventListener('click', function () { App.ui.switchTab('analyse'); });

    h.byId('sel-del-btn').addEventListener('click', App.ui.verwijderSelectie);
    h.byId('sel-alles-btn').addEventListener('click', App.ui.allesAanvinken);
    h.byId('sel-geen-btn').addEventListener('click', App.ui.allesUitvinken);
    h.byId('sel-annuleer-btn').addEventListener('click', App.ui.toggleSelectie);

    h.qsa('.tab').forEach(function (tab, i) {
      var namen = ['overzicht', 'analyse', 'gewonnen', 'handleiding'];
      tab.addEventListener('click', function () { App.ui.switchTab(namen[i]); });
    });

    h.qsa('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { App.ui.setFilter(btn.dataset.filter, btn); });
    });
    var zoekInput = h.byId('kavel-zoeken');
    if (zoekInput) zoekInput.addEventListener('input', h.debounce(function (e) { App.ui.setZoekterm(e.target.value); }, 200));
    var sortSelect = h.byId('kavel-sorteren');
    if (sortSelect) sortSelect.addEventListener('change', function (e) { App.ui.setSortering(e.target.value); });

    h.byId('overzicht-toevoegen-btn').addEventListener('click', function () { App.ui.switchTab('analyse'); });

    // Analyseformulier
    h.byId('kavel-url').addEventListener('input', App.analyse.opUrlChange);
    h.byId('kavel-url').addEventListener('blur', App.analyse.opUrlBlur);
    h.byId('veilinghuis-select').addEventListener('change', App.analyse.opVeilinghuisChange);
    h.byId('bod-ander').addEventListener('click', function () { App.analyse.setBodType('ander', h.byId('bod-ander')); });
    h.byId('bod-eigen').addEventListener('click', function () { App.analyse.setBodType('eigen', h.byId('bod-eigen')); });
    h.byId('analyse-btn').addEventListener('click', App.analyse.analyseer);

    var zone = h.byId('upload-zone');
    h.byId('foto-input').addEventListener('change', function (e) { App.analyse.leesFiles(e.target.files); e.target.value = ''; });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('drag'); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('drag'); App.analyse.leesFiles(e.dataTransfer.files); });

    // Veilinghuizen-modal
    h.byId('veilinghuizen-btn').addEventListener('click', App.ui.openVeilinghuizenModal);
    h.byId('vh-modal-close').addEventListener('click', App.ui.closeVeilinghuizenModal);
    h.byId('vh-opslaan-btn').addEventListener('click', App.ui.opslaanVeilinghuis);
    h.byId('vh-annuleer-btn').addEventListener('click', App.ui.resetVeilinghuisForm);

    // Export / import
    var exportJsonBtn = h.byId('export-json-btn');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', App.exportImport.exportJSON);
    var exportCsvBtn = h.byId('export-csv-btn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', App.exportImport.exportCSV);
    var exportExcelBtn = h.byId('export-excel-btn');
    if (exportExcelBtn) exportExcelBtn.addEventListener('click', App.exportImport.exportExcel);
    var importInput = h.byId('import-input');
    if (importInput) importInput.addEventListener('change', function (e) {
      if (e.target.files[0]) App.exportImport.importFile(e.target.files[0]);
      e.target.value = '';
    });
  }

  // ── Service worker (PWA) ────────────────────────────────────────────────
  function registreerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // file:// heeft geen service worker support; alleen registreren via http(s).
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        App.logger.warn('Service worker registratie mislukt:', e.message);
      });
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    checkApiKey();
    App.stateActions.laadKavels();
    App.veilinghuizen.laad();
    App.sheets.laadUrl();
    App.ui.vulVeilinghuisSelect();
    App.ui.updateBadge();
    App.ui.updateSyncStatus();
    App.ui.renderOverzicht();
    koppelEvents();
    registreerServiceWorker();
    if (App.state.sheetsUrl) App.sheets.syncVanSheets();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.App = window.App || {});
