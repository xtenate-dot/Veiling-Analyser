/**
 * sheets.js
 * Synchronisatie met een Google Apps Script Web App (optioneel).
 * Verbeteringen t.o.v. de vorige versie: zichtbare sync-status, laatste
 * sync-tijdstip, en één automatische herhaling bij een netwerkfout.
 */
(function (App) {
  'use strict';

  function laadUrl() {
    App.state.sheetsUrl = App.storage.getRaw(App.storage.KEYS.sheetsUrl, '');
    App.state.lastSync = App.storage.get(App.storage.KEYS.lastSync, null);
  }

  function setUrl(url) {
    App.state.sheetsUrl = url;
    App.storage.setRaw(App.storage.KEYS.sheetsUrl, url);
  }

  async function fetchMetTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 15000);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  async function syncNaarSheets(pogingen) {
    if (!App.state.sheetsUrl) return;
    pogingen = pogingen == null ? 1 : pogingen;
    App.state.syncBezig = true;
    App.ui && App.ui.updateSyncStatus && App.ui.updateSyncStatus();
    try {
      var resp = await fetchMetTimeout(App.state.sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ actie: 'opslaan', kavels: App.state.kavels })
      });
      await resp.json().catch(function () { return null; });
      App.state.lastSync = Date.now();
      App.storage.set(App.storage.KEYS.lastSync, App.state.lastSync);
    } catch (e) {
      App.logger.warn('Sync naar Sheets mislukt:', e.message);
      if (pogingen < 2) {
        await new Promise(function (r) { setTimeout(r, 1000); });
        return syncNaarSheets(pogingen + 1);
      }
      App.ui && App.ui.showError && App.ui.showError('Synchroniseren met Google Sheets is niet gelukt. Je wijzigingen blijven lokaal bewaard.');
    } finally {
      App.state.syncBezig = false;
      App.ui && App.ui.updateSyncStatus && App.ui.updateSyncStatus();
    }
  }

  async function syncVanSheets() {
    if (!App.state.sheetsUrl) return;
    App.state.syncBezig = true;
    App.ui && App.ui.updateSyncStatus && App.ui.updateSyncStatus();
    try {
      var resp = await fetchMetTimeout(App.state.sheetsUrl, {}, 15000);
      var data = await resp.json();
      if (data && data.kavels) {
        App.state.kavels = data.kavels.map(function (k) {
          try { if (typeof k.kosten === 'string' && k.kosten) k.kosten = JSON.parse(k.kosten); } catch (e) { /* laat staan */ }
          try { if (typeof k.prijzen === 'string' && k.prijzen) k.prijzen = JSON.parse(k.prijzen); } catch (e) { /* laat staan */ }
          k.eigen_bod = k.eigen_bod === true || k.eigen_bod === 'true' || k.eigen_bod === 'TRUE';
          return k;
        });
        App.storage.set(App.storage.KEYS.kavels, App.state.kavels);
        App.state.lastSync = Date.now();
        App.storage.set(App.storage.KEYS.lastSync, App.state.lastSync);
        App.ui && App.ui.updateBadge && App.ui.updateBadge();
        App.ui && App.ui.renderOverzicht && App.ui.renderOverzicht();
      }
    } catch (e) {
      App.logger.warn('Sync van Sheets mislukt:', e.message);
      App.ui && App.ui.showError && App.ui.showError('Ophalen vanaf Google Sheets is niet gelukt.');
    } finally {
      App.state.syncBezig = false;
      App.ui && App.ui.updateSyncStatus && App.ui.updateSyncStatus();
    }
  }

  App.sheets = {
    laadUrl: laadUrl,
    setUrl: setUrl,
    syncNaarSheets: syncNaarSheets,
    syncVanSheets: syncVanSheets
  };
})(window.App = window.App || {});
