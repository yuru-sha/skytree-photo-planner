import { expect, test, type Page } from "playwright/test";

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
  type: "diamond" | "pearl";
  subType: "sunrise" | "rising";
  time: string;
  location: FixtureLocation;
  azimuth: number;
  elevation: number;
  accuracy: "excellent" | "good";
};

type WindowOpenCall = { url: string; target: string };

declare global {
  interface Window {
    __openCalls: WindowOpenCall[];
  }
}

const eventDate = new Date();
eventDate.setDate(1);
eventDate.setMonth(eventDate.getMonth() + 1);
const fixtureDate = [
  eventDate.getFullYear(),
  String(eventDate.getMonth() + 1).padStart(2, "0"),
  "15",
].join("-");
const fixtureLocation: FixtureLocation = {
  id: 107,
  name: "Issue 107 Sumida Riverside Viewpoint",
  prefecture: "Tokyo",
  latitude: 35.7101,
  longitude: 139.8107,
  elevation: 20,
  azimuthToSkytree: 45,
  elevationToSkytree: 2,
  distanceToSkytree: 100,
  status: "active",
  createdAt: `${fixtureDate}T00:00:00.000Z`,
  updatedAt: `${fixtureDate}T00:00:00.000Z`,
};
const fixtureEvent: FixtureEvent = {
  id: "issue-107-diamond-sunrise-event",
  type: "diamond",
  subType: "sunrise",
  time: `${fixtureDate}T06:30:00.000Z`,
  location: fixtureLocation,
  azimuth: 45,
  elevation: 2,
  accuracy: "excellent",
};

const fixtureSecondEvent: FixtureEvent = {
  id: "issue-107-pearl-rising-event",
  type: "pearl",
  subType: "rising",
  time: `${fixtureDate}T07:30:00.000Z`,
  location: fixtureLocation,
  azimuth: 45,
  elevation: 3,
  accuracy: "good",
};

async function blockExternalRequests(page: Page) {
  await page.route("https://**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "nominatim.openstreetmap.org") {
      return route.fulfill({
        json: { address: { state: "東京都", city: "墨田区", suburb: "向島" } },
      });
    }
    return route.fulfill({ status: 204, body: "" });
  });
}

async function mockApi(page: Page, locations: FixtureLocation[] = [fixtureLocation]) {
  await blockExternalRequests(page);
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/locations") {
      await route.fulfill({ json: { locations } });
      return;
    }
    const dayMatch = pathname.match(/^\/api\/events\/(\d{4}-\d{2}-\d{2})$/);
    if (dayMatch) {
      const events =
        dayMatch[1] === fixtureDate
          ? [fixtureEvent, fixtureSecondEvent]
          : [];
      await route.fulfill({ json: { events } });
      return;
    }
    const match = pathname.match(/^\/api\/calendar\/(\d+)\/(\d+)$/);
    if (match) {
      const [, year, month] = match;
      const [fixtureYear, fixtureMonth] = fixtureDate.split("-").map(Number);
      const isFixtureMonth =
        Number(year) === fixtureYear && Number(month) === fixtureMonth;
      await route.fulfill({
        json: {
          year: Number(year),
          month: Number(month),
          events: isFixtureMonth
            ? [{
                date: `${fixtureDate}T00:00:00.000Z`,
                type: "both",
                events: [fixtureEvent, fixtureSecondEvent],
              }]
            : [],
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "Unmocked API endpoint" } });
  });
}

async function seedFavoriteLocation(page: Page) {
  await page.addInitScript(({ location }) => {
    localStorage.setItem(
      "skytree-photo-planner-favorites",
      JSON.stringify({ locations: [{ ...location, addedAt: "2099-06-01T00:00:00.000Z" }], events: [] }),
    );
  }, { location: fixtureLocation });
}

async function expectLocationDetail(page: Page) {
  await expect(page.getByRole("heading", { name: fixtureLocation.name })).toBeVisible();
  await expect(page.getByText(/ダイヤモンドスカイツリー\s*\(昇る\)/)).toBeVisible();
  const [year, month, day] = fixtureDate.split("-").map(Number);
  const eventDates = page.getByText(`${year}年${month}月${day}日`, { exact: false });
  await expect(eventDates).toHaveCount(2);
  await expect(eventDates.first()).toBeVisible();
  await expect(eventDates.nth(1)).toBeVisible();
}

test("opens location detail from favorites and displays its exact future event", async ({ page }) => {
  await mockApi(page);
  await seedFavoriteLocation(page);
  await page.goto("/favorites");
  await page.getByRole("button", { name: "保存地点" }).click();
  await expect(page.getByText(fixtureLocation.name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "詳細", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/location/${fixtureLocation.id}$`));
  await expectLocationDetail(page);
});

test("loads location detail directly on initial navigation and reload", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/location/${fixtureLocation.id}`);
  await expectLocationDetail(page);
  await page.reload();
  await expectLocationDetail(page);
});

test("opens directions in a new tab with the fixture coordinates", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => {
    const openCalls: Array<{ url: string; target: string }> = [];
    Object.defineProperty(window, "__openCalls", {
      value: openCalls,
      configurable: false,
    });
    window.open = (url, target) => {
      openCalls.push({ url: String(url), target: String(target) });
      return null;
    };
  });
  await page.goto(`/location/${fixtureLocation.id}`);
  await expect(page.getByRole("heading", { name: fixtureLocation.name })).toBeVisible();
  await page.getByRole("button", { name: "経路案内" }).click();
  const openCalls = await page.evaluate(() => window.__openCalls);
  expect(openCalls).toEqual([
    {
      url: `https://www.google.com/maps/dir/?api=1&destination=${fixtureLocation.latitude},${fixtureLocation.longitude}`,
      target: "_blank",
    },
  ]);
});

test("event detail navigates to the selected fixture date and event", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/location/${fixtureLocation.id}`);
  await expect(page.getByRole("heading", { name: fixtureLocation.name })).toBeVisible();
  await page.getByRole("button", { name: "詳細を見る" }).nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/\\?date=${fixtureDate}$`));
  const navigationState = await page.evaluate(() => window.history.state?.usr);
  expect(navigationState).toMatchObject({
    selectedLocationId: fixtureLocation.id,
    selectedEventId: fixtureSecondEvent.id,
  });
  await expect(page.getByRole("heading", { name: "スカイツリー撮影プランナー" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: `${eventDate.getFullYear()}年${eventDate.getMonth() + 1}月15日の撮影情報`,
    }),
  ).toBeVisible();
  await expect(page.getByText(fixtureLocation.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("地図表示中", { exact: true })).toBeVisible();
  await expect(page.getByText("昇るパールスカイツリー", { exact: true })).toBeVisible();
  await expect(page.getByText("昇るダイヤモンドスカイツリー", { exact: true })).toBeVisible();
  await expect(page.getByText("ダイヤモンドスカイツリー", { exact: true }).first()).toBeVisible();
});

test("shows the not-found presentation for nonexistent and nonnumeric IDs", async ({ page }) => {
  await mockApi(page, []);
  await page.goto("/location/987654");
  await expect(page.getByRole("heading", { name: "エラー" })).toBeVisible();
  await expect(page.getByText("地点が見つかりませんでした")).toBeVisible();

  await page.goto("/location/not-a-number");
  await expect(page.getByRole("heading", { name: "エラー" })).toBeVisible();
  await expect(page.getByText("地点が見つかりませんでした")).toBeVisible();
});

test("shows the load error when the location API request fails", async ({ page }) => {
  await blockExternalRequests(page);
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/locations") {
      await route.fulfill({ status: 500, json: { error: "Fixture location API failure" } });
    } else {
      await route.fulfill({ status: 404, json: { error: "Unmocked API endpoint" } });
    }
  });
  await page.goto(`/location/${fixtureLocation.id}`);
  await expect(page.getByRole("heading", { name: "エラー" })).toBeVisible();
  await expect(page.getByText("地点情報の読み込みに失敗しました")).toBeVisible();
});
