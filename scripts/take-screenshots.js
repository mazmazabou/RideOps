#!/usr/bin/env node
'use strict';

// Automated marketing screenshots for RideOps
// Run: DEMO_MODE=true node server.js  (in another terminal)
//      node scripts/take-screenshots.js

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots', 'marketing');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

// ── Helpers ──

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function shot(page, name) {
  const filePath = path.join(OUT, name);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  ✓ ${name}`);
}

async function loginCampus(page, campus, username) {
  await page.goto(`${BASE}/${campus}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 5000 });
  await page.fill('#username', username);
  await page.fill('#password', 'demo123');
  await Promise.all([
    page.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState('networkidle').catch(() => {});
  await delay(500);
}

async function clickNav(page, selector, waitMs = 800) {
  await page.click(selector);
  await page.waitForLoadState('networkidle').catch(() => {});
  await delay(waitMs);
}

// Get the nearest weekday date (today if weekday, else previous Friday)
function getNearestWeekday() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 6=Sat
  if (day === 0) d.setDate(d.getDate() - 2); // Sun → Fri
  if (day === 6) d.setDate(d.getDate() - 1); // Sat → Fri
  return d;
}

function formatDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function todayISOAt(targetDate, hour, min) {
  const d = new Date(targetDate);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

// ── API helpers (use page.request for session cookies) ──

async function apiPost(page, endpoint, data) {
  const res = await page.request.post(`${BASE}${endpoint}`, { data });
  if (!res.ok()) {
    const text = await res.text().catch(() => '');
    console.log(`    [warn] ${endpoint} → ${res.status()} ${text.slice(0, 100)}`);
    return null;
  }
  return res.json().catch(() => null);
}

async function apiGet(page, endpoint) {
  const res = await page.request.get(`${BASE}${endpoint}`);
  if (!res.ok()) return null;
  return res.json().catch(() => null);
}

// ── Main ──

async function main() {
  // Ensure output directory
  fs.mkdirSync(OUT, { recursive: true });

  // Health check
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) throw new Error(`${res.status}`);
    console.log('✓ Server is running');
  } catch {
    console.error('✗ Server not running at', BASE);
    console.error('  Start with: DEMO_MODE=true node server.js');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const targetDate = getNearestWeekday();
  const dateStr = formatDateInput(targetDate);
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;

  console.log(`Target date: ${dateStr}${isWeekend ? ' (navigated from weekend)' : ''}`);

  try {
    // ═════════════════════════════════════════════════════════════
    // PHASE 1: Seed data for dispatch (ensure rides land in shifts)
    // ═════════════════════════════════════════════════════════════
    console.log('\n🔧 Seeding dispatch data...');

    // Current-week shifts from demo-seed:
    //   Alex (emp1): Mon-Fri 08:00-12:00
    //   Jordan (emp2): Mon-Fri 12:00-17:00
    //   Taylor (emp3): Mon/Wed/Fri 09:00-14:00
    //   Morgan (emp4): Tue/Thu 10:00-16:00

    // 1a. Login as office, clock in drivers + create rides in Jordan's window
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await loginCampus(page, 'usc', 'office');

      // Clock in Alex and Jordan
      await apiPost(page, '/api/employees/clock-in', { employeeId: 'emp1' });
      await apiPost(page, '/api/employees/clock-in', { employeeId: 'emp2' });
      console.log('  ✓ Clocked in Alex & Jordan');

      // Check if Jordan already has rides in his shift window (12-17)
      const rides = await apiGet(page, '/api/rides');
      const jordanInShift = (rides || []).filter(r =>
        r.assignedDriverId === 'emp2' &&
        r.requestedTime && r.requestedTime.startsWith(dateStr) &&
        new Date(r.requestedTime).getHours() >= 12 &&
        new Date(r.requestedTime).getHours() < 17
      );

      if (jordanInShift.length < 2) {
        console.log('  → Seeding rides for Jordan\'s shift window (12-17)...');

        // Create rides as office (rider fields provided in body)
        const ridesToCreate = [
          { hour: 13, min: 0, pickup: 'Main Library', dropoff: 'Student Union' },
          { hour: 14, min: 30, pickup: 'Engineering Hall', dropoff: 'Recreation Center' },
          { hour: 15, min: 0, pickup: 'Student Center', dropoff: 'Business School' },
        ];

        const createdIds = [];
        for (const r of ridesToCreate) {
          const ride = await apiPost(page, '/api/rides', {
            riderName: 'Demo Rider',
            riderEmail: 'demo.rider@campus.edu',
            riderPhone: '555-0100',
            pickupLocation: r.pickup,
            dropoffLocation: r.dropoff,
            requestedTime: todayISOAt(targetDate, r.hour, r.min),
          });
          if (ride && ride.id) {
            createdIds.push(ride.id);
          }
        }

        // Approve them
        for (const id of createdIds) {
          await apiPost(page, `/api/rides/${id}/approve`);
        }

        // Office can claim rides on behalf of a driver (driverId in body)
        for (const id of createdIds) {
          await apiPost(page, `/api/rides/${id}/claim`, { driverId: 'emp2' });
        }
        console.log(`  ✓ Created ${createdIds.length} rides in Jordan's shift band`);
      } else {
        console.log(`  ✓ Jordan already has ${jordanInShift.length} rides in his shift window`);
      }

      // Also check Alex has rides in his window (08-12) — demo seed should cover this
      const alexInShift = (rides || []).filter(r =>
        r.assignedDriverId === 'emp1' &&
        r.requestedTime && r.requestedTime.startsWith(dateStr) &&
        new Date(r.requestedTime).getHours() >= 8 &&
        new Date(r.requestedTime).getHours() < 12
      );
      if (alexInShift.length < 2) {
        console.log('  → Seeding rides for Alex\'s shift window (8-12)...');
        const ridesToCreate = [
          { hour: 9, min: 0, pickup: 'Residence Hall A', dropoff: 'Main Library' },
          { hour: 10, min: 30, pickup: 'Dining Hall (North)', dropoff: 'Science Building' },
          { hour: 11, min: 0, pickup: 'Health Center', dropoff: 'Student Center' },
        ];
        const createdIds = [];
        for (const r of ridesToCreate) {
          const ride = await apiPost(page, '/api/rides', {
            riderName: 'Casey Rivera',
            riderEmail: 'hello+casey@ride-ops.com',
            riderPhone: '213-555-0111',
            pickupLocation: r.pickup,
            dropoffLocation: r.dropoff,
            requestedTime: todayISOAt(targetDate, r.hour, r.min),
          });
          if (ride && ride.id) createdIds.push(ride.id);
        }
        for (const id of createdIds) {
          await apiPost(page, `/api/rides/${id}/approve`);
        }
        for (const id of createdIds) {
          await apiPost(page, `/api/rides/${id}/claim`, { driverId: 'emp1' });
        }
        console.log(`  ✓ Created ${createdIds.length} rides in Alex's shift band`);
      } else {
        console.log(`  ✓ Alex already has ${alexInShift.length} rides in his shift window`);
      }

      await ctx.close();
    }

    // ═════════════════════════════════════════════════════════════
    // PHASE 2: Screenshots
    // ═════════════════════════════════════════════════════════════

    // ── 1. Campus Selector ──
    console.log('\n📸 Login & Branding');
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      // Wait for all 4 campus cards
      try {
        await page.waitForSelector('.campus-card:nth-child(4)', { timeout: 5000 });
      } catch {
        // Fall back to waiting for any campus card
        await page.waitForSelector('.campus-card', { timeout: 5000 }).catch(() => {});
      }
      await delay(500);
      await shot(page, 'campus-selector.png');
      await ctx.close();
    }

    // ── 2-8. Office Console (USC theme) ──
    console.log('\n📸 Office Console');
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await loginCampus(page, 'usc', 'office');

      // If weekend, navigate dispatch date to the nearest weekday
      if (isWeekend) {
        await page.fill('#dispatch-date', dateStr);
        await page.press('#dispatch-date', 'Enter');
        await delay(1000);
      }
      await delay(1000);

      // 2. Dispatch dashboard — hide pending queue so KPI + schedule grid both visible
      await page.evaluate(() => {
        // Hide the pending queue section to reveal Today's Board
        const sections = document.querySelectorAll('#dispatch-panel .ro-section');
        for (const s of sections) {
          if (s.querySelector('#pending-queue-list')) {
            s.style.display = 'none';
            break;
          }
        }
        // Hide E2E test driver rows (test artifacts)
        document.querySelectorAll('.time-grid__row').forEach(row => {
          if (row.textContent.includes('E2E')) row.style.display = 'none';
        });
        // Also hide the "Off Shift" separator if all off-shift rows are E2E
        document.querySelectorAll('.time-grid__separator').forEach(sep => {
          if (sep.textContent.includes('Off Shift')) {
            const next = sep.nextElementSibling;
            // Check if any visible non-E2E rows follow
            let sibling = sep.nextElementSibling;
            let hasVisible = false;
            while (sibling && sibling.classList.contains('time-grid__row')) {
              if (sibling.style.display !== 'none') hasVisible = true;
              sibling = sibling.nextElementSibling;
            }
            if (!hasVisible) sep.style.display = 'none';
          }
        });
      });
      await delay(500);
      await shot(page, 'dispatch-dashboard.png');
      // Restore hidden elements
      await page.evaluate(() => {
        document.querySelectorAll('#dispatch-panel .ro-section').forEach(s => {
          if (s.querySelector('#pending-queue-list')) s.style.display = '';
        });
        document.querySelectorAll('.time-grid__row, .time-grid__separator').forEach(el => {
          el.style.display = '';
        });
      });

      // 3. Rides table — filter to today to show varied statuses
      await clickNav(page, 'button[data-target="rides-panel"]', 1000);
      // Set date range to today for interesting variety (pending, approved, scheduled, completed, etc.)
      await page.fill('#rides-date-from', dateStr);
      await page.fill('#rides-date-to', dateStr);
      await page.press('#rides-date-to', 'Enter');
      await delay(800);
      await shot(page, 'rides-table.png');

      // 4. Rides calendar view
      const calBtn = await page.$('#rides-view-calendar-btn');
      if (calBtn) {
        await calBtn.click();
        await delay(1500);
        // Wait for FullCalendar events
        try { await page.waitForSelector('.fc-event', { timeout: 5000 }); } catch {}
        await delay(500);
      }
      await shot(page, 'rides-calendar.png');

      // 5. Analytics dashboard
      await clickNav(page, 'button[data-target="analytics-panel"]', 1500);
      // Click "Month" quick-select to set 30-day range
      const monthBtn = await page.$('button:has-text("Month")');
      if (monthBtn) {
        await monthBtn.click();
        await delay(300);
      }
      // Click refresh
      const refreshBtn = await page.$('#analytics-refresh-btn');
      if (refreshBtn) {
        await refreshBtn.click();
      }
      await delay(3000); // Charts render asynchronously
      await shot(page, 'analytics-dashboard.png');

      // 6. Analytics hotspots
      const hotspotsBtn = await page.$('button:has-text("Hotspots"), .ro-tab:has-text("Hotspots")');
      if (hotspotsBtn) {
        await hotspotsBtn.click();
        await delay(2000);
      }
      await shot(page, 'analytics-hotspots.png');

      // 7. Settings panel — show Business Rules tab (the actual settings form)
      await clickNav(page, 'button[data-target="settings-panel"]', 1000);
      // Click Business Rules sub-tab to show settings form
      const bizRulesTab = await page.$('.ro-tab[data-subtarget="admin-rules-view"]');
      if (bizRulesTab) {
        await bizRulesTab.click();
        await delay(800);
      }
      await shot(page, 'settings-panel.png');

      // 8. Users management — show Users tab, hide E2E test artifacts
      const usersTab = await page.$('.ro-tab[data-subtarget="admin-users-view"]');
      if (usersTab) {
        await usersTab.click();
        await delay(800);
      }
      // Hide E2E test user rows
      await page.evaluate(() => {
        document.querySelectorAll('tr').forEach(row => {
          if (row.textContent.includes('E2E')) row.style.display = 'none';
        });
      });
      await delay(300);
      await shot(page, 'users-management.png');

      await ctx.close();
    }

    // ── 9-10. Driver Console (Alex, USC, mobile) ──
    console.log('\n📸 Driver Console');
    {
      const ctx = await browser.newContext({ viewport: MOBILE });
      const page = await ctx.newPage();
      await loginCampus(page, 'usc', 'alex');

      // Clock in Alex
      await apiPost(page, '/api/employees/clock-in', { employeeId: 'emp1' });
      // Reload to pick up clocked-in state
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await delay(1500);

      // 9. Driver home (should show online status + rides)
      await shot(page, 'driver-home.png');

      // 10. Driver map tab
      const mapTab = await page.$('button[data-target="map-panel"]');
      if (mapTab) {
        await mapTab.click();
        await delay(3000); // Wait for iframe to load
        // Try to dismiss cookie consent in the map iframe
        try {
          const frame = page.frameLocator('iframe').first();
          const acceptBtn = frame.locator('button:has-text("Accept"), .accept-btn, [aria-label="Accept"]');
          if (await acceptBtn.isVisible({ timeout: 2000 })) {
            await acceptBtn.click();
            await delay(1000);
          }
        } catch {}
      }
      await shot(page, 'driver-map.png');

      await ctx.close();
    }

    // ── 11-12. Rider Console (Casey, USC, mobile) ──
    console.log('\n📸 Rider Console');
    {
      const ctx = await browser.newContext({ viewport: MOBILE });
      const page = await ctx.newPage();
      await loginCampus(page, 'usc', 'casey');

      // autoSwitchToActiveRide may redirect to My Rides — explicitly go to Book tab
      const bookTab = await page.$('button[data-target="book-panel"]');
      if (bookTab) {
        await bookTab.click();
        await delay(800);
      }

      // 11. Rider booking (step 1 with pickup/dropoff)
      await shot(page, 'rider-booking.png');

      // 12. My Rides
      const myRidesTab = await page.$('button[data-target="myrides-panel"]');
      if (myRidesTab) {
        await myRidesTab.click();
        await delay(1000);
      }
      await shot(page, 'rider-myrides.png');

      await ctx.close();
    }

    // ── 13-16. Multi-Tenant Theming ──
    console.log('\n📸 Multi-Tenant Theming');
    const campuses = ['usc', 'ucla', 'stanford', 'uci'];
    for (const campus of campuses) {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await loginCampus(page, campus, 'office');

      // Clock in drivers so they show as active in the grid
      await apiPost(page, '/api/employees/clock-in', { employeeId: 'emp1' });
      await apiPost(page, '/api/employees/clock-in', { employeeId: 'emp2' });

      // If weekend, navigate to weekday
      if (isWeekend) {
        await page.fill('#dispatch-date', dateStr);
        await page.press('#dispatch-date', 'Enter');
        await delay(800);
      }
      await delay(1000);

      // Hide pending queue + E2E rows to show KPI + schedule grid with campus-themed shift bands
      await page.evaluate(() => {
        const sections = document.querySelectorAll('#dispatch-panel .ro-section');
        for (const s of sections) {
          if (s.querySelector('#pending-queue-list')) {
            s.style.display = 'none';
            break;
          }
        }
        // Hide E2E test driver rows
        document.querySelectorAll('.time-grid__row').forEach(row => {
          if (row.textContent.includes('E2E')) row.style.display = 'none';
        });
        document.querySelectorAll('.time-grid__separator').forEach(sep => {
          if (sep.textContent.includes('Off Shift')) {
            let sibling = sep.nextElementSibling;
            let hasVisible = false;
            while (sibling && sibling.classList.contains('time-grid__row')) {
              if (sibling.style.display !== 'none') hasVisible = true;
              sibling = sibling.nextElementSibling;
            }
            if (!hasVisible) sep.style.display = 'none';
          }
        });
      });
      await delay(500);

      await shot(page, `theme-${campus}.png`);
      await ctx.close();
    }

    // ── Summary ──
    console.log('\n✅ All screenshots captured!');
    const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
    console.log(`   ${files.length} files in ${OUT}`);
    files.forEach(f => console.log(`   - ${f}`));

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
