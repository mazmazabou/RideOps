'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    pool,
    wrapAsync,
    requireAuth,
    requireStaff,
    requireOffice,
    requireRider,
    generateId,
    stripHtml,
    mapRide,
    addRideEvent,
    getSetting,
    getRiderMissCount,
    isValidEmail,
    isWithinServiceHours,
    getServiceHoursMessage,
    TENANT,
    dispatchNotification,
    sendRiderEmail,
    createRiderNotification,
    campusLocations,
    allCampusLocations
  } = ctx;

  // ----- Ride endpoints -----
  app.get('/api/rides', requireStaff, wrapAsync(async (req, res) => {
    const { status, from, to, search, limit: limitParam, cursor } = req.query;
    const baseCols = `
      r.id, r.rider_id, r.rider_name, r.rider_email, r.rider_phone, r.pickup_location, r.dropoff_location, r.notes,
      r.requested_time, r.status, r.assigned_driver_id, r.grace_start_time, r.consecutive_misses, r.recurring_id, r.cancelled_by, r.vehicle_id,
      d.name AS driver_name, d.phone AS driver_phone,
      ru.preferred_name AS rider_preferred_name, ru.avatar_url AS rider_avatar_url, ru.major AS rider_major, ru.graduation_year AS rider_graduation_year, ru.bio AS rider_bio,
      d.preferred_name AS driver_preferred_name, d.avatar_url AS driver_avatar_url, d.bio AS driver_bio`;
    const baseFrom = `
      FROM rides r
      LEFT JOIN users d ON r.assigned_driver_id = d.id
      LEFT JOIN users ru ON r.rider_id = ru.id`;

    // Build WHERE conditions for server-side filtering
    const conditions = [];
    const params = [];

    // Multi-status filter (comma-separated)
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        params.push(statuses[0]);
        conditions.push(`r.status = $${params.length}`);
      } else if (statuses.length > 1) {
        params.push(statuses);
        conditions.push(`r.status = ANY($${params.length})`);
      }
    }

    // Date range on requested_time
    if (from) {
      params.push(from);
      conditions.push(`r.requested_time >= $${params.length}::date`);
    }
    if (to) {
      params.push(to + 'T23:59:59.999Z');
      conditions.push(`r.requested_time <= $${params.length}::timestamptz`);
    }

    // Text search
    if (search) {
      const searchPattern = `%${search}%`;
      params.push(searchPattern);
      const si = params.length;
      conditions.push(`(r.rider_name ILIKE $${si} OR r.pickup_location ILIKE $${si} OR r.dropoff_location ILIKE $${si} OR r.status ILIKE $${si} OR r.id ILIKE $${si} OR r.notes ILIKE $${si})`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // If no limit param, return legacy flat array
    if (!limitParam) {
      const result = await query(
        `SELECT ${baseCols} ${baseFrom} ${whereClause} ORDER BY r.requested_time DESC, r.id DESC`,
        params
      );
      return res.json(result.rows.map(mapRide));
    }

    // Paginated mode
    const limit = Math.min(Math.max(parseInt(limitParam) || 50, 1), 200);
    const cursorConditions = [...conditions];
    const cursorParams = [...params];

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
        cursorParams.push(decoded.t);
        cursorParams.push(decoded.i);
        cursorConditions.push(`(r.requested_time, r.id) < ($${cursorParams.length - 1}::timestamptz, $${cursorParams.length})`);
      } catch {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
    }

    const cursorWhere = cursorConditions.length > 0 ? 'WHERE ' + cursorConditions.join(' AND ') : '';

    // Fetch limit+1 to detect hasMore
    cursorParams.push(limit + 1);
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT ${baseCols} ${baseFrom} ${cursorWhere} ORDER BY r.requested_time DESC, r.id DESC LIMIT $${cursorParams.length}`,
        cursorParams
      ),
      query(
        `SELECT COUNT(*) AS total ${baseFrom} ${whereClause}`,
        params
      ),
    ]);

    const rows = dataResult.rows;
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    let nextCursor = null;
    if (hasMore && rows.length > 0) {
      const last = rows[rows.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ t: last.requested_time, i: last.id })).toString('base64');
    }

    res.json({
      rides: rows.map(mapRide),
      nextCursor,
      totalCount: parseInt(countResult.rows[0].total),
      hasMore,
    });
  }));

  app.post('/api/rides', requireAuth, wrapAsync(async (req, res) => {
    const { riderName, riderEmail, riderPhone, pickupLocation, dropoffLocation, requestedTime, notes } = req.body;

    // Check if rider is terminated due to no-shows
    if (req.session.role === 'rider') {
      const strikesEnabled = await getSetting('strikes_enabled');
      if (strikesEnabled === 'true' || strikesEnabled === true) {
        const maxStrikes = parseInt(await getSetting('max_no_show_strikes')) || 5;
        const missResult = await query(
          'SELECT count FROM rider_miss_counts WHERE email = $1',
          [req.session.email]
        );
        const missCount = missResult.rows[0]?.count || 0;
        if (missCount >= maxStrikes) {
          return res.status(403).json({
            error: 'Your ride privileges have been suspended due to repeated no-shows. Please contact the office to reinstate your account.'
          });
        }
      }
    }

    if (!pickupLocation || !dropoffLocation || !requestedTime) {
      return res.status(400).json({ error: 'Pickup, dropoff, and requested time are required' });
    }
    const autoDeny = await getSetting('auto_deny_outside_hours', true);
    if (autoDeny && !(await isWithinServiceHours(requestedTime))) {
      return res.status(400).json({ error: await getServiceHoursMessage() });
    }

    const requesterRole = req.session.role;
    const email = requesterRole === 'rider' ? req.session.email : riderEmail;
    const name = requesterRole === 'rider' ? req.session.name : riderName;
    const phone = riderPhone;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Rider name is required' });
    }

    const missCount = await getRiderMissCount(email);
    const rideId = generateId('ride');
    await query(
      `INSERT INTO rides (id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes, requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NULL, NULL, $10, NULL)`,
      [rideId, req.session.userId, name, email, phone, pickupLocation, dropoffLocation, stripHtml(notes || ''), requestedTime, missCount]
    );
    await addRideEvent(rideId, req.session.userId, 'requested');
    const ride = await query(
      `SELECT id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
              requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id
       FROM rides WHERE id = $1`,
      [rideId]
    );
    res.json(mapRide(ride.rows[0]));

    // Fire-and-forget: new ride request notification
    dispatchNotification('new_ride_request', {
      riderName: name,
      pickup: pickupLocation,
      dropoff: dropoffLocation,
      requestedTime: new Date(requestedTime).toLocaleString('en-US', { timeZone: TENANT.timezone })
    }, query).catch(() => {});
  }));

  app.post('/api/rides/:id/approve', requireOffice, wrapAsync(async (req, res) => {
    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'pending') return res.status(400).json({ error: 'Only pending rides can be approved' });
    const missCountRes = await query('SELECT count FROM rider_miss_counts WHERE email = $1', [ride.rider_email]);
    const missCount = missCountRes.rows[0] != null ? missCountRes.rows[0].count : (ride.consecutive_misses || 0);
    const strikesEnabled = await getSetting('strikes_enabled', true);
    const maxStrikes = await getSetting('max_no_show_strikes', 5);
    if (strikesEnabled && maxStrikes > 0 && missCount >= maxStrikes) {
      return res.status(400).json({ error: `SERVICE TERMINATED: rider has ${maxStrikes} consecutive no-shows` });
    }
    const autoDenyApproval = await getSetting('auto_deny_outside_hours', true);
    if (autoDenyApproval && !(await isWithinServiceHours(ride.requested_time))) {
      return res.status(400).json({ error: await getServiceHoursMessage() });
    }

    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      result = await client.query(
        `UPDATE rides SET status = 'approved', updated_at = NOW() WHERE id = $1
         RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                   requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
        [ride.id]
      );
      await addRideEvent(ride.id, req.session.userId, 'approved', null, null, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json(mapRide(result.rows[0]));

    if (ride.rider_id) {
      createRiderNotification('ride_approved', {
        riderId: ride.rider_id,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});
    }
  }));

  app.post('/api/rides/:id/deny', requireOffice, wrapAsync(async (req, res) => {
    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'pending') return res.status(400).json({ error: 'Only pending rides can be denied' });
    const result = await query(
      `UPDATE rides SET status = 'denied', updated_at = NOW() WHERE id = $1
       RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                 requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
      [ride.id]
    );
    await addRideEvent(ride.id, req.session.userId, 'denied');
    res.json(mapRide(result.rows[0]));

    if (ride.rider_id) {
      createRiderNotification('ride_denied', {
        riderId: ride.rider_id,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});
    }
  }));

  app.get('/api/my-rides', requireRider, wrapAsync(async (req, res) => {
    const result = await query(
      `SELECT r.id, r.rider_name, r.rider_email, r.rider_phone, r.pickup_location, r.dropoff_location, r.notes,
              r.requested_time, r.status, r.assigned_driver_id, r.grace_start_time, r.consecutive_misses, r.recurring_id, r.rider_id, r.vehicle_id,
              u.name AS driver_name, u.phone AS driver_phone,
              u.preferred_name AS driver_preferred_name, u.avatar_url AS driver_avatar_url, u.bio AS driver_bio
       FROM rides r
       LEFT JOIN users u ON r.assigned_driver_id = u.id
       WHERE r.rider_email = $1 ORDER BY r.requested_time DESC`,
      [req.session.email]
    );
    res.json(result.rows.map(mapRide));
  }));

  app.post('/api/rides/:id/cancel', requireAuth, wrapAsync(async (req, res) => {
    const isOffice = req.session.role === 'office';

    let rideRes;
    if (isOffice) {
      rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    } else if (req.session.role === 'rider') {
      rideRes = await query(
        `SELECT * FROM rides WHERE id = $1 AND (rider_id = $2 OR rider_email = $3)`,
        [req.params.id, req.session.userId, req.session.email]
      );
    } else {
      return res.status(403).json({ error: 'Only riders or office can cancel rides' });
    }

    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    if (isOffice) {
      const terminalStatuses = ['completed', 'no_show', 'cancelled', 'denied'];
      if (terminalStatuses.includes(ride.status)) {
        return res.status(400).json({ error: 'Cannot cancel a ride that is already completed, no-show, cancelled, or denied' });
      }
    } else {
      const canCancelPending = ride.status === 'pending';
      const canCancelApproved = ride.status === 'approved' && !ride.assigned_driver_id;
      if (!canCancelPending && !canCancelApproved) {
        return res.status(400).json({ error: 'Only pending rides (or unassigned approved rides) can be cancelled' });
      }
    }

    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      result = await client.query(
        `UPDATE rides
         SET status = 'cancelled', assigned_driver_id = NULL, grace_start_time = NULL, cancelled_by = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                   requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, cancelled_by, vehicle_id`,
        [ride.id, isOffice ? 'office' : 'rider']
      );
      await addRideEvent(ride.id, req.session.userId, isOffice ? 'cancelled_by_office' : 'cancelled', null, null, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json(mapRide(result.rows[0]));

    if (isOffice && ride.rider_id) {
      createRiderNotification('ride_cancelled', {
        riderId: ride.rider_id,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});
    }
  }));

  // Bulk delete rides (office only)
  app.post('/api/rides/bulk-delete', requireOffice, wrapAsync(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
    try {
      await query('DELETE FROM ride_events WHERE ride_id = ANY($1::text[])', [ids]);
      const result = await query('DELETE FROM rides WHERE id = ANY($1::text[])', [ids]);
      res.json({ deleted: result.rowCount });
    } catch (err) {
      console.error('POST /api/rides/bulk-delete error:', err);
      res.status(500).json({ error: 'Failed to delete rides' });
    }
  }));

  // ----- Office admin override endpoints -----
  app.post('/api/rides/:id/unassign', requireOffice, wrapAsync(async (req, res) => {
    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const allowedStatuses = ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'];
    if (!allowedStatuses.includes(ride.status)) {
      return res.status(400).json({ error: 'Can only unassign rides that are scheduled, on the way, or in grace period' });
    }

    const result = await query(
      `UPDATE rides
       SET assigned_driver_id = NULL, vehicle_id = NULL, status = 'approved', grace_start_time = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                 requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, vehicle_id`,
      [ride.id]
    );
    await addRideEvent(ride.id, req.session.userId, 'unassigned');
    res.json(mapRide(result.rows[0]));

    if (ride.rider_id) {
      createRiderNotification('ride_unassigned', {
        riderId: ride.rider_id,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});
    }
  }));

  app.post('/api/rides/:id/reassign', requireOffice, wrapAsync(async (req, res) => {
    const { driverId } = req.body;
    if (!driverId) return res.status(400).json({ error: 'driverId is required' });

    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const allowedStatuses = ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'];
    if (!allowedStatuses.includes(ride.status)) {
      return res.status(400).json({ error: 'Can only reassign rides that are scheduled, on the way, or in grace period' });
    }

    const driverRes = await query(`SELECT id, active FROM users WHERE id = $1 AND role = 'driver' AND deleted_at IS NULL`, [driverId]);
    const driver = driverRes.rows[0];
    if (!driver) return res.status(400).json({ error: 'Driver not found' });
    if (!driver.active) return res.status(400).json({ error: 'Driver must be clocked in to be assigned rides' });

    const result = await query(
      `UPDATE rides
       SET assigned_driver_id = $1, status = 'scheduled', grace_start_time = NULL, updated_at = NOW()
       WHERE id = $2
       RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                 requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, vehicle_id`,
      [driverId, ride.id]
    );
    await addRideEvent(ride.id, req.session.userId, 'reassigned');
    res.json(mapRide(result.rows[0]));
  }));

  app.put('/api/rides/:id', requireOffice, wrapAsync(async (req, res) => {
    const { pickupLocation, dropoffLocation, requestedTime, notes, changeNotes, initials } = req.body;
    if (!changeNotes || !changeNotes.trim()) return res.status(400).json({ error: 'Change notes are required' });
    if (!initials || !initials.trim()) return res.status(400).json({ error: 'Initials are required' });

    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    const terminalStatuses = ['completed', 'no_show', 'cancelled', 'denied'];
    if (terminalStatuses.includes(ride.status)) {
      return res.status(400).json({ error: 'Cannot edit a ride that is completed, no-show, cancelled, or denied' });
    }
    const autoDenyEdit = await getSetting('auto_deny_outside_hours', true);
    if (requestedTime && autoDenyEdit && !(await isWithinServiceHours(requestedTime))) {
      return res.status(400).json({ error: await getServiceHoursMessage() });
    }

    const updates = [];
    const values = [];
    let idx = 1;
    if (pickupLocation !== undefined) { updates.push(`pickup_location = $${idx++}`); values.push(pickupLocation); }
    if (dropoffLocation !== undefined) { updates.push(`dropoff_location = $${idx++}`); values.push(dropoffLocation); }
    if (requestedTime !== undefined) { updates.push(`requested_time = $${idx++}`); values.push(requestedTime); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); values.push(stripHtml(notes)); }
    updates.push(`updated_at = NOW()`);

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    const result = await query(
      `UPDATE rides SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                 requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, cancelled_by, vehicle_id`,
      values
    );
    await addRideEvent(ride.id, req.session.userId, 'edited', changeNotes.trim(), initials.trim());
    res.json(mapRide(result.rows[0]));
  }));

  app.get('/api/locations', requireAuth, (req, res) => {
    const campus = req.query.campus || req.session.campus;
    if (campus && allCampusLocations[campus]) {
      return res.json(allCampusLocations[campus]);
    }
    res.json(campusLocations);
  });
};
