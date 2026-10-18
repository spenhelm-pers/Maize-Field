# Maize Defense

Puzzle game and installable PWA. Place limited fences so the pig's shortest route to the corn crib is as long as possible. 21 fields plus a daily field (mud = 2x steps, ice = no turning, two-pig fields).

## Develop

Requires Node 20 or newer (`.nvmrc` pins 22).

```
npm install
npm run dev       # local dev server with hot reload
npm test          # unit tests for the game logic (Node's built-in runner)
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

## Layout

- `index.html`: page shell
- `src/core.js`: pure game logic (seeded level generation, router, daily field). No DOM, so it is unit tested.
- `src/main.js`: rendering, input, scoring, saved records
- `src/styles.css`: styles
- `public/`: app icons
- `vite.config.js`: Vite build; `vite-plugin-pwa` generates the web manifest and the offline service worker
- `tests/`: tests for `src/core.js`

## Deploy

`.github/workflows/ci.yml` runs the tests and the build on every push and pull request, and on pushes to `main` it deploys `dist/` to GitHub Pages. One-time setup: in the repo's Settings > Pages, set Source to "GitHub Actions". Assets use relative URLs, so the build works at a domain root or under the project path.

## Game notes

- Ice junction fields (16, 19, 20, 21): one ice square with rocks on its four corners; seeds pinned so the best layout crosses it twice.
- Scoring: more steps wins. Daily field only: faster time breaks ties; clock is wall-clock and cannot be paused.
- Saved scores are keyed to a field's layout signature, so changing a field's definition in `src/core.js` resets its record (see `CHANGED` and `sigOf` in `src/main.js`).
- Original live version: private artifact https://claude.ai/artifact/NBD5BViMUi4cm346zeZecV (version 6).
