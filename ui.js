/**
 * ui.js
 * Alle DOM-opbouw en scherm-logica: meldingen, herbruikbare UI-componentjes
 * (maakButton, maakBadge, ...), en de render-functies voor de verschillende
 * schermen. Bouwt bewust met createElement/textContent in plaats van
 * innerHTML += om onbedoelde HTML-injectie vanuit AI- of Sheets-data te voorkomen.
 */
(function (App) {
  'use strict';

  var h = App.helpers;

  // ── Centrale meldingen (toast) ────────────────────────────────────────────
  var toastTimer = null;
  function toast(msg, type) {
    var el = h.byId('app-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast toast-' + (type || 'info') + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 4000);
  }
  function showError(msg) { App.logger.error(msg); toast(msg, 'error'); }
  function showSuccess(msg) { toast(msg, 'success'); }
  function showLoading(msg) { toast(msg, 'info'); }

  // ── Kleine herbruikbare UI-componenten ────────────────────────────────────
  function maakButton(tekst, className, onClick, opts) {
    var btn = document.createElement('button');
    btn.className = className || 'btn-sm';
    btn.textContent = tekst;
    if (opts && opts.title) btn.title = opts.title;
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  function maakBadge(tekst, className) {
    var span = document.createElement('span');
    span.className = className;
    span.textContent = tekst;
    return span;
  }

  function maakPill(tekst, className) {
    return maakBadge(tekst, 'pill ' + className);
  }

  function maakStatusPill(advies) {
    var map = {
      kopen: ['s-klaar', 'Bied!'],
      twijfel: ['s-twijfel', 'Twijfel'],
      skip: ['s-skip', 'Skip']
    };
    var conf = map[advies] || ['s-wacht', 'Wacht'];
    return maakBadge(conf[1], 'pill pill-status ' + conf[0]);
  }

  function maakPrijskaart(platformNaam, platformClass, data) {
    if (!data) return null;
    var card = document.createElement('div'); card.className = 'p-card';
    var titel = document.createElement('div'); titel.className = 'p-platform ' + platformClass; titel.textContent = platformNaam;
    card.appendChild(titel);

    var rij = document.createElement('div'); rij.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:6px';
    var links = document.createElement('div');
    var reeks = document.createElement('div'); reeks.style.cssText = 'display:flex;align-items:baseline;gap:4px';
    var laag = document.createElement('span'); laag.className = 'p-range'; laag.textContent = h.fmt(data.laag) + ' - ';
    var mid = document.createElement('span'); mid.className = 'p-main'; mid.textContent = h.fmt(data.gemiddeld);
    var hoog = document.createElement('span'); hoog.className = 'p-range'; hoog.textContent = ' - ' + h.fmt(data.hoog);
    reeks.appendChild(laag); reeks.appendChild(mid); reeks.appendChild(hoog);
    links.appendChild(reeks);
    var sub = document.createElement('div'); sub.className = 'p-sub'; sub.textContent = '\u23F3 ' + (data.verkooptijd || '-');
    links.appendChild(sub);
    rij.appendChild(links);

    var confMap = { hoog: ['b-high', '\u2713 Betrouwbaar'], middel: ['b-mid', '~ Indicatief'], laag: ['b-low', '? Onzeker'] };
    var conf = confMap[data.vertrouwen] || confMap.laag;
    rij.appendChild(maakBadge(conf[1], 'badge ' + conf[0]));
    card.appendChild(rij);

    if (data.tip) {
      var tip = document.createElement('div'); tip.className = 'p-tip'; tip.textContent = '\uD83D\uDCA1 ' + data.tip;
      card.appendChild(tip);
    }
    var woorden = data.zoekwoorden || data.keywords;
    if (woorden && woorden.length) {
      var tags = document.createElement('div'); tags.className = 'tags';
      woorden.forEach(function (w) { tags.appendChild(maakBadge(w, 'tag')); });
      card.appendChild(tags);
    }
    return card;
  }

  function maakKostenBox(kosten, eigenBod) {
    var box = document.createElement('div'); box.className = 'costs-box';
    var titel = document.createElement('h4');
    titel.textContent = '\uD83D\uDCB0 Kostenberekening' + (kosten.site ? ' \u2014 ' + kosten.site : '') +
      (' \u00B7 ' + (eigenBod ? '\uD83D\uDE4B Mijn bod' : '\uD83D\uDC64 Huidig bod')) +
      (kosten.opgeld_pct != null ? (' \u00B7 ' + kosten.opgeld_pct + '% opgeld') : '');
    box.appendChild(titel);

    function rij(label, waarde, extraClass) {
      var r = document.createElement('div'); r.className = 'c-row';
      var l = document.createElement('span'); l.textContent = label;
      var w = document.createElement('span'); w.textContent = waarde; if (extraClass) w.className = extraClass;
      r.appendChild(l); r.appendChild(w);
      return r;
    }
    box.appendChild(rij('Bod', h.fmt(kosten.bod)));
    box.appendChild(rij('Veilingkosten (opgeld)', h.fmt(kosten.vk)));
    box.appendChild(rij('BTW', h.fmt(kosten.btw)));
    box.appendChild(rij('Totale inkoopprijs', h.fmt(kosten.totaal)));
    if (kosten.marge != null) {
      var margeRij = rij('Verwachte marge (MP gem.)', (kosten.marge > 0 ? '+' : '') + h.fmt(kosten.marge), kosten.marge > 0 ? 'c-pos' : 'c-neg');
      margeRij.style.cssText = 'margin-top:6px;padding-top:8px;border-top:1px solid var(--border)';
      box.appendChild(margeRij);
    }
    return box;
  }

  function maakROI(roi) {
    var kleur = roi >= 70 ? 'var(--green)' : roi >= 40 ? 'var(--orange)' : 'var(--red)';
    var wrap = document.createElement('div'); wrap.className = 'roi-wrap';
    var top = document.createElement('div'); top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px';
    var lbl = document.createElement('span'); lbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px'; lbl.textContent = 'Handelspotentieel';
    var val = document.createElement('span'); val.style.cssText = 'font-size:20px;font-weight:800;color:' + kleur; val.textContent = roi + '/100';
    top.appendChild(lbl); top.appendChild(val); wrap.appendChild(top);
    var bar = document.createElement('div'); bar.className = 'roi-bar';
    var fill = document.createElement('div'); fill.className = 'roi-fill'; fill.style.width = roi + '%';
    bar.appendChild(fill); wrap.appendChild(bar);
    var labels = document.createElement('div'); labels.className = 'roi-labels';
    ['Laag', 'Gemiddeld', 'Hoog'].forEach(function (t) { var s = document.createElement('span'); s.textContent = t; labels.appendChild(s); });
    wrap.appendChild(labels);
    return wrap;
  }

  function maakVerdict(advies, reden, maxBod) {
    var cls = advies === 'kopen' ? 'v-kopen' : advies === 'twijfel' ? 'v-twijfel' : 'v-skip';
    var titelTekst = advies === 'kopen' ? '\u2705 Goede koop!' : advies === 'twijfel' ? '\u26A0\uFE0F Twijfelgeval' : '\u274C Beter overslaan';
    var box = document.createElement('div'); box.className = 'verdict ' + cls;
    var h3 = document.createElement('h3'); h3.textContent = titelTekst; box.appendChild(h3);
    var p = document.createElement('p'); p.textContent = reden; box.appendChild(p);
    if (maxBod) {
      var p2 = document.createElement('p'); p2.style.cssText = 'margin-top:7px;font-weight:600';
      p2.textContent = '\uD83D\uDCA1 Maximaal rendabel bieden: ' + h.fmt(maxBod);
      box.appendChild(p2);
    }
    return box;
  }

  // ── Samenvattingskaart ────────────────────────────────────────────────────
  // De belangrijkste cijfers (koopadvies, verwachte winst, ROI, totale kosten)
  // samen bovenaan het analyseresultaat, in één overzichtelijke kaart.
  function maakSamenvatting(d) {
    var kosten = d.kosten;
    var advies = d.advies;
    var cls = advies === 'kopen' ? 'sum-kopen' : advies === 'twijfel' ? 'sum-twijfel' : 'sum-skip';
    var icon = advies === 'kopen' ? '\u2713' : advies === 'twijfel' ? '~' : '\u2715';
    var titelTekst = advies === 'kopen' ? 'Goede koop' : advies === 'twijfel' ? 'Twijfelgeval' : 'Beter overslaan';
    var badgeTekst = advies === 'kopen' ? 'Bied' : advies === 'twijfel' ? 'Twijfel' : 'Skip';

    var card = document.createElement('div'); card.className = 'summary-card ' + cls;

    var head = document.createElement('div'); head.className = 'summary-head';
    var iconEl = document.createElement('div'); iconEl.className = 'summary-icon'; iconEl.textContent = icon;
    head.appendChild(iconEl);
    var headTxt = document.createElement('div');
    var titel = document.createElement('div'); titel.className = 'summary-title'; titel.textContent = titelTekst;
    headTxt.appendChild(titel);
    if (d.adviesReden) {
      var reden = document.createElement('div'); reden.className = 'summary-reason'; reden.textContent = d.adviesReden;
      headTxt.appendChild(reden);
    }
    if (d.maxBod) {
      var maxb = document.createElement('div'); maxb.className = 'summary-maxbod';
      maxb.textContent = '\uD83D\uDCA1 Maximaal rendabel bieden: ' + h.fmt(d.maxBod);
      headTxt.appendChild(maxb);
    }
    head.appendChild(headTxt);
    card.appendChild(head);

    var grid = document.createElement('div'); grid.className = 'summary-grid';

    function tile(label, valueText, valueClass) {
      var t = document.createElement('div'); t.className = 'summary-tile';
      var l = document.createElement('div'); l.className = 'summary-tile-label'; l.textContent = label;
      var v = document.createElement('div'); v.className = 'summary-tile-value' + (valueClass ? ' ' + valueClass : ''); v.textContent = valueText;
      t.appendChild(l); t.appendChild(v);
      return t;
    }

    var t1 = document.createElement('div'); t1.className = 'summary-tile';
    var l1 = document.createElement('div'); l1.className = 'summary-tile-label'; l1.textContent = 'Koopadvies';
    var badge = document.createElement('span'); badge.className = 'summary-badge'; badge.textContent = badgeTekst;
    t1.appendChild(l1); t1.appendChild(badge);
    grid.appendChild(t1);

    if (kosten && kosten.marge != null) {
      grid.appendChild(tile('Verwachte winst', (kosten.marge > 0 ? '+' : '') + h.fmt(kosten.marge), kosten.marge > 0 ? 'pos' : 'neg'));
    } else {
      grid.appendChild(tile('Verwachte winst', '\u2014'));
    }

    var t3 = document.createElement('div'); t3.className = 'summary-tile';
    var l3 = document.createElement('div'); l3.className = 'summary-tile-label'; l3.textContent = 'Handelspotentieel';
    var v3 = document.createElement('div'); v3.className = 'summary-tile-value'; v3.textContent = d.roi + '/100';
    var roiKleur = d.roi >= 70 ? 'var(--green)' : d.roi >= 40 ? 'var(--orange)' : 'var(--red)';
    var bar = document.createElement('div'); bar.className = 'summary-bar';
    var fill = document.createElement('div'); fill.className = 'summary-bar-fill'; fill.style.width = d.roi + '%'; fill.style.background = roiKleur;
    bar.appendChild(fill);
    t3.appendChild(l3); t3.appendChild(v3); t3.appendChild(bar);
    grid.appendChild(t3);

    if (kosten) {
      grid.appendChild(tile('Totale kosten', h.fmt(kosten.totaal)));
    } else {
      grid.appendChild(tile('Totale kosten', '\u2014'));
    }

    card.appendChild(grid);
    return card;
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  function switchTab(name) {
    var namen = ['overzicht', 'analyse', 'gewonnen', 'handleiding'];
    h.qsa('.tab').forEach(function (t, i) { t.classList.toggle('active', namen[i] === name); });
    h.qsa('.panel').forEach(function (p) { p.classList.remove('active'); });
    h.byId('tab-' + name).classList.add('active');
    if (name === 'overzicht') renderOverzicht();
    if (name === 'gewonnen') renderGewonnen();
  }

  // ── Dashboard statistieken ──────────────────────────────────────────────────
  function renderStats(actieveKavels) {
    var afgeronde = App.state.kavels.filter(function (k) { return k.kosten && k.kosten.marge != null; });
    var totaleWinst = afgeronde.reduce(function (s, k) { return s + k.kosten.marge; }, 0);
    var gemMarge = afgeronde.length ? totaleWinst / afgeronde.length : 0;
    var gemRoi = App.state.kavels.length
      ? App.state.kavels.reduce(function (s, k) { return s + (k.roi || 0); }, 0) / App.state.kavels.length
      : 0;
    var gewonnen = App.state.kavels.filter(function (k) { return k.status === 'gewonnen'; });
    var totaalGeinvesteerd = gewonnen.reduce(function (s, k) { return s + (k.kosten ? k.kosten.totaal : 0); }, 0);
    var beste = afgeronde.slice().sort(function (a, b) { return b.kosten.marge - a.kosten.marge; })[0];
    var slechtste = afgeronde.slice().sort(function (a, b) { return a.kosten.marge - b.kosten.marge; })[0];

    var nBied = actieveKavels.filter(function (k) { return k.advies === 'kopen'; }).length;
    var nTwij = actieveKavels.filter(function (k) { return k.advies === 'twijfel'; }).length;
    var nSkip = actieveKavels.filter(function (k) { return k.advies === 'skip'; }).length;
    var nEigen = actieveKavels.filter(function (k) { return k.eigen_bod === true; }).length;

    var rij = h.byId('stats-row');
    rij.innerHTML = '';
    function stat(num, label, kleur) {
      var box = document.createElement('div'); box.className = 'stat';
      var n = document.createElement('div'); n.className = 'stat-num'; if (kleur) n.style.color = kleur; n.textContent = num;
      var l = document.createElement('div'); l.className = 'stat-lbl'; l.textContent = label;
      box.appendChild(n); box.appendChild(l);
      return box;
    }
    rij.appendChild(stat(actieveKavels.length, 'Totaal'));
    rij.appendChild(stat(nBied, 'Aanraders', 'var(--green)'));
    rij.appendChild(stat(nTwij, 'Twijfel', 'var(--orange)'));
    rij.appendChild(stat(nSkip, 'Skip', 'var(--red)'));
    rij.appendChild(stat(nEigen, 'Mijn biedingen', 'var(--gold-ink)'));
    rij.appendChild(stat(h.fmt(totaleWinst), 'Totale winst', totaleWinst >= 0 ? 'var(--green)' : 'var(--red)'));
    rij.appendChild(stat(Math.round(gemRoi) + '/100', 'Gem. ROI'));
    rij.appendChild(stat(h.fmt(gemMarge), 'Gem. marge', gemMarge >= 0 ? 'var(--green)' : 'var(--red)'));
    if (gewonnen.length) rij.appendChild(stat(h.fmt(totaalGeinvesteerd), 'Totaal geïnvesteerd'));
    if (beste) rij.appendChild(stat(h.fmt(beste.kosten.marge), 'Beste koop', 'var(--green)'));
    if (slechtste && slechtste !== beste) rij.appendChild(stat(h.fmt(slechtste.kosten.marge), 'Slechtste koop', 'var(--red)'));
  }

  // ── Overzicht met filter, zoeken en sorteren ────────────────────────────────
  var zoekterm = '';
  var sortering = 'nieuwste';

  function setZoekterm(v) { zoekterm = v.toLowerCase(); renderOverzicht(); }
  function setSortering(v) { sortering = v; renderOverzicht(); }

  function setFilter(f, btn) {
    App.state.filter = f;
    h.qsa('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderOverzicht();
  }

  function renderOverzicht() {
    var leeg = h.byId('ov-leeg');
    var inhoud = h.byId('ov-inhoud');
    if (App.state.kavels.length === 0) { leeg.style.display = 'block'; inhoud.style.display = 'none'; return; }
    leeg.style.display = 'none'; inhoud.style.display = 'block';

    var actieveKavels = App.state.kavels.filter(function (k) { return k.status !== 'gewonnen'; });
    var gefilterd = actieveKavels.filter(function (k) {
      if (App.state.filter === 'wacht' && !(!k.advies || k.status === 'wacht')) return false;
      if (App.state.filter === 'eigen' && k.eigen_bod !== true) return false;
      if (['kopen', 'twijfel', 'skip'].indexOf(App.state.filter) !== -1 && k.advies !== App.state.filter) return false;
      if (zoekterm && (k.titel || '').toLowerCase().indexOf(zoekterm) === -1 && (k.veiling || '').toLowerCase().indexOf(zoekterm) === -1) return false;
      return true;
    });

    gefilterd = gefilterd.slice().sort(function (a, b) {
      if (sortering === 'nieuwste') return (b.toegevoegd || 0) - (a.toegevoegd || 0);
      if (sortering === 'oudste') return (a.toegevoegd || 0) - (b.toegevoegd || 0);
      if (sortering === 'marge-hoog') return ((b.kosten && b.kosten.marge) || -Infinity) - ((a.kosten && a.kosten.marge) || -Infinity);
      if (sortering === 'marge-laag') return ((a.kosten && a.kosten.marge) || Infinity) - ((b.kosten && b.kosten.marge) || Infinity);
      if (sortering === 'roi') return (b.roi || 0) - (a.roi || 0);
      return 0;
    });

    App.state.huidigGefilterd = gefilterd;
    renderStats(actieveKavels);

    var list = h.byId('kavel-list');
    list.innerHTML = '';
    list.classList.toggle('selectie-modus', App.state.selectieModus);

    if (gefilterd.length === 0) {
      var leegMsg = document.createElement('div');
      leegMsg.style.cssText = 'text-align:center;padding:24px;color:var(--text-secondary);font-size:14px';
      leegMsg.textContent = 'Geen kavels gevonden voor dit filter/deze zoekterm.';
      list.appendChild(leegMsg);
      return;
    }

    gefilterd.forEach(function (k, i) {
      var echteIdx = App.state.kavels.indexOf(k);
      list.appendChild(maakKavelRij(k, i, echteIdx, false));
    });
  }

  function maakKavelRij(k, i, echteIdx, isGewonnen) {
    var div = document.createElement('div');
    div.className = 'kavel-row' + (App.state.geselecteerd.has(i) ? ' geselecteerd' : '');
    if (isGewonnen) div.style.gridTemplateColumns = 'auto 1fr auto';
    if (!isGewonnen) div.addEventListener('click', function () { if (App.state.selectieModus) selecteerRij(i); });

    if (!isGewonnen) {
      var selCol = document.createElement('div'); selCol.className = 'selectie-col';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'kavel-checkbox'; cb.checked = App.state.geselecteerd.has(i);
      cb.addEventListener('click', function (e) { e.stopPropagation(); });
      cb.addEventListener('change', function () { selecteerRij(i); });
      selCol.appendChild(cb); div.appendChild(selCol);

      var num = document.createElement('div'); num.className = 'kavel-num'; num.textContent = i + 1;
      div.appendChild(num);
    } else {
      var trofee = document.createElement('div'); trofee.textContent = '\uD83C\uDFC6'; trofee.style.fontSize = '20px';
      div.appendChild(trofee);
    }

    var main = document.createElement('div');
    var titel = document.createElement('div'); titel.className = 'kavel-titel'; titel.textContent = k.titel || 'Onbekend';
    if (k.eigen_bod && !isGewonnen) {
      var b = maakBadge('Mijn bod', 'pill pill-eigen-bod');
      b.style.cssText = 'margin-left:6px;vertical-align:middle';
      titel.appendChild(b);
    }
    main.appendChild(titel);

    var meta = document.createElement('div'); meta.className = 'kavel-meta';
    var metaTekst = (k.veiling || 'Onbekend') + (k.kavelnummer ? ' \u00B7 Kavel ' + k.kavelnummer : '');
    if (isGewonnen) metaTekst = (k.veiling || '') + ' \u00B7 Gewonnen op ' + h.formatDate(k.gewonnen_op) + (k.kavelnummer ? ' \u00B7 Kavel ' + k.kavelnummer : '');
    meta.textContent = metaTekst;
    if (!isGewonnen && k.url) {
      meta.appendChild(document.createTextNode(' \u00B7 '));
      var link = document.createElement('a'); link.href = k.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.style.cssText = 'color:var(--gold);text-decoration:none'; link.textContent = '\u2197 Bekijk';
      meta.appendChild(link);
    }
    main.appendChild(meta);

    var pills = document.createElement('div'); pills.className = 'kavel-pills';
    if (!isGewonnen) pills.appendChild(maakStatusPill(k.advies));
    if (!isGewonnen && k.veiling) pills.appendChild(maakPill(k.veiling, 'pill-veiling'));
    if (k.huidig_bod) {
      var label = isGewonnen ? 'Gewonnen voor' : (k.eigen_bod ? 'Mijn bod' : 'Huidig bod');
      pills.appendChild(maakPill(label + ': ' + h.fmt(k.huidig_bod), k.eigen_bod ? 'pill-eigen-bod' : 'pill-bod'));
    }
    if (k.kosten) pills.appendChild(maakPill((isGewonnen ? 'Totaal betaald: ' : 'Incl. kosten: ') + h.fmt(k.kosten.totaal), 'pill-totaal'));
    if (!isGewonnen && k.kosten && k.kosten.marge != null) {
      pills.appendChild(maakPill((k.kosten.marge > 0 ? '+' : '') + h.fmt(k.kosten.marge) + ' marge', k.kosten.marge > 0 ? 'pill-marge-pos' : 'pill-marge-neg'));
    }
    if (k.mp_gemiddeld) pills.appendChild(maakPill((isGewonnen ? 'Verwachte verkoop: ' : 'MP ~') + h.fmt(k.mp_gemiddeld), 'pill-mp'));
    main.appendChild(pills);

    if (!isGewonnen && k.adviesReden) {
      var reden = document.createElement('div'); reden.className = 'kavel-reden';
      reden.textContent = k.adviesReden.length > 100 ? k.adviesReden.slice(0, 100) + '...' : k.adviesReden;
      main.appendChild(reden);
    }
    div.appendChild(main);

    var acties = document.createElement('div'); acties.className = 'kavel-acties';
    acties.appendChild(maakButton('Details', 'btn-sm', function (e) { e.stopPropagation(); App.analyse.openDetail(echteIdx); }));
    if (isGewonnen) {
      acties.appendChild(maakButton('\u21BA Herstel', 'btn-sm', function () { herstelUitGewonnen(echteIdx); }, { title: 'Terug naar overzicht' }));
      acties.appendChild(maakButton('X', 'btn-danger', function () { if (confirm('Definitief verwijderen?')) { verwijderKavel(echteIdx); renderGewonnen(); } }));
    } else {
      var btnG = maakButton('\uD83C\uDFC6 Gewonnen', 'btn-sm', function (e) { e.stopPropagation(); markeerGewonnen(echteIdx); });
      btnG.style.background = 'var(--gold-soft)'; btnG.style.borderColor = 'var(--gold-border)'; btnG.style.color = 'var(--gold-ink)';
      acties.appendChild(btnG);
      acties.appendChild(maakButton('Heranalyseer', 'btn-sm', function (e) { e.stopPropagation(); App.analyse.heranalyseer(echteIdx); }));
      acties.appendChild(maakButton('X', 'btn-danger', function (e) { e.stopPropagation(); verwijderKavel(echteIdx); }));
    }
    div.appendChild(acties);
    return div;
  }

  function renderGewonnen() {
    var gewonnenKavels = App.state.kavels.filter(function (k) { return k.status === 'gewonnen'; });
    var leeg = h.byId('gew-leeg');
    var inhoud = h.byId('gew-inhoud');
    if (gewonnenKavels.length === 0) { leeg.style.display = 'block'; inhoud.style.display = 'none'; return; }
    leeg.style.display = 'none'; inhoud.style.display = 'block';

    gewonnenKavels = gewonnenKavels.slice().sort(function (a, b) { return (b.gewonnen_op || 0) - (a.gewonnen_op || 0); });
    var list = h.byId('gewonnen-list');
    list.innerHTML = '';
    gewonnenKavels.forEach(function (k) {
      var echteIdx = App.state.kavels.indexOf(k);
      list.appendChild(maakKavelRij(k, -1, echteIdx, true));
    });
  }

  function verwijderKavel(idx) {
    App.state.kavels.splice(idx, 1);
    App.stateActions.slaKavelsOp(); updateBadge(); renderOverzicht();
  }

  function markeerGewonnen(idx) {
    var k = App.state.kavels[idx];
    if (!confirm('Markeer "' + k.titel + '" als gewonnen?\n\nHij verdwijnt uit het overzicht en komt in de Gewonnen tab te staan.')) return;
    k.status = 'gewonnen';
    k.gewonnen_op = Date.now();
    App.stateActions.slaKavelsOp(); updateBadge(); renderOverzicht();
  }

  function herstelUitGewonnen(idx) {
    var k = App.state.kavels[idx];
    k.status = k.advies === 'kopen' ? 'klaar' : (k.advies === 'skip' ? 'skip' : 'klaar');
    delete k.gewonnen_op;
    App.stateActions.slaKavelsOp(); renderGewonnen();
  }

  // ── Selectie / bulk verwijderen ─────────────────────────────────────────────
  function toggleSelectie() {
    App.state.selectieModus = !App.state.selectieModus;
    App.state.geselecteerd.clear();
    h.byId('sel-balk').style.display = App.state.selectieModus ? 'flex' : 'none';
    h.byId('selecteer-btn').textContent = App.state.selectieModus ? 'X Annuleren' : 'Selecteren';
    renderOverzicht();
  }

  function selecteerRij(i) {
    if (App.state.geselecteerd.has(i)) App.state.geselecteerd.delete(i); else App.state.geselecteerd.add(i);
    h.byId('sel-aantal').textContent = App.state.geselecteerd.size + ' geselecteerd';
    var rijen = h.qsa('.kavel-row');
    if (rijen[i]) rijen[i].classList.toggle('geselecteerd', App.state.geselecteerd.has(i));
    var cbs = h.qsa('.kavel-checkbox');
    if (cbs[i]) cbs[i].checked = App.state.geselecteerd.has(i);
  }

  function allesAanvinken() {
    h.qsa('.kavel-row').forEach(function (r, i) { r.classList.add('geselecteerd'); App.state.geselecteerd.add(i); });
    h.qsa('.kavel-checkbox').forEach(function (cb) { cb.checked = true; });
    h.byId('sel-aantal').textContent = App.state.geselecteerd.size + ' geselecteerd';
  }

  function allesUitvinken() {
    App.state.geselecteerd.clear();
    h.qsa('.kavel-row').forEach(function (r) { r.classList.remove('geselecteerd'); });
    h.qsa('.kavel-checkbox').forEach(function (cb) { cb.checked = false; });
    h.byId('sel-aantal').textContent = '0 geselecteerd';
  }

  function verwijderSelectie() {
    if (App.state.geselecteerd.size === 0) { showError('Vink eerst kavels aan.'); return; }
    if (!confirm(App.state.geselecteerd.size + ' kavel(s) verwijderen?')) return;
    var teVerwijderen = new Set(Array.from(App.state.geselecteerd).map(function (i) { return App.state.huidigGefilterd[i]; }).filter(Boolean));
    App.state.kavels = App.state.kavels.filter(function (k) { return !teVerwijderen.has(k); });
    App.state.geselecteerd.clear();
    App.state.selectieModus = false;
    h.byId('sel-balk').style.display = 'none';
    h.byId('selecteer-btn').textContent = 'Selecteren';
    App.stateActions.slaKavelsOp(); updateBadge(); renderOverzicht();
  }

  function updateBadge() {
    var actief = App.state.kavels.filter(function (k) { return k.status !== 'gewonnen'; }).length;
    var gewonnen = App.state.kavels.filter(function (k) { return k.status === 'gewonnen'; }).length;
    h.byId('badge').textContent = actief;
    h.byId('badge-gewonnen').textContent = gewonnen;
  }

  function updateSyncStatus() {
    var el = h.byId('sync-status');
    if (!el) return;
    if (!App.state.sheetsUrl) { el.textContent = ''; return; }
    if (App.state.syncBezig) { el.textContent = 'Synchroniseren...'; return; }
    el.textContent = App.state.lastSync ? ('Laatst gesynchroniseerd: ' + h.formatDateTime(App.state.lastSync)) : 'Nog niet gesynchroniseerd';
  }

  // ── Veilinghuizen beheerscherm ───────────────────────────────────────────
  function vulVeilinghuisSelect(selecteerId) {
    var sel = h.byId('veilinghuis-select');
    sel.innerHTML = '';
    App.state.veilinghuizen.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.naam + (v.opgeld != null ? ' (' + v.opgeld + '% opgeld)' : '');
      sel.appendChild(opt);
    });
    if (selecteerId) sel.value = selecteerId;
  }

  function openVeilinghuizenModal() {
    renderVeilinghuizenLijst();
    resetVeilinghuisForm();
    h.byId('vh-modal').classList.add('open');
  }
  function closeVeilinghuizenModal() {
    h.byId('vh-modal').classList.remove('open');
    vulVeilinghuisSelect(h.byId('veilinghuis-select').value);
  }
  function renderVeilinghuizenLijst() {
    var list = h.byId('vh-list');
    list.innerHTML = '';
    App.state.veilinghuizen.forEach(function (v) {
      var row = document.createElement('div'); row.className = 'vh-row';
      var top = document.createElement('div'); top.className = 'vh-row-top';
      var naamDiv = document.createElement('div');
      var naamEl = document.createElement('div'); naamEl.className = 'vh-name'; naamEl.textContent = v.naam;
      var metaEl = document.createElement('div'); metaEl.className = 'vh-meta';
      metaEl.textContent = (v.urlPatroon ? 'Herkenning: ' + v.urlPatroon + ' \u00B7 ' : '') + 'Opgeld ' + v.opgeld + '% \u00B7 BTW ' + v.btw + '% (' +
        (v.btwBasis === 'opgeld' ? 'over opgeld' : v.btwBasis === 'geen' ? 'geen BTW' : 'over totaal') + ')';
      naamDiv.appendChild(naamEl); naamDiv.appendChild(metaEl);
      if (v.note) {
        var noteEl = document.createElement('div'); noteEl.className = 'small-note'; noteEl.style.marginTop = '4px';
        noteEl.textContent = '\u2139\uFE0F ' + v.note;
        naamDiv.appendChild(noteEl);
      }
      var acties = document.createElement('div'); acties.style.cssText = 'display:flex;gap:5px;flex-shrink:0';
      acties.appendChild(maakButton('Bewerk', 'btn-sm', function () { bewerkVeilinghuis(v.id); }));
      acties.appendChild(maakButton('X', 'btn-danger', function () { verwijderVeilinghuis(v.id); }));
      top.appendChild(naamDiv); top.appendChild(acties);
      row.appendChild(top);
      list.appendChild(row);
    });
  }
  function bewerkVeilinghuis(id) {
    var v = App.state.veilinghuizen.find(function (x) { return x.id === id; });
    if (!v) return;
    h.byId('vh-form-title').textContent = 'Veilinghuis bewerken';
    h.byId('vh-edit-id').value = v.id;
    h.byId('vh-naam').value = v.naam;
    h.byId('vh-url').value = v.urlPatroon || '';
    h.byId('vh-opgeld').value = v.opgeld;
    h.byId('vh-btw').value = v.btw;
    h.byId('vh-btw-basis').value = v.btwBasis || 'totaal';
    h.byId('vh-naam').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function resetVeilinghuisForm() {
    h.byId('vh-form-title').textContent = 'Nieuw veilinghuis toevoegen';
    h.byId('vh-edit-id').value = '';
    h.byId('vh-naam').value = '';
    h.byId('vh-url').value = '';
    h.byId('vh-opgeld').value = '';
    h.byId('vh-btw').value = '21';
    h.byId('vh-btw-basis').value = 'totaal';
  }
  function opslaanVeilinghuis() {
    var editId = h.byId('vh-edit-id').value;
    try {
      App.veilinghuizen.voegToeOfBewerk({
        naam: h.byId('vh-naam').value.trim(),
        urlPatroon: h.byId('vh-url').value.trim().toLowerCase(),
        opgeld: parseFloat(h.byId('vh-opgeld').value),
        btw: parseFloat(h.byId('vh-btw').value),
        btwBasis: h.byId('vh-btw-basis').value
      }, editId);
      renderVeilinghuizenLijst();
      resetVeilinghuisForm();
      showSuccess('Veilinghuis opgeslagen.');
    } catch (e) {
      showError(e.message);
    }
  }
  function verwijderVeilinghuis(id) {
    var v = App.state.veilinghuizen.find(function (x) { return x.id === id; });
    if (!v) return;
    if (!confirm('"' + v.naam + '" verwijderen?')) return;
    App.veilinghuizen.verwijder(id);
    renderVeilinghuizenLijst();
  }

  App.ui = {
    toast: toast, showError: showError, showSuccess: showSuccess, showLoading: showLoading,
    maakButton: maakButton, maakBadge: maakBadge, maakPill: maakPill, maakStatusPill: maakStatusPill,
    maakPrijskaart: maakPrijskaart, maakKostenBox: maakKostenBox, maakROI: maakROI, maakVerdict: maakVerdict,
    maakSamenvatting: maakSamenvatting,
    switchTab: switchTab, renderOverzicht: renderOverzicht, renderGewonnen: renderGewonnen, renderStats: renderStats,
    setFilter: setFilter, setZoekterm: setZoekterm, setSortering: setSortering,
    toggleSelectie: toggleSelectie, selecteerRij: selecteerRij, allesAanvinken: allesAanvinken,
    allesUitvinken: allesUitvinken, verwijderSelectie: verwijderSelectie,
    updateBadge: updateBadge, updateSyncStatus: updateSyncStatus,
    vulVeilinghuisSelect: vulVeilinghuisSelect, openVeilinghuizenModal: openVeilinghuizenModal,
    closeVeilinghuizenModal: closeVeilinghuizenModal, opslaanVeilinghuis: opslaanVeilinghuis,
    resetVeilinghuisForm: resetVeilinghuisForm, verwijderKavel: verwijderKavel,
    markeerGewonnen: markeerGewonnen, herstelUitGewonnen: herstelUitGewonnen
  };
})(window.App = window.App || {});
