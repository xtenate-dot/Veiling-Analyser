// Website: geen horizontaal scrollen, lettertypes geladen, alle interne links werken.
// Draaien: node server/kopieer-app.mjs && (cd server/public && python3 -m http.server 8090 &) && node tests/site.test.cjs uitvoer
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const out = process.argv[2];
  const paginas = ['index.html', 'prijzen.html', 'veilinggids/index.html', 'veilinggids/troostwijk.html', 'verhalen/margeregeling-of-btw.html', 'over.html', 'en/index.html'];
  let fout = 0;
  for (const [w, h, tag] of [[390, 844, 'tel'], [1280, 900, 'pc']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const fouten = [];
    p.on('pageerror', e => fouten.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/api\/reviews|404/.test(m.text())) fouten.push(m.text()); });
    for (const pg of paginas) {
      await p.goto('http://localhost:8090/' + pg);
      await p.evaluate(() => document.fonts.ready);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      const font = await p.evaluate(() => [...document.fonts].some(f => f.family.includes('Bricolage') && f.status === 'loaded'));
      if (sw > w) { console.log('HORIZONTAAL SCROLLEN', tag, pg, sw); fout++; }
      if (!font) { console.log('LETTERTYPE NIET GELADEN', tag, pg); fout++; }
      if (pg === 'index.html' || pg === 'prijzen.html' || pg === 'veilinggids/troostwijk.html') await p.screenshot({ path: out + '/site-' + tag + '-' + pg.replace(/\//g, '_').replace('.html', '') + '.png', fullPage: true });
    }
    const links = await p.evaluate(() => [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href')));
    if (fouten.length) { console.log('FOUTEN', tag, fouten); fout++; }
  }
  // Alle interne links bestaan?
  const p = await b.newPage();
  const gezien = new Set(), stuk = [];
  for (const pg of paginas.concat(['veilinggids/hnvi.html','veilinggids/catawiki.html','veilinggids/nedveiling.html','verhalen/index.html','verhalen/opgeld-berekenen.html','verhalen/vijf-dure-fouten.html','en/pricing.html'])) {
    await p.goto('http://localhost:8090/' + pg);
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href').split('#')[0]));
    for (const h of hrefs) {
      if (!h || gezien.has(h) || h === '/app') continue; gezien.add(h);
      let pad = h.endsWith('/') ? h + 'index.html' : (/\.\w+$/.test(h) ? h : h + '.html');
      const r = await p.request.get('http://localhost:8090' + pad);
      if (r.status() !== 200) stuk.push(h + ' (' + r.status() + ')');
    }
  }
  console.log('Interne links gecontroleerd:', gezien.size, stuk.length ? 'KAPOT: ' + stuk.join(', ') : 'alles OK');
  console.log(fout || stuk.length ? 'FOUTEN' : 'ALLES OK');
  await b.close();
})();
