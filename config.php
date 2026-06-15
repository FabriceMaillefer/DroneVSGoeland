<?php
/**
 * config.php — éditeur de configuration (noms de postes, attribution initiale,
 * poste sonore, durée de victoire, fichiers audio). Édition par fichier
 * également possible : voir data/config.json (documenté dans le README).
 */
declare(strict_types=1);
require __DIR__ . '/api/_lib.php';
require __DIR__ . '/partials.php';

$config = cdp_load_config();
cdp_head($config['app_title'] . ' — Configuration');
?>
<body>
<script>
  window.CDP_CONFIG      = <?= json_encode(cdp_client_config($config), CDP_JSON_HTML) ?>;
  window.CDP_CONFIG_FULL = <?= json_encode($config, CDP_JSON_HTML) ?>;
</script>

<div class="wrap wrap--narrow">
  <?php cdp_topbar('Configuration', 'config', $config['app_title']); ?>

  <form id="config-form" class="form-grid">
    <div class="section-head"><span style="color:var(--a);font-family:var(--font-display);font-weight:700">01</span><h2>Règles & équipes</h2></div>

    <div class="field">
      <label for="app_title">Titre de l'application</label>
      <input type="text" id="app_title" maxlength="60" value="Albé 2026">
    </div>
    <div class="field">
      <label for="victory_hold">Durée de maintien pour la victoire (secondes)</label>
      <input type="number" id="victory_hold" min="1" max="3600" value="10">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="field">
        <label for="poll_dashboard">Rafraîchissement dashboard (ms)</label>
        <input type="number" id="poll_dashboard" min="500" max="60000" step="500" value="2000">
      </div>
      <div class="field">
        <label for="poll_poste">Rafraîchissement postes (ms)</label>
        <input type="number" id="poll_poste" min="500" max="60000" step="500" value="3000">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="field"><label for="name_A">Nom équipe A</label><input type="text" id="name_A" maxlength="40" value="DRONES"></div>
      <div class="field"><label for="name_B">Nom équipe B</label><input type="text" id="name_B" maxlength="40" value="GOÉLAND"></div>
    </div>

    <div class="section-head"><span style="color:var(--a);font-family:var(--font-display);font-weight:700">02</span><h2>Postes</h2>
      <span class="hint">nom · attribution initiale · poste sonore</span></div>
    <div id="postes" class="form-grid"></div>

    <div class="section-head"><span style="color:var(--a);font-family:var(--font-display);font-weight:700">03</span><h2>Bandes-son</h2>
      <span class="hint">chemins relatifs (déposer les fichiers dans /audio)</span></div>
    <div class="field"><label for="audio_da">Domination équipe A</label><input type="text" id="audio_da" value="audio/domination_a.wav"></div>
    <div class="field"><label for="audio_db">Domination équipe B</label><input type="text" id="audio_db" value="audio/domination_b.wav"></div>
    <div class="field"><label for="audio_va">Victoire équipe A</label><input type="text" id="audio_va" value="audio/victory_a.wav"></div>
    <div class="field"><label for="audio_vb">Victoire équipe B</label><input type="text" id="audio_vb" value="audio/victory_b.wav"></div>

    <div style="display:flex;align-items:center;gap:16px;margin-top:10px">
      <button type="submit" class="btn btn--a">Enregistrer</button>
      <span class="muted" id="save-status"></span>
    </div>
    <p class="muted" style="font-size:13px">La configuration prend effet au prochain <strong>Démarrer</strong> ou <strong>Relancer</strong> (elle ne perturbe pas une partie en cours).</p>
  </form>
</div>

<script src="<?= htmlspecialchars(cdp_asset('assets/core.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/config.js'), ENT_QUOTES) ?>"></script>
</body>
</html>
