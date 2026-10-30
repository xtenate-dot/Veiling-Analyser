// ═══ Veiling Analyser – functies voor handelaren ══════════════════════════════
// Winst bijhouden, exporteren, meerdere links tegelijk, agenda en delen.

// ── Verkoop van een gewonnen kavel vastleggen ──
function betaaldVan(k) {
  if (typeof k.betaald_totaal === 'number') return k.betaald_totaal;
  return k.kosten ? k.kosten.totaal : null;
}
function winstVan(k) {
  if (typeof k.verkocht_voor !== 'number') return null;
  var b = betaaldVan(k);
  if (b == null) return null;
  return k.verkocht_voor - b - (k.verkoopkosten_werkelijk || 0);
}
function datumVeld(ms) { var d = new Date(ms || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function legVerkoopVast(idx) {
  var k = kavels[idx]; if (!k) return;
  var b = betaaldVan(k);
  var h = '<p class="help" style="margin:0 0 12px">Vul in wat je echt hebt betaald en waarvoor je het hebt verkocht. Dan zie je je werkelijke winst en kun je het exporteren voor je boekhouding.</p>' +
    '<div class="vk-grid">' +
    '<div><label class="ctl-l" for="vv-betaald">Totaal betaald</label><div class="money"><span>&euro;</span><input class="input" id="vv-betaald" type="text" inputmode="decimal" value="' + (b != null ? bedragTxt(b) : '') + '"></div></div>' +
    '<div><label class="ctl-l" for="vv-voor">Verkocht voor</label><div class="money"><span>&euro;</span><input class="input" id="vv-voor" type="text" inputmode="decimal" value="' + (typeof k.verkocht_voor === 'number' ? bedragTxt(k.verkocht_voor) : '') + '"></div></div>' +
    '<div><label class="ctl-l" for="vv-kosten">Verkoopkosten</label><div class="money"><span>&euro;</span><input class="input" id="vv-kosten" type="text" inputmode="decimal" value="' + bedragTxt(typeof k.verkoopkosten_werkelijk === 'number' ? k.verkoopkosten_werkelijk : verkoopkostenVan(k)) + '"></div></div>' +
    '<div><label class="ctl-l" for="vv-op">Verkocht op</label><input class="input" id="vv-op" type="date" value="' + datumVeld(k.verkocht_op) + '"></div>' +
    '</div><div class="help">Laat Verkocht voor leeg als het nog niet verkocht is.</div><div class="msg err" id="vv-err" role="alert"></div>';
  openModal('Verkoop vastleggen', h, [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: 'Opslaan', cls: 'btn-primary', keepOpen: true, fn: function() {
      var bet = leesEuro(document.getElementById('vv-betaald').value);
      var vvTxt = document.getElementById('vv-voor').value.trim();
      var voor = vvTxt ? leesEuro(vvTxt) : null;
      var vk = leesEuro(document.getElementById('vv-kosten').value);
      var op = Date.parse(document.getElementById('vv-op').value);
      if (!isFinite(bet) || bet <= 0) { toonMsg('vv-err', 'Vul het totaal betaalde bedrag in, bijvoorbeeld 431,37.'); return; }
      if (voor !== null && (!isFinite(voor) || voor <= 0)) { toonMsg('vv-err', 'Vul de verkoopprijs in als bedrag, of laat het veld leeg.'); return; }
      if (!isFinite(vk) || vk < 0) { toonMsg('vv-err', 'Vul de verkoopkosten in als bedrag, of 0.'); return; }
      k.betaald_totaal = bet;
      k.verkoopkosten_werkelijk = vk;
      if (voor === null) { delete k.verkocht_voor; delete k.verkocht_op; }
      else { k.verkocht_voor = voor; k.verkocht_op = isFinite(op) ? op : Date.now(); }
      closeModal(); slaKavelsOp(); renderGewonnen();
      toast(voor === null ? 'Opgeslagen' : 'Verkoop opgeslagen: ' + fmtSC(winstVan(k)) + ' winst');
    } }
  ]);
}
function renderWinstStrip(lijst) {
  var el = document.getElementById('winst-strip'); if (!el) return;
  var betaald = 0, opbrengst = 0, winst = 0, nVerkocht = 0, betaaldVerkocht = 0;
  lijst.forEach(function(k) {
    var b = betaaldVan(k); if (b != null) betaald += b;
    var w = winstVan(k);
    if (w != null) { nVerkocht++; winst += w; opbrengst += k.verkocht_voor; betaaldVerkocht += b; }
  });
  var rendement = betaaldVerkocht > 0 ? Math.round(winst / betaaldVerkocht * 100) : null;
  el.innerHTML =
    '<div class="stat"><div class="stat-lbl">Ingekocht</div><div class="stat-num">' + fmt(betaald) + '</div></div>' +
    '<div class="stat"><div class="stat-lbl">Verkocht</div><div class="stat-num">' + nVerkocht + ' van ' + lijst.length + '</div></div>' +
    '<div class="stat"><div class="stat-lbl">Winst op verkochte kavels</div><div class="stat-num ' + (winst > 0 ? 'pos' : '') + '">' + (nVerkocht ? fmtS(winst) : '-') + '</div></div>' +
    '<div class="stat"><div class="stat-lbl">Rendement</div><div class="stat-num">' + (rendement != null ? rendement + '%' : '-') + '</div></div>';
}

// ── Exporteren (CSV voor Excel of je boekhouding) ──
function csvBedrag(n) { return (n != null && isFinite(n)) ? (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') : ''; }
function csvVeld(v) { v = v == null ? '' : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exporteerCsv(gewonnen) {
  var lijst = kavels.filter(function(k) { return gewonnen ? k.status === 'gewonnen' : k.status !== 'gewonnen'; });
  if (!lijst.length) { toast('Er zijn geen kavels om te exporteren.', null, true); return; }
  var kop = ['Titel', 'Veilinghuis', 'Kavelnummer', 'Link', 'Advies', 'Bod', 'Opgeld %', 'Veilingkosten', 'Vaste kosten', 'Btw', 'Totale kosten', 'Verwachte verkoop', 'Verwachte marge', 'Maximaal bod', 'Nieuwprijs'];
  if (gewonnen) kop = kop.concat(['Gewonnen op', 'Totaal betaald', 'Verkocht voor', 'Verkoopkosten', 'Verkocht op', 'Winst']);
  var rijen = [kop];
  lijst.forEach(function(k) {
    var c = k.kosten || {};
    var r = [k.titel, veilingVan(k), k.kavelnummer, k.url, adviesInfo(k.advies).label, csvBedrag(k.huidig_bod), c.opgeld_pct != null ? String(c.opgeld_pct).replace('.', ',') : '',
      csvBedrag(c.vk), csvBedrag(c.vast), csvBedrag(c.btw), csvBedrag(c.totaal), csvBedrag(verkoopprijsVan(k)), csvBedrag(c.marge), csvBedrag(k.maxBod), csvBedrag(k.nieuwprijs)];
    if (gewonnen) r = r.concat([k.gewonnen_op ? new Date(k.gewonnen_op).toLocaleDateString('nl-NL') : '', csvBedrag(betaaldVan(k)), csvBedrag(k.verkocht_voor),
      csvBedrag(k.verkoopkosten_werkelijk), k.verkocht_op ? new Date(k.verkocht_op).toLocaleDateString('nl-NL') : '', csvBedrag(winstVan(k))]);
    rijen.push(r);
  });
  // Puntkomma en komma-decimalen: zo opent Nederlandse Excel het bestand direct goed
  var csv = '\ufeff' + rijen.map(function(r) { return r.map(csvVeld).join(';'); }).join('\r\n');
  downloadBestand(csv, (gewonnen ? 'gewonnen-kavels-' : 'kavels-') + datumVeld() + '.csv', 'text/csv;charset=utf-8');
  toast(lijst.length + (lijst.length === 1 ? ' kavel geëxporteerd' : ' kavels geëxporteerd'));
}
function downloadBestand(inhoud, naam, type) {
  var url = URL.createObjectURL(new Blob([inhoud], { type: type }));
  var a = document.createElement('a'); a.href = url; a.download = naam;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

// ── Sluitingstijd in je agenda ──
function icsDatum(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsTekst(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function zetInAgenda(idx) {
  var k = kavels[idx]; if (!k || !k.pagina || !k.pagina.sluit_iso) return;
  var start = Date.parse(k.pagina.sluit_iso);
  var bod = k.maxBod > 0 ? 'Bied maximaal ' + fmt(k.maxBod) + '. ' : '';
  var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Veiling Analyser//NL', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    'UID:kavel-' + k.id + '@veiling-analyser', 'DTSTAMP:' + icsDatum(Date.now()),
    'DTSTART:' + icsDatum(start - 15 * 60000), 'DTEND:' + icsDatum(start),
    'SUMMARY:' + icsTekst('Veiling sluit: ' + (k.titel || 'kavel')),
    'DESCRIPTION:' + icsTekst(bod + (k.url || '')),
    k.url ? 'URL:' + k.url : '',
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTekst('Veiling sluit over 30 minuten'), 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  downloadBestand(ics, 'veiling-' + (k.kavelnummer || k.id) + '.ics', 'text/calendar;charset=utf-8');
  toast('Agenda-afspraak gedownload. Open het bestand om het toe te voegen.');
}

// ── Delen ──
async function deelKavel(idx) {
  var k = kavels[idx]; if (!k) return;
  var tekst = (k.titel || 'Kavel') + ': ' + adviesInfo(k.advies).label.toLowerCase() +
    (k.maxBod > 0 ? ', bied maximaal ' + fmt(k.maxBod) : '') + (verkoopprijsVan(k) ? ' (verwachte verkoop ' + fmt(verkoopprijsVan(k)) + ')' : '') + '.';
  if (navigator.share) {
    try { await navigator.share({ title: k.titel || 'Kavel', text: tekst, url: veiligeUrl(k.url) || undefined }); } catch (e) {}
    return;
  }
  try { await navigator.clipboard.writeText(tekst + (k.url ? ' ' + k.url : '')); toast('Gekopieerd. Plak het in een bericht.'); }
  catch (e) { toast('Kopiëren lukt niet in deze browser.', null, true); }
}

// ── Meerdere links tegelijk ──
var batchBezig = false;
function openBatch() {
  if (batchBezig) { toast('Er loopt al een reeks analyses.'); return; }
  var h = '<p class="help" style="margin:0 0 10px">Plak één link per regel. Ze worden na elkaar geanalyseerd met het huidige bod van de kavelpagina. Elke link telt als één analyse.</p>' +
    '<textarea class="textarea" id="batch-links" rows="7" placeholder="https://…&#10;https://…"></textarea><div id="batch-lijst"></div><div class="msg err" id="batch-err" role="alert"></div>';
  openModal('Meerdere kavels analyseren', h, [
    { label: 'Sluiten', cls: 'btn-secondary' },
    { label: 'Start', cls: 'btn-primary', keepOpen: true, fn: startBatch }
  ]);
}
function batchLinks(tekst) {
  var gezien = {};
  return (String(tekst).match(/https?:\/\/[^\s<>"']+/gi) || []).map(function(u) { return u.replace(/[),.;]+$/, ''); })
    .filter(function(u) { if (gezien[u]) return false; gezien[u] = 1; return true; }).slice(0, 25);
}
async function startBatch() {
  var links = batchLinks(document.getElementById('batch-links').value);
  if (!links.length) { toonMsg('batch-err', 'Plak minstens één link die begint met https://.'); return; }
  if (serverModus() && !account) { vraagInloggen('inloggen'); return; }
  if (!serverModus() && !getApiKey()) { toonMsg('batch-err', 'Voer eerst je API-sleutel in.'); return; }
  batchBezig = true;
  var knop = document.querySelector('#modal-actions .btn-primary'); if (knop) knop.disabled = true;
  document.getElementById('batch-links').style.display = 'none';
  var box = document.getElementById('batch-lijst');
  box.innerHTML = links.map(function(u, i) { return '<div class="batch-rij" id="br-' + i + '"><span class="spinner" style="visibility:hidden"></span><span class="bu">' + esc(u) + '</span><span class="bs">Wacht</span></div>'; }).join('');
  var ok = 0, mis = 0, limiet = false;
  for (var i = 0; i < links.length; i++) {
    var rij = document.getElementById('br-' + i);
    if (rij) { rij.querySelector('.spinner').style.visibility = 'visible'; rij.querySelector('.bs').textContent = 'Bezig…'; }
    try {
      var url = links[i];
      var res = await voerAnalyseUit({ url: url, extra: '', hergebruik: true });
      var k = bouwKavel(res, { url: url, bod: null, bodType: 'ander', tarief: Object.assign({ handmatig: false }, detecteerVeiling(url)), leesKosten: true });
      if (res.verbruik) toonVerbruik(res.verbruik);
      slaKavelsOp(); updateBadge(); renderOverzicht();
      ok++;
      if (rij) { rij.querySelector('.spinner').remove(); rij.querySelector('.bs').innerHTML = '<span class="pill pill-' + adviesInfo(k.advies).key + '">' + adviesInfo(k.advies).label + '</span>'; rij.querySelector('.bu').textContent = k.titel || url; }
    } catch (e) {
      mis++;
      if (rij) { rij.querySelector('.spinner').remove(); rij.querySelector('.bs').textContent = 'Mislukt'; rij.title = vriendelijkeFout(e); }
      if (e.status === 402 || e.code === 'budget') { limiet = e.status === 402; toonMsg('batch-err', vriendelijkeFout(e)); break; }
    }
  }
  batchBezig = false;
  if (knop) {
    knop.disabled = false;
    var kopen = limiet && account && account.kan_betalen;
    knop.textContent = kopen ? 'Abonnement kiezen' : 'Klaar';
    knop.onclick = kopen ? function() { toonAccount(); } : function() { closeModal(); switchTab('overzicht'); };
  }
  toast(ok + (ok === 1 ? ' kavel' : ' kavels') + ' geanalyseerd' + (limiet ? '; gestopt omdat je maandlimiet is bereikt' : mis ? ', ' + mis + ' mislukt' : ''));
}

// ── Link ontvangen via delen (telefoon) of de bladwijzer ──
function linkUitParameters() {
  var p = new URLSearchParams(location.search);
  var bron = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ');
  var m = bron.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : '';
}
function bladwijzerHtml() {
  var app = location.href.split(/[?#]/)[0];
  var code = "javascript:location.href='" + app + "?url='+encodeURIComponent(location.href)";
  return '<p>Sleep deze knop naar je bladwijzerbalk: <a class="btn btn-secondary btn-sm" href="' + esc(code) + '" onclick="event.preventDefault();toast(\'Sleep de knop naar je bladwijzerbalk.\')">' + ic('gavel') + 'Analyseer kavel</a></p>' +
    '<p>Sta je op een kavelpagina, klik dan op de bladwijzer. De app opent met de link al ingevuld.</p>' +
    '<p>Op je telefoon: installeer de app via &ldquo;Toevoegen aan beginscherm&rdquo;. Op Android kun je daarna in je browser op Delen tikken en Veiling Analyser kiezen.</p>';
}

// ── Sluittijd in gewone woorden ──
function sluitMs(k) { var s = k && k.pagina && k.pagina.sluit_iso; var t = s ? Date.parse(s) : NaN; return isFinite(t) ? t : null; }
function sluitRelatief(ms) {
  if (ms == null) return null;
  var d = ms - Date.now();
  if (d <= 0) return 'Gesloten';
  var min = Math.round(d / 60000);
  if (min < 60) return 'over ' + min + ' min';
  var uur = Math.floor(min / 60);
  if (uur < 24) return 'over ' + uur + ' uur' + (min % 60 && uur < 6 ? ' ' + (min % 60) + ' min' : '');
  var dag = Math.floor(uur / 24);
  return 'over ' + dag + (dag === 1 ? ' dag' : ' dagen') + (uur % 24 && dag < 3 ? ' ' + (uur % 24) + ' uur' : '');
}
function sluitDatumTxt(ms) {
  return ms == null ? '' : new Date(ms).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Stand van zaken: in één oogopslag waar je staat ──
function standZin(d) {
  var bod = d.huidig_bod > 0 ? d.huidig_bod : null;
  if (partijOnbetrouwbaar(d)) return { cls: 'warn', tekst: 'Controleer eerst de opbrengst per stuk; daarna zie je tot hoeveel je kunt bieden.' };
  if (d.maxBod == null) return { cls: 'warn', tekst: 'Er is geen verkoopprijs bekend, dus nog geen maximaal bod.' };
  if (!(d.maxBod > 0)) return { cls: 'neg', tekst: 'Niet bieden: zelfs bij een heel laag bod blijft er te weinig over.' };
  if (!bod) return { cls: 'ok', tekst: 'Nog geen bod bekend. Bied niet meer dan ' + fmt(d.maxBod) + '.' };
  if (bod > d.breakEvenBod) return { cls: 'neg', tekst: 'Niet meer bieden: het bod ligt al boven het punt waarop je quitte speelt (' + fmt(d.breakEvenBod) + ').' };
  if (bod > d.maxBod) return { cls: 'warn', tekst: 'Het bod ligt boven je maximum. Je verdient nog iets, maar minder dan je ' + pctTxt(doelPct()) + '% marge.' };
  return { cls: 'ok', tekst: 'Je kunt nog ' + fmt(d.maxBod - bod) + ' hoger bieden en houdt dan ' + pctTxt(doelPct()) + '% marge over.' };
}
function standVanZaken(d) {
  var pg = d.pagina || {}, ms = sluitMs(d), z = standZin(d);
  var gem = verkoopprijsVan(d), k = d.kosten;
  var winstTxt = k && k.marge != null && gem && !partijOnbetrouwbaar(d) ? fmtS(k.marge) : '-';
  var winstSub = k && k.marge != null && gem && !partijOnbetrouwbaar(d) ? Math.round(k.marge / gem * 100) + '% bij dit bod' : 'nog geen bod';
  var cel = function(l, v, s, cls) { return '<div class="sz-cel"><div class="sz-l">' + l + '</div><div class="sz-v' + (cls ? ' ' + cls : '') + '">' + v + '</div><div class="sz-s">' + s + '</div></div>'; };
  return '<div class="stand"><div class="sz-zin sz-' + z.cls + '">' + ic(z.cls === 'ok' ? 'check' : z.cls === 'neg' ? 'x' : 'alert') + '<span>' + esc(z.tekst) + '</span></div>' +
    '<div class="sz-rij">' +
    cel(d.eigen_bod ? 'Mijn bod' : 'Huidig bod', d.huidig_bod ? fmt(d.huidig_bod) : '-', pg.aantal_biedingen != null ? pg.aantal_biedingen + (pg.aantal_biedingen === 1 ? ' bod' : ' biedingen') : 'aantal onbekend') +
    cel('Sluit', ms ? esc(sluitRelatief(ms)) : '-', ms ? esc(sluitDatumTxt(ms)) : esc(pg.sluit || 'onbekend'), ms && ms - Date.now() < 3 * 3600000 && ms > Date.now() ? 'warn' : '') +
    cel('Bied maximaal', d.maxBod > 0 && !partijOnbetrouwbaar(d) ? fmt(d.maxBod) : '-', d.breakEvenBod > 0 && !partijOnbetrouwbaar(d) ? 'quitte bij ' + fmt(d.breakEvenBod) : '') +
    cel('Verwachte winst', winstTxt, winstSub, k && k.marge > 0 ? 'pos' : k && k.marge < 0 ? 'neg' : '') +
    '</div></div>';
}

// ── Marge bij verschillende biedingen ──
function mooieStap(x) {
  var stappen = [5, 10, 20, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  for (var i = 0; i < stappen.length; i++) if (stappen[i] >= x) return stappen[i];
  return stappen[stappen.length - 1];
}
function biedRij(d, bod) {
  var t = tariefVan(d), gem = verkoopprijsVan(d), vkst = verkoopkostenVan(d);
  var kk = K.berekenKosten(bod, t), winst = gem - kk.totaal - vkst;
  return { bod: bod, opgeld: kk.vk, vast: kk.vast, btw: kk.btw, totaal: kk.totaal, verkoop: gem, vkst: vkst, winst: winst, marge: gem ? winst / gem * 100 : null };
}
function biedLadder(d) {
  var gem = verkoopprijsVan(d);
  if (!gem || !(d.breakEvenBod > 0) || partijOnbetrouwbaar(d)) return null;
  var be = d.breakEvenBod, stap = mooieStap(be / 6);
  var bods = [];
  for (var b = stap; b < be && bods.length < 8; b += stap) bods.push(b);
  // Hooguit 4 ronde bedragen, gelijk verdeeld, plus de bedragen waar het om draait
  var kies = bods.length <= 4 ? bods : [0, 1, 2, 3].map(function(i) { return bods[Math.round(i * (bods.length - 1) / 3)]; });
  var bijzonder = [];
  if (d.huidig_bod > 0) bijzonder.push([d.huidig_bod, d.eigen_bod ? 'mijn bod' : 'huidig bod']);
  if (d.maxBod > 0) bijzonder.push([d.maxBod, 'maximaal']);
  bijzonder.push([be, 'quitte']);
  var rijen = kies.map(function(x) { return [x, '']; }).concat(bijzonder);
  rijen.sort(function(a, b) { return a[0] - b[0]; });
  var uit = [];
  rijen.forEach(function(r) {
    var vorige = uit[uit.length - 1];
    if (vorige && Math.abs(vorige.bod - r[0]) < stap / 2) { if (r[1]) { vorige.label = r[1]; vorige.bod = r[0]; } return; }
    uit.push({ bod: r[0], label: r[1] });
  });
  return uit.map(function(r) { var x = biedRij(d, r.bod); x.label = r.label; return x; });
}
function biedLadderHtml(d, idx) {
  var rijen = biedLadder(d);
  if (!rijen) return '';
  var h = '<h3 style="font-size:15px;margin:20px 0 6px">Marge bij andere biedingen</h3><table class="ctable bl"><thead><tr><th>Bod</th><th>Totale kosten</th><th>Winst</th><th>Marge</th></tr></thead><tbody>';
  rijen.forEach(function(r) {
    var cls = r.winst > 0 ? 'pos' : r.winst < 0 ? 'neg' : '';
    h += '<tr' + (r.label ? ' class="bl-' + (r.label === 'maximaal' ? 'max' : r.label === 'quitte' ? 'quitte' : 'nu') + '"' : '') + '><td>' + fmt(r.bod) + (r.label ? '<small>' + esc(r.label) + '</small>' : '') + '</td><td>' + fmt(r.totaal) + '</td><td class="' + cls + '">' + fmtS(r.winst) + '</td><td class="' + cls + '">' + (r.marge != null ? Math.round(r.marge) + '%' : '-') + '</td></tr>';
  });
  h += '</tbody></table>';
  if (idx >= 0) h += '<div class="bl-acties"><button class="btn btn-secondary btn-sm" onclick="exporteerBiedingen(' + idx + ')">' + ic('download') + 'Alle biedingen naar Excel</button></div>';
  return h;
}
function exporteerBiedingen(idx) {
  var d = kavels[idx]; if (!d || !biedLadder(d)) return;
  var h = '<p class="help" style="margin:0 0 12px">Je krijgt een bestand voor Excel met elk bod in stappen van het bedrag hieronder, tot iets boven het punt waarop je quitte speelt.</p>' +
    '<label class="ctl-l" for="bl-stap">Stap per bod</label><div class="money"><span>&euro;</span><input class="input" id="bl-stap" type="text" inputmode="decimal" value="5"></div><div class="msg err" id="bl-err" role="alert"></div>';
  openModal('Biedingen naar Excel', h, [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: 'Downloaden', cls: 'btn-primary', keepOpen: true, fn: function() {
      var stap = leesEuro(document.getElementById('bl-stap').value);
      if (!isFinite(stap) || stap < 1) { toonMsg('bl-err', 'Vul een stap van minstens €1 in, bijvoorbeeld 5.'); return; }
      var tot = Math.ceil(d.breakEvenBod * 1.1 / stap) * stap;
      if (tot / stap > 2000) { toonMsg('bl-err', 'Dat worden meer dan 2.000 regels. Kies een grotere stap, bijvoorbeeld ' + mooieStap(tot / 2000) + '.'); return; }
      var kop = ['Bod', 'Opgeld', 'Vaste kosten', 'Btw', 'Totale kosten', 'Verwachte verkoop', 'Verkoopkosten', 'Winst', 'Marge %', ''];
      var rijen = [kop];
      for (var b = stap; b <= tot + 1e-9; b += stap) {
        var r = biedRij(d, b);
        var noot = Math.abs(b - d.maxBod) < stap / 2 ? 'rond je maximale bod' : Math.abs(b - d.breakEvenBod) < stap / 2 ? 'rond quitte' : '';
        rijen.push([csvBedrag(b), csvBedrag(r.opgeld), csvBedrag(r.vast), csvBedrag(r.btw), csvBedrag(r.totaal), csvBedrag(r.verkoop), csvBedrag(r.vkst), csvBedrag(r.winst), r.marge != null ? String(Math.round(r.marge * 10) / 10).replace('.', ',') : '', noot]);
      }
      var titel = [['Kavel', d.titel || ''], ['Link', d.url || ''], ['Maximaal bod', csvBedrag(d.maxBod)], ['Quitte bij', csvBedrag(d.breakEvenBod)], []];
      var csv = '﻿' + titel.concat(rijen).map(function(r) { return r.map(csvVeld).join(';'); }).join('\r\n');
      downloadBestand(csv, 'biedingen-' + (d.kavelnummer || d.id) + '.csv', 'text/csv;charset=utf-8');
      closeModal();
      toast((rijen.length - 1) + ' biedingen geëxporteerd');
    } }
  ]);
}

// ── Groepen: per veiling, of een eigen groep ──
function groepVan(k) {
  if (k.groep) return { sleutel: 'eigen:' + k.groep.toLowerCase(), naam: k.groep, eigen: true };
  var pg = k.pagina || {}, huis = veilingVan(k);
  if (pg.veiling_naam) return { sleutel: 'veiling:' + huis.toLowerCase() + '|' + pg.veiling_naam.toLowerCase(), naam: pg.veiling_naam, huis: huis };
  var ms = sluitMs(k);
  var dag = ms ? new Date(ms).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) : null;
  return { sleutel: 'huis:' + huis.toLowerCase() + '|' + (dag || '-'), naam: huis + (dag ? ', sluit ' + dag : ''), huis: huis };
}
function groepeerKavels(lijst) {
  var groepen = {}, volgorde = [];
  lijst.forEach(function(k) {
    var g = groepVan(k);
    if (!groepen[g.sleutel]) { groepen[g.sleutel] = { info: g, kavels: [] }; volgorde.push(g.sleutel); }
    groepen[g.sleutel].kavels.push(k);
  });
  var uit = volgorde.map(function(s) { return groepen[s]; });
  uit.forEach(function(g) {
    g.kavels.sort(function(a, b) { return (sluitMs(a) || Infinity) - (sluitMs(b) || Infinity); });
    g.eerste = g.kavels.reduce(function(m, k) { var t = sluitMs(k); return t && t > Date.now() && (m == null || t < m) ? t : m; }, null);
  });
  // Eerst wat het eerst sluit; gesloten of onbekend achteraan
  uit.sort(function(a, b) { return (a.eerste || Infinity) - (b.eerste || Infinity); });
  return uit;
}
function groepKopHtml(g) {
  var n = g.kavels.length, nKopen = g.kavels.filter(function(k) { return k.advies === 'kopen'; }).length;
  var sub = [];
  if (g.info.huis && !g.info.eigen && g.info.naam.indexOf(g.info.huis) !== 0) sub.push(esc(g.info.huis));
  sub.push(n + (n === 1 ? ' kavel' : ' kavels'));
  if (nKopen) sub.push(nKopen + (nKopen === 1 ? ' aanrader' : ' aanraders'));
  sub.push(g.eerste ? 'eerste sluit ' + esc(sluitRelatief(g.eerste)) + ' (' + esc(sluitDatumTxt(g.eerste)) + ')' : 'gesloten of sluittijd onbekend');
  return '<div class="groep-kop">' + ic(g.info.eigen ? 'folder' : 'gavel') + '<div><div class="gk-naam">' + esc(g.info.naam) + '</div><div class="gk-sub">' + sub.join(' &middot; ') + '</div></div></div>';
}
function kiesGroep(idx) {
  var k = kavels[idx]; if (!k) return;
  var bestaand = {};
  kavels.forEach(function(x) { if (x.groep) bestaand[x.groep] = 1; });
  var auto = groepVan(Object.assign({}, k, { groep: null }));
  var h = '<p class="help" style="margin:0 0 12px">Kavels van dezelfde veiling staan vanzelf bij elkaar. Wil je dit kavel in een eigen groep, bijvoorbeeld "Voor de winkel" of "Klant Jansen", vul dan een naam in.</p>' +
    '<label class="ctl-l" for="gr-naam">Eigen groep</label><input class="input" id="gr-naam" list="gr-lijst" maxlength="60" value="' + esc(k.groep || '') + '" placeholder="Leeg = automatisch per veiling">' +
    '<datalist id="gr-lijst">' + Object.keys(bestaand).map(function(g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist>' +
    '<div class="help">Automatisch: ' + esc(auto.naam) + '</div>';
  openModal('Groep kiezen', h, [
    { label: 'Annuleren', cls: 'btn-secondary' },
    { label: 'Opslaan', cls: 'btn-primary', fn: function() {
      var v = document.getElementById('gr-naam').value.trim().slice(0, 60);
      if (v) k.groep = v; else delete k.groep;
      slaKavelsOp(); renderOverzicht();
      toast(v ? 'In groep "' + v + '" gezet' : 'Weer automatisch per veiling');
    } }
  ]);
}

// ── Agenda: per kavel, of je hele lijst als abonnement ──
function agendaTijden(k) {
  var eind = sluitMs(k); if (!eind) return null;
  return { start: eind - 15 * 60000, eind: eind };
}
function googleAgendaUrl(k) {
  var t = agendaTijden(k); if (!t) return null;
  var tekst = (k.maxBod > 0 ? 'Bied maximaal ' + fmt(k.maxBod) + '. ' : '') + (k.url || '');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Veiling sluit: ' + (k.titel || 'kavel')) +
    '&dates=' + icsDatum(t.start) + '/' + icsDatum(t.eind) + '&details=' + encodeURIComponent(tekst);
}
function outlookAgendaUrl(k) {
  var t = agendaTijden(k); if (!t) return null;
  var tekst = (k.maxBod > 0 ? 'Bied maximaal ' + fmt(k.maxBod) + '. ' : '') + (k.url || '');
  return 'https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=' + encodeURIComponent('Veiling sluit: ' + (k.titel || 'kavel')) +
    '&startdt=' + encodeURIComponent(new Date(t.start).toISOString()) + '&enddt=' + encodeURIComponent(new Date(t.eind).toISOString()) + '&body=' + encodeURIComponent(tekst);
}
function agendaKeuze(idx) {
  var k = kavels[idx]; if (!k || !agendaTijden(k)) return;
  var h = '<p class="help" style="margin:0 0 12px">Zet de sluittijd van dit kavel in je agenda, met een herinnering een kwartier van tevoren.</p><div class="ag-knoppen">' +
    '<a class="btn btn-secondary" href="' + esc(googleAgendaUrl(k)) + '" target="_blank" rel="noopener">' + ic('calendar') + 'Google Agenda</a>' +
    '<a class="btn btn-secondary" href="' + esc(outlookAgendaUrl(k)) + '" target="_blank" rel="noopener">' + ic('calendar') + 'Outlook</a>' +
    '<button class="btn btn-secondary" type="button" onclick="zetInAgenda(' + idx + ')">' + ic('download') + 'Apple Agenda of ander (bestand)</button></div>';
  if (serverModus() && account) h += '<div class="note" style="margin-top:14px">' + ic('info') + '<span>Handiger: koppel je agenda één keer, dan staan de sluittijden van al je kavels er vanzelf in. <button type="button" class="linkje" onclick="agendaKoppelen()">Agenda koppelen</button></span></div>';
  openModal('In je agenda zetten', h, [{ label: 'Sluiten', cls: 'btn-secondary' }]);
}
function agendaLinks(url) {
  var webcal = url.replace(/^https?:/, 'webcal:');
  return {
    webcal: webcal,
    google: 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcal),
    outlook: 'https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(url) + '&name=' + encodeURIComponent('Veiling Analyser')
  };
}
function agendaKoppelScherm(url) {
  var l = agendaLinks(url);
  return '<p class="help" style="margin:0 0 12px">Voeg deze agenda één keer toe. Daarna verschijnen de sluittijden van al je opgeslagen kavels vanzelf in je agenda, met een herinnering een kwartier van tevoren. Je agenda-app haalt nieuwe kavels zelf op; bij Google kan dat een paar uur duren.</p>' +
    '<div class="ag-knoppen"><a class="btn btn-primary" href="' + esc(l.webcal) + '">' + ic('calendar') + 'iPhone, iPad of Mac</a>' +
    '<a class="btn btn-secondary" href="' + esc(l.google) + '" target="_blank" rel="noopener">' + ic('calendar') + 'Google Agenda</a>' +
    '<a class="btn btn-secondary" href="' + esc(l.outlook) + '" target="_blank" rel="noopener">' + ic('calendar') + 'Outlook</a></div>' +
    '<label class="ctl-l" for="ag-url" style="margin-top:14px">Of kopieer de link</label><div style="display:flex;gap:8px"><input class="input" id="ag-url" readonly value="' + esc(url) + '"><button class="btn btn-secondary" type="button" onclick="kopieerAgendaLink()">Kopieer</button></div>' +
    '<div class="help">Deze link is persoonlijk: wie hem heeft, ziet de titels en sluittijden van je kavels. Deel hem niet. Je kunt hem altijd vervangen door een nieuwe.</div>';
}
async function kopieerAgendaLink() {
  var v = document.getElementById('ag-url'); if (!v) return;
  try { await navigator.clipboard.writeText(v.value); toast('Link gekopieerd'); } catch (e) { v.select(); }
}
async function agendaKoppelen(nieuw) {
  if (!serverModus() || !account) { toast('Log in om je agenda te koppelen.', null, true); return; }
  var opgeslagen = null;
  try { opgeslagen = localStorage.getItem('va_agenda_url'); } catch (e) {}
  if (opgeslagen && !nieuw) return toonAgendaKoppeling(opgeslagen);
  try {
    var r = await apiCall('/api/agenda-link', { method: 'POST', body: { nieuw: true } });
    try { localStorage.setItem('va_agenda_url', r.url); } catch (e) {}
    toonAgendaKoppeling(r.url);
  } catch (e) { toast(e.message || 'Het koppelen lukte niet.', null, true); }
}
function toonAgendaKoppeling(url) {
  openModal('Agenda koppelen', agendaKoppelScherm(url), [
    { label: 'Nieuwe link maken', cls: 'btn-ghost', keepOpen: true, fn: function() {
      bevestig('Nieuwe agendalink maken?', 'De oude link werkt daarna niet meer. Voeg de nieuwe opnieuw toe aan je agenda.', 'Nieuwe link', false, function() { agendaKoppelen(true); });
    } },
    { label: 'Sluiten', cls: 'btn-primary' }
  ]);
}

// ── Meldingen op je telefoon voordat een veiling sluit ──
function isIos() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function pushMogelijk() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function b64urlNaarBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  var bin = atob(s), u = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
async function huidigAbonnement() {
  if (!pushMogelijk()) return null;
  try { var reg = await navigator.serviceWorker.getRegistration(); return reg ? await reg.pushManager.getSubscription() : null; } catch (e) { return null; }
}
async function meldingenScherm() {
  if (!serverModus() || !account) { toast('Log in om meldingen aan te zetten.', null, true); return; }
  var ab = await huidigAbonnement();
  var inst = { minuten: 15, bij_sluiting: true };
  try { inst = Object.assign(inst, JSON.parse(localStorage.getItem('va_meldingen') || '{}')); } catch (e) {}
  var h;
  if (!pushMogelijk() || (isIos() && !isStandalone())) {
    h = isIos()
      ? '<p class="help" style="margin:0 0 10px">Op een iPhone of iPad werken meldingen alleen als de app op je beginscherm staat (iOS 16.4 of nieuwer).</p><ol class="help" style="margin:0 0 10px 18px;padding:0"><li>Tik in Safari op de deelknop (het vierkantje met de pijl).</li><li>Kies <b>Zet op beginscherm</b>.</li><li>Open de app vanaf je beginscherm en zet hier de meldingen aan.</li></ol>'
      : '<p class="help" style="margin:0">Deze browser ondersteunt geen meldingen. Probeer Chrome, Edge of Firefox, of zet de sluittijden in je agenda.</p>';
    h += '<div class="note">' + ic('info') + '<span>Ondertussen kun je je agenda koppelen: dan krijg je een herinnering via je agenda. <button type="button" class="linkje" onclick="agendaKoppelen()">Agenda koppelen</button></span></div>';
    openModal('Meldingen', h, [{ label: 'Sluiten', cls: 'btn-primary' }]);
    return;
  }
  h = '<p class="help" style="margin:0 0 12px">Je krijgt een melding op dit apparaat voordat een veiling van je opgeslagen kavels sluit. Gewonnen kavels en kavels waarvoor je meldingen uitzet, slaan we over.</p>' +
    '<label class="ctl-l" for="ml-min">Herinnering</label><select class="select" id="ml-min">' + [5, 15, 30, 60].map(function(m) { return '<option value="' + m + '"' + (inst.minuten === m ? ' selected' : '') + '>' + m + ' minuten voor sluiting</option>'; }).join('') + '</select>' +
    '<label class="check" style="margin-top:12px"><input type="checkbox" id="ml-sluit"' + (inst.bij_sluiting ? ' checked' : '') + '> Ook een melding als de veiling gesloten is</label>' +
    '<div class="help">Status: ' + (ab ? 'meldingen staan aan op dit apparaat.' : 'meldingen staan uit op dit apparaat.') + '</div><div class="msg err" id="ml-err" role="alert"></div>';
  var acties = [];
  if (ab) acties.push({ label: 'Uitzetten', cls: 'btn-ghost', fn: meldingenUit });
  if (ab) acties.push({ label: 'Testmelding', cls: 'btn-secondary', keepOpen: true, fn: async function() {
    try { await apiCall('/api/push-test', { method: 'POST', body: {} }); toast('Testmelding verstuurd'); } catch (e) { toonMsg('ml-err', e.message || 'Versturen lukte niet.'); }
  } });
  acties.push({ label: ab ? 'Opslaan' : 'Meldingen aanzetten', cls: 'btn-primary', keepOpen: true, fn: meldingenAan });
  openModal('Meldingen', h, acties);
}
async function meldingenAan() {
  var minuten = Number(document.getElementById('ml-min').value) || 15;
  var bijSluiting = document.getElementById('ml-sluit').checked;
  try {
    var toestemming = await Notification.requestPermission();
    if (toestemming !== 'granted') { toonMsg('ml-err', 'Je hebt meldingen niet toegestaan. Zet ze aan in de instellingen van je browser of telefoon.'); return; }
    var reg = await navigator.serviceWorker.ready;
    var ab = await reg.pushManager.getSubscription();
    if (!ab) {
      var s = await apiCall('/api/push-sleutel', { method: 'GET' });
      ab = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlNaarBytes(s.sleutel) });
    }
    await apiCall('/api/push-aan', { method: 'POST', body: { abonnement: ab.toJSON(), minuten: minuten, bij_sluiting: bijSluiting } });
    try { localStorage.setItem('va_meldingen', JSON.stringify({ minuten: minuten, bij_sluiting: bijSluiting })); } catch (e) {}
    closeModal();
    toast('Meldingen staan aan: ' + minuten + ' minuten voor sluiting');
  } catch (e) { toonMsg('ml-err', e.message || 'Meldingen aanzetten lukte niet.'); }
}
async function meldingenUit() {
  var ab = await huidigAbonnement();
  if (ab) {
    try { await apiCall('/api/push-uit', { method: 'POST', body: { endpoint: ab.endpoint } }); } catch (e) {}
    try { await ab.unsubscribe(); } catch (e) {}
  }
  toast('Meldingen staan uit op dit apparaat');
}
function wisselKavelMelding(idx) {
  var k = kavels[idx]; if (!k) return;
  if (k.geen_melding) delete k.geen_melding; else k.geen_melding = true;
  slaKavelsOp();
  toast(k.geen_melding ? 'Geen meldingen voor dit kavel' : 'Meldingen voor dit kavel staan weer aan');
  if (document.getElementById('analyse-result') && document.getElementById('analyse-result').innerHTML) toonAnalyseResultaat(k, true);
}
