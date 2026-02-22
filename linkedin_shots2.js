const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const BASE = 'http://localhost:3000';
const OUT  = path.join(__dirname, 'linkedin_screenshots');
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('  ✓', name);
}

async function cap(page, t, s) {
  await page.evaluate(([t, s]) => {
    document.querySelectorAll('#_c').forEach(e => e.remove());
    const el = document.createElement('div');
    el.id = '_c';
    el.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:rgba(153,0,0,0.92);color:#fff;padding:11px 26px;border-radius:40px;font:600 14px/1.5 Arial,sans-serif;z-index:99999;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.40);pointer-events:none;white-space:nowrap;';
    el.innerHTML = t + (s ? `<br><span style="font-weight:400;font-size:11px;opacity:.85">${s}</span>` : '');
    document.body.appendChild(el);
  }, [t, s || '']);
  await page.waitForTimeout(150);
}

async function login(page, user, pass) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(pass);
  await page.locator('button[type=submit]').click();
  // Wait until we navigate away from /login
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  console.log(`  → ${page.url()}`);
}

async function navPanel(page, panel) {
  const clicked = await page.evaluate(p => {
    const el = document.querySelector(`[data-panel="${p}"]`)
      || [...document.querySelectorAll('nav li, .sidebar-nav a, nav a, li')]
           .find(n => n.textContent.trim().toLowerCase().startsWith(p.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, panel);
  if (!clicked) {
    try { await page.locator(`text=${panel}`).first().click({ timeout: 2000 }); } catch {}
  }
  await page.waitForTimeout(900);
}

async function clickTab(page, label) {
  await page.evaluate(l => {
    const all = [...document.querySelectorAll('*')];
    const el = all.find(e => e.offsetParent !== null && e.textContent.trim() === l);
    if (el) el.click();
  }, label);
  await page.waitForTimeout(600);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── 1. LOGIN PAGE ──────────────────────────────────────────────────────
  console.log('\n📸 Login');
  {
    const p = await browser.newPage();
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await shot(p, '01_login_desktop');

    await p.setViewportSize({ width: 390, height: 844 });
    await p.reload({ waitUntil: 'networkidle' });
    await shot(p, '02_login_mobile');
    await p.close();
  }

  // ── 2. OFFICE CONSOLE ─────────────────────────────────────────────────
  console.log('\n📸 Office Console');
  {
    const p = await browser.newPage();
    await p.setViewportSize({ width: 1440, height: 900 });
    await login(p, 'office', 'demo123');

    await navPanel(p, 'dispatch');
    await cap(p, '🚐  Dispatch Board', 'Real-time driver & ride management');
    await shot(p, '03_office_dispatch');

    await navPanel(p, 'rides');
    await cap(p, '📋  Ride Requests', 'Full ride log with status filters');
    await shot(p, '04_office_rides');

    await navPanel(p, 'staff');
    await cap(p, '📅  Staff & Shifts', 'Driver scheduling with calendar view');
    await shot(p, '05_office_staff');

    await navPanel(p, 'fleet');
    await cap(p, '🚗  Fleet Management', 'Vehicle status & maintenance tracking');
    await shot(p, '06_office_fleet');

    await navPanel(p, 'analytics');
    await cap(p, '📊  Analytics Dashboard', 'Operations metrics & insights');
    await shot(p, '07_office_analytics');

    await navPanel(p, 'settings');
    await cap(p, '⚙️  User Management', 'Office settings & user administration');
    await shot(p, '08_office_settings');

    // Collapse sidebar
    await navPanel(p, 'dispatch');
    try {
      await p.locator('.sidebar-toggle, #sidebar-toggle, [aria-label*="ollapse"], [aria-label*="oggle"]')
        .first().click({ timeout: 2000 });
      await p.waitForTimeout(600);
    } catch {}
    await cap(p, '🗜️  Collapsible Sidebar', 'Maximum screen real estate');
    await shot(p, '09_office_collapsed_sidebar');
    await p.close();
  }

  // ── 3. OFFICE HERO 1280px ─────────────────────────────────────────────
  console.log('\n📸 Office hero 1280');
  {
    const p = await browser.newPage();
    await p.setViewportSize({ width: 1280, height: 800 });
    await login(p, 'office', 'demo123');
    await cap(p, '🖥️  RideOps Operations Console', 'Campus transportation, reimagined');
    await shot(p, '18_office_hero_1280');
    await p.close();
  }

  // ── 4. DRIVER VIEW 390px ──────────────────────────────────────────────
  console.log('\n📸 Driver Console');
  {
    const p = await browser.newPage();
    await p.setViewportSize({ width: 390, height: 844 });
    await login(p, 'alex', 'demo123');

    await cap(p, '🟢  Driver — Home', 'Live ride queue & clock-in/out');
    await shot(p, '10_driver_home');

    await clickTab(p, 'My Rides');
    await cap(p, '📋  My Rides', 'Assigned rides for the shift');
    await shot(p, '11_driver_my_rides');

    await clickTab(p, 'Account');
    await cap(p, '👤  Driver Account', 'Profile & settings');
    await shot(p, '12_driver_account');
    await p.close();
  }

  // ── 5. RIDER VIEW 390px ───────────────────────────────────────────────
  console.log('\n📸 Rider Console');
  {
    const p = await browser.newPage();
    await p.setViewportSize({ width: 390, height: 844 });
    await login(p, 'casey', 'demo123');

    await cap(p, '🗓️  My Rides', 'Active & upcoming ride tracking');
    await shot(p, '13_rider_my_rides');

    // Book tab
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('*')]
        .find(e => e.offsetParent !== null && /^(\+|Book)$/.test(e.textContent.trim()));
      if (el) el.click();
    });
    await p.waitForTimeout(600);

    // Select locations to enable NEXT
    const sels = await p.locator('select').all();
    if (sels.length >= 1) await sels[0].selectOption({ index: 5 });
    if (sels.length >= 2) await sels[1].selectOption({ index: 12 });
    await p.waitForTimeout(400);
    await cap(p, '📍  Book a Ride — Step 1', 'Pick-up & drop-off selection');
    await shot(p, '14_rider_book_step1');

    // Advance to step 2
    await p.locator('#step1-next').click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(800);
    await cap(p, '📅  Book a Ride — Step 2', 'Choose your date & time');
    await shot(p, '15_rider_book_step2');

    // Pick first chip then advance to step 3
    const chips = await p.locator('[class*=chip],[class*=date-btn],[class*=slot]').all();
    for (const c of chips.slice(0, 1)) await c.click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(400);
    await p.locator('#step2-next').click({ timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(800);
    await cap(p, '✅  Book a Ride — Step 3', 'Review & confirm your trip');
    await shot(p, '16_rider_book_step3');

    // History
    await clickTab(p, 'History');
    await cap(p, '🕒  Ride History', 'Past rides with status breakdown');
    await shot(p, '17_rider_history');
    await p.close();
  }

  await browser.close();
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort();
  console.log(`\n✅  ${files.length} screenshots in ${OUT}`);
  files.forEach(f => console.log('   ', f));
})();
