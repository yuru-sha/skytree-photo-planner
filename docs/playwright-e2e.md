# Playwright E2E tests

The repository has two Playwright runs. The default run checks mocked browser smoke behavior without a database. The dedicated integration run starts the real backend and checks authenticated admin workflows against isolated PostgreSQL and Redis services.

## Run browser smoke tests

Install dependencies, build workspace packages, install Chromium, and run the default suite:

```sh
npm ci
npm run build:packages
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e:ui` opens the smoke suite in Playwright UI. The smoke config starts only Vite on port 5173 and keeps the existing mocks and optional API boundary test behavior.

The smoke suite also includes optional real-backend auth boundary probes, skipped unless `E2E_API_BASE_URL` points to a disposable backend. Never point that probe at production.

## Run real backend integration tests

The integration config owns database migration and account lifecycle. Supply disposable PostgreSQL and Redis services and test-only environment values. Set `E2E_TEST_DATABASE=1` to authorize this mutation-capable run. The lifecycle helper accepts only the `skytree_e2e_test` database on `127.0.0.1` and rejects PostgreSQL URL query or hash overrides.

```sh
export E2E_TEST_DATABASE=1
export NODE_ENV=production
export DATABASE_URL=postgresql://e2e:e2e-only-password@127.0.0.1:5432/skytree_e2e_test
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
export E2E_ADMIN_PASSWORD='local-only-browser-password'
export E2E_PASSWORD_ADMIN_PASSWORD='local-only-password-admin-password'
npm run build:packages
npm run test:e2e:integration
```

The PostgreSQL database and Redis instance must be disposable and dedicated to this run. The integration config builds the backend, runs `prisma migrate deploy`, and seeds its named test admins before starting the backend. It starts the backend on port 3001 and Vite on port 5173, then waits for `/api/health` and the Vite URL. The backend connects to Redis for BullMQ. The integration suite disables retries because the password-change case deliberately invalidates its own starting password.

The seed helper creates or updates only `e2e-browser-admin` and `e2e-password-admin`. It never deletes existing admins or other data. Global teardown deletes only those two named test admins and their refresh tokens. Each location test tracks its unique location names and removes matching rows in fixture teardown, including after assertion failures. Destroy the disposable database and Redis instance after the run as the final cleanup boundary.

The browser admin owns UI login, protected route and API access, logout, location CRUD, and import/export tests. The separate password admin owns password-change testing. Two isolated browser contexts log in before the password change; the test proves that the second context can refresh before the change and cannot afterward. Password change revokes refresh tokens, but previously issued access JWTs remain valid until their 24-hour maximum lifetime. Refresh tokens have a seven-day lifetime.

The `browser-smoke` job continues to run the default config. A separate integration job provisions ephemeral PostgreSQL and Redis services, masks its static test-only credentials, applies migrations through integration setup, and runs the dedicated config without repository secrets or production URLs. Failed integration runs upload actionable screenshots and traces only after the sanitizer redacts credentials, request bodies, cookies, and tokens. If redaction fails, the workflow does not upload the artifacts. Before sharing local integration artifacts, run `node scripts/testing/sanitize-e2e-artifacts.mjs`. Keep credentials, environment files, and database dumps out of logs and artifacts.
