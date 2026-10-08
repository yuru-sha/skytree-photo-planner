import { expect, test } from "playwright/test";

// Only run against an explicitly configured disposable test backend.
// These are real HTTP requests, not mocked browser responses.
test.describe("real backend authorization boundary", () => {
  test.skip(!process.env.E2E_API_BASE_URL, "Set E2E_API_BASE_URL to a disposable test backend.");
  const base = process.env.E2E_API_BASE_URL?.replace(/\/$/, "") ?? "";

  test("unauthenticated location mutations are rejected", async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: base });
    try {
      const cases = [
        { method: "POST", url: "/api/locations", data: { name: "e2e-probe" } },
        { method: "PUT", url: "/api/locations/1", data: { name: "e2e-probe" } },
        { method: "DELETE", url: "/api/locations/1" },
      ] as const;
      for (const item of cases) {
        const response = await request.fetch(item.url, {
          method: item.method,
          ...(item.method !== "DELETE" ? { data: item.data } : {}),
        });
        // 404 is valid when the old public mutation route has been removed.
        expect([401, 403, 404]).toContain(response.status());
      }
    } finally {
      await request.dispose();
    }
  });
});
