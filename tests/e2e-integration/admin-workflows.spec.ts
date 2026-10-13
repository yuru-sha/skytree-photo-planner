import { readFile } from "node:fs/promises";
import { expect, test as base } from "playwright/test";
import type { Page } from "playwright/test";

const browserAdmin = {
  username: "e2e-browser-admin",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
};
const passwordAdmin = {
  username: "e2e-password-admin",
  password: process.env.E2E_PASSWORD_ADMIN_PASSWORD ?? "",
};
const apiBase = "http://127.0.0.1:3001";
const testClientAddress = (octet: number, retry: number): string =>
  `198.51.100.${octet + retry * 10}`;

type LocationCleanup = {
  track: (name: string) => void;
};

const test = base.extend<{ locationCleanup: LocationCleanup }>({
  locationCleanup: async ({ page }, runTest) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.190" });
    await page.goto("/admin/login");
    const login = await page.evaluate(async (credentials) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials),
      });
      return response.ok;
    }, { username: browserAdmin.username, password: browserAdmin.password });
    if (!login) throw new Error("Could not create the test-only location cleanup session.");
    const names = new Set<string>();
    let testError: unknown;
    try {
      await runTest({ track: (name) => names.add(name) });
    } catch (error) {
      testError = error;
    }
    const cleaned = await page.evaluate(async (locationNames) => {
      const response = await fetch("/api/admin/locations", { credentials: "include" });
      if (!response.ok) return false;
      const result = await response.json() as { locations: Array<{ id: number; name: string }> };
      const rowsToDelete = result.locations.filter((location) => locationNames.includes(location.name));
      const deletions = await Promise.all(rowsToDelete.map(({ id }) =>
        fetch(`/api/admin/locations/${id}`, { method: "DELETE", credentials: "include" }),
      ));
      return deletions.every((deletion) => deletion.ok);
    }, [...names]);
    if (!cleaned) throw new Error("Could not clean up the locations created by the test.");
    if (testError !== undefined) throw testError;
  },
});

test.describe.configure({ mode: "serial" });

test("admin can log in, use protected routes and API, then log out", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": testClientAddress(1, test.info().retry),
  });
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "ユーザー名" }).fill(browserAdmin.username);
  await page.locator('input[name="password"]').fill(browserAdmin.password);
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: /撮影地点管理/ }).click();
  await expect(page.getByRole("heading", { name: "撮影地点管理" })).toBeVisible();
  const authorized = await browserApi<{ success: boolean }>(page, "/api/admin/locations");
  expect(authorized.status).toBe(200);
  expect(authorized.body.success).toBe(true);

  await page.getByRole("button", { name: /admin/ }).click();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);

  const denied = await page.request.get(`${apiBase}/api/admin/locations`);
  expect([401, 403]).toContain(denied.status());
});

test("password change rejects refresh from another pre-change session", async ({ browser, playwright, page }) => {
  const changedPassword = `${passwordAdmin.password}-changed`;
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": testClientAddress(2, test.info().retry),
  });
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "ユーザー名" }).fill(passwordAdmin.username);
  await page.locator('input[name="password"]').fill(passwordAdmin.password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const secondContext = await browser.newContext({ baseURL: "http://127.0.0.1:5173" });
  const secondPage = await secondContext.newPage();
  try {
    await secondPage.context().setExtraHTTPHeaders({
      "x-forwarded-for": testClientAddress(3, test.info().retry),
    });
    await secondPage.goto("/admin/login");
    await secondPage.getByRole("textbox", { name: "ユーザー名" }).fill(passwordAdmin.username);
    await secondPage.locator('input[name="password"]').fill(passwordAdmin.password);
    await secondPage.getByRole("button", { name: "ログイン" }).click();
    await expect(secondPage).toHaveURL(/\/admin$/);
    const activeRefresh = await secondPage.evaluate(async () => {
      const response = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      return response.status;
    });
    expect(activeRefresh).toBe(200);

    await page.getByRole("button", { name: /admin/ }).click();
    await page.getByRole("button", { name: "パスワード変更" }).click();
    await page.getByPlaceholder("現在のパスワードを入力").fill(passwordAdmin.password);
    await page.getByPlaceholder("6 文字以上で入力").fill(changedPassword);
    await page.getByPlaceholder("もう一度入力してください").fill(changedPassword);
    let passwordChangeAlert = "";
    page.once("dialog", async (dialog) => {
      passwordChangeAlert = dialog.message();
      await dialog.accept();
    });
    await page.getByRole("button", { name: "変更する" }).click();
    await expect.poll(() => passwordChangeAlert).toContain("パスワードを変更しました");
    await expect(page.getByRole("heading", { name: "パスワード変更" })).toHaveCount(0);

    const staleRefresh = await secondPage.evaluate(async () => {
      const response = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      return response.status;
    });
    expect(staleRefresh).toBe(401);

    const newLogin = await playwright.request.newContext({
      baseURL: apiBase,
      extraHTTPHeaders: {
        "x-forwarded-for": testClientAddress(4, test.info().retry),
      },
    });
    try {
      const accepted = await newLogin.post("/api/auth/login", {
        data: { username: passwordAdmin.username, password: changedPassword },
      });
      expect(accepted.status()).toBe(200);
    } finally {
      await newLogin.dispose();
    }
  } finally {
    await secondContext.close();
  }
});

test("location create, edit and delete persist through the admin UI", async ({ page, locationCleanup }) => {
  const suffix = crypto.randomUUID();
  const initialName = `E2E UI ${suffix}`;
  const updatedName = `${initialName} edited`;
  locationCleanup.track(initialName);
  locationCleanup.track(updatedName);

  await loginAndOpenLocations(page, 5);
  await page.getByRole("button", { name: "新規地点追加" }).click();
  await page.getByRole("textbox", { name: "地点名", exact: true }).fill(initialName);
  await page.getByLabel("都道府県").selectOption("東京都");
  await page.getByLabel("緯度").fill("35.71");
  await page.getByLabel("経度").fill("139.81");
  await page.getByPlaceholder("1000.5").fill("25");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByText(initialName, { exact: true })).toBeVisible();

  let locations = (await browserApi<{ locations: Array<{ id: number; name: string }> }>(page, "/api/admin/locations")).body.locations;
  const created = locations.find((location) => location.name === initialName);
  expect(created).toBeTruthy();
  if (!created) throw new Error("Created location is absent from the backend list.");

  const row = page.getByRole("row", { name: new RegExp(initialName) });
  await row.getByRole("button", { name: "編集" }).click();
  await page.getByRole("textbox", { name: "地点名", exact: true }).fill(updatedName);
  await page.getByRole("button", { name: "更新" }).click();
  await expect(page.getByText(updatedName, { exact: true })).toBeVisible();
  locations = (await browserApi<{ locations: Array<{ id: number; name: string }> }>(page, "/api/admin/locations")).body.locations;
  expect(locations.some((location) => location.id === created.id && location.name === updatedName)).toBe(true);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("row", { name: new RegExp(updatedName) }).getByRole("button", { name: "削除" }).click();
  await expect(page.getByText(updatedName, { exact: true })).toHaveCount(0);
  locations = (await browserApi<{ locations: Array<{ id: number; name: string }> }>(page, "/api/admin/locations")).body.locations;
  expect(locations.some((location) => location.id === created.id)).toBe(false);
});

test("location import and export move deterministic data through the UI", async ({ page, locationCleanup }) => {
  const suffix = crypto.randomUUID();
  const importedName = `E2E import ${suffix}`;
  locationCleanup.track(importedName);

  await loginAndOpenLocations(page, 6);
  const fixture = [{
    name: importedName,
    prefecture: "東京都",
    latitude: 35.72,
    longitude: 139.82,
    elevation: 18,
    description: "integration fixture",
    distanceToSkytree: 1500,
    azimuthToSkytree: 90,
    elevationToSkytree: 10,
  }];
  let importAlert = "";
  page.once("dialog", async (dialog) => {
    importAlert = dialog.message();
    await dialog.accept();
  });
  await page.locator("#import-file").setInputFiles({
    name: "locations.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect.poll(() => importAlert).toContain("インポートが完了しました");
  await expect(page.getByText(importedName, { exact: true })).toBeVisible();

  const locations = (await browserApi<{ locations: Array<{ name: string; description: string }> }>(page, "/api/admin/locations")).body.locations;
  expect(locations.some((location) => location.name === importedName && location.description === "integration fixture")).toBe(true);

  const exportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "エクスポート" }).click();
  const download = await exportPromise;
  expect(download.suggestedFilename()).toMatch(/^locations_export_.*\.json$/);
  const exported = JSON.parse(await readFile(await download.path(), "utf8")) as Array<{ name: string; description: string }>;
  expect(exported.some((location) => location.name === importedName && location.description === "integration fixture")).toBe(true);
});

async function browserApi<T>(page: Page, path: string): Promise<{ status: number; body: T }> {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return { status: response.status, body: await response.json() };
  }, path);
}

async function loginAndOpenLocations(page: Page, clientAddressOctet: number): Promise<void> {
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": testClientAddress(clientAddressOctet, test.info().retry),
  });
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "ユーザー名" }).fill(browserAdmin.username);
  await page.locator('input[name="password"]').fill(browserAdmin.password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: /撮影地点管理/ }).click();
  await expect(page.getByRole("heading", { name: "撮影地点管理" })).toBeVisible();
}
