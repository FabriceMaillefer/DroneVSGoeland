/* =====================================================================
   dashboard.js — contrôleur du tableau de bord (vue maître / projection).
   - polling ETag/304 toutes les ~5 s ;
   - rendu des tuiles, score, barre "part du terrain", graphe, stats ;
   - bandeau de domination + décompte local (corrigé du décalage d'horloge) ;
   - poll ciblé à l'échéance de la victoire pour resserrer la détection ;
   - gestionnaire AUDIO persistant : ne coupe JAMAIS le son lors des polls.
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CDP, R = C.render;
  var CFG = C.config;
  var HOLD = (CFG.victory_hold_seconds || 10);
  var SOUND_ID = CFG.sound_poste_id || 3;

  // Raccourcis DOM
  var $ = function (id) { return document.getElementById(id); };
  var dash = $('dash');
  var elTiles = $('tiles');
  var elTerrain = $('terrain');
  var elBanner = $('banner');
  var elBannerTxt = $('banner-txt');
  var elBannerCount = $('banner-count');
  var elVictory = $('victory');
  var elClock = $('clock');
  var elChart = $('chart');
  var btnStart = $('btn-start');
  var btnSound = $('btn-sound');
  var linkDemo = $('link-demo');

  // Noms d'équipes dans l'UI statique
  $('name-a').textContent = C.teamName('A');
  $('name-b').textContent = C.teamName('B');
  var nmA = dash.querySelector('.nm-a'); if (nmA) nmA.textContent = C.teamName('A');
  var nmB = dash.querySelector('.nm-b'); if (nmB) nmB.textContent = C.teamName('B');

  var lastState = null;
  var clockOffset = 0;       // server_now - now_client (secondes)
  var victoryPollTimer = null;

  // Gestionnaire audio partagé (voir assets/audio.js). Persistant : jamais
  // recréé par le polling, bascule de piste avec fondu enchaîné.
  var audio = C.createAudioManager();

  /* ================================================================
     RENDU
     ================================================================ */

  // Tuiles cliquables : un clic sur la carte ouvre la page du poste (le réglage
  // de l'équipe se fait sur cette page). Pas de contrôle inline sur le dashboard.
  function renderDashTiles(state) {
    R.renderTiles(elTiles, state.postes, SOUND_ID, true);
  }

  function renderVictory(state, counts) {
    var win = state.winner;
    var dur = (state.ended_at && state.started_at) ? (state.ended_at - state.started_at) : 0;
    var winClass = win === 'B' ? 'win-b' : 'win-a';
    var emblemPat = win === 'A' ? 'pat-a' : 'pat-b';
    elVictory.className = 'victory ' + winClass;
    elVictory.innerHTML =
      '<div class="victory__kicker">⎯⎯ VICTOIRE ⎯⎯</div>' +
      '<div class="victory__emblem ' + emblemPat + '">' +
        C.teamIcon(win, { size: 52, color: '#fff', sw: 1.8 }) + '</div>' +
      '<h2 class="victory__title">LES ' +
        '<span style="color:var(--' + (win === 'A' ? 'a' : 'b') + ')">' + R.esc(C.teamName(win)) + '</span> L\'EMPORTENT</h2>' +
      '<p class="victory__sub">6 postes sur 6 tenus · score final ' +
        '<strong style="color:var(--text)">' + counts.A + ' — ' + counts.B + '</strong> · partie ' + C.fmtTime(dur) + '</p>' +
      '<div class="victory__actions">' +
        '<button class="btn btn--gold" id="vic-new">Nouvelle partie</button>' +
        '<a class="btn btn--ghost" href="replay.php">Voir le récap</a>' +
      '</div>';
    var vn = $('vic-new');
    if (vn) vn.addEventListener('click', backToPrep);
  }

  function render(state) {
    lastState = state;
    if (typeof state.server_now === 'number') {
      clockOffset = state.server_now - Math.floor(Date.now() / 1000);
    }
    var counts = C.countTeams(state.postes);

    // Bouton principal selon l'état :
    //  - en cours      → ■ Stop (archive + retour en préparation)
    //  - terminée      → Nouvelle partie (archive + retour en préparation)
    //  - en préparation→ ▶ Démarrer la partie (lance sur le plateau préparé)
    if (state.game_over) {
      btnStart.textContent = 'Nouvelle partie';
      btnStart.className = 'btn btn--gold btn--sm';
    } else if (state.game_started) {
      btnStart.textContent = '■ Stop';
      btnStart.className = 'btn btn--b btn--sm';
    } else {
      btnStart.textContent = '▶ Démarrer la partie';
      btnStart.className = 'btn btn--a btn--sm';
    }

    // Lien « Sons » (démo) : visible seulement en attente du début (préparation).
    if (linkDemo) {
      var waiting = !state.game_started && !state.game_over;
      linkDemo.classList.toggle('hidden', !waiting);
    }

    // Score, terrain, tuiles, stats, graphe
    R.renderScore(dash, counts);
    R.renderTerrain(elTerrain, counts);
    renderDashTiles(state);

    refreshChart(state);

    // Victoire vs bandeau de domination
    if (state.game_over) {
      elVictory.classList.remove('hidden');
      elBanner.classList.remove('is-on');
      renderVictory(state, counts);
      cancelVictoryPoll();
    } else {
      elVictory.classList.add('hidden');
      updateBanner(state);
      scheduleVictoryPoll(state);
    }

    // AUDIO : on n'agit que si la piste cible change.
    audio.apply(state);

    updateClock();
  }

  // Graphe + stats : recalculés avec le temps "maintenant" courant (axe vivant).
  // Appelé au poll ET ~1×/s par le ticker pour que la courbe avance en continu.
  function refreshChart(state) {
    var nowS = Math.floor(Date.now() / 1000) + clockOffset;
    var endT = state.started_at
      ? (state.game_over && state.ended_at ? state.ended_at - state.started_at : nowS - state.started_at)
      : 0;
    var tl = C.buildTimeline(state.events, state.postes, endT);
    C.renderChart(elChart, tl, endT);
    R.renderStats(dash, C.computeStats(state.postes, state.events, endT));
  }

  /* ================================================================
     Bandeau de domination + décompte (tick local, sans re-polling)
     ================================================================ */
  function dominationRemaining(state) {
    if (!state || !state.domination_since) return null;
    var nowServer = Math.floor(Date.now() / 1000) + clockOffset;
    return HOLD - (nowServer - state.domination_since);
  }

  function updateBanner(state) {
    if (state.game_started && state.domination_since && state.domination_team) {
      elBanner.classList.add('is-on');
      elBannerTxt.textContent = C.teamName(state.domination_team) + ' DOMINENT LES 6 POSTES';
      var rem = dominationRemaining(state);
      elBannerCount.textContent = C.fmtTime(Math.max(0, Math.ceil(rem)));
    } else {
      elBanner.classList.remove('is-on');
    }
  }

  function updateClock() {
    if (!lastState || !lastState.started_at) { elClock.textContent = '⏱ 00:00'; return; }
    var end = lastState.game_over && lastState.ended_at ? lastState.ended_at
      : Math.floor(Date.now() / 1000) + clockOffset;
    elClock.textContent = '⏱ ' + C.fmtTime(end - lastState.started_at);
  }

  // Poll ciblé : si une fenêtre de domination est ouverte, on programme un poll
  // juste après l'échéance des 10 s pour constater la victoire sans attendre 5 s.
  function scheduleVictoryPoll(state) {
    cancelVictoryPoll();
    if (!state.domination_since || state.game_over) return;
    var rem = dominationRemaining(state);
    if (rem === null) return;
    var delay = Math.max(0, rem * 1000) + 400; // petit tampon
    victoryPollTimer = setTimeout(function () { poller.pollNow(); }, delay);
  }
  function cancelVictoryPoll() { if (victoryPollTimer) { clearTimeout(victoryPollTimer); victoryPollTimer = null; } }

  // Ticker local 250 ms : horloge + décompte + graphe vivant + détection de victoire.
  var lastTickSec = -1;
  var lastForcedSec = -1;
  setInterval(function () {
    if (!lastState) return;
    updateClock();
    if (lastState.game_over || !lastState.game_started) return;

    updateBanner(lastState);

    var sec = Math.floor(Date.now() / 1000);
    // Graphe dynamique : on redessine ~1×/s pour faire avancer le bord "maintenant".
    if (sec !== lastTickSec) {
      lastTickSec = sec;
      refreshChart(lastState);
    }

    // Détection de victoire robuste : dès que le décompte atteint 0, on va chercher
    // l'état promu côté serveur (au plus 1×/s ; le garde inFlight évite les doublons).
    var rem = dominationRemaining(lastState);
    if (rem !== null && rem <= 0 && sec !== lastForcedSec) {
      lastForcedSec = sec;
      poller.pollNow();
    }
  }, 250);

  /* ================================================================
     Actions (écritures) — rafraîchissent immédiatement via la réponse
     ================================================================ */
  function applyWrite(res) {
    if (res.status === 200 && res.data && res.data.version !== undefined) {
      poller.applyExternal(res.data, res.etag);
    } else if (res.data && res.data.error) {
      C.toast(res.data.error, true);
      poller.pollNow();
    } else {
      poller.pollNow();
    }
  }

  // Lance la partie depuis la préparation (conserve le plateau positionné).
  function doStart() { C.post('start.php', {}).then(applyWrite); }
  // Arrête / nouvelle partie : archive et revient en PRÉPARATION (plateau remis à la config).
  function backToPrep() { C.post('reset.php', {}).then(applyWrite); }

  // Bouton principal selon l'état courant.
  function onMainBtn() {
    var st = lastState || {};
    if (st.game_over) { backToPrep(); }                                   // Nouvelle partie → préparation
    else if (st.game_started) {                                           // Stop
      if (confirm('Arrêter la partie en cours ? Elle sera archivée.')) backToPrep();
    } else { doStart(); }                                                 // Démarrer
  }

  btnStart.addEventListener('click', onMainBtn);
  // Re-dessine le graphe avec les couleurs du nouveau thème.
  window.addEventListener('cdp:theme', function () { if (lastState) refreshChart(lastState); });
  // Son : 1er clic = activer ; clics suivants = couper / rétablir.
  btnSound.addEventListener('click', function () {
    if (!audio.isUnlocked()) {
      audio.unlock();
      btnSound.classList.remove('sound-cta');
      btnSound.classList.add('btn--ghost');
      btnSound.textContent = '🔊 Son activé';
    } else {
      var m = audio.toggleMute();
      btnSound.textContent = m ? '🔇 Son coupé' : '🔊 Son activé';
    }
  });

  /* ================================================================
     Démarrage : on amorce avec l'état injecté par la page, puis on poll.
     ================================================================ */
  var poller = C.createPoller(render, { interval: CFG.poll_dashboard_ms || 2000 });
  if (window.CDP_STATE) {
    var initEtag = '"' + (window.CDP_STATE.version || 0) + '"';
    poller.setEtag(initEtag);
    render(window.CDP_STATE);
  }
  poller.start();
})();
