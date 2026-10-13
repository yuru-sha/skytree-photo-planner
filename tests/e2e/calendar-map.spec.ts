import { expect, test } from "playwright/test";
import type { Page } from "playwright/test";

test("calendar keeps the latest month data when an older request finishes last", async ({ page }) => {
  let releaseStaleResponse!: () => void;
  let staleRequestStarted!: () => void;
  let staleResponseCompleted!: () => void;
  const staleStarted = new Promise<void>((resolve) => {
    staleRequestStarted = resolve;
  });
  const staleCompleted = new Promise<void>((resolve) => {
    staleResponseCompleted = resolve;
  });
  const staleResponseGate = new Promise<void>((resolve) => {
    releaseStaleResponse = resolve;
  });
  let holdNextCalendarResponse = false;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/^\/api\/calendar\/(\d+)\/(\d+)$/);
    if (match) {
      const [, year, month] = match;
      const date = `${year}-${month.padStart(2, "0")}-02T12:00:00.000Z`;
      const event = {
        type: "pearl",
        subType: "rising",
        time: date,
        location: {
          id: 1,
          name: "Fixture location",
          prefecture: "Tokyo",
          latitude: 35.7,
          longitude: 139.8,
          elevation: 10,
          azimuthToSkytree: 0,
          elevationToSkytree: 0,
          distanceToSkytree: 10,
          status: "active",
          createdAt: date,
          updatedAt: date,
        },
        azimuth: 0,
      };
      const response = {
        year: Number(year),
        month: Number(month),
        events: [{
          date,
          type: "pearl",
          events: [
            { ...event, id: `${year}-${month}-first` },
            { ...event, id: `${year}-${month}-second` },
          ],
        }],
      };
      if (holdNextCalendarResponse) {
        holdNextCalendarResponse = false;
        staleRequestStarted();
        await staleResponseGate;
        await route.fulfill({
          json: {
            ...response,
            events: [{
              ...response.events[0],
              events: [{ type: "pearl" }],
            }],
          },
        });
        staleResponseCompleted();
      } else {
        await route.fulfill({ json: response });
      }
    } else if (url.pathname === "/api/locations") {
      await route.fulfill({ json: { locations: [] } });
    } else if (url.pathname.startsWith("/api/events/")) {
      await route.fulfill({ json: { events: [] } });
    } else {
      await route.fulfill({ status: 404, json: {} });
    }
  });

  await page.goto("/");
  const monthHeading = page.locator("h2").filter({ hasText: /^\d{4}年\d{1,2}月$/ });
  await expect(monthHeading).toBeVisible();
  const nextMonthButton = monthHeading.locator("..").locator("button").last();

  holdNextCalendarResponse = true;
  await nextMonthButton.click();
  await staleStarted;
  const staleHeading = await monthHeading.textContent();
  await nextMonthButton.click();
  await expect(monthHeading).not.toHaveText(staleHeading ?? "");
  await expect(page.getByText("2件", { exact: true })).toBeVisible();

  const latestHeading = await monthHeading.textContent();
  releaseStaleResponse();
  await staleCompleted;
  await expect(monthHeading).toHaveText(latestHeading ?? "");
  await expect(page.getByText("2件", { exact: true })).toBeVisible();
});

test("daily events keep the latest selected date when an older request finishes last", async ({ page }) => {
  let releaseStaleDayResponse!: () => void;
  let staleDayRequestStarted!: () => void;
  let staleDayResponseCompleted!: () => void;
  const staleDayStarted = new Promise<void>((resolve) => {
    staleDayRequestStarted = resolve;
  });
  const staleDayCompleted = new Promise<void>((resolve) => {
    staleDayResponseCompleted = resolve;
  });
  const staleDayResponseGate = new Promise<void>((resolve) => {
    releaseStaleDayResponse = resolve;
  });
  let holdNextDayResponse = false;
  let staleDayPath: string | undefined;

  const eventFor = (date: string, locationId: number, locationName: string) => ({
    id: `event-${date}-${locationId}`,
    type: "pearl",
    subType: "rising",
    time: `${date}T07:00:00.000Z`,
    location: {
      id: locationId,
      name: locationName,
      prefecture: "Tokyo",
      latitude: 35.7,
      longitude: 139.8,
      elevation: 10,
      azimuthToSkytree: 0,
      elevationToSkytree: 0,
      distanceToSkytree: 10,
      status: "active",
      createdAt: `${date}T00:00:00.000Z`,
      updatedAt: `${date}T00:00:00.000Z`,
    },
    azimuth: 0,
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const dayMatch = url.pathname.match(/^\/api\/events\/(\d{4}-\d{2}-\d{2})$/);
    if (dayMatch) {
      const [, date] = dayMatch;
      if (holdNextDayResponse) {
        holdNextDayResponse = false;
        staleDayPath = url.pathname;
        staleDayRequestStarted();
        await staleDayResponseGate;
        await route.fulfill({
          json: { events: [eventFor(date, 1, "Stale fixture location")] },
        });
        staleDayResponseCompleted();
      } else {
        await route.fulfill({
          json: { events: [eventFor(date, 2, "Latest fixture location")] },
        });
      }
    } else if (url.pathname === "/api/locations") {
      await route.fulfill({ json: { locations: [] } });
    } else if (url.pathname.startsWith("/api/calendar/")) {
      const [, year, month] = url.pathname.match(/\/api\/calendar\/(\d+)\/(\d+)$/) ?? [];
      await route.fulfill({
        json: { year: Number(year), month: Number(month), events: [] },
      });
    } else if (url.pathname.startsWith("/api/events/")) {
      await route.fulfill({ json: { events: [] } });
    } else {
      await route.fulfill({ status: 404, json: {} });
    }
  });

  await page.goto("/");
  const monthHeading = page.locator("h2").filter({ hasText: /^\d{4}年\d{1,2}月$/ });
  await expect(monthHeading).toBeVisible();
  const calendarDays = monthHeading
    .locator("xpath=../..")
    .locator(".grid.grid-cols-7.gap-1")
    .nth(1);
  const fifteenth = calendarDays.getByRole("button").filter({ hasText: /^15(?:\D|$)/ });
  const sixteenth = calendarDays.getByRole("button").filter({ hasText: /^16(?:\D|$)/ });
  await expect(fifteenth).toHaveCount(1);
  await expect(sixteenth).toHaveCount(1);

  holdNextDayResponse = true;
  await fifteenth.click();
  await staleDayStarted;
  await sixteenth.click();
  await expect(page.getByText("Latest fixture location", { exact: true })).toBeVisible();

  const staleResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === staleDayPath,
  );
  releaseStaleDayResponse();
  await staleDayCompleted;
  await staleResponse;
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.getByText("Latest fixture location", { exact: true })).toBeVisible();
  await expect(page.getByText("Stale fixture location", { exact: true })).toHaveCount(0);
});

test("map search opens with instructions before a location is selected", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: { locations: [], events: [] } }));
  await page.goto("/map-search");
  await expect(page.getByRole("heading", { name: "地図検索" })).toBeVisible();
  await expect(page.getByText("住所検索または地図をクリックして地点を指定")).toBeVisible();
  await expect(page.getByText("検索条件を設定", { exact: true }).first()).toBeVisible();
});

const mapSearchResponse = {
  success: true,
  events: [
    {
      id: "map-search-fixture",
      type: "pearl",
      subType: "rising",
      time: "2027-06-15T20:30:00.000Z",
      azimuth: 90,
      elevation: 12.5,
      accuracy: "excellent",
      qualityScore: 95,
    },
  ],
  searchParams: {},
  metadata: { totalEvents: 1, searchInterval: 60, isLimited: false, originalTotal: 1 },
};

const selectMapLocation = async (page: Page) => {
  await page.goto("/map-search");
  const map = page.locator(".leaflet-container");
  await expect(map).toBeVisible();
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Leaflet map is not visible");
  await map.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(page.getByRole("heading", { name: "撮影地データ" })).toBeVisible();
  await expect(page.getByText("テスト住所", { exact: true })).toHaveCount(2);
  const coordinateValues = page.locator(".grid.grid-cols-4").filter({ hasText: "緯度:" }).locator(".font-medium");
  const latitudeText = await coordinateValues.nth(0).textContent();
  const longitudeText = await coordinateValues.nth(1).textContent();
  await page.locator('input[type="number"]').fill("123.4");
  return {
    latitude: Number(latitudeText?.replace("°", "")),
    longitude: Number(longitudeText?.replace("°", "")),
  };
};

const stubMapSearchDependencies = async (page: Page) => {
  await page.route("https://cyberjapandata.gsi.go.jp/**", (route) => route.abort());
  await page.route("https://raw.githubusercontent.com/**", (route) => route.abort());
  await page.route("https://cdnjs.cloudflare.com/**", (route) => route.abort());
  await page.route("https://mreversegeocoder.gsi.go.jp/**", (route) =>
    route.fulfill({ json: { results: [{ address: "テスト住所" }] } }),
  );

};

test("map click searches with selected location, filters, and ISO dates", async ({ page }) => {
  await stubMapSearchDependencies(page);
  let requestBody: Record<string, unknown> | undefined;
  await page.route("**/api/map-search", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ json: mapSearchResponse });
  });

  const coordinates = await selectMapLocation(page);
  await page.locator("select").nth(0).selectOption("pearl");
  await page.locator("select").nth(1).selectOption("precise");
  await page.locator('input[type="date"]').nth(0).fill("2027-06-01");
  await page.locator('input[type="date"]').nth(1).fill("2027-06-30");
  await page.getByRole("button", { name: "検索実行" }).click();

  await expect(page.getByText("検索結果 (1/1件)")).toBeVisible();
  await expect(page.getByText("昇るパールスカイツリー", { exact: true })).toBeVisible();
  expect(requestBody).toEqual({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    elevation: 123.4,
    scene: "pearl",
    searchMode: "precise",
    startDate: "2027-06-01T00:00:00.000Z",
    endDate: "2027-06-30T00:00:00.000Z",
  });
});

test("map search displays empty results", async ({ page }) => {
  await stubMapSearchDependencies(page);
  await page.route("**/api/map-search", (route) =>
    route.fulfill({
      json: {
        ...mapSearchResponse,
        events: [],
        metadata: { ...mapSearchResponse.metadata, totalEvents: 0, originalTotal: 0 },
      },
    }),
  );
  await selectMapLocation(page);
  await page.getByRole("button", { name: "検索実行" }).click();
  await expect(page.getByText("検索結果がありません")).toBeVisible();
  await expect(page.getByText("指定した条件でダイヤモンド・パールスカイツリーのイベントが見つかりませんでした。")).toBeVisible();
});

test("map search displays its empty-results UI after an API failure", async ({ page }) => {
  await stubMapSearchDependencies(page);
  await page.route("**/api/map-search", (route) => route.fulfill({ status: 500, json: { message: "fixture failure" } }));
  await selectMapLocation(page);
  await page.getByRole("button", { name: "検索実行" }).click();
  await expect(page.getByText("検索結果がありません")).toBeVisible();
});
