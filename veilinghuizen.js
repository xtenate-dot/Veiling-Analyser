/**
 * veilinghuizen.js
 * Beheer van veilinghuizen: standaardlijst, opslag, detectie op URL,
 * en de kostenberekening (opgeld + BTW) die per huis kan verschillen.
 *
 * Uitbreidbaarheid: elk veilinghuis-object ondersteunt optionele velden
 * `land` en `valuta` (standaard 'NL'/'EUR') zodat een toekomstig
 * niet-Nederlands veilinghuis zonder structuurwijziging toegevoegd kan worden.
 * `btwBasis` ondersteunt 'totaal' | 'opgeld' | 'geen' voor de gangbare varianten;
 * een staffel (bijv. lager % boven een drempelbedrag) kan gemodelleerd worden
 * door twee veilinghuis-entries te maken (bijv. "X (klein)" / "X (groot)").
 */
(function (App) {
  'use strict';

  var STANDAARD_VEILINGHUIZEN = [
    { id: 'hnvi', naam: 'HNVI', urlPatroon: 'hnvi.nl', opgeld: 17, btw: 21, btwBasis: 'totaal', land: 'NL', valuta: 'EUR',
      note: 'Vast tarief: 17% opgeld + 21% BTW over bod+opgeld.' },
    { id: 'troostwijk', naam: 'Troostwijk Auctions', urlPatroon: 'troostwijkauctions.com', opgeld: 18, btw: 21, btwBasis: 'totaal', land: 'NL', valuta: 'EUR',
      note: 'Troostwijk hanteert een variabel opgeld dat per land en per veiling kan verschillen (meestal 17-18%). BTW over bod+opgeld. Controleer het exacte percentage altijd bij het kavel zelf.' },
    { id: 'bva', naam: 'BVA Auctions', urlPatroon: 'bva-auctions.com', opgeld: 16, btw: 21, btwBasis: 'totaal', land: 'NL', valuta: 'EUR',
      note: 'Standaard 16% opgeld, tenzij BVA vooraf een ander percentage aangeeft voor die specifieke veiling. BTW over bod+opgeld.' },
    { id: 'vavato', naam: 'Vavato', urlPatroon: 'vavato.com', opgeld: 17, btw: 21, btwBasis: 'totaal', land: 'NL', valuta: 'EUR',
      note: 'Schatting (~17%) — Vavato publiceert geen vast percentage; controleer de biedcalculator op de kavelpagina zelf.' },
    { id: 'onlineveilingmeester', naam: 'Onlineveilingmeester', urlPatroon: 'onlineveilingmeester.nl', opgeld: 18, btw: 21, btwBasis: 'totaal', land: 'NL', valuta: 'EUR',
      note: 'BTW-goederen: 18% opgeld + 21% BTW. Marge-goederen: 22% opgeld incl. BTW (geen aparte BTW). Bij thema-/inbrengveilingen daalt het opgeld naar 10% vanaf €25.000.' },
    { id: 'onbekend', naam: 'Onbekend / anders (handmatig instellen)', urlPatroon: '', opgeld: 17, btw: 21, btwBasis: 'totaal', land: 'NL', valuta: 'EUR',
      note: 'Pas opgeld en BTW hieronder aan naar wat de specifieke veiling vermeldt.' }
  ];

  function laad() {
    var opgeslagen = App.storage.get(App.storage.KEYS.veilinghuizen, null);
    App.state.veilinghuizen = (opgeslagen && opgeslagen.length) ? opgeslagen : STANDAARD_VEILINGHUIZEN.slice();
  }

  function opslaan() {
    App.storage.set(App.storage.KEYS.veilinghuizen, App.state.veilinghuizen);
  }

  function detecteer(url) {
    if (!url) return null;
    var u = url.toLowerCase();
    var lijst = App.state.veilinghuizen;
    for (var i = 0; i < lijst.length; i++) {
      var v = lijst[i];
      if (v.urlPatroon && u.indexOf(v.urlPatroon.toLowerCase()) !== -1) return v;
    }
    return null;
  }

  function berekenKosten(bod, veilinghuis) {
    var opgeldPct = veilinghuis.opgeld / 100;
    var btwPct = veilinghuis.btw / 100;
    var vk = bod * opgeldPct;
    var basisVoorBtw = veilinghuis.btwBasis === 'opgeld' ? vk : (veilinghuis.btwBasis === 'geen' ? 0 : (bod + vk));
    var btw = veilinghuis.btwBasis === 'geen' ? 0 : basisVoorBtw * btwPct;
    var totaal = bod + vk + btw;
    return { bod: bod, vk: vk, btw: btw, totaal: totaal, site: veilinghuis.naam, opgeld_pct: veilinghuis.opgeld };
  }

  /** Valideert invoer uit het beheerformulier vóór opslaan. Geeft foutmelding terug, of null als alles klopt. */
  function valideerInvoer(naam, opgeld, btw) {
    if (!naam || !naam.trim()) return 'Vul een naam in.';
    if (isNaN(opgeld) || opgeld < 0 || opgeld > 100) return 'Opgeld moet een percentage tussen 0 en 100 zijn.';
    if (isNaN(btw) || btw < 0 || btw > 100) return 'BTW moet een percentage tussen 0 en 100 zijn.';
    return null;
  }

  function voegToeOfBewerk(data, editId) {
    var fout = valideerInvoer(data.naam, data.opgeld, data.btw);
    if (fout) throw new Error(fout);

    if (editId) {
      var idx = App.state.veilinghuizen.findIndex(function (v) { return v.id === editId; });
      if (idx >= 0) {
        var bestaand = App.state.veilinghuizen[idx];
        App.state.veilinghuizen[idx] = Object.assign({}, bestaand, data, { id: editId });
      }
    } else {
      App.state.veilinghuizen.unshift(Object.assign({ id: App.helpers.uid('vh'), land: 'NL', valuta: 'EUR' }, data));
    }
    opslaan();
  }

  function verwijder(id) {
    App.state.veilinghuizen = App.state.veilinghuizen.filter(function (v) { return v.id !== id; });
    if (App.state.veilinghuizen.length === 0) App.state.veilinghuizen = STANDAARD_VEILINGHUIZEN.slice();
    opslaan();
  }

  App.veilinghuizen = {
    STANDAARD: STANDAARD_VEILINGHUIZEN,
    laad: laad,
    opslaan: opslaan,
    detecteer: detecteer,
    berekenKosten: berekenKosten,
    valideerInvoer: valideerInvoer,
    voegToeOfBewerk: voegToeOfBewerk,
    verwijder: verwijder
  };
})(window.App = window.App || {});
