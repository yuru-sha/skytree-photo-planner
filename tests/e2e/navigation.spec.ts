import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/locations") {
      await route.fulfill({ json: { locations: [] } });
    } else if (/^\/api\/calendar\/\d+\/\d+$/.test(url.pathname)) {
      const [, , , year, month] = url.pathname.split("/");
      await route.fulfill({ json: { year: Number(year), month: Number(month), events: [] } });
    } else if (url.pathname.startsWith("/api/events/")) {
      await route.fulfill({ json: { events: [] } });
    } else if (url.pathname === "/api/auth/verify") {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    } else {
      await route.fulfill({ status: 404, json: { error: "Unmocked API endpoint" } });
    }
  });
});

test("public navigation reaches home, map search and favorites", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "スカイツリー撮影プランナー" })).toBeVisible();
  await page.getByRole("link", { name: "地図検索" }).click();
  await expect(page).toHaveURL(/\/map-search$/);
  await page.getByRole("link", { name: "お気に入り" }).click();
  await expect(page).toHaveURL(/\/favorites$/);
  await expect(page.getByRole("heading", { name: "お気に入り管理" })).toBeVisible();
});

test("login page renders an accessible form", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "管理者ログイン" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "ユーザー名" })).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
});

test("failed login displays an error without granting access", async ({ page }) => {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 401, json: { success: false, message: "認証に失敗しました" } }),
  );
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "ユーザー名" }).fill("invalid-user");
  await page.locator('input[name="password"]').fill("invalid-password");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByText("認証に失敗しました")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);
});
