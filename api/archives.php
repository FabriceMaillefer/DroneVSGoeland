<?php
/**
 * GET /api/archives.php — liste des parties archivées + aperçus.
 *
 * Renvoie, de la plus récente à la plus ancienne, un résumé par partie :
 * fichier, date de fin, durée, gagnant, score final, poste le plus disputé.
 * Les stats étant pré-calculées à l'archivage, aucun recalcul lourd ici.
 *
 * NB : on utilise scandir() (et non glob()) car glob() est parfois désactivé
 * ou restreint par open_basedir sur l'hébergement mutualisé.
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

// Pas de ob_gzhandler (voir state.php) : évite la corruption du JSON sur les
// hébergements où zlib.output_compression est déjà actif.

header('Cache-Control: no-cache');
header('Content-Type: application/json; charset=utf-8');

$items = [];

if (is_dir(CDP_ARCHIVE_DIR)) {
    $names = @scandir(CDP_ARCHIVE_DIR) ?: [];
    // Ne garder que les fichiers .json, triés du plus récent au plus ancien.
    $names = array_filter($names, function ($n) {
        return substr($n, -5) === '.json';
    });
    rsort($names, SORT_STRING);

    foreach ($names as $name) {
        $path = CDP_ARCHIVE_DIR . '/' . $name;
        $raw  = @file_get_contents($path);
        $data = $raw !== false ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            continue;
        }
        $items[] = [
            'file'       => $name,
            'started_at' => $data['started_at'] ?? null,
            'ended_at'   => $data['ended_at'] ?? null,
            'winner'     => $data['winner'] ?? null,
            'team_names' => $data['team_names'] ?? ['A' => 'A', 'B' => 'B'],
            'stats'      => $data['stats'] ?? null,
        ];
    }
}

echo json_encode(['ok' => true, 'archives' => $items], CDP_JSON_FLAGS);
