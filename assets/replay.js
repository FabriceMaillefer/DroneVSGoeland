/* =====================================================================
   replay.js — rejeu d'une partie (courante terminée OU archivée).
   Anime les events dans l'ordre chronologique avec facteur d'accélération
   et curseur, en réutilisant le rendu du dashboard (tuiles + graphe).
   100 % côté client : ne modifie jamais l'état réel.
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CDP, R = C.render;
  var DATA = window.CDP_REPLAY || null;
  var SOUND_ID = (C.config && C.config.sound_poste_id) || 3;

  var $ = function (id) { return document.getElementById(id); };
  var root = $('replay');
  var elTiles = $('rp-tiles');
  var elTerrain = $('rp-terrain');
  var elChart = $('rp-chart');
  var btnPlay = $('rp-play');
  var range = $('rp-range');
  var elTime = $('rp-time');
  var speeds = $('rp-speeds');
  var elEmpty = $('rp-empty');

  if (!DATA || !DATA.postes || !DATA.events || !DATA.events.length) {
    if (elEmpty) elEmpty.classList.remove('hidden');
    if (root) root.classList.add('hidden');
    return;
  }

  var postes = DATA.postes;
  var events = DATA.events.slice().sort(function (a, b) { return a.t - b.t; });
  var lastEventT = events.length ? events[events.length - 1].t : 0;
  var duration = Math.max(1, (DATA.ended_at && DATA.started_at)
    ? (DATA.ended_at - DATA.started_at) : lastEventT);

  // Attribution initiale (t=0).
  var initial = {};
  postes.forEach(function (p) { initial[p.id] = p.team; });
  var seen = {};
  events.forEach(function (e) { if (!seen[e.poste_id]) { initial[e.poste_id] = e.from; seen[e.poste_id] = true; } });

  // Timeline complète (axe fixe = durée).
  var allTl = C.buildTimeline(events, postes, duration);

  function posteStatesAt(t) {
    var cur = {};
    Object.keys(initial).forEach(function (k) { cur[k] = initial[k]; });
    events.forEach(function (e) { if (e.t <= t) cur[e.poste_id] = e.to; });
    return postes.map(function (p) { return { id: p.id, name: p.name, team: cur[p.id] }; });
  }

  function truncTl(t) {
    var pts = allTl.filter(function (p) { return p.t <= t; });
    if (!pts.length) pts = [allTl[0]];
    var li = pts[pts.length - 1];
    return pts.concat([{ t: t, a: li.a, b: li.b, n: li.n }]);
  }

  function renderAt(t) {
    t = Math.max(0, Math.min(duration, t));
    var ps = posteStatesAt(t);
    var counts = C.countTeams(ps);
    R.renderTiles(elTiles, ps, SOUND_ID, false);
    R.renderScore(root, counts);
    R.renderTerrain(elTerrain, counts);
    C.renderChart(elChart, truncTl(t), duration);
    R.renderStats(root, C.computeStats(ps, events.filter(function (e) { return e.t <= t; }), t));
    elTime.textContent = C.fmtTime(t) + ' / ' + C.fmtTime(duration);
    range.value = Math.round(t);
  }

  /* ---- lecture ---- */
  var playing = false, speed = 30, simT = 0, rafId = null, lastTs = null;

  function frame(ts) {
    if (!playing) return;
    if (lastTs === null) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    simT += dt * speed;
    if (simT >= duration) { simT = duration; renderAt(simT); pause(); return; }
    renderAt(simT);
    rafId = requestAnimationFrame(frame);
  }
  function play() {
    if (playing) return;
    if (simT >= duration) simT = 0;
    playing = true; lastTs = null;
    btnPlay.textContent = '❚❚ Pause';
    rafId = requestAnimationFrame(frame);
  }
  function pause() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    btnPlay.textContent = '▶ Lecture';
  }

  btnPlay.addEventListener('click', function () { playing ? pause() : play(); });
  range.min = 0; range.max = duration; range.step = 1;
  range.addEventListener('input', function () { pause(); simT = +range.value; renderAt(simT); });
  speeds.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-speed]');
    if (!b) return;
    speed = +b.getAttribute('data-speed');
    Array.prototype.forEach.call(speeds.querySelectorAll('button'), function (x) { x.classList.toggle('is-active', x === b); });
  });

  // Re-dessine avec les couleurs du nouveau thème.
  window.addEventListener('cdp:theme', function () { renderAt(simT); });

  // Marque la vitesse active par défaut + amorce.
  var def = speeds.querySelector('button[data-speed="' + speed + '"]');
  if (def) def.classList.add('is-active');
  renderAt(0);
  play(); // démarre le rejeu automatiquement
})();
