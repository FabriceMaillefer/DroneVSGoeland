/* =====================================================================
   history.js — liste des parties archivées + aperçus, lien vers le rejeu.
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CDP, R = C.render;
  var list = $('history-list');
  var empty = $('history-empty');

  function $(id) { return document.getElementById(id); }

  var PAT = { A: 'pat-a', B: 'pat-b', neutral: 'pat-n' };

  function winnerCell(winner, names) {
    if (winner === 'A' || winner === 'B') {
      return '<div class="hist-winner ' + PAT[winner] + '">' +
        C.teamIcon(winner, { size: 28, color: '#fff', sw: 1.8 }) + '</div>';
    }
    return '<div class="hist-winner" style="background:var(--bg-4)">' +
      C.icon('neutral', { size: 26, color: '#7d8aa0', sw: 1.8 }) + '</div>';
  }

  function item(a) {
    var names = a.team_names || { A: 'A', B: 'B' };
    var stats = a.stats || {};
    var score = stats.score || { A: 0, B: 0 };
    var dur = stats.duration != null ? C.fmtTime(stats.duration) : '—';
    var winnerName = a.winner ? (names[a.winner] || a.winner) : 'Aucun vainqueur';
    var most = stats.most_changed && stats.most_changed.name
      ? stats.most_changed.name + ' (' + stats.most_changed.changes + ')' : '—';
    var file = encodeURIComponent(a.file);
    return '<div class="hist-item" data-file="' + R.esc(a.file) + '">' +
      winnerCell(a.winner, names) +
      '<div class="hist-meta">' +
        '<span class="hist-date">' + C.fmtClock(a.ended_at) + '</span>' +
        '<span class="hist-sub">Durée ' + dur + ' · Vainqueur : ' + R.esc(winnerName) +
          ' · Poste le plus disputé : ' + R.esc(most) + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<span class="hist-score">' + score.A + ' — ' + score.B + '</span>' +
        '<a class="btn btn--ghost btn--sm" href="replay.php?archive=' + file + '">Rejouer</a>' +
        '<button type="button" class="btn btn--ghost btn--sm hist-del" data-del="' + R.esc(a.file) +
          '" title="Supprimer cette partie" aria-label="Supprimer cette partie">🗑</button>' +
      '</div>' +
    '</div>';
  }

  // Liste en mémoire : on re-rend après suppression pour gérer l'état "vide".
  var archives = [];

  function render() {
    if (!archives.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    list.innerHTML = archives.map(item).join('');
  }

  // Suppression d'une archive (confirmation + appel API), par délégation.
  list.addEventListener('click', function (e) {
    var btn = e.target.closest('.hist-del');
    if (!btn) return;
    var file = btn.getAttribute('data-del');
    if (!file) return;
    if (!window.confirm('Supprimer définitivement cette partie archivée ? Cette action est irréversible.')) return;

    btn.disabled = true;
    C.post('archive_delete.php', { file: file }).then(function (res) {
      if (res.status === 200 && res.data && res.data.ok) {
        archives = archives.filter(function (a) { return a.file !== file; });
        render();
        C.toast('Partie supprimée.');
      } else {
        btn.disabled = false;
        C.toast((res.data && res.data.error) || 'Suppression impossible.', true);
      }
    }).catch(function () {
      btn.disabled = false;
      C.toast('Suppression impossible (réseau).', true);
    });
  });

  C.getJSON('archives.php').then(function (res) {
    archives = (res && res.archives) || [];
    render();
  }).catch(function () { empty.classList.remove('hidden'); });
})();
