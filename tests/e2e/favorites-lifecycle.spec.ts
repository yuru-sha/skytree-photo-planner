import { expect, test, type BrowserContext, type Page } from "playwright/test";

type FixtureLocation = {
  id: number;
  name: string;
  prefecture: string;
  latitude: number;
  longitude: number;
  elevation: number;
  azimuthToSkytree: number;
  elevationToSkytree: number;
  distanceToSkytree: number;
  status: "active";
  createdAt: string;
  updatedAt: string;
};

type FixtureEvent = {
  id: string;
  type: "diamond";
  subType: "sunrise";
  time: string;
  location: FixtureLocation;
  azimuth: number;
  elevation: number;
  accuracy: "excellent";
};

const fixtureDate = "2099-06-15";
const fixtureLocation: FixtureLocation = {
  id: 106,
  name: "Issue 106 fixture viewpoint",
  prefecture: "Tokyo",
  latitude: 35.7101,
  longitude: 139.8107,
  elevation: 20,
  azimuthToSkytree: 0,
  elevationToSkytree: 0,
  distanceToSkytree: 100,
  status: "active",
  createdAt: `${fixtureDate}T00:00:00.000Z`,
  updatedAt: `${fixtureDate}T00:00:00.000Z`,
};
const fixtureEvent: FixtureEvent = {
  id: "issue-106-event",
  type: "diamond",
  subType: "sunrise",
  time: `${fixtureDate}T06:30:00.000Z`,
  location: fixtureLocation,
  azimuth: 45,
  elevation: 2,
  accuracy: "excellent",
};
const secondLocation: FixtureLocation = {
  ...fixtureLocation,
  id: 107,
  name: "Issue 106 second viewpoint",
  latitude: 35.711,
};
const secondEvent: FixtureEvent = {
  ...fixtureEvent,
  id: "issue-106-second-event",
  location: secondLocation,
};
const favoritesKey = "skytree-photo-planner-favorites";

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/locations") {
      await route.fulfill({ json: { locations: [fixtureLocation, secondLocation] } });
    } else if (/^\/api\/calendar\/\d+\/\d+$/.test(pathname)) {
      const [, , , year, month] = pathname.split("/");
      const paddedMonth = month.padStart(2, "0");
      await route.fulfill({
        json: {
          year: Number(year),
          month: Number(month),
          events: [{
            date: `${year}-${paddedMonth}-15T00:00:00.000Z`,
            type: "diamond",
            events: [
              { ...fixtureEvent, time: `${year}-${paddedMonth}-15T06:30:00.000Z` },
              { ...secondEvent, time: `${year}-${paddedMonth}-15T07:30:00.000Z` },
            ],
          }],
        },
      });
    } else if (pathname.startsWith("/api/events/")) {
      const date = pathname.slice("/api/events/".length);
      await route.fulfill({
        json: {
          events: [
            { ...fixtureEvent, time: `${date}T06:30:00.000Z` },
            { ...secondEvent, time: `${date}T07:30:00.000Z` },
          ],
        },
      });
    } else if (pathname === "/api/auth/verify") {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    } else {
      await route.fulfill({ status: 404, json: { error: "Unmocked API endpoint" } });
    }
  });
}

async function selectFixtureDate(page: Page) {
  const monthHeading = page.getByRole("heading", { name: /^\d{4}年\d{1,2}月$/ });
  const calendarResponse = page.waitForResponse((response) =>
    /^\/api\/calendar\/\d+\/\d+$/.test(new URL(response.url()).pathname),
  );
  await monthHeading.locator("..").locator("button").last().click();
  await calendarResponse;
  const dateButton = page.getByRole("button", { name: /^15/ }).filter({ hasText: "2件" });
  await expect(dateButton).toBeVisible();
  await dateButton.click();
}

async function addFixtureFavorites(page: Page) {
  await page.goto("/");
  await selectFixtureDate(page);
  await expect(
    page.getByText(fixtureLocation.name, { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "お気に入り", exact: true }).first().click();
  await page.getByRole("button", { name: "予定に追加", exact: true }).click();
}

async function locationsTab(page: Page) {
  await page.getByRole("button", { name: /^保存地点 \(/ }).click();
}

async function addSecondLocation(page: Page) {
  await page.goto("/");
  await selectFixtureDate(page);
  await expect(page.getByText(secondLocation.name, { exact: true })).toBeVisible();
  await page.getByText(secondLocation.name, { exact: true }).click();
  await page.getByRole("button", { name: "お気に入り", exact: true }).last().click();
  await page.getByRole("button", { name: "予定に追加", exact: true }).click();
}

async function startApp(context: BrowserContext) {
  const page = await context.newPage();
  await mockApi(page);
  return page;
}

test("favorites save from event detail, persist across navigation and reload, and stay isolated by context", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await startApp(context);
    await addFixtureFavorites(page);
    await page.getByRole("link", { name: "お気に入り" }).click();
    await expect(page.getByRole("heading", { name: "昇るダイヤモンドスカイツリー" })).toBeVisible();
    await locationsTab(page);
    await expect(page.getByRole("heading", { name: fixtureLocation.name })).toBeVisible();

    await page.getByRole("link", { name: "地図検索" }).click();
    await page.getByRole("link", { name: "お気に入り" }).click();
    await locationsTab(page);
    await expect(page.getByRole("heading", { name: fixtureLocation.name })).toBeVisible();
    await page.reload();
    await locationsTab(page);
    await expect(page.getByRole("heading", { name: fixtureLocation.name })).toBeVisible();
    await page.getByRole("button", { name: /^今後のイベント \(/ }).click();
    await expect(page.getByRole("heading", { name: "昇るダイヤモンドスカイツリー" })).toBeVisible();

    const isolatedContext = await browser.newContext();
    try {
      const isolatedPage = await startApp(isolatedContext);
      await isolatedPage.goto("/favorites");
      await expect(isolatedPage.getByText("今後のお気に入りイベントはありません")).toBeVisible();
      await locationsTab(isolatedPage);
      await expect(isolatedPage.getByText("お気に入り地点はありません")).toBeVisible();
    } finally {
      await isolatedContext.close();
    }
  } finally {
    await context.close();
  }
});

test("individual removal updates saved locations and events", async ({ page }) => {
  await mockApi(page);
  await addFixtureFavorites(page);
  await addSecondLocation(page);
  await page.goto("/favorites");
  await page.getByRole("button", { name: /^今後のイベント \(/ }).click();
  await page.getByRole("button", { name: "削除", exact: true }).first().click();
  await expect(page.getByText(fixtureLocation.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText(secondLocation.name, { exact: true })).toBeVisible();

  await locationsTab(page);
  await expect(page.getByRole("heading", { name: /Issue 106 .* viewpoint/ })).toHaveCount(2);
  await page.getByRole("button", { name: "削除", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Issue 106 .* viewpoint/ })).toHaveCount(1);
});

test("selected event removal preserves the unselected event", async ({ page }) => {
  await mockApi(page);
  await addFixtureFavorites(page);
  await addSecondLocation(page);
  await page.goto("/favorites");
  await page.getByRole("button", { name: /^今後のイベント \(/ }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await page.getByRole("checkbox").first().check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /^選択削除/ }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByText(fixtureLocation.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText(secondLocation.name, { exact: true })).toBeVisible();
});

test("clear-all can be canceled or confirmed", async ({ page }) => {
  await mockApi(page);
  await addFixtureFavorites(page);
  await page.goto("/favorites");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "全削除", exact: true }).click();
  await expect(page.getByText("今後の撮影イベント")).toBeVisible();
  await expect(page.getByText(fixtureLocation.name, { exact: true })).toBeVisible();
  await locationsTab(page);
  await expect(page.getByRole("heading", { name: fixtureLocation.name })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "全削除", exact: true }).click();
  await expect(page.getByText("お気に入り地点はありません")).toBeVisible();
  await page.getByRole("button", { name: /^今後のイベント \(/ }).click();
  await expect(page.getByText("今後のお気に入りイベントはありません")).toBeVisible();
});

test("exports and imports JSON, and malformed JSON leaves favorites unchanged", async ({ page }) => {
  await mockApi(page);
  page.on("dialog", (dialog) => dialog.accept());
  await addFixtureFavorites(page);
  await page.goto("/favorites");
  const storedBeforeImport = await page.evaluate(
    (key) => localStorage.getItem(key),
    favoritesKey,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "エクスポート", exact: true }).click();
  const download = await downloadPromise;
  const exportedText = await download.createReadStream().then(async (stream) => {
    if (!stream) throw new Error("Export download did not provide a stream");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  });
  const exported = JSON.parse(exportedText) as { locations: FixtureLocation[]; events: Array<{ id: string }> };
  expect(exported.locations.some((location) => location.id === fixtureLocation.id)).toBe(true);
  expect(exported.events.some((event) => event.id === fixtureEvent.id)).toBe(true);

  await locationsTab(page);
  await page.getByRole("button", { name: "インポート", exact: true }).click();
  await page.getByRole("textbox", { name: "JSON 形式のデータを貼り付けてください" }).fill("not valid JSON");
  await page.getByRole("button", { name: "インポート", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: fixtureLocation.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "データインポート" })).toHaveCount(1);
  await expect(
    page.evaluate((key) => localStorage.getItem(key), favoritesKey),
  ).resolves.toBe(storedBeforeImport);

  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByRole("button", { name: "全削除", exact: true }).click();
  await expect(page.getByText("お気に入り地点はありません")).toBeVisible();
  await page.getByRole("button", { name: /^今後のイベント \(/ }).click();
  await expect(page.getByText("今後のお気に入りイベントはありません")).toBeVisible();

  await page.getByRole("button", { name: "インポート", exact: true }).click();
  await page.getByRole("textbox", { name: "JSON 形式のデータを貼り付けてください" }).fill(exportedText);
  await page.getByRole("button", { name: "インポート", exact: true }).last().click();
  await locationsTab(page);
  await expect(page.getByRole("heading", { name: fixtureLocation.name })).toBeVisible();
  await page.getByRole("button", { name: /^今後のイベント \(/ }).click();
  await expect(page.getByRole("heading", { name: "昇るダイヤモンドスカイツリー" })).toBeVisible();
  const stored = await page.context().storageState();
  expect(stored.origins.some((origin) => origin.localStorage.some((entry) => entry.name === favoritesKey))).toBe(true);
});
