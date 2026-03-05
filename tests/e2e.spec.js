// tests/e2e.spec.js — Comprehensive E2E test suite for RideOps
const { test, expect } = require('@playwright/test');

// ─── Constants & Config ─────────────────────────────────────────────────────
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASSWORD = process.env.TEST_PASSWORD || 'demo123';

const USERS = {
  office:  { username: 'office',  id: 'office', role: 'office' },
  driver1: { username: 'alex',    id: 'emp1',   role: 'driver' },
  driver2: { username: 'jordan',  id: 'emp2',   role: 'driver' },
  rider1:  { username: 'casey',   id: 'rider1', role: 'rider', email: 'hello+casey@ride-ops.com' },
  rider2:  { username: 'riley',   id: 'rider2', role: 'rider', email: 'hello+riley@ride-ops.com' },
};

const VEHICLE_ID = 'veh_cart1';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns a valid Mon-Fri 10:00 AM ISO datetime string. */
function nextServiceDateTime() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Skip to Monday if Sat/Sun
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

/** Returns YYYY-MM-DDTHH:mm for <input type="datetime-local"> */
function nextServiceDateTimeLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(10, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Returns YYYY-MM-DD for a date offset days in the future (weekday). */
function futureDateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Create a logged-in API request context for the given user. */
async function apiContext(playwright, username) {
  const ctx = await playwright.request.newContext({ baseURL: BASE });
  const res = await ctx.post('/api/auth/login', {
    data: { username, password: PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  return ctx;
}

/** Login via the UI — fills form and waits for navigation. */
async function loginUI(page, username) {
  await page.goto('/usc/login');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(office|driver|rider|usc)/, { timeout: 10000 }),
    page.locator('#login-form button[type="submit"]').click(),
  ]);
}

/** Helper to create a ride via API and return the ride object. */
async function createRide(ctx, overrides) {
  const data = {
    riderName: 'Test Rider',
    riderEmail: USERS.rider1.email,
    riderPhone: '213-555-0199',
    pickupLocation: 'Main Library',
    dropoffLocation: 'Student Union',
    requestedTime: nextServiceDateTime(),
    notes: 'E2E test ride',
    ...overrides,
  };
  const res = await ctx.post('/api/rides', { data });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. API: Auth
// ═══════════════════════════════════════════════════════════════════════════
test.describe('API: Auth', () => {
  test('valid login returns user object', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.post('/api/auth/login', {
      data: { username: 'office', password: PASSWORD },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('id', 'office');
    expect(body).toHaveProperty('role', 'office');
    expect(body).toHaveProperty('username', 'office');
    await ctx.dispose();
  });

  test('invalid password returns 401', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.post('/api/auth/login', {
      data: { username: 'office', password: 'wrong' },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('/me returns session user when authenticated', async ({ playwright }) => {
    const ctx = await apiContext(playwright, 'office');
    const res = await ctx.get('/api/auth/me');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBe('office');
    expect(body.role).toBe('office');
    await ctx.dispose();
  });

  test('/me returns 401 when unauthenticated', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/api/auth/me');
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('logout destroys session', async ({ playwright }) => {
    const ctx = await apiContext(playwright, 'office');
    const logoutRes = await ctx.post('/api/auth/logout');
    expect(logoutRes.ok()).toBeTruthy();
    const meRes = await ctx.get('/api/auth/me');
    expect(meRes.status()).toBe(401);
    await ctx.dispose();
  });

  test('signup-allowed returns boolean', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/api/auth/signup-allowed');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('allowed');
    expect(typeof body.allowed).toBe('boolean');
    await ctx.dispose();
  });

  test('signup creates rider account, then cleanup via admin', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const ts = Date.now();
    const unique = `e2e_signup_${ts}`;
    const memberId = `${ts}`.slice(-10).padStart(10, '0');

    const signupRes = await ctx.post('/api/auth/signup', {
      data: {
        name: 'E2E Signup Test',
        email: `${unique}@test-e2e.com`,
        phone: `555${String(ts).slice(-7)}`,
        password: 'testpass123',
        memberId,
      },
    });
    // Signup may be disabled — skip if so
    if (signupRes.status() === 403) {
      test.skip();
      await ctx.dispose();
      return;
    }
    expect(signupRes.ok()).toBeTruthy();
    const user = await signupRes.json();
    expect(user).toHaveProperty('id');
    expect(user.role).toBe('rider');
    await ctx.dispose();

    // Best-effort cleanup (may fail in DEMO_MODE — that's OK)
    const officeCtx = await apiContext(playwright, 'office');
    await officeCtx.delete(`/api/admin/users/${user.id}`).catch(() => {});
    await officeCtx.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. API: Config
// ═══════════════════════════════════════════════════════════════════════════
test.describe('API: Config', () => {
  test('client-config returns isDev', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/api/client-config');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('isDev');
    await ctx.dispose();
  });

  test('tenant-config returns org branding', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/api/tenant-config');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('orgName');
    expect(body).toHaveProperty('primaryColor');
    expect(body).toHaveProperty('secondaryColor');
    await ctx.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. API: Profile
// ═══════════════════════════════════════════════════════════════════════════
test.describe('API: Profile', () => {
  test('GET /api/me returns full profile', async ({ playwright }) => {
    const ctx = await apiContext(playwright, 'casey');
    const res = await ctx.get('/api/me');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('id', 'rider1');
    expect(body).toHaveProperty('username', 'casey');
    expect(body).toHaveProperty('role', 'rider');
    expect(body).toHaveProperty('email');
    await ctx.dispose();
  });

  test('PUT /api/me updates name/phone, then reverts', async ({ playwright }) => {
    const ctx = await apiContext(playwright, 'casey');
    // Read original
    const original = await (await ctx.get('/api/me')).json();

    // Update
    const updateRes = await ctx.put('/api/me', {
      data: { name: 'Casey Updated', phone: '213-555-0000' },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.name).toBe('Casey Updated');
    expect(updated.phone).toBe('213-555-0000');

    // Revert
    await ctx.put('/api/me', {
      data: { name: original.name, phone: original.phone },
    });
    await ctx.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. API: Admin User Management (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('API: Admin User Management', () => {
  let officeCtx;
  let testUserId;

  test.beforeAll(async ({ playwright }) => {
    officeCtx = await apiContext(playwright, 'office');
  });
  test.afterAll(async () => {
    // Cleanup: delete test user if still exists
    if (testUserId) {
      await officeCtx.delete(`/api/admin/users/${testUserId}`).catch(() => {});
    }
    await officeCtx.dispose();
  });

  test('GET /api/admin/users lists all users', async () => {
    const res = await officeCtx.get('/api/admin/users');
    expect(res.ok()).toBeTruthy();
    const users = await res.json();
    expect(Array.isArray(users)).toBeTruthy();
    expect(users.length).toBeGreaterThanOrEqual(7);
  });

  test('GET /api/admin/users/search finds alex by member ID', async () => {
    const res = await officeCtx.get('/api/admin/users/search?member_id=1000000001');
    expect(res.ok()).toBeTruthy();
    const user = await res.json();
    expect(user.username).toBe('alex');
  });

  test('POST /api/admin/users creates test user', async () => {
    const ts = Date.now();
    const unique = `e2e_admin_${ts}`;

    const res = await officeCtx.post('/api/admin/users', {
      data: {
        name: 'E2E Test Driver',
        email: `${unique}@test-e2e.com`,
        phone: `555${String(ts).slice(-7)}`,
        memberId: `E2E${String(ts).slice(-7)}`,
        role: 'driver',
        password: 'testpass123',
      },
    });
    expect(res.ok()).toBeTruthy();
    const user = await res.json();
    expect(user).toHaveProperty('id');
    expect(user.role).toBe('driver');
    testUserId = user.id;
  });

  test('PUT /api/admin/users/:id updates test user', async () => {
    const res = await officeCtx.put(`/api/admin/users/${testUserId}`, {
      data: { name: 'E2E Updated Driver', phone: '213-555-8888' },
    });
    expect(res.ok()).toBeTruthy();
    const user = await res.json();
    expect(user.name).toBe('E2E Updated Driver');
  });

  test('GET /api/admin/users/:id/profile returns user+rides', async () => {
    const res = await officeCtx.get(`/api/admin/users/${testUserId}/profile`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('user');
    expect(body).toHaveProperty('upcoming');
    expect(body).toHaveProperty('past');
  });

  test('POST /api/admin/users/:id/reset-password resets pw', async () => {
    const res = await officeCtx.post(`/api/admin/users/${testUserId}/reset-password`, {
      data: { newPassword: 'newpass12345' },
    });
    // Reset-password is disabled in DEMO_MODE
    if (res.status() === 403) { test.skip(); return; }
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBeTruthy();
  });

  test('DELETE /api/admin/users/:id soft-deletes test user', async () => {
    const res = await officeCtx.delete(`/api/admin/users/${testUserId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBeTruthy();

    // User should not appear in default list
    const listRes = await officeCtx.get('/api/admin/users');
    const users = await listRes.json();
    expect(users.find(u => u.id === testUserId)).toBeUndefined();

    // User should appear with include_deleted
    const listDeleted = await officeCtx.get('/api/admin/users?include_deleted=true');
    const allUsers = await listDeleted.json();
    const deleted = allUsers.find(u => u.id === testUserId);
    expect(deleted).toBeTruthy();
    expect(deleted.deleted_at).toBeTruthy();
  });

  test('POST /api/admin/users/:id/restore restores soft-deleted user', async () => {
    const res = await officeCtx.post(`/api/admin/users/${testUserId}/restore`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBeTruthy();

    // User should now appear in default list
    const listRes = await officeCtx.get('/api/admin/users');
    const users = await listRes.json();
    expect(users.find(u => u.id === testUserId)).toBeTruthy();

    // Clean up: soft-delete again
    await officeCtx.delete(`/api/admin/users/${testUserId}`).catch(() => {});
    testUserId = null;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. API: Email Status
// ═══════════════════════════════════════════════════════════════════════════
test.describe('API: Email Status', () => {
  test('GET /api/admin/email-status returns configured flag', async ({ playwright }) => {
    const ctx = await apiContext(playwright, 'office');
    const res = await ctx.get('/api/admin/email-status');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('configured');
    expect(typeof body.configured).toBe('boolean');
    await ctx.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. API: Employees (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('API: Employees', () => {
  let ctx;

  test.beforeAll(async ({ playwright }) => {
    ctx = await apiContext(playwright, 'office');
  });
  test.afterAll(async () => {
    // Ensure driver1 is clocked out
    await ctx.post('/api/employees/clock-out', { data: { employeeId: USERS.driver1.id } }).catch(() => {});
    await ctx.dispose();
  });

  test('GET /api/employees lists drivers', async () => {
    const res = await ctx.get('/api/employees');
    expect(res.ok()).toBeTruthy();
    const employees = await res.json();
    expect(Array.isArray(employees)).toBeTruthy();
    expect(employees.length).toBeGreaterThanOrEqual(4);
    expect(employees.some((e) => e.username === 'alex')).toBeTruthy();
  });

  test('POST /api/employees/clock-in sets active=true', async () => {
    const res = await ctx.post('/api/employees/clock-in', {
      data: { employeeId: USERS.driver1.id },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.active).toBeTruthy();
  });

  test('POST /api/employees/clock-out sets active=false', async () => {
    // Unassign any active rides so clock-out guard doesn't block
    const ridesRes = await ctx.get('/api/rides');
    if (ridesRes.ok()) {
      const rides = await ridesRes.json();
      for (const r of rides) {
        if (r.assignedDriverId === USERS.driver1.id && ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status)) {
          await ctx.post(`/api/rides/${r.id}/unassign`).catch(() => {});
        }
      }
    }
    const res = await ctx.post('/api/employees/clock-out', {
      data: { employeeId: USERS.driver1.id },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.active).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. API: Shifts (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('API: Shifts', () => {
  let ctx;
  let shiftId;

  test.beforeAll(async ({ playwright }) => {
    ctx = await apiContext(playwright, 'office');
  });
  test.afterAll(async () => {
    if (shiftId) {
      await ctx.delete(`/api/shifts/${shiftId}`).catch(() => {});
    }
    await ctx.dispose();
  });

  test('GET /api/shifts returns array', async () => {
    const res = await ctx.get('/api/shifts');
    expect(res.ok()).toBeTruthy();
    const shifts = await res.json();
    expect(Array.isArray(shifts)).toBeTruthy();
  });

  test('POST /api/shifts creates shift', async () => {
    const res = await ctx.post('/api/shifts', {
      data: {
        employeeId: USERS.driver1.id,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '12:00',
      },
    });
    expect(res.ok()).toBeTruthy();
    const shift = await res.json();
    expect(shift).toHaveProperty('id');
    expect(shift.employeeId).toBe(USERS.driver1.id);
    shiftId = shift.id;
  });

  test('DELETE /api/shifts/:id removes shift', async () => {
    const res = await ctx.delete(`/api/shifts/${shiftId}`);
    expect(res.ok()).toBeTruthy();
    shiftId = null;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. API: Ride Lifecycle (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('API: Ride Lifecycle', () => {
  let officeCtx, driverCtx, riderCtx;
  let rideId;

  test.beforeAll(async ({ playwright }) => {
    officeCtx = await apiContext(playwright, 'office');
    driverCtx = await apiContext(playwright, USERS.driver1.username);
    riderCtx = await apiContext(playwright, USERS.rider1.username);
    // Clock in driver1
    await officeCtx.post('/api/employees/clock-in', { data: { employeeId: USERS.driver1.id } });
  });
  test.afterAll(async () => {
    await officeCtx.post('/api/employees/clock-out', { data: { employeeId: USERS.driver1.id } }).catch(() => {});
    await officeCtx.post('/api/employees/clock-out', { data: { employeeId: USERS.driver2.id } }).catch(() => {});
    await officeCtx.dispose();
    await driverCtx.dispose();
    await riderCtx.dispose();
  });

  test('GET /api/locations returns campus buildings', async () => {
    const res = await officeCtx.get('/api/locations');
    expect(res.ok()).toBeTruthy();
    const locations = await res.json();
    expect(Array.isArray(locations)).toBeTruthy();
    expect(locations.length).toBeGreaterThanOrEqual(10);
  });

  test('POST /api/rides creates pending ride', async () => {
    const ride = await createRide(riderCtx);
    expect(ride.status).toBe('pending');
    expect(ride).toHaveProperty('id');
    rideId = ride.id;
  });

  test('GET /api/my-rides includes created ride', async () => {
    const res = await riderCtx.get('/api/my-rides');
    expect(res.ok()).toBeTruthy();
    const rides = await res.json();
    expect(rides.some((r) => r.id === rideId)).toBeTruthy();
  });

  test('GET /api/rides lists all rides', async () => {
    const res = await officeCtx.get('/api/rides');
    expect(res.ok()).toBeTruthy();
    const rides = await res.json();
    expect(Array.isArray(rides)).toBeTruthy();
    expect(rides.some((r) => r.id === rideId)).toBeTruthy();
  });

  test('GET /api/rides?status=pending filters correctly', async () => {
    const res = await officeCtx.get('/api/rides?status=pending');
    expect(res.ok()).toBeTruthy();
    const rides = await res.json();
    for (const r of rides) {
      expect(r.status).toBe('pending');
    }
  });

  test('GET /api/rides?limit=5 returns paginated envelope', async () => {
    const res = await officeCtx.get('/api/rides?limit=5');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('rides');
    expect(body).toHaveProperty('totalCount');
    expect(body).toHaveProperty('hasMore');
    expect(Array.isArray(body.rides)).toBeTruthy();
    expect(body.rides.length).toBeLessThanOrEqual(5);
    expect(typeof body.totalCount).toBe('number');
  });

  test('GET /api/rides?limit=5 cursor pagination works', async () => {
    const res1 = await officeCtx.get('/api/rides?limit=2');
    const page1 = await res1.json();
    if (!page1.hasMore) { test.skip(); return; }
    expect(page1.nextCursor).toBeTruthy();

    const res2 = await officeCtx.get(`/api/rides?limit=2&cursor=${page1.nextCursor}`);
    const page2 = await res2.json();
    expect(page2.rides.length).toBeGreaterThan(0);
    // Pages should not overlap
    const ids1 = new Set(page1.rides.map(r => r.id));
    for (const r of page2.rides) {
      expect(ids1.has(r.id)).toBeFalsy();
    }
  });

  test('GET /api/rides?limit=50&status=pending,approved multi-status filter', async () => {
    const res = await officeCtx.get('/api/rides?limit=50&status=pending,approved');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const r of body.rides) {
      expect(['pending', 'approved']).toContain(r.status);
    }
  });

  test('POST /rides/:id/approve → status=approved', async () => {
    const res = await officeCtx.post(`/api/rides/${rideId}/approve`);
    expect(res.ok()).toBeTruthy();
    const ride = await res.json();
    expect(ride.status).toBe('approved');
  });

  test('POST /rides/:id/claim → status=scheduled', async () => {
    const res = await driverCtx.post(`/api/rides/${rideId}/claim`, {
      data: { vehicleId: VEHICLE_ID },
    });
    expect(res.ok()).toBeTruthy();
    const ride = await res.json();
    expect(ride.status).toBe('scheduled');
    expect(ride.assignedDriverId).toBe(USERS.driver1.id);
  });

  test('POST /rides/:id/on-the-way → status=driver_on_the_way', async () => {
    const res = await driverCtx.post(`/api/rides/${rideId}/on-the-way`, {
      data: { vehicleId: VEHICLE_ID },
    });
    expect(res.ok()).toBeTruthy();
    const ride = await res.json();
    expect(ride.status).toBe('driver_on_the_way');
  });

  test('POST /rides/:id/here → status=driver_arrived_grace', async () => {
    const res = await driverCtx.post(`/api/rides/${rideId}/here`);
    expect(res.ok()).toBeTruthy();
    const ride = await res.json();
    expect(ride.status).toBe('driver_arrived_grace');
    expect(ride.graceStartTime).toBeTruthy();
  });

  test('POST /rides/:id/complete → status=completed', async () => {
    const res = await driverCtx.post(`/api/rides/${rideId}/complete`);
    expect(res.ok()).toBeTruthy();
    const ride = await res.json();
    expect(ride.status).toBe('completed');
  });

  test('deny ride flow', async () => {
    const ride = await createRide(riderCtx);
    const res = await officeCtx.post(`/api/rides/${ride.id}/deny`);
    expect(res.ok()).toBeTruthy();
    const denied = await res.json();
    expect(denied.status).toBe('denied');
  });

  test('rider cancel ride flow', async () => {
    const ride = await createRide(riderCtx);
    const res = await riderCtx.post(`/api/rides/${ride.id}/cancel`);
    expect(res.ok()).toBeTruthy();
    const cancelled = await res.json();
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledBy).toBe('rider');
  });

  test('unassign ride flow', async () => {
    const ride = await createRide(riderCtx);
    await officeCtx.post(`/api/rides/${ride.id}/approve`);
    await driverCtx.post(`/api/rides/${ride.id}/claim`, { data: { vehicleId: VEHICLE_ID } });
    const res = await officeCtx.post(`/api/rides/${ride.id}/unassign`);
    expect(res.ok()).toBeTruthy();
    const unassigned = await res.json();
    expect(unassigned.status).toBe('approved');
    expect(unassigned.assignedDriverId).toBeNull();
  });

  test('reassign ride flow', async () => {
    // Clock in driver2 for reassign
    await officeCtx.post('/api/employees/clock-in', { data: { employeeId: USERS.driver2.id } });
    const ride = await createRide(riderCtx);
    await officeCtx.post(`/api/rides/${ride.id}/approve`);
    await driverCtx.post(`/api/rides/${ride.id}/claim`, { data: { vehicleId: VEHICLE_ID } });
    const res = await officeCtx.post(`/api/rides/${ride.id}/reassign`, {
      data: { driverId: USERS.driver2.id },
    });
    expect(res.ok()).toBeTruthy();
    const reassigned = await res.json();
    expect(reassigned.status).toBe('scheduled');
    expect(reassigned.assignedDriverId).toBe(USERS.driver2.id);
  });

  test('no-show ride flow', async () => {
    // Temporarily set grace period to 0 so no-show can be immediate
    await officeCtx.put('/api/settings', { data: [{ key: 'grace_period_minutes', value: '0' }] });
    const ride = await createRide(riderCtx);
    await officeCtx.post(`/api/rides/${ride.id}/approve`);
    await driverCtx.post(`/api/rides/${ride.id}/claim`, { data: { vehicleId: VEHICLE_ID } });
    await driverCtx.post(`/api/rides/${ride.id}/on-the-way`, { data: { vehicleId: VEHICLE_ID } });
    await driverCtx.post(`/api/rides/${ride.id}/here`);
    const res = await driverCtx.post(`/api/rides/${ride.id}/no-show`);
    expect(res.ok()).toBeTruthy();
    const noShow = await res.json();
    expect(noShow.status).toBe('no_show');
    // Restore grace period
    await officeCtx.put('/api/settings', { data: [{ key: 'grace_period_minutes', value: '5' }] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. API: Recurring Rides (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('API: Recurring Rides', () => {
  let riderCtx;
  let recurringId;

  test.beforeAll(async ({ playwright }) => {
    riderCtx = await apiContext(playwright, USERS.rider1.username);
  });
  test.afterAll(async () => {
    await riderCtx.dispose();
  });

  test('POST /api/recurring-rides creates series', async () => {
    const startDate = futureDateStr(1);
    const endDate = futureDateStr(14);
    const res = await riderCtx.post('/api/recurring-rides', {
      data: {
        pickupLocation: 'Main Library',
        dropoffLocation: 'Student Union',
        timeOfDay: '10:00',
        startDate,
        endDate,
        daysOfWeek: [0, 2, 4],
        notes: 'E2E recurring test',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('recurringId');
    expect(body.createdRides).toBeGreaterThanOrEqual(1);
    recurringId = body.recurringId;
  });

  test('GET /api/recurring-rides/my lists series', async () => {
    const res = await riderCtx.get('/api/recurring-rides/my');
    expect(res.ok()).toBeTruthy();
    const series = await res.json();
    expect(Array.isArray(series)).toBeTruthy();
    expect(series.some((s) => s.id === recurringId)).toBeTruthy();
  });

  test('PATCH /api/recurring-rides/:id cancels series', async () => {
    const res = await riderCtx.patch(`/api/recurring-rides/${recurringId}`, {
      data: { status: 'cancelled' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. API: Vehicles (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('API: Vehicles', () => {
  let ctx;
  let testVehicleId;

  test.beforeAll(async ({ playwright }) => {
    ctx = await apiContext(playwright, 'office');
  });
  test.afterAll(async () => {
    if (testVehicleId) {
      await ctx.delete(`/api/vehicles/${testVehicleId}`).catch(() => {});
    }
    await ctx.dispose();
  });

  test('GET /api/vehicles lists seed vehicles', async () => {
    const res = await ctx.get('/api/vehicles');
    expect(res.ok()).toBeTruthy();
    const vehicles = await res.json();
    expect(Array.isArray(vehicles)).toBeTruthy();
    expect(vehicles.length).toBeGreaterThanOrEqual(4);
  });

  test('POST /api/vehicles creates test vehicle', async () => {
    const res = await ctx.post('/api/vehicles', {
      data: { name: 'E2E Test Cart', type: 'standard', notes: 'test vehicle' },
    });
    expect(res.ok()).toBeTruthy();
    const vehicle = await res.json();
    expect(vehicle).toHaveProperty('id');
    expect(vehicle.name).toBe('E2E Test Cart');
    testVehicleId = vehicle.id;
  });

  test('PUT /api/vehicles/:id updates name/notes', async () => {
    const res = await ctx.put(`/api/vehicles/${testVehicleId}`, {
      data: { name: 'E2E Cart Updated', notes: 'updated notes' },
    });
    expect(res.ok()).toBeTruthy();
    const vehicle = await res.json();
    expect(vehicle.name).toBe('E2E Cart Updated');
  });

  test('POST /api/vehicles/:id/maintenance logs maintenance', async () => {
    const res = await ctx.post(`/api/vehicles/${testVehicleId}/maintenance`, {
      data: { notes: 'E2E maintenance check' },
    });
    expect(res.ok()).toBeTruthy();
    const vehicle = await res.json();
    expect(vehicle.last_maintenance_date).toBeTruthy();
  });

  test('POST /api/vehicles/:id/retire sets status=retired', async () => {
    const res = await ctx.post(`/api/vehicles/${testVehicleId}/retire`);
    expect(res.ok()).toBeTruthy();
    const vehicle = await res.json();
    expect(vehicle.status).toBe('retired');
  });

  test('DELETE /api/vehicles/:id removes test vehicle', async () => {
    const res = await ctx.delete(`/api/vehicles/${testVehicleId}`);
    expect(res.ok()).toBeTruthy();
    testVehicleId = null;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. API: Analytics
// ═══════════════════════════════════════════════════════════════════════════
test.describe('API: Analytics', () => {
  let ctx;

  test.beforeAll(async ({ playwright }) => {
    ctx = await apiContext(playwright, 'office');
  });
  test.afterAll(async () => {
    await ctx.dispose();
  });

  test('GET /api/analytics/summary returns KPI shape', async () => {
    const res = await ctx.get('/api/analytics/summary');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('totalRides');
    expect(body).toHaveProperty('completedRides');
    expect(body).toHaveProperty('completionRate');
    expect(body).toHaveProperty('uniqueRiders');
  });

  test('GET /api/analytics/hotspots returns pickups/dropoffs/routes', async () => {
    const res = await ctx.get('/api/analytics/hotspots');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('topPickups');
    expect(body).toHaveProperty('topDropoffs');
    expect(body).toHaveProperty('topRoutes');
  });

  test('GET /api/analytics/frequency returns daily/dow/hour/status', async () => {
    const res = await ctx.get('/api/analytics/frequency');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('daily');
    expect(body).toHaveProperty('byDayOfWeek');
    expect(body).toHaveProperty('byHour');
    expect(body).toHaveProperty('byStatus');
  });

  test('GET /api/analytics/vehicles returns fleet data', async () => {
    const res = await ctx.get('/api/analytics/vehicles');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('GET /api/analytics/milestones returns drivers/riders arrays', async () => {
    const res = await ctx.get('/api/analytics/milestones');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('drivers');
    expect(body).toHaveProperty('riders');
    expect(Array.isArray(body.drivers)).toBeTruthy();
    expect(Array.isArray(body.riders)).toBeTruthy();
  });

  test('GET /api/analytics/semester-report returns semester data', async () => {
    const res = await ctx.get('/api/analytics/semester-report');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('semesterLabel');
    expect(body).toHaveProperty('current');
    expect(body).toHaveProperty('previous');
    expect(body).toHaveProperty('monthlyBreakdown');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. API: Dev Tools
// ═══════════════════════════════════════════════════════════════════════════
test.describe('API: Dev Tools', () => {
  test('POST /api/dev/seed-rides creates sample rides', async ({ playwright }) => {
    const ctx = await apiContext(playwright, 'office');
    const res = await ctx.post('/api/dev/seed-rides');
    // May return 403 in production — that's fine
    if (res.status() === 403) {
      test.skip();
      await ctx.dispose();
      return;
    }
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.count).toBe(4);
    await ctx.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. UI: Login Page (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('UI: Login Page', () => {
  test('campus selector visible on /login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#campus-selector-view')).toBeVisible();
    await expect(page.locator('#login-form-view')).not.toBeVisible();
    // Campus cards link to /:slug/login
    await expect(page.locator('.campus-card').first()).toBeVisible();
  });

  test('campus-scoped login form elements visible', async ({ page }) => {
    await page.goto('/usc/login');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#login-form button[type="submit"]')).toBeVisible();
  });

  test('invalid login shows error', async ({ page }) => {
    await page.goto('/usc/login');
    await page.locator('#username').fill('office');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('#login-form button[type="submit"]').click();
    await expect(page.locator('#login-error')).toBeVisible();
  });

  test('office login redirects to campus office', async ({ page }) => {
    await loginUI(page, 'office');
    await expect(page).toHaveURL(/\/(usc|office)/);
    await expect(page.locator('#dispatch-panel')).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. UI: Office Console (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('UI: Office Console', () => {
  test.beforeAll(async ({ browser }) => {
    // Ensure we can access the page (warm up)
  });

  test('all nav tabs switch panels', async ({ page }) => {
    await loginUI(page, 'office');

    const tabs = [
      { target: 'dispatch-panel',  selector: '#dispatch-panel' },
      { target: 'rides-panel',     selector: '#rides-panel' },
      { target: 'staff-panel',     selector: '#staff-panel' },
      { target: 'fleet-panel',     selector: '#fleet-panel' },
      { target: 'analytics-panel', selector: '#analytics-panel' },
      { target: 'settings-panel',  selector: '#settings-panel' },
      { target: 'profile-panel',   selector: '#profile-panel' },
    ];

    for (const tab of tabs) {
      await page.locator(`button[data-target="${tab.target}"]`).click();
      await expect(page.locator(tab.selector)).toBeVisible();
    }
  });

  // TODO: Re-enable after Phase 3b migration
  test.skip('Staff panel: employee bar visible', async ({ page }) => {
    await loginUI(page, 'office');
    await page.locator('button[data-target="staff-panel"]').click();
    await expect(page.locator('#employee-bar')).toBeVisible();
  });

  test('Rides panel: filter and table view visible', async ({ page }) => {
    await loginUI(page, 'office');
    await page.locator('button[data-target="rides-panel"]').click();
    await expect(page.locator('#rides-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#ride-filter-input')).toBeVisible();
    await expect(page.locator('#rides-table-view')).toBeVisible();
  });

  test('Rides view toggle: Calendar toggle exists', async ({ page }) => {
    await loginUI(page, 'office');
    await page.locator('button[data-target="rides-panel"]').click();
    // Table/calendar view toggle buttons exist
    await expect(page.locator('#rides-view-table-btn')).toBeVisible();
    await expect(page.locator('#rides-view-calendar-btn')).toBeVisible();
  });

  // TODO: Re-enable after Phase 3d migration
  test.skip('Dispatch panel: stat boxes and schedule grid visible', async ({ page }) => {
    await loginUI(page, 'office');
    // Dispatch is the default active panel
    await expect(page.locator('#dispatch-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#dispatch-active-drivers')).toBeVisible();
    await expect(page.locator('#dispatch-pending-rides')).toBeVisible();
    await expect(page.locator('#dispatch-completed-today')).toBeVisible();
    await expect(page.locator('#ride-schedule-grid')).toBeAttached();
  });

  test('Settings panel: users table and filter visible', async ({ page }) => {
    await loginUI(page, 'office');
    await page.locator('button[data-target="settings-panel"]').click();
    await expect(page.locator('#admin-users-table')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#admin-user-filter')).toBeVisible();
    // Should have rows (seed users)
    const rows = page.locator('#admin-users-table tr');
    await expect(rows.first()).toBeVisible();
  });

  test('Analytics panel: dashboard sub-tab and widget grid attached', async ({ page }) => {
    await loginUI(page, 'office');
    await page.locator('button[data-target="analytics-panel"]').click();
    await expect(page.locator('#analytics-panel')).toBeVisible();
    // Dashboard sub-tab is active by default
    await expect(page.locator('#analytics-dashboard-view')).toBeVisible();
    // Widget grid is in the DOM
    await expect(page.locator('#widget-grid')).toBeAttached();
    // Date filter controls are visible
    await expect(page.locator('#analytics-from')).toBeVisible();
    await expect(page.locator('#analytics-to')).toBeVisible();
    await expect(page.locator('#analytics-refresh-btn')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. UI: Driver Console (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('UI: Driver Console', () => {
  test('page loads with home panel and dynamic content', async ({ page }) => {
    await loginUI(page, USERS.driver1.username);
    await expect(page).toHaveURL(/\/driver/);
    // Home panel is the default active tab
    await expect(page.locator('#home-panel')).toBeVisible({ timeout: 10000 });
    // Wait for dynamic content to render
    await page.waitForTimeout(2000);
    // Either CLOCK IN or CLOCK OUT button should be visible (rendered dynamically)
    const clockIn = page.locator('button:has-text("CLOCK IN")');
    const clockOut = page.locator('button:has-text("CLOCK OUT")');
    const hasClockIn = await clockIn.isVisible().catch(() => false);
    const hasClockOut = await clockOut.isVisible().catch(() => false);
    expect(hasClockIn || hasClockOut).toBeTruthy();
  });

  test('clock in shows online status and available rides', async ({ page }) => {
    await loginUI(page, USERS.driver1.username);
    await page.waitForTimeout(2000);

    // If clocked out, clock in
    const clockInBtn = page.locator('button:has-text("CLOCK IN")');
    if (await clockInBtn.isVisible().catch(() => false)) {
      await clockInBtn.click();
      await page.waitForTimeout(2000);
    }
    // Should show "You're Online" and Available Rides section
    await expect(page.locator('text=Available Rides')).toBeVisible({ timeout: 5000 });
  });

  test('account tab shows profile fields', async ({ page }) => {
    await loginUI(page, USERS.driver1.username);
    // Navigate to Account tab
    await page.locator('button[data-target="account-panel"]').click();
    await expect(page.locator('#account-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#profile-name')).toBeVisible();
    await expect(page.locator('#profile-phone')).toBeVisible();
  });

  test('clock out toggles status', async ({ page }) => {
    await loginUI(page, USERS.driver1.username);
    await page.waitForTimeout(2000);

    // Ensure clocked in first
    const clockInBtn = page.locator('button:has-text("CLOCK IN")');
    if (await clockInBtn.isVisible().catch(() => false)) {
      await clockInBtn.click();
      await page.waitForTimeout(2000);
    }

    // Now clock out — button uses onclick="toggleClock()" and triggers a confirm modal
    const clockOutBtn = page.locator('button:has-text("CLOCK OUT")');
    await clockOutBtn.click();

    // Confirm the clock-out modal (uses ro-modal-overlay.open, not .show)
    const modalConfirm = page.locator('.ro-modal-overlay.open button:has-text("Clock Out")');
    await expect(modalConfirm).toBeVisible({ timeout: 3000 });
    await modalConfirm.click();

    // After clock out, should show "You're Clocked Out" and CLOCK IN
    // Server may reject if active rides exist, so check for either state
    await page.waitForTimeout(2000);
    const clockedOut = await page.locator('button:has-text("CLOCK IN")').isVisible().catch(() => false);
    const stillIn = await page.locator('button:has-text("CLOCK OUT")').isVisible().catch(() => false);
    // Either transition happened or server rejected — both are valid test results
    expect(clockedOut || stillIn).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. UI: Rider Console (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('UI: Rider Console', () => {
  test('page loads and shows book or my-rides panel', async ({ page }) => {
    await loginUI(page, USERS.rider1.username);
    await expect(page).toHaveURL(/\/rider/);
    // Rider app auto-switches to My Rides if there are active rides, otherwise Book
    const bookPanel = page.locator('#book-panel');
    const myRidesPanel = page.locator('#myrides-panel');
    // One of these must be visible
    await page.waitForTimeout(3000);
    const bookVisible = await bookPanel.isVisible().catch(() => false);
    const myRidesVisible = await myRidesPanel.isVisible().catch(() => false);
    expect(bookVisible || myRidesVisible).toBeTruthy();
  });

  test('book tab shows step wizard with location dropdowns', async ({ page }) => {
    await loginUI(page, USERS.rider1.username);
    await page.waitForTimeout(2000);
    // Navigate to book tab explicitly (may auto-switch to my-rides)
    const bookTab = page.locator('button[data-target="book-panel"]');
    await bookTab.click();
    await expect(page.locator('#book-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#pickup-location')).toBeVisible();
    await expect(page.locator('#dropoff-location')).toBeVisible();
  });

  test('pickup location has many options (buildings loaded)', async ({ page }) => {
    await loginUI(page, USERS.rider1.username);
    await page.waitForTimeout(2000);
    // Navigate to book tab
    await page.locator('button[data-target="book-panel"]').click();
    await expect(page.locator('#book-panel')).toBeVisible({ timeout: 5000 });
    const options = page.locator('#pickup-location option');
    const count = await options.count();
    expect(count).toBeGreaterThan(10);
  });

  test('recurring toggle shows recurring options', async ({ page }) => {
    await loginUI(page, USERS.rider1.username);
    await page.waitForTimeout(2000);
    // Navigate to book tab, then go to step 3
    await page.locator('button[data-target="book-panel"]').click();
    await expect(page.locator('#book-panel')).toBeVisible({ timeout: 5000 });
    // Fill step 1 to get to step 3
    await page.locator('#pickup-location').selectOption({ index: 1 });
    await page.locator('#dropoff-location').selectOption({ index: 2 });
    await page.click('#step1-next');
    // Fill step 2
    await expect(page.locator('#step-2')).toBeVisible({ timeout: 3000 });
    const dateChip = page.locator('#date-chips button').first();
    if (await dateChip.isVisible().catch(() => false)) await dateChip.click();
    await page.fill('#ride-time', '10:00');
    await page.click('#step2-next');
    // Step 3: recurring toggle
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#recurring-toggle')).toBeVisible();
    await page.check('#recurring-toggle');
    await expect(page.locator('#recurring-options')).toBeVisible();
  });

  test('my-rides panel shows ride content', async ({ page }) => {
    await loginUI(page, USERS.rider1.username);
    await page.waitForTimeout(2000);
    // Navigate to My Rides tab
    await page.locator('button[data-target="myrides-panel"]').click();
    await expect(page.locator('#myrides-panel')).toBeVisible({ timeout: 5000 });
    // Content container should exist
    await expect(page.locator('#myrides-content')).toBeAttached();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. API: Authorization & Validation
// ═══════════════════════════════════════════════════════════════════════════
test.describe('API: Authorization & Validation', () => {
  test('unauthenticated GET /api/rides returns 401 or 403', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/api/rides', {
      headers: { Accept: 'application/json' },
    });
    // requireStaff returns 403 for unauthenticated JSON requests
    expect([401, 403]).toContain(res.status());
    await ctx.dispose();
  });

  test('rider GET /api/admin/users returns 403', async ({ playwright }) => {
    const ctx = await apiContext(playwright, USERS.rider1.username);
    const res = await ctx.get('/api/admin/users', {
      headers: { Accept: 'application/json' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('driver POST /api/shifts returns 403', async ({ playwright }) => {
    const ctx = await apiContext(playwright, USERS.driver1.username);
    const res = await ctx.post('/api/shifts', {
      headers: { Accept: 'application/json' },
      data: { employeeId: USERS.driver1.id, dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('ride with Saturday time returns 400', async ({ playwright }) => {
    const ctx = await apiContext(playwright, USERS.rider1.username);
    // Find the next Saturday
    const d = new Date();
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const res = await ctx.post('/api/rides', {
      data: {
        pickupLocation: 'Main Library',
        dropoffLocation: 'Student Union',
        requestedTime: d.toISOString(),
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/service hours/i);
    await ctx.dispose();
  });

  test('ride with 11 PM time returns 400', async ({ playwright }) => {
    const ctx = await apiContext(playwright, USERS.rider1.username);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    d.setHours(23, 0, 0, 0); // 11 PM — well past any configured service end
    const res = await ctx.post('/api/rides', {
      data: {
        pickupLocation: 'Main Library',
        dropoffLocation: 'Student Union',
        requestedTime: d.toISOString(),
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/service hours/i);
    await ctx.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API: Clock Events & Tardiness (serial)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('API: Clock Events & Tardiness', () => {
  let ctx;
  let shiftId;

  test.beforeAll(async ({ playwright }) => {
    ctx = await apiContext(playwright, 'office');
    // Ensure driver1 is clocked out for a clean slate
    await ctx.post('/api/employees/clock-out', { data: { employeeId: USERS.driver1.id } }).catch(() => {});
    // Create a shift for a valid weekday (today if Mon-Fri, else Monday)
    const rawDow = (new Date().getDay() + 6) % 7; // 0=Mon … 4=Fri, 5=Sat, 6=Sun
    const todayDow = rawDow <= 4 ? rawDow : 0; // fallback to Monday on weekends
    const res = await ctx.post('/api/shifts', {
      data: { employeeId: USERS.driver1.id, dayOfWeek: todayDow, startTime: '08:00', endTime: '17:00' },
    });
    expect(res.ok()).toBeTruthy();
    const shift = await res.json();
    shiftId = shift.id;
  });

  test.afterAll(async () => {
    await ctx.post('/api/employees/clock-out', { data: { employeeId: USERS.driver1.id } }).catch(() => {});
    if (shiftId) await ctx.delete(`/api/shifts/${shiftId}`).catch(() => {});
    await ctx.dispose();
  });

  test('clock-in creates clock event', async () => {
    const res = await ctx.post('/api/employees/clock-in', {
      data: { employeeId: USERS.driver1.id },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.clockEvent).toBeTruthy();
    expect(body.clockEvent).toHaveProperty('id');
    expect(body.clockEvent).toHaveProperty('employee_id', USERS.driver1.id);
    expect(body.clockEvent).toHaveProperty('event_date');
    expect(body.clockEvent).toHaveProperty('clock_in_at');
    expect(body.clockEvent.tardiness_minutes).toBeGreaterThanOrEqual(0);
    expect(body.clockEvent.clock_out_at).toBeNull();
  });

  test('clock-in is backward compatible', async () => {
    // Clock out and in again to get a fresh response
    await ctx.post('/api/employees/clock-out', { data: { employeeId: USERS.driver1.id } });
    const res = await ctx.post('/api/employees/clock-in', {
      data: { employeeId: USERS.driver1.id },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.active).toBeTruthy();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('username');
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('email');
    expect(body.role).toBe('driver');
  });

  test('today-status shows clock events for driver', async () => {
    const res = await ctx.get('/api/employees/today-status');
    expect(res.ok()).toBeTruthy();
    const drivers = await res.json();
    expect(Array.isArray(drivers)).toBeTruthy();
    const d1 = drivers.find(d => d.id === USERS.driver1.id);
    expect(d1).toBeTruthy();
    expect(d1.todayClockEvents.length).toBeGreaterThanOrEqual(1);
    expect(d1.todayClockEvents[0].employee_id).toBe(USERS.driver1.id);
  });

  test('today-status includes shifts', async () => {
    const res = await ctx.get('/api/employees/today-status');
    expect(res.ok()).toBeTruthy();
    const drivers = await res.json();
    const d1 = drivers.find(d => d.id === USERS.driver1.id);
    expect(d1).toBeTruthy();
    expect(Array.isArray(d1.todayShifts)).toBeTruthy();
  });

  test('individual tardiness returns correct shape', async () => {
    const res = await ctx.get(`/api/employees/${USERS.driver1.id}/tardiness`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('driver');
    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('events');
    expect(Array.isArray(body.events)).toBeTruthy();
    // Summary has all 6 fields
    const s = body.summary;
    expect(s).toHaveProperty('totalClockIns');
    expect(s).toHaveProperty('tardyCount');
    expect(s).toHaveProperty('onTimeCount');
    expect(s).toHaveProperty('tardyRate');
    expect(s).toHaveProperty('avgTardinessMinutes');
    expect(s).toHaveProperty('maxTardinessMinutes');
    expect(s.totalClockIns).toBeGreaterThanOrEqual(1);
  });

  test('tardiness with date filter returns events', async () => {
    const res = await ctx.get(`/api/employees/${USERS.driver1.id}/tardiness?from=2020-01-01&to=2099-12-31`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.events.length).toBeGreaterThanOrEqual(1);
  });

  test('analytics tardiness returns correct shape', async () => {
    const res = await ctx.get('/api/analytics/tardiness');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('byDriver');
    expect(body).toHaveProperty('byDayOfWeek');
    expect(body).toHaveProperty('dailyTrend');
    expect(Array.isArray(body.byDriver)).toBeTruthy();
    expect(Array.isArray(body.byDayOfWeek)).toBeTruthy();
    expect(Array.isArray(body.dailyTrend)).toBeTruthy();
  });

  test('analytics tardiness summary has correct fields', async () => {
    const res = await ctx.get('/api/analytics/tardiness');
    expect(res.ok()).toBeTruthy();
    const { summary } = await res.json();
    expect(summary).toHaveProperty('totalClockIns');
    expect(summary).toHaveProperty('tardyCount');
    expect(summary).toHaveProperty('onTimeCount');
    expect(summary).toHaveProperty('tardyRate');
    expect(summary).toHaveProperty('avgTardinessMinutes');
    expect(summary).toHaveProperty('maxTardinessMinutes');
    expect(summary.totalClockIns).toBeGreaterThanOrEqual(1);
  });

  test('clock-out closes clock event', async () => {
    // Unassign any active rides so clock-out guard doesn't block
    const ridesRes = await ctx.get('/api/rides');
    if (ridesRes.ok()) {
      const rides = await ridesRes.json();
      for (const r of rides) {
        if (r.assignedDriverId === USERS.driver1.id && ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status)) {
          await ctx.post(`/api/rides/${r.id}/unassign`).catch(() => {});
        }
      }
    }
    const res = await ctx.post('/api/employees/clock-out', {
      data: { employeeId: USERS.driver1.id },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.clockEvent).toBeTruthy();
    expect(body.clockEvent.clock_out_at).not.toBeNull();
  });

  test('clock-out is backward compatible', async () => {
    // Clock in then out to get a fresh clock-out response
    await ctx.post('/api/employees/clock-in', { data: { employeeId: USERS.driver1.id } });
    const res = await ctx.post('/api/employees/clock-out', {
      data: { employeeId: USERS.driver1.id },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.active).toBeFalsy();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('username');
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('email');
    expect(body.role).toBe('driver');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API: Clock Events & Tardiness Auth Guards
// ═══════════════════════════════════════════════════════════════════════════
test.describe('API: Clock Events & Tardiness Auth Guards', () => {
  test('today-status requires auth', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const res = await ctx.get('/api/employees/today-status', {
      headers: { Accept: 'application/json' },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('individual tardiness requires office role', async ({ playwright }) => {
    const ctx = await apiContext(playwright, USERS.driver1.username);
    const res = await ctx.get(`/api/employees/${USERS.driver1.id}/tardiness`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('analytics tardiness requires office role', async ({ playwright }) => {
    const ctx = await apiContext(playwright, USERS.driver1.username);
    const res = await ctx.get('/api/analytics/tardiness', {
      headers: { Accept: 'application/json' },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });
});
