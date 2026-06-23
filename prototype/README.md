# Prototype (current version)

The complete single-file web app. This is the current version of Reverie.

## Run it
Open `Reverie_Library.html` in any modern browser. It's fully self-contained — your
library is saved in the browser's local storage. Export a backup from Settings now and
then.

## Files
- `Reverie_Library.html` — built, runnable app (book data already injected).
- `lib_template.html` — source template; book data is injected into the
  `/*__SEED__*/[]` placeholder at build time.
- `build/build.mjs` — the build step.

## Rebuild after editing the template
```bash
node build/build.mjs
```
This reads `../data/personal_seed.json` and writes the built HTML. (Validate JS with
`node --check` on the extracted script before shipping.)

## Note
This prototype is the reference for the upcoming front-end/back-end rebuild — see
`../docs/ARCHITECTURE.md`. It is not the long-term codebase.
