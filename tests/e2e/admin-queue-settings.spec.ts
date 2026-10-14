import { expect, test } from "playwright/test";
import type { Page, Route } from "playwright/test";

type SettingType = "number" | "string" | "boolean";
type SettingValue = string | number | boolean;
type Setting = {
  id: number;
  settingKey: string;
  settingType: SettingType;
  value: SettingValue;
  description: string;
  editable: boolean;
  updatedAt: string;
};
type SettingsResponse = {
  success: true;
  settings: Record<string, Setting[]>;
  meta: { totalSettings: number; categories: string[]; lastUpdate: string };
};
type QueueStats = {
  enabled: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  failedJobs: Array<{
    id: string;
    name: string;
    data: Record<string, unknown>;
    failedReason: string;
    attemptsMade: number;
    timestamp: number;
  }>;
};
type AdminFixture = {
  queueStats: QueueStats;
  settings: SettingsResponse;
  unexpected: string[];
  writes: Array<{ method: string; path: string; body: string | null }>;
  statsMode: "populated" | "empty" | "error";
  settingsLoadMode: "normal" | "error";
  rejectNextSettingsSave: boolean;
  pauseNextStats: boolean;
  statsRequestStarted: (() => void) | null;
  statsResponseGate: Promise<void> | null;
  pauseNextSettings: boolean;
  settingsRequestStarted: (() => void) | null;
  settingsResponseGate: Promise<void> | null;
  confirmResponses: boolean[];
};

const setting = (id: number, settingKey: string, settingType: SettingType, value: SettingValue, description: string): Setting => ({
  id, settingKey, settingType, value, description, editable: true, updatedAt: "2026-01-01T00:00:00.000Z",
});

const createFixture = (): AdminFixture => {
  const performance = [
    setting(1, "worker_concurrency", "number", 2, "ワーカーごとの同時実行数"),
    setting(2, "max_active_jobs", "number", 4, "システム全体の同時実行上限"),
    setting(3, "job_delay_ms", "number", 5000, "ジョブ間隔"),
    setting(4, "processing_delay_ms", "number", 2000, "処理待機時間"),
    setting(5, "enable_low_priority_mode", "boolean", true, "低負荷モード"),
    setting(6, "cache_ttl", "number", 3600, "キャッシュ有効期間"),
  ];
  const astronomical = [setting(7, "calculation_precision", "number", 3, "計算精度")];
  const ui = [setting(8, "date_display_format", "string", "yyyy/MM/dd", "日付表示形式")];
  return {
    queueStats: {
      enabled: true,
      waiting: 4,
      active: 2,
      completed: 31,
      failed: 1,
      failedJobs: [{ id: "failed-42", name: "location-calculation", data: { locationId: 42, startYear: 2025, endYear: 2026 }, failedReason: "Fixture calculation failure", attemptsMade: 3, timestamp: 1767225600000 }],
    },
    settings: {
      success: true,
      settings: { astronomical, performance, ui },
      meta: { totalSettings: 8, categories: ["astronomical", "performance", "ui"], lastUpdate: "2026-01-01T00:00:00.000Z" },
    },
    unexpected: [],
    writes: [],
    statsMode: "populated",
    settingsLoadMode: "normal",
    rejectNextSettingsSave: false,
    pauseNextStats: false,
    statsRequestStarted: null,
    statsResponseGate: null,
    pauseNextSettings: false,
    settingsRequestStarted: null,
    settingsResponseGate: null,
    confirmResponses: [],
  };
};

const clone = <T,>(value: T): T => structuredClone(value);

async function installAdminFixture(page: Page, fixture: AdminFixture): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("skytree_photo_planner_admin", JSON.stringify({ id: 1, username: "e2e-admin" }));
  });
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") {
      const accept = fixture.confirmResponses.shift() ?? false;
      if (accept) {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    } else {
      await dialog.accept();
    }
  });
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    if (pathname === "/api/auth/verify" && method === "GET") {
      await route.fulfill({ json: { valid: true, adminId: 1, username: "e2e-admin" } });
    } else if (pathname === "/api/admin/locations" && method === "GET") {
      await route.fulfill({ json: { success: true, locations: [] } });
    } else if (pathname === "/api/admin/queue/stats" && method === "GET") {
      if (fixture.pauseNextStats) {
        fixture.statsRequestStarted?.();
        await fixture.statsResponseGate;
      }
      if (fixture.statsMode === "error") {
        await route.fulfill({ status: 503, json: { error: "Queue fixture unavailable" } });
      } else if (fixture.statsMode === "empty") {
        await route.fulfill({ json: { enabled: true, waiting: 0, active: 0, completed: 0, failed: 0, failedJobs: [] } });
      } else {
        await route.fulfill({ json: clone(fixture.queueStats) });
      }
    } else if (pathname === "/api/admin/background-jobs" && method === "GET") {
      await route.fulfill({ json: { enabled: true, jobs: [{ id: "daily-maintenance", name: "日次メンテナンス", description: "Fixture scheduled maintenance", schedule: "毎日", enabled: true, status: "idle" }] } });
    } else if (pathname === "/api/admin/background-jobs/daily-maintenance/trigger" && method === "POST") {
      fixture.writes.push({ method, path: pathname, body: request.postData() });
      await route.fulfill({ json: { success: true } });
    } else if (pathname === "/api/admin/queue/clear-failed" && method === "POST") {
      fixture.writes.push({ method, path: pathname, body: request.postData() });
      fixture.queueStats.failed = 0;
      fixture.queueStats.failedJobs = [];
      await route.fulfill({ json: { success: true } });
    } else if (pathname === "/api/admin/system-settings" && method === "GET") {
      if (fixture.pauseNextSettings) {
        fixture.settingsRequestStarted?.();
        await fixture.settingsResponseGate;
      }
      if (fixture.settingsLoadMode === "error") {
        await route.fulfill({ status: 503, json: { success: false, message: "Settings fixture unavailable" } });
      } else {
        await route.fulfill({ json: clone(fixture.settings) });
      }
    } else if (pathname === "/api/admin/system-settings" && method === "PUT") {
      const body = request.postData() ?? null;
      fixture.writes.push({ method, path: pathname, body });
      if (fixture.rejectNextSettingsSave) {
        fixture.rejectNextSettingsSave = false;
        await route.fulfill({ status: 500, json: { success: false, message: "Fixture save rejected" } });
      } else {
        const payload = JSON.parse(body ?? "{}") as { settings?: Array<{ settingKey: string; value: SettingValue }> };
        for (const update of payload.settings ?? []) {
          const target = Object.values(fixture.settings.settings).flat().find((item) => item.settingKey === update.settingKey);
          if (target) target.value = update.value;
        }
        await route.fulfill({ json: { success: true, summary: { success: payload.settings?.length ?? 0 } } });
      }
    } else {
      fixture.unexpected.push(`${method} ${pathname}`);
      await route.fulfill({ status: 404, json: { error: "Unexpected API request" } });
    }
  });
}

async function openAdminView(page: Page, name: string): Promise<void> {
  await page.goto("/admin");
  await page.getByRole("button", { name, exact: false }).click();
}

test("queue statistics show loading and populated data", async ({ page }) => {
  const fixture = createFixture();
  let releaseStats!: () => void;
  let statsStarted!: () => void;
  fixture.pauseNextStats = true;
  fixture.statsResponseGate = new Promise<void>((resolve) => { releaseStats = resolve; });
  const started = new Promise<void>((resolve) => { statsStarted = resolve; });
  fixture.statsRequestStarted = statsStarted;
  await installAdminFixture(page, fixture);
  await openAdminView(page, "キュー管理");
  await started;
  await expect(page.getByText("読み込み中...", { exact: true })).toBeVisible();
  releaseStats();
  await expect(page.getByRole("heading", { name: "キュー管理", exact: true })).toBeVisible();
  await expect(page.getByText("4", { exact: true })).toBeVisible();
  await expect(page.getByText("2", { exact: true })).toBeVisible();
  await expect(page.getByText("31", { exact: true })).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "失敗したジョブ", exact: true })).toBeVisible();
  await expect(page.getByText("Fixture calculation failure")).toBeVisible();
  await expect(page.getByText("ジョブ ID: failed-42")).toBeVisible();
  expect(fixture.unexpected).toEqual([]);
});

test("empty queue statistics omit the failed-job section", async ({ page }) => {
  const fixture = createFixture();
  fixture.statsMode = "empty";
  await installAdminFixture(page, fixture);
  await openAdminView(page, "キュー管理");
  await expect(page.getByRole("heading", { name: "キュー管理", exact: true })).toBeVisible();
  await expect(page.getByText("0", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "失敗したジョブ" })).toHaveCount(0);
  expect(fixture.unexpected).toEqual([]);
});

test("queue statistics show API errors", async ({ page }) => {
  const fixture = createFixture();
  fixture.statsMode = "error";
  await installAdminFixture(page, fixture);
  await openAdminView(page, "キュー管理");
  await expect(page.getByRole("heading", { name: "キューシステムが利用できません" })).toBeVisible();
  await expect(page.getByText("API エラー: 503 Service Unavailable")).toBeVisible();
  expect(fixture.unexpected).toEqual([]);
});

test("queue trigger validates exact request and handles failed-job cancellation and acceptance", async ({ page }) => {
  const fixture = createFixture();
  await installAdminFixture(page, fixture);
  await openAdminView(page, "キュー管理");
  fixture.confirmResponses.push(false);
  const canceledTrigger = page.waitForEvent("dialog");
  await page.getByRole("button", { name: "手動実行" }).click();
  expect((await canceledTrigger).message()).toBe("このバックグラウンドジョブを実行しますか？");
  expect(fixture.writes).toEqual([]);
  fixture.confirmResponses.push(true);
  const triggerConfirmation = page.waitForEvent("dialog", (dialog) => dialog.type() === "confirm");
  const triggered = page.waitForEvent("dialog", (dialog) => dialog.type() === "alert");
  await page.getByRole("button", { name: "手動実行" }).click();
  expect((await triggerConfirmation).message()).toBe("このバックグラウンドジョブを実行しますか？");
  expect((await triggered).message()).toBe("ジョブを実行しました");
  expect(fixture.writes).toEqual([
    { method: "POST", path: "/api/admin/background-jobs/daily-maintenance/trigger", body: null },
  ]);
  fixture.confirmResponses.push(false);
  const canceled = page.waitForEvent("dialog");
  await page.getByRole("button", { name: "すべてクリア" }).click();
  expect((await canceled).message()).toBe("失敗したジョブをすべてクリアしますか？");
  expect(fixture.writes).toEqual([
    { method: "POST", path: "/api/admin/background-jobs/daily-maintenance/trigger", body: null },
  ]);
  await expect(page.getByText("ジョブ ID: failed-42")).toBeVisible();
  fixture.confirmResponses.push(true);
  const confirmation = page.waitForEvent("dialog", (dialog) => dialog.type() === "confirm");
  const cleared = page.waitForEvent("dialog", (dialog) => dialog.type() === "alert");
  await page.getByRole("button", { name: "すべてクリア" }).click();
  expect((await confirmation).message()).toBe("失敗したジョブをすべてクリアしますか？");
  await expect(page.getByRole("heading", { name: "失敗したジョブ" })).toHaveCount(0);
  expect((await cleared).message()).toBe("失敗したジョブをクリアしました");
  expect(fixture.writes).toEqual([
    { method: "POST", path: "/api/admin/background-jobs/daily-maintenance/trigger", body: null },
    { method: "POST", path: "/api/admin/queue/clear-failed", body: null },
  ]);
  expect(fixture.unexpected).toEqual([]);
});

test("system settings support edit, reset, persistence, failure feedback, and retry", async ({ page }) => {
  const fixture = createFixture();
  let releaseSettings!: () => void;
  let settingsStarted!: () => void;
  fixture.pauseNextSettings = true;
  fixture.settingsResponseGate = new Promise<void>((resolve) => { releaseSettings = resolve; });
  const started = new Promise<void>((resolve) => { settingsStarted = resolve; });
  fixture.settingsRequestStarted = settingsStarted;
  await installAdminFixture(page, fixture);
  await page.goto("/admin");
  await page.getByRole("button", { name: "システム設定" }).click();
  await started;
  await expect(page.getByText("設定を読み込み中...")).toBeVisible();
  releaseSettings();
  await expect(page.getByRole("heading", { name: "システム設定", exact: true })).toBeVisible();
  const textSetting = page.locator("input[type='text']");
  await expect(page.locator("label").filter({ hasText: "worker_concurrency (各ワーカーの同時実行数)" })).toBeVisible();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  await textSetting.fill("dd-MM-yyyy");
  await expect(page.getByRole("button", { name: "変更を保存" })).toBeVisible();
  await page.getByRole("button", { name: "変更を破棄" }).click();
  await expect(textSetting).toHaveValue("yyyy/MM/dd");
  expect(fixture.writes).toEqual([]);
  await textSetting.fill("dd-MM-yyyy");
  const savedDialog = page.waitForEvent("dialog");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  const savedBody = JSON.stringify({ settings: [{ settingKey: "date_display_format", value: "dd-MM-yyyy" }] });
  expect(fixture.writes[0]).toEqual({ method: "PUT", path: "/api/admin/system-settings", body: savedBody });
  expect((await savedDialog).message()).toBe("1 件の設定を更新しました");
  await expect(textSetting).toHaveValue("dd-MM-yyyy");
  fixture.rejectNextSettingsSave = true;
  await textSetting.fill("MM.dd.yyyy");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page.getByText("Fixture save rejected")).toBeVisible();
  expect(fixture.settings.settings.ui[0].value).toBe("dd-MM-yyyy");
  const failedSaveBody = JSON.stringify({ settings: [{ settingKey: "date_display_format", value: "MM.dd.yyyy" }] });
  expect(fixture.writes).toEqual([
    { method: "PUT", path: "/api/admin/system-settings", body: savedBody },
    { method: "PUT", path: "/api/admin/system-settings", body: failedSaveBody },
  ]);
  fixture.settingsLoadMode = "error";
  await page.reload();
  await page.getByRole("button", { name: "システム設定" }).click();
  await expect(page.getByText("設定の取得に失敗しました: 503")).toBeVisible();
  fixture.settingsLoadMode = "normal";
  await page.getByRole("button", { name: "再試行" }).click();
  await expect(page.getByRole("heading", { name: "システム設定", exact: true })).toBeVisible();
  await expect(textSetting).toHaveValue("dd-MM-yyyy");
  expect(fixture.unexpected).toEqual([]);
});
