<?php
/**
 * poste.php?id=N — page de contrôle d'un poste (mobile, gros boutons).
 */
declare(strict_types=1);
require __DIR__ . '/api/_lib.php';
require __DIR__ . '/partials.php';

$config = cdp_load_config();
$state  = cdp_read_state($config);
$state['server_now'] = time();

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if ($id < 1 || $id > 6) {
    $id = 1;
}
$poste = null;
foreach ($state['postes'] as $p) {
    if ((int) $p['id'] === $id) { $poste = $p; break; }
}
$posteName = $poste ? $poste['name'] : ('Poste ' . $id);

cdp_head($config['app_title'] . ' — ' . $posteName);
?>
<body>
<script>
  window.CDP_CONFIG   = <?= json_encode(cdp_client_config($config), CDP_JSON_HTML) ?>;
  window.CDP_STATE    = <?= json_encode($state, CDP_JSON_HTML) ?>;
  window.CDP_POSTE_ID = <?= $id ?>;
</script>

<div class="poste-page">
  <div class="topbar" style="margin-bottom:14px">
    <a class="btn btn--ghost btn--sm" href="index.php">← Tableau</a>
    <span class="kicker"><?= htmlspecialchars($posteName) ?></span>
    <button class="btn btn--sm sound-cta" id="btn-sound" style="margin-left:auto">🔊 Activer le son</button>
  </div>

  <!-- État courant (occupe le haut, plein contraste) -->
  <div class="poste-state pat-n" id="state" data-team="neutral">
    <div class="poste-state__kicker" id="kicker">POSTE <?= $id ?></div>
    <div class="poste-state__icon" id="icon"></div>
    <div class="poste-state__team" id="team">…</div>
    <div class="poste-state__desc" id="desc"></div>
  </div>

  <!-- Action : changer l'équipe qui domine -->
  <div id="controls">
    <div class="poste-q" id="question">QUI CONTRÔLE CE POSTE ?</div>
    <div class="poste-actions" id="actions"></div>
  </div>

  <div class="poste-locked-note hidden" id="locked"></div>
</div>

<script src="<?= htmlspecialchars(cdp_asset('assets/core.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/render.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/vendor/strudel-web.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/audio.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/poste.js'), ENT_QUOTES) ?>"></script>
</body>
</html>
