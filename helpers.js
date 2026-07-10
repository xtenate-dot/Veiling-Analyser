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

  /** Formatteert een dollarbedrag met genoeg precisie voor kleine AI-call-kosten, bijv. 0.0123 -> "$0,0123" */
  function formatKosten(n) {
    if (n == null || !isFinite(n)) return '-';
    var decimals = n < 0.01 ? 4 : 3;
    return '$' + n.toFixed(decimals).replace('.', ',');
  }

  /** Formatteert een (geschat) eurobedrag voor AI-kosten, bijv. 0.0113 -> "€0,0113" */
  function formatKostenEUR(n) {
    if (n == null || !isFinite(n)) return '-';
    var decimals = n < 0.01 ? 4 : 3;
    return '\u20ac' + n.toFixed(decimals).replace('.', ',');
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

  /**
   * Deterministische plausibiliteitscheck op een prijzenresultaat, ONAFHANKELIJK
   * van of de AI zelf "sanity_check_ok" goed invult. Geeft null terug als alles
   * er plausibel uitziet, anders een korte Nederlandse reden (voor de verificatieprompt).
   */
  function beoordeelPlausibiliteit(prijzen) {
    if (!prijzen || !prijzen.marktplaats) return null;
    var mp = prijzen.marktplaats.gemiddeld;
    var nieuw = prijzen.nieuwprijs;
    if (typeof mp !== 'number' || !isFinite(mp)) return null;
    // LET OP: "sanity_check_ok:false" wordt NIET meer blind vertrouwd als trigger. Bij een
    // ouder/uitverkocht product is nieuwprijs:null vaak een eerlijke, correcte conclusie
    // (Apple/de winkel verkoopt het simpelweg niet meer) — geen plausibiliteitsprobleem.
    // Alleen concrete numerieke tegenstrijdigheden triggeren een (dure) herverificatie.
    if (typeof nieuw === 'number' && isFinite(nieuw) && nieuw > 0) {
      if (mp > nieuw) return 'de tweedehandsprijs (' + mp + ') is hoger dan de nieuw/refurbished-prijs (' + nieuw + ')';
      if (mp > nieuw * 1.3) return 'de tweedehandsprijs (' + mp + ') ligt meer dan 30% boven de nieuw/refurbished-prijs (' + nieuw + ')';
    }
    if (prijzen.ebay && typeof prijzen.ebay.gemiddeld === 'number' && isFinite(prijzen.ebay.gemiddeld) && mp > 0) {
      var verschil = Math.abs(prijzen.ebay.gemiddeld - mp) / mp;
      if (verschil > 0.6) return 'Marktplaats (' + mp + ') en eBay (' + prijzen.ebay.gemiddeld + ') wijken meer dan 60% van elkaar af';
    }
    return null;
  }

  /** Leidt een leesbare productnaam af uit een kavel-URL (best-effort, mag falen).
   *  Werkt generiek over veilinghuizen heen: pakt het langste, meest woord-achtige
   *  padsegment (bijv. de beschrijvende slug), en negeert kavel-ID-achtige segmenten. */
  function naamUitUrl(u) {
    try {
      var pathname = new URL(u).pathname;
      var segmenten = pathname.split('/').filter(Boolean);
      var stopwoorden = ['veiling kavel', 'kavel', 'lot', 'item', 'product', 'products', 'auction', 'auctions', 'en', 'nl', 'w', 'l'];
      var beste = '';
      segmenten.forEach(function (seg) {
        var woorden = seg.replace(/[-_]+/g, ' ').trim();
        if (stopwoorden.indexOf(woorden.toLowerCase()) !== -1) return;
        var letters = woorden.replace(/[^a-zA-Z]/g, '').length;
        var letterRatio = letters / Math.max(1, woorden.length);
        // Alleen segmenten met meerdere woorden en overwegend letters (geen kavel-ID zoals "a1-38888-6515-33")
        if (woorden.split(' ').length >= 2 && letterRatio > 0.5 && woorden.length > beste.length) {
          beste = woorden;
        }
      });
      if (!beste) return '';
      return beste.charAt(0).toUpperCase() + beste.slice(1);
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
    formatKosten: formatKosten,
    formatKostenEUR: formatKostenEUR,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatInvoerDatum: formatInvoerDatum,
    dagenTot: dagenTot,
    beoordeelPlausibiliteit: beoordeelPlausibiliteit,
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
