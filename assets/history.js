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
    return '<div class="hist-item">' +
      winnerCell(a.winner, names) +
      '<div class="hist-meta">' +
        '<span class="hist-date">' + C.fmtClock(a.ended_at) + '</span>' +
        '<span class="hist-sub">Durée ' + dur + ' · Vainqueur : ' + R.esc(winnerName) +
          ' · Poste le plus disputé : ' + R.esc(most) + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:16px">' +
        '<span class="hist-score">' + score.A + ' — ' + score.B + '</span>' +
        '<a class="btn btn--ghost btn--sm" href="replay.php?archive=' + encodeURIComponent(a.file) + '">Rejouer</a>' +
      '</div>' +
    '</div>';
  }

  C.getJSON('archives.php').then(function (res) {
    var arr = (res && res.archives) || [];
    if (!arr.length) { empty.classList.remove('hidden'); return; }
    list.innerHTML = arr.map(item).join('');
  }).catch(function () { empty.classList.remove('hidden'); });
})();
