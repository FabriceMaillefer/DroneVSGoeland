<?php
/**
 * POST /api/config_save.php — enregistre la configuration.
 *
 * Accepte soit un corps JSON (Content-Type: application/json),
 * soit des champs de formulaire classiques (champ `config` = JSON).
 * La config est nettoyée/validée avant écriture (cdp_sanitize_config).
 *
 * Note : la config ne modifie pas l'état d'une partie en cours ; elle prend effet
 * au prochain démarrage (start) ou reset, et pour l'affichage au rechargement des pages.
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    cdp_error('Méthode non autorisée.', 405);
}

// Récupère la config soumise (JSON brut OU champ POST `config`).
$input = null;
$ctype = $_SERVER['CONTENT_TYPE'] ?? '';
if (stripos($ctype, 'application/json') !== false) {
    $raw   = file_get_contents('php://input');
    $input = json_decode($raw, true);
} elseif (isset($_POST['config'])) {
    $input = json_decode((string) $_POST['config'], true);
}

if (!is_array($input)) {
    cdp_error('Configuration invalide (JSON attendu).', 400);
}

$clean = cdp_sanitize_config($input);
cdp_save_config($clean);

cdp_json(['ok' => true, 'config' => $clean]);
