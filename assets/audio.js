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

   La piste commune est déterminée par l'état partagé (poste sonore / victoire).

   SYNCHRO ENTRE CLIENTS : l'horloge du cyclist Strudel pose son « cycle 0 » au
   moment du PREMIER evaluate() (et hush() l'arrête → le prochain evaluate la
   redémarre à neuf). Donc chaque client démarrait à une phase différente. Ici on
   CALE tout démarrage « sortie de silence » sur une grille temporelle PARTAGÉE :
   on diffère ce 1er evaluate() jusqu'au prochain multiple de la période de grille
   (GRID_CYCLES / GRID_CPS secondes) exprimée en TEMPS SERVEUR (server_time corrige
   le décalage d'horloge local). Le cps du scheduler étant constant (les patterns
   règlent leur tempo via .cpm(), un simple _fast() relatif — pas via .cps()), tous
   les clients partagent alors les mêmes frontières de cycle : leurs « débuts de
   son » coïncident, et les changements d'état (swap sur la mesure, sans restart)
   restent calés. La synchro reste perceptive (≈ latences réseau/audio, quelques
   dizaines de ms), pas à l'échantillon près — impossible en Web Audio multi-appareils.

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

    // Grille de synchronisation entre clients (voir l'en-tête de ce fichier).
    //  - GRID_CPS : cps du scheduler Strudel. Les patterns règlent leur tempo via
    //    .cpm() (un _fast() relatif), JAMAIS via .cps()/setcps ; le cps reste donc
    //    le défaut du cyclist (0.5). Ne le changer que si l'on change ce défaut.
    //  - GRID_CYCLES : granularité d'alignement, en cycles. 1 cycle = 1/GRID_CPS s
    //    (2 s par défaut) : départ calé au cycle près (attente ≤ période), donc
    //    « temps forts » communs à tous les clients. Augmenter pour aligner aussi
    //    la phase de boucles plus longues, au prix d'un démarrage plus tardif.
    var GRID_CPS = +AUDIO.grid_cps || 0.5;
    var GRID_CYCLES = +AUDIO.grid_cycles || 1;

    // Avance (s) ajoutée à sound_changed_at avant de caler le changement sur la
    // grille : il faut que TOUS les clients aient eu le temps de poller le nouvel
    // état avant l'instant cible. (Le client qui agit le reçoit instantané, mais
    // attend le même instant.) Réglable via audio.sync_lead_ms ; null/absent =
    // auto (poll le plus lent + marge) ; 0 = quasi immédiat (pas de simultanéité visée).
    var SYNC_LEAD_S = (typeof AUDIO.sync_lead_ms === 'number')
      ? Math.max(0, AUDIO.sync_lead_ms) / 1000
      : (Math.max(+CFG.poll_dashboard_ms || 2000, +CFG.poll_poste_ms || 3000) + 1200) / 1000;
    // Sur une horloge déjà en marche, on (ré)évalue un peu AVANT la frontière cible
    // pour que Strudel fasse son swap « sur la mesure » exactement sur ce top. La
    // marge absorbe aussi l'erreur d'offset d'horloge entre clients (doit rester
    // < une période de cycle, soit 1/GRID_CPS s, pour ne pas glisser d'un cycle).
    var SWAP_PRE_S = 0.5;

    var initialized = false;  // initStrudel() + samples() effectués ?
    var audioReady = false;   // initAudio() résolu : AudioWorklets chargés ?
    var unlocked = false;     // l'utilisateur a-t-il activé le son ?
    var muted = false;        // coupure manuelle après activation
    var desiredKey = null;    // état cible : 'domination_a' | … | 'neutral'
    var playedKey = null;     // dernier état réellement enclenché (≠ desiredKey = changement)
    var currentCode = null;   // dernier code Strudel réellement évalué
    var playing = false;      // l'horloge du cyclist tourne-t-elle (son audible) ? hush() l'arrête.
    var readyTimer = null;    // poll d'attente de disponibilité du scope Strudel
    var transitionTimer = null; // sting de transition en cours → reprise différée de l'ambiance
    var changeTimer = null;     // attente de l'instant cible avant d'appliquer le changement
    var pendingCode = null;     // code à évaluer à l'instant cible ('' = silence)
    var pendingHoldKey = null;  // si défini : pendingCode est un sting one-shot pour cette clé
    var clockOffset = 0;        // server_time - Date.now()/1000 (s, fractionnaire) : horloge serveur partagée
    var soundChangedAt = null;  // epoch serveur du dernier changement de piste sonore (ancre de synchro)

    // Durée pendant laquelle le sting de transition occupe la sortie avant que
    // l'ambiance reprenne. ~1 cycle à cps 0.5 (défaut Strudel) ; le sting est
    // censé tenir dans cette fenêtre (sinon il serait coupé / rejoué).
    var TRANSITION_HOLD_MS = 2000;

    function lib() { return window.strudel || null; }

    // Strudel est prêt à évaluer quand DEUX conditions async sont réunies :
    //  1. le scope d'évaluation est peuplé (initStrudel injecte `stack`, `s`, … ;
    //     tant que non, evaluate("stack(...)") échoue avec "stack is not defined") ;
    //  2. les AudioWorklets de superdough sont chargés (initAudio résolu) — sinon
    //     chaque déclenchement de son lève « [getTrigger] AudioWorkletNode cannot be
    //     created … » jusqu'à la fin du chargement, polluant le 1er cycle.
    function scopeReady() {
      return initialized && audioReady && typeof window.stack === 'function';
    }

    // Code Strudel associé à un état (chaîne vide / inconnu → silence).
    function patternFor(key) {
      var code = key && patterns ? patterns[key] : '';
      return (typeof code === 'string') ? code.trim() : '';
    }

    // Sting de transition : code joué UNE fois quand le poste sonore PASSE à A / B.
    function transitionFor(key) {
      if (key === 'domination_a') return (patterns.transition_a || '').trim();
      if (key === 'domination_b') return (patterns.transition_b || '').trim();
      return '';
    }
    function clearTransition() {
      if (transitionTimer) { clearTimeout(transitionTimer); transitionTimer = null; }
    }
    function clearChange() {
      if (changeTimer) { clearTimeout(changeTimer); changeTimer = null; }
      pendingCode = null; pendingHoldKey = null;
    }

    // Instant cible (temps serveur) du changement de bande-son : prochain top de
    // grille (multiple de la période GRID_CYCLES/GRID_CPS) APRÈS sound_changed_at
    // + l'avance de synchro. Tous les clients calculent le même instant → le
    // changement est audible au même moment partout. Si le changement est déjà
    // ancien (client qui rejoint, ou aucune ancre), on vise simplement le prochain
    // top à partir de maintenant (départ calé en phase, sans simultanéité à viser).
    function targetServerTime() {
      var period = GRID_CYCLES / GRID_CPS;
      var nowServer = Date.now() / 1000 + clockOffset;
      var anchor = (soundChangedAt != null) ? (soundChangedAt + SYNC_LEAD_S) : nowServer;
      if (anchor < nowServer) anchor = nowServer;
      return Math.ceil(anchor / period) * period;
    }

    // Programme le changement (sting, swap d'ambiance, démarrage, ou silence) pour
    // qu'il devienne audible à l'instant cible PARTAGÉ. holdKey ≠ null → code est un
    // sting one-shot : on enchaîne sur l'ambiance après TRANSITION_HOLD_MS.
    function scheduleChange(code, holdKey) {
      pendingCode = code;
      pendingHoldKey = holdKey || null;
      // Re-cible sur le DERNIER changement : si une capture suit une autre dans la
      // fenêtre d'avance, tous les clients doivent viser le même (dernier) instant.
      if (changeTimer) clearTimeout(changeTimer);
      var nowServer = Date.now() / 1000 + clockOffset;
      var target = targetServerTime();
      // Horloge en marche + pattern non vide : évaluer juste avant le top pour que
      // le swap « sur la mesure » de Strudel tombe pile sur la frontière cible.
      // Sinon (démarrage à froid, ou passage au silence) : agir pile sur le top.
      var swap = playing && code;
      var fireServer = swap ? (target - SWAP_PRE_S) : target;
      changeTimer = setTimeout(function () {
        changeTimer = null;
        var S = lib();
        var code = pendingCode, holdKey = pendingHoldKey;
        pendingCode = null; pendingHoldKey = null;
        if (!unlocked || !S) return;
        // Pas encore prêt (worklets/scope) : on repasse par render() qui repollera.
        // (currentCode remis à null sinon le dedup de render() court-circuiterait
        //  la reprogrammation du changement.)
        if (!scopeReady()) { currentCode = null; render(); return; }
        currentCode = code;
        if (!code) {
          // Passage au silence, calé sur l'instant partagé. hush() arrête l'horloge
          // → la prochaine reprise sera de nouveau calée en phase.
          try { S.hush(); } catch (e) {}
          playing = false;
          return;
        }
        try {
          S.evaluate(code);   // 1er evaluate → pose le cycle 0 ; sinon swap sur la mesure
          playing = true;
          if (holdKey) {      // sting one-shot → reprise différée de l'ambiance cible
            clearTransition();
            transitionTimer = setTimeout(function () {
              transitionTimer = null;
              if (playedKey === holdKey) render();
            }, TRANSITION_HOLD_MS);
          }
        } catch (e) { currentCode = null; }
      }, Math.max(0, (fireServer - nowServer) * 1000));
    }

    // Applique l'état sonore courant : ne (ré)évalue que si le code change, et cale
    // tout changement sur l'instant partagé (voir scheduleChange / targetServerTime).
    function render() {
      if (!unlocked || !initialized) return;
      var S = lib();
      if (!S) return;
      // Scope pas encore prêt (juste après l'activation) : on repolle.
      if (!scopeReady()) { scheduleReadyCheck(); return; }

      // Changement d'état : éventuel sting de transition (joué une fois) AVANT
      // que l'ambiance cible ne (re)démarre. On ne le joue que sur un vrai
      // changement en cours de jeu (prev non nul) vers A/B, et hors mute.
      var changed = (desiredKey !== playedKey);
      if (changed) {
        var prev = playedKey;
        playedKey = desiredKey;
        clearTransition();
        var sting = muted ? '' : transitionFor(desiredKey);
        if (sting && prev !== null && prev !== desiredKey) {
          currentCode = sting;   // évite que le bloc « ambiance » ne réévalue dans la foulée
          scheduleChange(sting, desiredKey);
          return;
        }
      }

      // Un sting est AUDIBLE (hold en cours) : ne pas l'écraser ; il relancera l'ambiance.
      if (transitionTimer) return;

      // Ambiance (boucle) / silence, calée sur l'instant partagé.
      var code = muted ? '' : patternFor(desiredKey);
      // Déjà à jour : ce qui joue (rien en attente), ou exactement ce qui est programmé.
      if (!changeTimer && code === currentCode) return;
      if (changeTimer && code === pendingCode) return;
      currentCode = code;
      scheduleChange(code, null);
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

    // Banques de samples officielles de Strudel (drum machines, piano, etc.).
    // Le prebake de @strudel/web n'en charge AUCUNE : sans ça, .bank("RolandTR909")
    // & co échouent ("sound … not found"). On reproduit ici la liste chargée par
    // le REPL strudel.cc, hébergée sur felixroos/dough-samples (CDN GitHub).
    // Chaque .json n'enregistre que des noms ; les .wav sont récupérés
    // paresseusement au 1er déclenchement → coût initial négligeable.
    var STRUDEL_SAMPLE_BANKS = [
      'tidal-drum-machines.json', // RolandTR909/808/707, LinnDrum, AkaiLinn, etc.
      'piano.json',               // piano acoustique multi-échantillonné
      'Dirt-Samples.json',        // banque classique TidalCycles (bd, sd, hh, casio, …)
      'EmuSP12.json',             // sons E-mu SP-12
      'vcsl.json',                // Versilian Community Sample Library (instruments)
      'mridangam.json'            // percussions indiennes
    ];
    var STRUDEL_SAMPLE_BASE = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/';

    // Démarre Strudel + charge les samples (banques officielles + dossier /audio).
    // Idempotent.
    function ensureInit() {
      if (initialized) return true;
      var S = lib();
      if (!S || typeof S.initStrudel !== 'function') return false; // librairie absente
      try {
        S.initStrudel();
        if (typeof S.samples === 'function') {
          // Banques officielles : samples(url) charge un manifeste .json distant.
          // Asynchrone et non bloquant ; on ignore les échecs réseau individuels.
          for (var i = 0; i < STRUDEL_SAMPLE_BANKS.length; i++) {
            try { S.samples(STRUDEL_SAMPLE_BASE + STRUDEL_SAMPLE_BANKS[i]); }
            catch (e) { /* banque indisponible : on continue */ }
          }
          if (sampleMap && Object.keys(sampleMap).length) {
            // samples(map, base_url) : enregistre les noms ; le buffer est récupéré
            // (et décodé) paresseusement au 1er déclenchement de chaque sample.
            S.samples(sampleMap, baseUrl);
          }
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
        // Décalage d'horloge serveur (pour la grille de synchro). server_time est
        // sous-seconde (microtime) ; server_now (entier) sert de repli.
        var srv = (state && typeof state.server_time === 'number') ? state.server_time
                : (state && typeof state.server_now === 'number') ? state.server_now : null;
        if (srv !== null) clockOffset = srv - Date.now() / 1000;
        // Ancre de synchro : epoch serveur du dernier changement de piste. Tous les
        // clients la partagent → ils calent l'instant du changement au même moment.
        if (state && Object.prototype.hasOwnProperty.call(state, 'sound_changed_at')) {
          soundChangedAt = (typeof state.sound_changed_at === 'number') ? state.sound_changed_at : null;
        }
        desiredKey = computeDesired(state);
        if (unlocked) render();
      },
      // Débloque la lecture (geste utilisateur requis par les navigateurs).
      unlock: function () {
        if (unlocked) return;
        unlocked = true;   // l'UI passe en mode "activé" même si la librairie manque
        muted = false;
        ensureInit();
        var S = lib();
        // PENDANT le geste utilisateur : initAudio() réactive l'AudioContext ET
        // charge les AudioWorklets (resume + addModule). Sa promesse ne se résout
        // qu'une fois les worklets prêts → on attend pour évaluer (audioReady),
        // sinon le 1er cycle déclenche des erreurs « AudioWorkletNode … ».
        if (S && typeof S.initAudio === 'function') {
          var done = function () { audioReady = true; render(); };
          try {
            var p = S.initAudio();
            if (p && typeof p.then === 'function') { p.then(done, done); }
            else { done(); }
          } catch (e) { done(); }
        } else {
          // Fallback (librairie sans initAudio) : comportement historique.
          audioReady = true;
          if (S && typeof S.getAudioContext === 'function') {
            try { var ctx = S.getAudioContext(); if (ctx && ctx.resume) ctx.resume(); } catch (e) {}
          }
        }
        render();
      },
      // Coupe / rétablit le son sans perdre l'état désiré.
      toggleMute: function () {
        muted = !muted;
        clearTransition();   // coupe un éventuel sting en cours
        clearChange();       // annule un changement programmé (sinon il jouerait malgré le mute)
        if (muted) {
          // Coupure LOCALE et immédiate : c'est une préférence du client, pas un
          // changement d'état partagé → on n'attend pas l'instant de synchro.
          var S = lib();
          if (S) { try { S.hush(); } catch (e) {} }
          playing = false;
          currentCode = '';
        } else if (unlocked) {
          render();   // reprise : recalée en phase sur la grille (voir scheduleChange)
        }
        return muted;
      },
      isUnlocked: function () { return unlocked; },
      isMuted: function () { return muted; }
    };
  };
})();
