/* =====================================================================
   config.js — page de configuration (noms des postes, attribution
   initiale, poste sonore, durée de victoire, fichiers audio).
   Charge la config via l'API, la ré-affiche, et l'enregistre en POST.
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CDP;
  var $ = function (id) { return document.getElementById(id); };
  var form = $('config-form');
  var elPostes = $('postes');
  var status = $('save-status');

  function buildPosteRows(cfg) {
    elPostes.innerHTML = cfg.postes.map(function (p) {
      var sound = (cfg.sound_poste_id === p.id);
      function radio(val, cls, label) {
        var id = 'p' + p.id + '_' + val;
        var checked = (p.initial === val) ? ' checked' : '';
        return '<input type="radio" name="init_' + p.id + '" id="' + id + '" value="' + val + '"' + checked + '>' +
          '<label class="' + cls + '" for="' + id + '">' + label + '</label>';
      }
      return '<div class="poste-config-row">' +
        '<div class="field"><label>Poste ' + p.id + '</label>' +
          '<input type="text" name="name_' + p.id + '" value="' + escAttr(p.name) + '" maxlength="60"></div>' +
        '<div class="field"><label>Attribution initiale</label>' +
          '<div class="radio-group">' + radio('A', 'r-a', C.teamName('A')) + radio('B', 'r-b', C.teamName('B')) + radio('neutral', 'r-n', 'Neutre') + '</div></div>' +
        '<div class="field"><label>Sonore</label>' +
          '<label class="radio-group" style="display:block"><input type="radio" name="sound_poste_id" value="' + p.id + '"' + (sound ? ' checked' : '') + ' style="position:static;opacity:1;width:auto;height:auto"> </label></div>' +
        '</div>';
    }).join('');
  }

  function escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  // Samples <-> texte « nom: fichier » (une ligne par sample ; variantes séparées par des virgules).
  function samplesToText(samples) {
    samples = samples || {};
    return Object.keys(samples).map(function (name) {
      var v = samples[name];
      var files = Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v);
      return name + ': ' + files;
    }).join('\n');
  }
  function textToSamples(text) {
    var out = {};
    String(text || '').split('\n').forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var i = line.indexOf(':');
      if (i < 0) return;
      var name = line.slice(0, i).trim();
      var rest = line.slice(i + 1).trim();
      if (!name || !rest) return;
      var files = rest.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      out[name] = (files.length > 1) ? files : files[0];
    });
    return out;
  }

  function fill(cfg) {
    $('app_title').value = cfg.app_title || 'Albé 2026';
    $('victory_hold').value = cfg.victory_hold_seconds;
    $('poll_dashboard').value = cfg.poll_dashboard_ms || 2000;
    $('poll_poste').value = cfg.poll_poste_ms || 3000;
    $('name_A').value = cfg.team_names.A;
    $('name_B').value = cfg.team_names.B;
    var audio = cfg.audio || {};
    var pat = audio.patterns || {};
    $('audio_base').value = audio.base_url || 'audio/';
    $('audio_samples').value = samplesToText(audio.samples);
    $('pat_da').value = pat.domination_a || '';
    $('pat_db').value = pat.domination_b || '';
    $('pat_va').value = pat.victory_a || '';
    $('pat_vb').value = pat.victory_b || '';
    $('pat_neutral').value = pat.neutral || '';
    $('pat_ta').value = pat.transition_a || '';
    $('pat_tb').value = pat.transition_b || '';
    buildPosteRows(cfg);
  }

  function collect() {
    var postes = [];
    for (var i = 1; i <= 6; i++) {
      var name = (form.querySelector('[name="name_' + i + '"]') || {}).value || '';
      var initEl = form.querySelector('[name="init_' + i + '"]:checked');
      postes.push({ id: i, name: name, initial: initEl ? initEl.value : 'neutral' });
    }
    var soundEl = form.querySelector('[name="sound_poste_id"]:checked');
    return {
      app_title: $('app_title').value,
      victory_hold_seconds: +$('victory_hold').value || 10,
      poll_dashboard_ms: +$('poll_dashboard').value || 2000,
      poll_poste_ms: +$('poll_poste').value || 3000,
      sound_poste_id: soundEl ? +soundEl.value : 3,
      team_names: { A: $('name_A').value, B: $('name_B').value },
      postes: postes,
      audio: {
        base_url: $('audio_base').value,
        samples: textToSamples($('audio_samples').value),
        patterns: {
          domination_a: $('pat_da').value,
          domination_b: $('pat_db').value,
          victory_a: $('pat_va').value,
          victory_b: $('pat_vb').value,
          neutral: $('pat_neutral').value,
          transition_a: $('pat_ta').value,
          transition_b: $('pat_tb').value
        }
      }
    };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.textContent = 'Enregistrement…';
    var cfg = collect();
    fetch('api/config_save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
      cache: 'no-store'
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.ok) {
        status.textContent = 'Configuration enregistrée ✓ (prend effet au prochain démarrage / reset).';
        // Met à jour les noms d'équipe affichés sans recharger.
        C.teamNames.A = res.config.team_names.A;
        C.teamNames.B = res.config.team_names.B;
        fill(res.config);
        C.toast('Configuration enregistrée.');
      } else {
        status.textContent = 'Erreur : ' + (res.error || 'inconnue');
      }
    }).catch(function () { status.textContent = 'Erreur réseau.'; });
  });

  /* ==================================================================
     Testeur Strudel : écouter un pattern directement depuis cette page.
     Joue le TEXTE COURANT du textarea (édité, non enregistré). Init de
     Strudel à la demande (geste utilisateur), attente du scope async,
     rechargement des samples saisis, puis evaluate(). Stop = hush().
     ================================================================== */
  var testStatus = $('test-status');
  var stopBtn = $('test-stop');
  var strudelReady = false;   // initStrudel() + 1er chargement samples faits
  var audioReady = false;     // initAudio() résolu : AudioWorklets chargés ?
  var playingBtn = null;      // bouton ▶ actuellement actif
  var oneshotTimer = null;    // coupure différée d'une transition (jouée une fois)

  // Patterns joués UNE fois (transitions) : coupés après ~1 cycle de .cpm(30) (≈2 s).
  var ONESHOT_TARGETS = { pat_ta: true, pat_tb: true };
  var ONESHOT_MS = 2200;

  function S() { return window.strudel || null; }
  // Prêt à évaluer = scope peuplé (window.stack) ET worklets chargés (audioReady),
  // sinon le 1er cycle lève « [getTrigger] AudioWorkletNode … ».
  function scopeReady() { return strudelReady && audioReady && typeof window.stack === 'function'; }

  function setStatus(msg) { if (testStatus) testStatus.textContent = msg ? ' — ' + msg : ''; }

  function markPlaying(btn) {
    if (playingBtn && playingBtn !== btn) {
      playingBtn.classList.remove('is-playing');
      playingBtn.textContent = '▶ Tester';
    }
    playingBtn = btn || null;
    if (btn) { btn.classList.add('is-playing'); btn.textContent = '⏸ En lecture'; }
  }

  // Recharge les samples saisis (idempotent) à chaque test : prend en compte les édits.
  function loadSamples() {
    var lib = S();
    if (!lib || typeof lib.samples !== 'function') return;
    var map = textToSamples($('audio_samples').value);
    var base = $('audio_base').value || 'audio/';
    if (Object.keys(map).length) {
      try { lib.samples(map, base); } catch (e) { /* ignoré */ }
    }
  }

  function ensureStrudel() {
    if (strudelReady) return true;
    var lib = S();
    if (!lib || typeof lib.initStrudel !== 'function') return false;
    try {
      lib.initStrudel();
      // Banques officielles (drum machines, piano, Dirt-Samples, …) : non chargées
      // par le prebake de @strudel/web. Mêmes manifestes que le moteur du jeu.
      if (typeof lib.samples === 'function') {
        var banks = ['tidal-drum-machines.json', 'piano.json', 'Dirt-Samples.json',
          'EmuSP12.json', 'vcsl.json', 'mridangam.json'];
        var ds = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/';
        for (var i = 0; i < banks.length; i++) {
          try { lib.samples(ds + banks[i]); } catch (e) { /* banque indisponible */ }
        }
      }
      // PENDANT le geste (clic ▶) : initAudio() resume le contexte ET charge les
      // AudioWorklets ; audioReady passe à true à sa résolution (scopeReady attend).
      if (typeof lib.initAudio === 'function') {
        var done = function () { audioReady = true; };
        try {
          var p = lib.initAudio();
          if (p && typeof p.then === 'function') { p.then(done, done); } else { done(); }
        } catch (e) { done(); }
      } else {
        // Fallback (librairie sans initAudio).
        audioReady = true;
        if (typeof lib.getAudioContext === 'function') {
          var ctx = lib.getAudioContext(); if (ctx && ctx.resume) ctx.resume();
        }
      }
      strudelReady = true;
      return true;
    } catch (e) { return false; }
  }

  function clearOneshot() { if (oneshotTimer) { clearTimeout(oneshotTimer); oneshotTimer = null; } }

  function stopSound() {
    clearOneshot();
    var lib = S();
    if (lib && typeof lib.hush === 'function') { try { lib.hush(); } catch (e) {} }
    markPlaying(null);
    setStatus('arrêté');
  }

  // Joue le contenu d'un textarea ; attend le scope si l'init vient d'être lancée.
  function playPattern(textareaId, btn) {
    if (!ensureStrudel()) { setStatus('librairie Strudel indisponible'); return; }
    var code = ($(textareaId).value || '').trim();
    if (code === '') { stopSound(); setStatus('pattern vide (silence)'); return; }
    setStatus('chargement…');
    var tries = 0;
    (function attempt() {
      if (!scopeReady()) {
        if (tries++ > 60) { setStatus('initialisation trop longue'); return; }
        setTimeout(attempt, 100);
        return;
      }
      loadSamples();
      clearOneshot();
      try {
        S().evaluate(code);
        markPlaying(btn);
        // Transitions : jouées UNE fois, puis coupées automatiquement.
        if (ONESHOT_TARGETS[textareaId]) {
          setStatus('lecture (une fois)');
          oneshotTimer = setTimeout(function () {
            oneshotTimer = null;
            if (playingBtn === btn) stopSound();
          }, ONESHOT_MS);
        } else {
          setStatus('lecture en cours');
        }
      } catch (e) {
        setStatus('erreur dans le pattern : ' + (e && e.message ? e.message : e));
      }
    })();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.test-play'), function (btn) {
    btn.addEventListener('click', function () {
      // Re-cliquer sur le bouton actif = arrêt.
      if (btn === playingBtn) { stopSound(); return; }
      playPattern(btn.getAttribute('data-target'), btn);
    });
  });
  if (stopBtn) stopBtn.addEventListener('click', stopSound);

  // Chargement initial : on part de la config injectée, sinon on la récupère.
  if (window.CDP_CONFIG_FULL) fill(window.CDP_CONFIG_FULL);
  else C.getJSON('config_get.php').then(function (r) { if (r.ok) fill(r.config); });
})();
