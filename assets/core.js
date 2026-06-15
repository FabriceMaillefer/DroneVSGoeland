/* =====================================================================
   core.js — bibliothèque client partagée (vanilla JS, sans dépendance).
   Fournit : client API + polling ETag/304, icônes SVG, reconstruction de
   la timeline depuis les events, graphe en aires empilées, statistiques.
   Tout est exposé sous window.CDP.
   ===================================================================== */
(function () {
  'use strict';

  // Config injectée par la page (window.CDP_CONFIG) ou valeurs de repli.
  var CFG = window.CDP_CONFIG || {};
  var TEAM_NAMES = CFG.team_names || { A: 'DRONES', B: 'GOÉLAND' };

  /* ----------------------------------------------------------------
     Icônes SVG (couleur via currentColor + style color).
     Différenciation par la FORME, pas seulement la couleur.
     ---------------------------------------------------------------- */
  var ICONS = {
    drone: '<circle cx="5" cy="5" r="2.6"/><circle cx="19" cy="5" r="2.6"/><circle cx="5" cy="19" r="2.6"/><circle cx="19" cy="19" r="2.6"/><line x1="7" y1="7" x2="17" y2="17"/><line x1="17" y1="7" x2="7" y2="17"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.3" fill="currentColor" stroke="none"/>',
    gull: '<path d="M2 14C5 8 8.5 8.5 12 13C15.5 8.5 19 8 22 14" stroke-linecap="round"/>',
    neutral: '<circle cx="12" cy="12" r="8"/><line x1="8" y1="12" x2="16" y2="12"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16 8c1.5 1.2 1.5 6.8 0 8" stroke-linecap="round"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    check: '<path d="M5 12l5 5 9-10" stroke-linecap="round" stroke-linejoin="round"/>'
  };

  function icon(name, opts) {
    opts = opts || {};
    var size = opts.size || 24;
    var color = opts.color || '#fff';
    var sw = opts.sw || 1.7;
    var inner = ICONS[name] || '';
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="' + sw + '" style="color:' + color + '">' + inner + '</svg>';
  }

  function teamIcon(team, opts) {
    if (team === 'A') return icon('drone', opts);
    if (team === 'B') return icon('gull', opts);
    return icon('neutral', opts);
  }

  function teamName(team) {
    if (team === 'A') return TEAM_NAMES.A || 'A';
    if (team === 'B') return TEAM_NAMES.B || 'B';
    return 'NEUTRE';
  }

  /* ----------------------------------------------------------------
     Helpers
     ---------------------------------------------------------------- */
  function countTeams(postes) {
    var c = { A: 0, B: 0, neutral: 0 };
    (postes || []).forEach(function (p) {
      var t = p.team || 'neutral';
      if (c[t] === undefined) t = 'neutral';
      c[t]++;
    });
    return c;
  }

  // Formate des secondes en MM:SS (ou HH:MM:SS au-delà d'une heure).
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  function fmtClock(epoch) {
    if (!epoch) return '';
    var d = new Date(epoch * 1000);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ----------------------------------------------------------------
     Client API + polling avec ETag / 304
     ---------------------------------------------------------------- */
  var API = 'api/';

  // POST en application/x-www-form-urlencoded ; pas de session → pas de cookie.
  function post(url, params) {
    var body = new URLSearchParams(params || {});
    return fetch(API + url, { method: 'POST', body: body, cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) {
        return res.text().then(function (txt) {
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
          return { status: res.status, etag: res.headers.get('ETag'), data: data };
        });
      });
  }

  function getJSON(url) {
    return fetch(API + url, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) { return res.json(); });
  }

  /**
   * Boucle de synchronisation : interroge api/state.php toutes les ~5 s en
   * envoyant le dernier ETag dans If-None-Match. 304 → on ne fait rien.
   * 200 → on mémorise le nouvel ETag et on appelle onUpdate(state).
   */
  function createPoller(onUpdate, opts) {
    opts = opts || {};
    var interval = opts.interval || 5000;
    var etag = null;
    var timer = null;
    var inFlight = false;
    var stopped = false;

    function tick() {
      if (stopped || inFlight) return Promise.resolve();
      inFlight = true;
      var headers = {};
      if (etag) headers['If-None-Match'] = etag;
      return fetch(API + 'state.php', { headers: headers, cache: 'no-store', credentials: 'same-origin' })
        .then(function (res) {
          if (res.status === 304) return null;            // état inchangé : rien à faire
          if (res.status !== 200) return null;
          var newEtag = res.headers.get('ETag');
          return res.json().then(function (state) {
            if (newEtag) etag = newEtag;
            onUpdate(state);
            return state;
          });
        })
        .catch(function () { /* réseau mobile instable : on retentera au prochain tick */ })
        .then(function (r) { inFlight = false; return r; });
    }

    return {
      start: function () { stopped = false; tick(); timer = setInterval(tick, interval); return this; },
      stop: function () { stopped = true; if (timer) clearInterval(timer); timer = null; },
      pollNow: tick,
      // Applique un état déjà reçu (réponse d'une écriture) sans refaire de requête.
      applyExternal: function (state, newEtag) { if (newEtag) etag = newEtag; onUpdate(state); },
      getEtag: function () { return etag; },
      setEtag: function (e) { etag = e; }
    };
  }

  /* ----------------------------------------------------------------
     Reconstruction de la timeline depuis les events
     Retourne une liste de points { t, a, b, n } (fonction en escalier).
     ---------------------------------------------------------------- */
  function buildTimeline(events, postes, endT) {
    events = (events || []).slice().sort(function (x, y) { return x.t - y.t; });

    // Attribution initiale (t=0) : équipe finale, écrasée par le 1er 'from' vu.
    var initial = {};
    (postes || []).forEach(function (p) { initial[p.id] = p.team; });
    var seen = {};
    events.forEach(function (e) {
      if (!seen[e.poste_id]) { initial[e.poste_id] = e.from; seen[e.poste_id] = true; }
    });

    var cur = {};
    Object.keys(initial).forEach(function (k) { cur[k] = initial[k]; });

    function counts() {
      var a = 0, b = 0, n = 0;
      Object.keys(cur).forEach(function (k) {
        if (cur[k] === 'A') a++; else if (cur[k] === 'B') b++; else n++;
      });
      return { a: a, b: b, n: n };
    }

    var pts = [];
    var c0 = counts();
    pts.push({ t: 0, a: c0.a, b: c0.b, n: c0.n });
    events.forEach(function (e) {
      cur[e.poste_id] = e.to;
      var c = counts();
      pts.push({ t: e.t, a: c.a, b: c.b, n: c.n });
    });
    var last = pts[pts.length - 1];
    var end = Math.max(endT || 0, last.t);
    pts.push({ t: end, a: last.a, b: last.b, n: last.n });
    return pts;
  }

  /* ----------------------------------------------------------------
     Graphe en aires empilées (SVG natif, fonction en escalier)
     A en bas, B au-dessus, Neutre au-dessus, + 2 lignes de contour.
     ---------------------------------------------------------------- */
  function renderChart(svgEl, timeline, axisMaxT) {
    var W = 560, H = 200, PAD_T = 8, PAD_B = 16, N = 6;
    var plotH = H - PAD_T - PAD_B;
    var last = timeline.length ? timeline[timeline.length - 1].t : 0;
    var maxT = Math.max(axisMaxT || 0, last, 1);
    var rightX = (last / maxT) * W;          // bord droit réel des aires (rejeu : "pousse")

    var X = function (t) { return (t / maxT) * W; };
    var Y = function (v) { return PAD_T + (N - v) / N * plotH; };

    // Escalier de la frontière haute pour un sélecteur de valeur.
    // Le dernier point n'ajoute pas de segment "tenu" : l'aire s'arrête à son t.
    function stair(sel) {
      var out = [];
      for (var i = 0; i < timeline.length; i++) {
        var y = Y(sel(timeline[i]));
        out.push([X(timeline[i].t), y]);
        if (i < timeline.length - 1) out.push([X(timeline[i + 1].t), y]);
      }
      return out;
    }
    var fmt = function (arr) { return arr.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); };
    var rev = function (arr) { return arr.slice().reverse(); };

    var upA = stair(function (p) { return p.a; });
    var upB = stair(function (p) { return p.a + p.b; });
    var top = stair(function () { return N; });
    var base = [[rightX, Y(0)], [0, Y(0)]];

    var areaA = fmt(upA.concat(base));
    var areaB = fmt(upB.concat(rev(upA)));
    var areaN = fmt(top.concat(rev(upB)));
    var lineA = fmt(upA);
    var lineB = fmt(upB);

    // Couleurs lues sur les variables CSS → le graphe suit le thème (sombre/clair).
    var cs = getComputedStyle(document.documentElement);
    var v = function (n, f) { var x = cs.getPropertyValue(n).trim(); return x || f; };
    var cGrid = v('--chart-grid', 'rgba(128,140,160,.3)');
    var cA = v('--a', '#2f7bff'), cB = v('--b', '#ff3b30'), cN = v('--neutral', '#586478');
    var cAL = v('--a-line', '#7fb0ff'), cBL = v('--b-line', '#ff8a82');

    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'none');
    svgEl.innerHTML =
      '<line x1="0" y1="' + Y(6) + '" x2="' + W + '" y2="' + Y(6) + '" stroke="' + cGrid + '"/>' +
      '<line x1="0" y1="' + Y(3) + '" x2="' + W + '" y2="' + Y(3) + '" stroke="' + cGrid + '"/>' +
      '<line x1="0" y1="' + Y(0) + '" x2="' + W + '" y2="' + Y(0) + '" stroke="' + cGrid + '"/>' +
      '<polygon points="' + areaN + '" fill="' + cN + '" opacity=".45"/>' +
      '<polygon points="' + areaB + '" fill="' + cB + '" opacity=".7"/>' +
      '<polygon points="' + areaA + '" fill="' + cA + '" opacity=".8"/>' +
      '<polyline points="' + lineA + '" fill="none" stroke="' + cAL + '" stroke-width="2.5"/>' +
      '<polyline points="' + lineB + '" fill="none" stroke="' + cBL + '" stroke-width="2.5"/>';
  }

  /* ----------------------------------------------------------------
     Statistiques dérivées des events
     ---------------------------------------------------------------- */
  function computeStats(postes, events, endT) {
    events = events || [];
    var capA = 0, capB = 0, byP = {};
    events.forEach(function (e) {
      byP[e.poste_id] = (byP[e.poste_id] || 0) + 1;
      if (e.to === 'A') capA++; else if (e.to === 'B') capB++;
    });
    var nameOf = function (id) { var n = null; (postes || []).forEach(function (p) { if (p.id === id) n = p.name; }); return n; };

    // Classement des postes les plus disputés (du plus changé au moins changé).
    var ranking = Object.keys(byP).map(function (k) { return { id: +k, name: nameOf(+k), changes: byP[k] }; })
      .sort(function (a, b) { return b.changes - a.changes || a.id - b.id; })
      .slice(0, 3);
    var most = ranking[0] || { id: null, name: null, changes: 0 };

    // Temps en tête : on parcourt les segments de la timeline.
    var tl = buildTimeline(events, postes, endT);
    var leadA = 0, leadB = 0;
    for (var i = 0; i < tl.length - 1; i++) {
      var dt = tl[i + 1].t - tl[i].t;
      if (dt <= 0) continue;
      if (tl[i].a > tl[i].b) leadA += dt;
      else if (tl[i].b > tl[i].a) leadB += dt;
    }
    var leadTotal = leadA + leadB;
    var pctA = leadTotal > 0 ? Math.round(leadA / leadTotal * 100) : 0;
    var pctB = leadTotal > 0 ? 100 - pctA : 0;

    return {
      counts: countTeams(postes),
      total: events.length,
      captures: { A: capA, B: capB },
      mostChanged: { id: most.id, name: most.name, changes: most.changes },
      ranking: ranking,
      lead: { A: pctA, B: pctB }
    };
  }

  /* ----------------------------------------------------------------
     Toast minimal
     ---------------------------------------------------------------- */
  var toastEl = null, toastTimer = null;
  function toast(msg, isError) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = 'toast is-on' + (isError ? ' toast--error' : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 2600);
  }

  /* ----------------------------------------------------------------
     Bascule de thème (sombre ↔ plein soleil), mémorisée par appareil.
     Le thème est déjà appliqué très tôt par un script inline dans <head>
     (anti-flash) ; ici on ne fait qu'ajouter le bouton flottant.
     ---------------------------------------------------------------- */
  function setupTheme() {
    var KEY = 'cdp-theme';
    var root = document.documentElement;
    var btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    var isLight = function () { return root.getAttribute('data-theme') === 'light'; };
    var label = function () { btn.textContent = isLight() ? '🌙 Mode sombre' : '☀ Plein soleil'; };
    btn.addEventListener('click', function () {
      if (isLight()) { root.removeAttribute('data-theme'); try { localStorage.removeItem(KEY); } catch (e) {} }
      else { root.setAttribute('data-theme', 'light'); try { localStorage.setItem(KEY, 'light'); } catch (e) {} }
      label();
      // Les graphes lisent les couleurs CSS au rendu : on signale le changement.
      window.dispatchEvent(new Event('cdp:theme'));
    });
    label();
    var add = function () { document.body.appendChild(btn); };
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  }
  setupTheme();

  /* ----------------------------------------------------------------
     Export
     ---------------------------------------------------------------- */
  window.CDP = {
    config: CFG,
    teamNames: TEAM_NAMES,
    icon: icon,
    teamIcon: teamIcon,
    teamName: teamName,
    countTeams: countTeams,
    fmtTime: fmtTime,
    fmtClock: fmtClock,
    post: post,
    getJSON: getJSON,
    createPoller: createPoller,
    buildTimeline: buildTimeline,
    renderChart: renderChart,
    computeStats: computeStats,
    toast: toast
  };
})();
