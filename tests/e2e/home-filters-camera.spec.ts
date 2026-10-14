import { expect, test, type Page } from "playwright/test";

type FixtureLocation = Readonly<{
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
}>;

type FixtureEvent = Readonly<{
  id: string;
  type: "diamond" | "pearl";
  subType: "sunrise" | "sunset" | "rising" | "setting";
  time: string;
  location: FixtureLocation;
  azimuth: number;
  elevation: number;
  accuracy: "excellent";
}>;

type DatedFixtureEvent = Readonly<{ date: string; event: FixtureEvent }>;

const fixtureMonthParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
}).formatToParts(new Date());
const fixtureYear = Number(
  fixtureMonthParts.find(({ type }) => type === "year")?.value,
);
const fixtureMonthNumber = Number(
  fixtureMonthParts.find(({ type }) => type === "month")?.value,
);
const fixtureDate = `${fixtureYear}-${String(fixtureMonthNumber).padStart(2, "0")}-15`;
const secondFixtureDate = `${fixtureYear}-${String(fixtureMonthNumber).padStart(2, "0")}-16`;

const diamondLocation = {
  id: 1081,
  name: "Issue 108 Sumida Riverside Viewpoint",
  prefecture: "Tokyo",
  latitude: 35.7101,
  longitude: 139.8107,
  elevation: 20,
  azimuthToSkytree: 45,
  elevationToSkytree: 2,
  distanceToSkytree: 20_000,
  status: "active",
  createdAt: `${fixtureDate}T00:00:00.000Z`,
  updatedAt: `${fixtureDate}T00:00:00.000Z`,
} as const satisfies FixtureLocation;

const pearlLocation = {
  id: 1082,
  name: "Issue 108 Cape Observation Point",
  prefecture: "Chiba",
  latitude: 35.121,
  longitude: 140.105,
  elevation: 31,
  azimuthToSkytree: 45,
  elevationToSkytree: 1,
  distanceToSkytree: 350_000,
  status: "active",
  createdAt: `${fixtureDate}T00:00:00.000Z`,
  updatedAt: `${fixtureDate}T00:00:00.000Z`,
} as const satisfies FixtureLocation;

const secondDateLocation = {
  id: 1083,
  name: "Issue 108 Harbor Sunset Lookout",
  prefecture: "Kanagawa",
  latitude: 35.442,
  longitude: 139.638,
  elevation: 14,
  azimuthToSkytree: 45,
  elevationToSkytree: 1,
  distanceToSkytree: 180_000,
  status: "active",
  createdAt: `${secondFixtureDate}T00:00:00.000Z`,
  updatedAt: `${secondFixtureDate}T00:00:00.000Z`,
} as const satisfies FixtureLocation;

const fixtureEvents = [
  {
    date: fixtureDate,
    event: {
      id: "issue-108-diamond-sunrise",
      type: "diamond",
      subType: "sunrise",
      time: `${fixtureDate}T06:30:00.000Z`,
      location: diamondLocation,
      azimuth: 45,
      elevation: 2,
      accuracy: "excellent",
    },
  },
  {
    date: fixtureDate,
    event: {
      id: "issue-108-pearl-rising",
      type: "pearl",
      subType: "rising",
      time: `${fixtureDate}T07:30:00.000Z`,
      location: pearlLocation,
      azimuth: 45,
      elevation: 3,
      accuracy: "excellent",
    },
  },
  {
    date: secondFixtureDate,
    event: {
      id: "issue-108-pearl-setting",
      type: "pearl",
      subType: "setting",
      time: `${secondFixtureDate}T18:30:00.000Z`,
      location: secondDateLocation,
      azimuth: 45,
      elevation: 1,
      accuracy: "excellent",
    },
  },
] as const satisfies readonly DatedFixtureEvent[];

const fixtureLocations = Array.from(
  new Map(
    fixtureEvents.map(({ event }) => [event.location.id, event.location] as const),
  ).values(),
);

function calendarEventsForMonth(year: number, month: number) {
  const eventsByDate = new Map<string, FixtureEvent[]>();
  for (const { date, event } of fixtureEvents) {
    const [eventYear, eventMonth] = date.split("-").map(Number);
    if (eventYear !== year || eventMonth !== month) continue;
    const dateEvents = eventsByDate.get(date) ?? [];
    dateEvents.push(event);
    eventsByDate.set(date, dateEvents);
  }

  return Array.from(eventsByDate, ([date, events]) => {
    const hasBothTypes = events.some((event) => event.type !== events[0].type);
    return {
      date: `${date}T00:00:00.000Z`,
      type: hasBothTypes ? "both" : events[0].type,
      events,
    };
  });
}

async function mockHomeApi(page: Page) {
  await page.route("https://**/*", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/locations") {
      await route.fulfill({ json: { locations: fixtureLocations } });
      return;
    }

    const dayMatch = pathname.match(/^\/api\/events\/(\d{4}-\d{2}-\d{2})$/);
    if (dayMatch) {
      const events = fixtureEvents
        .filter(({ date }) => date === dayMatch[1])
        .map(({ event }) => event);
      await route.fulfill({ json: { events } });
      return;
    }

    const monthMatch = pathname.match(/^\/api\/calendar\/(\d+)\/(\d+)$/);
    if (monthMatch) {
      const [, year, month] = monthMatch;
      await route.fulfill({
        json: {
          year: Number(year),
          month: Number(month),
          events: calendarEventsForMonth(Number(year), Number(month)),
        },
      });
      return;
    }

    await route.fulfill({ status: 404, json: { error: "Unmocked API endpoint" } });
  });
}

function calendarDay(page: Page, day: number) {
  return page.getByRole("button", { name: new RegExp(`^${day}(?:\\D|$)`) });
}

async function selectFixtureDate(page: Page, day: number) {
  await calendarDay(page, day).click();
  await expect(
    page.getByRole("heading", {
      name: `${fixtureYear}年${fixtureMonthNumber}月${day}日の撮影情報`,
    }),
  ).toBeVisible();
}

const diamondEventName = "昇るダイヤモンドスカイツリー";
const pearlRisingEventName = "昇るパールスカイツリー";

test("Home filters category and distance, resets filters, and restores saved values", async ({ page }) => {
  await mockHomeApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: `${fixtureYear}年${fixtureMonthNumber}月` }),
  ).toBeVisible();
  await selectFixtureDate(page, 15);
  const eventDetails = page
    .getByRole("heading", {
      name: `${fixtureYear}年${fixtureMonthNumber}月15日の撮影情報`,
    })
    .locator("xpath=../..");
  await expect(eventDetails.getByText(diamondLocation.name, { exact: true })).toBeVisible();
  await expect(eventDetails.getByText(pearlLocation.name, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "撮影地点フィルター" }).click();
  await page.getByRole("checkbox", { name: diamondEventName }).check();
  await expect(page.getByText("1イベント", { exact: true })).toBeVisible();
  await expect(eventDetails.getByText(diamondLocation.name, { exact: true })).toBeVisible();
  await expect(eventDetails.getByText(pearlLocation.name, { exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: pearlRisingEventName }).check();
  await expect(page.getByText("2イベント", { exact: true })).toBeVisible();
  const distanceSelect = page.getByRole("combobox");
  await distanceSelect.selectOption("very_far");
  await expect(page.getByText("1イベント", { exact: true })).toBeVisible();
  await expect(eventDetails.getByText(pearlLocation.name, { exact: true })).toBeVisible();
  await expect(eventDetails.getByText(diamondLocation.name, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "ON", exact: true }).click();
  await expect(page.getByText("2イベント", { exact: true })).toBeVisible();
  await page.getByTitle("フィルターを有効にしてパネルを開く").click();
  await expect(page.getByText("1イベント", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveValue("very_far");
  await expect(page.getByRole("checkbox", { name: diamondEventName })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: pearlRisingEventName })).toBeChecked();
  await expect(eventDetails.getByText(pearlLocation.name, { exact: true })).toBeVisible();
  await expect(eventDetails.getByText(diamondLocation.name, { exact: true })).toHaveCount(0);
});

test("Home shows the filtered empty state after a category excludes all events", async ({ page }) => {
  await mockHomeApi(page);
  await page.goto("/");
  await selectFixtureDate(page, 15);
  await page.getByRole("button", { name: "撮影地点フィルター" }).click();
  const noMatchFilter = page.getByRole("checkbox", {
    name: "沈むダイヤモンドスカイツリー",
  });
  await noMatchFilter.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "検索結果がありません" })).toBeVisible();
});

test("Home date selection returns to the intended event date", async ({ page }) => {
  await mockHomeApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: `${fixtureYear}年${fixtureMonthNumber}月` }),
  ).toBeVisible();

  await selectFixtureDate(page, 15);
  await expect(page.getByText(diamondLocation.name, { exact: true }).first()).toBeVisible();
  await selectFixtureDate(page, 16);
  await expect(page.getByText(secondDateLocation.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("沈むパールスカイツリー", { exact: true })).toBeVisible();

  await selectFixtureDate(page, 15);
  await expect(page.getByText(diamondLocation.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(diamondEventName, { exact: true })).toBeVisible();
});

test("camera settings update the visible horizontal field of view", async ({ page }) => {
  await mockHomeApi(page);
  await page.goto("/");
  await selectFixtureDate(page, 15);
  await expect(page.getByText(diamondLocation.name, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "撮影角度表示の切り替え" }).click();

  const fieldOfViewReadout = page.getByText(/^水平画角: \d+\.\d+°$/);
  await expect(fieldOfViewReadout).toHaveText("水平画角: 39.6°");
  await expect(page.getByRole("button", { name: "横向き撮影を選択" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const aspectRatioSelect = page.getByRole("combobox", { name: "アスペクト比" });
  await expect(aspectRatioSelect).toHaveValue("3:2");
  for (const ratio of ["3:2", "4:3", "16:9", "1:1"]) {
    await expect(aspectRatioSelect.getByRole("option", { name: ratio })).toHaveCount(1);
  }

  const readFieldOfView = async () => {
    await expect(fieldOfViewReadout).toHaveText(/^水平画角: \d+\.\d+°$/);
    const text = await fieldOfViewReadout.textContent();
    return Number(text?.match(/\d+\.\d+/)?.[0]);
  };
  const changeFieldOfView = async (change: () => Promise<unknown>) => {
    const previousText = await fieldOfViewReadout.textContent();
    if (!previousText) throw new Error("The field-of-view readout is unavailable");
    await change();
    await expect(fieldOfViewReadout).not.toHaveText(previousText);
    return readFieldOfView();
  };

  const defaultFieldOfView = await readFieldOfView();
  const focalLengthFieldOfView = await changeFieldOfView(() =>
    page.getByRole("button", { name: "焦点距離85mm を選択" }).click(),
  );
  expect(focalLengthFieldOfView).not.toBe(defaultFieldOfView);

  const sensorFieldOfView = await changeFieldOfView(() =>
    page.getByRole("radio", { name: "APS-Cセンサーを選択" }).check(),
  );
  expect(sensorFieldOfView).not.toBe(focalLengthFieldOfView);

  const aspectRatioFieldOfView = await changeFieldOfView(() =>
    aspectRatioSelect.selectOption("4:3"),
  );
  expect(aspectRatioFieldOfView).not.toBe(sensorFieldOfView);

  const orientationFieldOfView = await changeFieldOfView(() =>
    page.getByRole("button", { name: "縦向き撮影を選択" }).click(),
  );
  expect(orientationFieldOfView).not.toBe(aspectRatioFieldOfView);
  await expect(page.getByRole("button", { name: "縦向き撮影を選択" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "横向き撮影を選択" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});