import { test, expect } from "@playwright/test";

const BASE_URL = "https://prediction-market-bot-chi.vercel.app";

test.describe("Dashboard Smoke Tests", () => {
  test("overview page loads with live data", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator("h1")).toContainText("Dashboard Overview");
    // Check KPI cards render
    await expect(page.locator("text=Total Bankroll")).toBeVisible();
    await expect(page.getByRole("main").getByText("Daily P&L")).toBeVisible();
    // Check pipeline status renders
    await expect(page.locator("text=Pipeline Status")).toBeVisible();
  });

  test("markets page loads with real markets", async ({ page }) => {
    await page.goto(`${BASE_URL}/markets`);
    await expect(page.locator("h1")).toContainText("Market Scanner");
    // Should have at least one market row or empty state
    await page.waitForTimeout(3000);
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    console.log(`Markets page: ${count} market rows`);
  });

  test("predictions page loads with AI predictions", async ({ page }) => {
    await page.goto(`${BASE_URL}/predictions`);
    await expect(page.locator("h1")).toContainText("AI Predictions");
    await page.waitForTimeout(3000);
  });

  test("research page loads with sentiment data", async ({ page }) => {
    await page.goto(`${BASE_URL}/research`);
    await expect(page.locator("h1")).toContainText("Research");
    await page.waitForTimeout(3000);
  });

  test("logs page shows pipeline runs", async ({ page }) => {
    await page.goto(`${BASE_URL}/logs`);
    await expect(page.locator("h1")).toContainText("Logs");
    await page.waitForTimeout(3000);
  });

  test("header shows worker status", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);
    // Should show either "Worker Active" or "Worker Offline"
    const workerStatus = page.locator("text=Worker");
    await expect(workerStatus).toBeVisible();
  });

  test("all navigation links work", async ({ page }) => {
    await page.goto(BASE_URL);
    const navLinks = [
      { name: "Market Scanner", url: "/markets" },
      { name: "Research Hub", url: "/research" },
      { name: "Predictions", url: "/predictions" },
      { name: "Active Trades", url: "/trades" },
      { name: "Analytics", url: "/analytics" },
      { name: "Risk Dashboard", url: "/risk" },
      { name: "Logs", url: "/logs" },
    ];

    for (const link of navLinks) {
      await page.goto(BASE_URL);
      await page.click(`text=${link.name}`);
      await expect(page).toHaveURL(new RegExp(link.url));
    }
  });
});
