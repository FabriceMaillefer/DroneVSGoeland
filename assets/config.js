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

  function fill(cfg) {
    $('app_title').value = cfg.app_title || 'Albé 2026';
    $('victory_hold').value = cfg.victory_hold_seconds;
    $('poll_dashboard').value = cfg.poll_dashboard_ms || 2000;
    $('poll_poste').value = cfg.poll_poste_ms || 3000;
    $('name_A').value = cfg.team_names.A;
    $('name_B').value = cfg.team_names.B;
    $('audio_da').value = cfg.audio.domination_a;
    $('audio_db').value = cfg.audio.domination_b;
    $('audio_va').value = cfg.audio.victory_a;
    $('audio_vb').value = cfg.audio.victory_b;
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
        domination_a: $('audio_da').value,
        domination_b: $('audio_db').value,
        victory_a: $('audio_va').value,
        victory_b: $('audio_vb').value
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

  // Chargement initial : on part de la config injectée, sinon on la récupère.
  if (window.CDP_CONFIG_FULL) fill(window.CDP_CONFIG_FULL);
  else C.getJSON('config_get.php').then(function (r) { if (r.ok) fill(r.config); });
})();
