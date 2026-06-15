/* =====================================================================
   poste.js — page de contrôle d'un poste (mobile, gros boutons empilés).
   Affiche l'état courant, permet de changer l'équipe dominante, se
   synchronise toutes les ~5 s, verrouille quand la partie est terminée.
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CDP;
  var CFG = C.config;
  var SOUND_ID = CFG.sound_poste_id || 3;
  var POSTE_ID = window.CDP_POSTE_ID;

  var $ = function (id) { return document.getElementById(id); };
  var elState = $('state');
  var elKicker = $('kicker');
  var elIcon = $('icon');
  var elTeam = $('team');
  var elDesc = $('desc');
  var elControls = $('controls');
  var elActions = $('actions');
  var elQ = $('question');
  var elLocked = $('locked');
  var btnSound = $('btn-sound');

  // Bande-son commune (même logique que le dashboard) : chaque téléphone lit sa
  // propre copie, déclenchée après le clic « Activer le son » de CE téléphone.
  var audio = C.createAudioManager();

  var PAT = { A: 'pat-a', B: 'pat-b', neutral: 'pat-n' };

  function descFor(team) {
    if (team === 'A' || team === 'B') return 'Contrôlé par l\'équipe ' + C.teamName(team);
    return 'Personne ne le contrôle';
  }

  function render(state) {
    var poste = (state.postes || []).filter(function (p) { return p.id === POSTE_ID; })[0];
    if (!poste) { elTeam.textContent = 'Poste introuvable'; return; }

    var team = poste.team || 'neutral';
    // Seule une partie TERMINÉE verrouille les contrôles. En préparation (non
    // démarrée) comme en cours, on peut positionner / changer l'équipe.
    var locked = !!state.game_over;
    var isSound = (poste.id === SOUND_ID);

    // En-tête d'état
    elKicker.textContent = poste.name.toUpperCase() + (isSound ? ' · SONORE' : '');

    if (state.game_over) {
      // Partie terminée : bloc verrouillé (cadenas).
      elState.className = 'poste-state poste-state--locked';
      elState.removeAttribute('data-team');
      elIcon.innerHTML = C.icon('lock', { size: 52, color: '#7d8aa0', sw: 1.8 });
      elTeam.textContent = 'PARTIE TERMINÉE';
      elDesc.textContent = 'Contrôles verrouillés';
    } else {
      elState.className = 'poste-state ' + PAT[team];
      elState.setAttribute('data-team', team);
      elIcon.innerHTML = C.teamIcon(team, { size: 56, color: team === 'neutral' ? '#fff' : '#fff', sw: 1.9 });
      elTeam.textContent = C.teamName(team);
      elDesc.textContent = descFor(team);
    }

    // Boutons de contrôle (toujours présents, désactivés si verrouillé)
    elQ.textContent = locked ? 'CHANGER L\'ÉQUIPE QUI DOMINE' : (team === 'neutral' ? 'QUI CONTRÔLE CE POSTE ?' : 'CHANGER L\'ÉQUIPE QUI DOMINE');
    var defs = [
      { t: 'A', cls: 'btn--a', icon: 'drone', sw: 1.8 },
      { t: 'B', cls: 'btn--b', icon: 'gull', sw: 2.1 },
      { t: 'neutral', cls: 'btn--neutral', icon: 'neutral', sw: 1.8 }
    ];
    elActions.innerHTML = defs.map(function (d) {
      var current = (d.t === team);
      // currentColor : l'icône suit la couleur (thématisée) du texte du bouton.
      // Boutons A/B = texte blanc sur aplat ; bouton neutre = texte selon le thème.
      var color = 'currentColor';
      var label = C.teamName(d.t);
      var content = C.icon(d.icon, { size: 26, color: color, sw: d.sw }) + ' ' + label +
        (current ? ' · ACTUEL ' + C.icon('check', { size: 20, color: color, sw: 2.2 }) : '');
      return '<button class="btn ' + d.cls + (current ? ' is-current' : '') +
        (locked ? ' is-disabled' : '') + '" data-team="' + d.t + '"' + (locked ? ' disabled' : '') + '>' +
        content + '</button>';
    }).join('');

    // Note verrouillage
    if (state.game_over) {
      elLocked.classList.remove('hidden');
      elLocked.innerHTML = '🏆 ' + C.teamName(state.winner) + ' vainqueurs — 6/6';
    } else if (!state.game_started) {
      elLocked.classList.remove('hidden');
      elLocked.textContent = 'Partie en préparation — tu peux déjà positionner ce poste avant le lancement.';
    } else {
      elLocked.classList.add('hidden');
    }

    // Bande-son commune (ne bascule que si la piste cible change ; n'agit qu'après activation).
    audio.apply(state);
  }

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

  elActions.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-team]');
    if (!btn || btn.disabled) return;
    C.post('set_team.php', { poste_id: POSTE_ID, team: btn.getAttribute('data-team') }).then(applyWrite);
  });

  // Son : 1er clic = activer ; clics suivants = couper / rétablir.
  if (btnSound) {
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
  }

  var poller = C.createPoller(render, { interval: CFG.poll_poste_ms || 3000 });
  if (window.CDP_STATE) {
    poller.setEtag('"' + (window.CDP_STATE.version || 0) + '"');
    render(window.CDP_STATE);
  }
  poller.start();
})();
