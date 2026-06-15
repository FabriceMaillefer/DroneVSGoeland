<?php
/**
 * POST /api/set_team.php — réassigne l'équipe dominante d'un poste.
 *
 * Paramètres : poste_id (1..6), team ('A' | 'B' | 'neutral').
 *  - refusé (409) si la partie est terminée (game_over) ;
 *  - refusé (409) si la partie n'a pas démarré ;
 *  - ajoute une entrée dans events (from, to, t relatif à started_at) ;
 *  - puis évalue la domination (peut ouvrir/maintenir/annuler la fenêtre des 10 s).
 *
 * Renvoie l'état frais pour rafraîchir immédiatement le client appelant.
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    cdp_error('Méthode non autorisée.', 405);
}

$posteId = isset($_POST['poste_id']) ? (int) $_POST['poste_id'] : 0;
$team    = isset($_POST['team']) ? (string) $_POST['team'] : '';

if (!in_array($team, ['A', 'B', 'neutral'], true)) {
    cdp_error('Équipe invalide (A, B ou neutral attendu).', 400);
}

$config = cdp_load_config();
$now    = time();
$meta   = ['http' => 200, 'error' => null];

$state = cdp_mutate_state($config, function (array &$s, array $c, array &$meta) use ($posteId, $team, $now): bool {
    // Seule une partie TERMINÉE verrouille les changements. En attente (préparation)
    // comme en cours, on peut (ré)assigner les postes.
    if (!empty($s['game_over'])) {
        $meta = ['http' => 409, 'error' => 'Partie terminée : changements verrouillés.'];
        return false;
    }

    // Localise le poste.
    $idx = null;
    foreach ($s['postes'] as $i => $p) {
        if ((int) $p['id'] === $posteId) {
            $idx = $i;
            break;
        }
    }
    if ($idx === null) {
        $meta = ['http' => 404, 'error' => 'Poste introuvable.'];
        return false;
    }

    $from = $s['postes'][$idx]['team'] ?? 'neutral';
    if ($from === $team) {
        // Aucun changement réel : on ne journalise rien, on n'incrémente pas la version.
        $meta = ['http' => 200, 'error' => null, 'noop' => true];
        return false;
    }

    $s['postes'][$idx]['team'] = $team;

    if (!empty($s['game_started'])) {
        // Partie en cours : on journalise l'événement (t relatif au démarrage)
        // et on évalue la domination (ouvre / maintient / annule la fenêtre des 10 s).
        $s['events'][] = [
            't'        => max(0, $now - (int) ($s['started_at'] ?? $now)),
            'poste_id' => $posteId,
            'from'     => $from,
            'to'       => $team,
        ];
        cdp_evaluate_domination($s, $c, $now);
    }
    // En préparation (non démarrée) : on change juste le plateau, sans event ni victoire.

    $meta = ['http' => 200, 'error' => null];
    return true;
}, $meta);

if (($meta['http'] ?? 200) !== 200) {
    cdp_error($meta['error'] ?? 'Refusé.', (int) $meta['http']);
}

$state['server_now'] = $now;
header('Content-Type: application/json; charset=utf-8');
header('ETag: "' . (int) $state['version'] . '"');
echo json_encode($state, CDP_JSON_FLAGS);
