/**
 * storage.js
 * Enige plek in de app die rechtstreeks met localStorage praat.
 * Alle andere modules gaan via App.storage.get/set/remove, zodat een defecte
 * of volle localStorage nooit een onverwachte crash geeft (alles zit in try/catch).
 */
(function (App) {
  'use strict';

  var PREFIX = 'hnvi_';
  var KEYS = {
    apiKey: PREFIX + 'apikey',
    kavels: PREFIX + 'kavels',
    veilinghuizen: PREFIX + 'veilinghuizen',
    sheetsUrl: PREFIX + 'sheets_url',
    lastSync: PREFIX + 'last_sync',
    aiCallLog: PREFIX + 'ai_call_log'
  };

  function get(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      App.logger && App.logger.warn('storage.get mislukt voor', key, e.message);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Vol quotum of privémodus zonder opslag: app moet blijven werken, alleen niet persisteren.
      App.logger && App.logger.warn('storage.set mislukt voor', key, e.message);
      return false;
    }
  }

  function getRaw(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function setRaw(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { App.logger && App.logger.warn('storage.setRaw mislukt voor', key, e.message); return false; }
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* niets te doen */ }
  }

  function clearAll() {
    Object.keys(KEYS).forEach(function (k) { remove(KEYS[k]); });
  }

  /** Exporteert alle app-data als één JSON-blob (voor backup/export-functie) */
  function exportAll() {
    var data = {};
    Object.keys(KEYS).forEach(function (name) {
      data[name] = get(KEYS[name], null);
    });
    data._exportVersion = 1;
    data._exportedAt = new Date().toISOString();
    return data;
  }

  /** Importeert een eerder geëxporteerde JSON-blob, met structuurcontrole */
  function importAll(data) {
    if (!data || typeof data !== 'object') throw new Error('Ongeldig back-upbestand.');
    if (data._exportVersion == null) throw new Error('Dit bestand lijkt geen HNVI-back-up te zijn.');
    if (Array.isArray(data.kavels)) set(KEYS.kavels, data.kavels);
    if (Array.isArray(data.veilinghuizen)) set(KEYS.veilinghuizen, data.veilinghuizen);
    if (typeof data.sheetsUrl === 'string') setRaw(KEYS.sheetsUrl, data.sheetsUrl);
    return true;
  }

  App.storage = {
    KEYS: KEYS,
    get: get,
    set: set,
    getRaw: getRaw,
    setRaw: setRaw,
    remove: remove,
    clearAll: clearAll,
    exportAll: exportAll,
    importAll: importAll
  };
})(window.App = window.App || {});
