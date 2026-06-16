<?php
/**
 * POST /api/archive_delete.php — supprime une partie archivée.
 *
 * Param : file=YYYY-mm-dd_HH-ii-ss.json (validé par cdp_safe_archive_name,
 * anti-traversée de répertoire). Action irréversible : seule l'archive du
 * disque est supprimée, la partie en cours n'est pas touchée.
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    cdp_error('Méthode non autorisée.', 405);
}

$name = cdp_safe_archive_name((string) ($_POST['file'] ?? ''));
if ($name === null) {
    cdp_error('Nom d\'archive invalide.', 400);
}

$path = CDP_ARCHIVE_DIR . '/' . $name;
if (!is_file($path)) {
    cdp_error('Archive introuvable.', 404);
}

if (!@unlink($path)) {
    cdp_error('Suppression impossible (droits du dossier ?).', 500);
}

cdp_json(['ok' => true, 'deleted' => $name]);
