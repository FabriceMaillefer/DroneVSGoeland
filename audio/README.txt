BANDES-SON — Conquête de postes
================================

Quatre pistes, jouées EN BOUCLE, communes à tous les clients du tableau de bord :

  domination_a.wav   diffusée quand l'équipe A domine le « poste sonore »
  domination_b.wav   diffusée quand l'équipe B domine le « poste sonore »
  victory_a.wav      diffusée à la victoire de l'équipe A
  victory_b.wav      diffusée à la victoire de l'équipe B

Les fichiers présents ici sont des PLACEHOLDERS générés synthétiquement
(des boucles de 2 s, volontairement distinctes pour les tests). Remplace-les
par tes propres musiques.

Comment fournir tes pistes
--------------------------
1. Dépose tes fichiers dans ce dossier /audio.
   Formats acceptés par les navigateurs : .mp3, .ogg, .wav, .m4a.
2. Soit tu gardes les mêmes noms (domination_a.wav, …) — rien d'autre à faire ;
   soit tu indiques les nouveaux chemins dans la page Configuration
   (ou dans data/config.json, clé "audio").

Conseils
--------
- Préfère des boucles courtes et « bouclables » (début et fin qui se raccordent),
  car la lecture est en boucle (loop) sans coupure.
- Le son ne démarre qu'après le clic sur « Activer le son » (politique des
  navigateurs : une interaction utilisateur est requise).
- La bascule entre deux pistes se fait par un court fondu enchaîné (~0,5 s) :
  le son ne se coupe jamais lors des mises à jour ou des actions.
