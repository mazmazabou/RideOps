'use strict';
// Retake: {campus}-driver-home.png and {campus}-rider-driver-otw.png
// driver-home: needs driver clocked in + longer poll wait
// rider-driver-otw: needs a Casey ride advanced to driver_on_the_way via office API

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots');
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1920, height: 1080 };
const CAMPUSES = ['usc', 'ucla', 'stanford', 'uci'];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  let capturedHome = 0;
  let capturedOTW = 0;

  // Pre-clock in Alex so the DB has active=TRUE for all subsequent driver logins
  console.log('\n[Setup] Clocking in Alex (emp1) via office session...');
  {
    const { ctx, page } = await loginCampus(browser, 'usc', 'office', DESKTOP);
    const res = await page.request.post(`${BASE}/api/employees/clock-in`, {
      data: { employeeId: 'emp1' },
    });
    console.log('  Clock-in status:', res.status());
    await ctx.close();
  }
  await delay(2000);

  for (const campus of CAMPUSES) {
    console.log(`\n═══ ${campus.toUpperCase()} ═══`);

    // ── 1. Driver Home (clocked-in state) ──
    {
      const name = `${campus}-driver-home.png`;
      const { ctx, page } = await loginCampus(browser, campus, 'alex', MOBILE);
      try {
        // Ensure Alex is clocked in
        await page.request.post(`${BASE}/api/employees/clock-in`, {
          data: { employeeId: 'emp1' },
        }).catch(() => {});
        // Stay on home panel and wait 5s (1-2 polling cycles at 3s) for isActive to update
        await page.click('button[data-target="home-panel"]').catch(() => {});
        await delay(5000);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(OUT, name), fullPage: false });
        // Verify it shows online state
        const bodyText = await page.evaluate(() => document.body.textContent);
        const isOnline = /You're Online|online/i.test(bodyText);
        console.log(`  [captured] ${name} ${isOnline ? '(online state confirmed)' : '(may still show clocked-out)'}`);
        capturedHome++;
      } catch (e) {
        console.log(`  [error] ${name}: ${e.message}`);
      } finally {
        await ctx.close();
      }
    }

    // ── 2. Rider Driver-On-The-Way ──
    {
      const name = `${campus}-rider-driver-otw.png`;

      // Use office session to advance a Casey ride to driver_on_the_way
      let advancedRideId = null;
      const { ctx: officeCtx, page: officePage } = await loginCampus(browser, campus, 'office', DESKTOP);
      try {
        // Find a scheduled ride for Casey today
        const ridesRes = await officePage.request.get(`${BASE}/api/rides?status=scheduled&limit=100`);
        const ridesData = await ridesRes.json().catch(() => ({}));
        const rideList = Array.isArray(ridesData) ? ridesData : (ridesData.rides || []);
        const today = new Date().toISOString().slice(0, 10);
        const caseyRide = rideList.find(r =>
          r.riderEmail === 'hello+casey@ride-ops.com' &&
          r.requestedTime && r.requestedTime.startsWith(today)
        );

        if (caseyRide) {
          advancedRideId = caseyRide.id;
          console.log(`  Found Casey ride: ${advancedRideId}`);
          const otwRes = await officePage.request.post(`${BASE}/api/rides/${advancedRideId}/on-the-way`, {
            data: { vehicleId: 'veh_cart2' },
          });
          const otwData = await otwRes.json().catch(() => ({}));
          console.log(`  OTW: ${otwRes.status()} → ${otwData.status || otwData.error || '?'}`);
        } else {
          // No Casey ride — create one from scratch
          console.log(`  No Casey scheduled ride — creating fresh one...`);
          const createRes = await officePage.request.post(`${BASE}/api/rides`, {
            data: {
              riderName: 'Casey Rivera',
              riderEmail: 'hello+casey@ride-ops.com',
              riderPhone: '213-555-0111',
              pickupLocation: 'Main Library',
              dropoffLocation: 'Student Center',
              requestedTime: new Date().toISOString(),
            },
          });
          if (createRes.ok()) {
            const created = await createRes.json();
            advancedRideId = created.id;
            await officePage.request.post(`${BASE}/api/rides/${advancedRideId}/approve`);
            await officePage.request.post(`${BASE}/api/rides/${advancedRideId}/claim`, {
              data: { driverId: 'emp1' },
            });
            await delay(300);
            const otwRes = await officePage.request.post(`${BASE}/api/rides/${advancedRideId}/on-the-way`, {
              data: { vehicleId: 'veh_cart2' },
            });
            const otwData = await otwRes.json().catch(() => ({}));
            console.log(`  Created + OTW: ${otwRes.status()} → ${otwData.status || otwData.error || '?'}`);
          }
        }
      } catch (e) {
        console.log(`  [office error] ${e.message}`);
      } finally {
        await officeCtx.close();
      }

      // Login as Casey and capture the OTW ride state
      const { ctx: riderCtx, page: riderPage } = await loginCampus(browser, campus, 'casey', MOBILE);
      try {
        // Go to My Rides — rider poll (5s) should pick up the OTW status
        await riderPage.click('button[data-target="myrides-panel"]');
        // Wait 6s (>1 polling cycle at 5s) for OTW state to appear
        await delay(6000);
        await riderPage.evaluate(() => window.scrollTo(0, 0));
        await riderPage.screenshot({ path: path.join(OUT, name), fullPage: false });
        const bodyText = await riderPage.evaluate(() => document.body.textContent);
        const isOTW = /on the way|on-the-way|driver.*way/i.test(bodyText);
        console.log(`  [captured] ${name} ${isOTW ? '(OTW confirmed)' : '(check manually)'}`);
        capturedOTW++;
      } catch (e) {
        console.log(`  [error] ${name}: ${e.message}`);
      } finally {
        await riderCtx.close();
      }
    }
  }

  await browser.close();
  console.log(`\nDriver home captured: ${capturedHome}/4`);
  console.log(`Rider OTW captured:   ${capturedOTW}/4`);
  const allFiles = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(`Total PNG files: ${allFiles.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
