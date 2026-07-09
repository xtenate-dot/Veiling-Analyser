/**
 * analyse.js
 * Het kavel-analyseformulier: foto's, invoervalidatie, de aanroep naar de API
 * en het opbouwen van het resultaatscherm.
 */
(function (App) {
  'use strict';

  var h = App.helpers;
  var MAX_FOTOS = 5;
  var MAX_FOTO_MB = 8;
  var MAX_AFMETING = 1600; // px, lange zijde na compressie

  // ── Foto's: compressie + ObjectURL-previews i.p.v. volle base64 in de preview-DOM ──
  function comprimeerAfbeelding(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var schaal = Math.min(1, MAX_AFMETING / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * schaal);
        canvas.height = Math.round(img.height * schaal);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Kon de foto niet verwerken.')); return; }
          var reader = new FileReader();
          reader.onload = function () {
            resolve({ base64: reader.result.split(',')[1], mediaType: 'image/jpeg', blob: blob });
          };
          reader.onerror = function () { reject(new Error('Kon de foto niet lezen.')); };
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Kon de afbeelding niet openen.')); };
      img.src = url;
    });
  }

  async function leesFiles(files) {
    var lijst = Array.prototype.filter.call(files, function (f) { return f.type.indexOf('image/') === 0; });
    if (App.state.imgs.length + lijst.length > MAX_FOTOS) {
      App.ui.showError('Maximaal ' + MAX_FOTOS + ' foto\'s per kavel.');
      lijst = lijst.slice(0, Math.max(0, MAX_FOTOS - App.state.imgs.length));
    }
    for (var i = 0; i < lijst.length; i++) {
      var f = lijst[i];
      if (f.size > MAX_FOTO_MB * 1024 * 1024) {
        App.ui.showError('"' + f.name + '" is groter dan ' + MAX_FOTO_MB + 'MB en is overgeslagen.');
        continue;
      }
      try {
        var res = await comprimeerAfbeelding(f);
        var id = h.uid('img');
        var previewUrl = URL.createObjectURL(res.blob);
        App.state.imgs.push({ id: id, base64: res.base64, mediaType: res.mediaType, previewUrl: previewUrl });
        voegPreviewToe(id, previewUrl);
      } catch (e) {
        App.ui.showError('Foto verwerken mislukt: ' + e.message);
      }
    }
  }

  function voegPreviewToe(id, previewUrl) {
    var d = document.createElement('div'); d.className = 'prev'; d.id = 'prev-' + id;
    var img = document.createElement('img'); img.src = previewUrl; img.alt = 'Foto van het kavel';
    var btn = document.createElement('button'); btn.className = 'prev-del'; btn.textContent = 'x'; btn.setAttribute('aria-label', 'Foto verwijderen');
    btn.addEventListener('click', function () { delImg(id); });
    d.appendChild(img); d.appendChild(btn);
    h.byId('previews').appendChild(d);
  }

  function delImg(id) {
    var item = App.state.imgs.find(function (i) { return i.id === id; });
    if (item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    App.state.imgs = App.state.imgs.filter(function (i) { return i.id !== id; });
    var el = h.byId('prev-' + id);
    if (el) el.remove();
  }

  function wisAlleFotos() {
    App.state.imgs.forEach(function (i) { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl); });
    App.state.imgs = [];
    h.byId('previews').innerHTML = '';
  }

  // ── Bod-type / voortgangsstappen ────────────────────────────────────────────
  function setBodType(type, btn) {
    App.state.bodType = type;
    h.qsa('.bod-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    h.byId('bod-hint').textContent = type === 'eigen'
      ? 'Jouw bod - gebruikt als inkoopprijs voor margeberekening'
      : 'Huidig hoogste bod op de veiling';
  }

  function setStap(n) {
    h.byId('stappen').style.display = 'block';
    var icons = ['\uD83D\uDD0D', '\uD83D\uDCB0', '\uD83D\uDCCA'];
    var labels = ['Productnaam bepalen', 'Marktprijzen ophalen', 'Advies berekenen'];
    [1, 2, 3].forEach(function (i) {
      var el = h.byId('stap' + i);
      el.textContent = '';
      if (i < n) {
        el.className = 'step done';
        var span = document.createElement('span'); span.textContent = '\u2705';
        el.appendChild(span); el.appendChild(document.createTextNode(' ' + labels[i - 1]));
      } else if (i === n) {
        el.className = 'step active';
        var spin = document.createElement('span'); spin.className = 'step-spin';
        el.appendChild(spin); el.appendChild(document.createTextNode(' ' + labels[i - 1]));
      } else {
        el.className = 'step';
        var span2 = document.createElement('span'); span2.textContent = icons[i - 1];
        el.appendChild(span2); el.appendChild(document.createTextNode(' ' + labels[i - 1]));
      }
    });
  }
  function verbergStappen() { h.byId('stappen').style.display = 'none'; }

  // ── Veilinghuis-detectie bij URL-invoer ─────────────────────────────────────
  function opUrlChange() {
    if (App.state.handmatigVeilinghuis) return;
    var url = h.byId('kavel-url').value.trim();
    var gevonden = App.veilinghuizen.detecteer(url);
    if (gevonden) {
      App.ui.vulVeilinghuisSelect(gevonden.id);
      h.byId('veilinghuis-hint').textContent = '\u2713 Herkend op basis van de URL.' + (gevonden.note ? ' ' + gevonden.note : '') + ' Klopt dit niet, kies dan hierboven het juiste veilinghuis.';
    } else if (url) {
      h.byId('veilinghuis-hint').textContent = 'Dit veilinghuis is nog niet bekend. Kies hierboven de dichtstbijzijnde optie, of voeg het toe via "Veilinghuizen" bovenin.';
    }
  }
  function opVeilinghuisChange() {
    App.state.handmatigVeilinghuis = true;
    var v = App.state.veilinghuizen.find(function (x) { return x.id === h.byId('veilinghuis-select').value; });
    h.byId('veilinghuis-hint').textContent = 'Handmatig geselecteerd.' + (v && v.note ? ' ' + v.note : '');
  }

  // ── Automatisch productnaam + sluitdag/ophaaldag opzoeken via de Claude web-search tool ──
  var laatstOpgezochteUrl = '';
  async function opUrlBlur() {
    var url = h.byId('kavel-url').value.trim();
    if (!url || url === laatstOpgezochteUrl) return;
    var datumsAlIngevuld = h.byId('kavel-sluitdag').value || h.byId('kavel-ophaaldag').value;
    var naamAlIngevuld = h.byId('extra-txt').value.trim();
    if (datumsAlIngevuld && naamAlIngevuld) return; // niks te doen, alles staat er al
    if (!App.api.getApiKey()) return; // stil overslaan, gebruiker ziet de apikey-balk al
    try { new URL(url); } catch (e) { return; }

    laatstOpgezochteUrl = url;
    var statusEl = h.byId('datum-status');
    if (statusEl) { statusEl.textContent = '\uD83D\uDD0D Productinfo en datums opzoeken...'; statusEl.style.display = 'block'; }

    try {
      var system = 'Je bent een assistent die met de zoekfunctie een online veilingkavel-pagina opzoekt en leest. ' +
        'Geef ALLEEN een geldig JSON object terug, GEEN markdown code blocks, GEEN tekst ervoor of erna. Begin direct met { en eindig met }.';
      var userText = 'Kavelpagina: ' + url + '\n\n' +
        'Zoek deze pagina op (en zo nodig de bijbehorende veilingpagina) en bepaal:\n' +
        '- productnaam: een specifieke, gedetailleerde omschrijving van het product zoals op de kavelpagina staat ' +
        '(merk, model, type, belangrijkste specificaties zoals RAM/opslag/afmetingen indien van toepassing) \u2014 ' +
        'NIET "onbekend" of een generieke omschrijving als de pagina specifieker is\n' +
        '- de sluitdatum: het moment waarop het bieden op dit kavel stopt\n' +
        '- de ophaaldatum: de (eerste) dag waarop gewonnen kavels afgehaald kunnen worden\n\n' +
        'Antwoord in dit formaat: {"productnaam":"...","sluitdag":"JJJJ-MM-DD","ophaaldag":"JJJJ-MM-DD","gevonden":true}\n' +
        'Gebruik null voor een veld dat je niet met zekerheid kunt vinden, en zet "gevonden" op false als je helemaal niets bruikbaars vond.';

      var txt = await App.api.callClaudeMetWebSearch(system, userText, 1500);
      var resultaat = h.parseLooseJSON(txt);

      if (resultaat && resultaat.gevonden) {
        var gevuld = [];
        if (resultaat.productnaam && !naamAlIngevuld) { h.byId('extra-txt').value = resultaat.productnaam; gevuld.push('productomschrijving'); }
        if (resultaat.sluitdag && !h.byId('kavel-sluitdag').value) { h.byId('kavel-sluitdag').value = resultaat.sluitdag; gevuld.push('sluitdatum'); }
        if (resultaat.ophaaldag && !h.byId('kavel-ophaaldag').value) { h.byId('kavel-ophaaldag').value = resultaat.ophaaldag; gevuld.push('ophaaldatum'); }
        if (gevuld.length) {
          App.ui.showSuccess('Automatisch gevonden: ' + gevuld.join(', ') + '.');
        } else if (statusEl) {
          statusEl.textContent = '\u2139\uFE0F Niets nieuws gevonden op de pagina \u2014 vul zo nodig zelf aan.';
          setTimeout(function () { statusEl.style.display = 'none'; }, 4000);
          return;
        }
      } else if (statusEl) {
        statusEl.textContent = '\u2139\uFE0F Geen productinfo/datums gevonden op de pagina \u2014 vul zo nodig zelf in.';
        setTimeout(function () { statusEl.style.display = 'none'; }, 4000);
        return;
      }
      if (statusEl) statusEl.style.display = 'none';
    } catch (err) {
      App.logger.warn('Automatisch opzoeken mislukt:', err.message);
      if (statusEl) statusEl.style.display = 'none';
    }
  }

  // ── Invoervalidatie ──────────────────────────────────────────────────────
  function valideerInvoer(url, bodStr, extra) {
    var fouten = [];
    if (!url && App.state.imgs.length === 0 && !extra) {
      fouten.push('Voer een kavel-URL in, voeg een foto toe, of voeg een beschrijving toe.');
    }
    if (url) {
      try { new URL(url); } catch (e) { fouten.push('De ingevoerde URL lijkt niet geldig.'); }
    }
    if (bodStr) {
      var bodNum = parseFloat(bodStr.replace(',', '.'));
      if (isNaN(bodNum)) fouten.push('Het bod is geen geldig bedrag.');
      else if (bodNum < 0) fouten.push('Het bod kan niet negatief zijn.');
      else if (bodNum > 1000000) fouten.push('Dat bod lijkt onrealistisch hoog — controleer de invoer.');
    }
    return fouten;
  }

  // ── Analyseren (async/await + centrale foutafhandeling) ────────────────────
  async function analyseer() {
    var url = h.byId('kavel-url').value.trim();
    var bodStr = h.byId('huidig-bod').value.trim();
    var extra = h.byId('extra-txt').value.trim();

    var fouten = valideerInvoer(url, bodStr, extra);
    if (fouten.length) { toonMsg('analyse-err', fouten.join(' ')); return; }

    h.byId('analyse-err').style.display = 'none';
    h.byId('analyse-result').style.display = 'none';
    setBtn('analyse-btn', 'analyse-btn-txt', true, '<span class="spinner"></span> Analyseren...');

    var urlNaam = url ? h.naamUitUrl(url) : '';
    var product = (extra || urlNaam || 'onbekend product').replace(/["']/g, '').trim();
    var bod = bodStr ? parseFloat(bodStr.replace(',', '.')) : null;
    var kavelnrHandmatig = h.byId('kavel-nummer').value.trim();
    var kavelnr = kavelnrHandmatig || (url ? ((url.match(/\/(\d+)(?:\?|$)/) || [])[1]) : null);
    var sluitdag = h.byId('kavel-sluitdag').value || null;
    var ophaaldag = h.byId('kavel-ophaaldag').value || null;
    var veilinghuisId = h.byId('veilinghuis-select').value;
    var veilinghuis = App.state.veilinghuizen.find(function (v) { return v.id === veilinghuisId; }) || App.state.veilinghuizen[0];

    setStap(1);

    var prijzenPrompt = 'Zoek actief op internet naar actuele prijzen en geef realistische marktprijzen voor: "' + product + '"\n\n' +
      'BELANGRIJK voor nieuwprijs:\n' +
      '- Zoek de HUIDIGE winkelprijs op (bol.com, coolblue, mediamarkt, amazon.nl)\n' +
      '- NIET de originele adviesprijs/lanceerprijs van de fabrikant uit het verleden\n' +
      '- Als een winkel voor minder verkoopt dan de adviesprijs, gebruik die lagere prijs\n' +
      '- Als dit product NIET meer nieuw verkocht wordt (verouderd/discontinued model, bijv. oudere laptop/telefoon-generatie): ' +
      'gebruik dan NIET de historische lanceerprijs. Zoek in plaats daarvan de prijs van een vergelijkbaar CURRENT nieuw model, ' +
      'of \u2014 beter \u2014 de prijs bij een grote refurbished-winkel (bijv. iUsed, Backmarket, Coolblue Outlet, Amac) voor een vergelijkbare ' +
      'uitvoering in goede staat, en vermeld dat expliciet in nieuwprijs_bron (bijv. "refurbished vanaf X bij Y, want niet meer nieuw verkrijgbaar")\n' +
      '- Vermeld in nieuwprijs_bron altijd welke winkel/bron en welke prijs je gebruikt hebt\n\n' +
      'BELANGRIJK voor 2e hands:\n' +
      '- Zoek naar echte, actuele advertenties/verkochte listings voor dit exacte model met deze specificaties (Marktplaats, eBay, refurbished-winkels)\n' +
      '- Marktplaats prijs moet ALTIJD lager zijn dan de actuele nieuw/refurbished-prijs, nooit gebaseerd op de oude lanceerprijs\n' +
      '- Goede staat: 65-80% van de actuele nieuw/refurbished-prijs\n' +
      '- Redelijke staat: 45-65% van de actuele nieuw/refurbished-prijs\n\n' +
      (App.state.imgs.length ? 'Er zijn foto\'s van het kavel bijgevoegd — gebruik die om het product, merk, model en de staat zo goed mogelijk te identificeren.\n\n' : '') +
      'Vul dit JSON object in met echte getallen, gebaseerd op wat je daadwerkelijk vindt via zoeken:\n' +
      '{"productnaam":"' + product + '","categorie":"categorie","nieuwprijs":100,"nieuwprijs_bron":"winkel en prijs","marktplaats":{"laag":50,"gemiddeld":75,"hoog":100,"vertrouwen":"middel","tip":"verkooptip","verkooptijd":"1-4 weken","zoekwoorden":["woord"]},"ebay":{"laag":60,"gemiddeld":85,"hoog":110,"vertrouwen":"laag","tip":"ebay tip","verkooptijd":"2-6 weken","keywords":["word"]},"aandachtspunten":["punt"]}';

    setStap(2);
    App.logger.info('Analyse gestart voor product:', product, '(' + App.state.imgs.length + ' foto\'s)');

    try {
      var prijzenTxt = await App.api.callClaude(
        'Je bent een Nederlandse marktprijsexpert. Gebruik de zoekfunctie om actuele prijzen te verifi\u00ebren \u2014 vertrouw niet blind op wat je uit je geheugen weet, prijzen veranderen snel en oudere modellen worden vaak niet meer nieuw verkocht. Geef ALLEEN een geldig JSON object terug. GEEN markdown code blocks (geen ```json```), GEEN tekst ervoor of erna. Begin direct met { en eindig met }.',
        prijzenPrompt,
        3000,
        App.state.imgs,
        [{ type: 'web_search_20250305', name: 'web_search' }]
      );
      var prijzen = App.api.parseJSON(prijzenTxt);
      var validatie = App.api.validatePrijzenResponse(prijzen);
      if (!validatie.valid) {
        throw new Error('Kon geen bruikbare marktprijzen ophalen (' + validatie.errors.join(' ') + '). Probeer opnieuw.');
      }

      setStap(3);
      var mp = prijzen.marktplaats;
      var kosten = null;
      if (bod) {
        kosten = App.veilinghuizen.berekenKosten(bod, veilinghuis);
        kosten.marge = mp.gemiddeld - kosten.totaal;
      }

      var advies = 'twijfel', adviesReden = '', roi = 50;
      if (kosten) {
        var m = kosten.marge;
        var pct = Math.round((m / mp.gemiddeld) * 100);
        if (m > 0 && pct >= 20) { advies = 'kopen'; roi = Math.min(93, 55 + pct); }
        else if (m < -50 || pct < -10) { advies = 'skip'; roi = Math.max(8, 50 + pct / 2); }
        else { roi = Math.max(25, Math.min(68, 50 + pct / 2)); }
        adviesReden = m > 0
          ? 'Inkoopprijs ' + h.fmt(kosten.totaal) + ' vs MP ~' + h.fmt(mp.gemiddeld) + ' marge ' + h.fmt(m) + ' (' + pct + '% van verkoopprijs).'
          : 'Inkoopprijs ' + h.fmt(kosten.totaal) + ' ligt ' + h.fmt(Math.abs(m)) + ' boven MP prijs van ' + h.fmt(mp.gemiddeld) + ' (' + pct + '%).';
      } else {
        var deler = (1 + veilinghuis.opgeld / 100) * (1 + (veilinghuis.btwBasis === 'geen' ? 0 : veilinghuis.btw / 100));
        var maxBodCalc = mp ? Math.round((mp.laag * 0.8) / deler) : null;
        adviesReden = maxBodCalc ? 'Maximaal rendabel bieden: ' + h.fmt(maxBodCalc) + '.' : 'Vul het bod in voor margeberekening.';
      }

      var delerMax = (1 + veilinghuis.opgeld / 100) * (1 + (veilinghuis.btwBasis === 'geen' ? 0 : veilinghuis.btw / 100));
      var maxBod = mp ? Math.round((mp.laag * 0.8) / delerMax) : null;

      var kavelData = {
        id: Date.now(), url: url, titel: prijzen.productnaam || product,
        veiling: veilinghuis.naam, veilinghuisId: veilinghuis.id, kavelnummer: kavelnr,
        sluitdag: sluitdag, ophaaldag: ophaaldag, huidig_bod: bod,
        kosten: kosten, mp_gemiddeld: mp.gemiddeld, mp_laag: mp.laag, mp_hoog: mp.hoog,
        ebay_gemiddeld: prijzen.ebay ? prijzen.ebay.gemiddeld : null,
        nieuwprijs: prijzen.nieuwprijs, advies: advies, adviesReden: adviesReden,
        roi: Math.round(roi), prijzen: prijzen, maxBod: maxBod,
        eigen_bod: App.state.bodType === 'eigen', toegevoegd: Date.now(), status: 'klaar'
      };

      var idx = App.state.kavels.findIndex(function (k) { return k.url === url && url; });
      if (idx >= 0) App.state.kavels[idx] = kavelData; else App.state.kavels.unshift(kavelData);
      App.stateActions.slaKavelsOp();
      App.ui.updateBadge();
      verbergStappen();
      toonAnalyseResultaat(kavelData);
      App.ui.showSuccess('Analyse voltooid.');
    } catch (err) {
      App.logger.error('Analyse fout:', err.message);
      verbergStappen();
      toonMsg('analyse-err', err.message || 'Er ging iets mis. Probeer opnieuw.');
    } finally {
      setBtn('analyse-btn', 'analyse-btn-txt', false, '\uD83D\uDD0D Analyseer kavel');
    }
  }

  // ── Resultaatscherm (DOM-opbouw via ui.js bouwstenen) ───────────────────────
  function toonAnalyseResultaat(d) {
    var mp = d.prijzen && d.prijzen.marktplaats;
    var eb = d.prijzen && d.prijzen.ebay;
    var container = h.byId('analyse-result');
    container.innerHTML = '';

    var terug = App.ui.maakButton('\u2190 Terug', 'back-btn', function () { container.style.display = 'none'; });
    container.appendChild(terug);

    var kop = document.createElement('div'); kop.className = 'card'; kop.style.borderTop = '3px solid var(--gold)';
    var kopTop = document.createElement('div'); kopTop.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px';
    var kopLinks = document.createElement('div');
    var h2 = document.createElement('h2'); h2.style.cssText = 'font-size:17px;font-weight:700;margin-bottom:3px'; h2.textContent = d.titel || '';
    kopLinks.appendChild(h2);
    var kopMeta = document.createElement('div'); kopMeta.style.cssText = 'font-size:12px;color:var(--text-secondary)';
    kopMeta.textContent = 'Kavel ' + (d.kavelnummer || '-') + ' \u00B7 ' + (d.veiling || 'Onbekend');
    if (d.sluitdag) kopMeta.textContent += ' \u00B7 Sluit ' + h.formatInvoerDatum(d.sluitdag);
    if (d.ophaaldag) kopMeta.textContent += ' \u00B7 Ophalen ' + h.formatInvoerDatum(d.ophaaldag);
    if (d.url) {
      kopMeta.appendChild(document.createTextNode(' \u00B7 '));
      var a = document.createElement('a'); a.href = d.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.style.color = 'var(--gold)'; a.textContent = '\u2197 Bekijk kavel';
      kopMeta.appendChild(a);
    }
    kopLinks.appendChild(kopMeta);
    kopTop.appendChild(kopLinks);
    if (d.prijzen && d.prijzen.categorie) {
      var catBadge = document.createElement('span');
      catBadge.style.cssText = 'background:var(--gold-soft);color:var(--gold-ink);border:1px solid var(--gold-border);font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px';
      catBadge.textContent = d.prijzen.categorie;
      kopTop.appendChild(catBadge);
    }
    kop.appendChild(kopTop);
    container.appendChild(kop);

    container.appendChild(App.ui.maakSamenvatting(d));
    if (d.kosten) container.appendChild(App.ui.maakKostenBox(d.kosten, d.eigen_bod));

    if (d.prijzen && d.prijzen.nieuwprijs) {
      var refCard = document.createElement('div'); refCard.className = 'card'; refCard.style.marginBottom = '16px';
      var refTitel = document.createElement('div'); refTitel.className = 'card-title'; refTitel.textContent = 'Referentieprijzen';
      refCard.appendChild(refTitel);
      var refRow = document.createElement('div'); refRow.style.cssText = 'display:flex;gap:20px;flex-wrap:wrap';
      function refBlok(label, waarde, kleur, sub) {
        var b = document.createElement('div');
        var l = document.createElement('div'); l.style.cssText = 'font-size:11px;color:var(--text-secondary);text-transform:uppercase'; l.textContent = label;
        var w = document.createElement('div'); w.style.cssText = 'font-size:19px;font-weight:700' + (kleur ? ';color:' + kleur : ''); w.textContent = waarde;
        b.appendChild(l); b.appendChild(w);
        if (sub) { var s = document.createElement('div'); s.style.cssText = 'font-size:11px;color:var(--text-secondary)'; s.textContent = sub; b.appendChild(s); }
        return b;
      }
      refRow.appendChild(refBlok('Nieuwprijs', h.fmt(d.prijzen.nieuwprijs), null, d.prijzen.nieuwprijs_bron || ''));
      if (mp) refRow.appendChild(refBlok('2e hands MP', h.fmt(mp.gemiddeld), 'var(--text-secondary)'));
      if (eb) refRow.appendChild(refBlok('eBay', h.fmt(eb.gemiddeld), 'var(--text-secondary)'));
      refCard.appendChild(refRow);
      container.appendChild(refCard);
    }

    var priceGrid = document.createElement('div'); priceGrid.className = 'price-grid';
    var mpCard = App.ui.maakPrijskaart('Marktplaats', 'mp', mp);
    if (mpCard) priceGrid.appendChild(mpCard);
    var ebCard = App.ui.maakPrijskaart('eBay', 'ebay', eb);
    if (ebCard) priceGrid.appendChild(ebCard);
    if (priceGrid.children.length) container.appendChild(priceGrid);

    var detailGrid = document.createElement('div'); detailGrid.className = 'detail-grid';
    if (d.prijzen && d.prijzen.aandachtspunten && d.prijzen.aandachtspunten.length) {
      var letOpCard = document.createElement('div'); letOpCard.className = 'detail-card';
      var letOpTitel = document.createElement('div'); letOpTitel.className = 'card-title'; letOpTitel.textContent = 'Let op';
      letOpCard.appendChild(letOpTitel);
      var ul = document.createElement('ul');
      d.prijzen.aandachtspunten.forEach(function (p) { var li = document.createElement('li'); li.textContent = p; ul.appendChild(li); });
      letOpCard.appendChild(ul);
      detailGrid.appendChild(letOpCard);
    }
    var overzichtCard = document.createElement('div'); overzichtCard.className = 'detail-card';
    var overzichtTitel = document.createElement('div'); overzichtTitel.className = 'card-title'; overzichtTitel.textContent = 'Snel overzicht';
    overzichtCard.appendChild(overzichtTitel);
    var ul2 = document.createElement('ul');
    function li2(tekst) { var li = document.createElement('li'); li.textContent = tekst; ul2.appendChild(li); }
    if (d.kosten) li2('Inkoopprijs: ' + h.fmt(d.kosten.totaal));
    if (d.maxBod) li2('Max rendabel bod: ' + h.fmt(d.maxBod));
    if (mp) li2('MP: ' + h.fmt(mp.laag) + ' - ' + h.fmt(mp.hoog));
    if (d.prijzen && d.prijzen.nieuwprijs) li2('Nieuwprijs: ' + h.fmt(d.prijzen.nieuwprijs));
    overzichtCard.appendChild(ul2);
    detailGrid.appendChild(overzichtCard);
    container.appendChild(detailGrid);

    container.appendChild(App.ui.maakButton('\uD83D\uDCCB Naar overzicht', 'btn-sm', function () { App.ui.switchTab('overzicht'); }));

    container.style.display = 'block';
    if (typeof container.scrollIntoView === 'function') {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function openDetail(idx) {
    var k = App.state.kavels[idx];
    App.ui.switchTab('analyse');
    if (k.prijzen) toonAnalyseResultaat(k);
    else heranalyseer(idx);
  }

  function heranalyseer(idx) {
    var k = App.state.kavels[idx];
    App.ui.switchTab('analyse');
    h.byId('kavel-url').value = k.url || '';
    h.byId('kavel-nummer').value = k.kavelnummer || '';
    h.byId('kavel-sluitdag').value = k.sluitdag || '';
    h.byId('kavel-ophaaldag').value = k.ophaaldag || '';
    if (k.huidig_bod) h.byId('huidig-bod').value = String(k.huidig_bod);
    h.byId('analyse-result').style.display = 'none';
    var type = k.eigen_bod ? 'eigen' : 'ander';
    setBodType(type, h.byId('bod-' + type));
    App.state.handmatigVeilinghuis = true;
    var vh = k.veilinghuisId && App.state.veilinghuizen.find(function (v) { return v.id === k.veilinghuisId; });
    var vhId = vh ? vh.id : ((App.veilinghuizen.detecteer(k.url || '') || App.state.veilinghuizen[0]).id);
    App.ui.vulVeilinghuisSelect(vhId);
  }

  // ── Kleine DOM-helpers die alleen deze module gebruikt ──────────────────────
  function setBtn(id, txtId, disabled, html) {
    h.byId(id).disabled = disabled;
    h.byId(txtId).innerHTML = html; // vaste, door onszelf gedefinieerde HTML (spinner-icoon), geen externe data
  }
  function toonMsg(id, msg) {
    var el = h.byId(id);
    el.textContent = 'Fout: ' + msg;
    el.style.display = 'block';
  }

  App.analyse = {
    leesFiles: leesFiles, delImg: delImg, wisAlleFotos: wisAlleFotos,
    setBodType: setBodType, setStap: setStap, verbergStappen: verbergStappen,
    opUrlChange: opUrlChange, opVeilinghuisChange: opVeilinghuisChange, opUrlBlur: opUrlBlur,
    analyseer: analyseer, toonAnalyseResultaat: toonAnalyseResultaat,
    openDetail: openDetail, heranalyseer: heranalyseer
  };
})(window.App = window.App || {});
