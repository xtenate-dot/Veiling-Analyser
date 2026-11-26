// Tests voor kostenboek, foutregistratie, zoeklog en de tweede zoekronde (nagebootste AI, geen netwerk)
const assert = require('assert');
globalThis.global = globalThis;
require('../kern.js');
const K = globalThis.VAKern;
const MODEL = 'claude-haiku-5-5';
const usage = (i, o, z) => ({ input_tokens: i, output_tokens: o, server_tool_use: z ? { web_search_requests: z } : undefined });
const kost = (i, o, z) => K.apiKostenVan(MODEL, usage(i, o, z));
const adv = (t, p, soort) => ({ platform: 'Marktplaats', titel: t, prijs: p, soort: soort || 'vraagprijs', staat: '', datum: null, url: 'https://www.marktplaats.nl/a/' + encodeURIComponent(t) });
const prijsJson = (ads) => JSON.stringify({ productnaam: 'iPhone 13 128GB', categorie: 'telefoon', nieuwprijs: null, tweedehands: ads, marktplaats: { laag: 300, gemiddeld: 350, hoog: 400, werkend_gemiddeld: null, vertrouwen: 'hoog', aantal_vergelijkbaar: ads.length, tip: '', verkooptijd: '', zoekwoorden: [] }, ebay: { laag: null, gemiddeld: null, hoog: null, vertrouwen: 'laag' }, partij: null, toelichting: 'x', aandachtspunten: [] });
const antwoord = (tekst, u, extraBlokken) => ({ stop_reason: 'end_turn', content: (extraBlokken || []).concat([{ type: 'text', text: tekst }]), usage: u });
const zoekBlokken = (n) => Array.from({ length: n }, (_, i) => [{ type: 'server_tool_use', id: 's' + i, name: 'web_search', input: { query: 'q' + i } },
  { type: 'web_search_tool_result', tool_use_id: 's' + i, content: [{ type: 'web_search_result', url: 'https://www.marktplaats.nl/l/' + i, title: 't' }] }]).flat();
const GOED = [adv('Apple iPhone 13 128GB blauw', 400), adv('iPhone 13 128 GB zwart', 380), adv('Apple iPhone 13 128GB', 390)];
const SLECHT = [adv('Apple iPhone 13 256GB', 450), adv('iPhone 12 128GB', 300)];
const basis = (anthropic, extra) => Object.assign({ anthropic, modelPagina: MODEL, modelPrijzen: MODEL, maxZoek: 1 }, extra);
let n = 0; const t = async (naam, f) => { await f(); n++; console.log('ok -', naam); };

(async () => {
  await t('kostenboek telt elk antwoord één keer en komt overeen met de som van de antwoorden', async () => {
    const antw = [antwoord(prijsJson(SLECHT), usage(1000, 500, 1), zoekBlokken(1)), antwoord(prijsJson(GOED), usage(2000, 700, 2), zoekBlokken(2))];
    let i = 0;
    const res = await K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async () => antw[i++]));
    assert.strictEqual(res.boekhouding.verzoeken, 2);
    assert.strictEqual(res.boekhouding.zoekopdrachten, 3);
    const verwacht = kost(1000, 500, 1) + kost(2000, 700, 2);
    assert.ok(Math.abs(res.usd - verwacht) < 1e-9, res.usd + ' vs ' + verwacht);
    assert.strictEqual(res.usd, res.boekhouding.usd);
  });

  await t('een mislukte poging (API-fout) staat in het logboek met de echte reden, en kosten blijven staan', async () => {
    let i = 0;
    const fout = Object.assign(new Error('Overloaded'), { apiType: 'overloaded_error', status: 529 });
    // beurt 1 pauzeert (kost geld), beurt 2 faalt
    const pauze = { stop_reason: 'pause_turn', content: zoekBlokken(1), usage: usage(1000, 100, 1) };
    const res = await K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async () => {
      i++;
      if (i === 1) return pauze;
      if (i === 2) throw fout;
      return antwoord(prijsJson(GOED), usage(500, 300, 0));
    }));
    assert.strictEqual(res.boekhouding.fouten.length, 1);
    assert.strictEqual(res.boekhouding.fouten[0].melding, 'Overloaded');
    assert.strictEqual(res.boekhouding.fouten[0].soort, 'overloaded_error');
    assert.ok(res.boekhouding.usd >= kost(1000, 100, 1));
    assert.strictEqual(res.usd, res.boekhouding.usd);
  });

  await t('analyse die faalt geeft de kosten tot dan toe mee op de fout', async () => {
    const fout = Object.assign(new Error('Ongeldige sleutel'), { apiType: 'authentication_error', status: 401 });
    let i = 0;
    await assert.rejects(K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async () => { i++; if (i === 1) return { stop_reason: 'pause_turn', content: zoekBlokken(1), usage: usage(100, 10, 1) }; throw fout; })), e => {
      assert.ok(e.boekhouding && e.boekhouding.fouten.length >= 1 && e.boekhouding.fouten.every(f => f.melding === 'Ongeldige sleutel')); assert.ok(e.usd >= kost(100, 10, 1)); return true;
    });
  });

  await t('zoeklog: mislukte zoekopdracht en geslaagde zonder resultaat zijn te onderscheiden', async () => {
    const blokken = [
      { type: 'server_tool_use', id: 'a', name: 'web_search', input: { query: 'mislukt' } },
      { type: 'web_search_tool_result', tool_use_id: 'a', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } },
      { type: 'server_tool_use', id: 'b', name: 'web_search', input: { query: 'leeg' } },
      { type: 'web_search_tool_result', tool_use_id: 'b', content: [] }
    ];
    const r = await K.vraagClaude({ model: MODEL, prompt: 'x' }, { anthropic: async () => antwoord('{"a":1}', usage(10, 10, 2), blokken) });
    assert.strictEqual(r.zoeklog.length, 2);
    assert.strictEqual(r.zoeklog[0].fout, 'unavailable'); assert.strictEqual(r.zoeklog[0].resultaten, undefined);
    assert.strictEqual(r.zoeklog[1].resultaten, 0); assert.strictEqual(r.zoeklog[1].fout, undefined);
  });

  await t('ophaalfout wordt in het zoeklog gezet', async () => {
    const blokken = [{ type: 'server_tool_use', id: 'f', name: 'web_fetch', input: { url: 'https://x.nl/p' } },
      { type: 'web_fetch_tool_result', tool_use_id: 'f', content: { type: 'web_fetch_tool_error', error_code: 'url_not_accessible' } }];
    const r = await K.vraagClaude({ model: MODEL, prompt: 'x' }, { anthropic: async () => antwoord('{"a":1}', usage(10, 10), blokken) });
    assert.strictEqual(r.zoeklog[0].fout, 'url_not_accessible'); assert.strictEqual(r.zoeklog[0].url, 'https://x.nl/p');
  });

  await t('tweede ronde bij <2 passend, ongeacht wat de AI als vertrouwen opgeeft', async () => {
    let i = 0; const bodies = [];
    const res = await K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async (b) => { bodies.push(b); return i++ === 0 ? antwoord(prijsJson(SLECHT), usage(1000, 500, 1), zoekBlokken(1)) : antwoord(prijsJson(GOED), usage(1000, 500, 2), zoekBlokken(2)); }));
    assert.strictEqual(bodies.length, 2);
    assert.strictEqual(res.prijzen.tweede_ronde, true);
    assert.strictEqual(res.prijzen.betrouwbaarheid.aantal_passend, 3);
    assert.ok(/gekozen: tweede/.test(res.prijzen.tweede_ronde_info));
    assert.ok(res.prijzen.zoeklog.some(z => z.ronde === 1) && res.prijzen.zoeklog.some(z => z.ronde === 2));
    assert.strictEqual(res.usd, res.boekhouding.usd);
  });

  await t('geen tweede ronde bij 2 of meer passende advertenties', async () => {
    let calls = 0;
    const res = await K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async () => { calls++; return antwoord(prijsJson(GOED), usage(1000, 500, 1), zoekBlokken(1)); }));
    assert.strictEqual(calls, 1); assert.strictEqual(res.prijzen.tweede_ronde, false);
  });

  await t('tweede ronde uit te zetten en nooit zonder zoeken', async () => {
    let calls = 0;
    await K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async () => { calls++; return antwoord(prijsJson(SLECHT), usage(10, 10, 1), zoekBlokken(1)); }, { tweedeRonde: false }));
    assert.strictEqual(calls, 1);
    calls = 0;
    await K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async () => { calls++; return antwoord(prijsJson(SLECHT), usage(10, 10, 0)); }, { maxZoek: 0 }));
    assert.ok(calls <= 2); // maxZoek 0: geen zoekronde, schatting op de reserve-route
  });

  await t('kostenbudget: tweede ronde wordt overgeslagen en de reden staat erbij', async () => {
    let calls = 0;
    const res = await K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async () => { calls++; return antwoord(prijsJson(SLECHT), usage(1000, 500, 1), zoekBlokken(1)); }, { maxUsdPerAnalyse: 0.005 }));
    assert.strictEqual(calls, 1); assert.ok(/kostenbudget/.test(res.prijzen.tweede_ronde_overgeslagen));
    assert.strictEqual(res.prijzen.tweede_ronde, false);
  });

  await t('tweede ronde mislukt: eerste resultaat blijft, fout en kosten staan erbij', async () => {
    let i = 0;
    const res = await K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async () => {
      if (i++ === 0) return antwoord(prijsJson(SLECHT), usage(1000, 500, 1), zoekBlokken(1));
      throw Object.assign(new Error('Overloaded'), { apiType: 'overloaded_error', status: 529 });
    }));
    assert.strictEqual(res.prijzen.tweede_ronde, true); assert.ok(/Overloaded/.test(res.prijzen.tweede_ronde_fout));
    assert.strictEqual(res.boekhouding.fouten[0].melding, 'Overloaded');
    assert.strictEqual(res.usd, res.boekhouding.usd);
  });

  await t('tweede ronde die niet beter is: de eerste blijft gekozen en kosten tellen allebei', async () => {
    let calls = 0;
    const res = await K.analyseer({ extra: 'iPhone 13 128GB' }, basis(async () => { calls++; return antwoord(prijsJson(SLECHT), usage(1000, 500, 1), zoekBlokken(1)); }));
    assert.strictEqual(calls, 2); assert.ok(/gekozen: eerste/.test(res.prijzen.tweede_ronde_info));
    assert.ok(Math.abs(res.usd - 2 * kost(1000, 500, 1)) < 1e-9);
  });

  console.log(n + ' tests ok');
})().catch(e => { console.error(e); process.exit(1); });
