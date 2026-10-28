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
    knop.textContent = limiet ? 'Abonnement kiezen' : 'Klaar';
    knop.onclick = limiet ? function() { toonAccount(); } : function() { closeModal(); switchTab('overzicht'); };
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
