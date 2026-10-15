import { expect, test } from "playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/auth/verify") {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    } else if (pathname === "/api/auth/login") {
      await route.fulfill({ status: 401, json: { success: false, message: "認証に失敗しました" } });
    } else if (pathname === "/api/locations") {
      await route.fulfill({ json: { locations: [] } });
    } else if (/^\/api\/calendar\/\d+\/\d+$/.test(pathname)) {
      const [, , , year, month] = pathname.split("/");
      await route.fulfill({ json: { year: Number(year), month: Number(month), events: [] } });
    } else if (pathname.startsWith("/api/events/")) {
      await route.fulfill({ json: { events: [] } });
    } else {
      await route.fulfill({ status: 404, json: { error: "Unmocked API endpoint" } });
    }
  });
});

test("public navigation exposes accessible link names at mobile and desktop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    for (const name of ["ホーム", "地図検索", "お気に入り", "管理"]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible({ timeout: 1_000 });
    }
  }
});

test("mobile public navigation links work with keyboard activation", async ({ page }) => {
  await page.goto("/");
  const links = page.getByRole("navigation").getByRole("link");
  const homeLink = links.nth(0);
  const mapLink = links.nth(1);
  await homeLink.focus();
  await expect(homeLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(mapLink).toBeFocused();
  expect(await mapLink.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/map-search$/);
});

test("login form follows keyboard order and announces failed submission", async ({ page }) => {
  await page.goto("/admin/login");
  const username = page.getByRole("textbox", { name: "ユーザー名" });
  const password = page.getByLabel("パスワード");
  const submit = page.getByRole("button", { name: "ログイン" });

  await username.focus();
  await expect(username).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  expect(await password.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();

  await username.fill("invalid-user");
  await password.fill("invalid-password");
  await password.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("認証に失敗しました")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("認証に失敗しました", { timeout: 1_000 });
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(password).toBeFocused();
});

test("favorites import dialog exposes an accessible modal", async ({ page }) => {
  await page.goto("/favorites");
  const opener = page.getByRole("button", { name: "インポート", exact: true });
  await opener.focus();
  await page.keyboard.press("Space");

  await expect(page.getByRole("dialog", { name: "データインポート" })).toBeVisible({ timeout: 1_000 });
});

test("favorites import dialog moves focus inside when opened", async ({ page }) => {
  await page.goto("/favorites");
  const opener = page.getByRole("button", { name: "インポート", exact: true });
  await opener.focus();
  await page.keyboard.press("Space");

  const jsonInput = page.getByPlaceholder("JSON 形式のデータを貼り付けてください");
  await expect(jsonInput).toBeFocused({ timeout: 1_000 });
});

test("favorites import dialog closes on Escape", async ({ page }) => {
  await page.goto("/favorites");
  const opener = page.getByRole("button", { name: "インポート", exact: true });
  await opener.focus();
  await page.keyboard.press("Space");

  const heading = page.getByRole("heading", { name: "データインポート" });
  await expect(heading).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(heading).toBeHidden({ timeout: 1_000 });
});

test("favorites import dialog restores focus after cancel", async ({ page }) => {
  await page.goto("/favorites");
  const opener = page.getByRole("button", { name: "インポート", exact: true });
  await opener.focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "キャンセル" }).click();

  const heading = page.getByRole("heading", { name: "データインポート" });
  await expect(heading).toBeHidden();
  await expect(opener).toBeFocused({ timeout: 1_000 });
});

test("favorites import dialog cancel button closes the dialog", async ({ page }) => {
  await page.goto("/favorites");
  const opener = page.getByRole("button", { name: "インポート", exact: true });
  await opener.focus();
  await page.keyboard.press("Space");

  const heading = page.getByRole("heading", { name: "データインポート" });
  await expect(heading).toBeVisible();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(heading).toBeHidden();
});

test("favorites import dialog traps Tab at both ends and names the close button", async ({ page }) => {
  await page.goto("/favorites");
  const opener = page.getByRole("button", { name: "インポート", exact: true });
  await opener.focus();
  await page.keyboard.press("Space");

  const dialog = page.getByRole("dialog", { name: "データインポート" });
  const close = dialog.getByRole("button", { name: "閉じる" });
  const importButton = dialog.getByRole("button", { name: "インポート" });
  await dialog.getByPlaceholder("JSON 形式のデータを貼り付けてください").fill("{}");

  await expect(close).toBeVisible();
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(importButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
});

test("favorites import dialog closes from the named close button and restores focus", async ({ page }) => {
  await page.goto("/favorites");
  const opener = page.getByRole("button", { name: "インポート", exact: true });
  await opener.focus();
  await page.keyboard.press("Space");

  const dialog = page.getByRole("dialog", { name: "データインポート" });
  await dialog.getByRole("button", { name: "閉じる" }).click();

  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
