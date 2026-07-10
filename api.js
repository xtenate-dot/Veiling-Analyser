/**
 * api.js
 * Enige plek in de app die fetch() aanroept naar de Anthropic API.
 * Bevat: timeout (AbortController), retry bij netwerkfouten (niet bij API-fouten),
 * en validatie van de teruggekregen prijzendata.
 *
 * Let op API-key veiligheid: de key staat noodgedwongen in localStorage van de
 * browser, omdat deze app geen eigen backend heeft. Dat is voor persoonlijk
 * gebruik op een vertrouwd apparaat te overzien, maar niet ideaal:
 *   Browser  -->  eigen backend (bewaart de key server-side)  -->  Claude API
 * is de veiligere opzet zodra de app door meerdere mensen gebruikt wordt of
 * ergens publiek gehost wordt. Zonder backend: deel de app-URL nooit met de
 * key erin, gebruik een key met een uitgavenlimiet, en wis 'm als je een device
 * niet meer vertrouwt.
 */
(function (App) {
  'use strict';

  var ENDPOINT = 'https://api.anthropic.com/v1/messages';
  var MODEL = 'claude-sonnet-4-6';
  var MODEL_HAIKU = 'claude-haiku-4-5-20251001'; // goedkoper model ($1/$5 per MTok vs $3/$15) voor simpele, niet-prijskritische taken
  var TIMEOUT_MS = 45000;
  var MAX_RETRIES = 2; // alleen bij netwerkfouten, niet bij API/HTTP-fouten
  var WEBSEARCH_KOSTEN_PER_ZOEKOPDRACHT = 0.01; // $, vast Anthropic-tarief
  var EUR_PER_USD = 0.92; // vaste, geschatte koers — geen live wisselkoers-API om afhankelijkheden te vermijden

  // $ per miljoen tokens, officiele Anthropic-tarieven. Onbekend model -> valt terug op Sonnet-tarief.
  var PRIJZEN_PER_MODEL = {
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-haiku-4-5-20251001': { input: 1, output: 5 }
  };

  // Groepeert alle AI-calls die bij dezelfde "Analyseren"-actie horen, voor het rapport achteraf.
  // Simpele module-variabele i.p.v. een extra parameter overal doorheen, want de app doet nooit
  // twee analyses tegelijk (alles wordt sequentieel await'd).
  var huidigeAnalyseId = null;
  function setAnalyseId(id) { huidigeAnalyseId = id; }

  function getApiKey() { return App.storage.getRaw(App.storage.KEYS.apiKey, ''); }
  function setApiKey(key) { return App.storage.setRaw(App.storage.KEYS.apiKey, key); }
  function clearApiKey() { App.storage.remove(App.storage.KEYS.apiKey); }

  function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

  /**
   * Eén poging tot een API-call, met timeout via AbortController.
   * Gooit een Error met duidelijke .code ('timeout' | 'network' | 'api') zodat
   * de aanroeper weet of een retry zinvol is.
   */
  async function eenPoging(system, userText, maxTokens, images, tools, model, label) {
    var key = getApiKey();
    if (!key) { var e = new Error('Voer eerst een API key in.'); e.code = 'no-key'; throw e; }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    var start = Date.now();

    var content = [];
    if (images && images.length) {
      images.forEach(function (img) {
        content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
      });
    }
    content.push({ type: 'text', text: userText });

    var werkelijkModel = model || MODEL;
    var promptTekens = (system ? system.length : 0) + (userText ? userText.length : 0);
    var aantalAfbeeldingen = (images && images.length) || 0;
    var body = {
      model: werkelijkModel,
      max_tokens: maxTokens || 600,
      system: system,
      messages: [{ role: 'user', content: content }]
    };
    if (tools && tools.length) body.tools = tools;

    var resp;
    try {
      resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        var te = new Error('De AI reageerde niet binnen 45 seconden. Probeer het opnieuw.');
        te.code = 'timeout';
        throw te;
      }
      var ne = new Error('Netwerkfout: kon geen verbinding maken met de API.');
      ne.code = 'network';
      throw ne;
    }
    clearTimeout(timer);

    var data;
    try {
      data = await resp.json();
    } catch (err) {
      var pe = new Error('Onverwacht antwoord van de API (geen geldig JSON).');
      pe.code = 'api';
      throw pe;
    }

    if (data.error) {
      var ae = new Error(data.error.message || (data.error.type + ' fout van de API'));
      ae.code = 'api';
      throw ae;
    }
    if (!data.content) {
      var ce = new Error('Onverwachte API-response: geen content veld.');
      ce.code = 'api';
      throw ce;
    }

    // ── Kostenlog (voor het "AI-kosten"-tabblad) ──────────────────────────
    try {
      var usage = data.usage || {};
      var inputTokens = usage.input_tokens || 0;
      var outputTokens = usage.output_tokens || 0;
      var cacheReadTokens = usage.cache_read_input_tokens || 0;
      var cacheWriteTokens = usage.cache_creation_input_tokens || 0;
      var websearchAantal = (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
      var tarief = PRIJZEN_PER_MODEL[werkelijkModel] || PRIJZEN_PER_MODEL[MODEL];
      var kostenUSD = (inputTokens / 1e6) * tarief.input + (outputTokens / 1e6) * tarief.output +
        (cacheReadTokens / 1e6) * tarief.input * 0.1 + // cache-hit: ~10% van het normale input-tarief
        (cacheWriteTokens / 1e6) * tarief.input * 1.25 + // cache-write: ~1,25x het normale input-tarief (5 min TTL)
        websearchAantal * WEBSEARCH_KOSTEN_PER_ZOEKOPDRACHT;
      if (App.aicalls) {
        App.aicalls.log({
          tijd: Date.now(),
          analyseId: huidigeAnalyseId,
          label: label || '(onbekend)',
          model: werkelijkModel,
          api: (tools && tools.length) ? 'Web Search' : 'Messages',
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          cacheReadTokens: cacheReadTokens,
          cacheWriteTokens: cacheWriteTokens,
          websearchAantal: websearchAantal,
          aantalAfbeeldingen: aantalAfbeeldingen,
          promptTekens: promptTekens,
          promptTokensGeschat: Math.round(promptTekens / 4),
          kosten: kostenUSD,
          kostenEUR: kostenUSD * EUR_PER_USD,
          duurMs: Date.now() - start,
          ok: true
        });
      }
    } catch (logErr) {
      App.logger && App.logger.warn('Kon AI-call niet loggen:', logErr.message);
    }

    return data.content.map(function (b) { return b.text || ''; }).join('');
  }

  /**
   * callClaude met automatische retry bij netwerk-/timeoutfouten (max 2 extra pogingen).
   * API-fouten (bijv. ongeldige key, rate limit) worden NIET herhaald — die lossen
   * zichzelf niet op door het nog een keer te proberen.
   */
  async function callClaude(system, userText, maxTokens, images, tools, model, label) {
    var laatsteFout = null;
    for (var poging = 0; poging <= MAX_RETRIES; poging++) {
      try {
        return await eenPoging(system, userText, maxTokens, images, tools, model, label);
      } catch (err) {
        laatsteFout = err;
        var magOpnieuw = (err.code === 'network' || err.code === 'timeout') && poging < MAX_RETRIES;
        if (!magOpnieuw) throw err;
        App.logger.warn('API-poging', poging + 1, 'mislukt (' + err.code + '), opnieuw proberen...');
        await sleep(500 * (poging + 1)); // korte oplopende pauze
      }
    }
    throw laatsteFout;
  }

  /**
   * Zelfde als callClaude, maar met de web_search tool aan — gebruikt om bijv.
   * de sluitdatum/ophaaldatum van een kavelpagina op te zoeken. Geen retry op
   * API-fouten, wél op netwerk/timeout (via callClaude). maxUses begrenst het
   * aantal zoekopdrachten per aanroep, om de kosten (tokens + $0,01/zoekopdracht)
   * te beperken.
   */
  function callClaudeMetWebSearch(system, userText, maxTokens, maxUses, model, images, label) {
    return callClaude(system, userText, maxTokens, images || null, [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses || 3 }], model, label);
  }

  /**
   * Goedkope variant voor niet-prijskritische taken (identificatie: merk/model/
   * type/categorie/specs/staat/OCR, en datum-lookup): gebruikt Haiku ($1/$5 per
   * MTok) i.p.v. Sonnet ($3/$15 per MTok). NIET gebruiken voor de marktprijs-
   * analyse zelf — daar telt kwaliteit zwaarder dan de besparing.
   */
  function callHaikuMetWebSearch(system, userText, maxTokens, maxUses, images, label) {
    return callClaudeMetWebSearch(system, userText, maxTokens, maxUses, MODEL_HAIKU, images, label);
  }

  /** Haiku-aanroep zonder zoekfunctie (voor als er al genoeg info is, geen search nodig) */
  function callHaiku(system, userText, maxTokens, images, label) {
    return callClaude(system, userText, maxTokens, images || null, null, MODEL_HAIKU, label);
  }

  /**
   * Controleert of de door Claude teruggegeven prijzendata bruikbaar is.
   * Geeft { valid, errors[] } terug in plaats van te crashen op ontbrekende velden.
   */
  function validatePrijzenResponse(obj) {
    var errors = [];
    if (!obj || typeof obj !== 'object') { errors.push('Geen geldig JSON-object ontvangen.'); return { valid: false, errors: errors }; }
    if (!obj.productnaam || typeof obj.productnaam !== 'string') errors.push('Productnaam ontbreekt.');
    if (!obj.marktplaats || typeof obj.marktplaats !== 'object') {
      errors.push('Marktplaats-prijzen ontbreken.');
    } else {
      ['laag', 'gemiddeld', 'hoog'].forEach(function (veld) {
        if (typeof obj.marktplaats[veld] !== 'number' || !isFinite(obj.marktplaats[veld])) {
          errors.push('Marktplaats.' + veld + ' is geen geldig getal.');
        }
      });
    }
    if (obj.nieuwprijs != null && (typeof obj.nieuwprijs !== 'number' || !isFinite(obj.nieuwprijs))) {
      errors.push('Nieuwprijs is geen geldig getal.');
    }
    if (obj.ebay && typeof obj.ebay === 'object') {
      ['laag', 'gemiddeld', 'hoog'].forEach(function (veld) {
        if (obj.ebay[veld] != null && (typeof obj.ebay[veld] !== 'number' || !isFinite(obj.ebay[veld]))) {
          errors.push('eBay.' + veld + ' is geen geldig getal.');
        }
      });
    }
    return { valid: errors.length === 0, errors: errors };
  }

  App.api = {
    callClaude: callClaude,
    callClaudeMetWebSearch: callClaudeMetWebSearch,
    callHaikuMetWebSearch: callHaikuMetWebSearch,
    callHaiku: callHaiku,
    setAnalyseId: setAnalyseId,
    MODEL_HAIKU: MODEL_HAIKU,
    getApiKey: getApiKey,
    setApiKey: setApiKey,
    clearApiKey: clearApiKey,
    validatePrijzenResponse: validatePrijzenResponse,
    parseJSON: function (txt) { return App.helpers.parseLooseJSON(txt); }
  };
})(window.App = window.App || {});
