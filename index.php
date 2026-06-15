<?php
/**
 * index.php — Tableau de bord (vue maître / projection).
 * Sert l'état et la config initiale en ligne (window.CDP_*) pour un premier
 * rendu immédiat, puis le client se synchronise via api/state.php.
 */
declare(strict_types=1);
require __DIR__ . '/api/_lib.php';
require __DIR__ . '/partials.php';

$config = cdp_load_config();
$state  = cdp_read_state($config);
$state['server_now'] = time();

cdp_head($config['app_title'] . ' — Tableau de bord');
$appH  = htmlspecialchars($config['app_title']);
$nameA = htmlspecialchars($config['team_names']['A']);
$nameB = htmlspecialchars($config['team_names']['B']);
?>
<body>
<script>
  window.CDP_CONFIG = <?= json_encode(cdp_client_config($config), CDP_JSON_HTML) ?>;
  window.CDP_STATE  = <?= json_encode($state, CDP_JSON_HTML) ?>;
</script>

<div class="wrap">
  <div class="panel" id="dash">
    <!-- En-tête : titre, score géant, horloge, actions -->
    <div class="dash-head">
      <div class="dash-brand"><?= $appH ?></div>

      <div class="score">
        <div class="score__team">
          <span class="score__name score__name--a" id="name-a"><?= $nameA ?></span>
          <span class="score__num score__num--a" data-score="A">0</span>
        </div>
        <span class="score__sep">—</span>
        <div class="score__team">
          <span class="score__num score__num--b" data-score="B">0</span>
          <span class="score__name score__name--b" id="name-b"><?= $nameB ?></span>
        </div>
      </div>

      <div class="dash-meta">
        <span class="clock" id="clock">⏱ 00:00</span>
        <button class="btn btn--a btn--sm" id="btn-start">▶ Démarrer la partie</button>
        <button class="btn btn--sm sound-cta" id="btn-sound">🔊 Activer le son</button>
        <span class="nav-sep"></span>
        <a class="btn btn--ghost btn--sm" href="config.php">Config</a>
        <a class="btn btn--ghost btn--sm" href="history.php">Historique</a>
      </div>
    </div>

    <!-- Bandeau de domination (tension) -->
    <div class="dom-banner" id="banner">
      <span class="dom-banner__dot"></span>
      <span class="dom-banner__txt" id="banner-txt">DOMINATION</span>
      <span class="dom-banner__sub">— VICTOIRE DANS</span>
      <span class="dom-banner__count" id="banner-count">00:10</span>
    </div>

    <!-- Écran de victoire (injecté par JS) -->
    <div id="victory" class="hidden"></div>

    <!-- Corps -->
    <div style="padding:20px 22px 26px">
      <div class="label">Part du terrain</div>
      <div class="terrain" id="terrain"></div>

      <div class="spacer"></div>

      <div class="tiles tiles--dash" id="tiles"></div>

      <div class="spacer"></div>

      <div class="charts">
        <!-- Graphe en aires empilées -->
        <div class="card">
          <div class="chart-head">
            <span class="chart-title">POSTES DOMINÉS DANS LE TEMPS</span>
            <div class="legend">
              <span><i class="li-a"></i><?= $nameA ?></span>
              <span><i class="li-b"></i><?= $nameB ?></span>
              <span><i class="li-n"></i>Neutre</span>
            </div>
          </div>
          <div class="chart-wrap">
            <div class="chart-y"><span>6</span><span>3</span><span>0</span></div>
            <svg class="chart-svg" id="chart"></svg>
          </div>
          <div class="chart-x"><span>début</span><span>maintenant</span></div>
        </div>

        <!-- Statistiques -->
        <div class="stats-col">
          <div class="card">
            <div class="label">Postes les plus disputés</div>
            <ol class="ranking" data-stat="ranking"><li class="muted">—</li></ol>
          </div>
          <div class="card">
            <div class="label">Rythme</div>
            <div class="stat-big" data-stat="total">0 captures</div>
            <div class="muted" style="font-size:12px">depuis le début</div>
          </div>
          <div class="card">
            <div class="label">Temps en tête</div>
            <div class="bar-row">
              <span class="nm nm-a"><?= $nameA ?></span>
              <div class="bar-track"><div class="bar-fill bar-fill--a" data-lead="A" style="width:0"></div></div>
              <span class="bar-pct" data-lead-pct="A">0%</span>
            </div>
            <div class="bar-row">
              <span class="nm nm-b"><?= $nameB ?></span>
              <div class="bar-track"><div class="bar-fill bar-fill--b" data-lead="B" style="width:0"></div></div>
              <span class="bar-pct" data-lead-pct="B">0%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <p class="muted" style="margin-top:18px;font-size:13px">
    Astuce : ouvre une page de poste sur un mobile via le bouton ⤢ de chaque tuile, ou
    <a href="poste.php?id=1">poste.php?id=1</a> … <a href="poste.php?id=6">id=6</a>.
  </p>
</div>

<script src="<?= htmlspecialchars(cdp_asset('assets/core.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/render.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/audio.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/dashboard.js'), ENT_QUOTES) ?>"></script>
</body>
</html>
