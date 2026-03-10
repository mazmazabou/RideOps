'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    pool,
    wrapAsync,
    requireAuth,
    requireStaff,
    generateId,
    mapRide,
    addRideEvent,
    getSetting,
    allowDriverAction,
    getRiderMissCount,
    incrementRiderMissCount,
    setRiderMissCount,
    TENANT,
    dispatchNotification,
    sendRiderEmail,
    createRiderNotification,
    sendUserNotification
  } = ctx;

  app.post('/api/rides/:id/claim', requireAuth, wrapAsync(async (req, res) => {
    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'approved') return res.status(400).json({ error: 'Only approved rides can be claimed' });
    if (ride.assigned_driver_id) return res.status(400).json({ error: 'Ride already assigned' });
    if (req.session.role !== 'driver' && req.session.role !== 'office') {
      return res.status(403).json({ error: 'Only drivers or office can claim rides' });
    }

    const driverId = req.session.role === 'driver' ? req.session.userId : req.body.driverId;
    const vehicleId = req.body.vehicleId || null;
    const driverRes = await query(`SELECT id, active FROM users WHERE id = $1 AND role = 'driver' AND deleted_at IS NULL`, [driverId]);
    const driver = driverRes.rows[0];
    if (!driver) return res.status(400).json({ error: 'Driver not found' });
    if (!driver.active) return res.status(400).json({ error: 'Driver must be clocked in to claim rides' });

    const client = await pool.connect();
    let updated;
    try {
      await client.query('BEGIN');
      updated = await client.query(
        `UPDATE rides
         SET assigned_driver_id = $1, vehicle_id = $2, status = 'scheduled', updated_at = NOW()
         WHERE id = $3 AND assigned_driver_id IS NULL AND status = 'approved'
         RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                   requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
        [driverId, vehicleId, ride.id]
      );
      if (!updated.rowCount) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: 'Ride already assigned' });
      }
      await addRideEvent(ride.id, req.session.userId, 'claimed', null, null, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json(mapRide(updated.rows[0]));

    if (ride.rider_id) {
      const driverNameRes = await query('SELECT name FROM users WHERE id = $1', [driverId]);
      const driverName = driverNameRes.rows[0]?.name || 'Your driver';
      createRiderNotification('ride_scheduled', {
        riderId: ride.rider_id,
        driverName,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});

      // Notify the driver about their new assignment
      sendUserNotification(driverId, 'driver_new_assignment', {
        driverName: driverNameRes.rows[0]?.name || 'Driver',
        riderName: ride.rider_name,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location,
        time: new Date(ride.requested_time).toLocaleString('en-US', { timeZone: TENANT.timezone, hour: 'numeric', minute: '2-digit' })
      }, query).catch(() => {});
    }
  }));

  // ----- Driver action endpoints -----
  app.post('/api/rides/:id/on-the-way', requireAuth, wrapAsync(async (req, res) => {
    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'scheduled') return res.status(400).json({ error: 'Ride must be in scheduled status to start' });
    if (!(await allowDriverAction(req, res, ride))) return;
    const { vehicleId } = req.body || {};
    let finalVehicleId = ride.vehicle_id;
    if (vehicleId) {
      const vehRes = await query('SELECT * FROM vehicles WHERE id = $1', [vehicleId]);
      if (!vehRes.rowCount) return res.status(400).json({ error: 'Vehicle not found' });
      if (vehRes.rows[0].status !== 'available') return res.status(400).json({ error: 'Vehicle is not available' });
      finalVehicleId = vehicleId;
    }
    if (!finalVehicleId) {
      return res.status(400).json({ error: 'A vehicle must be selected before starting this ride. Please select a cart.' });
    }
    const result = await query(
      `UPDATE rides SET status = 'driver_on_the_way', vehicle_id = $2, updated_at = NOW() WHERE id = $1
       RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                 requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
      [ride.id, finalVehicleId]
    );
    await addRideEvent(ride.id, req.session.userId, 'driver_on_the_way');
    res.json(mapRide(result.rows[0]));

    if (ride.rider_id) {
      const driverNameRes = await query('SELECT name FROM users WHERE id = $1', [ride.assigned_driver_id]);
      const driverName = driverNameRes.rows[0]?.name || 'Your driver';
      createRiderNotification('ride_driver_on_the_way', {
        riderId: ride.rider_id,
        driverName,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});

      // Preference-aware rider notification
      sendUserNotification(ride.rider_id, 'rider_driver_on_way', {
        riderName: ride.rider_name,
        driverName,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});
    }
  }));

  app.post('/api/rides/:id/here', requireAuth, wrapAsync(async (req, res) => {
    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'driver_on_the_way') return res.status(400).json({ error: 'Ride must be in on-the-way status to mark arrived' });
    if (!(await allowDriverAction(req, res, ride))) return;
    const result = await query(
      `UPDATE rides SET status = 'driver_arrived_grace', grace_start_time = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                 requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
      [ride.id]
    );
    await addRideEvent(ride.id, req.session.userId, 'driver_arrived_grace');
    res.json(mapRide(result.rows[0]));

    if (ride.rider_id) {
      const driverNameRes = await query('SELECT name FROM users WHERE id = $1', [ride.assigned_driver_id]);
      const driverName = driverNameRes.rows[0]?.name || 'Your driver';
      createRiderNotification('ride_driver_arrived', {
        riderId: ride.rider_id,
        driverName,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});

      // Preference-aware rider notification
      sendUserNotification(ride.rider_id, 'rider_driver_arrived', {
        riderName: ride.rider_name,
        driverName,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});
    }
  }));

  app.post('/api/rides/:id/complete', requireAuth, wrapAsync(async (req, res) => {
    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'driver_arrived_grace') return res.status(400).json({ error: 'Ride must be in grace period to complete' });
    if (!(await allowDriverAction(req, res, ride))) return;
    const { vehicleId } = req.body || {};
    if (vehicleId && !ride.vehicle_id) {
      ride.vehicle_id = vehicleId;
    }
    if (!ride.vehicle_id) {
      return res.status(400).json({ error: 'A vehicle must be recorded before completing this ride.' });
    }

    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      result = await client.query(
        `UPDATE rides SET status = 'completed', consecutive_misses = 0, vehicle_id = COALESCE($2, vehicle_id), updated_at = NOW()
         WHERE id = $1
         RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                   requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
        [ride.id, ride.vehicle_id]
      );
      if (ride.rider_id) {
        await setRiderMissCount(ride.rider_id, 0, client);
      }
      await addRideEvent(ride.id, req.session.userId, 'completed', null, null, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json(mapRide(result.rows[0]));

    if (ride.rider_id) {
      createRiderNotification('ride_completed_rider', {
        riderId: ride.rider_id,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});

      // Preference-aware rider notification
      sendUserNotification(ride.rider_id, 'rider_ride_completed', {
        riderName: ride.rider_name,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location
      }, query).catch(() => {});
    }
  }));

  app.post('/api/rides/:id/no-show', requireAuth, wrapAsync(async (req, res) => {
    const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
    const ride = rideRes.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'driver_arrived_grace') return res.status(400).json({ error: 'Ride must be in grace period to mark no-show' });
    if (!(await allowDriverAction(req, res, ride))) return;
    // Enforce grace period server-side
    if (ride.grace_start_time) {
      const graceMins = await getSetting('grace_period_minutes', 5);
      const graceMs = Number(graceMins) * 60 * 1000;
      const elapsed = Date.now() - new Date(ride.grace_start_time).getTime();
      if (elapsed < graceMs) {
        const remaining = Math.ceil((graceMs - elapsed) / 1000);
        return res.status(400).json({ error: `Grace period not elapsed. ${remaining} seconds remaining.` });
      }
    }

    const client = await pool.connect();
    let newCount, result;
    try {
      await client.query('BEGIN');
      newCount = ride.rider_id ? await incrementRiderMissCount(ride.rider_id, client) : 0;
      result = await client.query(
        `UPDATE rides SET status = 'no_show', consecutive_misses = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                   requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
        [ride.id, newCount]
      );
      await addRideEvent(ride.id, req.session.userId, 'no_show', null, null, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json(mapRide(result.rows[0]));

    // Fire-and-forget: no-show notifications
    (async () => {
      try {
        const driverRow = ride.assigned_driver_id ? await query('SELECT name FROM users WHERE id = $1', [ride.assigned_driver_id]) : null;
        const driverName = driverRow?.rows[0]?.name || 'Unassigned';

        dispatchNotification('rider_no_show', {
          riderName: ride.rider_name,
          pickup: ride.pickup_location,
          dropoff: ride.dropoff_location,
          requestedTime: new Date(ride.requested_time).toLocaleString('en-US', { timeZone: TENANT.timezone }),
          driverName,
          consecutiveMisses: newCount
        }, query);

        const maxStrikes = Number(await getSetting('max_no_show_strikes', 5));
        const strikesEnabled = (await getSetting('strikes_enabled', true)) !== 'false';

        if (strikesEnabled && newCount >= maxStrikes) {
          dispatchNotification('rider_terminated', {
            riderName: ride.rider_name,
            consecutiveMisses: newCount,
            maxStrikes
          }, query);
        } else if (strikesEnabled && newCount >= maxStrikes - 1) {
          dispatchNotification('rider_approaching_termination', {
            riderName: ride.rider_name,
            consecutiveMisses: newCount,
            maxStrikes,
            missesRemaining: maxStrikes - newCount
          }, query);
        }

        // Rider-facing notifications
        const riderData = {
          riderName: ride.rider_name,
          riderEmail: ride.rider_email,
          pickup: ride.pickup_location,
          dropoff: ride.dropoff_location,
          requestedTime: new Date(ride.requested_time).toLocaleString('en-US', { timeZone: TENANT.timezone }),
          consecutiveMisses: newCount,
          maxStrikes: maxStrikes,
          missesRemaining: maxStrikes - newCount
        };

        const notifyNoShow = (await getSetting('notify_rider_no_show', 'true')) !== 'false';
        if (notifyNoShow) {
          sendRiderEmail('rider_no_show_notice', riderData);
        }

        const notifyStrikeWarn = (await getSetting('notify_rider_strike_warning', 'true')) !== 'false';
        if (strikesEnabled && newCount >= maxStrikes) {
          // Always send termination notice
          sendRiderEmail('rider_terminated_notice', riderData);
        } else if (strikesEnabled && notifyStrikeWarn && newCount >= maxStrikes - 2) {
          sendRiderEmail('rider_strike_warning', riderData);
        }

        // Rider in-app notification
        if (ride.rider_id) {
          createRiderNotification('ride_no_show_rider', {
            riderId: ride.rider_id,
            pickup: ride.pickup_location,
            dropoff: ride.dropoff_location,
            consecutiveMisses: newCount
          }, query);

          // Preference-aware rider notifications
          sendUserNotification(ride.rider_id, 'rider_no_show_notice', {
            riderName: ride.rider_name,
            pickup: ride.pickup_location,
            dropoff: ride.dropoff_location,
            requestedTime: new Date(ride.requested_time).toLocaleString('en-US', { timeZone: TENANT.timezone }),
            consecutiveMisses: newCount,
            maxStrikes,
            missesRemaining: maxStrikes - newCount
          }, query);

          if (strikesEnabled && newCount >= maxStrikes) {
            sendUserNotification(ride.rider_id, 'rider_terminated_notice', {
              riderName: ride.rider_name,
              consecutiveMisses: newCount,
              maxStrikes
            }, query);
          } else if (strikesEnabled && newCount >= maxStrikes - 2) {
            sendUserNotification(ride.rider_id, 'rider_strike_warning', {
              riderName: ride.rider_name,
              consecutiveMisses: newCount,
              maxStrikes,
              missesRemaining: maxStrikes - newCount
            }, query);
          }
        }
      } catch (err) {
        console.error('[Notifications] no-show dispatch error:', err.message);
      }
    })();
  }));

  // ----- Per-ride vehicle assignment (driver or office) -----
  app.patch('/api/rides/:id/vehicle', requireStaff, wrapAsync(async (req, res) => {
    try {
      const { vehicle_id } = req.body;
      if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id is required' });
      const rideRes = await query('SELECT * FROM rides WHERE id = $1', [req.params.id]);
      if (!rideRes.rowCount) return res.status(404).json({ error: 'Ride not found' });
      const ride = rideRes.rows[0];
      // Must be the assigned driver or office
      if (req.session.role !== 'office' && ride.assigned_driver_id !== req.session.userId) {
        return res.status(403).json({ error: 'Not authorized for this ride' });
      }
      if (['completed','no_show','cancelled','denied'].includes(ride.status)) {
        return res.status(400).json({ error: 'Cannot set vehicle on a terminal ride' });
      }
      const vehRes = await query('SELECT id, name, status FROM vehicles WHERE id = $1', [vehicle_id]);
      if (!vehRes.rowCount) return res.status(404).json({ error: 'Vehicle not found' });
      if (vehRes.rows[0].status === 'retired') return res.status(400).json({ error: 'Vehicle is retired' });
      await query('UPDATE rides SET vehicle_id = $1, updated_at = NOW() WHERE id = $2', [vehicle_id, ride.id]);
      res.json({ ok: true, vehicle_id, vehicle_name: vehRes.rows[0].name });
    } catch (err) {
      console.error('PATCH /api/rides/:id/vehicle error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }));

  // ----- Set vehicle on ride -----
  app.post('/api/rides/:id/set-vehicle', requireStaff, wrapAsync(async (req, res) => {
    const { vehicleId } = req.body;
    if (!vehicleId) return res.status(400).json({ error: 'vehicleId is required' });
    const rideRes = await query('SELECT * FROM rides WHERE id = $1', [req.params.id]);
    if (!rideRes.rowCount) return res.status(404).json({ error: 'Ride not found' });
    const ride = rideRes.rows[0];
    if (['completed','no_show','cancelled','denied'].includes(ride.status))
      return res.status(400).json({ error: 'Cannot set vehicle on a terminal ride' });
    const vehRes = await query('SELECT * FROM vehicles WHERE id = $1', [vehicleId]);
    if (!vehRes.rowCount) return res.status(404).json({ error: 'Vehicle not found' });
    if (vehRes.rows[0].status !== 'available') return res.status(400).json({ error: 'Vehicle is not available' });
    const result = await query(
      `UPDATE rides SET vehicle_id = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
                 requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
      [vehicleId, ride.id]
    );
    res.json(mapRide(result.rows[0]));
  }));
};
