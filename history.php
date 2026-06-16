<?php
/**
 * history.php — historique des parties archivées (plus récente d'abord).
 */
declare(strict_types=1);
require __DIR__ . '/api/_lib.php';
require __DIR__ . '/partials.php';

$config = cdp_load_config();
cdp_head($config['app_title'] . ' — Historique');
?>
<body>
<script>
  window.CDP_CONFIG = <?= json_encode(cdp_client_config($config), CDP_JSON_HTML) ?>;
</script>

<div class="wrap wrap--narrow">
  <?php cdp_topbar('Historique des parties', 'history', $config['app_title'], ['dashboard']); ?>

  <div id="history-list" class="history-list"></div>
  <p id="history-empty" class="muted hidden" style="text-align:center;padding:40px 0">
    Aucune partie archivée pour l'instant. Les parties jouées sont archivées au moment du
    <strong>Relancer</strong> ou du démarrage d'une nouvelle partie.
  </p>
</div>

<script src="<?= htmlspecialchars(cdp_asset('assets/core.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/render.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/history.js'), ENT_QUOTES) ?>"></script>
</body>
</html>
