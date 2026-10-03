---
name: verify-skytree-photo-planner
description: "Verify the Skytree Photo Planner's real React web UI in Chromium; use when changing calendar planning, map-based shooting-location search, or favorites."
---

# Verify Skytree Photo Planner

The primary user surface is the React/Vite web UI. The repository also has an Express API, a background worker, admin routes, and PostgreSQL/Redis services; those are not required for the isolated favorites route covered by the executable proof below. Read [the feature map](./features/README.md) before selecting a flow.

## Launch

Prerequisite: Node.js 18+ and the repository's npm dependencies installed. The client build was verified with `npm run build --workspace=apps/client`.

Start a dedicated Vite instance on port 4173. Use a managed long-running shell/service owned by this verification run; name it `verify-skytree-client` and wait until `http://127.0.0.1:4173/` responds. The exact command:

```sh
npm run dev --workspace=apps/client -- --host 127.0.0.1 --port 4173 --strictPort
```

The `--strictPort` flag makes startup fail rather than silently sharing a different port. Do not drive an already-running server or another agent's instance. The app title is `スカイツリー撮影プランナー`; `/favorites` is a client-side route. Favorites are stored in browser localStorage under `skytree-photo-planner-favorites`; the favorite import/export path needs no API, database, or seed data. Calendar API-dependent interactions require the backend and its data services; see the feature map.

## Doctor

Run before driving if startup, routing, or page behavior is unexpected. First confirm the managed service started by this run is still live. Then check the exact port and Vite response:

```sh
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4173/
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4173/@vite/client
lsof -nP -iTCP:4173 -sTCP:LISTEN
```

Both HTTP responses must be `200`; the listener must be the Vite process belonging to this run's managed service. Open `/favorites` in the browser and require the title `スカイツリー撮影プランナー` and heading `お気に入り管理`. If another process already owns 4173, stop: do not use or terminate it. Launch the run on another free port only after updating all URLs consistently for that run.

The managed shell may report `starting` for more than 60 s while Vite finishes its cold bundle. If both endpoints above already return `200`, keep waiting past the 60 s readiness cap. Only escalate if HTTP still fails after a 120 s wait or `lsof` shows no listener owned by this run.

## Drive

Use the host's managed Chromium browser, not a pre-existing user tab. Open `http://127.0.0.1:4173/favorites` at a desktop viewport (1440×1000). Use visible UI controls and accessible names. The real proof recipe is in [Favorites](./features/favorites.md). Its main flow imports one disposable saved location through the visible import dialog, checks the rendered saved location and stored value, then clears the test data through the UI.

Do not inject React state, call application services from the page, or use test-only endpoints. Browser storage may be inspected read-only to prove persistence. Start from an empty, disposable browser origin; if the browser context already has this app's data, use a fresh isolated context or stop rather than clearing a user's favorites.

## Evidence

Keep proof under `artifacts/verify-skytree-photo-planner/<run-id>/`; use a unique run ID and retain evidence after teardown. For the feature proof, capture:

- `actions.json`: ordered user actions, visible observations, URL, and the final assertion result.
- `favorites.aria.txt`: accessibility snapshot showing the imported location.
- `favorites.webp`: screenshot showing the app identity, the `保存地点` tab, and the imported location.
- `storage-before-cleanup.json` and `storage-after-cleanup.json`: read-only snapshots of `skytree-photo-planner-favorites` before and after UI cleanup.

Exercise the actual user path, and capture both action and result—not only a final screen. Verify the side effect in localStorage as well as the visible saved location. Do not substitute direct storage writes for the import UI. Keep mocks only at production boundaries that already isolate an external system. If another feature uses a dry-run/test mode, observe the effects it skips (filesystem, network, or process state); do not trust its label.

## Cleanup

Remove the disposable favorite via the app's `全削除` UI and accept its confirmation only after checking that the isolated test context contains no other data. Confirm the visible counters return to zero and localStorage contains empty `locations` and `events` arrays. Close only the browser tab/context opened by this run. Stop only the managed Vite service started by this run (send Ctrl+C to that service or use its managed process handle); never kill processes by name or terminate a listener you did not start. Remove only run-specific scratch state. Preserve `artifacts/verify-skytree-photo-planner/<run-id>/` as evidence after cleanup.
