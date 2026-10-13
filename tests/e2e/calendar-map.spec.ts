import { expect, test } from "playwright/test";

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
