#!/usr/bin/env node
'use strict';

// =============================================================================
// RideOps Marketing Screenshot Generator
// =============================================================================
// Produces 72 screenshots: 18 views x 4 campuses (usc, ucla, stanford, uci).
//
// Prerequisites:
//   1. Server running:  DEMO_MODE=true node server.js
//   2. Demo data seeded (first run of DEMO_MODE seeds 650+ rides)
//   3. Data prep script completed (sets up dispatch-visible rides, OTW states, etc.)
//   4. Playwright installed:  npx playwright install chromium
//
// Usage:
//   node scripts/take-screenshots.js
//
// Output: screenshots/ directory at project root
//   Naming: {campus}-{view}-{detail}.png
// =============================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Configuration ──

const CAMPUSES = ['usc', 'ucla', 'stanford', 'uci'];
const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots');
const DESKTOP = { width: 1920, height: 1080 };
const MOBILE = { width: 390, height: 844 };

// Tracking
let captured = 0;
let skipped = [];

// ── Helpers ──

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Take a screenshot and save it to the output directory.
 * Scrolls to top before capturing (for office desktop views).
 */
async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const filePath = path.join(OUT, name);
  await page.screenshot({ path: filePath, fullPage: false });
  captured++;
  console.log(`    [captured] ${name}`);
}

/**
 * Record a skipped screenshot with a reason.
 */
function skip(name, reason) {
  skipped.push(`${name} -- ${reason}`);
  console.log(`    [skipped]  ${name} -- ${reason}`);
}

/**
 * Login to a campus-scoped URL. Returns { ctx, page } -- caller must close ctx.
 * Creates a fresh browser context to avoid session bleed between campuses.
 */
async function loginCampus(browser, campus, username, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/${campus}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 8000 });
  await page.fill('#username', username);
  await page.fill('#password', 'demo123');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState('networkidle').catch(() => {});
  await delay(800);

  return { ctx, page };
}

/**
 * Click a sidebar nav button (office) and wait for panel content.
 */
async function clickSidebarNav(page, panelId, waitMs = 1000) {
  await page.click(`button[data-target="${panelId}"]`);
  await delay(waitMs);
}

/**
 * Click an analytics sub-tab by its data attribute.
 */
async function clickAnalyticsTab(page, tabId, waitMs = 1500) {
  await page.click(`button[data-analytics-tab="${tabId}"]`);
  await delay(waitMs);
}

/**
 * Safely attempt an action; return true on success, false on failure.
 */
async function tryAction(fn) {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

/**
 * Hide E2E test artifacts from the dispatch grid.
 */
async function hideE2EDispatchRows(page) {
  await page.evaluate(() => {
    // Hide E2E/test driver rows
    document.querySelectorAll('.time-grid__row').forEach(row => {
      const text = row.textContent || '';
      if (/E2E|e2e|test_/i.test(text)) row.style.display = 'none';
    });
    // Hide "Off Shift" separator if no visible rows follow it
    document.querySelectorAll('.time-grid__separator').forEach(sep => {
      if (sep.textContent && sep.textContent.includes('Off Shift')) {
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
}


// =============================================================================
// OFFICE SCREENSHOTS (11 per campus)
// =============================================================================

async function officeScreenshots(browser, campus) {
  console.log(`  -- Office (desktop 1920x1080) --`);
  const { ctx, page } = await loginCampus(browser, campus, 'office', DESKTOP);

  try {
    // -----------------------------------------------------------------------
    // 1. Dispatch Dashboard
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-dispatch.png`;
      try {
        // Default panel is dispatch -- wait for KPI bar to populate
        await page.waitForSelector('.kpi-card, .kpi-bar', { timeout: 6000 }).catch(() => {});
        await delay(2000); // Allow 5s polling to populate grid
        await hideE2EDispatchRows(page);
        await delay(300);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 2. Rides Table (filtered)
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-rides-filtered.png`;
      try {
        await clickSidebarNav(page, 'rides-panel', 1500);
        // Wait for table rows to render
        await page.waitForSelector('tbody tr', { timeout: 8000 }).catch(() => {});

        // Click 2-3 status filter pills for visual interest
        const pills = await page.$$('.filter-pill');
        let clicked = 0;
        for (const pill of pills) {
          if (clicked >= 3) break;
          const text = await pill.textContent().catch(() => '');
          const lower = text.toLowerCase();
          if (lower.includes('completed') || lower.includes('scheduled') || lower.includes('approved')) {
            await pill.click();
            clicked++;
            await delay(200);
          }
        }
        await delay(500);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Ride Drawer (click first row)
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-ride-drawer.png`;
      try {
        // Ensure we're on rides panel with rows visible
        const firstRow = await page.$('tbody tr:first-child');
        if (firstRow) {
          await firstRow.click();
          // Wait for drawer to open
          await page.waitForSelector('.ro-drawer.open', { timeout: 4000 });
          await delay(400); // Animation settle
          await shot(page, name);
        } else {
          skip(name, 'no ride rows found');
        }
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 4. Ride Edit Modal (from drawer)
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-ride-edit-modal.png`;
      try {
        // The drawer should still be open -- click "Edit Ride" button
        const editBtn = await page.$('.ro-drawer.open button:has-text("Edit Ride")');
        if (editBtn) {
          await editBtn.click();
          // Drawer closes, then edit modal opens
          await page.waitForSelector('.modal-overlay.show', { timeout: 4000 });
          await delay(300);
          await shot(page, name);
          // Dismiss modal — click the Cancel button (Escape doesn't close this modal)
          const cancelBtn = await page.$('.modal-overlay.show button:has-text("Cancel")');
          if (cancelBtn) {
            await cancelBtn.click();
          } else {
            // Fallback: click the modal backdrop directly
            await page.evaluate(() => {
              const overlay = document.querySelector('.modal-overlay.show');
              if (overlay) overlay.click();
            });
          }
          await delay(400);
        } else {
          skip(name, 'no Edit Ride button found in drawer');
          // Close the drawer — click the overlay backdrop
          await page.evaluate(() => {
            const overlay = document.querySelector('.ro-drawer-overlay.open');
            if (overlay) overlay.click();
          }).catch(() => {});
          await delay(300);
        }
      } catch (err) {
        skip(name, err.message);
        // Attempt to dismiss any open modal/overlay
        await page.evaluate(() => {
          const overlay = document.querySelector('.modal-overlay.show');
          if (overlay) overlay.click();
        }).catch(() => {});
        await delay(300);
      }
    }

    // -----------------------------------------------------------------------
    // 5. Staff & Shifts Calendar
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-staff-calendar.png`;
      try {
        await clickSidebarNav(page, 'staff-panel', 1500);
        // FullCalendar uses deferred mount -- wait up to 5s for it to appear
        await delay(3000);
        // Wait for calendar events (may not exist on weekends)
        await page.waitForSelector('.fc-event', { timeout: 5000 }).catch(() => {});
        await delay(500);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 6. Fleet Panel with Vehicle Drawer
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-fleet-drawer.png`;
      try {
        await clickSidebarNav(page, 'fleet-panel', 1500);
        // Wait for vehicle cards
        await page.waitForSelector('.vehicle-card', { timeout: 5000 });
        // Click first vehicle card to open drawer
        const firstCard = await page.$('.vehicle-card');
        if (firstCard) {
          await firstCard.click();
          await page.waitForSelector('.ro-drawer.open', { timeout: 4000 });
          await delay(400);
          await shot(page, name);
          // Close drawer — click the overlay backdrop (Escape doesn't close this drawer)
          await page.evaluate(() => {
            const overlay = document.querySelector('.ro-drawer-overlay.open');
            if (overlay) overlay.click();
          });
          await delay(300);
        } else {
          skip(name, 'no vehicle cards found');
        }
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 7. Analytics Dashboard
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-analytics-dashboard.png`;
      try {
        await clickSidebarNav(page, 'analytics-panel', 1500);

        // Set date range to "Month" for broader data, fall back to "Week"
        const monthBtn = await page.$('button[data-range="this-month"]');
        const weekBtn = await page.$('button[data-range="7d"]');
        if (monthBtn) {
          await monthBtn.click();
        } else if (weekBtn) {
          await weekBtn.click();
        }
        await delay(500);

        // Click refresh to load data
        const refreshBtn = await page.$('#analytics-refresh-btn');
        if (refreshBtn) await refreshBtn.click();

        // Wait for Chart.js canvas elements to appear
        await page.waitForSelector('canvas', { timeout: 8000 }).catch(() => {});
        // Extra delay for Chart.js to finish rendering animations
        await delay(2500);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 8. Analytics Hotspots
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-analytics-hotspots.png`;
      try {
        await clickAnalyticsTab(page, 'hotspots', 1000);
        await page.waitForSelector('canvas', { timeout: 6000 }).catch(() => {});
        await delay(2500);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 9. Analytics Milestones
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-analytics-milestones.png`;
      try {
        await clickAnalyticsTab(page, 'milestones', 1000);
        // Milestones are badge/progress-bar based, not canvas
        await delay(2000);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 10. Analytics Attendance
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-analytics-attendance.png`;
      try {
        await clickAnalyticsTab(page, 'attendance', 1000);

        // Try clicking "Today" date preset for focused data
        const todayBtn = await page.$('button[data-range="today"]');
        if (todayBtn) {
          await todayBtn.click();
          await delay(500);
        }

        await page.waitForSelector('canvas', { timeout: 6000 }).catch(() => {});
        await delay(2500);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 11. Analytics Reports
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-office-analytics-reports.png`;
      try {
        await clickAnalyticsTab(page, 'reports', 1000);
        await delay(1500);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

  } finally {
    await ctx.close();
  }
}


// =============================================================================
// DRIVER SCREENSHOTS (3 per campus)
// =============================================================================

async function driverScreenshots(browser, campus) {
  console.log(`  -- Driver (mobile 390x844) --`);
  const { ctx, page } = await loginCampus(browser, campus, 'alex', MOBILE);

  try {
    // Clock in Alex so active rides are shown
    await page.request.post(`${BASE}/api/employees/clock-in`, {
      data: { employeeId: 'emp1' },
    }).catch(() => {});

    // -----------------------------------------------------------------------
    // 12. Driver Home (default panel after login)
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-driver-home.png`;
      try {
        // Ensure we're on home panel
        await page.click('button[data-target="home-panel"]').catch(() => {});
        // Wait for driver data to load (3s polling cycle)
        await delay(3000);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 13. Driver Account + Notification Toggles
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-driver-account-notifs.png`;
      try {
        await page.click('button[data-target="account-panel"]');
        await delay(1000);

        // Scroll down to notification toggles section
        await page.evaluate(() => {
          const panel = document.querySelector('#account-panel');
          if (panel) {
            const headings = panel.querySelectorAll('h3, h4, .section-title');
            for (const h of headings) {
              if (/notif/i.test(h.textContent)) {
                h.scrollIntoView({ behavior: 'instant', block: 'start' });
                return;
              }
            }
            panel.scrollTop = panel.scrollHeight;
          }
        });
        await delay(500);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 14. Driver Grace Timer
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-driver-grace-timer.png`;
      try {
        // Go to rides panel where ActiveRideCard (with grace timer) renders
        await page.click('button[data-target="rides-panel"]');
        await delay(3000);

        // Check if grace timer is already showing
        let graceTimer = await page.$('.grace-timer');

        if (!graceTimer) {
          // No grace timer showing -- advance a scheduled ride to driver_arrived_grace via API
          // (Server startup recovery may have reset previous grace rides to scheduled)
          const ridesRes = await page.request.get(`${BASE}/api/rides?status=scheduled&limit=50`);
          const ridesData = await ridesRes.json().catch(() => ({}));
          const rideList = Array.isArray(ridesData) ? ridesData : (ridesData.rides || []);
          // Find a scheduled ride assigned to emp1 (Alex) that's for today
          const today = new Date().toISOString().slice(0, 10);
          const alexRide = rideList.find(r =>
            r.assignedDriverId === 'emp1' &&
            r.requestedTime && r.requestedTime.startsWith(today)
          );

          if (alexRide) {
            console.log(`    [info] Advancing ride ${alexRide.id} to grace timer state...`);
            await page.request.post(`${BASE}/api/rides/${alexRide.id}/on-the-way`).catch(() => {});
            await delay(500);
            await page.request.post(`${BASE}/api/rides/${alexRide.id}/here`).catch(() => {});
            // Wait for 3s polling to pick up the new grace state
            await delay(3500);
            graceTimer = await page.$('.grace-timer');
          }
        }

        if (graceTimer) {
          await delay(300);
          await shot(page, name);
        } else {
          // Final fallback: any active ride card
          const activeCard = await page.$('.active-ride-card');
          if (activeCard) {
            await delay(300);
            await shot(page, name);
          } else {
            skip(name, `no grace timer or active ride for ${campus}`);
          }
        }
      } catch (err) {
        skip(name, err.message);
      }
    }

  } finally {
    await ctx.close();
  }
}


// =============================================================================
// RIDER SCREENSHOTS (4 per campus)
// =============================================================================

async function riderScreenshots(browser, campus) {
  console.log(`  -- Rider (mobile 390x844) --`);
  const { ctx, page } = await loginCampus(browser, campus, 'casey', MOBILE);

  try {
    // -----------------------------------------------------------------------
    // 15. Rider Booking - Where (Step 1)
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-rider-booking-where.png`;
      try {
        // autoSwitchToActiveRide may redirect -- explicitly go to Book tab
        await page.click('button[data-target="book-panel"]');
        await delay(800);
        await page.waitForSelector('#pickup-location', { timeout: 5000 });
        await delay(300);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 16. Rider Booking - When (Step 2)
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-rider-booking-when.png`;
      try {
        // Select a pickup location (index 1 to skip blank placeholder)
        await page.selectOption('#pickup-location', { index: 1 });
        await delay(200);
        // Select a dropoff location (index 2 for a different one)
        await page.selectOption('#dropoff-location', { index: 2 });
        await delay(200);

        // Advance to Step 2
        await page.click('#step1-next');
        await delay(800);

        // Wait for date chips to render
        await page.waitForSelector('#date-chips .filter-pill', { timeout: 5000 });

        // Click the first date chip
        await page.click('#date-chips .filter-pill:first-child');
        await delay(300);

        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 17. Rider My Rides
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-rider-myrides.png`;
      try {
        await page.click('button[data-target="myrides-panel"]');
        await delay(1000);
        // Wait for ride content (hero card or empty state)
        await page.waitForSelector('#myrides-content, .ride-hero, .empty-state', { timeout: 5000 }).catch(() => {});
        await delay(300);
        await shot(page, name);
      } catch (err) {
        skip(name, err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 18. Rider Driver-On-The-Way State
    // -----------------------------------------------------------------------
    {
      const name = `${campus}-rider-driver-otw.png`;
      try {
        // Make sure we're on My Rides
        await page.click('button[data-target="myrides-panel"]').catch(() => {});
        await delay(800);

        // Check if hero card shows an OTW status
        const heroCard = await page.$('.ride-hero');
        if (heroCard) {
          const heroText = await heroCard.textContent().catch(() => '');
          const hasOTW = /on the way|on.my.way|driver_on_the_way|arriving/i.test(heroText);
          const hasGrace = /waiting|arrived|grace/i.test(heroText);

          if (hasOTW || hasGrace) {
            await shot(page, name);
          } else {
            // Still capture if there's an active ride hero card -- it's useful
            const hasActiveState = /scheduled|approved/i.test(heroText);
            if (hasActiveState) {
              // Capture anyway -- the hero card with an active status is still valuable
              await shot(page, name);
            } else {
              skip(name, `no OTW ride for ${campus} (hero shows: ${heroText.trim().slice(0, 60)})`);
            }
          }
        } else {
          skip(name, `no active ride hero card for ${campus}`);
        }
      } catch (err) {
        skip(name, err.message);
      }
    }

  } finally {
    await ctx.close();
  }
}


// =============================================================================
// PER-CAMPUS ORCHESTRATOR
// =============================================================================

async function screenshotCampus(browser, campus) {
  console.log(`\n===============================`);
  console.log(`  ${campus.toUpperCase()} Screenshots`);
  console.log(`===============================`);

  // Office screenshots (11 per campus)
  try {
    await officeScreenshots(browser, campus);
  } catch (err) {
    console.error(`  [ERROR] Office screenshots for ${campus} failed:`, err.message);
  }

  // Driver screenshots (3 per campus)
  try {
    await driverScreenshots(browser, campus);
  } catch (err) {
    console.error(`  [ERROR] Driver screenshots for ${campus} failed:`, err.message);
  }

  // Rider screenshots (4 per campus)
  try {
    await riderScreenshots(browser, campus);
  } catch (err) {
    console.error(`  [ERROR] Rider screenshots for ${campus} failed:`, err.message);
  }
}


// =============================================================================
// MAIN
// =============================================================================

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(OUT, { recursive: true });

  // Health check
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('[OK] Server running at', BASE);
  } catch {
    console.error('[FAIL] Server not running at', BASE);
    console.error('  Start with: DEMO_MODE=true node server.js');
    process.exit(1);
  }

  console.log(`[INFO] Output directory: ${OUT}`);
  console.log(`[INFO] Campuses: ${CAMPUSES.join(', ')}`);
  console.log(`[INFO] Expected: ${CAMPUSES.length * 18} screenshots (18 per campus)`);

  const browser = await chromium.launch({ headless: true });

  try {
    for (const campus of CAMPUSES) {
      await screenshotCampus(browser, campus);
    }
  } finally {
    await browser.close();
  }

  // ── Summary ──
  console.log('\n===============================');
  console.log('  Summary');
  console.log('===============================');

  const totalExpected = CAMPUSES.length * 18;
  console.log(`  Captured: ${captured}/${totalExpected}`);

  if (skipped.length > 0) {
    console.log(`  Skipped (${skipped.length}):`);
    skipped.forEach(s => console.log(`    - ${s}`));
  }

  // List files in output directory
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(`  Total PNG files in ${OUT}: ${files.length}`);

  if (captured === totalExpected) {
    console.log('\n  All screenshots captured successfully.');
  } else {
    console.log(`\n  ${totalExpected - captured} screenshots were skipped.`);
    console.log('  This is normal for conditional shots (grace timer, OTW state).');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
