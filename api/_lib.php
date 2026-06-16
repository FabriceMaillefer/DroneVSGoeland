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
        // Bande-son générée par Strudel (voir assets/audio.js + assets/vendor/strudel-web.js).
        //  - base_url : dossier d'où sont chargés les samples (wav/mp3 déposés dans /audio) ;
        //  - samples  : nom logique -> fichier (ou tableau de fichiers pour des variantes :0 :1) ;
        //  - patterns : code Strudel joué pour chaque état du jeu (vide = silence).
        // Ces défauts ne servent que si data/config.json est absent ; la config réelle
        // (éditable en page Configuration) y est persistée.
        'audio'                => [
            'base_url' => 'audio/samples/',
            'samples'  => [
                'aircraft' => 'aircraft/aircraft.wav',
                'seagull'  => 'seagull/seagull.mp3',
            ],
            'patterns' => [
                'domination_a' => CDP_PATTERN_AIRCRAFT,
                'domination_b' => CDP_PATTERN_SEAGULL,
                'victory_a'    => CDP_PATTERN_VICTORY_A,
                'victory_b'    => CDP_PATTERN_VICTORY_B,
                'neutral'      => '',
                // Joués UNE fois quand le poste sonore passe à l'équipe A / B
                // (transition), avant la reprise de l'ambiance. Vide = pas de sting.
                'transition_a' => CDP_PATTERN_TRANSITION_A,
                'transition_b' => CDP_PATTERN_TRANSITION_B,
            ],
        ],
    ];
}

// Patterns Strudel par défaut (adaptés hors-ligne : oscillateurs + vos samples).
// Nowdoc => contenu littéral, aucun échappement requis.
const CDP_PATTERN_AIRCRAFT = <<<'STRUDEL'
// Hangar / Aircraft — version ALLÉGÉE pour mobile (grave & tendue, moins de voix).
// >>> AJUSTER EN LIVE : .gain de chaque couche · .slow(2) = tempo batterie · .cpm(60) = tempo global.
// Allègements vs version riche : pad dissonant + clang retirés, charlestons 8→4,
// batterie SÈCHE (reverb seulement sur l'aircraft) → bien moins de charge CPU sur téléphone.
stack(
  // Sample Aircraft : nappe de fond, grondement espacé (seule couche avec reverb)
  s("aircraft ~ ~ ~")
    .degradeBy(0.4)              // densité : ↑ = aircraft plus rare
    .speed(rand.range(0.45, 0.65))
    .gain(rand.range(0.6, 1))
    .room(0.45),
  // Drone sub : fondation grave, dissonance mineure (D + Eb)
  note("<d1 d1 eb1 d1>").s("sawtooth")
    .lpf(sine.range(120, 400).slow(16)).lpq(8)
    .attack(1).release(2).gain(0.55),
  // Pulsation grave et rythmée (coeur du morceau)
  note("<d2 ~ d2 eb2 ~ d2 ~ ~>")
    .struct("x ~ x x ~ x ~ ~")
    .s("square").lpf(500).lpq(10)
    .attack(0.005).release(0.18).shape(0.4).gain(0.5),
  // TR909 — kick four-on-the-floor (sec). .slow(2) = tempo (≈120 BPM ici)
  s("bd*4").bank("RolandTR909").slow(2).gain(0.7).shape(0.2),
  // TR909 — charlestons allégés (4 au lieu de 8 → moitié moins d'événements)
  s("hh:0 hh:2 hh:4 hh:6").bank("RolandTR909").slow(2).gain(0.3).hpf(6000),
  // TR909 — caisse claire sur les temps 2 & 4 (sec)
  s("~ sd ~ sd").bank("RolandTR909").slow(2).gain(0.5)
).cpm(60)
STRUDEL;

const CDP_PATTERN_SEAGULL = <<<'STRUDEL'
// Bord de mer — version ALLÉGÉE pour mobile (nappe + groove TR808, moins de voix).
// >>> AJUSTER EN LIVE : .gain de chaque couche · .slow(2) = tempo batterie · .cpm(55) = tempo global.
// Allègements vs version riche : sub sinus + guitare arpégée (et son delay) retirés,
// charlestons 8→4, batterie/basse SÈCHES → bien moins de charge CPU sur téléphone.
stack(
  // Nappe d'accords (progression sur 8 mesures)
  note("<[d3,f#3,a3] [a2,e3,a3] [b2,f#3,b3] [g2,d3,g3] [d3,f#3,a3] [g2,b2,d3] [a2,c#3,e3] [a2,e3,a3]>")
    .s("sawtooth").attack(0.6).release(1.4)
    .lpf(sine.range(1200, 2400).slow(8)).gain(0.5).room(0.6),
  // Basse rythmée (sèche)
  note("<d2 a1 b1 g1 d2 g1 a1 a1>")
    .struct("x ~ ~ x ~ x ~ ~").s("sawtooth")
    .lpf(sine.range(350, 900).slow(8)).lpq(6)
    .attack(0.005).release(0.26).gain(0.72),
  // Mélodie sifflée (sine, espacée)
  note("<[a4 ~ b4 a4] [a4 ~ f#4 ~] [b4 ~ a4 f#4] [d4 ~ e4 f#4] [f#4 ~ e4 d4] [b4 ~ d5 b4] [a4 ~ c#5 ~] [a4 ~ ~ ~]>")
    .s("sine").attack(0.02).release(0.25).gain(0.38).room(0.6),
  // Goélands épars (votre sample)
  s("~ ~ seagull ~").degradeBy(0.5).gain(1).room(0.6).speed(rand.range(0.9, 1.1)),
  // TR808 — kick syncopé (sec). .slow(2) = tempo
  s("bd ~ ~ bd ~ ~ bd ~").bank("RolandTR808").slow(2).gain(0.7),
  // TR808 — charlestons allégés (4 au lieu de 8 → moitié moins d'événements)
  s("hh:0 hh:2 hh:4 hh:6").bank("RolandTR808").slow(2).gain(0.26).hpf(7000),
  // TR808 — clap aérien sur les temps 2 & 4 (sec)
  s("~ cp ~ cp").bank("RolandTR808").slow(2).gain(0.4)
).cpm(55)
STRUDEL;

// Stings de transition : joués UNE fois quand le poste sonore passe à A / B.
// .cpm(30) => 1 cycle = 2 s = la fenêtre TRANSITION_HOLD_MS de assets/audio.js,
// donc le motif (1 cycle) joue exactement une fois avant la reprise de l'ambiance.
const CDP_PATTERN_TRANSITION_A = <<<'STRUDEL'
// Capture DRONES — verrouillage ascendant (joué une fois, ~2 s)
stack(
  // Souffle du sample aircraft, accéléré (impact d'arrivée)
  s("aircraft").speed(1.6).hpf(300).gain(0.85).room(0.4),
  // Arpège ascendant « lock-on » (sawtooth qui s'ouvre)
  note("d3 a3 d4 f#4 a4 d5").s("sawtooth")
    .attack(0.005).release(0.16)
    .lpf(sine.range(700, 5000).fast(2)).lpq(6)
    .gain(0.5),
  // Coups graves d'appui (kick TR909)
  s("bd ~ ~ bd").bank("RolandTR909").gain(0.9)
).room(0.3).cpm(30)
STRUDEL;

const CDP_PATTERN_TRANSITION_B = <<<'STRUDEL'
// Capture GOÉLAND — cri descendant / alerte (joué une fois, ~2 s)
stack(
  // Cri de goéland (votre sample), légèrement aigu
  s("seagull").speed(1.15).gain(1).room(0.5),
  // Motif descendant « bascule » (square, façon courte sirène)
  note("a4 f#4 d4 a3 f#3 d3").s("square")
    .attack(0.005).release(0.16)
    .lpf(2400).lpq(8)
    .gain(0.42),
  // Frappes sèches d'appui (clap TR808)
  s("~ cp ~ cp").bank("RolandTR808").gain(0.6)
).room(0.35).cpm(30)
STRUDEL;

// Bandes de VICTOIRE : un éclat marquant au début, puis une plage calme et espacée.
// arrange([n, motif], ...) joue chaque bloc pendant n cycles puis boucle sur le total.
// >>> Pour espacer davantage le retour de l'éclat : augmente le 2e nombre (le « 5 »).
const CDP_PATTERN_VICTORY_A = <<<'STRUDEL'
// Victoire DRONES — version ALLÉGÉE : éclat d'ouverture puis plané paisible (aircraft espacé).
// Allègements vs version riche : accord 5→4 notes, delay retiré (remplacé par reverb).
arrange(
  [1,
    // ÉCLAT : accord majeur + souffle aircraft + boom unique. gain = puissance.
    stack(
      note("[d3,f#3,a3,d4]").s("sawtooth")
        .attack(0.01).release(3).lpf(3500).lpq(4).gain(0.6).room(0.6),
      s("aircraft").speed(0.85).gain(0.9).hpf(120).room(0.7),
      s("bd").bank("RolandTR909").gain(0.95).shape(0.2)
    )
  ],
  [5,
    // PLAGE CALME : nappe aiguë lente + sub doux + aircraft très espacé/lointain.
    stack(
      note("<d5 ~ ~ a4 ~ ~ f#4 ~>").s("triangle")
        .attack(0.8).release(2.5).gain(0.3).room(0.88),
      note("<d2 ~ ~ ~ a1 ~ ~ ~>").s("sine").attack(1.2).release(4).gain(0.4),
      s("~ ~ ~ ~ ~ ~ aircraft ~").speed(0.6).degradeBy(0.4).gain(0.35).room(0.9)
    )
  ]
).cpm(32)
STRUDEL;

const CDP_PATTERN_VICTORY_B = <<<'STRUDEL'
// Victoire GOÉLAND — version ALLÉGÉE : éclat lumineux puis horizon paisible (seagull espacé).
// Allègements vs version riche : accord 5→4 notes, delay retiré (remplacé par reverb).
arrange(
  [1,
    // ÉCLAT : accord majeur brillant + cri de goéland + clap unique. gain = puissance.
    stack(
      note("[d3,f#3,a3,d4]").s("sawtooth")
        .attack(0.02).release(3).lpf(3000).lpq(4).gain(0.55).room(0.7),
      s("seagull").speed(1).gain(1).room(0.7),
      s("cp").bank("RolandTR808").gain(0.55).room(0.4)
    )
  ],
  [5,
    // PLAGE CALME : mélodie sifflée lente + sub très doux + goélands épars.
    stack(
      note("<a4 ~ ~ ~ f#4 ~ ~ d4>").s("sine")
        .attack(0.6).release(3).gain(0.32).room(0.88),
      note("<d2 ~ ~ ~ ~ ~ ~ ~>").s("sine").attack(1.5).release(4).gain(0.35),
      s("~ ~ ~ ~ seagull ~ ~ ~").degradeBy(0.5).gain(0.6).room(0.9).speed(rand.range(0.9, 1.1))
    )
  ]
).cpm(30)
STRUDEL;

/** Nettoie un chemin de sample : relatif, sans traversée de répertoire, longueur bornée. */
function cdp_clean_sample_path(string $path): string
{
    $p = str_replace('\\', '/', trim($path));
    $p = ltrim($p, '/');
    $p = str_replace('../', '', $p);          // pas de remontée de répertoire
    return mb_substr($p, 0, 200);
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

    // ---- Bande-son Strudel -------------------------------------------------
    // base_url : dossier des samples (défaut conservé si vide).
    if (isset($in['audio']['base_url']) && is_string($in['audio']['base_url']) && trim($in['audio']['base_url']) !== '') {
        $out['audio']['base_url'] = mb_substr(trim($in['audio']['base_url']), 0, 200);
    }

    // samples : map nom -> fichier (ou tableau de fichiers). Noms = identifiants sûrs.
    $samples = [];
    if (isset($in['audio']['samples']) && is_array($in['audio']['samples'])) {
        foreach ($in['audio']['samples'] as $name => $val) {
            $name = trim((string) $name);
            if (!preg_match('/^[A-Za-z0-9_]{1,40}$/', $name)) {
                continue; // nom invalide : ignoré
            }
            if (is_array($val)) {
                $files = [];
                foreach ($val as $f) {
                    if (is_string($f) && trim($f) !== '') {
                        $files[] = cdp_clean_sample_path($f);
                    }
                }
                if ($files) {
                    $samples[$name] = $files;
                }
            } elseif (is_string($val) && trim($val) !== '') {
                $samples[$name] = cdp_clean_sample_path($val);
            }
            if (count($samples) >= 64) {
                break; // garde-fou
            }
        }
    }
    $out['audio']['samples'] = $samples ?: $def['audio']['samples'];

    // patterns : code Strudel par état (clés fixes), borné en longueur.
    $out['audio']['patterns'] = $def['audio']['patterns'];
    foreach (['domination_a', 'domination_b', 'victory_a', 'victory_b', 'neutral', 'transition_a', 'transition_b'] as $k) {
        if (isset($in['audio']['patterns'][$k]) && is_string($in['audio']['patterns'][$k])) {
            // 8000 car. : large marge pour des patterns riches + commentaires (les
            // défauts commentés font ~2 ko). Anti-abus sans tronquer du code légitime.
            $out['audio']['patterns'][$k] = mb_substr(trim($in['audio']['patterns'][$k]), 0, 8000);
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
