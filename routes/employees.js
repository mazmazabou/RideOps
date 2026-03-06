'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    wrapAsync,
    requireStaff,
    requireOffice,
    generateId,
    getEmployees,
    findTodayShift,
    getSetting,
    formatLocalDate,
    TENANT,
    dispatchNotification,
    sendUserNotification
  } = ctx;

  // ----- Employee endpoints -----
  app.get('/api/employees', requireStaff, wrapAsync(async (req, res) => {
    const employees = await getEmployees();
    res.json(employees.map(({ password_hash, ...rest }) => rest));
  }));

  app.post('/api/employees/clock-in', requireStaff, wrapAsync(async (req, res) => {
    const { employeeId } = req.body;
    const result = await query(
      `UPDATE users SET active = TRUE, updated_at = NOW() WHERE id = $1 AND role = 'driver' AND deleted_at IS NULL RETURNING id, username, name, email, role, active`,
      [employeeId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Employee not found' });

    let clockEvent = null;
    try {
      const now = new Date();
      const local = new Date(now.toLocaleString('en-US', { timeZone: TENANT.timezone }));
      const eventDate = formatLocalDate(now);
      const nowMinutes = local.getHours() * 60 + local.getMinutes();

      const shift = await findTodayShift(employeeId);
      let tardinessMinutes = 0;
      let scheduledStart = null;
      let shiftId = null;

      if (shift) {
        shiftId = shift.id;
        scheduledStart = shift.start_time;
        const [h, m] = shift.start_time.split(':').map(Number);
        const tardyThreshold = await getSetting('tardy_threshold_minutes', 1);
        const rawLateness = nowMinutes - (h * 60 + m);
        tardinessMinutes = rawLateness > Number(tardyThreshold) ? rawLateness : 0;
      }

      const clockId = generateId('clock');
      const ceResult = await query(
        `INSERT INTO clock_events (id, employee_id, shift_id, event_date, scheduled_start, clock_in_at, tardiness_minutes)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6) RETURNING *`,
        [clockId, employeeId, shiftId, eventDate, scheduledStart, tardinessMinutes]
      );
      clockEvent = ceResult.rows[0];
    } catch (err) {
      console.error('Clock event recording failed (clock-in still succeeded):', err.message);
    }

    res.json({ ...result.rows[0], clockEvent });

    // Fire-and-forget: notify if tardy
    if (clockEvent && clockEvent.tardiness_minutes > 0) {
      const notifyTardy = (await getSetting('notify_office_tardy', 'true')) !== 'false';
      if (notifyTardy) dispatchNotification('driver_tardy', {
        driverName: result.rows[0].name,
        tardyMinutes: clockEvent.tardiness_minutes,
        scheduledStart: clockEvent.scheduled_start || 'N/A',
        clockInTime: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TENANT.timezone }),
        thresholdCheck: clockEvent.tardiness_minutes
      }, query).catch(() => {});

      // Notify the driver themselves (preference-aware)
      sendUserNotification(employeeId, 'driver_late_clock_in', {
        driverName: result.rows[0].name,
        tardyMinutes: clockEvent.tardiness_minutes,
        scheduledStart: clockEvent.scheduled_start || 'N/A',
        clockInTime: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TENANT.timezone }),
      }, query).catch(() => {});
    }
  }));

  app.post('/api/employees/clock-out', requireStaff, wrapAsync(async (req, res) => {
    const { employeeId } = req.body;

    // Check for active rides assigned to this driver
    const activeRides = await query(
      `SELECT id, status FROM rides
       WHERE assigned_driver_id = $1
       AND status IN ('scheduled', 'driver_on_the_way', 'driver_arrived_grace')`,
      [employeeId]
    );
    if (activeRides.rows.length > 0) {
      return res.status(409).json({
        error: `You have ${activeRides.rows.length} active ride(s). Please complete or unassign them before clocking out.`,
        activeRides: activeRides.rows.map(r => ({ id: r.id, status: r.status }))
      });
    }

    const result = await query(
      `UPDATE users SET active = FALSE, updated_at = NOW() WHERE id = $1 AND role = 'driver' AND deleted_at IS NULL RETURNING id, username, name, email, role, active`,
      [employeeId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Employee not found' });

    let clockEvent = null;
    try {
      const ceResult = await query(
        `UPDATE clock_events SET clock_out_at = NOW()
         WHERE id = (SELECT id FROM clock_events WHERE employee_id = $1 AND clock_out_at IS NULL
                     ORDER BY clock_in_at DESC LIMIT 1)
         RETURNING *`,
        [employeeId]
      );
      clockEvent = ceResult.rows[0] || null;
    } catch (err) {
      console.error('Clock event recording failed (clock-out still succeeded):', err.message);
    }

    res.json({ ...result.rows[0], clockEvent });
  }));

  app.get('/api/employees/today-status', requireStaff, wrapAsync(async (req, res) => {
    try {
      const now = new Date();
      const local = new Date(now.toLocaleString('en-US', { timeZone: TENANT.timezone }));
      const todayDate = formatLocalDate(now);
      const todayDow = (local.getDay() + 6) % 7;
      const monday = new Date(local);
      monday.setDate(local.getDate() - todayDow);
      const weekStart = formatLocalDate(monday);

      const [driversRes, clockRes, shiftsRes] = await Promise.all([
        query(`SELECT id, username, name, email, phone, role, active FROM users WHERE role = 'driver' AND deleted_at IS NULL ORDER BY name`),
        query(`SELECT * FROM clock_events WHERE event_date = $1 ORDER BY clock_in_at`, [todayDate]),
        query(
          `SELECT id, employee_id, start_time, end_time, notes, week_start FROM shifts
           WHERE day_of_week = $1 AND (week_start IS NULL OR week_start = $2)
           ORDER BY start_time`, [todayDow, weekStart]
        )
      ]);

      const clockByDriver = {};
      for (const ce of clockRes.rows) {
        if (!clockByDriver[ce.employee_id]) clockByDriver[ce.employee_id] = [];
        clockByDriver[ce.employee_id].push(ce);
      }

      const shiftsByDriver = {};
      for (const s of shiftsRes.rows) {
        if (!shiftsByDriver[s.employee_id]) shiftsByDriver[s.employee_id] = [];
        shiftsByDriver[s.employee_id].push(s);
      }

      const drivers = driversRes.rows.map(d => ({
        ...d,
        todayClockEvents: clockByDriver[d.id] || [],
        todayShifts: shiftsByDriver[d.id] || []
      }));

      res.json(drivers);
    } catch (err) {
      console.error('today-status error:', err);
      res.status(500).json({ error: 'Failed to fetch today status' });
    }
  }));

  app.get('/api/employees/:id/tardiness', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { id } = req.params;
      const { from, to } = req.query;

      const driverRes = await query(
        `SELECT id, username, name, email FROM users WHERE id = $1 AND role = 'driver' AND deleted_at IS NULL`, [id]
      );
      if (!driverRes.rowCount) return res.status(404).json({ error: 'Driver not found' });

      let eventsQuery = `SELECT * FROM clock_events WHERE employee_id = $1`;
      const params = [id];
      if (from) { params.push(from); eventsQuery += ` AND event_date >= $${params.length}`; }
      if (to) { params.push(to); eventsQuery += ` AND event_date <= $${params.length}`; }
      eventsQuery += ` ORDER BY clock_in_at DESC`;

      const eventsRes = await query(eventsQuery, params);
      const events = eventsRes.rows;

      const totalClockIns = events.length;
      const tardyEvents = events.filter(e => e.tardiness_minutes > 0);
      const tardyCount = tardyEvents.length;
      const onTimeCount = totalClockIns - tardyCount;
      const tardyRate = totalClockIns > 0 ? Math.round((tardyCount / totalClockIns) * 100) : 0;
      const avgTardinessMinutes = tardyCount > 0
        ? Math.round(tardyEvents.reduce((sum, e) => sum + e.tardiness_minutes, 0) / tardyCount)
        : 0;
      const maxTardinessMinutes = tardyCount > 0
        ? Math.max(...tardyEvents.map(e => e.tardiness_minutes))
        : 0;

      res.json({
        driver: driverRes.rows[0],
        summary: { totalClockIns, tardyCount, onTimeCount, tardyRate, avgTardinessMinutes, maxTardinessMinutes },
        events
      });
    } catch (err) {
      console.error('tardiness error:', err);
      res.status(500).json({ error: 'Failed to fetch tardiness data' });
    }
  }));
};
