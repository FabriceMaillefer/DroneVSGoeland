<?php
/**
 * GET /api/archive.php?file=YYYY-mm-dd_HH-ii-ss.json
 * Détail complet d'une partie archivée (postes finaux, events, stats) pour le rejeu.
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

// Pas de ob_gzhandler (voir state.php).

$name = cdp_safe_archive_name((string) ($_GET['file'] ?? ''));
if ($name === null) {
    cdp_error('Nom d\'archive invalide.', 400);
}

$path = CDP_ARCHIVE_DIR . '/' . $name;
if (!is_file($path)) {
    cdp_error('Archive introuvable.', 404);
}

$raw  = @file_get_contents($path);
$data = $raw !== false ? json_decode($raw, true) : null;
if (!is_array($data)) {
    cdp_error('Archive illisible.', 500);
}

header('Cache-Control: no-cache');
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok' => true, 'archive' => $data], CDP_JSON_FLAGS);
