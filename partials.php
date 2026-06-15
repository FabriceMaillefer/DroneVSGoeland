<?php
/**
 * partials.php — fragments HTML communs aux pages (head + barre de navigation).
 */

declare(strict_types=1);

/**
 * Version des assets pour le cache-busting (CSS/JS).
 *
 *  - 'auto' (défaut) : la version est la date de modification de CHAQUE fichier.
 *    → à chaque nouveau déploiement (fichier mis à jour), l'URL change et le
 *      navigateur retélécharge automatiquement la nouvelle version.
 *  - une chaîne fixe (ex. '2', '2026-06-15', 'v3') : force une version GLOBALE
 *    identique pour tous les assets — il suffit alors de la changer à chaque
 *    déploiement pour invalider tous les caches d'un coup.
 */
const CDP_ASSET_VERSION = 'auto';

/** Renvoie l'URL d'un asset suffixée d'une version (cache-busting). */
function cdp_asset(string $path): string
{
    $ver = CDP_ASSET_VERSION;
    if ($ver === 'auto') {
        $full = __DIR__ . '/' . ltrim($path, '/');
        $ver = is_file($full) ? (string) filemtime($full) : '0';
    }
    return $path . '?v=' . rawurlencode($ver);
}

/** Logo SVG (drone stylisé + croix), réutilisé dans les en-têtes. */
const CDP_LOGO_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="5" r="2.6" stroke="#fff" stroke-width="1.6"/><circle cx="19" cy="5" r="2.6" stroke="#fff" stroke-width="1.6"/><circle cx="5" cy="19" r="2.6" stroke="#fff" stroke-width="1.6"/><circle cx="19" cy="19" r="2.6" stroke="#fff" stroke-width="1.6"/><line x1="7" y1="7" x2="17" y2="17" stroke="#fff" stroke-width="1.5"/><line x1="17" y1="7" x2="7" y2="17" stroke="#fff" stroke-width="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.3" fill="#fff"/></svg>';

/** Émet l'ouverture du document + <head> (polices Chakra Petch / Space Grotesk + CSS). */
function cdp_head(string $title): void
{
    $t = htmlspecialchars($title, ENT_QUOTES);
    echo "<!doctype html>\n<html lang=\"fr\">\n<head>\n";
    echo "<meta charset=\"utf-8\">\n";
    echo "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n";
    echo "<meta name=\"theme-color\" content=\"#070b12\">\n";
    echo "<title>$t</title>\n";
    echo "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n";
    echo "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n";
    echo "<link href=\"https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap\" rel=\"stylesheet\">\n";
    echo "<link rel=\"stylesheet\" href=\"" . htmlspecialchars(cdp_asset('assets/style.css'), ENT_QUOTES) . "\">\n";
    // Applique le thème mémorisé AVANT le rendu (évite tout flash de couleur).
    echo "<script>try{if(localStorage.getItem('cdp-theme')==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}</script>\n";
    echo "</head>\n";
}

/** Sous-ensemble de config exposé au client (pas besoin de tout, ni de le re-télécharger). */
function cdp_client_config(array $config): array
{
    return [
        'app_title'            => $config['app_title'] ?? 'Albé 2026',
        'team_names'           => $config['team_names'],
        'sound_poste_id'       => (int) $config['sound_poste_id'],
        'victory_hold_seconds' => (int) $config['victory_hold_seconds'],
        'poll_dashboard_ms'    => (int) ($config['poll_dashboard_ms'] ?? 2000),
        'poll_poste_ms'        => (int) ($config['poll_poste_ms'] ?? 3000),
        'audio'                => $config['audio'],
    ];
}

/** Barre supérieure avec logo + titre + navigation. */
function cdp_topbar(string $heading, string $active = '', string $appTitle = 'Albé 2026'): void
{
    $h = htmlspecialchars($heading, ENT_QUOTES);
    $links = [
        'dashboard' => ['index.php', 'Tableau de bord'],
        'config'    => ['config.php', 'Configuration'],
        'history'   => ['history.php', 'Historique'],
    ];
    echo '<div class="topbar">';
    echo '<div class="logo">' . CDP_LOGO_SVG . '</div>';
    echo '<div><div class="kicker">' . htmlspecialchars($appTitle, ENT_QUOTES) . '</div><h1>' . $h . '</h1></div>';
    echo '<nav class="nav">';
    foreach ($links as $key => [$href, $label]) {
        $cls = 'btn btn--ghost btn--sm' . ($key === $active ? ' is-active' : '');
        echo '<a class="' . $cls . '" href="' . $href . '">' . htmlspecialchars($label) . '</a>';
    }
    echo '</nav></div>';
}
