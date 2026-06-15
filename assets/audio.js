/* =====================================================================
   audio.js — gestionnaire audio partagé (dashboard + pages de poste).
   - 4 éléments <audio loop> créés UNE SEULE FOIS, jamais recréés/rechargés
     par le polling (le son ne se coupe pas lors des mises à jour) ;
   - bascule de piste uniquement si la piste cible change, avec un court
     fondu enchaîné (~0,5 s) ;
   - démarrage seulement après un geste utilisateur (unlock), avec un
     interrupteur couper/rétablir.

   La piste commune est déterminée par l'état partagé (poste sonore / victoire),
   mais chaque appareil lit sa propre copie : non synchronisé au sample près.

   Expose CDP.createAudioManager().
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CDP;

  C.createAudioManager = function () {
    var CFG = C.config || {};
    var SOUND_ID = CFG.sound_poste_id || 3;
    var keys = ['domination_a', 'domination_b', 'victory_a', 'victory_b'];

    var els = {};
    var holder = document.createElement('div');
    holder.style.display = 'none';
    keys.forEach(function (k) {
      var a = document.createElement('audio');
      a.loop = true;
      a.preload = 'auto';
      a.src = (CFG.audio && CFG.audio[k]) ? CFG.audio[k] : '';
      a.volume = 1;
      els[k] = a;
      holder.appendChild(a);
    });
    (document.body || document.documentElement).appendChild(holder);

    var unlocked = false;     // le son a-t-il été débloqué par l'utilisateur ?
    var muted = false;        // coupure manuelle après activation
    var currentKey = null;    // piste réellement en lecture
    var desiredKey = null;    // piste voulue par l'état courant
    var fadeTimer = null;

    function target() { return muted ? null : desiredKey; }
    function clearFade() { if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; } }

    // Fondu enchaîné via volume sur ~500 ms (jamais de coupure brutale).
    function switchTo(key) {
      if (key === currentKey) return;
      clearFade();
      var oldA = currentKey ? els[currentKey] : null;
      var newA = key ? els[key] : null;
      currentKey = key;
      if (newA) {
        newA.volume = 0;
        var pr = newA.play();
        if (pr && pr.catch) pr.catch(function () { /* fichier manquant / autoplay : ignoré */ });
      }
      var steps = 12, i = 0, dur = 500;
      fadeTimer = setInterval(function () {
        i++;
        var f = i / steps;
        if (newA) newA.volume = Math.min(1, f);
        if (oldA) oldA.volume = Math.max(0, 1 - f);
        if (i >= steps) {
          clearFade();
          if (oldA) { oldA.pause(); oldA.volume = 1; }
          if (newA) newA.volume = 1;
        }
      }, dur / steps);
    }

    // Piste cible selon l'état : game_over → victoire ; sinon équipe du poste sonore.
    function computeDesired(state) {
      if (state.game_over && state.winner) {
        return state.winner === 'A' ? 'victory_a' : 'victory_b';
      }
      var poste = (state.postes || []).filter(function (p) { return p.id === SOUND_ID; })[0];
      var t = poste ? poste.team : 'neutral';
      if (t === 'A') return 'domination_a';
      if (t === 'B') return 'domination_b';
      return null; // neutre → silence
    }

    return {
      // À appeler à chaque mise à jour d'état : ne bascule que si la piste change.
      apply: function (state) {
        desiredKey = computeDesired(state);
        if (unlocked) switchTo(target());
      },
      // Débloque la lecture (geste utilisateur requis par les navigateurs).
      unlock: function () {
        if (unlocked) return;
        unlocked = true;
        muted = false;
        keys.forEach(function (k) {
          var a = els[k];
          a.volume = 0;
          var pr = a.play();
          if (pr && pr.then) pr.then(function () { a.pause(); a.currentTime = 0; a.volume = 1; }).catch(function () { a.volume = 1; });
          else { try { a.pause(); } catch (e) {} a.volume = 1; }
        });
        currentKey = null;
        switchTo(target());
      },
      // Coupe / rétablit le son sans perdre la piste désirée.
      toggleMute: function () {
        muted = !muted;
        if (unlocked) switchTo(target());
        return muted;
      },
      isUnlocked: function () { return unlocked; },
      isMuted: function () { return muted; }
    };
  };
})();
