/* =====================================================================
   audio.js — gestionnaire audio partagé (dashboard + pages de poste),
   propulsé par Strudel (assets/vendor/strudel-web.js).

   - La bande-son n'est plus 4 fichiers joués en boucle, mais des PATTERNS
     Strudel évalués selon l'état du jeu. Chaque pattern utilise des samples
     (wav/mp3) chargés depuis le dossier /audio via samples(map, base_url).
   - Strudel n'est initialisé qu'après un geste utilisateur (unlock) : c'est
     exigé par les navigateurs pour démarrer l'AudioContext.
   - On ne réévalue le pattern QUE si le code cible change (pas à chaque poll) :
     la musique tourne sans interruption ; le changement se fait sur la mesure.
   - Couper le son = hush() ; rétablir = réévaluer le pattern courant.

   La piste commune est déterminée par l'état partagé (poste sonore / victoire),
   mais chaque appareil joue sa propre copie : non synchronisé au sample près.

   On accède à la librairie via le namespace global `window.strudel` (posé par
   le bundle IIFE) : initStrudel / samples / evaluate / hush.

   Expose CDP.createAudioManager() — interface inchangée (apply / unlock /
   toggleMute / isUnlocked / isMuted), donc dashboard.js et poste.js sont intacts.
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CDP;

  C.createAudioManager = function () {
    var CFG = C.config || {};
    var SOUND_ID = CFG.sound_poste_id || 3;
    var AUDIO = CFG.audio || {};
    var baseUrl = AUDIO.base_url || 'audio/';
    var sampleMap = AUDIO.samples || {};
    var patterns = AUDIO.patterns || {};

    var initialized = false;  // initStrudel() + samples() effectués ?
    var unlocked = false;     // l'utilisateur a-t-il activé le son ?
    var muted = false;        // coupure manuelle après activation
    var desiredKey = null;    // état courant : 'domination_a' | … | 'neutral'
    var currentCode = null;   // dernier code Strudel réellement évalué
    var readyTimer = null;    // poll d'attente de disponibilité du scope Strudel

    function lib() { return window.strudel || null; }

    // initStrudel() peuple le scope d'évaluation de façon ASYNCHRONE (prebake :
    // worklet audio + enregistrement des sons). Tant que ce n'est pas terminé,
    // evaluate("stack(...)") échoue ("stack is not defined"). On détecte la
    // disponibilité via la fonction globale `stack`, injectée à ce moment-là.
    function scopeReady() {
      return initialized && typeof window.stack === 'function';
    }

    // Code Strudel associé à un état (chaîne vide / inconnu → silence).
    function patternFor(key) {
      var code = key && patterns ? patterns[key] : '';
      return (typeof code === 'string') ? code.trim() : '';
    }

    // Applique l'état sonore courant : ne (ré)évalue que si le code change.
    function render() {
      if (!unlocked || !initialized) return;
      var S = lib();
      if (!S) return;
      // Scope pas encore prêt (juste après l'activation) : on repolle.
      if (!scopeReady()) { scheduleReadyCheck(); return; }
      var code = muted ? '' : patternFor(desiredKey);
      if (code === currentCode) return;
      currentCode = code;
      try {
        if (code === '') S.hush();
        else S.evaluate(code);
      } catch (e) {
        // Échec transitoire/pattern invalide : on autorise une nouvelle tentative
        // au prochain changement d'état (apply) plutôt que de rester bloqué.
        currentCode = null;
      }
    }

    // Attend (≤ ~6 s) que le scope Strudel soit prêt, puis applique l'état.
    function scheduleReadyCheck() {
      if (readyTimer) return;
      var tries = 0;
      readyTimer = setInterval(function () {
        tries++;
        if (scopeReady()) {
          clearInterval(readyTimer); readyTimer = null;
          render();
        } else if (tries > 60) {        // garde-fou : librairie qui ne s'initialise pas
          clearInterval(readyTimer); readyTimer = null;
        }
      }, 100);
    }

    // Démarre Strudel + charge les samples du dossier audio. Idempotent.
    function ensureInit() {
      if (initialized) return true;
      var S = lib();
      if (!S || typeof S.initStrudel !== 'function') return false; // librairie absente
      try {
        S.initStrudel();
        if (sampleMap && Object.keys(sampleMap).length && typeof S.samples === 'function') {
          // samples(map, base_url) : enregistre les noms ; le buffer est récupéré
          // (et décodé) paresseusement au 1er déclenchement de chaque sample.
          S.samples(sampleMap, baseUrl);
        }
        initialized = true;
        return true;
      } catch (e) {
        return false;
      }
    }

    // État cible : game_over → victoire ; sinon équipe du poste sonore ; sinon neutre.
    function computeDesired(state) {
      if (state.game_over && state.winner) {
        return state.winner === 'A' ? 'victory_a' : 'victory_b';
      }
      var poste = (state.postes || []).filter(function (p) { return p.id === SOUND_ID; })[0];
      var t = poste ? poste.team : 'neutral';
      if (t === 'A') return 'domination_a';
      if (t === 'B') return 'domination_b';
      return 'neutral';
    }

    return {
      // À appeler à chaque mise à jour d'état : ne réévalue que si le pattern change.
      apply: function (state) {
        desiredKey = computeDesired(state);
        if (unlocked) render();
      },
      // Débloque la lecture (geste utilisateur requis par les navigateurs).
      unlock: function () {
        if (unlocked) return;
        unlocked = true;   // l'UI passe en mode "activé" même si la librairie manque
        muted = false;
        ensureInit();
        // Réactive l'AudioContext PENDANT le geste utilisateur (exigence des
        // navigateurs) : l'évaluation réelle peut survenir un peu plus tard
        // (scope async), mais le contexte est déjà débloqué par ce clic.
        var S = lib();
        if (S && typeof S.getAudioContext === 'function') {
          try { var ctx = S.getAudioContext(); if (ctx && ctx.resume) ctx.resume(); } catch (e) {}
        }
        render();
      },
      // Coupe / rétablit le son sans perdre l'état désiré.
      toggleMute: function () {
        muted = !muted;
        if (unlocked) render();
        return muted;
      },
      isUnlocked: function () { return unlocked; },
      isMuted: function () { return muted; }
    };
  };
})();
