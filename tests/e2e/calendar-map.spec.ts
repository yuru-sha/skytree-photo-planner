import { expect, test } from "playwright/test";

test("rapid calendar month changes keep the last selected month visible", async ({ page }) => {
  const calendarRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/^\/api\/calendar\/(\d+)\/(\d+)$/);
    if (match) {
      calendarRequests.push(`${match[1]}-${match[2]}`);
      await route.fulfill({ json: { year: Number(match[1]), month: Number(match[2]), events: [] } });
    } else if (url.pathname === "/api/locations") {
      await route.fulfill({ json: { locations: [] } });
    } else if (url.pathname.startsWith("/api/events/")) {
      await route.fulfill({ json: { events: [] } });
    } else {
      await route.fulfill({ status: 404, json: {} });
    }
  });

  await page.goto("/");
  const month = page.locator("h2").filter({ hasText: /^\d{4}年\d{1,2}月$/ });
  await expect(month).toBeVisible();
  const initial = await month.textContent();
  const nextMonthButton = month.locator("..").locator("button").last();
  await nextMonthButton.click();
  await nextMonthButton.click();
  await expect(month).not.toHaveText(initial ?? "");
  await expect.poll(() => new Set(calendarRequests).size).toBeGreaterThanOrEqual(2);
});

test("map search opens with instructions before a location is selected", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: { locations: [], events: [] } }));
  await page.goto("/map-search");
  await expect(page.getByRole("heading", { name: "地図検索" })).toBeVisible();
  await expect(page.getByText("住所検索または地図をクリックして地点を指定")).toBeVisible();
  await expect(page.getByText("検索条件を設定", { exact: true }).first()).toBeVisible();
});
