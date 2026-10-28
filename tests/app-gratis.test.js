// Klantreis met de gratis opzet: uitnodigingscode, geen betalen
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
let fouten = 0;
function check(naam, ok, extra) { console.log((ok ? 'OK   ' : 'FOUT ') + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!ok) fouten++; }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const jsFouten = []; page.on('pageerror', e => jsFouten.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: "window.VA_CONFIG = { api: 'http://localhost:8787' };" }));
  await page.goto('http://localhost:8080/app.html');
  await page.waitForFunction(() => window.serverInfo);
  await page.click('#welkom-knoppen >> text=Account maken');
  check('Registratie toont uitnodigingscode en 3 gratis analyses', await page.isVisible('#li-code') && /3 analyses gratis\./.test(await page.textContent('#modal-body')), await page.textContent('#modal-body >> p.help'));
  check('Geen tekst over abonnement', !/abonnement/i.test(await page.textContent('#modal-body')));
  await page.fill('#li-email', 'vriend@voorbeeld.nl'); await page.fill('#li-ww', 'geheim123'); await page.fill('#li-code', 'fout');
  await page.click('#modal-actions .btn-primary'); await page.waitForTimeout(300);
  check('Verkeerde code: duidelijke melding', /uitnodigingscode/.test(await page.textContent('#li-err')));
  await page.fill('#li-code', 'TEST123');
  await page.click('#modal-actions .btn-primary');
  await page.waitForFunction(() => window.account);
  await page.evaluate(() => openBatch());
  await page.fill('#batch-links', [1, 2, 3, 4].map(i => 'https://www.testveiling.nl/kavel/' + (700 + i)).join('\n'));
  await page.click('#modal-actions .btn-primary');
  await page.waitForFunction(() => !batchBezig, null, { timeout: 20000 });
  check('Batch stopt na 3 met gratis-melding', await page.evaluate(() => kavels.length === 3) && /Vanaf de 1e/.test(await page.textContent('#batch-err')));
  check('Knop is Klaar, niet Abonnement kiezen', (await page.textContent('#modal-actions .btn-primary')) === 'Klaar');
  await page.click('#modal-actions .btn-primary');
  await page.evaluate(() => toonAccount());
  const acc = await page.textContent('#modal-body');
  check('Account: geen abonnementen, wel wanneer het weer kan', !/Kies /.test(acc) && /Vanaf de 1e/.test(acc), acc);
  check('Geen knop Abonnement beheren', !(await page.isVisible('text=Abonnement beheren')));
  await page.evaluate(() => { closeModal(); switchTab('handleiding'); });
  check('Handleiding: geen Stripe-tekst', !(await page.isVisible('text=via Stripe')));
  await page.screenshot({ path: process.argv[2] + '/gratis-account.png' });
  check('Geen JavaScript-fouten', jsFouten.length === 0, jsFouten);
  await b.close();
  console.log(fouten ? '\n' + fouten + ' FOUT(EN)' : '\nALLES OK'); process.exit(fouten ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
