<?php
/**
 * POST /api/start.php — lance la partie depuis l'état de PRÉPARATION.
 *
 *  - démarre sur le plateau COURANT (les postes positionnés en attente sont conservés) ;
 *  - game_started = true, started_at = maintenant, events vidés, fenêtre de domination remise à null ;
 *  - exception : si la partie précédente était terminée, on l'archive et on repart du plateau
 *    de configuration (sécurité ; en usage normal on passe par reset.php avant).
 *
 * Renvoie l'état frais (mêmes champs que state.php) pour rafraîchir immédiatement le client.
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    cdp_error('Méthode non autorisée.', 405);
}

$config = cdp_load_config();
$now    = time();

$state = cdp_mutate_state($config, function (array &$s, array $c) use ($now): bool {
    $wasOver = !empty($s['game_over']);

    // Archive la partie précédente si elle a été jouée (et pas encore archivée).
    cdp_archive_if_played($s, $c);

    // Reprise après une partie terminée : on repart du plateau de configuration.
    // Sinon (préparation) : on CONSERVE le plateau préparé tel quel.
    if ($wasOver) {
        $postes = [];
        foreach ($c['postes'] as $p) {
            $postes[] = ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'team' => (string) $p['initial']];
        }
        $s['postes'] = $postes;
    }

    $s['game_started']     = true;
    $s['game_over']        = false;
    $s['winner']           = null;
    $s['started_at']       = $now;
    $s['ended_at']         = null;
    $s['domination_since'] = null;
    $s['domination_team']  = null;
    $s['events']           = [];

    // Une partie peut démarrer déjà en domination (config 6/6) : on évalue tout de suite.
    cdp_evaluate_domination($s, $c, $now);

    return true; // toujours un changement
});

$state['server_now'] = $now;
header('Content-Type: application/json; charset=utf-8');
header('ETag: "' . (int) $state['version'] . '"');
echo json_encode($state, CDP_JSON_FLAGS);
