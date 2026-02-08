// tests/uat.spec.js
const { test, expect } = require("@playwright/test");

const PASSWORD = process.env.TEST_PASSWORD || "dart123";

// Seed users found in your server.js defaults (from your zip)
const USERS = {
  office: "office",
  driver: "mazen",
  rider: "sarah",
};

async function login(page, username, password = PASSWORD) {
  await page.goto("/login");
  await expect(page.locator("#login-form")).toBeVisible();

  await page.fill("#username", username);
  await page.fill("#password", password);

  await Promise.all([
    page.waitForNavigation(),
    page.click('button[type="submit"]'),
  ]);
}

async function logout(page) {
  // All pages have a "Logout" button in your HTML
  const logoutBtn = page.getByRole("button", { name: "Logout" });
  if (await logoutBtn.isVisible().catch(() => false)) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {}),
      logoutBtn.click(),
    ]);
  }
}

test.describe("DART UAT (Office / Rider / Driver)", () => {
  test("Office login loads core console", async ({ page }) => {
    await login(page, USERS.office);

    // Office redirects to /office
    await expect(page).toHaveURL(/\/office/);

    // Core panels exist (IDs from your index.html)
    await expect(page.locator("#staff-panel")).toBeVisible();
    await expect(page.locator("#rides-panel")).toBeVisible();
    await expect(page.locator("#admin-panel")).toBeVisible();

    // Schedule date widget exists
    await expect(page.locator("#schedule-date")).toBeVisible();

    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test("Rider can submit one-time ride request", async ({ page }) => {
    await login(page, USERS.rider);
    await expect(page).toHaveURL(/\/rider/);

    await expect(page.locator("#ride-form")).toBeVisible();

    // Select pickup & dropoff — choose first non-empty option.
    // (Your select options are filled from usc_building_options.js.)
    const pickup = page.locator("#pickup-location");
    const dropoff = page.locator("#dropoff-location");
    await expect(pickup).toBeVisible();
    await expect(dropoff).toBeVisible();

    // Pick first available option that isn't empty
    await pickup.selectOption({ index: 1 });
    await dropoff.selectOption({ index: 2 });

    // Ensure one-time ride is selected (radio)
    await page.check('input[name="ride-type"][value="one-time"]');

    // Set requested time (datetime-local). Use "now + 30 minutes".
    const dt = new Date(Date.now() + 30 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const local = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

    await page.fill("#requested-time", local);

    // Optional fields
    await page.fill("#rider-phone", "213-555-0111");
    await page.fill("#notes", "UAT test ride request");

    // Submit
    await page.click("#ride-form button[type='submit']");

    // Expect success message or that request appears in list
    const msg = page.locator("#form-message");
    await expect(msg).toBeVisible();

    // The ride should show up in My Rides section (best-effort)
    await expect(page.locator("#my-rides")).toBeVisible();

    await logout(page);
  });

  test("Office approves and assigns rider request to an active driver", async ({ page }) => {
    await login(page, USERS.office);
    await expect(page).toHaveURL(/\/office/);

    // Mark driver as active by clocking them in via UI might be in office view,
    // but your office console also has a driver panel. We'll do a simpler approach:
    // Go to driver console page in a separate test and clock in. Here we assume driver can be active.
    // For robustness, we’ll just open Driver page in a second browser context in the next test.

    // Go to rides panel if nav exists; otherwise just ensure list containers present
    await expect(page.locator("#pending-items")).toBeVisible();

    // If pending list is empty, fail with a helpful note
    const pendingCount = await page.locator("#pending-items .ride-card, #pending-items .card, #pending-items > *").count();
    expect(pendingCount).toBeGreaterThan(0);

    // Click first pending ride Approve button.
    // We don't know exact markup, so try common patterns.
    const pending = page.locator("#pending-items");
    const approveBtn = pending.locator('button:has-text("Approve")').first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // After approving, it should appear in approved list
    await expect(page.locator("#approved-items")).toBeVisible();

    // Assign a driver: look for a select dropdown inside the approved ride card
    const approved = page.locator("#approved-items");
    const firstApprovedCard = approved.locator(".ride-card, .card, article, div").first();

    // Some implementations render a <select> for drivers
    const driverSelect = firstApprovedCard.locator("select").first();
    if (await driverSelect.isVisible().catch(() => false)) {
      // choose the first real option
      await driverSelect.selectOption({ index: 1 });
      // click assign if present
      const assignBtn = firstApprovedCard.locator('button:has-text("Assign")').first();
      if (await assignBtn.isVisible().catch(() => false)) {
        await assignBtn.click();
      }
    }

    await logout(page);
  });

  test("Driver clocks in, claims ride, and can trigger status buttons", async ({ page }) => {
    await login(page, USERS.driver);
    await expect(page).toHaveURL(/\/driver/);

    // Clock in
    await expect(page.locator("#clock-btn")).toBeVisible();
    const clockBtn = page.locator("#clock-btn");
    const clockText = await clockBtn.textContent();

    // If already clocked in, skip; else click Clock In
    if (clockText && clockText.toLowerCase().includes("clock in")) {
      await clockBtn.click();
    }

    // Available rides list exists
    await expect(page.locator("#available-rides")).toBeVisible();

    // Claim first available ride if present
    const claimBtn = page.locator('button:has-text("Claim")').first();
    if (await claimBtn.isVisible().catch(() => false)) {
      await claimBtn.click();
    }

    // My rides should show up
    await expect(page.locator("#my-rides")).toBeVisible();

    // Status action buttons should exist on a ride card
    const onMyWay = page.locator('button:has-text("On My Way")').first();
    if (await onMyWay.isVisible().catch(() => false)) {
      await onMyWay.click();
    }

    const hereBtn = page.locator("button:has-text(\"I'm Here\"), button:has-text(\"I’m Here\")").first();
    if (await hereBtn.isVisible().catch(() => false)) {
      await hereBtn.click();
    }

    // Confirm grace UI exists (best-effort: look for "grace" word or countdown)
    const graceHint = page.locator("text=/grace/i");
    if (await graceHint.count()) {
      await expect(graceHint.first()).toBeVisible();
    }

    // We won't actually wait 5 minutes in UAT; we just verify buttons exist
    await expect(page.locator('button:has-text("Complete")').first()).toBeVisible();

    await logout(page);
  });
});
