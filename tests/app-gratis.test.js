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
  check('Registratie toont uitnodigingscode en 3 analyses cadeau', await page.isVisible('#li-code') && /3 analyses cadeau\. Ze verlopen niet/.test(await page.textContent('#modal-body')), await page.textContent('#modal-body >> p.help'));
  check('Geen tekst over abonnement', !/abonnement/i.test(await page.textContent('#modal-body')));
  await page.fill('#li-email', 'vriend@voorbeeld.nl'); await page.fill('#li-ww', 'geheim123'); await page.fill('#li-code', 'fout');
  await page.click('#modal-actions .btn-primary'); await page.waitForTimeout(300);
  check('Verkeerde code: duidelijke melding', /uitnodigingscode/.test(await page.textContent('#li-err')));
  await page.fill('#li-code', 'TEST123');
  await page.click('#modal-actions .btn-primary');
  await page.waitForFunction(() => window.account);
  // E-mail bevestigen met de code
  await page.waitForSelector('#code-in', { timeout: 5000 });
  check('Na aanmelden vraagt de app om de code', await page.isVisible('text=Bevestig je e-mailadres'));
  await page.fill('#code-in', '000000'); await page.waitForTimeout(400);
  const code = (await (await fetch('http://localhost:8787/__test/laatste-code')).json()).code;
  if (code === '000000') throw new Error('toevallig 000000');
  check('Verkeerde code: melding, venster blijft open', /klopt niet/.test(await page.textContent('#code-err')));
  await page.fill('#code-in', code);   // 6 cijfers: wordt vanzelf verstuurd
  await page.waitForFunction(() => account.email_geverifieerd, null, { timeout: 5000 });
  check('Juiste code: bevestigd zonder op een knop te drukken', !(await page.isVisible('#code-in')) && !(await page.isVisible('#bevestig-bar')));
  await page.evaluate(() => openBatch());
  await page.fill('#batch-links', [1, 2, 3, 4].map(i => 'https://www.testveiling.nl/kavel/' + (700 + i)).join('\n'));
  await page.click('#modal-actions .btn-primary');
  await page.waitForFunction(() => !batchBezig, null, { timeout: 20000 });
  check('Batch stopt na 3 met gratis-melding', await page.evaluate(() => kavels.length === 3) && /gratis analyses zijn op/.test(await page.textContent('#batch-err')));
  check('Knop is Klaar, niet Abonnement kiezen', (await page.textContent('#modal-actions .btn-primary')) === 'Klaar');
  await page.click('#modal-actions .btn-primary');
  await page.evaluate(() => toonAccount());
  const acc = await page.textContent('#modal-body');
  check('Account: geen abonnementen, wel uitleg over het tegoed', !/Kies /.test(acc) && /0 tegoed dat niet verloopt/.test(acc) && /ander bod doorrekenen/.test(acc), acc);
  check('Geen knop Abonnement beheren', !(await page.isVisible('text=Abonnement beheren')));
  await page.evaluate(() => { closeModal(); switchTab('handleiding'); });
  check('Handleiding: geen Stripe-tekst', !(await page.isVisible('text=via Stripe')));
  await page.screenshot({ path: process.argv[2] + '/gratis-hulp.png' });
  await page.evaluate(() => switchTab('home')); await page.waitForTimeout(300);
  await page.screenshot({ path: process.argv[2] + '/home-mobiel.png', fullPage: true });
  check('Geen JavaScript-fouten', jsFouten.length === 0, jsFouten);
  await b.close();
  console.log(fouten ? '\n' + fouten + ' FOUT(EN)' : '\nALLES OK'); process.exit(fouten ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
