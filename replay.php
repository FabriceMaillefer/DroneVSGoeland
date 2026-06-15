<?php
/**
 * replay.php — rejeu d'une partie.
 *   - ?archive=FICHIER.json → rejoue une partie archivée ;
 *   - sans paramètre        → rejoue la partie courante (state.json).
 * Le rejeu est 100 % côté client à partir du journal `events`.
 */
declare(strict_types=1);
require __DIR__ . '/api/_lib.php';
require __DIR__ . '/partials.php';

$config = cdp_load_config();
$replay = null;
$names  = $config['team_names'];
$soundId = (int) $config['sound_poste_id'];
$heading = 'Rejeu de la partie';

$archiveParam = (string) ($_GET['archive'] ?? '');
if ($archiveParam !== '') {
    // Source = archive.
    $name = cdp_safe_archive_name($archiveParam);
    if ($name !== null && is_file(CDP_ARCHIVE_DIR . '/' . $name)) {
        $arch = json_decode((string) file_get_contents(CDP_ARCHIVE_DIR . '/' . $name), true);
        if (is_array($arch)) {
            $names   = $arch['team_names'] ?? $names;
            $soundId = (int) ($arch['sound_poste_id'] ?? $soundId);
            $replay  = [
                'started_at' => $arch['started_at'] ?? null,
                'ended_at'   => $arch['ended_at'] ?? null,
                'winner'     => $arch['winner'] ?? null,
                'postes'     => $arch['postes'] ?? [],
                'events'     => $arch['events'] ?? [],
            ];
            $heading = 'Rejeu — ' . date('d/m/Y H:i', (int) ($arch['ended_at'] ?? time()));
        }
    }
} else {
    // Source = partie courante.
    $state = cdp_read_state($config);
    if (!empty($state['events'])) {
        $replay = [
            'started_at' => $state['started_at'] ?? null,
            'ended_at'   => $state['ended_at'] ?? time(),
            'winner'     => $state['winner'] ?? null,
            'postes'     => $state['postes'] ?? [],
            'events'     => $state['events'] ?? [],
        ];
    }
}

$winnerName = ($replay && $replay['winner']) ? ($names[$replay['winner']] ?? $replay['winner']) : null;

cdp_head($config['app_title'] . ' — Rejeu');
$nameA = htmlspecialchars($names['A']);
$nameB = htmlspecialchars($names['B']);
?>
<body>
<script>
  window.CDP_CONFIG = <?= json_encode(['team_names' => $names, 'sound_poste_id' => $soundId], CDP_JSON_HTML) ?>;
  window.CDP_REPLAY = <?= json_encode($replay, CDP_JSON_HTML) ?>;
</script>

<div class="wrap">
  <?php cdp_topbar('Rejeu', '', $config['app_title']); ?>

  <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px;flex-wrap:wrap">
    <h2 style="font-family:var(--font-display);font-weight:600;margin:0"><?= htmlspecialchars($heading) ?></h2>
    <?php if ($winnerName): ?>
      <span class="hist-sub">Vainqueur : <strong style="color:#fff"><?= htmlspecialchars($winnerName) ?></strong></span>
    <?php endif; ?>
    <a class="btn btn--ghost btn--sm" href="history.php" style="margin-left:auto">← Historique</a>
  </div>

  <p id="rp-empty" class="muted hidden" style="text-align:center;padding:40px 0">
    Aucune partie à rejouer. Joue une partie (et termine-la) ou choisis une partie dans l'<a href="history.php">historique</a>.
  </p>

  <div class="panel" id="replay">
    <!-- Contrôles de lecture -->
    <div class="replay-controls">
      <button class="btn btn--a btn--sm" id="rp-play">▶ Lecture</button>
      <input type="range" id="rp-range" value="0" min="0" max="100">
      <span class="replay-time" id="rp-time">00:00 / 00:00</span>
      <div class="speed-group" id="rp-speeds">
        <button data-speed="1">×1</button>
        <button data-speed="8">×8</button>
        <button data-speed="30">×30</button>
        <button data-speed="60">×60</button>
      </div>
    </div>

    <div style="padding:18px 22px 24px">
      <div class="score" style="margin:0 0 16px">
        <div class="score__team">
          <span class="score__name score__name--a"><?= $nameA ?></span>
          <span class="score__num score__num--a" data-score="A">0</span>
        </div>
        <span class="score__sep">—</span>
        <div class="score__team">
          <span class="score__num score__num--b" data-score="B">0</span>
          <span class="score__name score__name--b"><?= $nameB ?></span>
        </div>
      </div>

      <div class="label">Part du terrain</div>
      <div class="terrain" id="rp-terrain"></div>
      <div class="spacer"></div>

      <div class="tiles" id="rp-tiles"></div>
      <div class="spacer"></div>

      <div class="charts">
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
            <svg class="chart-svg" id="rp-chart"></svg>
          </div>
          <div class="chart-x"><span>début</span><span>fin</span></div>
        </div>

        <div class="stats-col">
          <div class="card">
            <div class="label">Postes les plus disputés</div>
            <ol class="ranking" data-stat="ranking"><li class="muted">—</li></ol>
          </div>
          <div class="card">
            <div class="label">Captures</div>
            <div class="stat-big" data-stat="total">0 captures</div>
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
</div>

<script src="<?= htmlspecialchars(cdp_asset('assets/core.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/render.js'), ENT_QUOTES) ?>"></script>
<script src="<?= htmlspecialchars(cdp_asset('assets/replay.js'), ENT_QUOTES) ?>"></script>
</body>
</html>
