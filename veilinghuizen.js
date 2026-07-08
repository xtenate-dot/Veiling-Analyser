/**
 * state.js
 * Eén centraal state-object in plaats van losse globals (kavels, imgs, bodType, ...).
 * Andere modules lezen/schrijven via App.state.* — dit maakt het gedrag van de app
 * op één plek terug te vinden en voorkomt naamsbotsingen tussen bestanden.
 */
(function (App) {
  'use strict';

  var state = {
    kavels: [],
    veilinghuizen: [],
    imgs: [],              // { id, base64, mediaType, previewUrl } — zie analyse.js
    filter: 'alles',
    selectieModus: false,
    geselecteerd: new Set(),
    huidigGefilterd: [],
    bodType: 'ander',
    handmatigVeilinghuis: false,
    sheetsUrl: '',
    lastSync: null,
    syncBezig: false
  };

  function laadKavels() {
    state.kavels = App.storage.get(App.storage.KEYS.kavels, []);
    if (!Array.isArray(state.kavels)) state.kavels = [];
  }

  function slaKavelsOp() {
    App.storage.set(App.storage.KEYS.kavels, state.kavels);
    if (App.sheets) App.sheets.syncNaarSheets();
  }

  App.state = state;
  App.stateActions = {
    laadKavels: laadKavels,
    slaKavelsOp: slaKavelsOp
  };
})(window.App = window.App || {});
