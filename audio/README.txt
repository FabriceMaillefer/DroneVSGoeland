BANDE-SON — Conquête de postes (propulsée par Strudel)
=======================================================

La bande-son n'est plus 4 fichiers joués bêtement en boucle : elle est
GÉNÉRÉE par Strudel (https://strudel.cc), un mini-langage de musique live.
Strudel évalue un « pattern » (code) différent selon l'état du jeu :

  domination_a   quand l'équipe A domine le « poste sonore »
  domination_b   quand l'équipe B domine le « poste sonore »
  victory_a      à la victoire de l'équipe A
  victory_b      à la victoire de l'équipe B
  neutral        aucune équipe ne domine le poste sonore (vide = silence)

Chaque pattern utilise des SAMPLES (tes fichiers .wav/.mp3/.ogg) chargés
depuis CE dossier.

La librairie est embarquée localement : assets/vendor/strudel-web.js
(aucun accès Internet requis à l'exécution).

Comment fournir tes sons
------------------------
1. Dépose tes fichiers dans ce dossier /audio.
   Formats acceptés par les navigateurs : .mp3, .ogg, .wav, .m4a.

2. Dans la page Configuration (section « Bande-son »), ou dans
   data/config.json (clé "audio"), déclare-les :

   - "base_url" : ce dossier (par défaut "audio/").
   - "samples"  : un NOM LOGIQUE -> un fichier (ou plusieurs, pour des
                  variantes accessibles via :0 :1 …). Ex :
                      drone_a: domination_a.wav
                      perc:    kick.wav, snare.wav
   - "patterns" : le code Strudel joué pour chaque état (voir ci-dessus).
                  Laisse vide pour le silence.

Exemples de patterns
---------------------
  s("drone_a")                  joue le sample "drone_a" une fois par cycle
                                (à la cadence par défaut ~2 s/cycle, un sample
                                de 2 s tourne donc en boucle continue).
  s("drone_a").loopAt(2)        étire/répète le sample sur 2 cycles.
  stack(s("drone_a"), s("perc*4"))   superpose une nappe et 4 percussions/cycle.
  s("drone_a").gain(.8).room(.5)     volume + réverb.

Voir https://strudel.cc/learn/ pour la syntaxe complète.

Conseils
--------
- Préfère des samples « bouclables » (début et fin qui se raccordent) pour
  les nappes de domination.
- Le son ne démarre qu'après le clic sur « Activer le son » (politique des
  navigateurs : une interaction utilisateur est requise pour l'AudioContext).
- Le changement de pattern se fait sur la mesure, sans couper le son.
- La bande-son est diffusée sur le tableau de bord ET sur chaque page de poste.
  La piste est commune (déterminée par l'état partagé), mais chaque appareil
  joue sa propre copie : non synchronisé au sample près (sans incidence si les
  téléphones sont éloignés).
