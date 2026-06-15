/* =====================================================================
   render.js — rendu visuel partagé (dashboard + rejeu).
   Expose CDP.render.* : tuiles de poste, score, barre "part du terrain",
   panneau de statistiques. Aucun de ces rendus ne touche aux nœuds <audio>.
   ===================================================================== */
(function () {
  'use strict';
  var C = window.CDP;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var PAT = { A: 'pat-a', B: 'pat-b', neutral: 'pat-n' };
  var ICON_COLOR = { A: '#fff', B: '#fff', neutral: '#dde4ee' };

  // Construit le HTML d'une tuile. asLink => cliquable vers poste.php.
  function tileHTML(poste, soundId, asLink) {
    var team = poste.team || 'neutral';
    var isSound = (poste.id === soundId);
    var letter = team === 'A' ? 'A' : (team === 'B' ? 'B' : 'N');
    var badge = isSound
      ? '<span class="tile__badge tile__badge--sound">' + C.icon('sound', { size: 10, color: '#0a0f18' }) + 'SON</span>'
      : '<span class="tile__badge">' + letter + '</span>';

    var inner =
      '<div class="tile__head">' +
        '<span class="tile__name">' + esc(poste.name) + '</span>' + badge +
      '</div>' +
      '<div class="tile__body ' + PAT[team] + '">' +
        C.teamIcon(team, { size: 32, color: ICON_COLOR[team], sw: 1.8 }) +
        '<span class="tile__label">' + esc(C.teamName(team)) + '</span>' +
      '</div>';

    var attrs = 'class="tile' + (isSound ? ' is-sound' : '') + '" data-team="' + team + '"';
    if (asLink) {
      return '<a ' + attrs + ' href="poste.php?id=' + poste.id + '">' + inner + '</a>';
    }
    return '<div ' + attrs + '>' + inner + '</div>';
  }

  function renderTiles(container, postes, soundId, asLink) {
    container.innerHTML = (postes || []).map(function (p) {
      return tileHTML(p, soundId, asLink);
    }).join('');
  }

  // Met à jour les deux scores (nombre de postes tenus).
  function renderScore(root, counts) {
    var a = root.querySelector('[data-score="A"]');
    var b = root.querySelector('[data-score="B"]');
    if (a) a.textContent = counts.A;
    if (b) b.textContent = counts.B;
  }

  // Barre "part du terrain" : 3 segments proportionnels.
  function renderTerrain(el, counts) {
    if (!el) return;
    function seg(cls, team, n) {
      if (n <= 0) return '';
      var label = (team === 'neutral' ? 'N' : C.teamName(team)) + ' · ' + n;
      return '<div class="' + cls + '" style="flex-grow:' + n + '">' + esc(label) + '</div>';
    }
    el.innerHTML =
      seg('pat-a', 'A', counts.A) +
      seg('pat-b', 'B', counts.B) +
      seg('pat-n seg-n', 'neutral', counts.neutral);
  }

  // Panneau statistiques (poste le plus disputé, captures, temps en tête).
  function renderStats(root, stats) {
    var total = root.querySelector('[data-stat="total"]');
    if (total) total.textContent = stats.total + ' captures';

    // Classement des postes les plus disputés (top 3).
    var rank = root.querySelector('[data-stat="ranking"]');
    if (rank) {
      if (!stats.ranking || !stats.ranking.length) {
        rank.innerHTML = '<li class="muted">Aucun changement</li>';
      } else {
        rank.innerHTML = stats.ranking.map(function (r, i) {
          return '<li><span class="rank-pos">' + (i + 1) + '</span>' +
            '<span class="rank-name">' + esc(r.name || '—') + '</span>' +
            '<span class="rank-val">' + r.changes + ' chgt' + (r.changes > 1 ? 's' : '') + '</span></li>';
        }).join('');
      }
    }

    var fa = root.querySelector('[data-lead="A"]');
    var fb = root.querySelector('[data-lead="B"]');
    var pa = root.querySelector('[data-lead-pct="A"]');
    var pb = root.querySelector('[data-lead-pct="B"]');
    if (fa) fa.style.width = stats.lead.A + '%';
    if (fb) fb.style.width = stats.lead.B + '%';
    if (pa) pa.textContent = stats.lead.A + '%';
    if (pb) pb.textContent = stats.lead.B + '%';
  }

  C.render = {
    tileHTML: tileHTML,
    renderTiles: renderTiles,
    renderScore: renderScore,
    renderTerrain: renderTerrain,
    renderStats: renderStats,
    esc: esc
  };
})();
