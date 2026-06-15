<?php
/**
 * _lib.php — cœur partagé de "Conquête de postes".
 *
 * Responsabilités :
 *  - chemins des fichiers de données ;
 *  - chargement de la configuration ;
 *  - lecture de l'état SANS verrou (rapide, pour le polling) ;
 *  - mutation de l'état SOUS verrou flock exclusif (atomique, anti-corruption) ;
 *  - évaluation de la domination / condition de victoire ;
 *  - archivage d'une partie terminée.
 *
 * Aucune base de données, aucune dépendance externe : juste des fichiers JSON.
 */

declare(strict_types=1);

mb_internal_encoding('UTF-8');

// Les réponses d'API sont du JSON : aucune erreur/avertissement ne doit être
// imprimée dans le corps (cela casserait JSON.parse côté client). On coupe donc
// l'affichage des erreurs (elles restent journalisées côté serveur si activé).
@ini_set('display_errors', '0');

const CDP_DATA_DIR    = __DIR__ . '/../data';
const CDP_STATE_FILE  = CDP_DATA_DIR . '/state.json';
const CDP_CONFIG_FILE = CDP_DATA_DIR . '/config.json';
const CDP_ARCHIVE_DIR = CDP_DATA_DIR . '/archives';

/** Options communes d'encodage JSON : compact, UTF-8 lisible, slashs non échappés. */
const CDP_JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

/**
 * Variante sûre pour injection dans un <script> inline : échappe < > & '
 * (empêche un nom contenant "</script>" de casser la page). On N'échappe PAS
 * les guillemets (JSON_HEX_QUOT casserait le littéral objet JS).
 */
const CDP_JSON_HTML = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS;

/* ------------------------------------------------------------------ */
/* Helpers de sortie HTTP                                              */
/* ------------------------------------------------------------------ */

/** Envoie une réponse JSON compacte et arrête le script. */
function cdp_json(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, CDP_JSON_FLAGS);
    exit;
}

/** Renvoie une erreur JSON normalisée. */
function cdp_error(string $message, int $status = 400): void
{
    cdp_json(['ok' => false, 'error' => $message], $status);
}

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/** Valeurs par défaut si config.json est absent ou illisible. */
function cdp_default_config(): array
{
    $postes = [];
    for ($i = 1; $i <= 6; $i++) {
        $postes[] = ['id' => $i, 'name' => 'Poste ' . $i, 'initial' => 'neutral'];
    }
    return [
        'app_title'            => 'Albé 2026',
        'victory_hold_seconds' => 10,
        'poll_dashboard_ms'    => 2000,
        'poll_poste_ms'        => 3000,
        'sound_poste_id'       => 3,
        'team_names'           => ['A' => 'DRONES', 'B' => 'GOÉLAND'],
        'postes'               => $postes,
        'audio'                => [
            'domination_a' => 'audio/domination_a.wav',
            'domination_b' => 'audio/domination_b.wav',
            'victory_a'    => 'audio/victory_a.wav',
            'victory_b'    => 'audio/victory_b.wav',
        ],
    ];
}

/** Charge la configuration (lecture simple, pas de verrou). */
function cdp_load_config(): array
{
    if (!is_file(CDP_CONFIG_FILE)) {
        return cdp_default_config();
    }
    $raw = @file_get_contents(CDP_CONFIG_FILE);
    $cfg = $raw !== false ? json_decode($raw, true) : null;
    if (!is_array($cfg)) {
        return cdp_default_config();
    }
    // Complète les clés manquantes avec les défauts (config tolérante).
    return array_replace_recursive(cdp_default_config(), $cfg);
}

/** Normalise/valide une config soumise avant écriture. Retourne la config nettoyée. */
function cdp_sanitize_config(array $in): array
{
    $def = cdp_default_config();
    $out = $def;

    // Titre de l'application (affiché dans les en-têtes et les onglets).
    if (isset($in['app_title']) && is_string($in['app_title'])) {
        $t = mb_substr(trim($in['app_title']), 0, 60);
        $out['app_title'] = $t !== '' ? $t : $def['app_title'];
    }

    // Durée de maintien pour la victoire (bornée à des valeurs raisonnables).
    if (isset($in['victory_hold_seconds'])) {
        $out['victory_hold_seconds'] = max(1, min(3600, (int) $in['victory_hold_seconds']));
    }

    // Intervalles de polling (ms), bornés à [500, 60000] pour ne pas matraquer le serveur.
    if (isset($in['poll_dashboard_ms'])) {
        $out['poll_dashboard_ms'] = max(500, min(60000, (int) $in['poll_dashboard_ms']));
    }
    if (isset($in['poll_poste_ms'])) {
        $out['poll_poste_ms'] = max(500, min(60000, (int) $in['poll_poste_ms']));
    }

    // Noms d'équipes.
    if (isset($in['team_names']['A']) && is_string($in['team_names']['A'])) {
        $out['team_names']['A'] = mb_substr(trim($in['team_names']['A']), 0, 40) ?: $def['team_names']['A'];
    }
    if (isset($in['team_names']['B']) && is_string($in['team_names']['B'])) {
        $out['team_names']['B'] = mb_substr(trim($in['team_names']['B']), 0, 40) ?: $def['team_names']['B'];
    }

    // Postes : exactement 6, ids 1..6, nom et attribution initiale.
    $postes = [];
    $src = isset($in['postes']) && is_array($in['postes']) ? array_values($in['postes']) : [];
    for ($i = 0; $i < 6; $i++) {
        $p    = $src[$i] ?? [];
        $id   = $i + 1;
        $name = isset($p['name']) && is_string($p['name']) ? trim($p['name']) : '';
        if ($name === '') {
            $name = 'Poste ' . $id;
        }
        $name    = mb_substr($name, 0, 60);
        $initial = $p['initial'] ?? 'neutral';
        if (!in_array($initial, ['A', 'B', 'neutral'], true)) {
            $initial = 'neutral';
        }
        $postes[] = ['id' => $id, 'name' => $name, 'initial' => $initial];
    }
    $out['postes'] = $postes;

    // Poste sonore : doit être un id existant.
    $soundId = isset($in['sound_poste_id']) ? (int) $in['sound_poste_id'] : $def['sound_poste_id'];
    if ($soundId < 1 || $soundId > 6) {
        $soundId = $def['sound_poste_id'];
    }
    $out['sound_poste_id'] = $soundId;

    // Chemins audio (chaînes libres ; on garde les défauts si vides).
    foreach (['domination_a', 'domination_b', 'victory_a', 'victory_b'] as $k) {
        if (isset($in['audio'][$k]) && is_string($in['audio'][$k]) && trim($in['audio'][$k]) !== '') {
            $out['audio'][$k] = trim($in['audio'][$k]);
        }
    }

    return $out;
}

/** Écrit la config sous verrou exclusif. */
function cdp_save_config(array $config): void
{
    $fp = fopen(CDP_CONFIG_FILE, 'c+');
    if ($fp === false) {
        cdp_error('Impossible d\'ouvrir config.json en écriture.', 500);
    }
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($config, CDP_JSON_FLAGS | JSON_PRETTY_PRINT));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

/* ------------------------------------------------------------------ */
/* État                                                                */
/* ------------------------------------------------------------------ */

/** État neuf, partie non démarrée, postes positionnés selon la config. */
function cdp_default_state(array $config): array
{
    $postes = [];
    foreach ($config['postes'] as $p) {
        $postes[] = ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'team' => (string) $p['initial']];
    }
    return [
        'version'          => 1,
        'game_started'     => false,
        'game_over'        => false,
        'winner'           => null,
        'started_at'       => null,
        'ended_at'         => null,
        'domination_since' => null,
        'domination_team'  => null,
        'postes'           => $postes,
        'events'           => [],
    ];
}

/**
 * Lecture rapide de l'état SANS verrou exclusif (le polling doit rester léger).
 * Si le fichier est absent/corrompu, retourne un état par défaut (non persisté ici).
 */
function cdp_read_state(array $config): array
{
    if (!is_file(CDP_STATE_FILE)) {
        return cdp_default_state($config);
    }
    $raw   = @file_get_contents(CDP_STATE_FILE);
    $state = $raw !== false && $raw !== '' ? json_decode($raw, true) : null;
    if (!is_array($state)) {
        return cdp_default_state($config);
    }
    return $state;
}

/**
 * Mutation atomique de l'état sous verrou flock exclusif.
 *
 * $fn(array &$state, array $config): bool
 *   - reçoit l'état courant (relu sous verrou) et la config ;
 *   - modifie $state par référence ;
 *   - retourne true si l'état a changé (=> écriture + incrément de version).
 *
 * $meta (par référence, optionnel) permet à $fn de remonter un code HTTP / message.
 *
 * Retourne l'état final (tel qu'écrit, ou inchangé).
 */
function cdp_mutate_state(array $config, callable $fn, array &$meta = []): array
{
    $fp = fopen(CDP_STATE_FILE, 'c+');
    if ($fp === false) {
        cdp_error('Impossible d\'ouvrir state.json.', 500);
    }

    // Verrou EXCLUSIF : un seul écrivain à la fois (maîtres de jeu + postes en parallèle).
    flock($fp, LOCK_EX);

    $raw   = stream_get_contents($fp);
    $state = $raw !== '' ? json_decode($raw, true) : null;
    if (!is_array($state)) {
        $state = cdp_default_state($config);
    }

    $changed = (bool) $fn($state, $config, $meta);

    if ($changed) {
        // Incrément ATOMIQUE de version : on est sous verrou, donc personne d'autre n'écrit.
        $state['version'] = (int) ($state['version'] ?? 0) + 1;
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($state, CDP_JSON_FLAGS));
        fflush($fp);
    }

    flock($fp, LOCK_UN);
    fclose($fp);

    return $state;
}

/* ------------------------------------------------------------------ */
/* Domination & victoire                                               */
/* ------------------------------------------------------------------ */

/** Compte les postes par équipe. Retourne ['A'=>int,'B'=>int,'neutral'=>int]. */
function cdp_count_teams(array $state): array
{
    $c = ['A' => 0, 'B' => 0, 'neutral' => 0];
    foreach ($state['postes'] as $p) {
        $t = $p['team'] ?? 'neutral';
        if (!isset($c[$t])) {
            $t = 'neutral';
        }
        $c[$t]++;
    }
    return $c;
}

/** Si les 6 postes sont tenus par une même équipe ≠ neutre, retourne 'A' ou 'B', sinon null. */
function cdp_single_dominant(array $state): ?string
{
    $c = cdp_count_teams($state);
    $n = count($state['postes']);
    if ($n > 0 && $c['A'] === $n) {
        return 'A';
    }
    if ($n > 0 && $c['B'] === $n) {
        return 'B';
    }
    return null;
}

/**
 * Évalue la fenêtre de domination et la condition de victoire.
 * Appelée APRÈS chaque écriture ET lors de chaque lecture.
 *
 * Modifie $state par référence. Retourne true si quelque chose a changé.
 *
 * Logique :
 *  1. partie non démarrée ou déjà terminée → rien ;
 *  2. une seule équipe T tient les 6 postes :
 *     - fenêtre absente / autre équipe → on (ré)ouvre la fenêtre (since=now, team=T) ;
 *     - même équipe maintenue depuis ≥ victory_hold_seconds → VICTOIRE (game_over, winner, ended_at) ;
 *  3. sinon → on annule la fenêtre (since=null, team=null).
 */
function cdp_evaluate_domination(array &$state, array $config, int $now): bool
{
    if (empty($state['game_started']) || !empty($state['game_over'])) {
        return false;
    }

    $hold = (int) ($config['victory_hold_seconds'] ?? 10);
    $T    = cdp_single_dominant($state);
    $changed = false;

    if ($T !== null) {
        if (($state['domination_since'] ?? null) === null || ($state['domination_team'] ?? null) !== $T) {
            // Ouverture (ou réinitialisation suite à un changement d'équipe dominante).
            $state['domination_since'] = $now;
            $state['domination_team']  = $T;
            $changed = true;
        } else {
            // Même équipe maintenue : la victoire tombe-t-elle ?
            if (($now - (int) $state['domination_since']) >= $hold) {
                $state['game_over']        = true;
                $state['winner']           = $T;
                $state['ended_at']         = $now;
                // On fige la fenêtre (utile pour l'affichage / la cohérence).
                $changed = true;
            }
        }
    } else {
        // Les 6 postes ne sont plus à la même équipe : le compteur est annulé.
        if (($state['domination_since'] ?? null) !== null || ($state['domination_team'] ?? null) !== null) {
            $state['domination_since'] = null;
            $state['domination_team']  = null;
            $changed = true;
        }
    }

    return $changed;
}

/* ------------------------------------------------------------------ */
/* Archivage                                                           */
/* ------------------------------------------------------------------ */

/**
 * Statistiques pré-calculées d'une partie, pour les aperçus d'historique
 * et le rendu sans tout recalculer.
 */
function cdp_compute_stats(array $state): array
{
    $started = $state['started_at'] ?? null;
    $ended   = $state['ended_at'] ?? null;
    $duration = ($started !== null && $ended !== null) ? max(0, (int) $ended - (int) $started) : null;

    // Score final = postes tenus par chaque équipe à la fin.
    $counts = cdp_count_teams($state);

    // Captures par équipe (chaque event "to" = une capture vers cette équipe).
    $capturesA = 0;
    $capturesB = 0;
    $changesByPoste = [];
    foreach ($state['events'] as $e) {
        $pid = (int) ($e['poste_id'] ?? 0);
        $changesByPoste[$pid] = ($changesByPoste[$pid] ?? 0) + 1;
        if (($e['to'] ?? null) === 'A') {
            $capturesA++;
        } elseif (($e['to'] ?? null) === 'B') {
            $capturesB++;
        }
    }

    // Poste le plus disputé.
    $mostId = null;
    $mostN  = 0;
    foreach ($changesByPoste as $pid => $n) {
        if ($n > $mostN) {
            $mostN  = $n;
            $mostId = $pid;
        }
    }
    $mostName = null;
    if ($mostId !== null) {
        foreach ($state['postes'] as $p) {
            if ((int) $p['id'] === $mostId) {
                $mostName = $p['name'];
                break;
            }
        }
    }

    return [
        'duration'          => $duration,
        'score'             => ['A' => $counts['A'], 'B' => $counts['B'], 'neutral' => $counts['neutral']],
        'total_captures'    => count($state['events']),
        'captures'          => ['A' => $capturesA, 'B' => $capturesB],
        'most_changed'      => [
            'poste_id' => $mostId,
            'name'     => $mostName,
            'changes'  => $mostN,
        ],
    ];
}

/**
 * Archive la partie courante si elle a effectivement été jouée :
 *  - démarrée ET (au moins un événement OU terminée).
 * Ne crée AUCUN fichier pour une partie vide.
 *
 * Doit être appelée DANS une mutation (donc déjà sous verrou state.json).
 * Retourne le nom du fichier d'archive créé, ou null.
 */
function cdp_archive_if_played(array $state, array $config): ?string
{
    $started = $state['started_at'] ?? null;
    if ($started === null) {
        return null; // jamais démarrée
    }
    $played = !empty($state['events']) || !empty($state['game_over']);
    if (!$played) {
        return null; // démarrée mais aucune action ni victoire → on n'archive pas
    }

    if (!is_dir(CDP_ARCHIVE_DIR)) {
        @mkdir(CDP_ARCHIVE_DIR, 0775, true);
    }

    $ended = $state['ended_at'] ?? time();

    $snapshot = [
        'started_at'   => (int) $started,
        'ended_at'     => (int) $ended,
        'winner'       => $state['winner'] ?? null,
        'team_names'   => $config['team_names'],
        'sound_poste_id' => $config['sound_poste_id'],
        'postes'       => $state['postes'],   // état final autonome
        'events'       => $state['events'],   // journal complet
        'stats'        => cdp_compute_stats($state),
    ];

    // Nom de fichier = horodatage de fin, unique en pratique.
    $base = date('Y-m-d_H-i-s', (int) $ended);
    $file = $base . '.json';
    $path = CDP_ARCHIVE_DIR . '/' . $file;
    // Collision improbable (deux fins dans la même seconde) : on suffixe.
    $n = 1;
    while (is_file($path)) {
        $file = $base . '-' . $n . '.json';
        $path = CDP_ARCHIVE_DIR . '/' . $file;
        $n++;
    }

    // Écriture verrouillée du fichier d'archive (indépendant de state.json).
    file_put_contents($path, json_encode($snapshot, CDP_JSON_FLAGS | JSON_PRETTY_PRINT), LOCK_EX);

    return $file;
}

/** Valide un nom de fichier d'archive (anti-traversée de répertoire). */
function cdp_safe_archive_name(string $name): ?string
{
    $base = basename($name);
    if ($base !== $name) {
        return null;
    }
    if (!preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}(-[0-9]+)?\.json$/', $base)) {
        return null;
    }
    return $base;
}
