/**
 * helpers.js
 * Kleine, generieke hulpfuncties zonder afhankelijkheid van app-state.
 * Alles hangt onder window.App.helpers zodat er geen losse globals ontstaan.
 */
(function (App) {
  'use strict';

  /** Formatteert een getal als euro-bedrag, bijv. 1234.5 -> "€1.235" */
  function fmt(n) {
    return (n != null && isFinite(n)) ? '\u20ac' + Math.round(n).toLocaleString('nl-NL') : '-';
  }

  /** Formatteert een fractie (0.183) als percentage-string "18%" */
  function formatPercentage(n, decimals) {
    if (n == null || !isFinite(n)) return '-';
    return n.toFixed(decimals || 0) + '%';
  }

  /** Formatteert een timestamp (ms) als Nederlandse datum */
  function formatDate(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleDateString('nl-NL'); } catch (e) { return ''; }
  }

  function formatDateTime(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString('nl-NL'); } catch (e) { return ''; }
  }

  /** Formatteert een "yyyy-mm-dd" datum-inputwaarde als "dd-mm-jjjj", zonder tijdzoneverschuiving */
  function formatInvoerDatum(isoDatum) {
    if (!isoDatum) return '';
    var delen = isoDatum.split('-');
    if (delen.length !== 3) return isoDatum;
    return delen[2] + '-' + delen[1] + '-' + delen[0];
  }

  /** Aantal hele dagen tussen vandaag en een "yyyy-mm-dd" datum (negatief = verleden) */
  function dagenTot(isoDatum) {
    if (!isoDatum) return null;
    var delen = isoDatum.split('-').map(Number);
    if (delen.length !== 3 || delen.some(isNaN)) return null;
    var doel = new Date(delen[0], delen[1] - 1, delen[2]);
    var vandaag = new Date();
    vandaag.setHours(0, 0, 0, 0);
    return Math.round((doel - vandaag) / 86400000);
  }

  /** Leidt een leesbare productnaam af uit een kavel-URL (best-effort, mag falen) */
  function naamUitUrl(u) {
    try {
      var deel = (u.split('/veiling-kavel/')[1] || '').split('?')[0];
      var slug = deel.replace(/\/\d+$/, '').replace(/-/g, ' ').trim();
      if (!slug) return '';
      return slug.charAt(0).toUpperCase() + slug.slice(1);
    } catch (e) { return ''; }
  }

  /** Genereert een vrij-uniek id (voldoende voor lokale state, geen crypto-behoefte) */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Knijpt een getal tussen min en max */
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /** Voorkomt te vaak achter elkaar dezelfde functie aanroepen (bijv. bij zoeken tijdens typen) */
  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  /** Kort querySelector helper */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function byId(id) { return document.getElementById(id); }

  /**
   * Parseert JSON die Claude soms met markdown-codeblokken of extra tekst eromheen terugstuurt.
   * Probeert drie strategieën, van strikt naar coulant.
   */
  function parseLooseJSON(txt) {
    if (!txt) return null;
    var clean = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
    try { return JSON.parse(clean); } catch (e) { /* volgende poging */ }

    var start = clean.indexOf('{');
    var end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(clean.slice(start, end + 1)); } catch (e) { /* volgende poging */ }
    }

    var start2 = txt.indexOf('{');
    var end2 = txt.lastIndexOf('}');
    if (start2 !== -1 && end2 !== -1 && end2 > start2) {
      try { return JSON.parse(txt.slice(start2, end2 + 1)); } catch (e) { /* geef op */ }
    }
    return null;
  }

  App.helpers = {
    fmt: fmt,
    formatPercentage: formatPercentage,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatInvoerDatum: formatInvoerDatum,
    dagenTot: dagenTot,
    naamUitUrl: naamUitUrl,
    uid: uid,
    clamp: clamp,
    debounce: debounce,
    qs: qs,
    qsa: qsa,
    byId: byId,
    parseLooseJSON: parseLooseJSON
  };
})(window.App = window.App || {});
