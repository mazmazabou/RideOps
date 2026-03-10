// routes/analytics.js
// Analytics API endpoints extracted from server.js (lines 2818–4905).
// Mounted by server.js via: require('./routes/analytics')(app, ctx)

'use strict';

module.exports = function registerAnalyticsRoutes(app, ctx) {
  const { query, wrapAsync, requireOffice, ExcelJS, getSetting } = ctx;

  // ----- Analytics endpoints -----
  function buildDateFilter(qp) {
    let clause = '';
    const params = [];
    if (qp.from) { params.push(qp.from); clause += ` AND requested_time >= $${params.length}`; }
    if (qp.to) { params.push(qp.to + 'T23:59:59.999Z'); clause += ` AND requested_time <= $${params.length}`; }
    return { clause, params };
  }

  app.get('/api/analytics/summary', requireOffice, wrapAsync(async (req, res) => {
    const { clause, params } = buildDateFilter(req.query);
    const result = await query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
         COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
         COUNT(*) FILTER (WHERE status = 'denied') AS denied,
         COUNT(*) FILTER (WHERE status IN ('pending','approved','scheduled','driver_on_the_way','driver_arrived_grace')) AS active,
         COUNT(DISTINCT rider_email) AS unique_riders,
         COUNT(DISTINCT rider_email) FILTER (WHERE status = 'completed') AS people_helped,
         COUNT(DISTINCT assigned_driver_id) FILTER (WHERE assigned_driver_id IS NOT NULL) AS unique_drivers
       FROM rides WHERE 1=1 ${clause}`, params
    );
    const r = result.rows[0];
    const total = parseInt(r.total) || 0;
    const completed = parseInt(r.completed) || 0;
    res.json({
      totalRides: total,
      completedRides: completed,
      cancelledRides: parseInt(r.cancelled) || 0,
      noShows: parseInt(r.no_shows) || 0,
      deniedRides: parseInt(r.denied) || 0,
      activeRides: parseInt(r.active) || 0,
      uniqueRiders: parseInt(r.unique_riders) || 0,
      peopleHelped: parseInt(r.people_helped) || 0,
      uniqueDrivers: parseInt(r.unique_drivers) || 0,
      completionRate: total > 0 ? parseFloat((completed / total * 100).toFixed(1)) : 0,
      cancellationRate: total > 0 ? parseFloat((parseInt(r.cancelled) / total * 100).toFixed(1)) : 0,
      noShowRate: total > 0 ? parseFloat((parseInt(r.no_shows) / total * 100).toFixed(1)) : 0
    });
  }));

  app.get('/api/analytics/hotspots', requireOffice, wrapAsync(async (req, res) => {
    const { clause, params } = buildDateFilter(req.query);
    const statusFilter = `AND status NOT IN ('denied','cancelled')`;
    const [pickupRes, dropoffRes, routeRes, matrixRes] = await Promise.all([
      query(`SELECT pickup_location AS location, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY pickup_location ORDER BY count DESC LIMIT 10`, params),
      query(`SELECT dropoff_location AS location, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY dropoff_location ORDER BY count DESC LIMIT 10`, params),
      query(`SELECT pickup_location || ' → ' || dropoff_location AS route, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY pickup_location, dropoff_location ORDER BY count DESC LIMIT 10`, params),
      query(`SELECT pickup_location, dropoff_location, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY pickup_location, dropoff_location ORDER BY count DESC LIMIT 50`, params)
    ]);
    res.json({
      topPickups: pickupRes.rows,
      topDropoffs: dropoffRes.rows,
      topRoutes: routeRes.rows,
      matrix: matrixRes.rows
    });
  }));

  app.get('/api/analytics/frequency', requireOffice, wrapAsync(async (req, res) => {
    const { clause, params } = buildDateFilter(req.query);
    const rClause = clause.replace(/requested_time/g, 'r.requested_time');
    const [dailyRes, dowRes, hourRes, topRidersRes, topDriversRes, statusRes] = await Promise.all([
      query(`SELECT DATE(requested_time) AS date, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
               COUNT(*) FILTER (WHERE status = 'no_show') AS no_show
             FROM rides WHERE 1=1 ${clause} GROUP BY DATE(requested_time) ORDER BY date`, params),
      query(`SELECT EXTRACT(DOW FROM requested_time)::int AS dow, COUNT(*) AS count
             FROM rides WHERE 1=1 ${clause} GROUP BY dow ORDER BY dow`, params),
      query(`SELECT EXTRACT(HOUR FROM requested_time)::int AS hour, COUNT(*) AS count
             FROM rides WHERE 1=1 ${clause} GROUP BY hour ORDER BY hour`, params),
      query(`SELECT rider_email, rider_name, COUNT(*) AS count,
               COUNT(*) FILTER (WHERE status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows
             FROM rides WHERE 1=1 ${clause} GROUP BY rider_email, rider_name ORDER BY count DESC LIMIT 10`, params),
      query(`SELECT u.name, r.assigned_driver_id, COUNT(*) AS count,
               COUNT(*) FILTER (WHERE r.status = 'completed') AS completed
             FROM rides r JOIN users u ON r.assigned_driver_id = u.id
             WHERE r.assigned_driver_id IS NOT NULL ${rClause}
             GROUP BY u.name, r.assigned_driver_id ORDER BY count DESC LIMIT 10`, params),
      query(`SELECT status, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} GROUP BY status ORDER BY count DESC`, params)
    ]);
    res.json({
      daily: dailyRes.rows,
      byDayOfWeek: dowRes.rows,
      byHour: hourRes.rows,
      topRiders: topRidersRes.rows,
      topDrivers: topDriversRes.rows,
      byStatus: statusRes.rows
    });
  }));

  app.get('/api/analytics/vehicles', requireOffice, wrapAsync(async (req, res) => {
    const { clause, params } = buildDateFilter(req.query);
    const rClause = clause.replace(/requested_time/g, 'r.requested_time');
    const [vehiclesRes, usageRes] = await Promise.all([
      query(`SELECT * FROM vehicles ORDER BY name`),
      query(`SELECT v.id, COUNT(r.id) AS ride_count, MAX(r.requested_time) AS last_used
             FROM vehicles v LEFT JOIN rides r ON r.vehicle_id = v.id AND r.status = 'completed' ${rClause}
             GROUP BY v.id`, params)
    ]);
    const vehicles = vehiclesRes.rows.map(v => {
      const usage = usageRes.rows.find(u => u.id === v.id);
      const daysSince = v.last_maintenance_date
        ? Math.floor((Date.now() - new Date(v.last_maintenance_date).getTime()) / 86400000)
        : null;
      return {
        ...v,
        rideCount: parseInt(usage?.ride_count || 0),
        lastUsed: usage?.last_used || null,
        daysSinceMaintenance: daysSince,
        maintenanceOverdue: daysSince !== null && daysSince > 30
      };
    });
    res.json(vehicles);
  }));

  app.get('/api/analytics/milestones', requireOffice, wrapAsync(async (req, res) => {
    const thresholds = [50, 100, 250, 500, 1000];
    const includeDeleted = req.query.include_deleted === 'true';
    const deletedFilter = includeDeleted ? '' : 'AND u.deleted_at IS NULL';
    const [driverRes, riderRes] = await Promise.all([
      query(`SELECT u.id, u.name, COUNT(r.id) AS ride_count
             FROM users u LEFT JOIN rides r ON r.assigned_driver_id = u.id AND r.status = 'completed'
             WHERE u.role = 'driver' ${deletedFilter} GROUP BY u.id, u.name ORDER BY ride_count DESC`),
      includeDeleted
        ? query(`SELECT rider_email, rider_name, COUNT(*) AS ride_count
                 FROM rides WHERE status = 'completed'
                 GROUP BY rider_email, rider_name ORDER BY ride_count DESC`)
        : query(`SELECT r.rider_email, r.rider_name, COUNT(*) AS ride_count
                 FROM rides r INNER JOIN users u ON u.email = r.rider_email AND u.deleted_at IS NULL
                 WHERE r.status = 'completed'
                 GROUP BY r.rider_email, r.rider_name ORDER BY ride_count DESC`)
    ]);
    function compute(rows) {
      return rows.map(row => {
        const count = parseInt(row.ride_count);
        const achieved = thresholds.filter(m => count >= m);
        const next = thresholds.find(m => count < m) || null;
        return {
          name: row.name || row.rider_name,
          id: row.id || row.rider_email,
          rideCount: count,
          achievedMilestones: achieved,
          nextMilestone: next,
          progressToNext: next ? parseFloat((count / next * 100).toFixed(1)) : 100
        };
      });
    }
    res.json({ drivers: compute(driverRes.rows), riders: compute(riderRes.rows) });
  }));

  app.get('/api/analytics/semester-report', requireOffice, wrapAsync(async (req, res) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let semesterLabel, currentStart, currentEnd, prevLabel, prevStart, prevEnd;
    if (month <= 4) {
      semesterLabel = `Spring ${year}`;
      currentStart = `${year}-01-10`; currentEnd = `${year}-05-15`;
      prevLabel = `Fall ${year - 1}`;
      prevStart = `${year - 1}-08-15`; prevEnd = `${year - 1}-12-15`;
    } else if (month >= 7) {
      semesterLabel = `Fall ${year}`;
      currentStart = `${year}-08-15`; currentEnd = `${year}-12-15`;
      prevLabel = `Spring ${year}`;
      prevStart = `${year}-01-10`; prevEnd = `${year}-05-15`;
    } else {
      semesterLabel = `Summer ${year}`;
      currentStart = `${year}-05-16`; currentEnd = `${year}-08-14`;
      prevLabel = `Spring ${year}`;
      prevStart = `${year}-01-10`; prevEnd = `${year}-05-15`;
    }

    async function semesterStats(start, end) {
      const r = await query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
                COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
                COUNT(DISTINCT rider_email) AS unique_riders,
                COUNT(DISTINCT rider_email) FILTER (WHERE status = 'completed') AS people_helped,
                COUNT(DISTINCT assigned_driver_id) FILTER (WHERE assigned_driver_id IS NOT NULL) AS unique_drivers
         FROM rides WHERE requested_time >= $1 AND requested_time <= $2`,
        [start, end + 'T23:59:59.999Z']
      );
      const row = r.rows[0];
      const total = parseInt(row.total);
      return {
        totalRides: total,
        completedRides: parseInt(row.completed) || 0,
        noShows: parseInt(row.no_shows) || 0,
        cancelledRides: parseInt(row.cancelled) || 0,
        uniqueRiders: parseInt(row.unique_riders) || 0,
        peopleHelped: parseInt(row.people_helped) || 0,
        uniqueDrivers: parseInt(row.unique_drivers) || 0,
        completionRate: total > 0 ? parseFloat((parseInt(row.completed) / total * 100).toFixed(1)) : 0
      };
    }

    const [monthlyRes, topLocRes, driverBoardRes] = await Promise.all([
      query(`SELECT TO_CHAR(requested_time, 'YYYY-MM') AS month, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'completed') AS completed,
               COUNT(DISTINCT rider_email) AS riders
             FROM rides WHERE requested_time >= $1 AND requested_time <= $2
             GROUP BY month ORDER BY month`, [currentStart, currentEnd + 'T23:59:59.999Z']),
      query(`SELECT pickup_location AS location, COUNT(*) AS count
             FROM rides WHERE requested_time >= $1 AND requested_time <= $2 AND status NOT IN ('denied','cancelled')
             GROUP BY pickup_location ORDER BY count DESC LIMIT 5`, [currentStart, currentEnd + 'T23:59:59.999Z']),
      query(`SELECT u.name, COUNT(r.id) AS completed
             FROM rides r JOIN users u ON r.assigned_driver_id = u.id
             WHERE r.status = 'completed' AND r.requested_time >= $1 AND r.requested_time <= $2
             GROUP BY u.name ORDER BY completed DESC`, [currentStart, currentEnd + 'T23:59:59.999Z'])
    ]);

    const [current, previous] = await Promise.all([
      semesterStats(currentStart, currentEnd),
      semesterStats(prevStart, prevEnd)
    ]);

    res.json({
      semesterLabel,
      previousLabel: prevLabel,
      dateRange: { from: currentStart, to: currentEnd },
      current,
      previous,
      monthlyBreakdown: monthlyRes.rows,
      topLocations: topLocRes.rows,
      driverLeaderboard: driverBoardRes.rows
    });
  }));

  app.get('/api/analytics/tardiness', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = req.query;

      let dateFilter = '';
      const params = [];
      if (from) { params.push(from); dateFilter += ` AND event_date >= $${params.length}`; }
      if (to) { params.push(to); dateFilter += ` AND event_date <= $${params.length}`; }

      const [summaryRes, byDriverRes, byDowRes, trendRes, distRes, missedRes] = await Promise.all([
        query(
          `SELECT COUNT(*) AS total_clock_ins,
                  COUNT(*) FILTER (WHERE tardiness_minutes > 0) AS tardy_count,
                  COALESCE(ROUND(AVG(tardiness_minutes) FILTER (WHERE tardiness_minutes > 0)), 0) AS avg_tardiness,
                  COALESCE(MAX(tardiness_minutes), 0) AS max_tardiness
           FROM clock_events WHERE 1=1${dateFilter}`, params
        ),
        query(
          `SELECT ce.employee_id, u.name,
                  COUNT(*) AS total_clock_ins,
                  COUNT(*) FILTER (WHERE ce.tardiness_minutes > 0) AS tardy_count,
                  COALESCE(ROUND(AVG(ce.tardiness_minutes) FILTER (WHERE ce.tardiness_minutes > 0)), 0) AS avg_tardiness,
                  COALESCE(MAX(ce.tardiness_minutes), 0) AS max_tardiness
           FROM clock_events ce JOIN users u ON ce.employee_id = u.id
           WHERE 1=1${dateFilter.replace(/event_date/g, 'ce.event_date')}
           GROUP BY ce.employee_id, u.name ORDER BY tardy_count DESC`,
          params
        ),
        query(
          `SELECT EXTRACT(DOW FROM event_date)::int AS dow,
                  COUNT(*) AS total_clock_ins,
                  COUNT(*) FILTER (WHERE tardiness_minutes > 0) AS tardy_count,
                  COALESCE(ROUND(AVG(tardiness_minutes) FILTER (WHERE tardiness_minutes > 0)), 0) AS avg_tardiness
           FROM clock_events WHERE 1=1${dateFilter}
           GROUP BY dow ORDER BY dow`, params
        ),
        query(
          `SELECT event_date::text AS date,
                  COUNT(*) AS total_clock_ins,
                  COUNT(*) FILTER (WHERE tardiness_minutes > 0) AS tardy_count,
                  COALESCE(ROUND(AVG(tardiness_minutes) FILTER (WHERE tardiness_minutes > 0)), 0) AS avg_tardiness
           FROM clock_events WHERE 1=1${dateFilter}
           GROUP BY event_date ORDER BY event_date`, params
        ),
        query(
          `SELECT
                  COUNT(*) FILTER (WHERE tardiness_minutes = 0 OR tardiness_minutes IS NULL) AS on_time,
                  COUNT(*) FILTER (WHERE tardiness_minutes BETWEEN 1 AND 5) AS late_1_5,
                  COUNT(*) FILTER (WHERE tardiness_minutes BETWEEN 6 AND 15) AS late_6_15,
                  COUNT(*) FILTER (WHERE tardiness_minutes BETWEEN 16 AND 30) AS late_16_30,
                  COUNT(*) FILTER (WHERE tardiness_minutes > 30) AS late_31_plus
           FROM clock_events WHERE 1=1${dateFilter}`, params
        ),
        // Missed shifts: scheduled shift days in the date range with no clock_event
        query(
          `WITH date_range AS (
             SELECT generate_series(
               COALESCE($1::date, CURRENT_DATE - INTERVAL '90 days'),
               COALESCE($2::date, CURRENT_DATE),
               '1 day'::interval
             )::date AS d
           ),
           scheduled AS (
             SELECT s.employee_id, dr.d AS shift_date
             FROM shifts s
             JOIN date_range dr ON (EXTRACT(ISODOW FROM dr.d)::int - 1) = s.day_of_week
           ),
           clocked AS (
             SELECT employee_id, event_date FROM clock_events
           )
           SELECT s.employee_id, u.name,
                  COUNT(*) AS missed_shifts
           FROM scheduled s
           JOIN users u ON s.employee_id = u.id
           LEFT JOIN clocked c ON c.employee_id = s.employee_id AND c.event_date = s.shift_date
           WHERE c.employee_id IS NULL
           GROUP BY s.employee_id, u.name`,
          [from || null, to || null]
        )
      ]);

      const s = summaryRes.rows[0];
      const totalClockIns = parseInt(s.total_clock_ins);
      const tardyCount = parseInt(s.tardy_count);
      const missedByDriver = {};
      (missedRes.rows || []).forEach(r => { missedByDriver[r.employee_id] = parseInt(r.missed_shifts) || 0; });
      const totalMissedShifts = Object.values(missedByDriver).reduce((a, b) => a + b, 0);

      res.json({
        summary: {
          totalClockIns,
          tardyCount,
          onTimeCount: totalClockIns - tardyCount,
          tardyRate: totalClockIns > 0 ? Math.round((tardyCount / totalClockIns) * 100) : 0,
          avgTardinessMinutes: parseInt(s.avg_tardiness),
          maxTardinessMinutes: parseInt(s.max_tardiness),
          totalMissedShifts
        },
        byDriver: byDriverRes.rows.map(r => ({
          employeeId: r.employee_id,
          name: r.name,
          totalClockIns: parseInt(r.total_clock_ins),
          tardyCount: parseInt(r.tardy_count),
          avgTardinessMinutes: parseInt(r.avg_tardiness),
          maxTardinessMinutes: parseInt(r.max_tardiness),
          missedShifts: missedByDriver[r.employee_id] || 0
        })),
        byDayOfWeek: byDowRes.rows.map(r => ({
          dayOfWeek: parseInt(r.dow),
          totalClockIns: parseInt(r.total_clock_ins),
          tardyCount: parseInt(r.tardy_count),
          avgTardinessMinutes: parseInt(r.avg_tardiness)
        })),
        dailyTrend: trendRes.rows.map(r => ({
          date: r.date,
          totalClockIns: parseInt(r.total_clock_ins),
          tardyCount: parseInt(r.tardy_count),
          avgTardinessMinutes: parseInt(r.avg_tardiness)
        })),
        distribution: (() => {
          const d = distRes.rows[0] || {};
          return [
            { bucket: 'On Time', count: parseInt(d.on_time) || 0 },
            { bucket: '1–5 min', count: parseInt(d.late_1_5) || 0 },
            { bucket: '6–15 min', count: parseInt(d.late_6_15) || 0 },
            { bucket: '16–30 min', count: parseInt(d.late_16_30) || 0 },
            { bucket: '31+ min', count: parseInt(d.late_31_plus) || 0 }
          ];
        })()
      });
    } catch (err) {
      console.error('analytics tardiness error:', err);
      res.status(500).json({ error: 'Failed to fetch tardiness analytics' });
    }
  }));

  // ----- New Analytics Endpoints -----

  // Helper: default date range to last 7 days when from/to are not provided
  function defaultDateRange(qp) {
    const from = qp.from || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const to = qp.to || new Date().toISOString().slice(0, 10);
    return { from, to };
  }

  // Helper: build date filter for DATE columns (clock_events.event_date)
  function buildDateFilterDate(qp, column = 'event_date', startParam = 1) {
    let clause = '';
    const params = [];
    if (qp.from) {
      params.push(qp.from);
      clause += ` AND ${column} >= $${startParam + params.length - 1}::date`;
    }
    if (qp.to) {
      params.push(qp.to);
      clause += ` AND ${column} <= $${startParam + params.length - 1}::date`;
    }
    return { clause, params };
  }

  // 4.1 GET /api/analytics/ride-volume
  app.get('/api/analytics/ride-volume', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);
      const granularity = req.query.granularity || 'day';
      let dateExpr;
      if (granularity === 'week') {
        dateExpr = "DATE_TRUNC('week', requested_time)::date";
      } else if (granularity === 'month') {
        dateExpr = "DATE_TRUNC('month', requested_time)::date";
      } else {
        dateExpr = 'DATE(requested_time)';
      }

      const result = await query(
        `SELECT
          ${dateExpr} AS date,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE status = 'denied') AS denied,
          COUNT(DISTINCT rider_email) AS unique_riders
        FROM rides
        WHERE requested_time >= $1 AND requested_time <= $2
        GROUP BY ${dateExpr}
        ORDER BY date`,
        [from, to + 'T23:59:59.999Z']
      );

      let totalTotal = 0, totalCompleted = 0, totalNoShows = 0, totalCancelled = 0, totalDenied = 0;
      const data = result.rows.map(r => {
        const total = parseInt(r.total) || 0;
        const completed = parseInt(r.completed) || 0;
        const noShows = parseInt(r.no_shows) || 0;
        const cancelled = parseInt(r.cancelled) || 0;
        const denied = parseInt(r.denied) || 0;
        totalTotal += total;
        totalCompleted += completed;
        totalNoShows += noShows;
        totalCancelled += cancelled;
        totalDenied += denied;
        return {
          date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
          total,
          completed,
          noShows,
          cancelled,
          denied,
          uniqueRiders: parseInt(r.unique_riders) || 0,
          completionRate: total > 0 ? parseFloat((completed / total * 100).toFixed(1)) : 0,
          noShowRate: total > 0 ? parseFloat((noShows / total * 100).toFixed(1)) : 0,
          cancellationRate: total > 0 ? parseFloat((cancelled / total * 100).toFixed(1)) : 0,
          denialRate: total > 0 ? parseFloat((denied / total * 100).toFixed(1)) : 0
        };
      });

      res.json({
        granularity,
        data,
        totals: {
          total: totalTotal,
          completed: totalCompleted,
          noShows: totalNoShows,
          cancelled: totalCancelled,
          denied: totalDenied,
          completionRate: totalTotal > 0 ? parseFloat((totalCompleted / totalTotal * 100).toFixed(1)) : 0,
          noShowRate: totalTotal > 0 ? parseFloat((totalNoShows / totalTotal * 100).toFixed(1)) : 0,
          cancellationRate: totalTotal > 0 ? parseFloat((totalCancelled / totalTotal * 100).toFixed(1)) : 0,
          denialRate: totalTotal > 0 ? parseFloat((totalDenied / totalTotal * 100).toFixed(1)) : 0
        }
      });
    } catch (err) {
      console.error('analytics ride-volume error:', err);
      res.status(500).json({ error: 'Failed to fetch ride volume analytics' });
    }
  }));

  // 4.2 GET /api/analytics/ride-outcomes
  app.get('/api/analytics/ride-outcomes', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);
      const params = [from, to + 'T23:59:59.999Z'];

      const [distRes, trendRes] = await Promise.all([
        query(
          `SELECT status, COUNT(*) AS count
           FROM rides
           WHERE requested_time >= $1 AND requested_time <= $2
             AND status IN ('completed', 'no_show', 'cancelled', 'denied')
           GROUP BY status`,
          params
        ),
        query(
          `SELECT
             DATE_TRUNC('week', requested_time)::date AS week_start,
             COUNT(*) FILTER (WHERE status = 'completed') AS completed,
             COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
             COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
             COUNT(*) FILTER (WHERE status = 'denied') AS denied
           FROM rides
           WHERE requested_time >= $1 AND requested_time <= $2
             AND status IN ('completed', 'no_show', 'cancelled', 'denied')
           GROUP BY week_start
           ORDER BY week_start`,
          params
        )
      ]);

      const distribution = { completed: 0, noShows: 0, cancelled: 0, denied: 0 };
      for (const r of distRes.rows) {
        if (r.status === 'completed') distribution.completed = parseInt(r.count) || 0;
        else if (r.status === 'no_show') distribution.noShows = parseInt(r.count) || 0;
        else if (r.status === 'cancelled') distribution.cancelled = parseInt(r.count) || 0;
        else if (r.status === 'denied') distribution.denied = parseInt(r.count) || 0;
      }

      const weeklyTrend = trendRes.rows.map(r => ({
        weekStart: r.week_start instanceof Date ? r.week_start.toISOString().slice(0, 10) : String(r.week_start).slice(0, 10),
        completed: parseInt(r.completed) || 0,
        noShows: parseInt(r.no_shows) || 0,
        cancelled: parseInt(r.cancelled) || 0,
        denied: parseInt(r.denied) || 0
      }));

      res.json({ distribution, weeklyTrend });
    } catch (err) {
      console.error('analytics ride-outcomes error:', err);
      res.status(500).json({ error: 'Failed to fetch ride outcomes analytics' });
    }
  }));

  // 4.3 GET /api/analytics/peak-hours
  app.get('/api/analytics/peak-hours', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);
      const params = [from, to + 'T23:59:59.999Z'];

      // Read operating hours from settings
      const startHourRaw = await getSetting('service_hours_start', '08:00');
      const endHourRaw = await getSetting('service_hours_end', '19:00');
      const operatingDaysRaw = await getSetting('operating_days', '0,1,2,3,4,5,6');
      const startHour = parseInt(startHourRaw.split(':')[0]) || 8;
      const endHour = parseInt(endHourRaw.split(':')[0]) || 19;
      // operating_days uses 0-4 for Mon-Fri; convert to ISODOW 1-5
      const operatingDays = operatingDaysRaw.split(',').map(d => parseInt(d) + 1);

      const result = await query(
        `SELECT
          EXTRACT(ISODOW FROM requested_time)::int AS dow,
          EXTRACT(HOUR FROM requested_time)::int AS hour,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows
        FROM rides
        WHERE requested_time >= $1 AND requested_time <= $2
          AND EXTRACT(ISODOW FROM requested_time) BETWEEN 1 AND 5
          AND EXTRACT(HOUR FROM requested_time) BETWEEN $3 AND $4
        GROUP BY dow, hour
        ORDER BY dow, hour`,
        [...params, startHour, endHour - 1]
      );

      const grid = result.rows.map(r => ({
        dow: parseInt(r.dow),
        hour: parseInt(r.hour),
        total: parseInt(r.total) || 0,
        completed: parseInt(r.completed) || 0,
        noShows: parseInt(r.no_shows) || 0
      }));

      const maxCount = grid.reduce((max, cell) => Math.max(max, cell.total), 0);

      res.json({
        grid,
        maxCount,
        operatingHours: { start: startHour, end: endHour },
        operatingDays
      });
    } catch (err) {
      console.error('analytics peak-hours error:', err);
      res.status(500).json({ error: 'Failed to fetch peak hours analytics' });
    }
  }));

  // 4.4 GET /api/analytics/routes
  app.get('/api/analytics/routes', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);
      const limit = parseInt(req.query.limit) || 20;

      const result = await query(
        `SELECT
          pickup_location,
          dropoff_location,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE status = 'denied') AS denied,
          COUNT(DISTINCT rider_email) AS unique_riders,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0),
            1
          ) AS completion_rate
        FROM rides
        WHERE requested_time >= $1 AND requested_time <= $2
          AND status NOT IN ('pending', 'approved', 'scheduled', 'driver_on_the_way', 'driver_arrived_grace')
        GROUP BY pickup_location, dropoff_location
        ORDER BY total DESC
        LIMIT $3`,
        [from, to + 'T23:59:59.999Z', limit]
      );

      const routes = result.rows.map(r => ({
        pickupLocation: r.pickup_location,
        dropoffLocation: r.dropoff_location,
        total: parseInt(r.total) || 0,
        completed: parseInt(r.completed) || 0,
        noShows: parseInt(r.no_shows) || 0,
        cancelled: parseInt(r.cancelled) || 0,
        denied: parseInt(r.denied) || 0,
        uniqueRiders: parseInt(r.unique_riders) || 0,
        completionRate: parseFloat(r.completion_rate) || 0
      }));

      res.json({ routes });
    } catch (err) {
      console.error('analytics routes error:', err);
      res.status(500).json({ error: 'Failed to fetch route analytics' });
    }
  }));

  // 4.5 GET /api/analytics/driver-performance
  app.get('/api/analytics/driver-performance', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);

      const [rideRes, clockRes, missedRes] = await Promise.all([
        // Query 1: Ride stats per driver
        query(
          `SELECT
            r.assigned_driver_id AS driver_id,
            u.name AS driver_name,
            COUNT(*) AS total_rides,
            COUNT(*) FILTER (WHERE r.status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE r.status = 'no_show') AS no_shows,
            COUNT(DISTINCT DATE(r.requested_time)) AS active_days
          FROM rides r
          JOIN users u ON r.assigned_driver_id = u.id
          WHERE r.assigned_driver_id IS NOT NULL
            AND r.requested_time >= $1 AND r.requested_time <= $2
          GROUP BY r.assigned_driver_id, u.name`,
          [from, to + 'T23:59:59.999Z']
        ),
        // Query 2: Clock-in stats per driver
        query(
          `SELECT
            ce.employee_id AS driver_id,
            COUNT(*) AS total_clock_ins,
            COUNT(*) FILTER (WHERE ce.tardiness_minutes = 0 OR ce.tardiness_minutes IS NULL) AS on_time,
            COUNT(*) FILTER (WHERE ce.tardiness_minutes > 0) AS tardy,
            COALESCE(ROUND(AVG(ce.tardiness_minutes) FILTER (WHERE ce.tardiness_minutes > 0)), 0) AS avg_tardiness_min,
            COALESCE(MAX(ce.tardiness_minutes), 0) AS max_tardiness_min,
            ROUND(EXTRACT(EPOCH FROM SUM(ce.clock_out_at - ce.clock_in_at)) / 3600.0, 1) AS total_hours_worked
          FROM clock_events ce
          WHERE ce.event_date >= $1::date AND ce.event_date <= $2::date
            AND ce.clock_out_at IS NOT NULL
          GROUP BY ce.employee_id`,
          [from, to]
        ),
        // Query 3: Missed shifts per driver
        query(
          `WITH date_range AS (
            SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS d
          ),
          scheduled AS (
            SELECT s.employee_id, dr.d AS shift_date
            FROM shifts s
            JOIN date_range dr ON (EXTRACT(ISODOW FROM dr.d)::int - 1) = s.day_of_week
            WHERE (s.week_start IS NULL OR s.week_start = (
              dr.d - ((EXTRACT(ISODOW FROM dr.d)::int - 1) || ' days')::interval
            )::date)
          ),
          clocked AS (
            SELECT employee_id, event_date FROM clock_events
          )
          SELECT s.employee_id AS driver_id,
                 COUNT(*) AS missed_shifts
          FROM scheduled s
          LEFT JOIN clocked c ON c.employee_id = s.employee_id AND c.event_date = s.shift_date
          WHERE c.employee_id IS NULL
            AND s.shift_date <= CURRENT_DATE
          GROUP BY s.employee_id`,
          [from, to]
        )
      ]);

      // Build lookup maps
      const clockMap = {};
      for (const c of clockRes.rows) {
        clockMap[c.driver_id] = c;
      }
      const missedMap = {};
      for (const m of missedRes.rows) {
        missedMap[m.driver_id] = parseInt(m.missed_shifts) || 0;
      }

      // Merge results - start from ride stats, enrich with clock/missed data
      const driverIds = new Set();
      const drivers = [];

      // Add drivers from ride stats
      for (const r of rideRes.rows) {
        driverIds.add(r.driver_id);
        const totalRides = parseInt(r.total_rides) || 0;
        const completed = parseInt(r.completed) || 0;
        const noShows = parseInt(r.no_shows) || 0;
        const clock = clockMap[r.driver_id] || {};
        const totalClockIns = parseInt(clock.total_clock_ins) || 0;
        const onTime = parseInt(clock.on_time) || 0;
        const tardy = parseInt(clock.tardy) || 0;
        const totalHoursWorked = parseFloat(clock.total_hours_worked) || 0;

        drivers.push({
          driverId: r.driver_id,
          driverName: r.driver_name,
          totalRides,
          completed,
          noShows,
          completionRate: totalRides > 0 ? parseFloat((completed / totalRides * 100).toFixed(1)) : 0,
          activeDays: parseInt(r.active_days) || 0,
          totalClockIns,
          onTime,
          tardy,
          punctualityRate: totalClockIns > 0 ? parseFloat((onTime / totalClockIns * 100).toFixed(1)) : 0,
          avgTardinessMin: parseInt(clock.avg_tardiness_min) || 0,
          maxTardinessMin: parseInt(clock.max_tardiness_min) || 0,
          totalHoursWorked,
          missedShifts: missedMap[r.driver_id] || 0,
          ridesPerHour: totalHoursWorked > 0 ? parseFloat((completed / totalHoursWorked).toFixed(2)) : 0
        });
      }

      // Add drivers who had clock events but no rides
      for (const c of clockRes.rows) {
        if (!driverIds.has(c.driver_id)) {
          const userRes = await query('SELECT name FROM users WHERE id = $1', [c.driver_id]);
          const driverName = userRes.rows[0]?.name || 'Unknown';
          const totalClockIns = parseInt(c.total_clock_ins) || 0;
          const onTime = parseInt(c.on_time) || 0;
          const totalHoursWorked = parseFloat(c.total_hours_worked) || 0;
          drivers.push({
            driverId: c.driver_id,
            driverName,
            totalRides: 0,
            completed: 0,
            noShows: 0,
            completionRate: 0,
            activeDays: 0,
            totalClockIns,
            onTime,
            tardy: parseInt(c.tardy) || 0,
            punctualityRate: totalClockIns > 0 ? parseFloat((onTime / totalClockIns * 100).toFixed(1)) : 0,
            avgTardinessMin: parseInt(c.avg_tardiness_min) || 0,
            maxTardinessMin: parseInt(c.max_tardiness_min) || 0,
            totalHoursWorked,
            missedShifts: missedMap[c.driver_id] || 0,
            ridesPerHour: 0
          });
        }
      }

      res.json({ drivers });
    } catch (err) {
      console.error('analytics driver-performance error:', err);
      res.status(500).json({ error: 'Failed to fetch driver performance analytics' });
    }
  }));

  // 4.6 GET /api/analytics/driver-utilization
  app.get('/api/analytics/driver-utilization', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);

      const [clockRes, rideRes] = await Promise.all([
        // Step 1: Driver clocked-in periods
        query(
          `SELECT
            employee_id,
            event_date,
            clock_in_at,
            clock_out_at,
            EXTRACT(EPOCH FROM (clock_out_at - clock_in_at)) AS shift_seconds
          FROM clock_events
          WHERE event_date >= $1::date AND event_date <= $2::date
            AND clock_out_at IS NOT NULL`,
          [from, to]
        ),
        // Step 2: Ride durations from ride_events (claimed -> terminal)
        query(
          `SELECT
            r.assigned_driver_id AS driver_id,
            r.id AS ride_id,
            claimed.at AS claimed_at,
            COALESCE(terminal.at, r.updated_at) AS terminal_at,
            EXTRACT(EPOCH FROM (COALESCE(terminal.at, r.updated_at) - claimed.at)) AS ride_seconds
          FROM rides r
          JOIN ride_events claimed ON claimed.ride_id = r.id AND claimed.type = 'claimed'
          LEFT JOIN ride_events terminal ON terminal.ride_id = r.id AND terminal.type IN ('completed', 'no_show')
          WHERE r.assigned_driver_id IS NOT NULL
            AND r.requested_time >= $1 AND r.requested_time <= $2
            AND r.status IN ('completed', 'no_show')`,
          [from, to + 'T23:59:59.999Z']
        )
      ]);

      // Aggregate by driver
      const driverClock = {};  // driver_id -> { totalSeconds, name }
      for (const c of clockRes.rows) {
        if (!driverClock[c.employee_id]) {
          driverClock[c.employee_id] = { totalSeconds: 0 };
        }
        driverClock[c.employee_id].totalSeconds += parseFloat(c.shift_seconds) || 0;
      }

      const driverRide = {};  // driver_id -> { totalSeconds, rideCount, rideDurations[] }
      for (const r of rideRes.rows) {
        if (!driverRide[r.driver_id]) {
          driverRide[r.driver_id] = { totalSeconds: 0, rideCount: 0, rideDurations: [] };
        }
        const secs = Math.max(0, parseFloat(r.ride_seconds) || 0);
        driverRide[r.driver_id].totalSeconds += secs;
        driverRide[r.driver_id].rideCount += 1;
        driverRide[r.driver_id].rideDurations.push(secs);
      }

      // Get driver names
      const allDriverIds = new Set([...Object.keys(driverClock), ...Object.keys(driverRide)]);
      const nameMap = {};
      if (allDriverIds.size > 0) {
        const nameRes = await query(
          `SELECT id, name FROM users WHERE id = ANY($1::text[])`,
          [Array.from(allDriverIds)]
        );
        for (const n of nameRes.rows) {
          nameMap[n.id] = n.name;
        }
      }

      let overallClockedSec = 0;
      let overallRideSec = 0;

      const drivers = [];
      for (const driverId of allDriverIds) {
        const clockData = driverClock[driverId] || { totalSeconds: 0 };
        const rideData = driverRide[driverId] || { totalSeconds: 0, rideCount: 0, rideDurations: [] };
        const totalClockedHours = parseFloat((clockData.totalSeconds / 3600).toFixed(1));
        const activeRideHours = parseFloat((rideData.totalSeconds / 3600).toFixed(1));
        const idleHours = parseFloat((totalClockedHours - activeRideHours).toFixed(1));
        const avgRideDurationMin = rideData.rideCount > 0
          ? parseFloat((rideData.totalSeconds / rideData.rideCount / 60).toFixed(1))
          : 0;

        overallClockedSec += clockData.totalSeconds;
        overallRideSec += rideData.totalSeconds;

        drivers.push({
          driverId,
          driverName: nameMap[driverId] || 'Unknown',
          totalClockedHours,
          activeRideHours,
          idleHours,
          utilizationRate: totalClockedHours > 0 ? parseFloat((activeRideHours / totalClockedHours * 100).toFixed(1)) : 0,
          ridesHandled: rideData.rideCount,
          avgRideDurationMin
        });
      }

      const overallClockedHours = parseFloat((overallClockedSec / 3600).toFixed(1));
      const overallRideHours = parseFloat((overallRideSec / 3600).toFixed(1));

      res.json({
        drivers,
        overall: {
          totalClockedHours: overallClockedHours,
          activeRideHours: overallRideHours,
          utilizationRate: overallClockedHours > 0 ? parseFloat((overallRideHours / overallClockedHours * 100).toFixed(1)) : 0
        }
      });
    } catch (err) {
      console.error('analytics driver-utilization error:', err);
      res.status(500).json({ error: 'Failed to fetch driver utilization analytics' });
    }
  }));

  // 4.7 GET /api/analytics/rider-cohorts
  app.get('/api/analytics/rider-cohorts', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);
      const maxStrikes = await getSetting('max_no_show_strikes', 5);

      const [activeRes, churnedRes, strikesRes] = await Promise.all([
        // Active riders in date range with cohort classification
        query(
          `WITH period_riders AS (
            SELECT
              rider_email,
              rider_name,
              COUNT(*) AS rides_in_period,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed_in_period,
              COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows_in_period
            FROM rides
            WHERE requested_time >= $1 AND requested_time <= $2
            GROUP BY rider_email, rider_name
          ),
          all_time_first AS (
            SELECT
              rider_email,
              MIN(requested_time) AS first_ride_ever,
              MAX(requested_time) AS last_ride_ever
            FROM rides
            GROUP BY rider_email
          ),
          previous_period AS (
            SELECT DISTINCT rider_email
            FROM rides
            WHERE requested_time < $1
              AND requested_time >= ($1::date - ($2::date - $1::date))
          )
          SELECT
            pr.rider_email,
            pr.rider_name,
            pr.rides_in_period,
            pr.completed_in_period,
            pr.no_shows_in_period,
            atf.first_ride_ever,
            atf.last_ride_ever,
            CASE
              WHEN atf.first_ride_ever >= $1 THEN 'new'
              WHEN pp.rider_email IS NOT NULL THEN 'returning'
              ELSE 'reactivated'
            END AS cohort
          FROM period_riders pr
          JOIN all_time_first atf ON atf.rider_email = pr.rider_email
          LEFT JOIN previous_period pp ON pp.rider_email = pr.rider_email`,
          [from, to + 'T23:59:59.999Z']
        ),
        // Churned riders: had rides before period but none during
        query(
          `SELECT
            rider_email,
            rider_name,
            MAX(requested_time) AS last_ride
          FROM rides
          WHERE rider_email NOT IN (
            SELECT rider_email FROM rides
            WHERE requested_time >= $1 AND requested_time <= $2
          )
          AND requested_time < $1
          GROUP BY rider_email, rider_name`,
          [from, to + 'T23:59:59.999Z']
        ),
        // Strike counts
        query(`SELECT rmc.rider_id, rmc.count AS strike_count, u.email FROM rider_miss_counts rmc JOIN users u ON u.id = rmc.rider_id`)
      ]);

      // Classify active riders
      const activeRiders = activeRes.rows.map(r => ({
        riderEmail: r.rider_email,
        riderName: r.rider_name,
        ridesInPeriod: parseInt(r.rides_in_period) || 0,
        completedInPeriod: parseInt(r.completed_in_period) || 0,
        noShowsInPeriod: parseInt(r.no_shows_in_period) || 0,
        firstRideEver: r.first_ride_ever,
        cohort: r.cohort
      }));

      const churnedRiders = churnedRes.rows.map(r => ({
        riderEmail: r.rider_email,
        riderName: r.rider_name,
        lastRide: r.last_ride
      }));

      // Classify at-risk and terminated from strikes
      const atRisk = [];
      const terminated = [];
      for (const s of strikesRes.rows) {
        const count = parseInt(s.strike_count) || 0;
        if (count >= maxStrikes) {
          terminated.push({ email: s.email, strikeCount: count });
        } else if (count === maxStrikes - 1) {
          atRisk.push({ email: s.email, strikeCount: count, maxStrikes });
        }
      }

      // Count cohort categories
      let newCount = 0, returningCount = 0, reactivatedCount = 0;
      for (const r of activeRiders) {
        if (r.cohort === 'new') newCount++;
        else if (r.cohort === 'returning') returningCount++;
        else reactivatedCount++;
      }

      // Retention rate: returning / (returning + churned) * 100
      const retentionDenom = returningCount + churnedRiders.length;
      const retentionRate = retentionDenom > 0 ? parseFloat((returningCount / retentionDenom * 100).toFixed(1)) : 0;

      res.json({
        summary: {
          active: activeRiders.length,
          new: newCount,
          returning: returningCount,
          reactivated: reactivatedCount,
          churned: churnedRiders.length,
          atRisk: atRisk.length,
          terminated: terminated.length
        },
        cohorts: {
          active: activeRiders,
          churned: churnedRiders,
          atRisk,
          terminated
        },
        retentionRate
      });
    } catch (err) {
      console.error('analytics rider-cohorts error:', err);
      res.status(500).json({ error: 'Failed to fetch rider cohort analytics' });
    }
  }));

  // 4.8 GET /api/analytics/rider-no-shows
  app.get('/api/analytics/rider-no-shows', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);
      const params = [from, to + 'T23:59:59.999Z'];

      const [byRiderRes, strikeRes, summaryRes] = await Promise.all([
        // No-show rate per rider
        query(
          `SELECT
            rider_email,
            rider_name,
            COUNT(*) AS total_rides,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
            ROUND(
              COUNT(*) FILTER (WHERE status = 'no_show') * 100.0
              / NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'no_show')), 0),
              1
            ) AS no_show_rate
          FROM rides
          WHERE requested_time >= $1 AND requested_time <= $2
          GROUP BY rider_email, rider_name
          HAVING COUNT(*) FILTER (WHERE status = 'no_show') > 0
          ORDER BY no_shows DESC`,
          params
        ),
        // Current strike distribution
        query(
          `SELECT
            count AS strikes,
            COUNT(*) AS rider_count
          FROM rider_miss_counts
          GROUP BY count
          ORDER BY count`
        ),
        // Overall no-show summary for period
        query(
          `SELECT
            COUNT(*) FILTER (WHERE status = 'no_show') AS total_no_shows,
            COUNT(*) FILTER (WHERE status IN ('completed', 'no_show')) AS total_fulfilled,
            COUNT(DISTINCT rider_email) FILTER (WHERE status = 'no_show') AS riders_with_no_shows
          FROM rides
          WHERE requested_time >= $1 AND requested_time <= $2`,
          params
        )
      ]);

      const s = summaryRes.rows[0] || {};
      const totalNoShows = parseInt(s.total_no_shows) || 0;
      const totalFulfilled = parseInt(s.total_fulfilled) || 0;

      res.json({
        summary: {
          totalNoShows,
          totalFulfilled,
          noShowRate: totalFulfilled > 0 ? parseFloat((totalNoShows / totalFulfilled * 100).toFixed(1)) : 0,
          ridersWithNoShows: parseInt(s.riders_with_no_shows) || 0
        },
        byRider: byRiderRes.rows.map(r => ({
          riderEmail: r.rider_email,
          riderName: r.rider_name,
          totalRides: parseInt(r.total_rides) || 0,
          completed: parseInt(r.completed) || 0,
          noShows: parseInt(r.no_shows) || 0,
          noShowRate: parseFloat(r.no_show_rate) || 0
        })),
        strikeDistribution: strikeRes.rows.map(r => ({
          strikes: parseInt(r.strikes),
          riderCount: parseInt(r.rider_count) || 0
        }))
      });
    } catch (err) {
      console.error('analytics rider-no-shows error:', err);
      res.status(500).json({ error: 'Failed to fetch rider no-show analytics' });
    }
  }));

  // 4.9 GET /api/analytics/fleet-utilization
  app.get('/api/analytics/fleet-utilization', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);

      const [vehicleRideRes, maintenanceRes] = await Promise.all([
        query(
          `SELECT
            v.id,
            v.name,
            v.type,
            v.status,
            v.total_miles,
            v.last_maintenance_date,
            COUNT(r.id) AS total_rides,
            COUNT(r.id) FILTER (WHERE r.status = 'completed') AS completed_rides,
            MAX(r.requested_time) AS last_used
          FROM vehicles v
          LEFT JOIN rides r ON r.vehicle_id = v.id
            AND r.requested_time >= $1 AND r.requested_time <= $2
          GROUP BY v.id, v.name, v.type, v.status, v.total_miles, v.last_maintenance_date
          ORDER BY total_rides DESC`,
          [from, to + 'T23:59:59.999Z']
        ),
        query(
          `SELECT
            ml.vehicle_id,
            COUNT(*) AS maintenance_count,
            MAX(ml.service_date) AS last_service,
            MAX(ml.mileage_at_service) AS latest_mileage
          FROM maintenance_logs ml
          WHERE ml.service_date >= $1::date AND ml.service_date <= $2::date
          GROUP BY ml.vehicle_id`,
          [from, to]
        )
      ]);

      const maintMap = {};
      for (const m of maintenanceRes.rows) {
        maintMap[m.vehicle_id] = m;
      }

      let totalFleet = 0, available = 0, retired = 0, standardCount = 0, accessibleCount = 0, totalMiles = 0, overdueCount = 0;

      const vehicles = vehicleRideRes.rows.map(v => {
        const maint = maintMap[v.id] || {};
        const daysSince = v.last_maintenance_date
          ? Math.floor((Date.now() - new Date(v.last_maintenance_date).getTime()) / 86400000)
          : null;
        const maintenanceOverdue = daysSince !== null && daysSince > 30;

        totalFleet++;
        if (v.status === 'available') available++;
        if (v.status === 'retired') retired++;
        if (v.type === 'standard') standardCount++;
        if (v.type === 'accessible') accessibleCount++;
        totalMiles += parseInt(v.total_miles) || 0;
        if (maintenanceOverdue) overdueCount++;

        return {
          id: v.id,
          name: v.name,
          type: v.type,
          status: v.status,
          totalMiles: parseInt(v.total_miles) || 0,
          totalRides: parseInt(v.total_rides) || 0,
          completedRides: parseInt(v.completed_rides) || 0,
          lastUsed: v.last_used || null,
          maintenanceCount: parseInt(maint.maintenance_count) || 0,
          lastMaintenanceDate: v.last_maintenance_date || null,
          daysSinceMaintenance: daysSince,
          maintenanceOverdue
        };
      });

      res.json({
        vehicles,
        summary: {
          totalFleet,
          available,
          retired,
          standardCount,
          accessibleCount,
          totalMiles,
          overdueCount
        }
      });
    } catch (err) {
      console.error('analytics fleet-utilization error:', err);
      res.status(500).json({ error: 'Failed to fetch fleet utilization analytics' });
    }
  }));

  // 4.10 GET /api/analytics/vehicle-demand
  app.get('/api/analytics/vehicle-demand', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);
      const params = [from, to + 'T23:59:59.999Z'];

      const [demandRes, trendRes] = await Promise.all([
        query(
          `SELECT
            COALESCE(v.type, 'unassigned') AS vehicle_type,
            COUNT(*) AS total_rides,
            COUNT(*) FILTER (WHERE r.status = 'completed') AS completed
          FROM rides r
          LEFT JOIN vehicles v ON r.vehicle_id = v.id
          WHERE r.requested_time >= $1 AND r.requested_time <= $2
            AND r.status NOT IN ('denied', 'cancelled')
          GROUP BY COALESCE(v.type, 'unassigned')`,
          params
        ),
        query(
          `SELECT
            DATE_TRUNC('week', r.requested_time)::date AS week_start,
            COALESCE(v.type, 'unassigned') AS vehicle_type,
            COUNT(*) AS count
          FROM rides r
          LEFT JOIN vehicles v ON r.vehicle_id = v.id
          WHERE r.requested_time >= $1 AND r.requested_time <= $2
            AND r.status NOT IN ('denied', 'cancelled')
          GROUP BY week_start, vehicle_type
          ORDER BY week_start, vehicle_type`,
          params
        )
      ]);

      // Build demand object
      const demand = {};
      let totalNonUnassigned = 0;
      let accessibleTotal = 0;
      for (const r of demandRes.rows) {
        demand[r.vehicle_type] = {
          totalRides: parseInt(r.total_rides) || 0,
          completed: parseInt(r.completed) || 0
        };
        if (r.vehicle_type !== 'unassigned') totalNonUnassigned += parseInt(r.total_rides) || 0;
        if (r.vehicle_type === 'accessible') accessibleTotal = parseInt(r.total_rides) || 0;
      }

      // Build weekly trend - pivot by vehicle_type
      const weekMap = {};
      for (const r of trendRes.rows) {
        const ws = r.week_start instanceof Date ? r.week_start.toISOString().slice(0, 10) : String(r.week_start).slice(0, 10);
        if (!weekMap[ws]) weekMap[ws] = { weekStart: ws, standard: 0, accessible: 0, unassigned: 0 };
        weekMap[ws][r.vehicle_type] = parseInt(r.count) || 0;
      }

      const accessibleRatio = totalNonUnassigned > 0
        ? parseFloat((accessibleTotal / totalNonUnassigned * 100).toFixed(1))
        : 0;

      res.json({
        demand,
        accessibleRatio,
        weeklyTrend: Object.values(weekMap)
      });
    } catch (err) {
      console.error('analytics vehicle-demand error:', err);
      res.status(500).json({ error: 'Failed to fetch vehicle demand analytics' });
    }
  }));

  // 4.11 GET /api/analytics/shift-coverage
  app.get('/api/analytics/shift-coverage', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);

      const result = await query(
        `WITH date_range AS (
          SELECT generate_series($1::date, LEAST($2::date, CURRENT_DATE), '1 day'::interval)::date AS d
        ),
        scheduled AS (
          SELECT
            dr.d AS day,
            SUM(
              EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0
            ) AS scheduled_hours,
            COUNT(DISTINCT s.employee_id) AS scheduled_drivers
          FROM date_range dr
          JOIN shifts s ON (EXTRACT(ISODOW FROM dr.d)::int - 1) = s.day_of_week
            AND (s.week_start IS NULL OR s.week_start = (
              dr.d - ((EXTRACT(ISODOW FROM dr.d)::int - 1) || ' days')::interval
            )::date)
          WHERE EXTRACT(ISODOW FROM dr.d) BETWEEN 1 AND 5
          GROUP BY dr.d
        ),
        actual AS (
          SELECT
            ce.event_date AS day,
            SUM(
              EXTRACT(EPOCH FROM (ce.clock_out_at - ce.clock_in_at)) / 3600.0
            ) AS actual_hours,
            COUNT(DISTINCT ce.employee_id) AS actual_drivers
          FROM clock_events ce
          WHERE ce.event_date >= $1::date AND ce.event_date <= $2::date
            AND ce.clock_out_at IS NOT NULL
          GROUP BY ce.event_date
        ),
        daily_rides AS (
          SELECT
            DATE(requested_time) AS day,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed
          FROM rides
          WHERE requested_time >= $1 AND requested_time <= $2
          GROUP BY DATE(requested_time)
        )
        SELECT
          s.day,
          ROUND(COALESCE(s.scheduled_hours, 0)::numeric, 1) AS scheduled_hours,
          ROUND(COALESCE(a.actual_hours, 0)::numeric, 1) AS actual_hours,
          ROUND((COALESCE(a.actual_hours, 0) - COALESCE(s.scheduled_hours, 0))::numeric, 1) AS gap_hours,
          COALESCE(s.scheduled_drivers, 0) AS scheduled_drivers,
          COALESCE(a.actual_drivers, 0) AS actual_drivers,
          COALESCE(dr.completed, 0) AS completed_rides
        FROM scheduled s
        LEFT JOIN actual a ON a.day = s.day
        LEFT JOIN daily_rides dr ON dr.day = s.day
        ORDER BY s.day`,
        [from, to + 'T23:59:59.999Z']
      );

      let totalScheduled = 0, totalActual = 0, totalCompleted = 0;

      const daily = result.rows.map(r => {
        const scheduledHours = parseFloat(r.scheduled_hours) || 0;
        const actualHours = parseFloat(r.actual_hours) || 0;
        const gapHours = parseFloat(r.gap_hours) || 0;
        const completedRides = parseInt(r.completed_rides) || 0;

        totalScheduled += scheduledHours;
        totalActual += actualHours;
        totalCompleted += completedRides;

        return {
          date: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
          scheduledHours,
          actualHours,
          gapHours,
          scheduledDrivers: parseInt(r.scheduled_drivers) || 0,
          actualDrivers: parseInt(r.actual_drivers) || 0,
          completedRides,
          ridesPerDriverHour: actualHours > 0 ? parseFloat((completedRides / actualHours).toFixed(2)) : 0
        };
      });

      res.json({
        daily,
        totals: {
          scheduledHours: parseFloat(totalScheduled.toFixed(1)),
          actualHours: parseFloat(totalActual.toFixed(1)),
          gapHours: parseFloat((totalActual - totalScheduled).toFixed(1)),
          coverageRate: totalScheduled > 0 ? parseFloat((totalActual / totalScheduled * 100).toFixed(1)) : 0,
          totalCompletedRides: totalCompleted,
          avgRidesPerDriverHour: totalActual > 0 ? parseFloat((totalCompleted / totalActual).toFixed(2)) : 0
        }
      });
    } catch (err) {
      console.error('analytics shift-coverage error:', err);
      res.status(500).json({ error: 'Failed to fetch shift coverage analytics' });
    }
  }));

  // 4.12 GET /api/analytics/export-report
  app.get('/api/analytics/export-report', requireOffice, wrapAsync(async (req, res) => {
    try {
      const { from, to } = defaultDateRange(req.query);
      const params = [from, to + 'T23:59:59.999Z'];
      const dateParams = [from, to];
      const maxStrikes = await getSetting('max_no_show_strikes', 5);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'RideOps';
      workbook.created = new Date();
      const generatedAt = new Date().toISOString();

      // Helper: add title row + column header row to a sheet
      function addSheetHeader(sheet, title) {
        sheet.mergeCells('A1', `${String.fromCharCode(64 + sheet.columnCount)}1`);
        const titleCell = sheet.getCell('A1');
        titleCell.value = `${title}  |  Period: ${from} to ${to}  |  Generated: ${generatedAt}`;
        titleCell.font = { bold: true, size: 11 };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
        // Re-insert column headers as row 2 (overwritten by merge above)
        const headers = sheet.columns.map(c => c.header || c.key || '');
        const headerRow = sheet.addRow(headers);
        headerRow.font = { bold: true };
        headerRow.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE4' } };
          cell.border = { bottom: { style: 'thin' } };
        });
      }

      // Helper: auto-size columns
      function autoSizeColumns(sheet) {
        sheet.columns.forEach(col => {
          let maxLen = 10;
          col.eachCell({ includeEmpty: false }, cell => {
            const len = cell.value ? String(cell.value).length : 0;
            if (len > maxLen) maxLen = len;
          });
          col.width = Math.min(maxLen + 4, 40);
        });
      }

      // Helper: add completion rate conditional formatting
      function addCompletionRateFormatting(sheet, colLetter, startRow, endRow) {
        sheet.addConditionalFormatting({
          ref: `${colLetter}${startRow}:${colLetter}${endRow}`,
          rules: [
            { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [0.85], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF28A745' } }, font: { color: { argb: 'FFFFFFFF' } } } },
            { type: 'cellIs', operator: 'between', formulae: [0.70, 0.8499], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC107' } } } },
            { type: 'cellIs', operator: 'lessThan', formulae: [0.70], priority: 3, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDC3545' } }, font: { color: { argb: 'FFFFFFFF' } } } }
          ]
        });
      }

      // ========== SHEET 1: Summary ==========
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Value', key: 'value', width: 20 }
      ];
      addSheetHeader(summarySheet, 'Summary');

      // Fetch summary data
      const summaryRes = await query(
        `SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
          COUNT(*) FILTER (WHERE status = 'denied') AS denied,
          COUNT(DISTINCT rider_email) AS unique_riders,
          COUNT(DISTINCT rider_email) FILTER (WHERE status = 'completed') AS people_helped,
          COUNT(DISTINCT assigned_driver_id) FILTER (WHERE assigned_driver_id IS NOT NULL) AS unique_drivers
        FROM rides WHERE requested_time >= $1 AND requested_time <= $2`, params
      );
      const ss = summaryRes.rows[0];
      const sTotal = parseInt(ss.total) || 0;
      const sCompleted = parseInt(ss.completed) || 0;
      const sNoShows = parseInt(ss.no_shows) || 0;
      const sCancelled = parseInt(ss.cancelled) || 0;
      const sDenied = parseInt(ss.denied) || 0;

      const vehicleSummaryRes = await query(`SELECT COUNT(*) FILTER (WHERE status != 'retired') AS fleet, COUNT(*) FILTER (WHERE status = 'available') AS available FROM vehicles`);
      const vs = vehicleSummaryRes.rows[0];
      const fleetTotal = parseInt(vs.fleet) || 0;
      const fleetAvailable = parseInt(vs.available) || 0;

      const summaryRows = [
        ['Report Period', `${from} to ${to}`],
        ['Total Rides', sTotal],
        ['Completed Rides', sCompleted],
        ['Completion Rate', sTotal > 0 ? (sCompleted / sTotal * 100).toFixed(1) + '%' : '0%'],
        ['No-Shows', sNoShows],
        ['No-Show Rate', sTotal > 0 ? (sNoShows / sTotal * 100).toFixed(1) + '%' : '0%'],
        ['Cancellations', sCancelled],
        ['Cancellation Rate', sTotal > 0 ? (sCancelled / sTotal * 100).toFixed(1) + '%' : '0%'],
        ['Denied', sDenied],
        ['Denial Rate', sTotal > 0 ? (sDenied / sTotal * 100).toFixed(1) + '%' : '0%'],
        ['Unique Riders', parseInt(ss.unique_riders) || 0],
        ['People Helped', parseInt(ss.people_helped) || 0],
        ['Active Drivers', parseInt(ss.unique_drivers) || 0],
        ['Fleet Availability', fleetTotal > 0 ? `${fleetAvailable} of ${fleetTotal}` : 'N/A']
      ];
      summaryRows.forEach(([metric, value]) => {
        summarySheet.addRow({ metric, value });
      });

      // Conditional formatting for completion rate and no-show rate rows
      const completionRow = 6; // Row 6 = Completion Rate (row 1 title + row 2 col headers + 4 data rows)
      const noShowRow = 8; // Row 8 = No-Show Rate
      const completionVal = sTotal > 0 ? sCompleted / sTotal : 0;
      const noShowVal = sTotal > 0 ? sNoShows / sTotal : 0;
      if (completionVal >= 0.85) {
        summarySheet.getCell(`B${completionRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF28A745' } };
        summarySheet.getCell(`B${completionRow}`).font = { color: { argb: 'FFFFFFFF' } };
      } else if (completionVal >= 0.70) {
        summarySheet.getCell(`B${completionRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC107' } };
      } else {
        summarySheet.getCell(`B${completionRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } };
        summarySheet.getCell(`B${completionRow}`).font = { color: { argb: 'FFFFFFFF' } };
      }
      if (noShowVal <= 0.05) {
        summarySheet.getCell(`B${noShowRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF28A745' } };
        summarySheet.getCell(`B${noShowRow}`).font = { color: { argb: 'FFFFFFFF' } };
      } else if (noShowVal <= 0.15) {
        summarySheet.getCell(`B${noShowRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC107' } };
      } else {
        summarySheet.getCell(`B${noShowRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } };
        summarySheet.getCell(`B${noShowRow}`).font = { color: { argb: 'FFFFFFFF' } };
      }
      autoSizeColumns(summarySheet);

      // ========== SHEET 2: Daily Volume ==========
      const dailySheet = workbook.addWorksheet('Daily Volume');
      dailySheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Day', key: 'day', width: 12 },
        { header: 'Total Rides', key: 'total', width: 12 },
        { header: 'Completed', key: 'completed', width: 12 },
        { header: 'No-Shows', key: 'noShows', width: 12 },
        { header: 'Cancelled', key: 'cancelled', width: 12 },
        { header: 'Denied', key: 'denied', width: 12 },
        { header: 'Completion Rate', key: 'completionRate', width: 16 },
        { header: 'Unique Riders', key: 'uniqueRiders', width: 14 }
      ];
      addSheetHeader(dailySheet, 'Daily Volume');

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dailyVolumeRes = await query(
        `SELECT
          DATE(requested_time) AS date,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE status = 'denied') AS denied,
          COUNT(DISTINCT rider_email) AS unique_riders
        FROM rides
        WHERE requested_time >= $1 AND requested_time <= $2
        GROUP BY DATE(requested_time)
        ORDER BY date`, params
      );

      for (const r of dailyVolumeRes.rows) {
        const dt = new Date(r.date);
        const total = parseInt(r.total) || 0;
        const completed = parseInt(r.completed) || 0;
        dailySheet.addRow({
          date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
          day: dayNames[dt.getDay()],
          total,
          completed,
          noShows: parseInt(r.no_shows) || 0,
          cancelled: parseInt(r.cancelled) || 0,
          denied: parseInt(r.denied) || 0,
          completionRate: total > 0 ? parseFloat((completed / total).toFixed(3)) : 0,
          uniqueRiders: parseInt(r.unique_riders) || 0
        });
      }

      // Format completion rate as percentage
      dailySheet.getColumn('completionRate').numFmt = '0.0%';
      if (dailyVolumeRes.rows.length > 0) {
        addCompletionRateFormatting(dailySheet, 'H', 3, 3 + dailyVolumeRes.rows.length - 1);
      }
      autoSizeColumns(dailySheet);

      // ========== SHEET 3: Routes ==========
      const routesSheet = workbook.addWorksheet('Routes');
      routesSheet.columns = [
        { header: 'Pickup Location', key: 'pickup', width: 25 },
        { header: 'Dropoff Location', key: 'dropoff', width: 25 },
        { header: 'Total Rides', key: 'total', width: 12 },
        { header: 'Completed', key: 'completed', width: 12 },
        { header: 'No-Shows', key: 'noShows', width: 12 },
        { header: 'Completion Rate', key: 'completionRate', width: 16 },
        { header: 'Unique Riders', key: 'uniqueRiders', width: 14 }
      ];
      addSheetHeader(routesSheet, 'Routes');

      const routesRes = await query(
        `SELECT
          pickup_location,
          dropoff_location,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
          COUNT(DISTINCT rider_email) AS unique_riders
        FROM rides
        WHERE requested_time >= $1 AND requested_time <= $2
          AND status NOT IN ('pending', 'approved', 'scheduled', 'driver_on_the_way', 'driver_arrived_grace')
        GROUP BY pickup_location, dropoff_location
        ORDER BY total DESC`, params
      );

      for (const r of routesRes.rows) {
        const total = parseInt(r.total) || 0;
        const completed = parseInt(r.completed) || 0;
        routesSheet.addRow({
          pickup: r.pickup_location,
          dropoff: r.dropoff_location,
          total,
          completed,
          noShows: parseInt(r.no_shows) || 0,
          completionRate: total > 0 ? parseFloat((completed / total).toFixed(3)) : 0,
          uniqueRiders: parseInt(r.unique_riders) || 0
        });
      }
      routesSheet.getColumn('completionRate').numFmt = '0.0%';
      if (routesRes.rows.length > 0) {
        addCompletionRateFormatting(routesSheet, 'F', 3, 3 + routesRes.rows.length - 1);
      }
      autoSizeColumns(routesSheet);

      // ========== SHEET 4: Driver Performance ==========
      const driverSheet = workbook.addWorksheet('Driver Performance');
      driverSheet.columns = [
        { header: 'Driver Name', key: 'name', width: 20 },
        { header: 'Total Rides', key: 'totalRides', width: 12 },
        { header: 'Completed', key: 'completed', width: 12 },
        { header: 'No-Shows', key: 'noShows', width: 12 },
        { header: 'Completion Rate', key: 'completionRate', width: 16 },
        { header: 'Clock-Ins', key: 'clockIns', width: 12 },
        { header: 'On-Time', key: 'onTime', width: 12 },
        { header: 'Tardy', key: 'tardy', width: 12 },
        { header: 'Punctuality Rate', key: 'punctualityRate', width: 16 },
        { header: 'Avg Tardiness (min)', key: 'avgTardiness', width: 18 },
        { header: 'Max Tardiness (min)', key: 'maxTardiness', width: 18 },
        { header: 'Missed Shifts', key: 'missedShifts', width: 14 },
        { header: 'Hours Worked', key: 'hoursWorked', width: 14 },
        { header: 'Rides/Hour', key: 'ridesPerHour', width: 12 }
      ];
      addSheetHeader(driverSheet, 'Driver Performance');

      const [dpRideRes, dpClockRes, dpMissedRes] = await Promise.all([
        query(
          `SELECT r.assigned_driver_id AS driver_id, u.name AS driver_name,
                  COUNT(*) AS total_rides,
                  COUNT(*) FILTER (WHERE r.status = 'completed') AS completed,
                  COUNT(*) FILTER (WHERE r.status = 'no_show') AS no_shows
           FROM rides r JOIN users u ON r.assigned_driver_id = u.id
           WHERE r.assigned_driver_id IS NOT NULL
             AND r.requested_time >= $1 AND r.requested_time <= $2
           GROUP BY r.assigned_driver_id, u.name`, params
        ),
        query(
          `SELECT ce.employee_id AS driver_id,
                  COUNT(*) AS total_clock_ins,
                  COUNT(*) FILTER (WHERE ce.tardiness_minutes = 0 OR ce.tardiness_minutes IS NULL) AS on_time,
                  COUNT(*) FILTER (WHERE ce.tardiness_minutes > 0) AS tardy,
                  COALESCE(ROUND(AVG(ce.tardiness_minutes) FILTER (WHERE ce.tardiness_minutes > 0), 1), 0) AS avg_tardiness,
                  COALESCE(MAX(ce.tardiness_minutes), 0) AS max_tardiness,
                  ROUND(EXTRACT(EPOCH FROM SUM(ce.clock_out_at - ce.clock_in_at)) / 3600.0, 1) AS total_hours
           FROM clock_events ce
           WHERE ce.event_date >= $1::date AND ce.event_date <= $2::date AND ce.clock_out_at IS NOT NULL
           GROUP BY ce.employee_id`, dateParams
        ),
        query(
          `WITH date_range AS (
            SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS d
          ),
          scheduled AS (
            SELECT s.employee_id, dr.d AS shift_date
            FROM shifts s
            JOIN date_range dr ON (EXTRACT(ISODOW FROM dr.d)::int - 1) = s.day_of_week
            WHERE (s.week_start IS NULL OR s.week_start = (
              dr.d - ((EXTRACT(ISODOW FROM dr.d)::int - 1) || ' days')::interval
            )::date)
          ),
          clocked AS (
            SELECT employee_id, event_date FROM clock_events
          )
          SELECT s.employee_id AS driver_id, COUNT(*) AS missed_shifts
          FROM scheduled s
          LEFT JOIN clocked c ON c.employee_id = s.employee_id AND c.event_date = s.shift_date
          WHERE c.employee_id IS NULL AND s.shift_date <= CURRENT_DATE
          GROUP BY s.employee_id`, dateParams
        )
      ]);

      const dpClockMap = {};
      for (const c of dpClockRes.rows) dpClockMap[c.driver_id] = c;
      const dpMissedMap = {};
      for (const m of dpMissedRes.rows) dpMissedMap[m.driver_id] = parseInt(m.missed_shifts) || 0;

      const dpDriverIds = new Set();
      const dpRows = [];
      for (const r of dpRideRes.rows) {
        dpDriverIds.add(r.driver_id);
        const c = dpClockMap[r.driver_id] || {};
        const totalRides = parseInt(r.total_rides) || 0;
        const completed = parseInt(r.completed) || 0;
        const totalClockIns = parseInt(c.total_clock_ins) || 0;
        const onTime = parseInt(c.on_time) || 0;
        const totalHours = parseFloat(c.total_hours) || 0;
        dpRows.push({
          name: r.driver_name, totalRides, completed, noShows: parseInt(r.no_shows) || 0,
          completionRate: totalRides > 0 ? completed / totalRides : 0,
          clockIns: totalClockIns, onTime, tardy: parseInt(c.tardy) || 0,
          punctualityRate: totalClockIns > 0 ? onTime / totalClockIns : 0,
          avgTardiness: parseFloat(c.avg_tardiness) || 0,
          maxTardiness: parseInt(c.max_tardiness) || 0,
          missedShifts: dpMissedMap[r.driver_id] || 0,
          hoursWorked: totalHours,
          ridesPerHour: totalHours > 0 ? parseFloat((completed / totalHours).toFixed(2)) : 0
        });
      }
      // Add clock-only drivers
      for (const c of dpClockRes.rows) {
        if (!dpDriverIds.has(c.driver_id)) {
          const nameRes2 = await query('SELECT name FROM users WHERE id = $1', [c.driver_id]);
          const totalClockIns = parseInt(c.total_clock_ins) || 0;
          const onTime = parseInt(c.on_time) || 0;
          dpRows.push({
            name: nameRes2.rows[0]?.name || 'Unknown', totalRides: 0, completed: 0, noShows: 0,
            completionRate: 0, clockIns: totalClockIns, onTime, tardy: parseInt(c.tardy) || 0,
            punctualityRate: totalClockIns > 0 ? onTime / totalClockIns : 0,
            avgTardiness: parseFloat(c.avg_tardiness) || 0,
            maxTardiness: parseInt(c.max_tardiness) || 0,
            missedShifts: dpMissedMap[c.driver_id] || 0,
            hoursWorked: parseFloat(c.total_hours) || 0,
            ridesPerHour: 0
          });
        }
      }
      // Sort by completed desc
      dpRows.sort((a, b) => b.completed - a.completed);
      for (const dr of dpRows) {
        driverSheet.addRow(dr);
      }
      driverSheet.getColumn('completionRate').numFmt = '0.0%';
      driverSheet.getColumn('punctualityRate').numFmt = '0.0%';
      if (dpRows.length > 0) {
        // Punctuality conditional formatting
        sheet_addPunctualityFormatting(driverSheet, 'I', 3, 3 + dpRows.length - 1);
        // Missed shifts red if > 0
        driverSheet.addConditionalFormatting({
          ref: `L3:L${3 + dpRows.length - 1}`,
          rules: [
            { type: 'cellIs', operator: 'greaterThan', formulae: [0], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDC3545' } }, font: { color: { argb: 'FFFFFFFF' } } } }
          ]
        });
      }
      autoSizeColumns(driverSheet);

      // Punctuality formatting helper
      function sheet_addPunctualityFormatting(sheet, colLetter, startRow, endRow) {
        sheet.addConditionalFormatting({
          ref: `${colLetter}${startRow}:${colLetter}${endRow}`,
          rules: [
            { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [0.90], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF28A745' } }, font: { color: { argb: 'FFFFFFFF' } } } },
            { type: 'cellIs', operator: 'between', formulae: [0.80, 0.8999], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC107' } } } },
            { type: 'cellIs', operator: 'lessThan', formulae: [0.80], priority: 3, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDC3545' } }, font: { color: { argb: 'FFFFFFFF' } } } }
          ]
        });
      }

      // ========== SHEET 5: Rider Analysis ==========
      const riderSheet = workbook.addWorksheet('Rider Analysis');
      riderSheet.columns = [
        { header: 'Rider Name', key: 'name', width: 20 },
        { header: 'Rider Email', key: 'email', width: 25 },
        { header: 'Total Rides', key: 'total', width: 12 },
        { header: 'Completed', key: 'completed', width: 12 },
        { header: 'No-Shows', key: 'noShows', width: 12 },
        { header: 'No-Show Rate', key: 'noShowRate', width: 14 },
        { header: 'Current Strikes', key: 'strikes', width: 14 },
        { header: 'Cohort', key: 'cohort', width: 14 },
        { header: 'First Ride', key: 'firstRide', width: 14 },
        { header: 'Last Ride', key: 'lastRide', width: 14 }
      ];
      addSheetHeader(riderSheet, 'Rider Analysis');

      const riderAnalysisRes = await query(
        `WITH period_riders AS (
          SELECT rider_email, rider_name,
                 COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                 COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows
          FROM rides
          WHERE requested_time >= $1 AND requested_time <= $2
          GROUP BY rider_email, rider_name
        ),
        all_time AS (
          SELECT rider_email,
                 MIN(requested_time) AS first_ride,
                 MAX(requested_time) AS last_ride
          FROM rides GROUP BY rider_email
        ),
        prev_period AS (
          SELECT DISTINCT rider_email FROM rides
          WHERE requested_time < $1
            AND requested_time >= ($1::date - ($2::date - $1::date))
        )
        SELECT pr.rider_email, pr.rider_name, pr.total, pr.completed, pr.no_shows,
               atf.first_ride, atf.last_ride,
               CASE
                 WHEN atf.first_ride >= $1 THEN 'new'
                 WHEN pp.rider_email IS NOT NULL THEN 'returning'
                 ELSE 'reactivated'
               END AS cohort
        FROM period_riders pr
        JOIN all_time atf ON atf.rider_email = pr.rider_email
        LEFT JOIN prev_period pp ON pp.rider_email = pr.rider_email
        ORDER BY pr.total DESC`, params
      );

      // Get strike counts
      const allStrikesRes = await query(`SELECT u.email, rmc.count FROM rider_miss_counts rmc JOIN users u ON u.id = rmc.rider_id`);
      const strikeMap = {};
      for (const s of allStrikesRes.rows) strikeMap[s.email] = parseInt(s.count) || 0;

      for (const r of riderAnalysisRes.rows) {
        const total = parseInt(r.total) || 0;
        const noShows = parseInt(r.no_shows) || 0;
        riderSheet.addRow({
          name: r.rider_name,
          email: r.rider_email,
          total,
          completed: parseInt(r.completed) || 0,
          noShows,
          noShowRate: total > 0 ? noShows / total : 0,
          strikes: strikeMap[r.rider_email] || 0,
          cohort: r.cohort,
          firstRide: r.first_ride ? new Date(r.first_ride).toISOString().slice(0, 10) : '',
          lastRide: r.last_ride ? new Date(r.last_ride).toISOString().slice(0, 10) : ''
        });
      }
      riderSheet.getColumn('noShowRate').numFmt = '0.0%';

      if (riderAnalysisRes.rows.length > 0) {
        const riderEndRow = 3 + riderAnalysisRes.rows.length - 1;
        // No-Show Rate red if > 20%
        riderSheet.addConditionalFormatting({
          ref: `F3:F${riderEndRow}`,
          rules: [
            { type: 'cellIs', operator: 'greaterThan', formulae: [0.20], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDC3545' } }, font: { color: { argb: 'FFFFFFFF' } } } }
          ]
        });
        // Strikes: yellow if = max-1, red if >= max
        riderSheet.addConditionalFormatting({
          ref: `G3:G${riderEndRow}`,
          rules: [
            { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [maxStrikes], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDC3545' } }, font: { color: { argb: 'FFFFFFFF' } } } },
            { type: 'cellIs', operator: 'equal', formulae: [maxStrikes - 1], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC107' } } } }
          ]
        });
      }
      autoSizeColumns(riderSheet);

      // ========== SHEET 6: Fleet ==========
      const fleetSheet = workbook.addWorksheet('Fleet');
      fleetSheet.columns = [
        { header: 'Vehicle Name', key: 'name', width: 18 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Total Miles', key: 'totalMiles', width: 12 },
        { header: 'Rides (Period)', key: 'rides', width: 14 },
        { header: 'Completed Rides', key: 'completedRides', width: 16 },
        { header: 'Last Used', key: 'lastUsed', width: 14 },
        { header: 'Maintenance Events', key: 'maintEvents', width: 18 },
        { header: 'Last Maintenance', key: 'lastMaint', width: 16 },
        { header: 'Days Since Maintenance', key: 'daysSince', width: 22 }
      ];
      addSheetHeader(fleetSheet, 'Fleet');

      const [fleetVehRes, fleetMaintRes] = await Promise.all([
        query(
          `SELECT v.id, v.name, v.type, v.status, v.total_miles, v.last_maintenance_date,
                  COUNT(r.id) AS total_rides,
                  COUNT(r.id) FILTER (WHERE r.status = 'completed') AS completed_rides,
                  MAX(r.requested_time) AS last_used
           FROM vehicles v
           LEFT JOIN rides r ON r.vehicle_id = v.id AND r.requested_time >= $1 AND r.requested_time <= $2
           GROUP BY v.id, v.name, v.type, v.status, v.total_miles, v.last_maintenance_date
           ORDER BY total_rides DESC`, params
        ),
        query(
          `SELECT vehicle_id, COUNT(*) AS maint_count
           FROM maintenance_logs
           WHERE service_date >= $1::date AND service_date <= $2::date
           GROUP BY vehicle_id`, dateParams
        )
      ]);

      const fleetMaintMap = {};
      for (const m of fleetMaintRes.rows) fleetMaintMap[m.vehicle_id] = parseInt(m.maint_count) || 0;

      let fleetRowNum = 3;
      for (const v of fleetVehRes.rows) {
        const daysSince = v.last_maintenance_date
          ? Math.floor((Date.now() - new Date(v.last_maintenance_date).getTime()) / 86400000)
          : null;
        fleetSheet.addRow({
          name: v.name,
          type: v.type,
          status: v.status,
          totalMiles: parseInt(v.total_miles) || 0,
          rides: parseInt(v.total_rides) || 0,
          completedRides: parseInt(v.completed_rides) || 0,
          lastUsed: v.last_used ? new Date(v.last_used).toISOString().slice(0, 10) : '',
          maintEvents: fleetMaintMap[v.id] || 0,
          lastMaint: v.last_maintenance_date || '',
          daysSince: daysSince !== null ? daysSince : ''
        });
        // Gray background for retired
        if (v.status === 'retired') {
          const row = fleetSheet.getRow(fleetRowNum);
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
          });
        }
        fleetRowNum++;
      }

      if (fleetVehRes.rows.length > 0) {
        const fleetEndRow = 3 + fleetVehRes.rows.length - 1;
        // Days since maintenance: yellow >= 20, red >= 30
        fleetSheet.addConditionalFormatting({
          ref: `J3:J${fleetEndRow}`,
          rules: [
            { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [30], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDC3545' } }, font: { color: { argb: 'FFFFFFFF' } } } },
            { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [20], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC107' } } } }
          ]
        });
      }
      autoSizeColumns(fleetSheet);

      // ========== SHEET 7: Shift Coverage ==========
      const coverageSheet = workbook.addWorksheet('Shift Coverage');
      coverageSheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Day', key: 'day', width: 12 },
        { header: 'Scheduled Hours', key: 'scheduledHours', width: 16 },
        { header: 'Actual Hours', key: 'actualHours', width: 14 },
        { header: 'Gap Hours', key: 'gapHours', width: 12 },
        { header: 'Coverage Rate', key: 'coverageRate', width: 14 },
        { header: 'Scheduled Drivers', key: 'scheduledDrivers', width: 18 },
        { header: 'Actual Drivers', key: 'actualDrivers', width: 14 },
        { header: 'Completed Rides', key: 'completedRides', width: 16 },
        { header: 'Rides/Driver-Hour', key: 'ridesPerHour', width: 16 }
      ];
      addSheetHeader(coverageSheet, 'Shift Coverage');

      const coverageRes = await query(
        `WITH date_range AS (
          SELECT generate_series($1::date, LEAST($2::date, CURRENT_DATE), '1 day'::interval)::date AS d
        ),
        scheduled AS (
          SELECT dr.d AS day,
                 SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0) AS scheduled_hours,
                 COUNT(DISTINCT s.employee_id) AS scheduled_drivers
          FROM date_range dr
          JOIN shifts s ON (EXTRACT(ISODOW FROM dr.d)::int - 1) = s.day_of_week
            AND (s.week_start IS NULL OR s.week_start = (
              dr.d - ((EXTRACT(ISODOW FROM dr.d)::int - 1) || ' days')::interval
            )::date)
          WHERE EXTRACT(ISODOW FROM dr.d) BETWEEN 1 AND 5
          GROUP BY dr.d
        ),
        actual AS (
          SELECT ce.event_date AS day,
                 SUM(EXTRACT(EPOCH FROM (ce.clock_out_at - ce.clock_in_at)) / 3600.0) AS actual_hours,
                 COUNT(DISTINCT ce.employee_id) AS actual_drivers
          FROM clock_events ce
          WHERE ce.event_date >= $1::date AND ce.event_date <= $2::date AND ce.clock_out_at IS NOT NULL
          GROUP BY ce.event_date
        ),
        daily_rides AS (
          SELECT DATE(requested_time) AS day,
                 COUNT(*) FILTER (WHERE status = 'completed') AS completed
          FROM rides WHERE requested_time >= $1 AND requested_time <= $2
          GROUP BY DATE(requested_time)
        )
        SELECT s.day,
               ROUND(COALESCE(s.scheduled_hours, 0)::numeric, 1) AS scheduled_hours,
               ROUND(COALESCE(a.actual_hours, 0)::numeric, 1) AS actual_hours,
               ROUND((COALESCE(a.actual_hours, 0) - COALESCE(s.scheduled_hours, 0))::numeric, 1) AS gap_hours,
               COALESCE(s.scheduled_drivers, 0) AS scheduled_drivers,
               COALESCE(a.actual_drivers, 0) AS actual_drivers,
               COALESCE(dr.completed, 0) AS completed_rides
        FROM scheduled s
        LEFT JOIN actual a ON a.day = s.day
        LEFT JOIN daily_rides dr ON dr.day = s.day
        ORDER BY s.day`,
        [from, to + 'T23:59:59.999Z']
      );

      for (const r of coverageRes.rows) {
        const dt = new Date(r.day);
        const scheduledHours = parseFloat(r.scheduled_hours) || 0;
        const actualHours = parseFloat(r.actual_hours) || 0;
        const completedRides = parseInt(r.completed_rides) || 0;
        coverageSheet.addRow({
          date: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
          day: dayNames[dt.getDay()],
          scheduledHours,
          actualHours,
          gapHours: parseFloat(r.gap_hours) || 0,
          coverageRate: scheduledHours > 0 ? actualHours / scheduledHours : 0,
          scheduledDrivers: parseInt(r.scheduled_drivers) || 0,
          actualDrivers: parseInt(r.actual_drivers) || 0,
          completedRides,
          ridesPerHour: actualHours > 0 ? parseFloat((completedRides / actualHours).toFixed(2)) : 0
        });
      }
      coverageSheet.getColumn('coverageRate').numFmt = '0.0%';
      if (coverageRes.rows.length > 0) {
        const covEndRow = 3 + coverageRes.rows.length - 1;
        // Coverage rate: green >= 95%, yellow 80-94%, red < 80%
        coverageSheet.addConditionalFormatting({
          ref: `F3:F${covEndRow}`,
          rules: [
            { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [0.95], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF28A745' } }, font: { color: { argb: 'FFFFFFFF' } } } },
            { type: 'cellIs', operator: 'between', formulae: [0.80, 0.9499], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC107' } } } },
            { type: 'cellIs', operator: 'lessThan', formulae: [0.80], priority: 3, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDC3545' } }, font: { color: { argb: 'FFFFFFFF' } } } }
          ]
        });
        // Gap hours: red if negative
        coverageSheet.addConditionalFormatting({
          ref: `E3:E${covEndRow}`,
          rules: [
            { type: 'cellIs', operator: 'lessThan', formulae: [0], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDC3545' } }, font: { color: { argb: 'FFFFFFFF' } } } }
          ]
        });
      }
      autoSizeColumns(coverageSheet);

      // ========== SHEET 8: Peak Hours ==========
      const peakSheet = workbook.addWorksheet('Peak Hours');
      const startHourExport = parseInt((await getSetting('service_hours_start', '08:00')).split(':')[0]) || 8;
      const endHourExport = parseInt((await getSetting('service_hours_end', '19:00')).split(':')[0]) || 19;

      // Build columns: first col = Hour, then Mon-Fri
      const peakCols = [{ header: 'Hour', key: 'hour', width: 10 }];
      const peakDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      for (const d of peakDayNames) {
        peakCols.push({ header: d, key: d.toLowerCase(), width: 12 });
      }
      peakSheet.columns = peakCols;
      addSheetHeader(peakSheet, 'Peak Hours Heatmap');

      const peakRes = await query(
        `SELECT
          EXTRACT(ISODOW FROM requested_time)::int AS dow,
          EXTRACT(HOUR FROM requested_time)::int AS hour,
          COUNT(*) AS total
        FROM rides
        WHERE requested_time >= $1 AND requested_time <= $2
          AND EXTRACT(ISODOW FROM requested_time) BETWEEN 1 AND 5
          AND EXTRACT(HOUR FROM requested_time) BETWEEN $3 AND $4
        GROUP BY dow, hour
        ORDER BY dow, hour`,
        [...params, startHourExport, endHourExport - 1]
      );

      // Build lookup grid
      const peakGrid = {};
      let peakMax = 0;
      for (const r of peakRes.rows) {
        const key = `${r.dow}_${r.hour}`;
        const val = parseInt(r.total) || 0;
        peakGrid[key] = val;
        if (val > peakMax) peakMax = val;
      }

      // Add rows: one per hour
      for (let h = startHourExport; h < endHourExport; h++) {
        const rowData = { hour: `${h}:00` };
        for (let d = 1; d <= 5; d++) {
          rowData[peakDayNames[d - 1].toLowerCase()] = peakGrid[`${d}_${h}`] || 0;
        }
        peakSheet.addRow(rowData);
      }

      // Color scale conditional formatting for the data cells
      const peakDataRows = endHourExport - startHourExport;
      if (peakDataRows > 0) {
        peakSheet.addConditionalFormatting({
          ref: `B3:F${3 + peakDataRows - 1}`,
          rules: [{
            type: 'colorScale',
            priority: 1,
            cfvo: [
              { type: 'min' },
              { type: 'max' }
            ],
            color: [
              { argb: 'FFFFFFFF' },
              { argb: 'FF4682B4' }
            ]
          }]
        });
      }
      autoSizeColumns(peakSheet);

      // Stream workbook
      const today = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="rideops-report-${today}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('analytics export-report error:', err);
      res.status(500).json({ error: 'Failed to generate export report' });
    }
  }));
};
