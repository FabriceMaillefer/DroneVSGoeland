<?php
/**
 * POST /api/reset.php — relance : archive la partie courante puis réinitialise.
 *
 *  - archive d'abord la partie courante si jouée (avant toute réinitialisation) ;
 *  - postes ramenés à l'attribution de config ;
 *  - events vidé, game_over=false, winner=null, game_started=false ;
 *  - débloque donc les modifications (l'interface repassera en "non démarrée").
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    cdp_error('Méthode non autorisée.', 405);
}

$config = cdp_load_config();
$now    = time();

$state = cdp_mutate_state($config, function (array &$s, array $c) use ($now): bool {
    // Archivage AVANT réinitialisation (protégé par le verrou de la mutation).
    cdp_archive_if_played($s, $c);

    $postes = [];
    foreach ($c['postes'] as $p) {
        $postes[] = ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'team' => (string) $p['initial']];
    }

    $s['game_started']     = false;
    $s['game_over']        = false;
    $s['winner']           = null;
    $s['started_at']       = null;
    $s['ended_at']         = null;
    $s['domination_since'] = null;
    $s['domination_team']  = null;
    $s['postes']           = $postes;
    $s['events']           = [];

    return true;
});

$state['server_now'] = $now;
header('Content-Type: application/json; charset=utf-8');
header('ETag: "' . (int) $state['version'] . '"');
echo json_encode($state, CDP_JSON_FLAGS);
