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
    var moetPaginaLezen = !!url && (!heeftGoedeNaam || !sluitdag || !ophaaldag);
    if (moetPaginaLezen) {
      try {
        // web_fetch i.p.v. web_search: we kennen de URL al exact, dus "zoeken" ernaar is
        // pure verspilling. web_fetch haalt precies díe ene pagina op, met een harde
        // max_content_tokens-limiet, en zonder de $0,01/zoekopdracht-toeslag van web_search.
        var zoekSystem = 'Je bent een assistent die een specifieke veilingkavel-pagina leest (via web_fetch). Bepaal een preciezere productnaam ' +
          '(merk, model, type, specificaties) en/of de sluitdatum en ophaaldatum van de veiling. Haal ALLEEN deze specifieke gegevens uit de pagina, negeer navigatie, reviews en overige inhoud. ' +
          'BEPAAL GEEN marktprijs. Geef ALLEEN een compact JSON object terug, GEEN markdown, GEEN uitleg. Begin direct met { en eindig met }.';
        var zoekUser = 'Haal deze pagina op en lees hem: ' + url + '\n' +
          'Vermoedelijk product (nog te bevestigen/verbeteren): ' + product + '\n' +
          '\nAntwoord in dit exacte formaat:\n' +
          '{"productnaam":"...","merk":"...","model":"...","opslag":"...","ram":"...","sluitdag":"JJJJ-MM-DD","ophaaldag":"JJJJ-MM-DD"}\n' +
          'Gebruik null voor een veld dat je niet met zekerheid op de pagina kunt vinden.';
        var zoekTxt = await App.api.callHaikuMetWebFetch(zoekSystem, zoekUser, 400, 3000, 'Datum/naam-lookup');
        zoekInfo = h.parseLooseJSON(zoekTxt);

        // Check specifiek de velden die we nog misten (niet "iets, wat dan ook"): als we alleen
        // de datums nodig hadden en die zijn nog steeds leeg, is web_fetch feitelijk mislukt voor
        // het doel waarvoor we hem aanriepen, ook al kwam er wel een naam/merk/model uit terug
        // (die kunnen ook uit de URL-slug zelf komen, dus dat bewijst niet dat de fetch werkte).
        var nogSteedsGeenNaam = !heeftGoedeNaam && !(zoekInfo && zoekInfo.productnaam);
        var nogSteedsGeenDatums = (!sluitdag && !(zoekInfo && zoekInfo.sluitdag)) || (!ophaaldag && !(zoekInfo && zoekInfo.ophaaldag));
        var mistNogSteedsIets = !zoekInfo || nogSteedsGeenNaam || nogSteedsGeenDatums;
        console.log('[DEBUG Datum/naam-lookup] na web_fetch: nogSteedsGeenNaam=' + nogSteedsGeenNaam + ', nogSteedsGeenDatums=' + nogSteedsGeenDatums);
        if (mistNogSteedsIets) {
          var isTroostwijk = /troostwijkauctions\.com/i.test(url);
          var alleenDatumsMissen = !nogSteedsGeenNaam && nogSteedsGeenDatums;
          if (isTroostwijk && alleenDatumsMissen) {
            // Troostwijk-kavelpaginas bleken herhaaldelijk niet vindbaar via web_search (2x
            // geprobeerd in eerdere tests, 2x niks gevonden \u2014 waarschijnlijk client-side
            // gerenderd en slecht geindexeerd). Sluit/ophaaldatum zijn niet prijskritisch, dus
            // hier NIET nog een dure zoekronde starten \u2014 vul de datums zo nodig zelf in.
            console.log('[DEBUG Datum/naam-lookup] Troostwijk-pagina, alleen datums missen \u2014 fallback overgeslagen (bleek in de praktijk zelden iets op te leveren; niet prijskritisch). Vul zo nodig zelf in.');
          } else {
            // Fallback: sommige kavelpagina's zijn client-side gerenderd (React/Next.js) waardoor
            // een directe fetch een lege of onvolledige pagina teruggeeft. web_search vindt de
            // content dan vaak alsnog via een geindexeerde/gecachte versie. Duurder, maar alleen
            // als vangnet — de meerderheid van de kavels zou dit punt niet moeten bereiken.
            App.logger.warn('web_fetch leverde niet alles op wat nodig was, terugvallen op web_search...');
            var fallbackSystem = 'Je bent een assistent die met de zoekfunctie een online veilingkavel-pagina leest. Bepaal een preciezere productnaam ' +
              '(merk, model, type, specificaties) en/of de sluitdatum en ophaaldatum van de veiling. Haal alleen deze specifieke gegevens eruit, niet de volledige paginatekst. ' +
              'BEPAAL GEEN marktprijs. Gebruik \u00e9\u00e9n gerichte zoekopdracht. ' +
              'Geef ALLEEN een compact JSON object terug, GEEN markdown, GEEN uitleg. Begin direct met { en eindig met }.';
            var fallbackTxt = await App.api.callHaikuMetWebSearch(fallbackSystem, zoekUser, 400, 1, null, 'Datum/naam-lookup (fallback)');
            var fallbackInfo = h.parseLooseJSON(fallbackTxt);
            // Combineer i.p.v. overschrijven: wat web_fetch al wél goed vond (bijv. merk/model) blijft
            // staan als de fallback dat veld zelf niet vond.
            if (fallbackInfo) {
              zoekInfo = {
                productnaam: fallbackInfo.productnaam || (zoekInfo && zoekInfo.productnaam) || null,
                merk: fallbackInfo.merk || (zoekInfo && zoekInfo.merk) || null,
                model: fallbackInfo.model || (zoekInfo && zoekInfo.model) || null,
                opslag: fallbackInfo.opslag || (zoekInfo && zoekInfo.opslag) || null,
                ram: fallbackInfo.ram || (zoekInfo && zoekInfo.ram) || null,
                sluitdag: fallbackInfo.sluitdag || (zoekInfo && zoekInfo.sluitdag) || null,
                ophaaldag: fallbackInfo.ophaaldag || (zoekInfo && zoekInfo.ophaaldag) || null
              };
            }
          }
        }
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
    //
    // ── Herzien op basis van debug-bevindingen ──────────────────────────────────
    // Bleek dat Haiku's web_search vooral eBay categorie-/zoekpaginas (/shop/, /b/,
    // /sch/) teruggaf i.p.v. individuele advertenties met een echte prijs, waardoor
    // Haiku geen bruikbare data kon verzamelen. Nieuwe verdeling: Haiku zoekt alleen
    // naar en selecteert kandidaat-URLs (waar hij prima in is); Sonnet leest die
    // paginas zelf via web_fetch en bepaalt direct de prijs (waar Sonnet's sterkere
    // redeneervermogen nodig is — met name om troep-pagina's te doorzien).
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

    var NIEUW_DOMEINEN = ['bol.com', 'coolblue.nl', 'coolblueoutlet.nl', 'mediamarkt.nl', 'amazon.nl', 'iused.nl', 'backmarket.nl', 'amac.nl', 'apple.com'];
    var TWEEDEHANDS_DOMEINEN = ['marktplaats.nl', 'ebay.nl', 'ebay.com', '2dehands.be'];

    // Patronen van categorie-/zoek-/browsepaginas die nooit een concrete productprijs tonen.
    // Dit is een keiharde code-filter — geen "AI graag vermijden"-verzoek, die bleek niet
    // waterdicht (vandaar de eBay /shop/ /b/ paginas die de vorige versie doorliet).
    // LET OP: /shop/, /b/, /sch/, /str/ zijn eBay-specifieke categorie-/winkel-conventies —
    // diezelfde substrings komen ook voor in legitieme URLs van andere sites (bijv. Apple's
    // "/shop/product/..." voor een ECHTE refurbished-productpagina), dus alleen toepassen op eBay.
    var EBAY_JUNK_PATRONEN = [/\/shop\//i, /\/b\//i, /\/sch\//i, /\/str\//i];
    var ALGEMENE_JUNK_PATRONEN = [/\/search\?/i, /\/c\/[a-z0-9-]+$/i];
    function isBruikbareUrl(url) {
      if (!url) return false;
      var isEbay = /(^|\.)ebay\.[a-z.]+\//i.test(url);
      if (isEbay && EBAY_JUNK_PATRONEN.some(function (re) { return re.test(url); })) return false;
      if (ALGEMENE_JUNK_PATRONEN.some(function (re) { return re.test(url); })) return false;
      return true;
    }

    // Zoekterm wordt met gewone code opgebouwd uit de al bekende specs — geen AI nodig om te
    // "bedenken" waarnaar gezocht moet worden, dat is puur stringmanipulatie.
    function bouwZoekterm() {
      var delen = [];
      if (identificatie) {
        if (identificatie.merk) delen.push(identificatie.merk);
        if (identificatie.model) delen.push(identificatie.model);
        if (identificatie.opslag) delen.push(identificatie.opslag);
        if (identificatie.ram) delen.push(identificatie.ram);
      }
      return delen.length >= 2 ? delen.join(' ') : product;
    }

    // (a) Haiku: voert de exacte, kant-en-klare zoekopdracht uit en geeft de RUWE resultaten
    // terug — geen eigen zoektermen bedenken, geen eigen selectie/filtering. Dat scheelt
    // "denk"-tokens en maakt het gedrag voorspelbaar. Het filteren (junk-URLs eruit, max 5)
    // gebeurt hierna in gewone JS, niet door de AI.
    //
    // BELANGRIJK: dit gebeurt nu 2x met een APARTE, domein-gerichte zoekopdracht — één keer
    // gericht op nieuw/refurbished-bronnen, één keer op tweedehands-bronnen. Eén algemene
    // zoekopdracht bleek in de praktijk vaak alleen tweedehands/eBay-resultaten op te leveren
    // (die site domineert de zoekresultaten voor gebruikte elektronica), waardoor Sonnet géén
    // enkele echte nieuwprijs-bron kreeg en noodgedwongen een losse advertentie als "nieuwprijs"
    // gebruikte (bijv. een eBay-listing van een refurbisher/goede-doel-verkoper).
    async function haikuVindUrls(zoekterm, domeinen, categorie, extraInstructie) {
      var system = 'Voer met de zoekfunctie EXACT de gegeven zoekopdracht uit \u2014 verzin zelf geen andere of aanvullende zoektermen. ' +
        'Geef ALLE gevonden resultaten terug (url, bron, titel), zonder zelf te selecteren of te filteren \u2014 dat gebeurt door een ander systeem. Houd elke titel op maximaal 8 woorden, anders past de lijst niet in de antwoordruimte.\n' +
        (extraInstructie ? extraInstructie + '\n' : '') +
        'Gebruik de zoekopdracht \u00e9\u00e9nmaal; alleen als dat letterlijk nul resultaten oplevert mag je het \u00e9\u00e9n keer opnieuw proberen.\n' +
        'Geef ALTIJD een geldig, compact JSON object terug. GEEN markdown, GEEN uitleg, GEEN Engelstalige tekst, GEEN excuses \u2014 uitsluitend JSON. ' +
        'Geen resultaten? Geef een lege lijst terug in hetzelfde format \u2014 NOOIT vrije tekst. Begin direct met { en eindig met }.';
      var userText = 'Zoekopdracht: "' + zoekterm + '"\n\n' +
        'Antwoord in dit exacte formaat:\n' +
        '{"kandidaten":[{"url":"https://...","bron":"Marktplaats","titel":"korte titel"}]}';
      var txt = await App.api.callHaikuMetWebSearch(system, userText, 900, 2, null, 'URL-onderzoek (' + categorie + ')', domeinen);
      var resultaat = h.parseLooseJSON(txt);
      var ruweKandidaten = (resultaat && Array.isArray(resultaat.kandidaten)) ? resultaat.kandidaten.filter(function (k) { return k && k.url; }) : [];
      var kandidaten = ruweKandidaten.filter(function (k) { return isBruikbareUrl(k.url); }).map(function (k) { k.categorie = categorie; return k; });
      console.log('[DEBUG URL-onderzoek (' + categorie + ')] zoekterm: "' + zoekterm + '" \u2014 ' + ruweKandidaten.length + ' ruwe resultaten, ' + kandidaten.length + ' na junk-URL-filter:', kandidaten);
      if (ruweKandidaten.length !== kandidaten.length) {
        console.log('[DEBUG URL-onderzoek (' + categorie + ')] afgekeurd door junk-URL-filter:', ruweKandidaten.filter(function (k) { return !isBruikbareUrl(k.url); }).map(function (k) { return k.url; }));
      }
      return kandidaten.slice(0, 3);
    }

    async function vindAlleKandidaten(zoekterm, extraInstructie) {
      // Parallel i.p.v. na elkaar: zelfde tokens/kosten, maar ongeveer 2x sneller — deze twee
      // zoekopdrachten zijn onafhankelijk van elkaar, dus hoeven niet te wachten.
      var resultaten = await Promise.all([
        haikuVindUrls(zoekterm + ' prijs', NIEUW_DOMEINEN, 'nieuw/refurbished', extraInstructie),
        haikuVindUrls(zoekterm, TWEEDEHANDS_DOMEINEN, 'tweedehands', extraInstructie)
      ]);
      return resultaten[0].concat(resultaten[1]);
    }

    var prijzenSystem = 'Je bent een Nederlandse marktprijsexpert voor tweedehands/veilingproducten. Je krijgt een lijst kandidaat-URLs, elk gelabeld met een categorie ("nieuw/refurbished" of "tweedehands") \u2014 gebruik web_fetch om ze te lezen en bepaal op basis daarvan de marktprijs. Doe zelf GEEN nieuwe zoekopdracht (geen web_search), alleen web_fetch op de gegeven URLs.\n\n' +
      'WERKWIJZE (verplicht):\n' +
      '1. Fetch de gegeven kandidaat-URLs en haal er de prijs, conditie en relevante specificaties uit. Sla een URL over als de pagina geen concrete prijs voor dit product bevat.\n' +
      '2. NIEUWPRIJS: gebruik UITSLUITEND een URL gelabeld "nieuw/refurbished" (een officiele winkel- of refurbished-winkelpagina) als bron voor "nieuwprijs". ' +
      'NOOIT een individuele advertentie/listing van een verkoper (marktplaats, een specifieke eBay-listing van \u00e9\u00e9n verkoper) als nieuwprijs gebruiken, ook niet als die verkoper het zelf "nieuw" noemt \u2014 dat is een tweedehands-databron, geen officiele prijs. Is er geen bruikbare "nieuw/refurbished"-URL bij? Zet nieuwprijs op null en meld dit in aandachtspunten \u2014 gok niet.\n' +
      '3. Groepeer de gevonden tweedehandsprijzen (van de "tweedehands"-gelabelde URLs) naar bron: Marktplaats-achtig apart van eBay-achtig. Bepaal per groep een laag/gemiddeld/hoog-bereik.\n' +
      '4. Vergelijk de datapunten onderling: een prijs die sterk afwijkt van de mediaan (bijv. >50% verschil) is een uitschieter \u2014 negeer die voor je eindberekening.\n' +
      '5. Sanity check: (a) is de tweedehandsprijs lager dan de nieuw/refurbished-prijs? (b) ligt de prijs niet >30% boven de nieuw/refurbished-prijs? (c) is de prijs niet extreem afwijkend van de gevonden datapunten? Zet "sanity_check_ok" op false als een van deze niet klopt of als er geen betrouwbare nieuwprijs gevonden is.\n\n' +
      'Als de gefetchte paginas onvoldoende bruikbare prijsinformatie bevatten: vul het JSON-format ALSNOG volledig in met je beste schatting op basis van eigen kennis, zet dan alle "vertrouwen"-velden op "laag", zet "sanity_check_ok" op false, en noem dit expliciet in aandachtspunten. Geef NOOIT vrije tekst, uitleg of een ander format terug \u2014 altijd het onderstaande compacte JSON-object, GEEN markdown code blocks. Houd tip-velden op maximaal 8 woorden. Begin direct met { en eindig met }.';

    function prijsBepalingPrompt(kandidaten, extraContext) {
      var urlLijst = kandidaten.length
        ? kandidaten.map(function (k) { return '- [' + (k.categorie || '?') + '] ' + k.url + (k.bron ? ' (' + k.bron + ')' : '') + (k.titel ? ': ' + k.titel : ''); }).join('\n')
        : '(geen kandidaat-URLs gevonden \u2014 gebruik je eigen kennis voor een voorzichtige schatting, met lage vertrouwen-waardes, en zet nieuwprijs op null als je niet zeker bent)';
      return 'Product: "' + product + '"\n' + specTekst + '\n' +
        'Kandidaat-URLs om te fetchen:\n' + urlLijst + '\n\n' +
        (extraContext ? extraContext + '\n\n' : '') +
        'Vul dit compacte JSON object in:\n' +
        '{"productnaam":"...","categorie":"categorie","nieuwprijs":100,"nieuwprijs_bron":"winkel + prijs, kort (of null als geen betrouwbare bron)","marktplaats":{"laag":50,"gemiddeld":75,"hoog":100,"vertrouwen":"middel","tip":"max 8 woorden","verkooptijd":"1-4 weken","zoekwoorden":["woord"]},"ebay":{"laag":60,"gemiddeld":85,"hoog":110,"vertrouwen":"laag","tip":"max 8 woorden","verkooptijd":"2-6 weken","keywords":["word"]},"aandachtspunten":["max 3 korte punten"],"sanity_check_ok":true}';
    }

    function bouwFetchTool(kandidaten) {
      // web_fetch_20250910 (i.p.v. de "dynamic filtering"-versie 20260209): die laatste start
      // onder water een code_execution-sandbox op, en dat liep bij eBay-pagina's vast in een
      // lus van mislukte Python-pogingen — 35k+ tokens en 44s voor uiteindelijk niks. De
      // simpele fetch-versie is trager om te "filteren" maar werkt voorspelbaar en snel.
      return kandidaten.length ? [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: kandidaten.length, max_content_tokens: 3000 }] : null;
    }

    try {
      setStap(2);
      var zoekterm = bouwZoekterm();
      var kandidaten1 = await vindAlleKandidaten(zoekterm);

      var prijzenTxt = await App.api.callClaude(prijzenSystem, prijsBepalingPrompt(kandidaten1), 1400, null, bouwFetchTool(kandidaten1), null, 'Prijsbepaling');
      var prijzen = App.api.parseJSON(prijzenTxt);
      var validatie = App.api.validatePrijzenResponse(prijzen);
      if (!validatie.valid) {
        throw new Error('Kon geen bruikbare marktprijzen ophalen (' + validatie.errors.join(' ') + '). Probeer opnieuw.');
      }

      // ── Deterministische plausibiliteitscheck (client-side, niet afhankelijk van of de AI het zelf meldt) ──
      // Alleen bij een verdacht resultaat volgt een gerichte, extra URL-zoektocht + herbeoordeling — dus
      // geen structurele meerkosten voor de meerderheid van de analyses waar het resultaat al klopt.
      var reden = h.beoordeelPlausibiliteit(prijzen);
      if (reden) {
        App.logger.warn('Prijsresultaat lijkt onbetrouwbaar (' + reden + '), extra validatie...');
        try {
          // Tweede zoekterm iets breder (zonder RAM/opslag-precisie) als vangnet — nog steeds
          // met code opgebouwd, geen AI die zelf een nieuwe zoekterm bedenkt.
          var zoekterm2 = (identificatie && identificatie.merk && identificatie.model)
            ? identificatie.merk + ' ' + identificatie.model
            : zoekterm;
          var kandidaten2 = await vindAlleKandidaten(zoekterm2, 'Dit is een controlezoekopdracht \u2014 een eerder resultaat voor dit product leek twijfelachtig (' + reden + ').');
          var kandidatenGecombineerd = kandidaten1.concat(kandidaten2).slice(0, 8);
          var verifTxt = await App.api.callClaude(
            prijzenSystem,
            prijsBepalingPrompt(kandidatenGecombineerd, 'Dit is een extra controleronde omdat het eerdere resultaat verdacht leek: ' + reden + '.'),
            1400, null, bouwFetchTool(kandidatenGecombineerd), null, 'Validatie'
          );
          var verifPrijzen = App.api.parseJSON(verifTxt);
          var verifValidatie = App.api.validatePrijzenResponse(verifPrijzen);
          if (verifValidatie.valid) { prijzen = verifPrijzen; }
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

      // ── Betrouwbaarheidscheck vóór het advies ────────────────────────────────
      // De AI levert al "vertrouwen" (per prijsblok) en "sanity_check_ok" op, maar die
      // signalen werden tot nu toe nergens gebruikt: een "laag vertrouwen"-schatting kreeg
      // gewoon een volwaardig kopen/skip-advies alsof de prijs hard was. Dat is de kern van
      // situaties als "MacBook €1100 -> AI zegt €3000". Voortaan: bij een onzeker signaal
      // GEEN kopen/skip-advies, wel de cijfers tonen (nuttig als indicatie) maar duidelijk
      // gelabeld als niet-hard, zodat de gebruiker zelf moet controleren.
      var onzekerePrijs = prijzen.sanity_check_ok === false || (mp && mp.vertrouwen === 'laag');

      var advies = 'twijfel', adviesReden = '', roi = 50;
      if (onzekerePrijs) {
        advies = 'onzeker';
        adviesReden = 'Onvoldoende betrouwbare prijsdata gevonden \u2014 de schatting is niet hard genoeg voor een kopen/skip-advies. Controleer de prijs handmatig voordat je biedt.';
        roi = null;
      } else if (kosten) {
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
        roi: (roi == null ? null : Math.round(roi)), prijzen: prijzen, maxBod: maxBod,
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
