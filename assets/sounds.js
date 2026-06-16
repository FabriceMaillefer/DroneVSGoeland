/* =====================================================================
   sounds.js — soundboard de la page demo.php (mobile).
   Joue les patterns Strudel de la config À LA DEMANDE, en LOCAL :
     - aucune écriture d'état (pas de set_team / start / reset) → n'affecte
       pas le son des autres appareils ni la partie ;
     - patterns "loop" (domination/victoire/neutre) : re-tap = stop ;
     - patterns "once" (transitions) : joués UNE fois puis coupés.
   Indépendant de C.createAudioManager (qui, lui, suit l'état du jeu).
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CDP || {};
  var CFG = C.config || {};
  var AUDIO = CFG.audio || {};
  var patterns = AUDIO.patterns || {};
  var baseUrl = AUDIO.base_url || 'audio/';
  var sampleMap = AUDIO.samples || {};

  var $ = function (id) { return document.getElementById(id); };
  var btnStop = $('btn-stop');
  var statusEl = $('sb-status');
  var board = $('soundboard');

  // Durée d'un sting de transition avant coupure (les défauts sont en .cpm(30) ≈
  // 1 cycle = 2 s ; on laisse un peu de traîne). Aligné sur audio.js / config.js.
  var ONESHOT_MS = 2200;

  // Mêmes banques que le moteur du jeu (drum machines + instruments).
  var STRUDEL_BANKS = ['tidal-drum-machines.json', 'piano.json', 'Dirt-Samples.json',
    'EmuSP12.json', 'vcsl.json', 'mridangam.json'];
  var BANK_BASE = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/';

  var initialized = false;   // initStrudel + samples chargés ?
  var audioReady = false;    // initAudio résolu (AudioWorklets) ?
  var unlocked = false;      // geste utilisateur effectué ?
  var activeBtn = null;      // bouton en cours de lecture
  var oneshotTimer = null;   // coupure différée d'un sting "once"

  function lib() { return window.strudel || null; }
  function setStatus(m) { if (statusEl) statusEl.textContent = m || ''; }
  function scopeReady() { return initialized && audioReady && typeof window.stack === 'function'; }

  // initStrudel + chargement des banques officielles et des samples du jeu.
  function ensureInit() {
    if (initialized) return true;
    var S = lib();
    if (!S || typeof S.initStrudel !== 'function') return false;
    try {
      S.initStrudel();
      if (typeof S.samples === 'function') {
        for (var i = 0; i < STRUDEL_BANKS.length; i++) {
          try { S.samples(BANK_BASE + STRUDEL_BANKS[i]); } catch (e) { /* banque indispo */ }
        }
        if (sampleMap && Object.keys(sampleMap).length) {
          try { S.samples(sampleMap, baseUrl); } catch (e) { /* ignoré */ }
        }
      }
      initialized = true;
      return true;
    } catch (e) { return false; }
  }

  // Débloque l'audio PENDANT le geste : resume du contexte + chargement des worklets.
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensureInit();
    var S = lib();
    if (S && typeof S.initAudio === 'function') {
      var done = function () { audioReady = true; };
      try {
        var p = S.initAudio();
        if (p && typeof p.then === 'function') { p.then(done, done); } else { done(); }
      } catch (e) { done(); }
    } else {
      audioReady = true;
      if (S && typeof S.getAudioContext === 'function') {
        try { var ctx = S.getAudioContext(); if (ctx && ctx.resume) ctx.resume(); } catch (e) {}
      }
    }
  }

  function clearOneshot() { if (oneshotTimer) { clearTimeout(oneshotTimer); oneshotTimer = null; } }

  function setActive(btn) {
    if (activeBtn && activeBtn !== btn) activeBtn.classList.remove('is-playing');
    activeBtn = btn || null;
    if (btn) btn.classList.add('is-playing');
  }

  function stopAll() {
    clearOneshot();
    var S = lib();
    if (S && typeof S.hush === 'function') { try { S.hush(); } catch (e) {} }
    setActive(null);
    setStatus('arrêté');
  }

  // Joue le pattern d'un bouton ; attend que le scope/audio soit prêt.
  function play(btn) {
    if (!unlocked) unlock();            // le tap fait office de geste utilisateur
    var key = btn.getAttribute('data-key');
    var once = btn.getAttribute('data-mode') === 'once';
    var code = (patterns[key] || '').trim();
    if (code === '') { stopAll(); setStatus('(silence : pattern vide)'); return; }
    setStatus('chargement…');
    var tries = 0;
    (function attempt() {
      if (!scopeReady()) {
        if (tries++ > 80) { setStatus('initialisation trop longue'); return; }
        setTimeout(attempt, 100);
        return;
      }
      clearOneshot();
      var S = lib();
      try {
        S.evaluate(code);
        setActive(btn);
        if (once) {
          setStatus('lecture (une fois)');
          var target = btn;
          oneshotTimer = setTimeout(function () {
            oneshotTimer = null;
            if (activeBtn === target) {
              if (typeof S.hush === 'function') { try { S.hush(); } catch (e) {} }
              setActive(null);
              setStatus('terminé');
            }
          }, ONESHOT_MS);
        } else {
          setStatus('lecture en boucle — re-touche pour arrêter');
        }
      } catch (e) {
        setStatus('erreur dans le pattern : ' + (e && e.message ? e.message : e));
      }
    })();
  }

  // Pas de bouton « Activer le son » : le 1er tap sur un son fait office de geste
  // utilisateur (play() appelle unlock()), donc l'audio se débloque tout seul.
  if (btnStop) btnStop.addEventListener('click', stopAll);
  if (board) {
    board.addEventListener('click', function (e) {
      var btn = e.target.closest('.sb-btn');
      if (!btn) return;
      // Re-toucher un son "loop" en cours = stop.
      if (btn === activeBtn && btn.getAttribute('data-mode') !== 'once') { stopAll(); return; }
      play(btn);
    });
  }
})();
