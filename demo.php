<?php
/**
 * demo.php — soundboard mobile : joue les différents patterns Strudel pour les
 * faire écouter à l'équipe (démo). Lecture 100 % LOCALE — aucune écriture d'état,
 * donc n'affecte pas le son joué sur les autres appareils.
 */
declare(strict_types=1);
require __DIR__ . '/api/_lib.php';
require __DIR__ . '/partials.php';

$config = cdp_load_config();
$nameA = $config['team_names']['A'] ?? 'Équipe A';
$nameB = $config['team_names']['B'] ?? 'Équipe B';
cdp_head($config['app_title'] . ' — Sons');
?>
<body>
<script>
  window.CDP_CONFIG = <?= json_encode(cdp_client_config($config), CDP_JSON_HTML) ?>;
</script>

<div class="poste-page">
  <div class="topbar" style="margin-bottom:14px">
    <a class="btn btn--ghost btn--sm" href="index.php">← Tableau</a>
    <span class="kicker">Démo sons</span>
  </div>

  <p class="muted soundboard-note">
    Écoute locale, pour faire la démo à l'équipe. <strong>N'affecte pas</strong> le son joué sur les autres appareils,
    et ne change rien à la partie en cours.
  </p>

  <div class="soundboard" id="soundboard">
    <div class="sb-group">
      <div class="sb-label">Domination (en boucle)</div>
      <div class="sb-row">
        <button class="btn btn--a sb-btn" data-key="domination_a" data-mode="loop">▶ <?= htmlspecialchars($nameA) ?></button>
        <button class="btn btn--b sb-btn" data-key="domination_b" data-mode="loop">▶ <?= htmlspecialchars($nameB) ?></button>
      </div>
    </div>

    <div class="sb-group">
      <div class="sb-label">Transitions (joué une fois)</div>
      <div class="sb-row">
        <button class="btn btn--a sb-btn" data-key="transition_a" data-mode="once">⚡ Capture <?= htmlspecialchars($nameA) ?></button>
        <button class="btn btn--b sb-btn" data-key="transition_b" data-mode="once">⚡ Capture <?= htmlspecialchars($nameB) ?></button>
      </div>
    </div>

    <div class="sb-group">
      <div class="sb-label">Victoire (en boucle)</div>
      <div class="sb-row">
        <button class="btn btn--a sb-btn" data-key="victory_a" data-mode="loop">🏆 <?= htmlspecialchars($nameA) ?></button>
        <button class="btn btn--b sb-btn" data-key="victory_b" data-mode="loop">🏆 <?= htmlspecialchars($nameB) ?></button>
      </div>
    </div>

    <div class="sb-group">
      <div class="sb-label">Neutre</div>
      <div class="sb-row">
        <button class="btn btn--neutral sb-btn" data-key="neutral" data-mode="loop">Neutre</button>
      </div>
    </div>
  </div>

  <button class="btn btn--ghost sb-stop" id="btn-stop">⏹ Stop</button>
  <div class="muted sb-status" id="sb-status"></div>
</div>

<script src="<?= htmlspecialchars(cdp_asset('assets/core.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/vendor/strudel-web.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/sounds.js'), ENT_QUOTES) ?>"></script>
</body>
</html>
