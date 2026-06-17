<?php
/**
 * GET /api/state.php — lecture de l'état + synchronisation par ETag/304.
 *
 * C'est le point central du mécanisme de synchro :
 *  1. on lit l'état SANS verrou (cas courant ultra-léger) ;
 *  2. on évalue la domination sur une COPIE ; si elle conclut à un changement
 *     (typiquement : les 10 s se sont écoulées sans écriture → VICTOIRE), on prend
 *     alors seulement un verrou flock exclusif, on re-vérifie et on écrit ;
 *  3. on place `version` dans un en-tête ETag ;
 *  4. si If-None-Match == version courante → 304 Not Modified, corps vide ;
 *  5. sinon → 200 + état complet JSON compact.
 *
 * Aucune session n'est démarrée → aucun cookie renvoyé (réponses de poll minimales).
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

// NB : pas de ob_gzhandler ici. Sur de nombreux hébergements mutualisés,
// zlib.output_compression est déjà actif et ob_gzhandler échoue en émettant un
// Warning qui corromprait le JSON (et donc le polling / la détection de victoire).
// La compression éventuelle est laissée au serveur ; le mécanisme 304 suffit à
// minimiser le trafic répété.

$config = cdp_load_config();
$state  = cdp_read_state($config);
$now    = time();

// Évaluation "à blanc" sur une copie : ne verrouille QUE si un changement est requis.
$probe = $state;
if (cdp_evaluate_domination($probe, $config, $now)) {
    // Un changement est nécessaire (p.ex. promotion en victoire) : on le fait sous verrou,
    // en re-vérifiant à l'intérieur pour que la promotion n'ait lieu qu'une seule fois.
    $state = cdp_mutate_state($config, function (array &$s, array $c) use ($now): bool {
        return cdp_evaluate_domination($s, $c, $now);
    });
}

$version = (int) ($state['version'] ?? 0);
$etag    = '"' . $version . '"';

header('ETag: ' . $etag);
header('Cache-Control: no-cache');
header('Vary: Accept-Encoding');
header('Content-Type: application/json; charset=utf-8');

// Comparaison avec If-None-Match (le navigateur peut renvoyer plusieurs valeurs / "W/").
$inm = trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
if ($inm !== '' && ($inm === $etag || $inm === 'W/' . $etag)) {
    http_response_code(304);
    exit; // corps vide
}

// 200 : état complet. On injecte server_now (epoch serveur, entier) pour que le
// client corrige le décalage d'horloge et affiche un décompte fiable, ainsi que
// server_time (epoch sous-seconde) pour la grille de synchro audio (assets/audio.js)
// qui a besoin d'une précision fine pour caler les départs de son entre clients.
$state['server_now']  = $now;
$state['server_time'] = microtime(true);
echo json_encode($state, CDP_JSON_FLAGS);
