# Régénérer `strudel-web.js`

`assets/vendor/strudel-web.js` n'est **pas** le dist officiel de `@strudel/web`. C'est un
bundle maison reconstruit depuis les packages **granulaires** de Strudel + `@strudel/soundfonts`.

## Pourquoi un rebuild maison ?

Le dist publié de `@strudel/web` est lui-même pré-bundlé : il **inline** sa propre copie de
`@strudel/core` et `@strudel/webaudio`, et son prebake **exclut volontairement** les soundfonts
(`/* , registerSoundfonts() */` est commenté dans la source). Conséquence :

- charger `@strudel/soundfonts` à côté (CDN ou bundle) crée une **2ᵉ** instance du registre de sons ;
- `registerSoundfonts()` enregistre alors les `gm_*` dans un registre que `evaluate()` ne lit jamais ;
- → `sound gm_pad_choir not found`, etc.

En repartant des packages granulaires, **une seule** instance de `@strudel/core` / `@strudel/webaudio`
est partagée par le moteur et par les soundfonts. Les `gm_*` sont donc trouvés.

## Versions figées

| package | version |
|---|---|
| @strudel/core | 1.2.6 |
| @strudel/webaudio | 1.3.0 |
| @strudel/mini | 1.2.6 |
| @strudel/tonal | 1.2.6 |
| @strudel/transpiler | 1.2.6 |
| @strudel/soundfonts | 1.3.0 |

Garder ces versions **cohérentes** entre elles (mêmes que les `dependencies` de `@strudel/web@1.3.0`).

## Commandes

```bash
mkdir strudel-build && cd strudel-build
npm init -y
npm i @strudel/core @strudel/webaudio @strudel/mini @strudel/tonal @strudel/transpiler @strudel/soundfonts esbuild
# coller entry.mjs (ci-dessous) puis :
npx esbuild entry.mjs --bundle --format=iife --platform=browser --target=es2020 \
  --minify --legal-comments=none --outfile=strudel-web.js
# remettre la bannière en tête, puis copier strudel-web.js dans assets/vendor/
```

## `entry.mjs` (réplique fidèle de `initStrudel` de @strudel/web 1.3.0, soundfonts activées)

```js
import { Pattern, evalScope, setTime } from '@strudel/core';
import { initAudio, initAudioOnFirstClick, registerSynthSounds, webaudioRepl, samples, getAudioContext } from '@strudel/webaudio';
import { registerSoundfonts } from '@strudel/soundfonts';
import { transpiler } from '@strudel/transpiler';
import { miniAllStrings } from '@strudel/mini';

async function defaultPrebake() {
  const loadModules = evalScope(
    evalScope,
    import('@strudel/core'),
    import('@strudel/mini'),
    import('@strudel/tonal'),
    import('@strudel/webaudio'),
    { hush, evaluate },
  );
  await Promise.all([loadModules, registerSynthSounds(), registerSoundfonts()]);
}

let initDone, repl;
function initStrudel(options = {}) {
  initAudioOnFirstClick();
  options.miniAllStrings !== false && miniAllStrings();
  const { prebake, ...replOptions } = options;
  repl = webaudioRepl({ ...replOptions, transpiler });
  initDone = (async () => { await defaultPrebake(); await prebake?.(); return repl; })();
  setTime(() => repl.scheduler.now());
  return initDone;
}
function hush() { repl && repl.stop(); }
async function evaluate(code, autoplay = true) { return repl.evaluate(code, autoplay); }

Pattern.prototype.play = function () {
  if (!repl) throw new Error('.play: no repl found. Have you called initStrudel?');
  initDone.then(() => repl.setPattern(this, true));
  return this;
};

window.strudel = { initStrudel, initAudio, samples, evaluate, hush, getAudioContext, registerSoundfonts };
```

> `initAudio` est exposé pour pouvoir **attendre** le chargement des AudioWorklets
> (resume du contexte + `addModule`) avant la 1re évaluation — voir l'usage dans
> `assets/audio.js` (`unlock`) et `assets/config.js` (`ensureStrudel`). Sans cette
> attente, le 1er cycle lève `[getTrigger] error: Failed to construct 'AudioWorkletNode'`.

## Notes

- Les **drum machines** (RolandTR909…) et autres banques de samples ne sont **pas** dans ce bundle :
  elles sont chargées au runtime par `samples('…/tidal-drum-machines.json')` (cf. `assets/audio.js`
  et `assets/config.js`).
- Les `.js` de soundfonts sont récupérés paresseusement depuis `felixroos.github.io` au 1er son
  (réseau requis au runtime — OK puisque le jeu est en ligne).
- L'ancien bundle vendored reste récupérable via git : `git show HEAD:assets/vendor/strudel-web.js`.
