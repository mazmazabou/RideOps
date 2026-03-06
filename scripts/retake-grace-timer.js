'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots');
const MOBILE = { width: 390, height: 844 };
const CAMPUSES = ['usc', 'ucla', 'stanford', 'uci'];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({ headless: true });
  let captured = 0;

  for (const campus of CAMPUSES) {
    console.log('\n-- ' + campus + ' grace timer --');
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();

    try {
      // Login as alex
      await page.goto(BASE + '/' + campus + '/login', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#username', { timeout: 8000 });
      await page.fill('#username', 'alex');
      await page.fill('#password', 'demo123');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ]);
      await page.waitForLoadState('networkidle').catch(() => {});
      await delay(1000);

      // Clock in Alex
      await page.request.post(BASE + '/api/employees/clock-in', {
        data: { employeeId: 'emp1' },
      }).catch(() => {});

      // Go to rides panel
      await page.click('button[data-target="rides-panel"]').catch(() => {});
      await delay(3000);

      // Check for grace timer already present
      let graceEl = await page.$('.grace-timer');

      if (!graceEl) {
        // Advance a scheduled ride for Alex to driver_arrived_grace
        const ridesRes = await page.request.get(BASE + '/api/rides?status=scheduled&limit=50');
        const ridesData = await ridesRes.json().catch(() => ({}));
        const rideList = Array.isArray(ridesData) ? ridesData : (ridesData.rides || []);
        const today = new Date().toISOString().slice(0, 10);
        const alexRide = rideList.find(r =>
          r.assignedDriverId === 'emp1' &&
          r.requestedTime && r.requestedTime.startsWith(today)
        );

        if (alexRide) {
          console.log('  Advancing ride ' + alexRide.id + ' to grace state...');
          const otwRes = await page.request.post(BASE + '/api/rides/' + alexRide.id + '/on-the-way');
          console.log('  OTW:', otwRes.status());
          await delay(500);
          const hereRes = await page.request.post(BASE + '/api/rides/' + alexRide.id + '/here');
          console.log('  HERE:', hereRes.status());
          // Wait for polling to update UI
          await delay(3500);
          graceEl = await page.$('.grace-timer');
        } else {
          console.log('  No scheduled ride for emp1 today in ' + campus);
        }
      }

      const name = campus + '-driver-grace-timer.png';
      if (graceEl) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(OUT, name), fullPage: false });
        console.log('  [captured] ' + name);
        captured++;
      } else {
        // Fallback: any active ride card
        const activeCard = await page.$('.active-ride-card');
        if (activeCard) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(OUT, name), fullPage: false });
          console.log('  [captured fallback] ' + name);
          captured++;
        } else {
          console.log('  [skipped] no grace timer or active ride card for ' + campus);
        }
      }
    } catch (e) {
      console.log('  [error]', e.message);
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
  console.log('\nGrace timer shots captured: ' + captured + '/4');
  const allFiles = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log('Total PNG files in screenshots/: ' + allFiles.length);
}

main().catch(err => { console.error(err); process.exit(1); });
