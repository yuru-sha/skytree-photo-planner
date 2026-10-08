# Playwright E2E tests

This suite uses the existing `playwright` dependency and runs Chromium with
a local Vite server. Browser smoke tests mock HTTP API responses at the browser
network boundary, avoiding production data or database requirements.

## Local run

```sh
npm ci
npm run build:packages
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e:ui` opens the Playwright test UI. Reports are written to
`playwright-report/`; failure traces and screenshots are in `test-results/`.

## Real backend authorization test

To validate the **actual** backend rather than mocked browser responses,
start an isolated, disposable environment, then run:

```sh
E2E_API_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

Only use a test database; the security checks send mutation requests to fixed
IDs. They intentionally use invalid/unauthenticated input and require 401, 403
or 404. The test is skipped when the environment variable is missing and is
not enabled in regular CI.

## Scope

CI covers navigation, login form rendering, failed-login feedback, and an
optional real-backend authorization boundary check. It does **not** claim to
cover authenticated administrator CRUD, scheduling, calendar races or actual
astronomy calculations. Those require isolated fixture data and dedicated
backend setup before being added.
