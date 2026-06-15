<?php
/**
 * GET /api/config_get.php — renvoie la configuration courante (pour la page config).
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

header('Cache-Control: no-cache');
cdp_json(['ok' => true, 'config' => cdp_load_config()]);
