/**
 * exportImport.js
 * Exporteren van kavels naar JSON / CSV / Excel, en het terugzetten van een
 * eerder JSON-exportbestand met structuur- en versiecontrole.
 * Excel-export gebruikt SheetJS (via CDN, zie index.html) voor een echt .xlsx-bestand.
 */
(function (App) {
  'use strict';

  var h = App.helpers;

  function downloadBlob(blob, bestandsnaam) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = bestandsnaam;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJSON() {
    var data = App.storage.exportAll();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'hnvi-backup-' + dateStamp() + '.json');
    App.ui.showSuccess('JSON-export gedownload.');
  }

  function rijenVoorExport() {
    return App.state.kavels.map(function (k) {
      return {
        Titel: k.titel || '',
        Veilinghuis: k.veiling || '',
        Kavelnummer: k.kavelnummer || '',
        URL: k.url || '',
        Status: k.status || '',
        Advies: k.advies || '',
        Bod: k.huidig_bod != null ? k.huidig_bod : '',
        EigenBod: k.eigen_bod ? 'Ja' : 'Nee',
        TotaleInkoopprijs: k.kosten ? Math.round(k.kosten.totaal) : '',
        VerwachteMarge: k.kosten && k.kosten.marge != null ? Math.round(k.kosten.marge) : '',
        MarktplaatsGemiddeld: k.mp_gemiddeld || '',
        Nieuwprijs: k.nieuwprijs || '',
        ROI: k.roi != null ? k.roi : '',
        ToegevoegdOp: h.formatDate(k.toegevoegd),
        GewonnenOp: k.gewonnen_op ? h.formatDate(k.gewonnen_op) : ''
      };
    });
  }

  function exportCSV() {
    var rijen = rijenVoorExport();
    if (!rijen.length) { App.ui.showError('Geen kavels om te exporteren.'); return; }
    var kolommen = Object.keys(rijen[0]);
    var csv = kolommen.join(';') + '\n' + rijen.map(function (r) {
      return kolommen.map(function (k) {
        var v = String(r[k] == null ? '' : r[k]).replace(/"/g, '""');
        return /[;"\n]/.test(v) ? '"' + v + '"' : v;
      }).join(';');
    }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, 'hnvi-kavels-' + dateStamp() + '.csv');
    App.ui.showSuccess('CSV-export gedownload.');
  }

  function exportExcel() {
    var rijen = rijenVoorExport();
    if (!rijen.length) { App.ui.showError('Geen kavels om te exporteren.'); return; }
    if (typeof XLSX === 'undefined') {
      App.ui.showError('Excel-export vereist een internetverbinding (SheetJS kon niet laden). Gebruik CSV als alternatief.');
      return;
    }
    var ws = XLSX.utils.json_to_sheet(rijen);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kavels');
    XLSX.writeFile(wb, 'hnvi-kavels-' + dateStamp() + '.xlsx');
    App.ui.showSuccess('Excel-export gedownload.');
  }

  function dateStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function importFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { App.ui.showError('Bestand is te groot (max 20MB).'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { App.ui.showError('Bestand is geen geldige JSON.'); return; }
      try {
        App.storage.importAll(data);
        App.stateActions.laadKavels();
        App.veilinghuizen.laad();
        App.ui.updateBadge();
        App.ui.renderOverzicht();
        App.ui.showSuccess('Back-up geïmporteerd.');
      } catch (e) {
        App.ui.showError('Importeren mislukt: ' + e.message);
      }
    };
    reader.onerror = function () { App.ui.showError('Kon het bestand niet lezen.'); };
    reader.readAsText(file);
  }

  App.exportImport = { exportJSON: exportJSON, exportCSV: exportCSV, exportExcel: exportExcel, importFile: importFile };
})(window.App = window.App || {});
