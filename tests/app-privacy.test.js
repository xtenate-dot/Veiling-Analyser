// Test: gegevens downloaden, account verwijderen, privacy- en voorwaardenpagina, eigen lettertypes.
// Start eerst: python3 -m http.server 8080  en  node server/test/lokaal.mjs 8787 http://localhost:8080
// Draaien: node tests/app-privacy.test.js uitvoer
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || 'uitvoer';
let fouten = 0;
function check(naam, ok, extra) { console.log((ok ? 'OK   ' : 'FOUT ') + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!ok) fouten++; }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const jsFouten = [];
  page.on('pageerror', e => jsFouten.push(e.message));
  page.on('console', m => { if (m.type() === 'error') jsFouten.push('console: ' + m.text()); });
  const fontVerzoeken = [];
  page.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com|\.woff2/.test(r.url())) fontVerzoeken.push(r.url()); });
  await page.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript',
    body: "window.VA_CONFIG = { api: 'http://localhost:8787', prijzen: {}, voorwaarden: 'voorwaarden.html', privacy: 'privacy.html' };" }));

  // Account via de API, daarna inloggen in de app met dat token
  const email = 'privacy' + Date.now() + '@voorbeeld.nl';
  const reg = await (await fetch('http://localhost:8787/api/registreer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, wachtwoord: 'geheim123' }) })).json();
  await page.goto('http://localhost:8080/app.html');
  await page.evaluate(t => localStorage.setItem('va_sessie', t), reg.token);
  await page.reload();
  await page.waitForFunction(() => window.account && window.account.email);
  await page.evaluate(() => document.fonts.ready);
  const fontsOk = await page.evaluate(() => document.fonts.check('16px "Instrument Sans"') && [...document.fonts].some(f => f.family.includes('Instrument Sans') && f.status === 'loaded'));
  check('Lettertype laadt van de eigen server', fontsOk && fontVerzoeken.some(u => u.includes('localhost:8080/fonts/')), fontVerzoeken);
  check('Geen verzoeken naar Google Fonts', !fontVerzoeken.some(u => /googleapis|gstatic/.test(u)));
  check('Startpagina toont links naar privacy en voorwaarden', await page.locator('.home-voet a[href="privacy.html"]').count() === 1 && await page.locator('.home-voet a[href="voorwaarden.html"]').count() === 1);

  // Kavel opslaan zodat er iets te downloaden is
  await page.evaluate(() => { kavels.push({ id: 'k1', titel: 'Testkavel privacy', status: 'actief', toegevoegd: Date.now() }); syncNaarServer(); });
  await page.waitForTimeout(1800);

  await page.evaluate(() => toonAccount());
  check('Account toont meldingen, agenda, review, downloaden en verwijderen', await page.locator('.acc-privacy .linkje').count() === 5);
  await page.screenshot({ path: OUT + '/account-privacy.png' });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.acc-privacy .linkje', { hasText: 'downloaden' }).click()]);
  const inhoud = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('Download: juist bestand met account en kavel', dl.suggestedFilename() === 'veiling-analyser-gegevens.json' && inhoud.account.email === email && inhoud.kavels.some(k => k.titel === 'Testkavel privacy'), inhoud.account);

  await page.evaluate(() => vraagVerwijderen());
  check('Verwijderen vraagt om wachtwoord', await page.locator('#vw-ww').count() === 1);
  await page.screenshot({ path: OUT + '/account-verwijderen.png' });
  await page.fill('#vw-ww', 'fout');
  await page.locator('#modal-actions .btn-danger').click();
  await page.waitForFunction(() => /klopt niet/.test(document.getElementById('vw-err').textContent));
  check('Verkeerd wachtwoord: melding, account blijft', await page.evaluate(() => !!window.account));
  await page.fill('#vw-ww', 'geheim123');
  await page.locator('#modal-actions .btn-danger').click();
  await page.waitForFunction(() => window.account === null);
  check('Juist wachtwoord: uitgelogd en sessie gewist', await page.evaluate(() => !localStorage.getItem('va_sessie')));
  const na = await fetch('http://localhost:8787/api/inloggen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, wachtwoord: 'geheim123' }) });
  check('Inloggen met het verwijderde account lukt niet meer', na.status === 401);
  check('Kavels op het apparaat blijven staan', await page.evaluate(() => kavels.some(k => k.titel === 'Testkavel privacy')));

  for (const p of ['privacy.html', 'voorwaarden.html']) {
    await page.goto('http://localhost:8080/' + p);
    const breedte = await page.evaluate(() => document.documentElement.scrollWidth);
    check(p + ': kop, concept-melding, geen horizontaal scrollen op telefoon', await page.locator('h1').count() === 1 && await page.locator('.jur-concept').count() === 1 && breedte <= 390, breedte);
    await page.screenshot({ path: OUT + '/' + p.replace('.html', '') + '.png', fullPage: true });
  }
  check('Geen JavaScript-fouten', jsFouten.filter(f => !/status of (401|403)/.test(f)).length === 0, jsFouten);
  await browser.close();
  console.log(fouten ? '\n' + fouten + ' FOUT(EN)' : '\nALLES OK');
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
