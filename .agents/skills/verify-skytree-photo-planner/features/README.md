# Skytree Photo Planner verification map

This map is the maintained source for the app's primary user workflows. The React/Vite client is the primary user surface; the Express API, worker, and admin UI are additional surfaces with external service prerequisites.

## Baseline and driving rules

- Read [`../SKILL.md`](../SKILL.md) before launch. Use only the Vite service started by this run and a disposable browser context.
- The client is at `http://127.0.0.1:4173` for the documented isolated run. `npm run build --workspace=apps/client` builds the UI. The development Vite server proxies `/api` to `http://localhost:3001`.
- The API-backed calendar and map event-search flows need a reachable backend and its database/queue dependencies, plus relevant location/event data. The map page also requests third-party map tiles and can call Nominatim and the Geospatial Information Authority of Japan elevation service. Do not claim those external services were verified unless they were reached.
- Favorites import/export is client-side localStorage; it is the mapped flow that can be driven without backend services or seed data.
- For every map entry point, record the route and sub-feature actually driven. A successful run through one route does not prove alternate entry points.

## Features

- [Calendar planning](./calendar.md): home calendar, month navigation, date selection, and event details.
- [Map search](./map-search.md): select or address-search a shooting location, run a date-range event search, and inspect results.
- [Favorites](./favorites.md): save and manage event/location favorites, import/export, and confirm browser persistence.
