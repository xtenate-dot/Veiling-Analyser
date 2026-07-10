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
  var TIMEOUT_MS = 45000;
  var MAX_RETRIES = 2; // alleen bij netwerkfouten, niet bij API/HTTP-fouten

  function getApiKey() { return App.storage.getRaw(App.storage.KEYS.apiKey, ''); }
  function setApiKey(key) { return App.storage.setRaw(App.storage.KEYS.apiKey, key); }
  function clearApiKey() { App.storage.remove(App.storage.KEYS.apiKey); }

  function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

  /**
   * Eén poging tot een API-call, met timeout via AbortController.
   * Gooit een Error met duidelijke .code ('timeout' | 'network' | 'api') zodat
   * de aanroeper weet of een retry zinvol is.
   */
  async function eenPoging(system, userText, maxTokens, images, tools) {
    var key = getApiKey();
    if (!key) { var e = new Error('Voer eerst een API key in.'); e.code = 'no-key'; throw e; }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    var content = [];
    if (images && images.length) {
      images.forEach(function (img) {
        content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
      });
    }
    content.push({ type: 'text', text: userText });

    var body = {
      model: MODEL,
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
    return data.content.map(function (b) { return b.text || ''; }).join('');
  }

  /**
   * callClaude met automatische retry bij netwerk-/timeoutfouten (max 2 extra pogingen).
   * API-fouten (bijv. ongeldige key, rate limit) worden NIET herhaald — die lossen
   * zichzelf niet op door het nog een keer te proberen.
   */
  async function callClaude(system, userText, maxTokens, images, tools) {
    var laatsteFout = null;
    for (var poging = 0; poging <= MAX_RETRIES; poging++) {
      try {
        return await eenPoging(system, userText, maxTokens, images, tools);
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
  function callClaudeMetWebSearch(system, userText, maxTokens, maxUses) {
    return callClaude(system, userText, maxTokens, null, [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses || 3 }]);
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
    getApiKey: getApiKey,
    setApiKey: setApiKey,
    clearApiKey: clearApiKey,
    validatePrijzenResponse: validatePrijzenResponse,
    parseJSON: function (txt) { return App.helpers.parseLooseJSON(txt); }
  };
})(window.App = window.App || {});
