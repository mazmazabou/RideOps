// linkedin_shots.js  –  Showcase screenshots for RideOps LinkedIn post
// Run: node linkedin_shots.js
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const BASE = 'http://localhost:3000';
const OUT  = path.join(__dirname, 'linkedin_screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false, ...opts });
  console.log('  ✓', name);
  return file;
}

async function login(page, user, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 5000 });
  await page.fill('#username', user);
  await page.fill('#password', pass);
  // submit and wait for either navigation away OR a redirect
  await Promise.all([
    page.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' }).catch(() => {}),
    page.click('button[type=submit]'),
  ]);
  // If still on login (e.g. already logged in elsewhere), navigate directly
  if (page.url().includes('/login')) {
    const roleMap = { office: '/office', alex: '/driver', jordan: '/driver', casey: '/rider' };
    const dest = roleMap[user] || '/office';
    await page.goto(`${BASE}${dest}`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
}

// ── little helper: make page look "live" by injecting an overlay caption
async function injectCaption(page, text, sub = '') {
  await page.evaluate(([t, s]) => {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
      background:rgba(153,0,0,0.90); color:#fff; padding:10px 22px;
      border-radius:40px; font:600 14px/1.4 Arial,sans-serif;
      z-index:99999; text-align:center; box-shadow:0 4px 20px rgba(0,0,0,.35);
      pointer-events:none; white-space:nowrap;
    `;
    el.innerHTML = t + (s ? `<br><span style="font-weight:400;font-size:11px;opacity:.85">${s}</span>` : '');
    document.body.appendChild(el);
  }, [text, sub]);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = browser.newContext ? browser : null;

  // ══════════════════════════════════════════════════════
  // 1.  LOGIN PAGE  –  1440 wide
  // ══════════════════════════════════════════════════════
  console.log('\n📸  Login Page');
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await shot(page, '01_login_desktop');

    // mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await shot(page, '02_login_mobile');
    await page.close();
  }

  // ══════════════════════════════════════════════════════
  // 2.  OFFICE CONSOLE
  // ══════════════════════════════════════════════════════
  console.log('\n📸  Office Console');
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, 'office', 'dart123');

    // — Dispatch (default panel)
    await page.waitForSelector('.kpi-bar, .dispatch-grid, #panel-dispatch', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await injectCaption(page, '🚐  Dispatch Board', 'Real-time driver & ride management');
    await shot(page, '03_office_dispatch');

    // helper: click sidebar nav by panel name
    async function navTo(panel) {
      // Try data-panel attribute first, then text content
      const clicked = await page.evaluate((p) => {
        const el = document.querySelector(`[data-panel="${p}"], [onclick*="${p}"], #nav-${p}`)
          || [...document.querySelectorAll('nav a, .sidebar-nav li, .nav-item')].find(n => n.textContent.trim().toLowerCase().startsWith(p.toLowerCase()));
        if (el) { el.click(); return true; }
        return false;
      }, panel);
      if (!clicked) {
        // fallback: click by visible text
        try { await page.locator(`text=${panel}`).first().click({ timeout: 2000 }); } catch {}
      }
      await page.waitForTimeout(900);
    }

    // — Ride Requests
    await navTo('rides');
    await injectCaption(page, '📋  Ride Requests', 'Full ride log with status filters');
    await shot(page, '04_office_rides');

    // — Staff & Shifts
    await navTo('staff');
    await injectCaption(page, '📅  Staff & Shifts', 'Driver scheduling with calendar view');
    await shot(page, '05_office_staff');

    // — Fleet
    await navTo('fleet');
    await injectCaption(page, '🚗  Fleet Management', 'Vehicle status & maintenance tracking');
    await shot(page, '06_office_fleet');

    // — Analytics
    await navTo('analytics');
    await injectCaption(page, '📊  Analytics Dashboard', 'Operations metrics & ride insights');
    await shot(page, '07_office_analytics');

    // — Settings
    await navTo('settings');
    await injectCaption(page, '⚙️  User Management', 'Office settings & user administration');
    await shot(page, '08_office_settings');

    // — back to dispatch, then collapse sidebar
    await navTo('dispatch');
    try {
      const toggleSel = '.sidebar-toggle, .toggle-sidebar, #sidebar-toggle, [aria-label*="collapse"], [aria-label*="toggle"]';
      await page.locator(toggleSel).first().click({ timeout: 2000 });
      await page.waitForTimeout(600);
    } catch {}
    await injectCaption(page, '🗜️  Collapsible Sidebar', 'More screen real estate when you need it');
    await shot(page, '09_office_collapsed_sidebar');
    await page.close();
  }

  // ══════════════════════════════════════════════════════
  // 3.  DRIVER VIEW  –  390px (iPhone 14 Pro)
  // ══════════════════════════════════════════════════════
  console.log('\n📸  Driver Console');
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'alex', 'dart123');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Clock-out state (already clocked in from previous session? check)
    await injectCaption(page, '🟢  Driver — Home', 'Live ride queue & clock-in/out');
    await shot(page, '10_driver_home');

    // My Rides tab
    try {
      await page.locator('text=My Rides').first().click();
      await page.waitForTimeout(500);
    } catch {}
    await injectCaption(page, '📋  My Rides', 'Assigned ride list for the shift');
    await shot(page, '11_driver_my_rides');

    // Account tab
    try {
      await page.locator('text=Account').first().click();
      await page.waitForTimeout(500);
    } catch {}
    await injectCaption(page, '👤  Driver Account', 'Profile, password & logout');
    await shot(page, '12_driver_account');

    await page.close();
  }

  // ══════════════════════════════════════════════════════
  // 4.  RIDER VIEW  –  390px
  // ══════════════════════════════════════════════════════
  console.log('\n📸  Rider Console');
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'casey', 'dart123');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    // My Rides
    await injectCaption(page, '🗓️  My Rides', 'Active & upcoming ride tracking');
    await shot(page, '13_rider_my_rides');

    // Book — Step 1
    try {
      await page.locator('text=Book').first().click();
      await page.waitForTimeout(500);
    } catch {}
    await injectCaption(page, '📍  Book a Ride — Step 1', 'Pick-up & drop-off selection');
    await shot(page, '14_rider_book_step1');

    // Step 2 — pick a date/time (select locations first to enable NEXT)
    try {
      const selects = page.locator('select');
      const count = await selects.count();
      if (count >= 1) await selects.nth(0).selectOption({ index: 5 });
      if (count >= 2) await selects.nth(1).selectOption({ index: 12 });
      await page.waitForTimeout(300);
      const nextBtn = page.locator('button:has-text("NEXT"), button:has-text("Next")').first();
      if (await nextBtn.isEnabled()) await nextBtn.click();
      await page.waitForTimeout(700);
    } catch {}
    await injectCaption(page, '📅  Book a Ride — Step 2', 'Choose your date & time');
    await shot(page, '15_rider_book_step2');

    // Step 3 — summary (click first date chip then NEXT)
    try {
      const chips = page.locator('.date-chip, .chip, [class*="chip"], [class*="date"]');
      if (await chips.count() > 0) { await chips.first().click(); await page.waitForTimeout(300); }
      const nextBtn2 = page.locator('button:has-text("NEXT"), button:has-text("Next")').first();
      if (await nextBtn2.isEnabled()) await nextBtn2.click();
      await page.waitForTimeout(700);
    } catch {}
    await injectCaption(page, '✅  Book a Ride — Step 3', 'Confirm your ride details');
    await shot(page, '16_rider_book_step3');

    // History
    try {
      await page.locator('text=History').first().click();
      await page.waitForTimeout(500);
    } catch {}
    await injectCaption(page, '🕒  Ride History', 'Past rides with status breakdown');
    await shot(page, '17_rider_history');

    await page.close();
  }

  // ══════════════════════════════════════════════════════
  // 5.  OFFICE on iPad  (1024 × 1366 — looks great for LinkedIn)
  // ══════════════════════════════════════════════════════
  console.log('\n📸  Office on iPad viewport');
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, 'office', 'dart123');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    await injectCaption(page, '🖥️  Operations Console', 'Built for campus transport teams');
    await shot(page, '18_office_1280');
    await page.close();
  }

  // ══════════════════════════════════════════════════════
  // 6.  SIDE-BY-SIDE TRIPTYCH  (1440 wide, inject mock layout)
  // ══════════════════════════════════════════════════════
  // (skip triptych, individual shots are cleaner)

  await browser.close();
  console.log(`\n✅  All screenshots saved to: ${OUT}`);
  console.log('   Files:', fs.readdirSync(OUT).join(', '));
})();
