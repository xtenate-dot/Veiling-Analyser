/**
 * aicalls.js
 * Houdt een log bij van elke AI-aanroep (model, tokens, kosten, duur, web search)
 * voor het "AI-kosten"-tabblad. api.js roept log() aan na elke geslaagde aanroep.
 * Bewaard in localStorage zodat de geschiedenis blijft staan na een refresh.
 */
(function (App) {
  'use strict';

  var MAX_LOG = 300; // oudste entries vallen eraf, voorkomt onbeperkte groei in localStorage

  function laad() {
    var log = App.storage.get(App.storage.KEYS.aiCallLog, []);
    return Array.isArray(log) ? log : [];
  }

  /**
   * entry: { tijd, label, model, inputTokens, outputTokens, cachedInputTokens,
   *          websearchAantal, kosten, duurMs, ok }
   */
  function log(entry) {
    var lijst = laad();
    lijst.push(entry);
    if (lijst.length > MAX_LOG) lijst = lijst.slice(lijst.length - MAX_LOG);
    App.storage.set(App.storage.KEYS.aiCallLog, lijst);
  }

  function wis() {
    App.storage.set(App.storage.KEYS.aiCallLog, []);
  }

  /** Totalen over de huidige log — handig voor een samenvattingsbalk in de UI */
  function totalen(lijst) {
    lijst = lijst || laad();
    var t = {
      aantal: lijst.length, kosten: 0, kostenEUR: 0, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, websearchAantal: 0, duurMs: 0
    };
    lijst.forEach(function (e) {
      t.kosten += e.kosten || 0;
      t.kostenEUR += e.kostenEUR || 0;
      t.inputTokens += e.inputTokens || 0;
      t.outputTokens += e.outputTokens || 0;
      t.cacheReadTokens += e.cacheReadTokens || 0;
      t.cacheWriteTokens += e.cacheWriteTokens || 0;
      t.websearchAantal += e.websearchAantal || 0;
      t.duurMs += e.duurMs || 0;
    });
    return t;
  }

  /**
   * Bouwt het leesbare tekstrapport voor één analyse-run (alle calls met hetzelfde
   * analyseId), gesorteerd van duurste naar goedkoopste call — zo is in één oogopslag
   * te zien welke stap de kosten domineert.
   */
  function formatRapport(analyseId) {
    if (!analyseId) return '';
    var lijst = laad().filter(function (e) { return e.analyseId === analyseId; });
    if (!lijst.length) return '';
    var gesorteerd = lijst.slice().sort(function (a, b) { return (b.kostenEUR || 0) - (a.kostenEUR || 0); });
    var lijn = new Array(41).join('=');
    var fmt = App.helpers.formatKostenEUR;
    var out = [];

    out.push(lijn + ' AI ANALYSE RAPPORT');
    gesorteerd.forEach(function (e, i) {
      var isHaiku = e.model && e.model.indexOf('haiku') !== -1;
      var delen = ['Call ' + (i + 1), 'Functie: ' + (e.label || '-'), 'Model: ' + (isHaiku ? 'Haiku' : 'Sonnet'), 'API: ' + (e.api || 'Messages')];
      if (e.aantalAfbeeldingen) delen.push('Afbeeldingen: ' + e.aantalAfbeeldingen);
      delen.push('Websearch: ' + (e.websearchAantal ? 'Ja (' + e.websearchAantal + 'x)' : 'Nee'));
      delen.push('Prompt: ' + (e.promptTekens || 0) + ' tekens (~' + (e.promptTokensGeschat || 0) + ' tokens)');
      delen.push('Input tokens: ' + (e.inputTokens || 0));
      delen.push('Output tokens: ' + (e.outputTokens || 0));
      if (e.cacheReadTokens) delen.push('Cache read: ' + e.cacheReadTokens);
      if (e.cacheWriteTokens) delen.push('Cache write: ' + e.cacheWriteTokens);
      delen.push('Kosten: ' + fmt(e.kostenEUR));
      delen.push('Tijd: ' + (e.duurMs != null ? (e.duurMs / 1000).toFixed(1) + 's' : '-'));
      out.push('Call ' + (i + 1) + '  ' + delen.slice(1).join('  |  '));
    });

    out.push(lijn + ' TOTAAL');
    var t = totalen(lijst);
    out.push('Aantal AI-calls: ' + t.aantal);
    out.push('Totale input tokens: ' + t.inputTokens);
    out.push('Totale output tokens: ' + t.outputTokens);
    if (t.cacheReadTokens) out.push('Totale cache-read tokens: ' + t.cacheReadTokens);
    if (t.cacheWriteTokens) out.push('Totale cache-write tokens: ' + t.cacheWriteTokens);
    out.push('Totale kosten: ' + fmt(t.kostenEUR));
    out.push('Totale duur: ' + (t.duurMs / 1000).toFixed(1) + 's');

    return out.join('\n');
  }

  // Sessie-only (niet gepersisteerd): het laatst gegenereerde rapport, voor weergave in de UI.
  var laatsteRapport = null;
  function setLaatsteRapport(tekst) { laatsteRapport = tekst; }
  function getLaatsteRapport() { return laatsteRapport; }

  App.aicalls = {
    laad: laad, log: log, wis: wis, totalen: totalen,
    formatRapport: formatRapport, setLaatsteRapport: setLaatsteRapport, getLaatsteRapport: getLaatsteRapport
  };
})(window.App = window.App || {});
