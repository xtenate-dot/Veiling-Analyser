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
  var MAX_AFMETING = 1120; // px, lange zijde na compressie — lager = minder tokens per foto (kost telt zwaarder dan pixels)

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

  // ── Gratis, lokale preview van de productnaam zodra je de URL invult ──────
  // Doet GEEN API-aanroep meer (dat gebeurde eerder dubbel: hier én nogmaals
  // tijdens de analyse zelf). De echte identificatie + sluitdag/ophaaldag-lookup
  // gebeurt nu eenmalig, goedkoop via Haiku, als onderdeel van "Analyseren".
  function opUrlBlur() {
    var url = h.byId('kavel-url').value.trim();
    var naamAlIngevuld = h.byId('extra-txt').value.trim();
    if (!url || naamAlIngevuld) return;
    var gok = h.naamUitUrl(url);
    if (gok) {
      var statusEl = h.byId('datum-status');
      if (statusEl) {
        statusEl.textContent = '\uD83D\uDCA1 Herkend uit URL: "' + gok + '" \u2014 wordt bij Analyseren geverifieerd en aangevuld met sluit-/ophaaldatum.';
        statusEl.style.display = 'block';
        setTimeout(function () { statusEl.style.display = 'none'; }, 5000);
      }
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
    var analyseId = 'a' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    App.api.setAnalyseId(analyseId);
    App.logger.info('Analyse gestart voor product:', product, '(' + App.state.imgs.length + ' foto\'s)');

    // ── Stap 1 (Haiku, goedkoop): merk/model/type/categorie/specs/staat/OCR + datums ──
    // Bepaalt GEEN prijs. Twee volledig gescheiden sub-aanroepen, ELK alleen als nodig:
    //  (a) foto's -> beeldherkenning, ZONDER zoekfunctie (voorkomt dat foto-tokens
    //      vermenigvuldigd worden over meerdere zoekstappen binnen 1 aanroep)
    //  (b) URL-pagina lezen voor een preciezere naam en/of sluit-/ophaaldatum,
    //      ZONDER foto's (alleen tekst) — dus ook hier geen vermenigvuldiging.
    var visueleInfo = null, zoekInfo = null;

    if (App.state.imgs.length) {
      try {
        var visSystem = 'Je bent een productherkenning-assistent voor veilingkavels. Analyseer de foto\'s en identificeer: merk, model, type, categorie, ' +
          'en indien zichtbaar opslag/RAM. Beoordeel de zichtbare fysieke staat (krassen, deuken, slijtage, compleetheid). Lees relevante tekst op ' +
          'typeplaatjes/labels/schermen (OCR). BEPAAL GEEN marktprijs. Geef ALLEEN een compact JSON object terug, GEEN markdown, GEEN uitleg. Begin direct met { en eindig met }.';
        var visUser = (product && product !== 'onbekend product' ? 'Vermoedelijk product (uit URL/omschrijving): ' + product + '\n' : '') +
          'Antwoord in dit exacte formaat:\n' +
          '{"productnaam":"...","merk":"...","model":"...","type":"...","categorie":"...","opslag":"...","ram":"...","conditie":"korte omschrijving zichtbare staat","ocr_tekst":"..."}\n' +
          'Gebruik null voor een veld dat niet van toepassing of niet te bepalen is.';
        var visTxt = await App.api.callHaiku(visSystem, visUser, 400, App.state.imgs, 'Productherkenning');
        visueleInfo = h.parseLooseJSON(visTxt);
      } catch (err) {
        App.logger.warn('Foto-identificatie mislukt:', err.message);
      }
    }

    var heeftGoedeNaam = !!(extra || (visueleInfo && visueleInfo.productnaam) || (urlNaam && urlNaam.split(' ').length >= 2));
    var moetZoeken = !!url && (!heeftGoedeNaam || !sluitdag || !ophaaldag);
    if (moetZoeken) {
      try {
        var zoekSystem = 'Je bent een assistent die met de zoekfunctie een online veilingkavel-pagina leest. Bepaal een preciezere productnaam ' +
          '(merk, model, type, specificaties) en/of de sluitdatum en ophaaldatum van de veiling. Haal alleen deze specifieke gegevens eruit, niet de volledige paginatekst. ' +
          'BEPAAL GEEN marktprijs. Gebruik maximaal 2 zoekopdrachten, wees efficient. ' +
          'Geef ALLEEN een compact JSON object terug, GEEN markdown, GEEN uitleg. Begin direct met { en eindig met }.';
        var zoekUser = 'Kavel-URL: ' + url + '\n' +
          'Vermoedelijk product (nog te bevestigen/verbeteren): ' + product + '\n' +
          '\nAntwoord in dit exacte formaat:\n' +
          '{"productnaam":"...","merk":"...","model":"...","opslag":"...","ram":"...","sluitdag":"JJJJ-MM-DD","ophaaldag":"JJJJ-MM-DD"}\n' +
          'Gebruik null voor een veld dat je niet met zekerheid kunt vinden.';
        var zoekTxt = await App.api.callHaikuMetWebSearch(zoekSystem, zoekUser, 400, 2, null, 'Datum/naam-lookup');
        zoekInfo = h.parseLooseJSON(zoekTxt);
      } catch (err) {
        App.logger.warn('Datum/naam-lookup mislukt:', err.message);
      }
    }

    var identificatie = (visueleInfo || zoekInfo) ? {
      productnaam: (zoekInfo && zoekInfo.productnaam) || (visueleInfo && visueleInfo.productnaam) || null,
      merk: (zoekInfo && zoekInfo.merk) || (visueleInfo && visueleInfo.merk) || null,
      model: (zoekInfo && zoekInfo.model) || (visueleInfo && visueleInfo.model) || null,
      type: visueleInfo && visueleInfo.type || null,
      categorie: visueleInfo && visueleInfo.categorie || null,
      opslag: (zoekInfo && zoekInfo.opslag) || (visueleInfo && visueleInfo.opslag) || null,
      ram: (zoekInfo && zoekInfo.ram) || (visueleInfo && visueleInfo.ram) || null,
      conditie: visueleInfo && visueleInfo.conditie || null,
      ocr_tekst: visueleInfo && visueleInfo.ocr_tekst || null
    } : null;

    if (identificatie) {
      if (identificatie.productnaam && !extra) product = identificatie.productnaam.replace(/["']/g, '').trim();
    }
    if (zoekInfo) {
      if (zoekInfo.sluitdag && !sluitdag) { sluitdag = zoekInfo.sluitdag; h.byId('kavel-sluitdag').value = sluitdag; }
      if (zoekInfo.ophaaldag && !ophaaldag) { ophaaldag = zoekInfo.ophaaldag; h.byId('kavel-ophaaldag').value = ophaaldag; }
    }

    // ── Stap 2: prijsbepaling in twee stappen ──────────────────────────────────
    // (a) Haiku doet het websearch-werk en levert alleen RUWE datapunten terug
    //     (nieuwprijs + een handvol gevonden prijzen met bron/titel/conditie) —
    //     geen eigen prijsoordeel, geen volledige paginateksten worden doorgegeven.
    // (b) Sonnet krijgt UITSLUITEND die compacte samenvatting (geen web search,
    //     geen HTML, geen reviews/navigatie) en doet het eigenlijke prijswerk:
    //     uitschieters negeren, laag/gemiddeld/hoog bepalen, sanity-check.
    // Dit haalt de dure "hele pagina's lezen"-stap volledig uit Sonnet's context.
    var specRegels = [];
    if (identificatie) {
      if (identificatie.merk) specRegels.push('Merk: ' + identificatie.merk);
      if (identificatie.model) specRegels.push('Model: ' + identificatie.model);
      if (identificatie.type) specRegels.push('Type: ' + identificatie.type);
      if (identificatie.opslag) specRegels.push('Opslag: ' + identificatie.opslag);
      if (identificatie.ram) specRegels.push('RAM: ' + identificatie.ram);
      if (identificatie.conditie) specRegels.push('Zichtbare staat: ' + identificatie.conditie);
      if (identificatie.ocr_tekst) specRegels.push('Tekst op product/label: ' + identificatie.ocr_tekst);
    }
    var specTekst = specRegels.length ? specRegels.join('\n') + '\n' : '';

    async function haikuPrijsOnderzoek(extraInstructie) {
      var system = 'Je bent een prijsonderzoek-assistent. Gebruik de zoekfunctie om ECHTE, actuele prijsdata te verzamelen voor het gegeven product. ' +
        'BEPAAL ZELF GEEN eindprijsadvies, GEEN laag/gemiddeld/hoog-bereik en GEEN marktprijsoordeel \u2014 dat doet een ander systeem op basis van de ruwe data die jij verzamelt. ' +
        'Verzamel per gevonden prijs: de bron (bijv. Marktplaats, eBay, bol.com, een refurbished-winkel), het bedrag, een korte titel/omschrijving, en de conditie (nieuw/refurbished/tweedehands) indien te bepalen.\n' +
        'Zoek gericht naar: (1) de HUIDIGE nieuw- of refurbished-winkelprijs (NIET de originele lanceerprijs als het product niet meer nieuw verkocht wordt), ' +
        '(2) minstens 2-3 tweedehands advertenties (bijv. Marktplaats), (3) minstens 1-2 listings op eBay.\n' +
        (extraInstructie ? extraInstructie + '\n' : '') +
        'Gebruik maximaal 3 zoekopdrachten, wees efficient \u2014 haal alleen de prijs en een korte omschrijving uit een pagina, NIET de volledige paginatekst, navigatie of reviews.\n' +
        'Geef ALLEEN een compact JSON object terug, GEEN markdown, GEEN uitleg. Begin direct met { en eindig met }.';
      var userText = 'Product: "' + product + '"\n' + specTekst +
        '\nAntwoord in dit exacte formaat:\n' +
        '{"nieuwprijs":100,"nieuwprijs_bron":"winkel + prijs, kort","gevonden_prijzen":[{"bron":"Marktplaats","prijs":80,"titel":"korte titel","conditie":"goed"}],"aandachtspunten":["evt. bijzonderheden, kort"]}\n' +
        'Verzamel in totaal 4-6 gevonden_prijzen (mix van nieuw/refurbished-referentie, Marktplaats en eBay). Gebruik null voor nieuwprijs als je die niet met zekerheid kunt vinden.';
      var txt = await App.api.callHaikuMetWebSearch(system, userText, 700, 3, null, 'Prijsonderzoek');
      return h.parseLooseJSON(txt);
    }

    function formatOnderzoek(onderzoek) {
      var regels = ['Nieuwprijs: ' + (onderzoek.nieuwprijs != null ? h.fmt(onderzoek.nieuwprijs) : 'onbekend') +
        (onderzoek.nieuwprijs_bron ? ' (' + onderzoek.nieuwprijs_bron + ')' : '')];
      regels.push('Gevonden prijzen:');
      (onderzoek.gevonden_prijzen || []).forEach(function (p) {
        regels.push('- ' + (p.bron || '?') + ': ' + h.fmt(p.prijs) + (p.titel ? ' \u2014 ' + p.titel : '') + (p.conditie ? ' [' + p.conditie + ']' : ''));
      });
      if (onderzoek.aandachtspunten && onderzoek.aandachtspunten.length) {
        regels.push('Bijzonderheden uit onderzoek: ' + onderzoek.aandachtspunten.join('; '));
      }
      return regels.join('\n');
    }

    var prijzenSystem = 'Je bent een Nederlandse marktprijsexpert voor tweedehands/veilingproducten. Je krijgt hieronder AL OPGEZOCHTE, ruwe prijsdata (verzameld door een ander systeem) \u2014 vertrouw op deze data, doe zelf GEEN nieuwe zoekopdracht.\n\n' +
      'WERKWIJZE (verplicht):\n' +
      '1. Beoordeel of de gegeven nieuw/refurbished-prijs plausibel is voor dit product.\n' +
      '2. Groepeer de gevonden tweedehandsprijzen naar bron: Marktplaats-achtige bronnen apart van eBay-achtige bronnen. Bepaal per groep een laag/gemiddeld/hoog-bereik.\n' +
      '3. Vergelijk de datapunten onderling: een prijs die sterk afwijkt van de mediaan (bijv. >50% verschil) is een uitschieter \u2014 negeer die voor je eindberekening.\n' +
      '4. Sanity check: (a) is de tweedehandsprijs lager dan de nieuw/refurbished-prijs? (b) ligt de prijs niet >30% boven de nieuw/refurbished-prijs? (c) is de prijs niet extreem afwijkend van de gevonden datapunten? Zet "sanity_check_ok" op false als een van deze niet klopt.\n\n' +
      'Geef ALLEEN het compacte JSON object terug \u2014 GEEN uitleg-tekst, GEEN markdown code blocks. Houd tip-velden op maximaal 8 woorden. Begin direct met { en eindig met }.';

    function prijsBepalingPrompt(onderzoek) {
      return 'Product: "' + product + '"\n' + specTekst + '\n' +
        'Opgezochte prijsdata:\n' + formatOnderzoek(onderzoek) + '\n\n' +
        'Vul dit compacte JSON object in:\n' +
        '{"productnaam":"...","categorie":"categorie","nieuwprijs":100,"nieuwprijs_bron":"winkel + prijs, kort","marktplaats":{"laag":50,"gemiddeld":75,"hoog":100,"vertrouwen":"middel","tip":"max 8 woorden","verkooptijd":"1-4 weken","zoekwoorden":["woord"]},"ebay":{"laag":60,"gemiddeld":85,"hoog":110,"vertrouwen":"laag","tip":"max 8 woorden","verkooptijd":"2-6 weken","keywords":["word"]},"aandachtspunten":["max 3 korte punten"],"sanity_check_ok":true}';
    }

    try {
      setStap(2);
      var onderzoek1 = await haikuPrijsOnderzoek();
      if (!onderzoek1 || (!onderzoek1.nieuwprijs && (!onderzoek1.gevonden_prijzen || !onderzoek1.gevonden_prijzen.length))) {
        throw new Error('Kon geen bruikbare prijsdata vinden via zoeken. Probeer opnieuw of vul zelf een omschrijving toe.');
      }

      var prijzenTxt = await App.api.callClaude(prijzenSystem, prijsBepalingPrompt(onderzoek1), 1000, null, null, null, 'Prijsbepaling');
      var prijzen = App.api.parseJSON(prijzenTxt);
      var validatie = App.api.validatePrijzenResponse(prijzen);
      if (!validatie.valid) {
        throw new Error('Kon geen bruikbare marktprijzen ophalen (' + validatie.errors.join(' ') + '). Probeer opnieuw.');
      }

      // ── Deterministische plausibiliteitscheck (client-side, niet afhankelijk van of de AI het zelf meldt) ──
      // Alleen bij een verdacht resultaat volgt een gerichte, extra onderzoek + herbeoordeling — dus geen
      // structurele meerkosten voor de meerderheid van de analyses waar het resultaat al klopt. Ook deze
      // extra ronde gebruikt GEEN web search direct vanuit Sonnet — weer Haiku zoekt, Sonnet redeneert.
      var reden = h.beoordeelPlausibiliteit(prijzen);
      if (reden) {
        App.logger.warn('Prijsresultaat lijkt onbetrouwbaar (' + reden + '), extra validatie...');
        try {
          var onderzoek2 = await haikuPrijsOnderzoek(
            'Let extra goed op: een eerder onderzoek voor dit product leverde een twijfelachtig resultaat op (' + reden + '). ' +
            'Zoek gericht naar aanvullende, betrouwbare datapunten om dit te bevestigen of corrigeren.'
          );
          if (onderzoek2 && (onderzoek2.nieuwprijs || (onderzoek2.gevonden_prijzen && onderzoek2.gevonden_prijzen.length))) {
            var gecombineerd = {
              nieuwprijs: onderzoek2.nieuwprijs || onderzoek1.nieuwprijs,
              nieuwprijs_bron: onderzoek2.nieuwprijs_bron || onderzoek1.nieuwprijs_bron,
              gevonden_prijzen: (onderzoek1.gevonden_prijzen || []).concat(onderzoek2.gevonden_prijzen || []),
              aandachtspunten: (onderzoek1.aandachtspunten || []).concat(onderzoek2.aandachtspunten || [])
            };
            var verifTxt = await App.api.callClaude(prijzenSystem, prijsBepalingPrompt(gecombineerd), 1000, null, null, null, 'Validatie');
            var verifPrijzen = App.api.parseJSON(verifTxt);
            var verifValidatie = App.api.validatePrijzenResponse(verifPrijzen);
            if (verifValidatie.valid) { prijzen = verifPrijzen; }
          }
        } catch (verifErr) {
          App.logger.warn('Extra validatie mislukt, gebruik eerste resultaat:', verifErr.message);
        }
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

      // ── AI-kostenrapport voor deze analyse: console + bewaard voor het AI-kosten tabblad ──
      var rapport = App.aicalls.formatRapport(analyseId);
      if (rapport) {
        console.log(rapport);
        App.aicalls.setLaatsteRapport(rapport);
      }
    } catch (err) {
      App.logger.error('Analyse fout:', err.message);
      verbergStappen();
      toonMsg('analyse-err', err.message || 'Er ging iets mis. Probeer opnieuw.');
    } finally {
      setBtn('analyse-btn', 'analyse-btn-txt', false, '\uD83D\uDD0D Analyseer kavel');
      App.api.setAnalyseId(null);
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
