# Conquête de postes

Application web temporaire pour suivre, en temps réel, l'état d'un **jeu grandeur nature de conquête de postes**.
Deux équipes (**A — DRONES** et **B — GOÉLAND**) se disputent **6 postes**. Chaque poste est contrôlé
par l'équipe A, l'équipe B, ou est neutre. L'état est commun à tous les clients et les écrans se
synchronisent automatiquement (~5 s) via un mécanisme léger **ETag / 304**.

- **PHP 8.x + JavaScript vanilla.** Aucun framework, aucune étape de build, aucune base de données, pas de Composer.
- Stockage **fichiers JSON** (`data/state.json`, `data/config.json`, `data/archives/`), écritures protégées par `flock`.
- Pensé pour un **hébergement mutualisé** standard et un **réseau mobile** (réponses compactes, 304 quand rien ne change).
- **Aucune authentification** (application jetable le temps d'une partie).

---

## Installation

1. **Copier** tout le dossier sur l'hébergeur (par FTP ou via le gestionnaire de fichiers), par exemple dans
   `httpdocs/conquete/`.
2. Vérifier que **PHP 8.x** est actif (c'est le cas par défaut sur la plupart des mutualisés).
3. Rendre le dossier **`data/` accessible en écriture** par PHP :
   - en général rien à faire ; sinon, mettre `data/` et `data/archives/` en **chmod 755** (ou 775).
   Le serveur doit pouvoir écrire `data/state.json`, `data/config.json` et créer des fichiers dans `data/archives/`.
4. Ouvrir **`index.php`** dans un navigateur → c'est le tableau de bord.

> Aucune commande à lancer, aucune dépendance à installer.

### Cache des assets (mise en version au déploiement)

Les CSS/JS sont servis avec un suffixe de version `?v=…` pour **forcer le navigateur à
retélécharger** les fichiers modifiés après un déploiement (fini le « ça reste en cache »).

- Par défaut, la version est **automatique** : c'est la date de modification de chaque fichier
  (`partials.php` → `const CDP_ASSET_VERSION = 'auto'`). Uploader une nouvelle version d'un asset
  suffit donc à invalider son cache.
- Pour **forcer manuellement** une version globale (utile si le serveur préserve les dates de
  modif à l'upload), remplace `'auto'` par une chaîne fixe et incrémente-la à chaque déploiement :
  `const CDP_ASSET_VERSION = '2';` puis `'3'`, etc.

### Pages

| Page | Rôle |
|------|------|
| `index.php` | **Tableau de bord** (vue maître / projection) : 6 postes, score, bandeau de domination + décompte, graphe, stats, audio, victoire. |
| `poste.php?id=N` | **Contrôle d'un poste** (mobile) : change l'équipe qui domine le poste `N` (1 à 6). |
| `config.php` | **Configuration** : noms des postes, attribution initiale, poste sonore, durée de victoire, fichiers audio. |
| `history.php` | **Historique** des parties archivées, avec aperçus. |
| `replay.php` | **Rejeu** d'une partie (courante terminée, ou archivée via `?archive=…`). |

Sur le terrain : le **maître du jeu** garde le tableau de bord ouvert ; chaque **arbitre de poste**
ouvre `poste.php?id=N` sur son téléphone (un clic sur la carte d'un poste du tableau de bord y mène).

---

## Cycle de vie & règles (côté serveur)

Trois états, pilotés par un **bouton principal unique** sur le tableau de bord :

1. **En préparation** (en attente, non démarrée) — on peut déjà **positionner les postes** (A / B / neutre),
   sans chrono ni victoire possible. Bouton : **« ▶ Démarrer la partie »**.
2. **En cours** — chrono lancé, journal `events` alimenté, victoire possible. Bouton : **« ■ Stop »**.
3. **Terminée** — postes **figés** (changements bloqués, HTTP 409). Bouton : **« Nouvelle partie »**.

- **Démarrer** : lance la partie **sur le plateau préparé** (les positions définies en préparation sont
  conservées), vide le journal, démarre le chrono.
- **Stop** / **Nouvelle partie** : **archivent** la partie puis ramènent en **préparation** (plateau remis à
  l'attribution de config). C'est l'état intermédiaire où l'on prépare la manche suivante avant de relancer.
- **Changer un poste** : `A` / `B` / `neutre`. Autorisé en **préparation** (simple positionnement, non journalisé)
  et **en cours** (horodaté dans `events`). Bloqué seulement quand la partie est terminée.
- **Victoire** : une équipe doit tenir **les 6 postes en même temps** sans interruption pendant
  `victory_hold_seconds` (**10 s** par défaut). Si un poste change de camp pendant le décompte, il **repart de zéro**.

Sur le tableau de bord, **cliquer sur la carte d'un poste ouvre sa page** (`poste.php`) : c'est là qu'on
change l'équipe (en préparation comme en cours). Le dashboard reste une vue de lecture + le bouton de partie.

La détection de victoire est aussi faite **à la lecture** (`api/state.php`) : même sans aucune écriture
pendant les 10 s, le premier client qui interroge l'API après l'échéance promeut la partie en victoire
(une seule fois, sous verrou `flock`).

---

## Configuration

Deux moyens, au choix :

### 1. Par l'interface — `config.php`
Modifier les noms de postes, l'attribution initiale (A / B / neutre), le **poste sonore**, la **durée de
victoire**, et les **chemins des 4 fichiers audio**, puis **Enregistrer**.
La config prend effet au **prochain retour en préparation** (Stop / Nouvelle partie) — elle ne perturbe pas une partie en cours.

### 2. Par fichier — `data/config.json`
Éditable directement (le serveur le relit à chaque requête). Exemple :

```json
{
    "app_title": "Albé 2026",
    "victory_hold_seconds": 10,
    "poll_dashboard_ms": 2000,
    "poll_poste_ms": 3000,
    "sound_poste_id": 3,
    "team_names": { "A": "DRONES", "B": "GOÉLAND" },
    "postes": [
        { "id": 1, "name": "Tour Nord",  "initial": "neutral" },
        { "id": 2, "name": "Pont",       "initial": "A" },
        { "id": 3, "name": "Radio",      "initial": "neutral" },
        { "id": 4, "name": "Hangar",     "initial": "neutral" },
        { "id": 5, "name": "Phare",      "initial": "B" },
        { "id": 6, "name": "Quai",       "initial": "neutral" }
    ],
    "audio": {
        "base_url": "audio/",
        "samples": {
            "drone_a": "domination_a.wav",
            "drone_b": "domination_b.wav",
            "win_a":   "victory_a.wav",
            "win_b":   "victory_b.wav"
        },
        "patterns": {
            "domination_a": "s(\"drone_a\")",
            "domination_b": "s(\"drone_b\")",
            "victory_a":    "s(\"win_a\")",
            "victory_b":    "s(\"win_b\")",
            "neutral":      ""
        }
    }
}
```

- `app_title` = titre affiché (onglets, en-têtes, bandeau du tableau de bord).
- `poll_dashboard_ms` / `poll_poste_ms` = intervalle de synchronisation (ms) du tableau de bord et des
  pages de poste. Défauts **2000 / 3000** (le dashboard se rafraîchit plus souvent que les postes).
  Bornés à [500, 60000]. Grâce au mécanisme 304, poller souvent reste peu coûteux en bande passante.
- `initial` ∈ `"A"` | `"B"` | `"neutral"`.
- `sound_poste_id` = identifiant (1–6) du **poste sonore**.
- `victory_hold_seconds` = durée de maintien pour la victoire.

---

## Bande-son (Strudel)

Voir **`audio/README.txt`** pour le détail. En résumé :

- La bande-son est **générée par [Strudel](https://strudel.cc)** (mini-langage de musique live),
  embarqué localement dans **`assets/vendor/strudel-web.js`** (aucun accès Internet requis à l'exécution).
- À chaque état du jeu correspond un **pattern Strudel** (code), évalué automatiquement :
  `domination_a`, `domination_b`, `victory_a`, `victory_b`, et `neutral` (vide = silence).
- Les patterns utilisent des **samples** (fichiers `.wav`/`.mp3`/`.ogg` déposés dans `audio/`),
  chargés via `samples({ nom: "fichier.wav" }, "audio/")` puis joués avec `s("nom")`.
- **Configuration** (`config.php` → section *Bande-son*, ou `data/config.json` clé `audio`) :
  `base_url` (dossier des samples), `samples` (nom → fichier(s)), `patterns` (code par état).
- Le son démarre après le bouton **« Activer le son »** (exigence des navigateurs pour l'AudioContext).
  Le changement de pattern se fait **sur la mesure**, sans couper le son.
- La bande-son est diffusée **sur le tableau de bord ET sur chaque page de poste** (`poste.php`). Le *pattern*
  est commun (déterminé par l'état partagé : poste sonore / victoire), mais chaque appareil joue sa propre
  copie et doit donc activer le son une fois. Les copies ne sont pas synchronisées au sample près — sans
  incidence si les téléphones sont éloignés.

---

## Archives

- Chaque partie jouée est archivée dans **`data/archives/`**, **un fichier par partie**, nommé par
  l'horodatage de fin : `AAAA-MM-JJ_HH-MM-SS.json`.
- L'archivage a lieu au **démarrage d'une nouvelle partie** (la partie précédente est sauvegardée d'abord).
  Les parties **vides** (jamais jouées) ne sont pas archivées.
- Un fichier d'archive est **autonome** : `started_at`, `ended_at`, `winner`, état final des postes,
  journal `events` complet, et statistiques pré-calculées (durée, score, poste le plus disputé).
- Consultation : page **`history.php`** ; détail/rejeu via **`replay.php?archive=NOM.json`**.

Pour **repartir totalement à zéro**, on peut supprimer les fichiers de `data/archives/` et remettre
`data/state.json` à l'état non démarré (ou simplement démarrer une **Nouvelle partie**).

---

## Architecture

```
index.php          Tableau de bord
poste.php          Contrôle d'un poste (?id=N)
config.php         Configuration
history.php        Historique
replay.php         Rejeu (?archive=…)
partials.php       <head> + barre de navigation communs
.htaccess          Compression gzip/brotli + cache statique

api/
  _lib.php         Chemins, load/save flock, évaluation domination, archivage
  state.php        GET  — lecture + ETag/304 + évaluation domination
  start.php        POST — démarrer
  set_team.php     POST — réassigner un poste (409 si partie terminée)
  reset.php        POST — archiver + réinitialiser
  config_get.php   GET  — configuration courante
  config_save.php  POST — enregistrer la configuration
  archives.php     GET  — liste + aperçus des parties
  archive.php      GET  — détail d'une partie (?file=…)

assets/
  style.css        Système de design (palette équipes, états, boutons, cartes)
  core.js          Client API + polling ETag/304, icônes, graphe, stats, timeline
  render.js        Rendu partagé (tuiles, score, part du terrain, stats)
  audio.js         Gestionnaire de bande-son Strudel (patterns par état du jeu)
  dashboard.js     Tableau de bord
  poste.js         Page poste
  replay.js        Moteur de rejeu
  config.js        Page configuration
  history.js       Page historique
  vendor/
    strudel-web.js Librairie Strudel embarquée (@strudel/web, bundle local)

data/
  state.json       État global unique
  config.json      Configuration
  archives/        Une partie archivée = un fichier horodaté

audio/             Samples (wav/mp3/ogg) chargés par Strudel — placeholders fournis
```

### Le mécanisme de synchronisation (ETag / 304)

- `GET api/state.php` renvoie l'état complet **avec un en-tête `ETag: "<version>"`**.
- Le client renvoie ce `ETag` dans `If-None-Match` au poll suivant.
  - **inchangé →** le serveur répond **`304 Not Modified`** (corps vide, quasi gratuit) ;
  - **changé →** `200` + état complet + nouvel `ETag`.
- `version` est un entier **incrémenté à chaque écriture** (sous `flock`).
- Le polling **n'ouvre aucune session** → aucun cookie renvoyé, requêtes répétées minimales.
- Après une écriture, le client applique immédiatement l'état renvoyé (rafraîchissement instantané).

### Concurrence

- Toute **écriture** de `state.json` se fait sous **verrou exclusif `flock`**, avec incrément atomique de
  `version`. Les **lectures** de polling se font **sans verrou** (rapides) ; seul le cas rare d'une
  promotion de victoire détectée à la lecture reprend un verrou pour écrire une seule fois.

---

## Limites assumées

- Pas d'authentification, pas de HTTPS imposé côté code (application jetable).
- Horloge : le serveur renvoie `server_now` pour que le décompte côté client soit insensible au décalage d'horloge.
- Le journal complet est conservé en mémoire/JSON : adapté à une partie courte (quelques heures, dizaines de changements).
